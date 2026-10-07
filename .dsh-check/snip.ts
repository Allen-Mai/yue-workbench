declare function Card(o: any): any;
declare function h(...a: any[]): any;
declare function Stat(o: any): any;
declare function fmtMoney(n: number): string;
declare function num(n: any): number;
declare function monthCN(s: string): string;
declare const store: any;
function f(month: string, fixedMonth: number, variableMonth: number, ratio: string) {
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月固定支出', value: fmtMoney(fixedMonth), unit: '元', tone: 'red', icon: 'home' }),
        Stat({ label: '本月可变支出', value: fmtMoney(variableMonth), unit: '元', tone: 'oak', icon: 'cart' }),
        Stat({ label: '固定支出占比', value: ratio, unit: '', tone: 'honey', icon: 'pie' }),
        Stat({ label: '固定支出账户余额', value: fmtMoney(num(store.account('fixed')?.balance)), unit: '元', tone: 'green', icon: 'wallet' }),
      )),
      h('div', { class: 'tiny muted mt-2' }, '固定支出走独立账户：不占日常额度、不计入省钱奖励；比例 = 固定支出 ÷（固定 + 可变）。'),
    ],
  });
}
