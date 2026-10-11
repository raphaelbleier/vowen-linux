//! Same CLI / daemon protocol as the Windows diarize-cli.exe (see notes/engines.md 7).
//! Only the `diarize` request is implemented; `embed-turns` is not advertised, so the app
//! falls back to its span-based speaker alignment.
use anyhow::{anyhow, bail, Result};
use clap::Parser;
use serde_json::{json, Value};
use sherpa_onnx::*;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(version, about = "Offline speaker diarization for Vowen (Linux)")]
struct Args {
    #[arg(long)]
    segmentation: String,
    #[arg(long)]
    embedding: String,
    #[arg(long, default_value_t = 1)]
    num_threads: i32,
    #[arg(long)]
    num_speakers: Option<i32>,
    #[arg(long, default_value_t = 0.5)]
    threshold: f32,
    audio_file: Option<PathBuf>,
    #[arg(long)]
    daemon: bool,
}

fn read_wav_mono(path: &Path, target_rate: i32) -> Result<Vec<f32>> {
    let mut r = hound::WavReader::open(path)?;
    let spec = r.spec();
    let ch = spec.channels as usize;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => r.samples::<f32>().collect::<Result<_, _>>()?,
        hound::SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>().map(|s| s.map(|v| v as f32 / scale)).collect::<Result<_, _>>()?
        }
    };
    let mono: Vec<f32> = raw.chunks(ch).map(|c| c.iter().sum::<f32>() / ch as f32).collect();
    if spec.sample_rate as i32 == target_rate {
        return Ok(mono);
    }
    let rs = LinearResampler::create(spec.sample_rate as i32, target_rate).ok_or_else(|| anyhow!("resampler"))?;
    Ok(rs.resample(&mono, true))
}

fn diarize(sd: &OfflineSpeakerDiarization, base: &OfflineSpeakerDiarizationConfig, wav: &Path, threshold: f32, num_speakers: Option<i32>) -> Result<Value> {
    let mut cfg = base.clone();
    cfg.clustering = FastClusteringConfig { num_clusters: num_speakers.unwrap_or(-1), threshold };
    sd.set_config(&cfg);
    let samples = read_wav_mono(wav, sd.sample_rate())?;
    let res = sd.process(&samples).ok_or_else(|| anyhow!("diarization failed"))?;
    let spans: Vec<Value> = res.sort_by_start_time().iter()
        .map(|s| json!({"start": s.start, "end": s.end, "speaker": s.speaker})).collect();
    Ok(json!({"spans": spans, "numSpeakers": res.num_speakers()}))
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let a = Args::parse();
    let cfg = OfflineSpeakerDiarizationConfig {
        segmentation: OfflineSpeakerSegmentationModelConfig {
            pyannote: OfflineSpeakerSegmentationPyannoteModelConfig { model: Some(a.segmentation.clone()) },
            num_threads: a.num_threads,
            ..Default::default()
        },
        embedding: SpeakerEmbeddingExtractorConfig { model: Some(a.embedding.clone()), num_threads: a.num_threads, ..Default::default() },
        clustering: FastClusteringConfig { num_clusters: a.num_speakers.unwrap_or(-1), threshold: a.threshold },
        ..Default::default()
    };
    let sd = OfflineSpeakerDiarization::create(&cfg).ok_or_else(|| anyhow!("failed to create diarizer (check model paths)"))?;
    if !a.daemon {
        let Some(wav) = a.audio_file else { bail!("AUDIO_FILE required unless --daemon") };
        println!("{}", diarize(&sd, &cfg, &wav, a.threshold, a.num_speakers)?);
        return Ok(());
    }
    let mut out = std::io::stdout();
    writeln!(out, "{}", json!({"type": "ready", "capabilities": ["diarize"]}))?;
    out.flush()?;
    for line in std::io::stdin().lock().lines() {
        let Ok(req) = serde_json::from_str::<Value>(&line?) else { continue };
        let id = req["id"].clone();
        let reply = match req["type"].as_str() {
            Some("shutdown") => break,
            Some("ping") => json!({"id": id, "type": "pong"}),
            Some("diarize") => {
                let file = req["filePath"].as_str().unwrap_or_default();
                let r = diarize(&sd, &cfg, Path::new(file), req["threshold"].as_f64().unwrap_or(0.5) as f32,
                    req["numSpeakers"].as_i64().map(|n| n as i32));
                if req["cleanup"].as_bool().unwrap_or(false) {
                    let _ = std::fs::remove_file(file);
                }
                match r {
                    Ok(mut v) => {
                        v["id"] = id;
                        v
                    }
                    Err(e) => json!({"id": id, "type": "error", "message": format!("{e:#}")}),
                }
            }
            _ => json!({"id": id, "type": "error", "message": "unknown request type"}),
        };
        writeln!(out, "{reply}")?;
        out.flush()?;
    }
    Ok(())
}
