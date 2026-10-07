const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const file = path.join(__dirname, '..', 'src', 'modules', 'wealth.ts');
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS);
const out = [];
out.push('top-level statements: ' + sf.statements.length);
for (const st of sf.statements) {
  const lc = sf.getLineAndCharacterOfPosition(st.getStart(sf));
  const end = sf.getLineAndCharacterOfPosition(st.getEnd());
  const name = st.name ? st.name.getText(sf) : (ts.SyntaxKind[st.kind]);
  out.push(`  line ${lc.line + 1}-${end.line + 1} ${ts.SyntaxKind[st.kind]} ${name}`);
}
// find the fixedPage function and print its tree with a marker for the broken part
function findFn(node, target) {
  if (ts.isFunctionDeclaration(node) && node.name && node.name.text === target) return node;
  let found = null;
  node.forEachChild((c) => { if (!found) found = findFn(c, target); });
  return found;
}
const fn = findFn(sf, 'fixedPage');
out.push('--- fixedPage found: ' + !!fn);
if (fn) {
  const walk = (node, depth) => {
    const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const end = sf.getLineAndCharacterOfPosition(node.getEnd());
    const kind = ts.SyntaxKind[node.kind];
    if (depth <= 3 || kind === 'ArrayLiteralExpression' || kind === 'CallExpression') {
      out.push(`${'  '.repeat(depth)}${kind} @${lc.line + 1}-${end.line + 1} :: ${node.getText(sf).slice(0, 60).replace(/\n/g, '\\n')}`);
    }
    node.forEachChild((c) => walk(c, depth + 1));
  };
  walk(fn, 0);
}
fs.writeFileSync(path.join(__dirname, 'report3.txt'), out.join('\n'), 'utf8');
console.log('ok');
