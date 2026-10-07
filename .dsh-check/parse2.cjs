const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const file = path.join(__dirname, '..', 'src', 'modules', 'wealth.ts');
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS);
const diags = sf.parseDiagnostics || [];
const out = [];
out.push('total parse diagnostics: ' + diags.length);
// group by line to see the true first deltas
const seen = new Map();
for (const d of diags) {
  const lc = sf.getLineAndCharacterOfPosition(d.start ?? 0);
  const k = lc.line + 1;
  if (!seen.has(k)) seen.set(k, `${lc.line + 1}:${lc.character + 1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}
out.push('distinct error lines: ' + Array.from(seen.keys()).join(', '));
out.push('--- first 200 diagnostics ---');
for (const d of diags.slice(0, 200)) {
  const lc = sf.getLineAndCharacterOfPosition(d.start ?? 0);
  out.push(`${lc.line + 1}:${lc.character + 1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}
fs.writeFileSync(path.join(__dirname, 'report2.txt'), out.join('\n'), 'utf8');
console.log('ok');
