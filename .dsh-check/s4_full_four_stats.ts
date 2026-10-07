interface O { [k: string]: unknown }
declare function Card(o: O): O;
declare function h(...a: unknown[]): O;
declare function Stat(o: O): O;
declare function fmtMoney(n: number): string;
declare function num(v: unknown): number;
declare function monthCN(s: string): string;
declare const store: { account(k: string): { balance: number } | undefined };

function f(month: string, fixedMonth: number, variableMonth: number, ratio: string) {
  const stats = Card({
    icon: 'home',
    title: `本月固定支出（${monthCN(month)}）`,
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
