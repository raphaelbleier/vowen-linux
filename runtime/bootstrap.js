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

require('../dist-electron/main.bundle.js');
