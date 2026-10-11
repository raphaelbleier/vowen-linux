// Linux entry point: fills in Electron APIs that are no-ops on Linux, then starts Vowen.
const { app, desktopCapturer, nativeImage, powerMonitor, screen } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Desktop entries pass local files as file:// URIs (%U); Vowen's argv handling wants plain paths.
process.argv = process.argv.map(a => { try { return a.startsWith('file://') ? require('url').fileURLToPath(a) : a; } catch { return a; } });

// Login items -> XDG autostart entry. The launcher exports VOWEN_LAUNCHER (its own path).
const autostartFile = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'vowen.desktop');
const openedAtLogin = process.argv.includes('--autostart');

app.getLoginItemSettings = () => ({
  openAtLogin: fs.existsSync(autostartFile),
  openAsHidden: false,
  wasOpenedAtLogin: openedAtLogin,
  wasOpenedAsHidden: false,
  restoreState: false,
});

app.setLoginItemSettings = ({ openAtLogin }) => {
  if (!openAtLogin) {
    fs.rmSync(autostartFile, { force: true });
    return;
  }
  const exec = process.env.VOWEN_LAUNCHER || process.execPath;
  fs.mkdirSync(path.dirname(autostartFile), { recursive: true });
  fs.writeFileSync(autostartFile, [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Vowen',
    `Exec="${exec}" --autostart`,
    'Icon=vowen',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n'));
};

// KWin + XWayland: Chromium keeps a stale origin (off by the decoration height) for windows
// that were placed while hidden, so clicks land offset until the user moves the window.
// A 1px move right after showing makes it re-read its real position.
app.on('browser-window-created', (_e, win) => {
  // The app menu exists for macOS; on Linux keep it reachable via Alt only.
  win.setAutoHideMenuBar(true);
  win.setMenuBarVisibility(false);
  win.on('show', () => setTimeout(() => {
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    win.setPosition(x, y + 1);
    win.setPosition(x, y);
  }, 100));
});

// Screenshots: Electron's desktopCapturer only sees XWayland on a Wayland session. Serve "screen" sources from the
// vowen-screenshot helper (spectacle / grim / gnome-screenshot / import) instead, cropped per display.
const shot = path.join(process.resourcesPath, 'bin', 'vowen-screenshot');
if (fs.existsSync(shot)) {
  const getWindows = desktopCapturer.getSources.bind(desktopCapturer);
  const grab = () => new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `vowen-shot-${process.pid}-${Date.now()}.png`);
    execFile(shot, [out], { timeout: 15000 }, err => {
      const img = err ? null : nativeImage.createFromPath(out);
      fs.rmSync(out, { force: true });
      if (img && !img.isEmpty()) resolve(img); else reject(err || new Error('empty screenshot'));
    });
  });
  desktopCapturer.getSources = async (opts = {}) => {
    const types = opts.types || [];
    const sources = [];
    if (types.includes('screen')) {
      const full = await grab();
      const displays = screen.getAllDisplays();
      const x0 = Math.min(...displays.map(d => d.bounds.x)), y0 = Math.min(...displays.map(d => d.bounds.y));
      const w = Math.max(...displays.map(d => d.bounds.x + d.bounds.width)) - x0, h = Math.max(...displays.map(d => d.bounds.y + d.bounds.height)) - y0;
      const { width, height } = full.getSize();
      const sx = width / w, sy = height / h;
      displays.forEach((d, i) => {
        let img = full.crop({ x: Math.round((d.bounds.x - x0) * sx), y: Math.round((d.bounds.y - y0) * sy),
          width: Math.round(d.bounds.width * sx), height: Math.round(d.bounds.height * sy) });
        const t = opts.thumbnailSize;
        if (t && t.width > 0 && t.height > 0 && (img.getSize().width !== t.width || img.getSize().height !== t.height)) img = img.resize({ width: t.width, height: t.height, quality: 'good' });
        sources.push({ id: `screen:${i}:0`, name: `Screen ${i + 1}`, display_id: String(d.id), thumbnail: img, appIcon: null });
      });
    }
    // Window thumbnails can hang under XWayland; give up quickly.
    if (types.includes('window')) sources.push(...await Promise.race([getWindows({ ...opts, types: ['window'] }).catch(() => []), new Promise(r => setTimeout(r, 3000, []))]));
    return sources;
  };
}

// Stop-recording-on-lock/suspend: Electron has no Linux lock signal for KDE, so translate the ScreenSaver D-Bus
// ActiveChanged signal (KDE: org.freedesktop.ScreenSaver, GNOME: org.gnome.ScreenSaver) into powerMonitor events.
app.whenReady().then(() => {
  const rules = ['org.freedesktop.ScreenSaver', 'org.gnome.ScreenSaver'].map(i => `type='signal',interface='${i}',member='ActiveChanged'`);
  const mon = spawn('setpriv', ['--pdeathsig', 'TERM', '--', 'dbus-monitor', '--session', ...rules], { stdio: ['ignore', 'pipe', 'ignore'] });
  mon.on('error', () => {});
  let buf = '', pending = false;
  mon.stdout.on('data', chunk => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.includes('member=ActiveChanged')) pending = true;
      else if (pending && /boolean (true|false)/.test(line)) {
        pending = false;
        powerMonitor.emit(line.includes('true') ? 'lock-screen' : 'unlock-screen');
      }
    }
  });
  app.on('will-quit', () => mon.kill());
});

// Logout/shutdown sends SIGTERM; Vowen's windows veto plain closes, so go through its quit path.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    app.quit();
    setTimeout(() => app.exit(0), 5000).unref();
  });
}

require('../dist-electron/main.bundle.js');
