/* ==========================================================================
   data/listenings/index.ts · 原创听力练习汇总
   ========================================================================== */

import type { ListeningDef, ListeningPack, ListeningSection } from './types';
import { LISTENINGS_SECTION_1 } from './section1';
import { LISTENINGS_SECTION_2 } from './section2';
import { LISTENINGS_SECTION_3 } from './section3';
import { LISTENINGS_SECTION_4 } from './section4';

export const LISTENING_PACKS: ListeningPack[] = [
  { id: 's1', name: 'Section 1 · 生活场景对话', items: LISTENINGS_SECTION_1 },
  { id: 's2', name: 'Section 2 · 单人介绍与导览', items: LISTENINGS_SECTION_2 },
  { id: 's3', name: 'Section 3 · 学术讨论', items: LISTENINGS_SECTION_3 },
  { id: 's4', name: 'Section 4 · 学术讲座', items: LISTENINGS_SECTION_4 },
];

export const LISTENINGS: ListeningDef[] = LISTENING_PACKS
  .filter((p) => Array.isArray(p.items) && p.items.length)
  .flatMap((p, pi) => p.items.map((it, i) => ({
    ...it,
    slug: it.slug || `lo-s${pi + 1}-${i + 1}`,
  })));

export function bySection(section: ListeningSection): ListeningDef[] {
  return LISTENINGS.filter((l) => l.section === section);
}

/** 一段听力大约多少个英文词（用于估算时长） */
export function wordCount(item: ListeningDef): number {
  return (item.lines ?? []).reduce((s, l) => s + String(l.text ?? '').split(/\s+/).filter(Boolean).length, 0);
}

export type { ListeningDef, ListeningLine, ListeningPack, ListeningQuestion, ListeningSection } from './types';
export { SECTION_META } from './types';
