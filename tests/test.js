// Offline tests: a fake plugins root and a fake git on PATH. Run: node tests/test.js
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');
const work = fs.mkdtempSync(path.join(__dirname, '.work-'));
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);
const refsDir = path.join(work, 'refs'), bin = path.join(work, 'bin');
fs.mkdirSync(refsDir); fs.mkdirSync(bin);
fs.copyFileSync(path.join(__dirname, 'fake-git'), path.join(bin, 'git')); fs.chmodSync(path.join(bin, 'git'), 0o755);
const refs = (url, lines) => fs.writeFileSync(path.join(refsDir, url.replace(/[/:]/g, '_')), lines.map(([s, r]) => `${s}\t${r}`).join('\n') + '\n');
refs('https://github.com/o/moved', [[B, 'HEAD'], [B, 'refs/heads/main']]);
refs('https://github.com/o/same', [[A, 'HEAD'], [A, 'refs/heads/main']]);
refs('https://git.example/tagged.git', [[C, 'HEAD'], [A, 'refs/tags/v1.0.0'], [B, 'refs/tags/v1.2.0'], [C, 'refs/tags/v1.10.0^{}']]);
refs('https://git.example/newest.git', [[C, 'HEAD'], [A, 'refs/tags/v1.9.0'], [B, 'refs/tags/v2.0.0']]);
refs('https://git.example/mono.git', [[D, 'HEAD'], [D, 'refs/heads/main']]);
refs('https://git.example/family.git', [[C, 'HEAD'], [A, 'refs/tags/skills-v1.0.0'], [B, 'refs/tags/v3.2.0']]);
refs('https://github.com/o/branch', [[D, 'HEAD'], [A, 'refs/heads/stable']]);

const plugins = [
  { name: 'moved', source: { source: 'github', repo: 'o/moved', sha: A } },
  { name: 'same', source: { source: 'github', repo: 'o/same', sha: A } },
  { name: 'tagged', source: { source: 'url', url: 'https://git.example/tagged.git', ref: 'v1.0.0', sha: A } },
  { name: 'newest', source: { source: 'url', url: 'https://git.example/newest.git', ref: 'v2.0.0', sha: B } },
  { name: 'mono', source: { source: 'git-subdir', url: 'https://git.example/mono.git', path: 'plugins/mono', sha: A } },
  { name: 'unpinned', source: { source: 'github', repo: 'o/moved' } },
  { name: 'local', source: './plugins/local' },
  { name: 'branch', source: { source: 'github', repo: 'o/branch', ref: 'stable', sha: A } },
  { name: 'family', source: { source: 'url', url: 'https://git.example/family.git', ref: 'skills-v1.0.0', sha: A } },
  { name: 'short', source: { source: 'url', url: 'o/moved', sha: A } },
  { name: 'gone', source: { source: 'github', repo: 'o/gone', sha: A } },
];
function makeRoot(name, installed) {
  const root = path.join(work, name), mk = path.join(root, 'marketplaces', 'official', '.claude-plugin');
  fs.mkdirSync(mk, { recursive: true });
  fs.writeFileSync(path.join(mk, 'marketplace.json'), JSON.stringify({ name: 'official', plugins }));
  if (installed) fs.writeFileSync(path.join(root, 'installed_plugins.json'), JSON.stringify(installed));
  return root;
}
const before = new Map();
const snapshot = dir => { const out = {}; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : (out[p] = fs.readFileSync(p, 'utf8')); } }; walk(dir); return JSON.stringify(out); };
const quiet = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DISABLE_UPDATES|DISABLE_AUTOUPDATER|CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC|FORCE_AUTOUPDATE_PLUGINS)$/.test(k)));
const run = (root, ...extra) => {
  const env = extra.length && typeof extra[extra.length - 1] === 'object' ? extra.pop() : {};
  before.set(root, snapshot(root));
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'plugin-lag.js'), '--root', root, ...extra],
    { encoding: 'utf8', cwd: work, env: { ...quiet, ...env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_REFS: refsDir } });
  assert.strictEqual(snapshot(root), before.get(root), 'the plugins root must be left unchanged');
  return out;
};
const state = (out, name) => (out.match(new RegExp(`^${name}@official  (.+)$`, 'm')) || [])[1];
let n = 0;
const t = (title, fn) => { fn(); n++; console.log(`ok ${n} ${title}`); };

