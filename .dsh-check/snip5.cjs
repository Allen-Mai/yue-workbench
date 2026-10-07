const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROJ = path.join(__dirname, '..');
const NODE = process.execPath;
const BIN = path.join(PROJ, 'node_modules', '.pnpm', 'esbuild@0.21.5', 'node_modules', 'esbuild', 'bin', 'esbuild');

const cases = [
    ['ts1_typeonly', 'ts', "declare const p: any;\nconst x = [f(1), f(2)];\n"],
    ['ts2_typeonly_nested', 'ts', "declare function h(...a: any[]): any;\nconst x = [\n  h('div', { class: 'g' },\n    h(1),\n  ),\n];\n"],
    ['ts3_realfn', 'ts', "function h(...a: unknown[]): unknown { return a[0]; }\nconst x = [\n  h('div', { class: 'g' },\n    h(1),\n  ),\n];\n"],
    ['ts4_realfn_array2', 'ts', "function h(...a: unknown[]): unknown { return a[0]; }\nfunction f(): string { return ''; }\nconst x = [\n  h('div', { class: 'g' },\n    f(),\n    f(),\n  ),\n];\n"],
    ['js5_realfn_array2', 'mjs', "function h(...a) { return a[0]; }\nfunction f() { return ''; }\nconst x = [\n  h('div', { class: 'g' },\n    f(),\n    f(),\n  ),\n];\n"],
];

const log = [];
for (const [name, ext, code] of cases) {
    const file = path.join(__dirname, `${name}.${ext}`);
    fs.writeFileSync(file, code, 'utf8');
    const r = cp.spawnSync(NODE, [BIN, file, '--outfile=' + path.join(__dirname, name + '.out.js')], { encoding: 'utf8' });
    const txt = ((r.stdout || '') + (r.stderr || '')).split('node:child_process')[0].trim().split('\n').slice(0, 4).join(' | ');
    log.push(`${name}: exit=${r.status} :: ${txt}`);
}
fs.writeFileSync(path.join(__dirname, 'snip5.txt'), log.join('\n'), 'utf8');
console.log('done');
