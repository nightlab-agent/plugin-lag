#!/usr/bin/env node
// plugin-lag: lists the Claude Code plugins you installed from a marketplace that pins a commit,
// and compares each pin with the plugin's upstream repo (one `git ls-remote` per repo).
// Read-only: it writes nothing, installs nothing, and changes no setting.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(`Usage: npx plugin-lag [--all] [--root <dir>]

  --all         check every commit-pinned entry in your marketplaces, installed or not
  --root <dir>  the plugins root (default: CLAUDE_CODE_PLUGIN_CACHE_DIR, else ~/.claude/plugins)`);
  process.exit(0);
}
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const root = flag('--root') || process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR || path.join(os.homedir(), '.claude', 'plugins');
const all = args.includes('--all');
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const dirs = p => { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } };

// installed_plugins.json keys are "name@marketplace"; its exact layout is not documented, so
// accept a "plugins" wrapper or a flat map; only when the file is missing, use the cache/<marketplace>/<plugin>/ folders.
function installs() {
  const j = readJson(path.join(root, 'installed_plugins.json'));
  const map = j && typeof j === 'object' ? (j.plugins && typeof j.plugins === 'object' ? j.plugins : j) : {};
  const seen = new Map();
  for (const key of Object.keys(map)) {
    const at = key.lastIndexOf('@');
    if (at > 0) seen.set(key, { name: key.slice(0, at), marketplace: key.slice(at + 1) });
  }
  if (!j) for (const m of dirs(path.join(root, 'cache'))) for (const p of dirs(path.join(root, 'cache', m))) seen.set(`${p}@${m}`, { name: p, marketplace: m });
  return [...seen.values()];
}

const known = readJson(path.join(root, 'known_marketplaces.json')) || {};
const manifests = new Map();
function marketplace(name) {
  if (!manifests.has(name)) {
    const loc = (known[name] && known[name].installLocation) || path.join(root, 'marketplaces', name);
    const m = readJson(path.join(loc, '.claude-plugin', 'marketplace.json'));
    manifests.set(name, m && Array.isArray(m.plugins) ? m.plugins : []);
  }
  return manifests.get(name);
}

const remotes = new Map();
function remote(url) {
  if (!remotes.has(url)) {
    let refs = null;
    try {
      const out = execFileSync('git', ['ls-remote', '--', url], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      refs = {};
      for (const line of out.trim().split('\n')) { const [sha, ref] = line.split('\t'); if (ref) refs[ref] = sha; }
    } catch { refs = null; }
    remotes.set(url, refs);
  }
  return remotes.get(url);
}

const num = t => (t.match(/\d+/g) || []).slice(0, 3).map(Number);
const pre = t => /\d-/.test(t);   // "v2.0.0-rc.1": a pre-release ranks below "v2.0.0"
const cmp = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return pre(b) - pre(a); };
const commit = (refs, tag) => refs[`refs/tags/${tag}^{}`] || refs[`refs/tags/${tag}`];   // an annotated tag's ^{} line is its commit
const short = s => s.slice(0, 12);

// Returns { state, lines } where state is behind | moved | current | skip | unreachable.
function check(e) {
  const s = e && typeof e.source === 'object' && e.source ? e.source : null;
  if (!s) return { state: 'skip', lines: ['  in the marketplace repo itself: updates with the marketplace'] };
  const repo = s.source === 'github' ? s.repo : s.url;
  if (!['github', 'url', 'git-subdir'].includes(s.source) || !repo) return { state: 'skip', lines: [`  ${s.source || 'unknown'} source: not a git pin`] };
  if (typeof s.sha !== 'string' || !s.sha) return { state: 'skip', lines: [`  not pinned to a commit: follows ${s.ref || 'the default branch'}`] };
  const url = !/^[a-z][a-z0-9+.-]*:|^git@/i.test(repo) && /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}` : repo;
  const refs = remote(url);
  if (!refs) return { state: 'unreachable', lines: [`  upstream unreachable: ${url}`] };
  const lines = [`  pinned at ${s.ref ? s.ref + ' ' : ''}${short(s.sha)}`];
  const isTag = s.ref && !refs[`refs/heads/${s.ref}`] && refs[`refs/tags/${s.ref}`];   // a branch of the same name wins, as in git
  if (isTag) {
    const family = s.ref.replace(/\d.*$/, '');   // "v1.5.5" -> "v", "skills-v1.0.0" -> "skills-v": compare within one tag family
    const tags = Object.keys(refs).filter(r => r.startsWith('refs/tags/') && !r.endsWith('^{}')).map(r => r.slice(10))
      .filter(t => t.startsWith(family) && /^\d+\.\d+/.test(t.slice(family.length)));
    const newest = tags.sort(cmp).pop();
    if (newest && commit(refs, newest) === s.sha) { lines.push(`  that commit is the newest tag upstream: ${newest}`); return { state: 'current', lines }; }
    if (newest && cmp(newest, s.ref) > 0) { lines.push(`  newer tag upstream: ${newest}`); return { state: 'behind', lines }; }
    if (commit(refs, s.ref) !== s.sha) { lines.push(`  tag ${s.ref} upstream is now ${short(commit(refs, s.ref))}`); return { state: 'behind', lines }; }
    lines.push('  no newer version tag upstream');
    return { state: 'current', lines };
  }
  const tip = s.ref ? refs[`refs/heads/${s.ref}`] : refs.HEAD;
  if (!tip) { lines.push(`  upstream has no branch or tag named ${s.ref}`); return { state: 'unreachable', lines }; }
  lines.push(`  upstream ${s.ref || 'default branch'} at ${short(tip)}`);
  if (tip === s.sha) return { state: 'current', lines };
  if (s.source === 'git-subdir') { lines.push(`  the repo moved; its commits may not touch ${s.path || 'the plugin folder'}`); return { state: 'moved', lines }; }
  return { state: 'behind', lines };
}

let targets;
if (all) {
  targets = [];
  const names = new Set([...Object.keys(known), ...dirs(path.join(root, 'marketplaces'))]);
  for (const m of names) for (const e of marketplace(m)) if (e && e.source && e.source.sha) targets.push({ name: e.name, marketplace: m });
} else targets = installs();
if (!targets.length) { console.log(all ? `No commit-pinned marketplace entries found under ${root}` : `No marketplace plugins installed under ${root}`); process.exit(0); }

const label = { behind: 'BEHIND', moved: 'REPO MOVED', current: 'current', skip: 'not compared', unreachable: 'not compared' };
const count = { behind: 0, moved: 0, current: 0, skip: 0, unreachable: 0 };
for (const t of targets) {
  const e = marketplace(t.marketplace).find(p => p && p.name === t.name);
  let r;
  try { r = e ? check(e) : { state: 'skip', lines: ['  no entry in its marketplace file'] }; }
  catch { r = { state: 'skip', lines: ['  its marketplace entry could not be read'] }; }
  count[r.state]++;
  console.log(`${t.name}@${t.marketplace}  ${label[r.state]}\n${r.lines.join('\n')}`);
}
const compared = count.behind + count.moved + count.current;
console.log(`\n${count.behind} behind, ${count.moved} in a repo that moved, ${count.current} current (${compared} compared of ${targets.length}).`);
if (count.behind || count.moved) console.log(`The marketplace reviewed the commit it pins; newer upstream commits were not reviewed by it.
To follow upstream, add the author's own marketplace if the repo has one, and turn on auto-update
for it in /plugin, Marketplaces (off by default for third-party marketplaces).`);
