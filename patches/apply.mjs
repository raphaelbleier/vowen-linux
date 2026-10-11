#!/usr/bin/env node
// Applies every patches/*.patch.mjs to a deobfuscated Vowen app tree.
// usage: node apply.mjs <appDir>
// Each patch module default-exports an array of
//   { id, file, find, replace, count = 1 }
// `file` is relative to appDir. `find` must occur exactly `count` times,
// otherwise the build fails, so an upstream change can never be patched silently wrong.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = process.argv[2];
if (!appDir) { console.error('usage: apply.mjs <appDir>'); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const files = new Map();
const read = f => files.get(f) ?? files.set(f, readFileSync(join(appDir, f), 'utf8')).get(f);

let failed = 0;
for (const name of readdirSync(here).filter(n => n.endsWith('.patch.mjs')).sort()) {
  const patches = (await import(pathToFileURL(join(here, name)))).default;
  for (const p of patches) {
    const src = read(p.file);
    const n = src.split(p.find).length - 1;
    const want = p.count ?? 1;
    if (n !== want) {
      console.error(`FAIL ${name}:${p.id} expected ${want} match(es) in ${p.file}, found ${n}`);
      failed++;
      continue;
    }
    files.set(p.file, src.split(p.find).join(p.replace));
    console.log(`ok   ${name}:${p.id}`);
  }
}
if (failed) { console.error(`${failed} patch(es) failed`); process.exit(1); }
for (const [f, src] of files) writeFileSync(join(appDir, f), src);
