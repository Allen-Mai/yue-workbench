const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const file = path.join(__dirname, '..', 'src', 'modules', 'wealth.ts');
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS);
const diags = sf.parseDiagnostics || [];

const out = [];
out.push('file length: ' + text.length + ' chars');
out.push('parse diagnostics: ' + diags.length);
for (const d of diags.slice(0, 12)) {
  const start = d.start ?? 0;
  const lc = sf.getLineAndCharacterOfPosition(start);
  out.push(`TS${d.code} at line ${lc.line + 1} col ${lc.character + 1} :: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  out.push('   source line: ' + JSON.stringify(text.split('\n')[lc.line]?.slice(0, 160)));
}
if (diags.length) {
  const first = sf.getLineAndCharacterOfPosition(diags[0].start ?? 0);
  const ls = text.split('\n');
  out.push('--- context ---');
  for (let i = Math.max(0, first.line - 4); i <= Math.min(ls.length - 1, first.line + 2); i++) {
    out.push(String(i + 1).padStart(5) + ': ' + ls[i].slice(0, 200));
  }
}
fs.writeFileSync(path.join(__dirname, 'report.txt'), out.join('\n'), 'utf8');
console.log('written');
