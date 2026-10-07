import {
  lunarToSolar, solarToLunar, lunarBirthdayInYear, addDays, diffDays, daysTogether,
  nextAnniversary, weekKey, weekStart, today, daysOfThisMonth, monthRange, fmtDate,
} from '../src/core/date';

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got=${got} want=${want}`);
};

// 已知对应的公历/农历日子（权威对照）
eq('2024 春节 正月初一 -> 2024-02-10', lunarToSolar(2024, 1, 1), '2024-02-10');
eq('2023 春节 正月初一 -> 2023-01-22', lunarToSolar(2023, 1, 1), '2023-01-22');
eq('2025 春节 正月初一 -> 2025-01-29', lunarToSolar(2025, 1, 1), '2025-01-29');
eq('2026 春节 正月初一 -> 2026-02-17', lunarToSolar(2026, 1, 1), '2026-02-17');
eq('2024 中秋 八月十五 -> 2024-09-17', lunarToSolar(2024, 8, 15), '2024-09-17');
eq('2025 端午 五月初五 -> 2025-05-31', lunarToSolar(2025, 5, 5), '2025-05-31');
eq('2024 元宵 正月十五 -> 2024-02-24', lunarToSolar(2024, 1, 15), '2024-02-24');
eq('1900 正月初一 -> 1900-01-31', lunarToSolar(1900, 1, 1), '1900-01-31');

// 反向：公历 -> 农历
eq('2024-02-10 是 正月初一', solarToLunar('2024-02-10').text, '正月初一');
eq('2024-09-17 是 八月十五', solarToLunar('2024-09-17').text, '八月十五');
eq('2025-01-29 是 正月初一', solarToLunar('2025-01-29').text, '正月初一');

// 农历生日换算
eq('农历八月十五 in 2025 -> 2025-10-06', lunarBirthdayInYear(8, 15, 2025), '2025-10-06');

// 日期算术
eq('addDays 跨月', addDays('2024-02-28', 2), '2024-03-01');
eq('addDays 跨年', addDays('2024-12-31', 1), '2025-01-01');
eq('diffDays', diffDays('2024-03-01', '2024-02-28'), 2);
eq('daysTogether 含首日', daysTogether('2024-01-01', '2024-01-01'), 1);
eq('daysTogether 第 100 天', daysTogether('2024-01-01', addDays('2024-01-01', 99)), 100);
eq('2024 年 2 月天数', daysOfThisMonth('2024-02-10'), 29);
eq('monthRange 2024-02', `${monthRange('2024-02').start}~${monthRange('2024-02').end}`, '2024-02-01~2024-02-29');
eq('weekStart 周一', weekStart('2024-05-15'), '2024-05-13');
eq('weekKey 形如 YYYY-Wnn', /^\d{4}-W\d{2}$/.test(weekKey('2024-05-15')), true);
eq('fmtDate 完整', fmtDate('2024-05-15', 'full'), '2024年5月15日 周三');
eq('nextAnniversary 返回天数', nextAnniversary('2023-06-01', '2024-05-20').days, 11);
eq('today 形状', /^\d{4}-\d{2}-\d{2}$/.test(today()), true);

// 往返一致性：农历 → 公历 → 农历（覆盖含闰月的年份）
let round = 0;
for (let y = 2020; y <= 2030; y++) {
  for (let m = 1; m <= 12; m++) {
    for (const d of [1, 15, 29]) {
      const solar = lunarToSolar(y, m, d);
      const back = solarToLunar(solar);
      if (back.month === m && back.day === d && !back.isLeap) round++;
      else {
        fails++;
        console.log(`FAIL 往返 ${y}-${m}-${d} -> ${solar} -> ${back.text}`);
      }
    }
  }
}
console.log(`ok   农历往返一致：${round}/396`);
eq('闰月年 2025 八月十五', lunarToSolar(2025, 8, 15), '2025-10-06');
eq('闰月年 2023 闰二月十五(平月取二月)', lunarToSolar(2023, 2, 15), '2023-03-06');

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
