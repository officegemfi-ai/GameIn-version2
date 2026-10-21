// Turns the test run into the rules table: every rule, desktop and phone, pass or fail, and why it failed.
// Writes test-results/rules.md (readable) and test-results/rules.json (for the docs and the CI summary).
const fs = require('fs');
const path = require('path');

class RulesReporter {
  constructor() { this.tests = new Map(); }
  onTestEnd(test) { this.tests.set(test.id, test); }
  onEnd() {
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules.json'), 'utf8'));
    const by = {};
    for (const t of this.tests.values()) {
      const ids = [...new Set(t.title.match(/\b[SOEPMRTCKD]\d{1,2}\b/g) || [])];
      const proj = t.parent.project() ? t.parent.project().name : 'default';
      const out = t.outcome(); // expected | unexpected | flaky | skipped
      const last = t.results[t.results.length - 1] || {};
      const why = out === 'unexpected' ? String((last.error && (last.error.message || last.error.value)) || last.status || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 6).join(' / ').slice(0, 600) : '';
      for (const id of ids) {
        by[id] = by[id] || {};
        const cur = by[id][proj] || { pass: 0, fail: 0, flaky: 0, skip: 0, why: [] , tests: [] };
        if (out === 'expected') cur.pass++; else if (out === 'flaky') { cur.pass++; cur.flaky++; } else if (out === 'skipped') cur.skip++; else { cur.fail++; cur.why.push(t.title + ': ' + why); }
        cur.tests.push(t.title);
        by[id][proj] = cur;
      }
    }
    const cell = c => !c ? 'not run' : c.fail ? 'FAIL' : c.pass ? (c.flaky ? 'pass (flaky)' : 'pass') : 'skipped';
    const rows = rules.map(r => ({ id: r.id, area: r.area, rule: r.rule, desktop: cell((by[r.id] || {}).desktop), phone: cell((by[r.id] || {}).phone), why: [].concat(((by[r.id] || {}).desktop || {}).why || [], ((by[r.id] || {}).phone || {}).why || []), tests: [...new Set([].concat(((by[r.id] || {}).desktop || {}).tests || [], ((by[r.id] || {}).phone || {}).tests || []))] }));
    const dir = path.join(process.cwd(), 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify(rows, null, 1));
    const ran = ['desktop', 'phone'].filter(p => rows.some(r => r[p] !== 'not run'));
    const md = ['| Rule | Area | What must hold | ' + ran.map(p => p[0].toUpperCase() + p.slice(1)).join(' | ') + ' |', '|---|---|---|' + ran.map(() => '---|').join('')]
      .concat(rows.map(r => `| ${r.id} | ${r.area} | ${r.rule.replace(/\|/g, '/')} | ` + ran.map(p => r[p]).join(' | ') + ' |'));
    const fails = rows.filter(r => r.why.length);
    if (fails.length) md.push('', '### Failures', '', ...fails.flatMap(r => r.why.map(w => `- **${r.id}** ${w.replace(/\|/g, '/')}`)));
    // a rule passes only if it ran and passed in every browser that ran
    const p = ran.length ? rows.filter(r => ran.every(k => r[k].startsWith('pass'))).length : 0;
    const notRun = ran.length ? rows.filter(r => ran.some(k => r[k] === 'not run')).map(r => r.id) : [];
    md.unshift(`**${p} of ${rows.length} rules pass** (${ran.join(' and ') || 'no tests ran'}).` + (notRun.length ? ` Not run: ${notRun.join(', ')}.` : ''), '');
    fs.writeFileSync(path.join(dir, 'rules.md'), md.join('\n') + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## GameIn rules\n\n' + md.join('\n') + '\n');
  }
}
module.exports = RulesReporter;
