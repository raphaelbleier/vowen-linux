//! One-shot CLI for sherpa-onnx cache-aware streaming transducers (Nemotron EN / multilingual),
//! same stdout JSON as parakeet-cli. Batch decode: whole file in, final text out.
use anyhow::{anyhow, bail, Result};
use clap::Parser;
use serde_json::{json, Value};
use sherpa_onnx::*;
use std::path::PathBuf;

#[derive(Parser)]
#[command(version, about = "Nemotron (sherpa-onnx) transcription for Vowen (Linux)")]
struct Args {
    model_dir: PathBuf,
    audio_file: PathBuf,
    #[arg(long)]
    timestamps: bool,
    /// Nemotron-3.5 prompt key (ja-JP, zh-CN, en, ...); omit for auto
    #[arg(long)]
    language: Option<String>,
    #[arg(long, default_value_t = 4)]
    threads: i32,
}

fn read_wav_mono(path: &PathBuf, target: i32) -> Result<Vec<f32>> {
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
    if spec.sample_rate as i32 == target {
        return Ok(mono);
    }
    let rs = LinearResampler::create(spec.sample_rate as i32, target).ok_or_else(|| anyhow!("resampler"))?;
    Ok(rs.resample(&mono, true))
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let a = Args::parse();
    let samples = read_wav_mono(&a.audio_file, 16000)?;
    if samples.len() < 4800 {
        bail!("audio must be at least 300ms"); // the app silently discards this one
    }
    let f = |n: &str| a.model_dir.join(n).to_string_lossy().into_owned();
    let mut cfg = OnlineRecognizerConfig::default();
    cfg.model_config.transducer = OnlineTransducerModelConfig {
        encoder: Some(f("encoder.int8.onnx")),
        decoder: Some(f("decoder.int8.onnx")),
        joiner: Some(f("joiner.int8.onnx")),
    };
    cfg.model_config.tokens = Some(f("tokens.txt"));
    cfg.model_config.num_threads = a.threads;
    cfg.decoding_method = Some("greedy_search".into());
    let rec = OnlineRecognizer::create(&cfg).ok_or_else(|| anyhow!("failed to load model in {}", a.model_dir.display()))?;
    let s = rec.create_stream();
    if let Some(l) = a.language.as_deref().filter(|l| !l.is_empty()) {
        s.set_option("language", l);
    }
    s.accept_waveform(16000, &samples);
    s.accept_waveform(16000, &vec![0f32; 16000]); // tail so the last 1120 ms chunk fills
    s.input_finished();
    while rec.is_ready(&s) {
        rec.decode(&s);
    }
    let r = rec.get_result(&s).ok_or_else(|| anyhow!("no result"))?;
    let text = r.text.trim().to_string();
    let mut out = json!({ "text": text });
    if a.timestamps {
        let dur = samples.len() as f32 / 16000.0;
        let mut segs: Vec<Value> = vec![];
        if let Some(ts) = r.timestamps.filter(|t| t.len() == r.tokens.len()) {
            let (mut buf, mut start) = (String::new(), 0f32);
            for (i, (tok, t)) in r.tokens.iter().zip(ts.iter()).enumerate() {
                if buf.trim().is_empty() { start = *t; }
                buf.push_str(&tok.replace('\u{2581}', " "));
                let last = i + 1 == r.tokens.len();
                if last || tok.trim_end().ends_with(['.', '?', '!', '。', '？', '！']) {
                    segs.push(json!({"start": start, "end": (ts[i] + 0.08).min(dur), "text": buf.trim()}));
                    buf.clear();
                }
            }
        } else if !text.is_empty() {
            segs.push(json!({"start": 0.0, "end": dur, "text": text}));
        }
        out["segments"] = segs.into();
    }
    println!("{out}");
    Ok(())
}
