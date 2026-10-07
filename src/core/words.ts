/* ==========================================================================
   core/words.ts · 单词学习计划（每日 5 个新词 + 复习前日 5 个词）
   ========================================================================== */

import * as db from './db';
import { store } from './store';
import { addDays, today } from './date';
import type { Word } from '../types';

export interface WordPlan {
  date: string;
  fresh: Word[];
  review: Word[];
}

const NEW_PER_DAY = 5;

function assignedWords(): Word[] {
  return store.list('words').slice().sort((a, b) => a.created_at - b.created_at);
}

/** 读取某天的计划（不写库） */
export function planFor(date = today()): WordPlan {
  const words = assignedWords();
  const fresh = words.filter((w) => w.date === date);
  const prevDates = Array.from(new Set(words.map((w) => w.date).filter((d) => d && d < date))).sort();
  const prev = prevDates[prevDates.length - 1];
  const review = prev ? words.filter((w) => w.date === prev) : [];
  return { date, fresh, review: review.slice(0, NEW_PER_DAY) };
}

/** 确保当天有 5 个新词（首次进入时分配），返回计划 */
export async function ensurePlan(date = today()): Promise<WordPlan> {
  const words = assignedWords();
  const todayWords = words.filter((w) => w.date === date);
  if (todayWords.length >= NEW_PER_DAY) return planFor(date);

  const pool = words.filter((w) => !w.date);
  if (!pool.length) return planFor(date);

  const need = NEW_PER_DAY - todayWords.length;
  const pick = pool.slice(0, need);
  for (const w of pick) {
    await db.patch('words', w.id, { date, stage: 'new' });
  }
  await store.refresh('words');

  // 复习词兜底：若前一天没有词，则从上一次分配的词里取 5 个
  const plan = planFor(date);
  if (!plan.review.length) {
    const previous = words.filter((w) => w.date && w.date < date).slice(-NEW_PER_DAY);
    return { date, fresh: plan.fresh, review: previous };
  }
  return plan;
}

/** 标记学习结果（可选录音对比） */
export async function markWord(wordId: string, correct: boolean, recording = false, date = today()): Promise<void> {
  await store.save('word_logs', { word_id: wordId, date, correct, recording });
  const w = store.byId('words', wordId);
  if (w) await db.patch('words', wordId, { learned: correct || w.learned });
  await store.refresh('words');
}

export function wordLogs(date = today()): ReturnType<typeof store.list<'word_logs'>> {
  return store.list('word_logs').filter((l) => l.date === date);
}

export function progress(date = today()): { done: number; total: number } {
  const plan = planFor(date);
  const logs = wordLogs(date);
  const ids = new Set(logs.map((l) => l.word_id));
  const total = plan.fresh.length + plan.review.length;
  const done = [...plan.fresh, ...plan.review].filter((w) => ids.has(w.id)).length;
  return { done, total };
}

/** 昨日复习词（供今日中枢展示） */
export function yesterdayWords(date = today()): Word[] {
  return assignedWords().filter((w) => w.date === addDays(date, -1));
}

export const words = { planFor, ensurePlan, markWord, wordLogs, progress, yesterdayWords, NEW_PER_DAY };
