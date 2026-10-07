const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const file = path.join(__dirname, '..', 'src', 'modules', 'wealth.ts');
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS);
const out = [];
// Print the AST for the statement that starts at line 736 (the `const stats = Card(` node)
function findNode(node, line) {
  let best = null;
  const visit = (n) => {
    const lc = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    if (lc.line + 1 === line) { best = n; return; }
    n.forEachChild(visit);
  };
  visit(node);
  return best;
}
const statsNode = findNode(sf, 736);
out.push('node at 736: ' + (statsNode ? ts.SyntaxKind[statsNode.kind] : 'none'));
if (statsNode) {
  const walk = (n, d) => {
    const s = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    const e = sf.getLineAndCharacterOfPosition(n.getEnd());
    out.push(`${'  '.repeat(d)}${ts.SyntaxKind[n.kind]} @${s.line + 1}:${s.character + 1}-${e.line + 1}:${e.character + 1} :: ${n.getText(sf).slice(0, 70).replace(/\n/g, '\\n')}`);
    if (d < 8) n.forEachChild((c) => walk(c, d + 1));
  };
  walk(statsNode, 0);
}
fs.writeFileSync(path.join(__dirname, 'report4.txt'), out.join('\n'), 'utf8');
console.log('ok');
