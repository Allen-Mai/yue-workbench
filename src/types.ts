/* ==========================================================================
   types.ts · 全局类型契约（数据模型 + 模块接口）
   ========================================================================== */

export interface BaseRow {
  id: string;
  user_id: string;
  created_at: number;
  updated_at: number;
}

/* ------------------------------ 今日中枢 ------------------------------ */
export type TodoSource = 'manual' | 'plant' | 'reminder' | 'study';
export interface Todo extends BaseRow {
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm | ''
  done: boolean;
  done_at: number | null;
  source: TodoSource;
  source_ref: string; // 如 plantId / reminderId / 'en'|'fin'|'news'
  locked: boolean;
}

/* ------------------------------ 植物养护 ------------------------------ */
export type PlantCategory = 'hydro2' | 'hydro10' | 'soil';
export type PlantStatus = 'seed' | 'sprout' | 'growing' | 'flowering' | 'dormant';
export interface Plant extends BaseRow {
  name: string;
  category: PlantCategory;
  planted_at: string;
  status: PlantStatus;
  note: string;
}
export type PlantTag = '换水' | '浇水' | '施肥' | '修剪' | '观察';
export type PlantFeedback = '发芽' | '生长' | '开花' | '休眠' | '茂盛';
export interface PlantLog extends BaseRow {
  plant_id: string;
  date: string;
  text: string;
  tags: PlantTag[];
  feedback: PlantFeedback;
  photos: string[];
}

/* ------------------------------ 灵感补给站 ------------------------------ */
export type InspireKind = 'book' | 'quote' | 'movie' | 'knowledge' | 'beads' | 'words' | 'ielts';
export interface Inspiration extends BaseRow {
  kind: InspireKind;
  title: string;
  body: string;
  cover: string;
  source: string;
  url: string;
  tags: string[];
  favorite: boolean;
  /** 一句话摘要（雅思备考文章等长文用） */
  summary?: string;
}
export interface Quote extends BaseRow {
  text: string;
  author: string;
  source: string;
  tags: string[];
}

/* ------------------------------ 单词学习 ------------------------------ */
/** 雅思四类词汇用途（与 data/words/types.ts 保持一致） */
export type WordCategory = 'listening' | 'reading' | 'writing' | 'speaking';
/** 词库来源：通用词库 / 雅思词库 */
export type WordBook = 'general' | 'ielts';

export interface Word extends BaseRow {
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
  example_cn: string;
  date: string;
  stage: 'new' | 'review';
  learned: boolean;
  /** 雅思分类；通用词库为空 */
  category?: WordCategory | '';
  /** 所属词库 */
  book?: WordBook;
}
export interface WordLog extends BaseRow {
  word_id: string;
  date: string;
  correct: boolean;
  recording: boolean;
}

/* ------------------------------ 雅思课程 ------------------------------ */
export type LessonKind = 'listening' | 'reading' | 'writing' | 'speaking' | 'vocab' | 'grammar';

export interface Course extends BaseRow {
  slug: string;
  title: string;
  subtitle: string;
  desc: string;
  /** 基础 / 进阶 / 冲刺 */
  level: string;
  cover: string;
  order: number;
  tags: string[];
}

export interface LessonExercise {
  /** 题干 */
  q: string;
  options: string[];
  /** 正确选项下标（从 0 开始） */
  answer: number;
  /** 解析 */
  explain: string;
}

export interface Lesson extends BaseRow {
  course_id: string;
  unit_no: number;
  unit_title: string;
  title: string;
  kind: LessonKind;
  /** 预计用时（分钟） */
  minutes: number;
  /** 讲解正文，用 \n\n 分段 */
  body: string;
  /** 本课要点 */
  key_points: string[];
  exercises: LessonExercise[];
  order: number;
  done: boolean;
  /** 练习得分 0–100，未做为 0 */
  score: number;
  done_at: number | null;
}

