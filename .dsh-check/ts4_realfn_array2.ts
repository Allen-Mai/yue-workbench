function h(...a: unknown[]): unknown { return a[0]; }
function f(): string { return ''; }
const x = [
  h('div', { class: 'g' },
    f(),
    f(),
  ),
];
