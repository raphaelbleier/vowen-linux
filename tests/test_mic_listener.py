#!/usr/bin/env python3
"""parec mic capture must give MIC_START/MIC_STOP <pid>, unless it descends from --exclude-pid."""
import os, subprocess, sys, time

import shutil
if not shutil.which("parec") or not shutil.which("pactl") or subprocess.run(["pactl", "info"], capture_output=True).returncode != 0:
    print("SKIP: no PulseAudio/PipeWire (pactl/parec)"); sys.exit(0)

BIN = os.path.join(os.path.dirname(__file__), "../helpers/linux-mic-listener/linux-mic-listener")


def run(exclude):
    lis = subprocess.Popen([BIN, "--exclude-pid", str(exclude)], stdout=subprocess.PIPE, text=True)
    time.sleep(1)
    rec = subprocess.Popen(["parec", "--rate=16000", "--channels=1", "--format=s16le"], stdout=subprocess.DEVNULL)
    time.sleep(1.5)
    rec.kill(); rec.wait()
    time.sleep(1.5)
    lis.terminate()
    return rec.pid, lis.stdout.read().split()


pid, out = run(999999)
print(out)
assert f"MIC_START {pid}" in [" ".join(out[i:i + 2]) for i in range(0, len(out), 2)] and out[-2:] == ["MIC_STOP", str(pid)]
pid, out = run(os.getpid())
assert str(pid) not in out, out
print("OK")
