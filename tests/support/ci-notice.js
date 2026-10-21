// Prints a run's result as GitHub annotations, so it shows on the run's page and can be read through the GitHub API
// (the job summary and the report artifact have the full detail).
//   node tests/support/ci-notice.js rules <project>    after the rules run
//   node tests/support/ci-notice.js inventory          after the button inventory
const fs = require('fs');
const path = require('path');
const [mode, proj] = process.argv.slice(2);
const out = (kind, title, msg) => console.log(`::${kind} title=${title}::${String(msg).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
const chunks = (lines, max) => lines.reduce((a, l) => { if (!a.length || a[a.length - 1].length + l.length + 1 > max) a.push(l); else a[a.length - 1] += '\n' + l; return a; }, []);

if (mode === 'rules') {
  const file = path.join('test-results', 'rules.json');
  if (!fs.existsSync(file)) { out('error', `GameIn rules (${proj})`, 'no rules report: the tests did not run'); process.exit(0); }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cell = r => r[proj] || 'not run';
  const pass = rows.filter(r => cell(r).startsWith('pass')).length;
  let stats = '';
  try { const s = JSON.parse(fs.readFileSync(path.join('test-results', 'results.json'), 'utf8')).stats; stats = ` Tests: ${s.expected} passed, ${s.unexpected} failed, ${s.flaky} flaky, ${s.skipped} skipped, ${Math.round(s.duration / 1000)} s.`; } catch (e) { /* no stats */ }
  out('notice', `GameIn rules (${proj})`, `${pass} of ${rows.length} rules pass.${stats}`);
  out('notice', `GameIn rules by id (${proj})`, rows.map(r => r.id + ':' + cell(r).replace(/ /g, '-')).join(' '));
  rows.filter(r => cell(r) === 'FAIL').slice(0, 10).forEach(r => out('error', `${r.id} fails (${proj})`, (r.why || []).join(' | ').slice(0, 1500)));
} else if (mode === 'inventory') {
  const dir = path.join('test-results', 'inventory');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  const kind = e => {
    const p = e.split(';').map(x => x.trim()).filter(Boolean), f = p[0] || '';
    if (p.some(x => x.startsWith('ERROR'))) return 'error';
    if (f.startsWith('not found')) return 'not checked';
    if (f.startsWith('goes to') || f.startsWith('opens the')) return 'navigates';
    if (f.startsWith('opens a dialog') || f.startsWith('closes a dialog')) return 'dialog';
    if (f.startsWith('changes saved data')) return 'data';
    if (f.startsWith('says') || f.startsWith('assistant')) return 'message';
    if (f === 'a field' || f === 'fills a field') return 'field';
    if (f.startsWith('link to')) return 'link';
    if (f.startsWith('disabled')) return 'disabled';
    if (['changes the view', 'scrolls', 'moves keyboard focus'].includes(f)) return 'view';
    if (f === 'already selected') return 'selected';
    return 'none';
  };
  const lines = [], odd = [];
  for (const f of files.sort()) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const c = {};
    rows.forEach(r => { const k = kind(r.effect); c[k] = (c[k] || 0) + 1; if (['error', 'none', 'not checked'].includes(k)) odd.push(`${f.replace(/\.json$/, '')} | ${r.zone} | ${r.control.slice(0, 60)} | ${r.effect.slice(0, 120)}`); });
    lines.push(`${f.replace(/\.json$/, '')} ${rows.length} ` + Object.entries(c).map(([k, v]) => k + '=' + v).join(','));
  }
  out('notice', 'Button inventory', `${files.length} places, ${lines.reduce((x, l) => x + +l.split(' ')[1], 0)} controls; ${odd.length} with no visible effect or an error`);
  chunks(lines, 6000).slice(0, 4).forEach((c, i) => out('notice', `Inventory places ${i + 1}`, c));
  chunks(odd, 6000).slice(0, 4).forEach((c, i) => out('notice', `Inventory exceptions ${i + 1}`, c));
}
