declare function Card(o: any): any;
declare function h(...a: any[]): any;
declare function Stat(o: any): any;
declare function fmtMoney(n: number): string;
function f(a: number, b: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(a) }),
        Stat({ label: 'b', value: fmtMoney(b) }),
      )),
    ],
  });
}
