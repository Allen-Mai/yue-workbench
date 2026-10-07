/* ==========================================================================
   data/words/index.ts · 雅思词库汇总（分片 → 去重 → 统一导出）
   分片文件由内容生产流程生成，这里负责合并、去重与统计。
   ========================================================================== */

import type { WordCategory, WordPack, WordTuple } from './types';
import { WORDS_PART_1 } from './part1';
import { WORDS_PART_2 } from './part2';
import { WORDS_PART_3 } from './part3';
import { WORDS_PART_4 } from './part4';
import { WORDS_PART_5 } from './part5';
import { WORDS_PART_6 } from './part6';
import { WORDS_PART_7 } from './part7';
import { WORDS_PART_8 } from './part8';

export const IELTS_WORD_PACKS: WordPack[] = [
  { id: 'listening-campus', name: '听力 · 校园与教育场景', words: WORDS_PART_1 },
  { id: 'listening-life', name: '听力 · 自然与生活服务场景', words: WORDS_PART_2 },
  { id: 'reading-science', name: '阅读 · 自然科学与科技', words: WORDS_PART_3 },
  { id: 'reading-social', name: '阅读 · 社会科学与人文历史', words: WORDS_PART_4 },
  { id: 'writing-academic', name: '写作 · 学术动词与名词', words: WORDS_PART_5 },
  { id: 'writing-task', name: '写作 · 图表描述与论证衔接', words: WORDS_PART_6 },
  { id: 'speaking-high', name: '口语 · 高分表达与地道搭配', words: WORDS_PART_7 },
  { id: 'supplement', name: '补充 · 四类均衡补足', words: WORDS_PART_8 },
];

/** 去重：同一个词只保留第一次出现的条目 */
export function dedupeWords(packs: WordPack[]): { words: WordTuple[]; duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const words: WordTuple[] = [];
  for (const pack of packs) {
    for (const tuple of pack.words) {
      const key = String(tuple[0] ?? '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        duplicates.push(key);
        continue;
      }
      seen.add(key);
      words.push(tuple);
    }
  }
  return { words, duplicates };
}

/** 防御：某个分片缺失或为空时不让整个应用挂掉 */
function validPacks(): WordPack[] {
  return IELTS_WORD_PACKS.filter((p) => Array.isArray(p.words) && p.words.length > 0);
}

const deduped = dedupeWords(validPacks());

/** 全部雅思核心词（已去重） */
export const IELTS_WORDS: WordTuple[] = deduped.words;

export const IELTS_WORD_DUPLICATES: string[] = deduped.duplicates;

/** 分类计数，用于页面统计与筛选提示 */
export function countByCategory(words: WordTuple[] = IELTS_WORDS): Record<WordCategory, number> {
  const out: Record<WordCategory, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  for (const w of words) {
    const c = w[5] as WordCategory;
    if (c in out) out[c] += 1;
  }
  return out;
}

export type { WordCategory, WordPack, WordTuple } from './types';
export { WORD_CATEGORY_LABEL, WORD_CATEGORY_ICON, WORD_CATEGORY_DESC } from './types';
