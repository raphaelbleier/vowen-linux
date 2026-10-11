#!/usr/bin/env python3
"""No-root tests: python3 port/tests/test_vowen_input.py"""
import importlib.machinery, importlib.util, json, os, socket, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "helpers", "vowen-input", "vowen-input")
spec = importlib.util.spec_from_loader("vi", importlib.machinery.SourceFileLoader("vi", BIN))
vi = importlib.util.module_from_spec(spec); spec.loader.exec_module(vi)

def raw(t, c, v, s=10, us=5000): return vi.EVENT.pack(s, us, t, c, v)

# parser + translator: Ctrl down, Right-Alt down, autorepeat dropped, mouse
evs = vi.parse_events(raw(1, 29, 1) + raw(1, 100, 1) + raw(1, 100, 2) + raw(0, 0, 0) + raw(1, 0x112, 1) + raw(1, 0x112, 0) + b"xx")
assert len(evs) == 6 and evs[0] == (1, 29, 1, 10005)
tr, out = vi.Translator(), []
for e in evs: out += tr.translate(*e)
assert [o["type"] for o in out] == [4, 4, 7, 8, 6], out
assert out[0]["keycode"] == 0x1D and out[0]["ctrlKey"] and not out[0]["altKey"]
assert out[1]["keycode"] == 0x0E38 and out[1]["altKey"] and out[1]["ctrlKey"]
assert out[2]["button"] == 3 and out[2]["clicks"] == 1 and out[2]["x"] == 0 and out[2]["ctrlKey"]
assert tr.translate(1, 29, 0, 1)[0]["ctrlKey"] is False  # release clears flag
assert tr.translate(1, 125, 1, 1)[0]["keycode"] == 0x0E5B and tr.translate(1, 103, 1, 1)[0]["keycode"] == 0xE048
assert vi.TO_EVDEV[0x0E5B] == 125 and vi.TO_EVDEV[0x2F] == 47

# injector with a pipe instead of /dev/uinput
r, w = os.pipe(); inj = vi.Injector(); inj.fd = w
assert inj.handle({"cmd": "chord", "keys": [29, 47]}, pause=0) == {"ok": True}
got = [(t, c, v) for t, c, v, _ in vi.parse_events(os.read(r, 4096)) if t == 1]
assert got == [(1, 29, 1), (1, 47, 1), (1, 47, 0), (1, 29, 0)], got
assert inj.handle({"cmd": "key", "key": 0x0E5B, "toggle": 1}) == {"ok": True}
assert [(c, v) for t, c, v, _ in vi.parse_events(os.read(r, 4096)) if t == 1] == [(125, 1)]
assert inj.handle({"cmd": "tap", "key": 28}, pause=0)["ok"]
assert not inj.handle({"cmd": "key", "key": 99999})["ok"]
assert not inj.handle({"cmd": "bogus"})["ok"]

# real process: socket ping, error reply without uinput, exit on stdin EOF
with tempfile.TemporaryDirectory() as d:
    p = subprocess.Popen([sys.executable, BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         env={**os.environ, "XDG_RUNTIME_DIR": d})
    path = os.path.join(d, "vowen-input.sock")
    for _ in range(50):
        if os.path.exists(path) or p.poll() is not None: break
        time.sleep(0.1)
    if p.poll() == 13:  # neither /dev/input nor /dev/uinput usable (CI): helper refuses to run, by design
        print("SKIP process part: no input device access"); sys.exit(0)
    c = socket.socket(socket.AF_UNIX); c.connect(path); f = c.makefile("rwb")
    f.write(b'{"cmd":"ping"}\n'); f.flush()
    assert json.loads(f.readline()) == {"ok": True}
    f.write(b'garbage\n{"cmd":"tap","key":28}\n'); f.flush()
    assert json.loads(f.readline())["ok"] is False
    assert json.loads(f.readline())["ok"] in (True, False)  # True only where uinput is writable
    p.stdin.close()
    assert p.wait(5) in (0, 13)
    assert not os.path.exists(path)
print("ok")
