const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROJ = path.join(__dirname, '..');
const NODE = process.execPath;
const BIN = path.join(PROJ, 'node_modules', '.pnpm', 'esbuild@0.21.5', 'node_modules', 'esbuild', 'bin', 'esbuild');
const TMP = path.join(__dirname, 'case.mjs');

const cases = {
    'a_plain_array_calls': "const x = [f(1), f(2)];\n",
    'b_array_call_multiline': "const x = [\n  f(1),\n  f(2),\n];\n",
    'c_array_nested_call_multiline': "const x = [\n  h('div', { class: 'g' },\n    f(1),\n    f(2),\n  ),\n];\n",
    'd_array_nested_call_plus_string': "const x = [\n  h('div', { class: 'g' },\n    f(1),\n  ),\n  h('div', {}, 'note'),\n];\n",
    'e_object_with_array_nested': "const x = C({\n  body: [\n    h('div', { class: 'g' },\n      f(1),\n    ),\n  ],\n});\n",
    'f_same_as_d_named_h': "const x = [\n  h('div', { class: 'grid grid-auto' },\n    Stat({ label: 'a', value: 1 }),\n    Stat({ label: 'b', value: 2 }),\n  ),\n];\n",
};

const log = [];
for (const [name, code] of Object.entries(cases)) {
    fs.writeFileSync(TMP, code, 'utf8');
    const r = cp.spawnSync(NODE, [BIN, TMP, '--outfile=' + path.join(__dirname, 'case.js')], { encoding: 'utf8' });
    const txt = (r.stdout || '') + (r.stderr || '');
    const head = txt.split('node:child_process')[0].trim().split('\n').slice(0, 4).join(' | ');
    log.push(`${name}: exit=${r.status} :: ${head}`);
}
fs.writeFileSync(path.join(__dirname, 'snip4.txt'), log.join('\n'), 'utf8');
console.log('done');
