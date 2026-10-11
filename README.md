# vowen-linux

Unofficial Linux build kit for [Vowen](https://vowen.ai), the voice dictation and meeting-notes app for macOS and Windows.

This repository contains **no Vowen code**. `install.sh` downloads the official macOS release from vowen.ai on your machine, checks its SHA-256, and converts it into a Linux app:

- Electron 38 for Linux instead of the macOS runtime
- Linux replacements for Vowen's native macOS helpers (audio capture, text insertion, global hotkeys, media pause, mic-in-use detection)
- whisper.cpp, Parakeet and speaker diarization engines built for Linux (CPU, Vulkan, CUDA)
- small patches so Linux takes the same code paths as Windows

Vowen's licensing is untouched: Free works as on macOS, Pro needs a Vowen license. Not affiliated with or endorsed by Vowen.

## Install

Requirements: x86_64, Node.js ≥ 20, `7z` (7zip), `curl`, `unzip`, `python3`, PipeWire or PulseAudio (`pactl`, `parec`), `wl-clipboard` (Wayland) or `xclip` (X11).

```sh
git clone https://github.com/raphaelbleier/vowen-linux
cd vowen-linux
./install.sh
```

The installer puts Vowen in `~/.local/share/vowen-linux`, the launcher in `~/.local/bin/vowen`, and adds a menu entry and the `vowen://` link handler. Re-run it to update.

One-time permissions (the installer prints these when needed):

```sh
sudo usermod -aG input $USER    # global hotkeys + auto-paste; log out and in afterwards
```

Members of the `input` group can read keyboard input; that is what a global push-to-talk hotkey requires.

## What works

| Feature | Linux implementation |
|---|---|
| Push-to-talk / hands-free hotkeys | `vowen-input`: evdev reader + uinput keyboard (Wayland and X11) |
| Microphone recording | `audio-recorder`: PipeWire/Pulse via `parec` |
| Meeting notes with system audio | default sink monitor via `parec` |
| Meeting detection | `linux-mic-listener`: `pactl subscribe` |
| Text insertion | `text-writer`: clipboard + Ctrl+V through `vowen-input` (fallback `ydotool`, `xdotool`) |
| Local Whisper models | whisper.cpp 1.8.6 (CPU, Vulkan, CUDA backends loaded at runtime) |
| Parakeet v2/v3, speaker diarization | ONNX Runtime / sherpa-onnx builds of the Windows engines |
| Pause media while dictating | `playback-controller`: MPRIS + `wpctl` |
| Autostart, tray | XDG autostart, StatusNotifierItem |

Terminals paste with Ctrl+Shift+V: set `VOWEN_PASTE_CHORD=ctrl+shift+v` if you mostly dictate into a terminal.

## Known limitations

- Runs through XWayland (`--ozone-platform=x11`); Electron's native Wayland backend crashes the app.
- The macOS-only CoreML models (Parakeet JA/ZH, Nemotron) are not available yet.
- Per-app settings don't detect the active app on Wayland.
- Vowen updates require a new release of this kit, because the patches are matched against a specific Vowen version.

## Layout

```
install.sh            download, verify, deobfuscate, patch, assemble, install
patches/              Linux patches, applied to the deobfuscated bundle (each must match exactly)
runtime/bootstrap.js  Linux entry point (autostart support), then loads Vowen
helpers/              Linux replacements for Vowen's native helpers (Python, stdlib only)
shims/                drop-in replacement for uiohook-napi backed by vowen-input
engines/              build scripts for whisper.cpp, parakeet-cli, diarize-cli
packaging/            desktop integration, AppArmor profile, udev rule
tests/                helper protocol tests
```

## License

The code in this repository is MIT licensed. Vowen itself is proprietary software of its author and is downloaded from vowen.ai at install time.
