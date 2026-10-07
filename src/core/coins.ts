/* ==========================================================================
   core/coins.ts · 金币激励机制（无漏洞版）
   省钱：0元→0币 / 1–15元→2币 / 16–30元→1币 / ≥31元→0币，每周封顶 14 币
   组合技：晨间 +1 / 阅读 +0.5 / 记录 +0.5（各独立计算，无总封顶）
   ========================================================================== */

import * as db from './db';
import { store } from './store';
import { addDays, today, weekStart, ym, ymd } from './date';
import { coinPopup, Toast, Banner } from '../ui/components';
import type { Coin, CoinKind } from '../types';

export const WEEK_CAP = 14;
export const SAVE_TIERS: Array<{ max: number; coins: number; label: string }> = [
  { max: 0, coins: 0, label: '0 元' },
  { max: 15, coins: 2, label: '1–15 元' },
  { max: 30, coins: 1, label: '16–30 元' },
  { max: Infinity, coins: 0, label: '31 元以上' },
];

/** 按当日可变支出计算省钱金币（未封顶） */
export function saveCoinsFor(spend: number): number {
  const s = Math.max(0, Number(spend) || 0);
  for (const tier of SAVE_TIERS) {
    if (s <= tier.max) return tier.coins;
  }
  return 0;
}

