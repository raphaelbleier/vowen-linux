#!/usr/bin/env node
// Applies every patches/*.patch.mjs to a deobfuscated Vowen app tree.
// usage: node apply.mjs <appDir>
// Each patch module default-exports an array of
//   { id, file, find, replace, count = 1 }
// `file` is relative to appDir. `find` must occur exactly `count` times,
// otherwise the build fails, so an upstream change can never be patched silently wrong.
//
// The obfuscator renames local variables in every Vowen release (`L` becomes `Z`, `Cx` becomes `aT`), and
// indentation shifts with the surrounding code. So `find` is matched loosely in exactly those two respects:
// - a short identifier (1-3 chars, not after a dot, not inside a string) matches any short identifier,
//   consistently: the same name in `find` is the same name in the bundle, and `replace` gets the bundle's names
// - line breaks plus indentation match any indentation
// Property names, strings and everything else must match exactly.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = process.argv[2];
if (!appDir) { console.error('usage: apply.mjs <appDir>'); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const files = new Map();
const KEEP = new Set(['if', 'in', 'do', 'for', 'let', 'new', 'try', 'var', 'of', 'get', 'set', 'NaN', 'Map', 'Set', 'URL']);
const TOKEN = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|(?<![\w$.])[A-Za-z_$][\w$]{0,2}(?![\w$])/g;
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n[ \t]*/g, '\\s*');
const isName = t => !/^["']/.test(t) && !KEEP.has(t);

function compile(find) {
  const groups = new Map();
  let re = '', last = 0;
  for (const m of find.matchAll(TOKEN)) {
    if (!isName(m[0])) continue;
    re += esc(find.slice(last, m.index));
    if (groups.has(m[0])) re += `\\k<${groups.get(m[0])}>`;
    else { groups.set(m[0], `v${groups.size}`); re += `(?<![\\w$.])(?<${groups.get(m[0])}>[A-Za-z_$][\\w$]{0,2})(?![\\w$])`; }
    last = m.index + m[0].length;
  }
  return { re: new RegExp(re + esc(find.slice(last)), 'g'), groups };
}

// Rename the names `replace` shares with `find` to what the bundle calls them.
const rename = (replace, groups, found) =>
  replace.replace(TOKEN, t => (isName(t) && groups.has(t) ? found[groups.get(t)] : t));

const read = f => files.get(f) ?? files.set(f, readFileSync(join(appDir, f), 'utf8')).get(f);

let failed = 0;
for (const name of readdirSync(here).filter(n => n.endsWith('.patch.mjs')).sort()) {
  const patches = (await import(pathToFileURL(join(here, name)))).default;
  for (const p of patches) {
    const src = read(p.file);
    const { re, groups } = compile(p.find);
    const n = [...src.matchAll(re)].length;
    const want = p.count ?? 1;
    if (n !== want) {
      console.error(`FAIL ${name}:${p.id} expected ${want} match(es) in ${p.file}, found ${n}`);
      // Where to look: the matches if there are too many, else the lines that still contain the first line of `find`.
      // Line numbers refer to the unpatched file.
      const orig = readFileSync(join(appDir, p.file), 'utf8');
      const lineOf = i => orig.slice(0, i).split('\n').length;
      const anchor = compile(p.find.split('\n')[0].trim()).re;
      const at = [...orig.matchAll(n ? re : anchor)].map(m => lineOf(m.index));
      console.error(`     ${n ? 'matches' : 'first line of find'} at line(s) ${at.slice(0, 8).join(', ') || 'none'}`);
      failed++;
      continue;
    }
    files.set(p.file, src.replace(re, (...a) => rename(p.replace, groups, a.at(-1))));
    console.log(`ok   ${name}:${p.id}`);
  }
}
if (failed) { console.error(`${failed} patch(es) failed`); process.exit(1); }
for (const [f, src] of files) writeFileSync(join(appDir, f), src);
