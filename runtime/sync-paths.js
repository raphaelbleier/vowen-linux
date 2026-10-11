// Linux locations of cloud-sync folders (Dropbox, Google Drive, OneDrive); null / [] when not found.
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = os.homedir();
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = p => { try { return fs.readdirSync(p); } catch { return []; } };

// ~/Insync/<account>/<Provider>
const insync = provider => ls(path.join(home, 'Insync')).map(a => path.join(home, 'Insync', a, provider)).filter(isDir);

// rclone / google-drive-ocamlfuse FUSE mounts whose remote name looks like the provider
function mounts(remoteRe) {
  let text = '';
  try { text = fs.readFileSync('/proc/self/mounts', 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    const [src, mp, type] = line.split(' ');
    if (!type || !type.startsWith('fuse.') || !remoteRe.test(src)) continue;
    out.push(mp.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))));
  }
  return out.filter(isDir);
}

const homeDirs = re => ls(home).filter(n => re.test(n)).map(n => path.join(home, n)).filter(isDir);

exports.dropbox = () => {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(home, '.dropbox', 'info.json'), 'utf8'));
    for (const k of ['personal', 'business']) if (info[k] && info[k].path && isDir(info[k].path)) return info[k].path;
  } catch {}
  return [path.join(home, 'Dropbox'), path.join(home, 'Dropbox (Maestral)')].find(isDir) || null;
};

exports.gdrive = () => {
  const c = [
    ...homeDirs(/^(google ?drive|google-drive|gdrive|my ?drive)$/i),
    ...insync('Google Drive'),
    ...mounts(/^(g-?drive|google-?drive)/i),
  ];
  return c.map(p => isDir(path.join(p, 'My Drive')) ? path.join(p, 'My Drive') : p)[0] || null;
};

exports.onedrive = () => {
  const c = [...homeDirs(/^one-?drive(\b|$)/i), ...insync('OneDrive'), ...mounts(/^one-?drive/i)];
  try { // abraunegg/onedrive client: sync_dir = "~/OneDrive"
    const m = /^\s*sync_dir\s*=\s*"?([^"\n]+)"?/m.exec(fs.readFileSync(path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'onedrive', 'config'), 'utf8'));
    if (m) c.unshift(m[1].trim().replace(/^~(?=\/|$)/, home));
  } catch {}
  return [...new Set(c.filter(isDir))];
};
