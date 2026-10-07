declare function h(...a: any[]): any;
const x = [
  h('div', { class: 'g' },
    h(1),
  ),
];
