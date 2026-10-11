//! Same CLI / stdout / daemon protocol as the Windows parakeet-cli.exe (see notes/engines.md 6a).
use anyhow::{bail, Result};
use clap::Parser;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use transcribe_rs::audio::read_wav_samples;
use transcribe_rs::onnx::parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity};
use transcribe_rs::onnx::Quantization;

#[derive(Parser)]
#[command(version, about = "Parakeet ONNX transcription for Vowen (Linux)")]
struct Args {
    model_dir: PathBuf,
    audio_file: Option<PathBuf>,
    #[arg(long)]
    timestamps: bool,
    #[arg(long)]
    daemon: bool,
}

fn transcribe(model: &mut ParakeetModel, wav: &Path, timestamps: bool) -> Result<Value> {
    let samples = read_wav_samples(wav)?;
    if samples.len() < 4800 {
        bail!("audio must be at least 300ms"); // the app silently discards this one
    }
    let params = ParakeetParams {
        timestamp_granularity: timestamps.then_some(TimestampGranularity::Segment),
        ..Default::default()
    };
    let r = model.transcribe_with(&samples, &params)?;
    let mut out = json!({ "text": r.text });
    if let (true, Some(segs)) = (timestamps, r.segments) {
        out["segments"] = segs.iter().map(|s| json!({"start": s.start, "end": s.end, "text": s.text})).collect();
    }
    Ok(out)
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let a = Args::parse();
    // ort(load-dynamic) hangs instead of failing when libonnxruntime can't be found: resolve it up front.
    let ort = std::env::var_os("ORT_DYLIB_PATH").map(PathBuf::from).or_else(|| {
        Some(std::env::current_exe().ok()?.parent()?.join("../lib/libonnxruntime.so"))
    });
    match ort.filter(|p| p.exists()) {
        Some(p) => std::env::set_var("ORT_DYLIB_PATH", p),
        None => bail!("libonnxruntime.so not found (set ORT_DYLIB_PATH)"),
    }
    let mut model = ParakeetModel::load(&a.model_dir, &Quantization::Int8)?;
    if !a.daemon {
        let Some(wav) = a.audio_file else { bail!("AUDIO_FILE required unless --daemon") };
        println!("{}", transcribe(&mut model, &wav, a.timestamps)?);
        return Ok(());
    }
    let mut out = std::io::stdout();
    writeln!(out, "{}", json!({"type": "ready"}))?;
    out.flush()?;
    for line in std::io::stdin().lock().lines() {
        let Ok(req) = serde_json::from_str::<Value>(&line?) else { continue };
        let id = req["id"].clone();
        let reply = match req["type"].as_str() {
            Some("shutdown") => break,
            Some("ping") => json!({"id": id, "type": "pong"}),
            Some("transcribe") => {
                let file = req["filePath"].as_str().unwrap_or_default();
                let r = transcribe(&mut model, Path::new(file), req["timestamps"].as_bool().unwrap_or(false));
                if req["cleanup"].as_bool().unwrap_or(false) {
                    let _ = std::fs::remove_file(file);
                }
                match r {
                    Ok(mut v) => {
                        v["id"] = id;
                        v["type"] = json!("transcribe");
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
