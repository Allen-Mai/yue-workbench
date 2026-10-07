const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROJ = path.join(__dirname, '..');
const NODE = process.execPath;
const BIN = path.join(PROJ, 'node_modules', '.pnpm', 'esbuild@0.21.5', 'node_modules', 'esbuild', 'bin', 'esbuild');

const HDR = `interface O { [k: string]: unknown }
declare function Card(o: O): O;
declare function h(...a: unknown[]): O;
declare function Stat(o: O): O;
declare function fmtMoney(n: number): string;
declare function num(v: unknown): number;
declare function monthCN(s: string): string;
declare const store: { account(k: string): { balance: number } | undefined };
`;

const steps = [
    ['s1_two_stats_in_h_in_array', `
function f(fixedMonth: number, variableMonth: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(fixedMonth) }),
        Stat({ label: 'b', value: fmtMoney(variableMonth) }),
      )),
    ],
  });
}
`],
    ['s2_two_stats_in_h_in_array_cn', `
function f(fixedMonth: number, variableMonth: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月固定支出', value: fmtMoney(fixedMonth) }),
        Stat({ label: '本月可变支出', value: fmtMoney(variableMonth) }),
      )),
    ],
  });
}
`],
    ['s3_with_num_call', `
function f(fixedMonth: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(num(store.account('fixed')?.balance)) }),
      )),
    ],
  });
}
`],
    ['s4_full_four_stats', `
function f(month: string, fixedMonth: number, variableMonth: number, ratio: string) {
  const stats = Card({
    icon: 'home',
    title: \`本月固定支出（\${monthCN(month)}）\`,
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月固定支出', value: fmtMoney(fixedMonth), unit: '元', tone: 'red', icon: 'home' }),
        Stat({ label: '本月可变支出', value: fmtMoney(variableMonth), unit: '元', tone: 'oak', icon: 'cart' }),
        Stat({ label: '固定支出占比', value: ratio, unit: '', tone: 'honey', icon: 'pie' }),
        Stat({ label: '固定支出账户余额', value: fmtMoney(num(store.account('fixed')?.balance)), unit: '元', tone: 'green', icon: 'wallet' }),
      )),
      h('div', { class: 'tiny muted mt-2' }, 'note'),
    ],
  });
}
`],
];

const log = [];
for (const [name, body] of steps) {
    const file = path.join(__dirname, name + '.ts');
    fs.writeFileSync(file, HDR + body, 'utf8');
    const r = cp.spawnSync(NODE, [BIN, file, '--outfile=' + path.join(__dirname, name + '.js')], { encoding: 'utf8' });
    const txt = ((r.stdout || '') + (r.stderr || '')).split('node:child_process')[0].trim().split('\n').slice(0, 4).join(' | ');
    log.push(`${name}: exit=${r.status} :: ${txt}`);
}
fs.writeFileSync(path.join(__dirname, 'snip6.txt'), log.join('\n'), 'utf8');
console.log('done');
