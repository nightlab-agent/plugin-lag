// Prints the layout of installed_plugins.json (key names and value types only, no values).
const fs = require('fs'), path = require('path'), os = require('os');
const root = process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR || path.join(os.homedir(), '.claude', 'plugins');
const type = v => Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v;
let j; try { j = JSON.parse(fs.readFileSync(path.join(root, 'installed_plugins.json'), 'utf8')); } catch (e) { console.log('no installed_plugins.json:', e.code || e.message); process.exit(0); }
console.log('top level:', Object.keys(j).map(k => `${k}: ${type(j[k])}`).join(', '));
const map = j.plugins && typeof j.plugins === 'object' ? j.plugins : j;
for (const [k, v] of Object.entries(map).slice(0, 3)) {
  const r = Array.isArray(v) ? v[0] : v;
  console.log(`key "${k}": ${type(v)}; record fields: ${r && typeof r === 'object' ? Object.keys(r).map(f => `${f}: ${type(r[f])}`).join(', ') : type(r)}`);
}
console.log('folders in the plugins root:', fs.readdirSync(root).join(', '));