const installed = { version: 2, plugins: Object.fromEntries(plugins.map(p => [`${p.name}@official`, [{ scope: 'user', version: '1.0.0' }]])) };
const out = run(makeRoot('wrapped', installed));
t('a github pin whose upstream HEAD moved is BEHIND', () => assert.strictEqual(state(out, 'moved'), 'BEHIND'));
t('a github pin equal to upstream HEAD is current', () => assert.strictEqual(state(out, 'same'), 'current'));
t('a tag pin with a newer tag upstream is BEHIND, by version order (v1.2.0 > v1.0.0, peeled ^{} ignored)', () => {
  assert.strictEqual(state(out, 'tagged'), 'BEHIND'); assert.match(out, /newer tag upstream: v1\.2\.0/); });
t('a tag pin at the newest tag is current even when HEAD moved', () => assert.strictEqual(state(out, 'newest'), 'current'));
t('a git-subdir pin in a repo that moved says REPO MOVED, not BEHIND', () => {
  assert.strictEqual(state(out, 'mono'), 'REPO MOVED'); assert.match(out, /may not touch plugins\/mono/); });
t('an entry with no sha is not compared', () => assert.strictEqual(state(out, 'unpinned'), 'not compared'));
t('a relative-path entry is not compared', () => assert.strictEqual(state(out, 'local'), 'not compared'));
t('a branch pin follows that branch, not HEAD', () => assert.strictEqual(state(out, 'branch'), 'current'));
t('an unreachable upstream is not compared and does not stop the run', () => {
  assert.strictEqual(state(out, 'gone'), 'not compared'); assert.match(out, /upstream unreachable: https:\/\/github.com\/o\/gone/); });
t('a tag is compared only with tags of its own family (skills-v1.0.0 is not behind v3.2.0)', () => assert.strictEqual(state(out, 'family'), 'current'));
t('an owner/repo url is read as a GitHub repo', () => assert.strictEqual(state(out, 'short'), 'BEHIND'));
t('the summary counts each state', () => assert.match(out, /3 behind, 1 in a repo that moved, 4 current \(8 compared of 11\)\./));

const flat = run(makeRoot('flat', { 'moved@official': { version: '1' }, 'same@official': { version: '1' } }));
t('a flat installed_plugins.json map is read too', () => assert.match(flat, /1 behind, 0 in a repo that moved, 1 current \(2 compared of 2\)/));

const cacheRoot = makeRoot('cache-only');
fs.mkdirSync(path.join(cacheRoot, 'cache', 'official', 'moved', '1.0.0'), { recursive: true });
t('without installed_plugins.json the cache folders name the installs', () => assert.strictEqual(state(run(cacheRoot), 'moved'), 'BEHIND'));

const onlyTwo = run(makeRoot('all', { 'same@official': [{}] }), '--all');
t('--all checks every pinned entry, installed or not', () => assert.match(onlyTwo, /\(8 compared of 9\)/));

t('an empty root says so and exits 0', () => { const r = path.join(work, 'empty'); fs.mkdirSync(r); assert.match(run(r), /No marketplace plugins installed under/); });

