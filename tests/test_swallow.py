#!/usr/bin/env python3
"""Key-swallow tests. Never touches a real keyboard: grabs only a uinput device created here (VOWEN_GRAB_NAME).
Run: sg input -c 'python3 port/tests/test_swallow.py'   (needs /dev/uinput + /dev/input access, else the live part is skipped)
Uses harmless keys only (Shift, F20, F21) because the forwarded events reach the real compositor."""
import fcntl, glob, importlib.machinery, importlib.util, json, os, select, signal, socket, struct, subprocess, sys, tempfile, threading, time
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "helpers", "vowen-input", "vowen-input")
spec = importlib.util.spec_from_loader("vi", importlib.machinery.SourceFileLoader("vi", BIN))
vi = importlib.util.module_from_spec(spec); spec.loader.exec_module(vi)
SHIFT, F20, F21 = 42, 190, 191
UIO_F20 = 0x67

# ---- unit: chord matching + watchdog with stubs
class StubMirror:
    def __init__(self): self.ev = []; self.down = set()
    def key(self, c, d): self.ev.append((c, int(d)))
    def close(self): self.ev.append("closed")
os.environ["VOWEN_SWALLOW"] = "1"
tr = vi.Translator(); g = vi.Grabber(tr); m = StubMirror()
g.grabbed["p"] = (-1, m)
g.set("hotkeys", [{"mods": ["shift"], "key": UIO_F20}, {"mods": [], "key": 0x01}])  # Shift+F20, bare Esc
def feed(code, val):
    sw = g.filter("p", 1, code, val); tr.translate(1, code, val, 0); return sw
assert feed(F21, 1) is False and feed(F21, 0) is False                       # unrelated key passes
assert feed(190, 1) is False and feed(190, 0) is False                       # F20 without Shift passes
assert feed(SHIFT, 1) is False                                                # modifiers always pass
assert feed(190, 1) is True and feed(190, 2) is True                          # chord + autorepeat swallowed
assert feed(SHIFT, 0) is False and feed(190, 0) is True                       # release swallowed even after Shift is up
assert feed(1, 1) is True and feed(1, 0) is True                              # bare Esc registered
assert [e for e in m.ev if e[0] in (190, 1)] == [(190, 1), (190, 0)], m.ev    # only the unmatched F20 was replayed
g.set("hotkeys", []); assert not g.chords
g.set("hotkeys", [{"mods": ["shift"], "key": UIO_F20}]); g.tripped = False; g.tick = time.monotonic() - 10
threading.Thread(target=g.watchdog, daemon=True).start(); time.sleep(1.2)
assert not g.grabbed and g.tripped and "closed" in m.ev, "watchdog must release a stalled grab"

# ---- live: uinput test keyboard + real vowen-input process
if not os.access("/dev/uinput", os.W_OK):
    print("SKIP live part: /dev/uinput not writable (run via sg input)"); print("ok"); sys.exit(0)
def mkdev():
    fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
    fcntl.ioctl(fd, vi.UI_SET_EVBIT, 1)
    for k in range(1, 249): fcntl.ioctl(fd, vi.UI_SET_KEYBIT, k)
    fcntl.ioctl(fd, vi.UI_DEV_SETUP, struct.pack("HHHH80sI", 3, 0x1234, 0x5679, 1, b"vowen-swallow-test-kbd", 0))
    fcntl.ioctl(fd, vi.UI_DEV_CREATE); time.sleep(1.0); return fd
def key(fd, c, v):
    os.write(fd, struct.pack("llHHi", 0, 0, 1, c, v) + struct.pack("llHHi", 0, 0, 0, 0, 0)); time.sleep(0.03)
def nodes(name):
    out = {}
    for p in glob.glob("/sys/class/input/event*/device/name"):
        if open(p).read().strip() == name: out[os.path.basename(os.path.dirname(os.path.dirname(p)))] = 1
    return set(out)

kb = mkdev()
rt = tempfile.mkdtemp()
before = nodes(vi.OWN_NAME.decode())
p = subprocess.Popen([BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                     env={**os.environ, "XDG_RUNTIME_DIR": rt, "VOWEN_SWALLOW": "1", "VOWEN_GRAB_NAME": "^vowen-swallow-test-kbd$"})
try:
    sockp = rt + "/vowen-input.sock"
    for _ in range(50):
        if os.path.exists(sockp): break
        time.sleep(0.1)
    c = socket.socket(socket.AF_UNIX); c.connect(sockp); f = c.makefile("rwb")
    f.write(json.dumps({"cmd": "swallow", "source": "hotkeys", "chords": [{"mods": ["shift"], "key": UIO_F20}]}).encode() + b"\n"); f.flush()
    assert json.loads(f.readline()) == {"ok": True}
    time.sleep(0.8)
    new = nodes(vi.OWN_NAME.decode()) - before
    assert len(new) >= 1, "mirror device not created"
    obs = [os.open("/dev/input/" + n, os.O_RDONLY | os.O_NONBLOCK) for n in new]
    key(kb, SHIFT, 1); key(kb, F20, 1); key(kb, F20, 0); key(kb, SHIFT, 0); key(kb, F21, 1); key(kb, F21, 0)
    time.sleep(0.5)
    got, mirror = [], set()
    for n, o in zip(new, obs):  # other processes (the user's own vowen-input) may create same-named devices; ours is the one that carries events
        try: ev = [(c_, v) for t, c_, v, _ in vi.parse_events(os.read(o, 4096)) if t == 1]
        except BlockingIOError: ev = []
        if ev: mirror.add(n); got += ev
    assert (F21, 1) in got and (F21, 0) in got and (SHIFT, 1) in got and (SHIFT, 0) in got, got
    assert not any(c_ == F20 for c_, _ in got), "swallowed chord leaked: %s" % got
    # Electron still sees the swallowed key through stdout
    r, _, _ = select.select([p.stdout], [], [], 0.2)
    os.set_blocking(p.stdout.fileno(), False); seen = (p.stdout.read() or b"").decode()
    assert '"keycode":%d' % UIO_F20 in seen, seen
    # empty list releases the grab and removes the mirror
    f.write(json.dumps({"cmd": "swallow", "source": "hotkeys", "chords": []}).encode() + b"\n"); f.flush(); json.loads(f.readline())
    time.sleep(1.5)
    assert mirror; new = mirror
    assert not (nodes(vi.OWN_NAME.decode()) & new), "mirror device still present after ungrab"
    # re-grab, then kill -9 the helper: kernel must drop the grab (mirror gone, device readable again by others)
    f.write(json.dumps({"cmd": "swallow", "source": "hotkeys", "chords": [{"mods": ["shift"], "key": UIO_F20}]}).encode() + b"\n"); f.flush(); json.loads(f.readline())
    time.sleep(0.8)
    os.kill(p.pid, signal.SIGKILL); p.wait(); time.sleep(0.5)
    assert not (nodes(vi.OWN_NAME.decode()) & new), "mirror survived SIGKILL"
    # cursor query without a daemon falls back to the one-shot helper (value only checked when KWin/X11 is there)
finally:
    if p.poll() is None: p.kill(); p.wait()
    os.close(kb)
print("ok")
