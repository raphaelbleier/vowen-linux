#!/usr/bin/env bash
# Desktop integration for an installed Vowen tree: launcher, menu entry, vowen:// handler, icon.
# usage: integrate.sh <installDir>
set -euo pipefail
DIR=$1
BIN="$HOME/.local/bin"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
mkdir -p "$BIN" "$APPS" "$ICONS"

cat > "$BIN/vowen" <<LAUNCHER
#!/bin/sh
# XWayland: Electron's native Wayland backend crashes Vowen and can't place its overlays.
export VOWEN_LAUNCHER="$BIN/vowen" CHROME_DESKTOP=vowen.desktop
SANDBOX=--no-sandbox
[ -f /etc/apparmor.d/vowen-linux ] || [ "\$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" != 1 ] && SANDBOX=
exec "$DIR/vowen" --ozone-platform=x11 \$SANDBOX "\$@"
LAUNCHER
chmod +x "$BIN/vowen"

python3 -I - "$DIR/resources/assets/icon.png" "$ICONS/vowen.png" <<'PY' 2>/dev/null || cp "$DIR/resources/assets/icon.png" "$ICONS/vowen.png"
import sys
from PIL import Image
Image.open(sys.argv[1]).resize((512, 512)).save(sys.argv[2])
PY

cat > "$APPS/vowen.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Vowen
Comment=Voice dictation and meeting notes (unofficial Linux build)
Exec="$BIN/vowen" %U
Icon=vowen
Terminal=false
Categories=Utility;Accessibility;
MimeType=x-scheme-handler/vowen;
StartupWMClass=vowen
DESKTOP
update-desktop-database "$APPS" 2>/dev/null || true
xdg-mime default vowen.desktop x-scheme-handler/vowen 2>/dev/null || true

if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] && [ ! -f /etc/apparmor.d/vowen-linux ]; then
  cat <<NOTE

Chromium's sandbox is blocked by AppArmor on this system, so Vowen runs with --no-sandbox.
To enable the sandbox (recommended), run once:
  sed "s|@DIR@|$DIR|" "$(dirname "$0")/apparmor-vowen-linux" | sudo tee /etc/apparmor.d/vowen-linux >/dev/null
  sudo apparmor_parser -r /etc/apparmor.d/vowen-linux
NOTE
fi
if ! id -nG | grep -qw input; then
  cat <<NOTE

Global hotkeys and auto-paste need access to input devices. Run once, then log out and in:
  sudo usermod -aG input \$USER
NOTE
fi