// Auto-update lines follow code.claude.com/docs/en/plugins/loading.md, "Which marketplaces and plugins auto-update".
const au = (out, m) => (out.match(new RegExp(`^  ${m}  (.+)$`, 'm')) || [])[1] || '';
const twoMarkets = (name, extra = {}) => {
  const r = makeRoot(name, { version: 2, plugins: { 'same@official': [{}], 'same@claude-plugins-official': [{}] } });
  const mk = path.join(r, 'marketplaces', 'claude-plugins-official', '.claude-plugin');
  fs.mkdirSync(mk, { recursive: true });
  fs.writeFileSync(path.join(mk, 'marketplace.json'), JSON.stringify({ name: 'claude-plugins-official', plugins: extra.plugins || plugins }));
  if (extra.known) fs.writeFileSync(path.join(r, 'known_marketplaces.json'), JSON.stringify(extra.known));
  if (extra.settings) fs.writeFileSync(path.join(path.dirname(r), 'settings.json'), JSON.stringify(extra.settings));
  return r;
};
for (const d of ['d1', 'd2', 'd3', 'd4', 'd5']) fs.mkdirSync(path.join(work, d));
const def = run(twoMarkets('d1/r'));
t('by default an official marketplace auto-updates and any other does not, with the command to update by hand', () => {
  assert.match(au(def, 'claude-plugins-official'), /^on \(default for Anthropic's official marketplaces\)/);
  assert.match(au(def, 'official'), /^off \(default for this marketplace\); by hand: claude plugin update <name>@official$/); });
const toggled = run(twoMarkets('d2/r', { known: { official: { autoUpdate: true, lastUpdated: '2026-10-12T08:00:00.000Z' }, 'claude-plugins-official': { autoUpdate: false } } }));
t('the /plugin toggle (known_marketplaces.json autoUpdate) wins over the default, and the last fetch date shows', () => {
  assert.match(au(toggled, 'official'), /^on \(set in \/plugin, Marketplaces\); listing last fetched 2026-10-12$/);
  assert.match(au(toggled, 'claude-plugins-official'), /^off \(set in \/plugin, Marketplaces\)/); });
const declared = run(twoMarkets('d3/r', { known: { official: { autoUpdate: true } }, settings: { extraKnownMarketplaces: { official: { autoUpdate: false } } } }));
t('autoUpdate on an extraKnownMarketplaces entry in settings wins over the /plugin toggle', () =>
  assert.match(au(declared, 'official'), /^off \(set in .*settings\.json\)/));
t('DISABLE_AUTOUPDATER turns every marketplace off; FORCE_AUTOUPDATE_PLUGINS=1 turns them back on', () => {
  assert.match(run(twoMarkets('d4/r'), { DISABLE_AUTOUPDATER: '1' }), /off for every marketplace: DISABLE_AUTOUPDATER is set/);
  const forced = run(twoMarkets('d4/r'), { DISABLE_AUTOUPDATER: '1', FORCE_AUTOUPDATE_PLUGINS: '1' });
  assert.doesNotMatch(forced, /off for every marketplace/); assert.match(au(forced, 'claude-plugins-official'), /^on /); });
t('an update-off variable set in the settings env block counts too, and "0" does not', () => {
  fs.writeFileSync(path.join(work, 'd5', 'settings.json'), JSON.stringify({ env: { DISABLE_UPDATES: '1' } }));
  assert.match(run(twoMarkets('d5/r')), /DISABLE_UPDATES is set/);
  fs.writeFileSync(path.join(work, 'd5', 'settings.json'), JSON.stringify({ env: { DISABLE_UPDATES: '0' } }));
  assert.doesNotMatch(run(twoMarkets('d5/r')), /off for every marketplace/); });
const helper = run(twoMarkets('d2/h', { plugins: plugins.map(p => p.name === 'same' ? { ...p, headersHelper: './h.sh' } : p) }));
t('a plugin whose entry declares a headersHelper is named as skipped by auto-update', () => {
  assert.match(helper, /same@claude-plugins-official declares a headersHelper: auto-update skips it/);
  assert.doesNotMatch(helper, /same@official declares/); });

fs.rmSync(work, { recursive: true, force: true });
console.log(`${n} tests passed`);
