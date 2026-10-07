/* ==========================================================================
   core/plants.ts · 植物养护计算 + 与今日中枢待办的自动汇总
   ========================================================================== */

import * as db from './db';
import { store } from './store';
import { CATEGORY_META } from '../data/presets';
import { addDays, diffDays, today, ymd } from './date';
import type { Plant, PlantLog } from '../types';

export interface CareInfo {
  action: string;
  extra: string;
  cycle: number;
  lastDate: string;
  nextDate: string;
  daysLeft: number;
  due: boolean;
  overdue: boolean;
  label: string;
  countdownText: string;
  dueText: string;
}

export function logsOf(plantId: string): PlantLog[] {
  return store
    .list('plant_logs')
    .filter((l) => l.plant_id === plantId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created_at - a.created_at));
}

/** 基名（去掉「（2株）」这类括号说明，用于待办标题） */
export function baseName(name: string): string {
  return name.replace(/[（(].*?[)）]/g, '').trim();
}

/** 待办标题，如「观音竹换水(含营养液)」「土培茉莉浇水」 */
export function taskTitle(plant: Plant): string {
  const meta = CATEGORY_META[plant.category];
  return `${baseName(plant.name)}${meta.action}${meta.extra ? `(${meta.extra})` : ''}`;
}

export function careInfo(plant: Plant, ref = today()): CareInfo {
  const meta = CATEGORY_META[plant.category];
  const logs = logsOf(plant.id);
  const matched = logs.filter((l) => l.tags?.includes(meta.action as never));
  const lastDate = matched[0]?.date ?? plant.planted_at ?? ref;
  const nextDate = addDays(lastDate, meta.cycle);
  const daysLeft = diffDays(nextDate, ref);
  const due = daysLeft <= 0;
  return {
    action: meta.action,
    extra: meta.extra,
    cycle: meta.cycle,
    lastDate,
    nextDate,
    daysLeft,
    due,
    overdue: daysLeft < 0,
    label: meta.label,
    countdownText: due ? (daysLeft === 0 ? `今天要${meta.action}` : `已逾期 ${-daysLeft} 天`) : `距离下次${meta.action}还有 ${daysLeft} 天`,
    dueText: due ? `今天需${meta.action}` : `${daysLeft} 天后${meta.action}`,
  };
}

/** 今天是否已经记录过该养护动作 */
export function caredToday(plant: Plant, date = today()): boolean {
  const meta = CATEGORY_META[plant.category];
  return logsOf(plant.id).some((l) => l.date === date && l.tags?.includes(meta.action as never));
}

export function plantAge(plant: Plant, ref = today()): number {
  return Math.max(0, diffDays(ref, plant.planted_at));
}

export function latestPhoto(plant: Plant): string {
  const log = logsOf(plant.id).find((l) => (l.photos?.length ?? 0) > 0);
  return log?.photos?.[0] ?? '';
}

export function recordFrequency(plant: Plant): number {
  const logs = logsOf(plant.id);
  const age = Math.max(1, plantAge(plant) + 1);
  return logs.length / age;
}

/** 情绪价值反馈 */
export function emotionalFeedback(plant: Plant): string {
  const info = careInfo(plant);
  const last = logsOf(plant.id)[0];
  const gap = last ? diffDays(today(), last.date) : plantAge(plant);
  if (info.overdue) return `${baseName(plant.name)}有点蔫了，${-info.daysLeft} 天没${info.action}啦，快去照顾一下它吧～`;
  if (info.due) return `${baseName(plant.name)}今天需要${info.action}，你照顾得真及时！`;
  if (gap <= 1) return `${baseName(plant.name)}今天精神抖擞，你照顾得真好！`;
  if (gap <= 3) return `${baseName(plant.name)}安安静静地长着，记得常来看看它。`;
  return `${baseName(plant.name)}等你 ${gap} 天了，今天写一条记录吧～`;
}

/* ------------------------------ 与待办自动汇总 ------------------------------ */
/**
 * 把到期的植物养护任务汇总进今日待办（幂等）：
 * - 到期且今天未记录 → 创建/保持未完成待办
 * - 今天已经记录过 → 对应待办自动标记完成
 * - 不再到期的未完成待办 → 自动清理
 */
export async function syncPlantTodos(date = today()): Promise<{ created: number; completed: number; removed: number }> {
  const plants = store.list('plants');
  const todos = store.list('todos').filter((t) => t.source === 'plant' && t.date === date);
  let created = 0;
  let completed = 0;
  let removed = 0;

  for (const plant of plants) {
    const info = careInfo(plant, date);
    const existing = todos.find((t) => t.source_ref === plant.id);
    const title = taskTitle(plant);
    const doneToday = caredToday(plant, date);

    if (info.due || doneToday) {
      if (!existing) {
        await db.put('todos', {
          title,
          date,
          time: plant.category === 'soil' ? '08:00' : '',
          done: doneToday,
          done_at: doneToday ? Date.now() : null,
          source: 'plant',
          source_ref: plant.id,
          locked: false,
        });
        created++;
      } else if (doneToday && !existing.done) {
        await db.patch('todos', existing.id, { done: true, done_at: Date.now() });
        completed++;
      } else if (!doneToday && existing.done && existing.source_ref === plant.id && !caredToday(plant, date)) {
        // 用户从植物页撤销了记录：待办回到未完成
        await db.patch('todos', existing.id, { done: false, done_at: null });
      }
    } else if (existing && !existing.done) {
      await db.remove('todos', existing.id);
      removed++;
    }
  }

  if (created || completed || removed) await store.refresh('todos');
  return { created, completed, removed };
}

/** 记录一次养护并写日记 */
export async function addPlantLog(input: {
  plant_id: string;
  date: string;
  text: string;
  tags: string[];
  feedback: string;
  photos: string[];
}): Promise<void> {
  await store.save('plant_logs', {
    plant_id: input.plant_id,
    date: input.date,
    text: input.text,
    tags: input.tags as never,
    feedback: input.feedback as never,
    photos: input.photos,
  });
  await syncPlantTodos(input.date);
}

export function statusOf(plant: Plant): string {
  const logs = logsOf(plant.id);
  if (!logs.length) return plant.status;
  return logs[0].feedback || plant.status;
}

export function todayYmd(): string {
  return ymd();
}

export const plants = {
  logsOf, baseName, taskTitle, careInfo, caredToday, plantAge, latestPhoto,
  recordFrequency, emotionalFeedback, syncPlantTodos, addPlantLog, statusOf,
};
