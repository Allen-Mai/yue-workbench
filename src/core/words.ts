/* ==========================================================================
   core/words.ts · 单词学习计划（每日 5 个新词 + 复习前日 5 个词）
   支持按「词库来源（通用 / 雅思）」与「雅思四类用途」筛选
   ========================================================================== */

import * as db from './db';
import { store } from './store';
import { addDays, today } from './date';
import type { Word, WordBook, WordCategory } from '../types';

export interface WordPlan {
  date: string;
  fresh: Word[];
  review: Word[];
}

export interface WordFilter {
  book: WordBook | 'all';
  category: WordCategory | 'all';
}

export const DEFAULT_FILTER: WordFilter = { book: 'ielts', category: 'all' };

/** 读取当前筛选（来自设置，可在单词学习页切换） */
export function currentFilter(): WordFilter {
  const book = String(store.setting('wordBook', DEFAULT_FILTER.book)) as WordFilter['book'];
  const category = String(store.setting('wordCategory', DEFAULT_FILTER.category)) as WordFilter['category'];
  return { book, category };
}

export function matchesFilter(w: Word, f: WordFilter = currentFilter()): boolean {
  const book = (w.book ?? 'general') as WordBook;
  if (f.book !== 'all' && book !== f.book) return false;
  if (f.category !== 'all' && (w.category ?? '') !== f.category) return false;
  return true;
}

/** 按创建顺序排列的全部单词 */
function allWords(): Word[] {
  return store.list('words').slice().sort((a, b) => a.created_at - b.created_at);
}

/** 命中筛选的全部单词 */
export function filteredWords(f: WordFilter = currentFilter()): Word[] {
  return allWords().filter((w) => matchesFilter(w, f));
}

export function wordsPerDay(): number {
  const n = Number(store.setting('wordsPerDay', 5));
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.round(n)) : 5;
}

/** 词库统计（用于页面展示：各分类有多少词、已学多少） */
export interface WordStats {
  total: number;
  general: number;
  ielts: number;
  byCategory: Record<WordCategory, number>;
  learned: number;
  assignedToday: number;
}

export function stats(f: WordFilter = currentFilter()): WordStats {
  const all = allWords();
  const byCategory: Record<WordCategory, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  for (const w of all) {
    if (w.book !== 'ielts') continue;
    const c = w.category as WordCategory;
    if (c && c in byCategory) byCategory[c] += 1;
  }
  const hit = all.filter((w) => matchesFilter(w, f));
  return {
    total: all.length,
    general: all.filter((w) => (w.book ?? 'general') === 'general').length,
    ielts: all.filter((w) => w.book === 'ielts').length,
    byCategory,
    learned: hit.filter((w) => w.learned).length,
    assignedToday: hit.filter((w) => w.date === today()).length,
  };
}

/** 读取某天的计划（不写库） */
export function planFor(date = today(), f: WordFilter = currentFilter()): WordPlan {
  const words = filteredWords(f);
  const perDay = wordsPerDay();
  const fresh = words.filter((w) => w.date === date);
  const prevDates = Array.from(new Set(words.map((w) => w.date).filter((d) => d && d < date))).sort();
  const prev = prevDates[prevDates.length - 1];
  const review = prev ? words.filter((w) => w.date === prev) : [];
  return { date, fresh, review: review.slice(0, perDay) };
}

/** 确保当天有 N 个新词（首次进入时分配），返回计划 */
export async function ensurePlan(date = today(), f: WordFilter = currentFilter()): Promise<WordPlan> {
  const perDay = wordsPerDay();
  const words = filteredWords(f);
  const todayWords = words.filter((w) => w.date === date);
  if (todayWords.length >= perDay) return planFor(date, f);

  const pool = words.filter((w) => !w.date);
  if (!pool.length) return planFor(date, f);

  const need = perDay - todayWords.length;
  for (const w of pool.slice(0, need)) {
    await db.patch('words', w.id, { date, stage: 'new' });
  }
  await store.refresh('words');

  const plan = planFor(date, f);
  if (!plan.review.length) {
    const previous = words.filter((w) => w.date && w.date < date).slice(-perDay);
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

export function progress(date = today(), f: WordFilter = currentFilter()): { done: number; total: number } {
  const plan = planFor(date, f);
  const logs = wordLogs(date);
  const ids = new Set(logs.map((l) => l.word_id));
  const total = plan.fresh.length + plan.review.length;
  const done = [...plan.fresh, ...plan.review].filter((w) => ids.has(w.id)).length;
  return { done, total };
}

/** 昨日复习词（供今日中枢展示） */
export function yesterdayWords(date = today()): Word[] {
  return allWords().filter((w) => w.date === addDays(date, -1));
}

/** 清空全部分配（重新开始计划） */
export async function resetAssignment(): Promise<number> {
  const all = allWords();
  for (const w of all) await db.patch('words', w.id, { date: '', stage: 'new' });
  await store.refresh('words');
  return all.length;
}

export const words = {
  DEFAULT_FILTER, currentFilter, matchesFilter, filteredWords, stats, planFor,
  ensurePlan, markWord, wordLogs, progress, yesterdayWords, resetAssignment, wordsPerDay,
};