/* ------------------------------ 原创听力练习 ------------------------------ */
export interface ListeningLineRow {
  /** 说话人标签：Narrator / Student / Tutor / Guide… */
  speaker: string;
  /** 英文原文（逐行朗读、逐行高亮） */
  text: string;
  /** 中文翻译 */
  cn?: string;
}

export interface ListeningQuestionRow {
  type: 'choice' | 'blank';
  q: string;
  options?: string[];
  /** choice：正确选项下标；blank：标准答案（英文小写） */
  answer: number | string;
  explain: string;
}

export interface ListeningRow extends BaseRow {
  slug: string;
  /** 1–4，对应雅思听力四个 Section */
  section: number;
  title: string;
  scene: string;
  level: string;
  minutes: number;
  lines: ListeningLineRow[];
  questions: ListeningQuestionRow[];
  vocab: Array<{ word: string; meaning: string }>;
  tips: string[];
  /* ---- 用户进度 ---- */
  /** 累计播放次数 */
  plays: number;
  /** 是否完成过答题（得分 ≥60） */
  done: boolean;
  score: number;
  done_at: number | null;
  /** 上次听到第几行（续听） */
  last_line: number;
}

/* ------------------------------ 财富工坊 ------------------------------ */
export type AccountKind = 'daily' | 'fixed' | 'income' | 'coin' | 'wish';
export interface Account extends BaseRow {
  kind: AccountKind;
  name: string;
  balance: number;
  quota: number;
  month: string;
}
export type TxKind = 'variable' | 'fixed' | 'income' | 'coin' | 'wish';
export interface Transaction extends BaseRow {
  kind: TxKind;
  amount: number;
  category: string;
  date: string;
  note: string;
  photos: string[];
}
export interface FixedItem extends BaseRow {
  name: string;
  amount: number;
  day: number;
  active: boolean;
  last_charged: string;
  skip_months: string[];
}
export interface ShoppingItem extends BaseRow {
  name: string;
  price: number;
  qty: number;
  date: string;
  status: 'pending' | 'bought';
  bought_at: number | null;
  /** 购买后自动记账时使用的支出类别（餐饮/交通/日用品…） */
  category?: string;
}
export interface Wish extends BaseRow {
  title: string;
  tier: 10 | 20 | 50 | 100;
  status: 'open' | 'done';
  date: string;
}
export interface GoldPrice extends BaseRow {
  date: string;
  intl: number;
  domestic: number;
  change: number;
  high: number;
  low: number;
}

/* ------------------------------ 时光胶囊 ------------------------------ */
export interface Couple extends BaseRow {
  start_date: string;
  title: string;
}
export interface CoupleLog extends BaseRow {
  date: string;
  text: string;
  photos: string[];
}
export interface Memo extends BaseRow {
  date: string;
  text: string;
  photos: string[];
}
/** 阅读记录（用于金币「已读满 4 篇」与成就统计） */
export interface ReadRow extends BaseRow {
  date: string;
  inspire_id: string;
  kind: string;
}

/* ------------------------------ 提醒中心 ------------------------------ */
export type ReminderType = 'birthday' | 'contact' | 'custom';
export interface Reminder extends BaseRow {
  type: ReminderType;
  title: string;
  calendar: 'solar' | 'lunar';
  date: string;
  advance: number;
  repeat: 'none' | 'yearly' | 'monthly' | 'weekly';
  time: string;
  contact: string;
  phone: string;
  note: string;
  done_dates: string[];
  /** 客户端计算并写回的下一次到期日（服务端 cron 用它推送） */
  next_due?: string;
}

/* ------------------------------ 成就 / 金币 ------------------------------ */
export type CoinKind = 'todo' | 'study' | 'save' | 'combo';
export interface Coin extends BaseRow {
  date: string;
  amount: number;
  kind: CoinKind;
  reason: string;
}
export interface AchievementRow extends BaseRow {
  key: string;
  unlocked_at: number;
}
export interface SettingRow extends BaseRow {
  key: string;
  value: unknown;
}
export interface PushSubRow extends BaseRow {
  endpoint: string;
  keys: Record<string, string>;
  ua: string;
}

