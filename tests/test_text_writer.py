#!/usr/bin/env python3
"""text-writer clipboard round trips. Saves and restores the user's clipboard; sends no keystrokes."""
import os, subprocess, sys, tempfile

TW = os.path.join(os.path.dirname(__file__), "../helpers/text-writer/text-writer")
ST = os.path.join(os.path.dirname(__file__), "../helpers/selected-text/selected-text")
tw = lambda *a: subprocess.run([TW, *a], capture_output=True, text=True, timeout=10)
paste = lambda: subprocess.run(["wl-paste", "-n", "-t", "text/plain"], capture_output=True).stdout.decode()

snap = tempfile.mktemp(prefix="vowen-clipboard-", suffix=".bin")
assert tw("--snapshot", snap).returncode == 0 and os.path.exists(snap)
try:
    assert tw("--set-clipboard", "--", "héllo -- wörld\n- x").returncode == 0
    assert paste() == "héllo -- wörld\n- x", paste()
    assert tw("--set-clipboard", "--", "-leading dash").returncode == 0 and paste() == "-leading dash"
    r = tw("--set-clipboard", "--", "")
    assert r.returncode != 0 and "Text cannot be empty" in r.stderr
    # paste mode with no input backend must fail loudly (PATH has only wl-clipboard; skipped if the input socket exists)
    if not os.path.exists(os.path.join(os.environ["XDG_RUNTIME_DIR"], "vowen-input.sock")):
        bindir = tempfile.mkdtemp()
        for t in ("wl-copy", "wl-paste", "cat"):  # wl-paste execs cat
            os.symlink(subprocess.check_output(["which", t]).decode().strip(), os.path.join(bindir, t))
        r = subprocess.run([sys.executable, TW, "--", "pasted"], capture_output=True, text=True, timeout=10,
                           env=dict(os.environ, PATH=bindir, DISPLAY=""))
        print("paste without backend ->", r.returncode, r.stderr.strip())
        assert r.returncode == 2 and "no input backend" in r.stderr
finally:
    assert tw("--restore", snap).returncode == 0
assert not os.path.exists(snap)
print("selected-text exit:", subprocess.run([ST], capture_output=True).returncode)
print("OK")
