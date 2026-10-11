#!/usr/bin/env python3
"""No-root tests for vowen-activewin: python3 port/tests/test_activewin.py
Uses the real session bus (KWin optional): the daemon is poked with a fake KWin 'Active' call."""
import importlib.machinery, importlib.util, json, os, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "helpers", "vowen-activewin", "vowen-activewin")
spec = importlib.util.spec_from_loader("aw", importlib.machinery.SourceFileLoader("aw", BIN))
aw = importlib.util.module_from_spec(spec); spec.loader.exec_module(aw)

# desktop index + resolution against a fake XDG tree
with tempfile.TemporaryDirectory() as d:
    os.makedirs(d + "/applications/kde"); os.makedirs(d + "/icons/hicolor/48x48/apps")
    open(d + "/icons/hicolor/48x48/apps/konsole.png", "wb").write(b"\x89PNG")
    open(d + "/applications/org.kde.konsole.desktop", "w").write(
        "[Desktop Entry]\nType=Application\nName=Konsole\nExec=konsole %U\nIcon=konsole\n[Desktop Action x]\nName=Zap\n")
    open(d + "/applications/kde/kwrite.desktop", "w").write(
        "[Desktop Entry]\nType=Application\nName=KWrite\nExec=env X=1 /usr/bin/kwrite %F\nStartupWMClass=org.kde.kwrite\nNoDisplay=true\n")
    open(d + "/applications/firefox.desktop", "w").write("[Desktop Entry]\nType=Application\nName=Firefox\nExec=firefox\n")
    os.environ["XDG_DATA_HOME"] = d; os.environ["XDG_DATA_DIRS"] = d + "/none"
    aw.app_dirs = lambda: [d]
    idx = aw.load_index()
    assert set(idx) == {"org.kde.konsole", "kde-kwrite", "firefox"}, set(idx)
    assert idx["org.kde.konsole"]["name"] == "Konsole" and idx["org.kde.konsole"]["bin"] == "konsole"
    assert idx["kde-kwrite"]["bin"] == "/usr/bin/kwrite"
    assert aw.resolve(idx, "org.kde.konsole", "konsole", "konsole", "")["id"] == "org.kde.konsole"
    assert aw.resolve(idx, "konsole", "", "", "")["id"] == "org.kde.konsole"       # short desktopFileName -> reverse-DNS tail
    assert aw.resolve(idx, "", "org.kde.kwrite", "", "")["id"] == "kde-kwrite"      # StartupWMClass
    assert aw.resolve(idx, "", "Firefox", "", "")["id"] == "firefox"                # exec basename
    assert aw.resolve(idx, "", "nonexistent", "", "") is None
    aw._IDX = idx
    r = aw.make_record({"cls": "konsole", "cap": "~ : bash", "pid": 0, "df": "org.kde.konsole"})
    assert r["bundleId"] == "org.kde.konsole" and r["appName"] == "Konsole" and r["windowTitle"] == "~ : bash", r
    assert aw.make_record({"cls": "Foo", "pid": 0})["bundleId"] == "foo"
    apps = aw.list_apps()
    assert [a["name"] for a in apps] == ["Firefox", "Konsole"], apps          # NoDisplay hidden
    assert apps[1]["icon"].startswith("data:image/png;base64,")
    assert [b["key"] for b in aw.list_browsers()] == ["firefox"]
    # profiles
    os.makedirs(d + "/chromium"); json.dump({"profile": {"info_cache": {"Default": {"name": "Me"}, "P1": {"name": "Tmp", "is_ephemeral": True}}}}, open(d + "/chromium/Local State", "w"))
    os.environ["XDG_CONFIG_HOME"] = d
    assert aw.list_profiles("chromium") == [{"dir": "Default", "name": "Me", "email": None}]

# text-writer picks the paste chord from the active window
tspec = importlib.util.spec_from_loader("tw", importlib.machinery.SourceFileLoader("tw", os.path.join(HERE, "..", "helpers", "text-writer", "text-writer")))
tw = importlib.util.module_from_spec(tspec); tspec.loader.exec_module(tw)
with tempfile.TemporaryDirectory() as d:
    tw.__file__ = d + "/text-writer"
    def fake(rec):
        open(d + "/vowen-activewin", "w").write("#!/bin/sh\necho '%s'\n" % json.dumps(rec)); os.chmod(d + "/vowen-activewin", 0o755)
    for rec, want in [({"bundleId": "org.kde.konsole", "wmClass": "konsole"}, "ctrl+shift+v"),
                      ({"bundleId": "org.wezfurlong.wezterm", "wmClass": ""}, "ctrl+shift+v"),
                      ({"bundleId": "", "wmClass": "gnome-terminal-server"}, "ctrl+shift+v"),
                      ({"bundleId": "kde-kwrite", "wmClass": "org.kde.kwrite"}, "ctrl+v"),
                      ({"bundleId": "firefox", "wmClass": "firefox"}, "ctrl+v"),
                      ({"bundleId": "footage-app", "wmClass": ""}, "ctrl+v")]:
        fake(rec); assert tw.default_chord() == want, (rec, tw.default_chord())
    open(d + "/vowen-activewin", "w").write("#!/bin/sh\nexit 1\n"); assert tw.default_chord() == "ctrl+v"

# daemon: fake KWin reports via D-Bus, --get over the socket
if "DBUS_SESSION_BUS_ADDRESS" in os.environ or os.path.exists("/run/user/%d/bus" % os.getuid()):
    with tempfile.TemporaryDirectory() as rt:
        env = {**os.environ, "XDG_RUNTIME_DIR": rt, "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/%d/bus" % os.getuid()}
        p = subprocess.Popen([BIN, "--watch", "--parent-stdin"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
        sock = rt + "/vowen-activewin.sock"
        for _ in range(100):
            if os.path.exists(sock): break
            time.sleep(0.05)
        else:
            raise SystemExit("daemon did not start (no KWin/X11 backend?)")
        first = json.loads(p.stdout.readline())
        assert "bundleId" in first
        bus = aw.Bus()
        bus.call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "RequestName", "su", ["org.vowen.test", 4])
        payload = json.dumps({"cls": "konsole", "cap": "t", "pid": 0, "df": "org.kde.konsole"})
        bus.call("org.vowen.ActiveWin.p%d" % p.pid, aw.OBJ_PATH, "org.vowen.ActiveWin.p%d" % p.pid, "Active", "s", [payload])
        rec = json.loads(p.stdout.readline())
        assert rec["wmClass"] == "konsole" and rec["windowTitle"] == "t", rec
        r = subprocess.run([BIN, "--get"], capture_output=True, text=True, env=env, timeout=10)
        assert json.loads(r.stdout)["wmClass"] == "konsole", r.stdout
        c = subprocess.run([BIN, "--cursor"], capture_output=True, text=True, env=env, timeout=10)
        assert "x" in json.loads(c.stdout), c.stdout
        p.stdin.close()
        assert p.wait(5) == 0
        assert not os.path.exists(sock)
print("ok")