/* ------------------------------ 本地书架（仅本机，永不上云/导出） ------------------------------ */
export interface BookChapterRow {
  title: string;
  text: string;
}

export interface BookRow extends BaseRow {
  title: string;
  author: string;
  format: 'epub' | 'txt' | 'md' | 'pdf';
  /** 封面 dataURL（可能为空） */
  cover: string;
  /** 已解析的章节（PDF 为空数组） */
  chapters: BookChapterRow[];
  /** 正文字符数 */
  chars: number;
  /** 原文件字节数 */
  size: number;
  /** PDF 等二进制格式的原始文件（Blob，仅本机保存） */
  file?: Blob;
  /* ---- 阅读进度 ---- */
  lastChapter: number;
  lastScroll: number;
  /** 0–100 */
  progress: number;
  opened: number;
  finished: boolean;
  /** 手动归属的书架名（默认「我的书架」） */
  shelf?: string;
}

/* ------------------------------ 我的听力音频（仅本机，永不上云/导出） ------------------------------ */
export interface AudioCueRow {
  /** 秒 */
  start: number;
  end: number;
  text: string;
}

export interface AudioRow extends BaseRow {
  title: string;
  /** 来源说明（用户自己填，如「正版新概念 第 1 册 Lesson 1」） */
  source: string;
  fileName: string;
  mime: string;
  size: number;
  /** 时长（秒），探测失败为 0 */
  duration: number;
  /** 音频原始文件（Blob，仅本机保存） */
  audio?: Blob;
  /** 字幕时间轴（SRT/VTT/带时间戳文本解析所得），可为空 */
  cues: AudioCueRow[];
  /** 纯文本原文（无时间轴时使用） */
  transcript: string;
  tags: string[];
  /* ---- 播放进度 ---- */
  /** 上次播放位置（秒） */
  lastPos: number;
  /** 上次倍速 */
  rate: number;
  plays: number;
  finished: boolean;
  /** A-B 复读区间（秒），0 表示未设置 */
  abStart: number;
  abEnd: number;
}

/* ------------------------------ 表名映射 ------------------------------ */
export interface TableMap {
  todos: Todo;
  plants: Plant;
  plant_logs: PlantLog;
  inspirations: Inspiration;
  quotes: Quote;
  words: Word;
  word_logs: WordLog;
  courses: Course;
  lessons: Lesson;
  listenings: ListeningRow;
  accounts: Account;
  transactions: Transaction;
  fixed_items: FixedItem;
  shopping: ShoppingItem;
  wishes: Wish;
  gold_prices: GoldPrice;
  couple: Couple;
  couple_logs: CoupleLog;
  memos: Memo;
  reads: ReadRow;
  reminders: Reminder;
  coins: Coin;
  achievements: AchievementRow;
  settings: SettingRow;
  push_subs: PushSubRow;
  books: BookRow;
  audios: AudioRow;
}
export type TableName = keyof TableMap;
export type RowOf<K extends TableName> = TableMap[K];

/* ------------------------------ 模块接口 ------------------------------ */
export interface ModuleCtx {
  /** 路由片段：#/<id>/<sub>/<param> —— params = [sub, param] */
  params: string[];
  sub: string;
  param: string;
  query: URLSearchParams;
  go(hash: string): void;
  refresh(module?: string): Promise<void>;
  /** 注册清理函数，模块切换时自动调用（清定时器、解绑事件） */
  onCleanup(fn: () => void): void;
  /** 顶栏标题/副标题控制 */
  setTitle(title: string, sub?: string): void;
  setBreadcrumb(items: Array<{ label: string; hash?: string }>): void;
}

export interface ModuleDef {
  id: string;
  title: string;
  icon: string;
  order: number;
  desc?: string;
  single?: boolean; // 不需要侧栏入口（二级页专用）
  render(el: HTMLElement, ctx: ModuleCtx): void | Promise<void>;
  onEnter?(ctx: ModuleCtx): void | Promise<void>;
  onLeave?(): void;
  badge?(): number;
}
