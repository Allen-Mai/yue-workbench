/* ==========================================================================
   data/listenings/types.ts · 原创听力练习数据契约（所有分片必须引用这里）
   ⚠️ 红线：全部内容必须是原创。严禁抄录、改写或复述剑桥雅思真题、
      官方指南、任何教材（含《新概念英语》）的原文与题目。
      场景与题型可以模仿雅思的「形式」，文字必须自己写。
   ========================================================================== */

/** 雅思听力四个 Section */
export type ListeningSection = 1 | 2 | 3 | 4;

export interface ListeningLine {
  /** 说话人标签：Narrator / Student / Tutor / Guide / Receptionist… */
  speaker: string;
  /** 英文原文（播放时逐行朗读，逐行高亮） */
  text: string;
  /** 中文翻译（可选，对原文理解有帮助） */
  cn?: string;
}

export type QuestionType = 'choice' | 'blank';

export interface ListeningQuestion {
  type: QuestionType;
  /** 题干（英文或中英混排均可，建议英文 + 必要中文提示） */
  q: string;
  /** choice 题的 4 个选项；blank 题留空 */
  options?: string[];
  /** choice：正确选项下标（0 起）；blank：标准答案（英文，短） */
  answer: number | string;
  /** 中文解析：为什么是这个答案，答案出现在原文哪里 */
  explain: string;
}

export interface ListeningDef {
  /** 唯一标识，小写英文短横线，全局唯一（建议 lo-s1- 开头） */
  slug: string;
  section: ListeningSection;
  /** 标题（中文，如「住宿咨询：学生宿舍申请」） */
  title: string;
  /** 场景一句话说明 */
  scene: string;
  /** 难度：基础 / 进阶 */
  level: string;
  /** 预计时长（分钟） */
  minutes: number;
  /** 原文：按说话人分行，每行 1–2 句（便于逐句精听与高亮） */
  lines: ListeningLine[];
  /** 题目：4–6 道 */
  questions: ListeningQuestion[];
  /** 考点词汇：4–8 个 */
  vocab: Array<{ word: string; meaning: string }>;
  /** 本段考点提示 / 做笔记技巧：2–4 条 */
  tips: string[];
}

export interface ListeningPack {
  id: string;
  name: string;
  items: ListeningDef[];
}

export const SECTION_META: Record<ListeningSection, { label: string; kind: string; speakers: string; icon: string }> = {
  1: { label: 'Section 1', kind: '生活场景对话', speakers: '两人对话', icon: 'speaker' },
  2: { label: 'Section 2', kind: '单人介绍 / 导览', speakers: '一人独白', icon: 'compass' },
  3: { label: 'Section 3', kind: '学术讨论', speakers: '两到三人', icon: 'book' },
  4: { label: 'Section 4', kind: '学术讲座', speakers: '一人独白', icon: 'news' },
};
