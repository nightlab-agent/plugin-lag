// Review of 0.2.0 (auto-update lines): each fault with a passing comparison case.
// Run: node tests/review-020.test.js [path/to/plugin-lag.js]
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
const BIN = path.resolve(process.argv[2] || path.join(__dirname, '..', 'bin', 'plugin-lag.js'));
const work = fs.mkdtempSync(path.join(__dirname, '.r020-'));
const A = 'a'.repeat(40);
const refsDir = path.join(work, 'refs'), bin = path.join(work, 'bin'), cwd = path.join(work, 'cwd');
for (const d of [refsDir, bin, cwd]) fs.mkdirSync(d);
fs.copyFileSync(path.join(__dirname, 'fake-git'), path.join(bin, 'git')); fs.chmodSync(path.join(bin, 'git'), 0o755);
fs.writeFileSync(path.join(refsDir, 'https___github.com_o_same'), `${A}\tHEAD\n${A}\trefs/heads/main\n`);
const quiet = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DISABLE_UPDATES|DISABLE_AUTOUPDATER|CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC|FORCE_AUTOUPDATE_PLUGINS|CLAUDE_CONFIG_DIR|CLAUDE_CODE_PLUGIN_CACHE_DIR)$/.test(k)));
let k = 0;
// a plugins root <dir>/plugins with one install "same@<market>"; <dir>/settings.json is the user settings under --root
function root(market = 'claude-plugins-official', { settings, known } = {}) {
  const dir = path.join(work, `c${k++}`), r = path.join(dir, 'plugins'), mk = path.join(r, 'marketplaces', market, '.claude-plugin');
  fs.mkdirSync(mk, { recursive: true });
  fs.writeFileSync(path.join(mk, 'marketplace.json'), JSON.stringify({ name: market, plugins: [{ name: 'same', source: { source: 'github', repo: 'o/same', sha: A } }] }));
  fs.writeFileSync(path.join(r, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { [`same@${market}`]: [{ scope: 'user' }] } }));
  if (settings) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings));
  if (known) fs.writeFileSync(path.join(r, 'known_marketplaces.json'), JSON.stringify(known));
  return { dir, r };
}
const run = (args, env = {}) => spawnSync(process.execPath, [BIN, ...args],
  { cwd, encoding: 'utf8', env: { ...quiet, ...env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_REFS: refsDir } }).stdout;
const allOff = /off for every marketplace/;
let fail = 0;
const t = (title, fn) => { try { fn(); console.log(`PASS ${title}`); } catch (e) { fail++; console.log(`FAIL ${title}: ${e.message.split('\n')[0]}`); } };

// R1 (kind 1/4): env-vars.md "Precedence": "When the same variable is set in both your shell and a settings file env block,
// the settings file value applies". plugin-lag reads process.env first (bin/plugin-lag.js:127).
t('R1 shell DISABLE_AUTOUPDATER=1 but settings env sets it to "0": auto-update is not off for every marketplace', () =>
  assert.doesNotMatch(run(['--root', root('claude-plugins-official', { settings: { env: { DISABLE_AUTOUPDATER: '0' } } }).r], { DISABLE_AUTOUPDATER: '1' }), allOff));
t('R1b shell DISABLE_AUTOUPDATER=0 but settings env sets it to "1": auto-update is off for every marketplace', () =>
  assert.match(run(['--root', root('claude-plugins-official', { settings: { env: { DISABLE_AUTOUPDATER: '1' } } }).r], { DISABLE_AUTOUPDATER: '0' }), allOff));
t('R1 comparison: settings env DISABLE_AUTOUPDATER=1, shell unset: off for every marketplace', () =>
  assert.match(run(['--root', root('claude-plugins-official', { settings: { env: { DISABLE_AUTOUPDATER: '1' } } }).r]), allOff));

// R2 (kind 4): env-vars.md "Variables" note: "0, false, no, or off to turn it off, in any casing". isSet (line 128) only knows 0/false.
t('R2 DISABLE_AUTOUPDATER=off leaves auto-update on', () =>
  assert.doesNotMatch(run(['--root', root().r], { DISABLE_AUTOUPDATER: 'off' }), allOff));
t('R2b DISABLE_UPDATES=no leaves auto-update on', () =>
  assert.doesNotMatch(run(['--root', root().r], { DISABLE_UPDATES: 'no' }), allOff));
t('R2 comparison: DISABLE_AUTOUPDATER=false leaves auto-update on', () =>
  assert.doesNotMatch(run(['--root', root().r], { DISABLE_AUTOUPDATER: 'false' }), allOff));

// R3 (kind 3/4): env-vars.md CLAUDE_CONFIG_DIR: "All settings, session history, and plugins are stored under this path".
// Line 19 takes the plugins root from the home folder, while line 123 takes settings from CLAUDE_CONFIG_DIR: two roots.
t('R3 with CLAUDE_CONFIG_DIR set (no --root), the plugins under it are found', () => {
  const { dir } = root(); const home = path.join(work, 'home'); fs.mkdirSync(home, { recursive: true });
  assert.match(run([], { HOME: home, CLAUDE_CONFIG_DIR: dir }), /^same@claude-plugins-official  current$/m); });
t('R3 comparison: the same folder given as --root is found', () =>
  assert.match(run(['--root', root().r]), /^same@claude-plugins-official  current$/m));

// R4 (kind 3): d-trouble.md:455-468 / d-security.md:48: a reserved official name is accepted only from github.com/anthropics/;
// an entry registered from another source stops loading. OFFICIAL.includes(m) (line 137) checks the name alone.
const knownFrom = (repo) => ({ 'claude-code-plugins': { source: { source: 'github', repo }, lastUpdated: '2026-10-01T00:00:00.000Z' } });
t('R4 a marketplace named claude-code-plugins registered from a non-anthropics repo is not reported as auto-updating by default', () =>
  assert.doesNotMatch(run(['--root', root('claude-code-plugins', { known: knownFrom('someone/claude-code-plugins') }).r]), /claude-code-plugins  on \(default for Anthropic's official/));
t('R4 comparison: claude-code-plugins from anthropics/claude-code is on by default', () =>
  assert.match(run(['--root', root('claude-code-plugins', { known: knownFrom('anthropics/claude-code') }).r]), /claude-code-plugins  on \(default for Anthropic's official/));

fs.rmSync(work, { recursive: true, force: true });
console.log(fail ? `${fail} failed` : 'all passed');
if (fail) process.exitCode = 1;
