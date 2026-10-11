// Linux entry point: fills in Electron APIs that are no-ops on Linux, then starts Vowen.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

// Logout/shutdown sends SIGTERM; Vowen's windows veto plain closes, so go through its quit path.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    app.quit();
    setTimeout(() => app.exit(0), 5000).unref();
  });
}

require('../dist-electron/main.bundle.js');
