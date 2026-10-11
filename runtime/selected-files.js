// getSelectedFiles for Linux file managers (Vowen only has Finder/Explorer): press Ctrl+C in the focused
// file manager and read text/uri-list from the clipboard, then put the previous clipboard back.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { fileURLToPath } = require('url');

const FM = /dolphin|nautilus|nemo|thunar|pcmanfm|caja|krusader|doublecmd|spacefm|konqueror|dde-file-manager|cosmic-files|pantheon-files|marlin|\bfiles\b/i;
const URI_TYPES = ['text/uri-list', 'x-special/gnome-copied-files'];
const SENTINEL = '__vowen_files_sentinel_' + process.pid + '__';
const wayland = !!process.env.WAYLAND_DISPLAY;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bin = name => path.join(process.resourcesPath, 'bin', name);

const run = (cmd, args, input) => new Promise(res => {
  const p = execFile(cmd, args, { timeout: 3000, encoding: 'buffer', maxBuffer: 16 << 20 }, (e, out) => res(e ? null : out));
  p.on('error', () => {});
  if (input !== undefined) p.stdin.end(input); else p.stdin.end();
});

const types = async () => {
  const out = wayland ? await run('wl-paste', ['-l']) : await run('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o']);
  return out ? out.toString().split('\n') : [];
};
const read = mime => wayland ? run('wl-paste', ['-n', '-t', mime]) : run('xclip', ['-selection', 'clipboard', '-t', mime, '-o']);
// wl-copy / xclip keep running as the selection owner, so don't wait on their pipes.
const write = (mime, data) => new Promise(res => {
  const p = spawn(wayland ? 'wl-copy' : 'xclip', wayland ? ['-t', mime] : ['-selection', 'clipboard', '-t', mime, '-i'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  p.on('error', res);
  p.stdin.end(data);
  setTimeout(res, wayland ? 100 : 50);
  p.unref();
});

async function readUris() {
  const have = await types();
  for (const t of URI_TYPES) {
    if (!have.includes(t)) continue;
    const raw = await read(t);
    if (!raw) continue;
    const files = raw.toString().split(/\r?\n/).filter(l => l.startsWith('file://')).map(l => { try { return fileURLToPath(l); } catch { return null; } }).filter(Boolean);
    if (files.length) return { files, raw, type: t };
  }
  return null;
}

async function fileManagerFocused() {
  const sources = [
    async () => { const o = await run(bin('vowen-activewin'), ['--get']); return o && o.toString(); },
    async () => { const o = await run('kdotool', ['getactivewindow', 'getwindowclassname']); return o && o.toString(); },
  ];
  for (const s of sources) {
    const text = await s().catch(() => null);
    if (text && text.trim()) return FM.test(text);
  }
  return true; // unknown: assume the user is looking at a file manager
}

function ctrlC() {
  return new Promise(resolve => {
    const sock = net.connect(path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`, 'vowen-input.sock'));
    let done = false;
    const finish = ok => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
    sock.setTimeout(2000, () => finish(false));
    sock.on('error', () => finish(false));
    sock.on('data', d => { try { finish(!!JSON.parse(String(d).split('\n')[0]).ok); } catch { finish(false); } });
    sock.write(JSON.stringify({ cmd: 'chord', keys: [29, 46] }) + '\n');
  }).then(async ok => ok || !!(await run('xdotool', ['key', 'ctrl+c'])));
}

module.exports = async function getSelectedFiles() {
  if (!(await fileManagerFocused())) return [];
  const prior = await readUris();
  const snap = path.join(os.tmpdir(), `vowen-clip-${process.pid}-${Date.now()}`);
  await run(bin('text-writer'), ['--snapshot', snap]);
  try {
    await run(bin('text-writer'), ['--set-clipboard', SENTINEL]);
    if (!(await ctrlC())) return [];
    for (let i = 0; i < 20; i++) {
      await sleep(40);
      const got = await readUris();
      if (got) return got.files;
    }
    return [];
  } finally {
    if (prior) await write(prior.type, prior.raw);
    else if (fs.existsSync(snap)) await run(bin('text-writer'), ['--restore', snap]);
    fs.rmSync(snap, { force: true });
  }
};
