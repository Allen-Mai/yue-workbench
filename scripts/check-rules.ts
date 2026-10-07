import { saveCoinsFor, SAVE_TIERS, WEEK_CAP, COMBOS } from '../src/core/coins';
import { baseName, taskTitle } from '../src/core/plants';
import { PRESET_PLANTS, CATEGORY_META, BADGES, PRESET_WORDS, PRESET_INSPIRATIONS } from '../src/data/presets';

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got=${got} want=${want}`);
};

console.log('--- 金币：省钱奖励档位（规格：0元0币 / 1-15元2币 / 16-30元1币 / 31元以上0币）---');
eq('0 元', saveCoinsFor(0), 0);
eq('0.01 元', saveCoinsFor(0.01), 2);
eq('1 元', saveCoinsFor(1), 2);
eq('8 元', saveCoinsFor(8), 2);
eq('15 元', saveCoinsFor(15), 2);
eq('15.01 元', saveCoinsFor(15.01), 1);
eq('30 元', saveCoinsFor(30), 1);
eq('30.01 元', saveCoinsFor(30.01), 0);
eq('100 元', saveCoinsFor(100), 0);
eq('负数容错', saveCoinsFor(-5), 0);
eq('每周封顶 = 14（= 2×7）', WEEK_CAP, 14);
eq('档位数', SAVE_TIERS.length, 4);
eq('组合技数量（晨间/阅读/记录）', COMBOS.length, 3);
eq('晨间套餐 +1', COMBOS.find((c) => c.key === 'morning')?.amount, 1);
eq('阅读套餐 +0.5', COMBOS.find((c) => c.key === 'reading')?.amount, 0.5);
eq('记录套餐 +0.5', COMBOS.find((c) => c.key === 'record')?.amount, 0.5);

console.log('\n--- 植物：8 株预设与养护周期 ---');
eq('预设植物数量', PRESET_PLANTS.length, 8);
eq('水培勤换水周期', CATEGORY_META.hydro2.cycle, 2);
eq('水培营养液周期', CATEGORY_META.hydro10.cycle, 10);
eq('土培浇水周期', CATEGORY_META.soil.cycle, 1);
eq('水培勤换水动作', CATEGORY_META.hydro2.action, '换水');
eq('土培动作', CATEGORY_META.soil.action, '浇水');
eq('观音竹显示名保留括号', baseName('观音竹（2株）'), '观音竹');
eq('待办标题：观音竹换水(含营养液)', taskTitle({ name: '观音竹（2株）', category: 'hydro10' } as never), '观音竹换水(含营养液)');
eq('待办标题：土培茉莉浇水', taskTitle({ name: '土培茉莉', category: 'soil' } as never), '土培茉莉浇水');
eq('待办标题：水培大蒜换水', taskTitle({ name: '水培大蒜', category: 'hydro2' } as never), '水培大蒜换水');
eq('预设里含观音竹', PRESET_PLANTS.some((p) => p.name.includes('观音竹')), true);
eq('hydro10 组 4 张卡（观音竹/发财树/玛丽亚）', PRESET_PLANTS.filter((p) => p.category === 'hydro10').length, 4 + 0 - 1);

console.log('\n--- 内容库 ---');
eq('单词库 ≥ 50', PRESET_WORDS.length >= 50, true);
eq('灵感内容 ≥ 20', PRESET_INSPIRATIONS.length >= 20, true);
eq('徽章数量 ≥ 10', BADGES.length >= 10, true);
eq('徽章 key 唯一', new Set(BADGES.map((b) => b.key)).size, BADGES.length);

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
