// Small Linux helpers called from patched spots in Vowen's main bundle.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');

// Reveal a file in the file manager with it selected (macOS `open -R`).
exports.reveal = target => new Promise(resolve => {
  const fallback = () => spawn('xdg-open', [path.dirname(target)], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  execFile('gdbus', ['call', '--session', '--dest', 'org.freedesktop.FileManager1', '--object-path', '/org/freedesktop/FileManager1',
    '--method', 'org.freedesktop.FileManager1.ShowItems', `['${pathToFileURL(target).href}']`, ''], { timeout: 5000 }, err => {
    if (err) fallback();
    resolve();
  });
});

// Spoken folder names -> real paths, honouring localized XDG user dirs (~/.config/user-dirs.dirs).
exports.xdgDirs = () => {
  const home = os.homedir();
  const d = { home, applications: '/usr/share/applications', application: '/usr/share/applications', apps: '/usr/share/applications', app: '/usr/share/applications' };
  const names = { DOCUMENTS: ['documents', 'document'], DOWNLOAD: ['downloads', 'download'], DESKTOP: ['desktop'],
    PICTURES: ['pictures', 'picture'], MUSIC: ['music'], VIDEOS: ['videos', 'video', 'movies', 'movie'] };
  let text = '';
  try { text = fs.readFileSync(path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'user-dirs.dirs'), 'utf8'); } catch {}
  for (const [key, words] of Object.entries(names)) {
    const m = new RegExp(`^XDG_${key}_DIR="([^"]+)"`, 'm').exec(text);
    const p = m ? m[1].replace('$HOME', home) : path.join(home, words[0][0].toUpperCase() + words[0].slice(1));
    for (const w of words) d[w] = p;
  }
  return d;
};
