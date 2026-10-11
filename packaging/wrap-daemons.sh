#!/bin/sh
# Long-running engine servers must die with Vowen, even if Vowen is killed hard
# (otherwise each orphaned whisper-server keeps hundreds of MB of RAM/VRAM).
# Wraps them so the kernel sends SIGTERM when their parent exits.
# usage: wrap-daemons.sh <resources dir>
set -eu
for name in whisper-server diarize-cli parakeet-cli sherpa-asr-cli; do
  f="$1/bin/$name"
  [ -f "$f" ] && ! [ -f "$f.real" ] || continue
  mv "$f" "$f.real"
  printf '#!/bin/sh\nexec setpriv --pdeathsig TERM -- "$(dirname "$0")/%s.real" "$@"\n' "$name" > "$f"
  chmod +x "$f"
done
