/* ==========================================================================
   data/words/types.ts · 词库分片共用类型（所有语料分片必须引用这里）
   ========================================================================== */

/** 雅思四类词汇用途（用于单词学习页的分类筛选） */
export type WordCategory = 'listening' | 'reading' | 'writing' | 'speaking';

/**
 * 单词元组：[拼写, 国际音标, 中文释义, 原创英文例句, 精准中文翻译, 分类]
 * - 音标用英式 IPA，带斜杠，如 /əˈbændən/
 * - 释义必须带词性，如 "v. 放弃；抛弃"
 * - 例句必须原创（不得抄录词典/教材原句）
 */
export type WordTuple = [
  word: string,
  phonetic: string,
  meaning: string,
  example: string,
  exampleCn: string,
  category: WordCategory,
];

export interface WordPack {
  /** 分片标识，如 'listening-campus' */
  id: string;
  /** 分片名称，如「听力 · 校园与教育场景」 */
  name: string;
  words: WordTuple[];
}

export const WORD_CATEGORY_LABEL: Record<WordCategory, string> = {
  listening: '听力场景',
  reading: '阅读学术',
  writing: '写作高频',
  speaking: '口语高频',
};

export const WORD_CATEGORY_ICON: Record<WordCategory, string> = {
  listening: 'speaker',
  reading: 'book',
  writing: 'edit',
  speaking: 'mic',
};

export const WORD_CATEGORY_DESC: Record<WordCategory, string> = {
  listening: '听力 Section 1–4 高频场景词：校园、住宿、旅游、自然、讲座词汇',
  reading: '阅读学术词：自然科学、社会科学、人文历史类高频学术词汇',
  writing: '写作高分词：学术动词、图表描述、论证与逻辑连接表达',
  speaking: '口语高分词：观点表达、抽象形容、地道搭配与连接语',
};
