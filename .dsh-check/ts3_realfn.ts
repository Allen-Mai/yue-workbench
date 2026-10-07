function h(...a: unknown[]): unknown { return a[0]; }
const x = [
  h('div', { class: 'g' },
    h(1),
  ),
];
