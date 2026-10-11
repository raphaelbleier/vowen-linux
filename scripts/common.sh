# shellcheck shell=bash
# Shared helpers, sourced by install.sh and scripts/*.sh.
say() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

fetch() { # url sha256 dest : download unless dest already has the right hash
  if [ ! -f "$3" ] || ! echo "$2  $3" | sha256sum -c --status; then
    say "Downloading $(basename "$3")"
    curl -fL --progress-bar -o "$3.part" "$1"
    mv "$3.part" "$3"
  fi
  echo "$2  $3" | sha256sum -c --status || die "checksum mismatch: $3"
}
