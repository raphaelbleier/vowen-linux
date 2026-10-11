#!/usr/bin/env python3
"""Protocol test for audio-recorder: list-devices, mic start/stop, loopback. Records ~2 s each."""
import json, os, struct, subprocess, sys, threading, time

import shutil
if not shutil.which("parec") or not shutil.which("pactl") or subprocess.run(["pactl", "info"], capture_output=True).returncode != 0:
    print("SKIP: no PulseAudio/PipeWire (pactl/parec)"); sys.exit(0)

BIN = os.path.join(os.path.dirname(__file__), "../helpers/audio-recorder/audio-recorder")


class Rec:
    def __init__(self):
        self.p = subprocess.Popen([BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.events, self.pcm, self.sizes, self.lock = [], bytearray(), [], threading.Lock()
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        f = self.p.stdout
        while True:
            h = f.read(5)
            if len(h) < 5:
                return
            t, n = struct.unpack("<BI", h)
            d = f.read(n)
            with self.lock:
                if t == 1:
                    self.events.append(json.loads(d))
                else:
                    assert t == 2 and n % 2 == 0
                    self.pcm += d
                    self.sizes.append(n)

    def send(self, **c):
        self.p.stdin.write((json.dumps(c) + "\n").encode()); self.p.stdin.flush()

    def wait_event(self, typ, timeout=3):
        end = time.time() + timeout
        while time.time() < end:
            with self.lock:
                for e in self.events:
                    if e["type"] == typ:
                        return e
            time.sleep(0.02)
        raise AssertionError(f"no {typ} event; got {self.events}")


def check(name, rec, rate, secs):
    n = len(rec.pcm) / 2 / rate
    print(f"{name}: {n:.2f}s of audio in {len(rec.sizes)} frames (max {max(rec.sizes)} B)")
    assert 0.6 * secs < n < 1.5 * secs, "PCM duration off"
    assert max(rec.sizes) < 10 * 1024 * 1024


r = Rec()
r.send(command="list-devices")
devs = r.wait_event("device-list")["devices"]
print("devices:", devs)
assert devs and all(isinstance(d, str) for d in devs)

r.send(command="get-device-config")
assert r.wait_event("audio-config")["output_sample_rate"] == 16000

r.events.clear()
r.send(command="start", device_name=devs[0], device_names=[devs[0], "nonexistent"])
time.sleep(2)
t = time.time()
r.send(command="stop")
r.wait_event("drain-complete", 2)
print(f"stop->drain-complete {time.time()-t:.3f}s")
check("mic", r, 16000, 2)
r.send(command="stop")  # idempotent
time.sleep(0.2)

r.events.clear(); r.pcm.clear(); r.sizes.clear()
r.send(command="start-loopback")
assert r.wait_event("audio-config", 4)["output_sample_rate"] == 48000
time.sleep(2)
r.send(command="stop-loopback")
check("loopback", r, 48000, 2)
r.p.stdin.close()
r.p.wait(3)
print("OK")

# stall recovery: kill parec mid-recording
r = Rec()
r.send(command="start")
time.sleep(1)
subprocess.run(["pkill", "-P", str(r.p.pid), "parec"])
r.wait_event("mic-stall", 4)
r.wait_event("mic-stall-recovered", 4)
r.send(command="stop"); r.wait_event("drain-complete")
r.p.stdin.close()
print("stall OK")
