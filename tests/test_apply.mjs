// patches/apply.mjs: renamed short identifiers and shifted indentation still match, names flow into `replace`,
// property names and strings stay exact, and an ambiguous `find` fails.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

function run(patches, src) {
  const dir = mkdtempSync(join(tmpdir(), 'apply-test-'));
  mkdirSync(join(dir, 'patches'));
  mkdirSync(join(dir, 'app'));
  cpSync(new URL('../patches/apply.mjs', import.meta.url), join(dir, 'patches/apply.mjs'));
  writeFileSync(join(dir, 'patches/t.patch.mjs'), `export default ${JSON.stringify(patches)};`);
  writeFileSync(join(dir, 'app/f.js'), src);
  const r = spawnSync(process.execPath, [join(dir, 'patches/apply.mjs'), join(dir, 'app')], { encoding: 'utf8' });
  return { code: r.status, out: readFileSync(join(dir, 'app/f.js'), 'utf8'), err: r.stderr };
}

const patch = { id: 'p', file: 'f.js', find: 'const a = L.platform("x");\n  if (a) {', replace: 'const a = L.platform("x") || "linux";\n  if (a) {' };

// renamed variables + different indentation
let r = run([patch], 'function f() {\n      const q = Z.platform("x");\n      if (q) {\n}}');
assert.equal(r.code, 0, r.err);
assert.equal(r.out, 'function f() {\n      const q = Z.platform("x") || "linux";\n  if (q) {\n}}');

// the same name must stay the same name
r = run([patch], 'const q = Z.platform("x");\nif (w) {');
assert.equal(r.code, 1);

// property names and strings are literal
assert.equal(run([patch], 'const q = Z.platfrm("x");\nif (q) {').code, 1);
assert.equal(run([patch], 'const q = Z.platform("y");\nif (q) {').code, 1);

// two sites, count 1 -> fail; count 2 -> both patched with their own names
const two = 'const q = Z.platform("x");\nif (q) {\nconst r = Y.platform("x");\nif (r) {';
assert.equal(run([patch], two).code, 1);
r = run([{ ...patch, count: 2 }], two);
assert.equal(r.code, 0, r.err);
assert.match(r.out, /const q = Z\.platform\("x"\) \|\| "linux"/);
assert.match(r.out, /const r = Y\.platform\("x"\) \|\| "linux"/);
console.log('apply.mjs: ok');
