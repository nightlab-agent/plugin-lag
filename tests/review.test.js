// Cases found in review before 0.1.0: each fault with a passing comparison case. Run: node tests/review.test.js
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const work = fs.mkdtempSync(path.join(__dirname, '.rwork-'));
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40), E = 'e'.repeat(40);
const refsDir = path.join(work, 'refs'), bin = path.join(work, 'bin');
fs.mkdirSync(refsDir); fs.mkdirSync(bin);
fs.copyFileSync(path.join(__dirname, 'fake-git'), path.join(bin, 'git')); fs.chmodSync(path.join(bin, 'git'), 0o755);
const refs = (url, lines) => fs.writeFileSync(path.join(refsDir, url.replace(/[/:]/g, '_')), lines.map(([s, r]) => `${s}\t${r}`).join('\n') + '\n');
// shape of real greptileai/claude-plugin ls-remote: annotated v1.2.3 (tag object B, commit C), lightweight v1.2.4 at D
refs('https://git.example/grep.git', [[E, 'HEAD'], [B, 'refs/tags/g--v1.2.3'], [C, 'refs/tags/g--v1.2.3^{}'], [D, 'refs/tags/g--v1.2.4']]);
refs('https://git.example/both.git', [[B, 'HEAD'], [B, 'refs/heads/main'], [A, 'refs/tags/main']]);
refs('https://git.example/branchonly.git', [[B, 'HEAD'], [B, 'refs/heads/main']]);
refs('https://git.example/rc.git', [[B, 'HEAD'], [A, 'refs/tags/v2.0.0-rc.1'], [B, 'refs/tags/v2.0.0']]);
refs('https://git.example/minor.git', [[B, 'HEAD'], [A, 'refs/tags/v1.9.0'], [B, 'refs/tags/v2.0.0']]);
refs('https://git.example/newest.git', [[B, 'HEAD'], [A, 'refs/tags/v1.0.0'], [B, 'refs/tags/v2.0.0']]);
function root(name, plugins, installed) {
  const r = path.join(work, name), mk = path.join(r, 'marketplaces', 'official', '.claude-plugin');
  fs.mkdirSync(mk, { recursive: true });
  fs.writeFileSync(path.join(mk, 'marketplace.json'), JSON.stringify({ name: 'official', plugins }));
  if (installed) fs.writeFileSync(path.join(r, 'installed_plugins.json'), JSON.stringify(installed));
  return r;
}
const run = (r, ...extra) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'plugin-lag.js'), '--root', r, ...extra],
  { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_REFS: refsDir } });
const state = (out, name) => (out.match(new RegExp(`^${name}@official  (.+)$`, 'm')) || [])[1];
const one = (p) => run(root(p.name + '-' + Math.random().toString(36).slice(2), [p], { version: 2, plugins: { [`${p.name}@official`]: [{}] } })).stdout;
let fail = 0;
const t = (title, fn) => { try { fn(); console.log(`PASS ${title}`); } catch (e) { fail++; console.log(`FAIL ${title}: ${e.message.split('\n')[0]}`); } };

t('F1 pin sha = commit of newest tag (ref names an older annotated tag) is current', () =>
  assert.strictEqual(state(one({ name: 'grep', source: { source: 'git-subdir', url: 'https://git.example/grep.git', path: 'p', ref: 'g--v1.2.3', sha: D } }), 'grep'), 'current'));
t('F1 comparison: pin sha = peeled commit of g--v1.2.3 with v1.2.4 upstream is BEHIND', () =>
  assert.strictEqual(state(one({ name: 'grep', source: { source: 'git-subdir', url: 'https://git.example/grep.git', path: 'p', ref: 'g--v1.2.3', sha: C } }), 'grep'), 'BEHIND'));
t('F2 pin at newest tag but sha is a different, older commit is not current', () =>
  assert.notStrictEqual(state(one({ name: 'nt', source: { source: 'url', url: 'https://git.example/newest.git', ref: 'v2.0.0', sha: A } }), 'nt'), 'current'));
t('F2 comparison: pin at newest tag with its own sha is current', () =>
  assert.strictEqual(state(one({ name: 'nt', source: { source: 'url', url: 'https://git.example/newest.git', ref: 'v2.0.0', sha: B } }), 'nt'), 'current'));
t('F3 ref "main" that is a branch AND a tag: moved branch is BEHIND', () =>
  assert.strictEqual(state(one({ name: 'both', source: { source: 'url', url: 'https://git.example/both.git', ref: 'main', sha: A } }), 'both'), 'BEHIND'));
t('F3 comparison: ref "main" branch only, moved, is BEHIND', () =>
  assert.strictEqual(state(one({ name: 'bo', source: { source: 'url', url: 'https://git.example/branchonly.git', ref: 'main', sha: A } }), 'bo'), 'BEHIND'));
t('F4 pin at v2.0.0-rc.1 with v2.0.0 released is BEHIND', () =>
  assert.strictEqual(state(one({ name: 'rc', source: { source: 'url', url: 'https://git.example/rc.git', ref: 'v2.0.0-rc.1', sha: A } }), 'rc'), 'BEHIND'));
t('F4 comparison: pin at v1.9.0 with v2.0.0 released is BEHIND', () =>
  assert.strictEqual(state(one({ name: 'mi', source: { source: 'url', url: 'https://git.example/minor.git', ref: 'v1.9.0', sha: A } }), 'mi'), 'BEHIND'));
const good = { name: 'ok', source: { source: 'url', url: 'https://git.example/branchonly.git', ref: 'main', sha: B } };
t('F5 one malformed entry (numeric sha) does not kill the run under --all', () => {
  const r = run(root('crash', [{ name: 'bad', source: { source: 'url', url: 'https://git.example/branchonly.git', sha: 12345 } }, good]), '--all');
  assert.strictEqual(r.status, 0, (r.stderr.match(/TypeError.*/) || [''])[0]); assert.strictEqual(state(r.stdout, 'ok'), 'current'); });
t('F5 comparison: the same two entries with a string sha run to the end', () => {
  const r = run(root('nocrash', [{ name: 'bad', source: { source: 'url', url: 'https://git.example/branchonly.git', sha: A } }, good]), '--all');
  assert.strictEqual(r.status, 0); assert.strictEqual(state(r.stdout, 'ok'), 'current'); });
t('F6 installed_plugins.json present with zero installs reports none (not stale cache folders)', () => {
  const r = root('emptyinst', [good], { version: 2, plugins: {} }); fs.mkdirSync(path.join(r, 'cache', 'official', 'ok', '1'), { recursive: true });
  assert.match(run(r).stdout, /No marketplace plugins installed/); });
t('F6 comparison: installed_plugins.json with one install lists only that one', () => {
  const r = root('oneinst', [good, { ...good, name: 'other' }], { version: 2, plugins: { 'ok@official': [{}] } }); fs.mkdirSync(path.join(r, 'cache', 'official', 'other', '1'), { recursive: true });
  const o = run(r).stdout; assert.ok(state(o, 'ok') && !state(o, 'other')); });
fs.rmSync(work, { recursive: true, force: true });
console.log(fail ? `${fail} failed` : 'all passed');
if (fail) process.exitCode = 1;