export function dayVariableSpend(date = today()): number {
  return store
    .list('transactions')
    .filter((t) => t.kind === 'variable' && t.date === date)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function weekSaveCoins(date = today()): number {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return store
    .list('coins')
    .filter((c) => c.kind === 'save' && c.date >= start && c.date <= end)
    .reduce((s, c) => s + Number(c.amount || 0), 0);
}

export function coinsOn(date: string, kind?: CoinKind): number {
  return store
    .list('coins')
    .filter((c) => c.date === date && (!kind || c.kind === kind))
    .reduce((s, c) => s + Number(c.amount || 0), 0);
}

export function coinsBetween(start: string, end: string, kind?: CoinKind): number {
  return store
    .list('coins')
    .filter((c) => c.date >= start && c.date <= end && (!kind || c.kind === kind))
    .reduce((s, c) => s + Number(c.amount || 0), 0);
}

export function totalCoins(): number {
  return store.list('coins').reduce((s, c) => s + Number(c.amount || 0), 0);
}

export function hasCoin(date: string, reason: string): boolean {
  return store.list('coins').some((c) => c.date === date && c.reason === reason);
}

/** 发金币（幂等：同一天同一个 reason 只发一次） */
export async function award(kind: CoinKind, amount: number, reason: string, date = today(), silent = false): Promise<boolean> {
  if (amount <= 0) return false;
  if (hasCoin(date, reason)) return false;
  await db.put('coins', { kind, amount, reason, date } as Partial<Coin>);
  await store.refresh('coins');
  await store.adjustBalance('coin', amount);
  if (!silent) {
    Toast(`+${amount} 金币 · ${reason}`, 'coin');
    store.emit('coins', { amount, reason });
  }
  return true;
}

/* ------------------------------ 组合技判定 ------------------------------ */
export interface ComboState {
  todosAllDone: boolean;
  todosCount: number;
  studyDone: number;
  readCount: number;
  favoriteCount: number;
  hasDrawingLog: boolean;
}

export function comboState(date = today()): ComboState {
  const todos = store.list('todos').filter((t) => t.date === date);
  const studyKeys = ['en', 'fin', 'news'];
  const studyDone = todos.filter((t) => t.source === 'study' && studyKeys.includes(t.source_ref) && t.done).length;
  const todosAllDone = todos.length > 0 && todos.every((t) => t.done);
  const reads = store.list('reads').filter((r) => r.date === date);
  const readCount = reads.length;
  const favoriteCount = store.list('inspirations').filter((i) => i.favorite).length;
  const longLogs = [
    ...store.list('couple_logs').filter((l) => l.date === date),
    ...store.list('memos').filter((m) => m.date === date),
  ].some((l) => String(l.text ?? '').length >= 100 && (l.photos?.length ?? 0) > 0);
  return { todosAllDone, todosCount: todos.length, studyDone, readCount, favoriteCount, hasDrawingLog: longLogs };
}

export interface ComboDef {
  key: string;
  name: string;
  amount: number;
  desc: string;
  test: (s: ComboState) => boolean;
}

export const COMBOS: ComboDef[] = [
  { key: 'morning', name: '晨间套餐', amount: 1, desc: '待办全部完成 + 已读满 4 篇', test: (s) => s.todosAllDone && s.readCount >= 4 },
  { key: 'reading', name: '阅读套餐', amount: 0.5, desc: '已读满 4 篇 + 收藏 ≥ 1 条', test: (s) => s.readCount >= 4 && s.favoriteCount >= 1 },
  { key: 'record', name: '记录套餐', amount: 0.5, desc: '情侣日志/备忘录单次满 100 字 + 含插图', test: (s) => s.hasDrawingLog },
];

/* ------------------------------ 每日结算（幂等） ------------------------------ */
export async function settleDay(date = today(), silent = true): Promise<{ save: number; combos: string[]; capped: boolean }> {
  const s = comboState(date);
  const combos: string[] = [];

  // 省钱金币（受每周 14 币封顶约束）
  const spend = dayVariableSpend(date);
  let want = saveCoinsFor(spend);
  let capped = false;
  if (want > 0) {
    const used = weekSaveCoins(date);
    const remain = Math.max(0, WEEK_CAP - used);
    if (want > remain) {
      want = remain;
      capped = true;
    }
    if (want > 0) {
      const ok = await award('save', want, `当日可变支出 ${spend.toFixed(2)} 元`, date, silent);
      if (ok) combos.push('省钱奖励');
    }
  }

  for (const c of COMBOS) {
    if (!c.test(s)) continue;
    const ok = await award('combo', c.amount, c.name, date, silent);
    if (ok) combos.push(c.name);
  }

  return { save: want, combos, capped };
}

/** 金币里程碑庆祝：10 / 20 / 50 / 100 */
export async function checkPopups(force = false): Promise<void> {
  const total = totalCoins();
  const last = Number(store.setting('lastCoinPopup', 0));
  const milestones = [10, 20, 50, 100];
  const hit = milestones.filter((m) => total >= m && last < m).pop();
  if (!hit) return;
  if (!force && hit <= last) return;
  await store.setSetting('lastCoinPopup', hit);
  if (hit === 100) {
    coinPopup('恭喜！可以购买首饰啦！', `金币已达 ${total.toFixed(1)} 枚 · 去心愿清单挑一件吧 🌿`);
  } else {
    coinPopup(`金币满 ${hit}！`, `当前共 ${total.toFixed(1)} 枚 · 继续保持 🌱`);
  }
}

/** 金币明细：本周按类别统计 */
export async function weekDetail(date = today()): Promise<Record<CoinKind, number>> {
  const start = weekStart(date);
  const end = addDays(start, 6);
  const rows = store.list('coins').filter((c) => c.date >= start && c.date <= end);
  const out: Record<CoinKind, number> = { todo: 0, study: 0, save: 0, combo: 0 };
  for (const r of rows) out[r.kind] = (out[r.kind] ?? 0) + Number(r.amount || 0);
  return out;
}

/** 近 N 周金币走势 */
export function weeklyTrend(weeks = 7, ref = today()): Array<{ label: string; value: number }> {
  const out: Array<{ label: string; value: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(weekStart(ref), -7 * i);
    const end = addDays(start, 6);
    out.push({ label: `${start.slice(5)} 周`, value: coinsBetween(start, end) });
  }
  return out;
}

export async function grantTaskCoins(kind: CoinKind, amount: number, reason: string, date = today()): Promise<void> {
  await award(kind, amount, reason, date);
}

export const coins = {
  SAVE_TIERS, WEEK_CAP, COMBOS,
  saveCoinsFor, dayVariableSpend, weekSaveCoins, coinsOn, coinsBetween, totalCoins, hasCoin,
  award, settleDay, checkPopups, weekDetail, weeklyTrend, comboState, grantTaskCoins,
};

export type { Coin };
export { ym, ymd, Banner };
