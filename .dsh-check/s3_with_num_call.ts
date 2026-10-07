interface O { [k: string]: unknown }
declare function Card(o: O): O;
declare function h(...a: unknown[]): O;
declare function Stat(o: O): O;
declare function fmtMoney(n: number): string;
declare function num(v: unknown): number;
declare function monthCN(s: string): string;
declare const store: { account(k: string): { balance: number } | undefined };

function f(fixedMonth: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(num(store.account('fixed')?.balance)) }),
      )),
    ],
  });
}
