#!/usr/bin/env bash
# Launcher for the unofficial Vowen Linux build. @DIR@ is replaced by integrate.sh.
# Named vowen-linux (not vowen) so it never collides with Vowen's own `vowen` CLI, which Settings > Developer probes for.
DIR=@DIR@
VOWEN_LAUNCHER=$(readlink -f "$0")
export VOWEN_LAUNCHER CHROME_DESKTOP=vowen.desktop

# Started from the app menu, PATH misses ~/.local/bin, npm-global, nvm... that the CLI agents (claude, codex) live in.
# Borrow the login shell's PATH (cached shell start-up can be slow, so cap it).
if login_path=$(timeout 5 "${SHELL:-/bin/sh}" -ilc 'printf "__VP__%s__VP__" "$PATH"' 2>/dev/null </dev/null); then
  login_path=${login_path#*__VP__}; login_path=${login_path%%__VP__*}
  [ -n "$login_path" ] && PATH="$login_path:$PATH"
fi
PATH="$HOME/.local/bin:$PATH"
PATH=$(printf %s "$PATH" | awk -v RS=: '!seen[$0]++ && $0 != "" { printf "%s%s", (n++ ? ":" : ""), $0 }')
export PATH

# Desktop entries hand over local files as file:// URIs; Vowen wants plain paths.
args=()
for a in "$@"; do
  case $a in
    file://*) a=${a#file://}; a=${a#localhost}; a=$(printf '%b' "${a//%/\\x}") ;;
  esac
  args+=("$a")
done

# Where Vowen keeps API keys. Electron 38 values: kwallet6 | kwallet5 | gnome-libsecret | basic.
store=
case ":${XDG_CURRENT_DESKTOP,,}:" in
  *:kde:*) [ "${KDE_SESSION_VERSION:-6}" = 5 ] && store=kwallet5 || store=kwallet6 ;;
  *gnome*|*unity*|*cinnamon*|*budgie*|*pantheon*|*xfce*|*mate*|*lxqt*|*cosmic*|*deepin*) store=gnome-libsecret ;;
  *) busctl --user status org.freedesktop.secrets >/dev/null 2>&1 && store=gnome-libsecret || store=basic ;;
esac
case " $* " in *" --password-store"*) store= ;; esac
[ -z "$store" ] || args=("--password-store=$store" "${args[@]}")

# XWayland: Electron's native Wayland backend crashes Vowen and can't place its overlays.
sandbox=--no-sandbox
if [ -f /etc/apparmor.d/vowen-linux ] || [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" != 1 ]; then sandbox=; fi
exec "$DIR/vowen" --ozone-platform=x11 $sandbox "${args[@]}"
