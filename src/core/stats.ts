/* ==========================================================================
   core/stats.ts · 成就统计 + 徽章判定
   ========================================================================== */

import { store } from './store';
import { addDays, daysTogether, diffDays, today, weekStart } from './date';
import { BADGES, DAILY_BASE, type BadgeStats } from '../data/presets';
import { Banner } from '../ui/components';
import { totalCoins, dayVariableSpend } from './coins';

/** 某天是否「全勤」：当日 3 项学习全部完成，且当日待办（若有）全部完成 */
export function isFullDay(date: string): boolean {
  const todos = store.list('todos').filter((t) => t.date === date);
  const study = todos.filter((t) => t.source === 'study' && t.done).length;
  if (study < 3 && todos.filter((t) => t.source === 'study').length < 3) return false;
  const real = todos.filter((t) => t.source !== 'study');
  return real.every((t) => t.done);
}

/** 连续全勤天数 */
export function streak(): number {
  let n = 0;
  let cursor = today();
  for (let i = 0; i < 400; i++) {
    if (isFullDay(cursor)) n++;
    else if (i === 0) {
      // 今天还没做完不算断
    } else break;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** 累计省钱（按每日可变支出低于 50 元的部分累加） */
export function savedTotal(): number {
  const days = new Set(store.list('transactions').filter((t) => t.kind === 'variable').map((t) => t.date));
  let sum = 0;
  for (const d of days) sum += Math.max(0, DAILY_BASE - dayVariableSpend(d));
  return Math.round(sum);
}

export function computeStats(): BadgeStats {
  const reads = store.count('reads');
  const plantDays = new Set(store.list('plant_logs').map((l) => l.date)).size;
  const couple = store.couple();
  return {
    streak: streak(),
    readCount: reads,
    savedTotal: savedTotal(),
    plantDays,
    coinsTotal: totalCoins(),
    coupleDays: couple?.start_date ? daysTogether(couple.start_date) : 0,
  };
}

export function unlockedKeys(): string[] {
  return store.list('achievements').map((a) => a.key);
}

export interface UnlockedBadge { key: string; name: string; desc: string; icon: string }

/** 检查并解锁新徽章（返回新解锁列表） */
export async function checkAchievements(announce = true): Promise<UnlockedBadge[]> {
  const stats = computeStats();
  const have = new Set(unlockedKeys());
  const news: UnlockedBadge[] = [];
  for (const b of BADGES) {
    if (have.has(b.key)) continue;
    let ok = false;
    try {
      ok = b.check(stats);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    await store.save('achievements', { key: b.key, unlocked_at: Date.now() });
    news.push({ key: b.key, name: b.name, desc: b.desc, icon: b.icon });
  }
  if (news.length && announce) {
    for (const b of news) {
      Banner({ title: `🏅 解锁成就：${b.name}`, text: b.desc, tone: 'coin', icon: b.icon, ms: 7000 });
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  return news;
}

/** 本周金币明细（按类别） */
export function weekCoinBreakdown(): Array<{ label: string; value: number }> {
  const start = weekStart(today());
  const end = addDays(start, 6);
  const rows = store.list('coins').filter((c) => c.date >= start && c.date <= end);
  const map: Record<string, number> = { todo: 0, study: 0, save: 0, combo: 0 };
  for (const r of rows) map[r.kind] = (map[r.kind] ?? 0) + Number(r.amount || 0);
  return [
    { label: '待办', value: map.todo },
    { label: '学习', value: map.study },
    { label: '省钱', value: map.save },
    { label: '组合技', value: map.combo },
  ];
}

/** 近 N 天的完成情况（热力图） */
export function activityDays(days = 28): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today(), -i);
    const todos = store.list('todos').filter((t) => t.date === d);
    const done = todos.filter((t) => t.done).length;
    const logs = store.list('plant_logs').filter((l) => l.date === d).length;
    const reads = store.list('reads').filter((r) => r.date === d).length;
    out.push({ date: d, value: done + logs + reads });
  }
  return out;
}

/** 记录条数（用于成就卡片） */
export function recordCount(): number {
  return (
    store.count('plant_logs') + store.count('couple_logs') + store.count('memos') +
    store.count('todos') + store.count('transactions') + store.count('shopping')
  );
}

export function sinceDays(date: string): number {
  return diffDays(today(), date);
}
