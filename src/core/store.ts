/* ==========================================================================
   core/store.ts · 应用级状态（全表内存缓存 + 事件总线 + 外观应用）
   - 启动时把全部表读入内存，模块可同步读取（store.list('plants')）
   - 任何写操作后调用 store.refresh()，其它板块自动同步
   ========================================================================== */

import type { Account, AccountKind, BaseRow, TableName, TableMap, RowOf, Couple } from '../types';
import * as db from './db';
import { DEFAULT_SETTINGS, PRESET_FIXED_ITEMS, PRESET_INSPIRATIONS, PRESET_PLANTS, PRESET_QUOTES, PRESET_WORDS, DAILY_BASE } from '../data/presets';
import { daysOfThisMonth, today, ym } from './date';

export type StoreEvent = 'change' | 'route' | 'toast' | 'banner' | 'coins' | 'ready' | 'appearance' | 'cloud';
type Handler = (payload?: unknown) => void;

/** 当前语料内容版本：1 = 基础内容；2 = 雅思体系；3 = 原创听力练习库 */
export const CONTENT_VERSION = 3;

export interface ContentInstallResult {
  words: number;
  articles: number;
  courses: number;
  lessons: number;
  listenings: number;
  duplicates: number;
}

class Store {
  private cache = new Map<TableName, BaseRow[]>();
  private settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  private handlers = new Map<StoreEvent, Set<Handler>>();
  isReady = false;
  driveMode: 'local' | 'cloud' = 'local';
  cloudUser = '';

  /* ------------------------------ 生命周期 ------------------------------ */
  async init(): Promise<void> {
    await db.ready();
    await db.requestPersist();
    await this.reload();
    if (!this.settings.seeded) await this.seed();
    await this.reload();
    this.applyAppearance();
    this.isReady = true;
    this.emit('ready');
  }

  private async reload(): Promise<void> {
    const next = new Map<TableName, BaseRow[]>();
    for (const t of db.TABLES) next.set(t, (await db.all(t)) as unknown as BaseRow[]);
    this.cache = next;
    this.settings = { ...DEFAULT_SETTINGS };
    const sRows = (next.get('settings') ?? []) as unknown as Array<{ key: string; value: unknown }>;
    for (const r of sRows) this.settings[r.key] = r.value;
  }

  /* ------------------------------ 首次播种 ------------------------------ */
  private async seed(): Promise<void> {
    const t = today();
    const month = ym(t);
    const accounts: Array<Partial<Account>> = (['daily', 'fixed', 'income', 'coin', 'wish'] as AccountKind[]).map((kind) => ({
      kind,
      name: kind,
      balance: 0,
      quota: kind === 'daily' ? daysOfThisMonth(t) * DAILY_BASE : 0,
      month,
    }));
    await db.bulkPut('accounts', accounts);

    await db.bulkPut('plants', PRESET_PLANTS.map((p, i) => ({
      name: p.name, category: p.category, status: p.status, note: p.note,
      planted_at: t, created_at: Date.now() - (PRESET_PLANTS.length - i) * 1000,
    })));

    await db.bulkPut('words', PRESET_WORDS.map((w, i) => ({
      ...w, date: '', stage: 'new' as const, learned: false,
      book: 'general' as const, category: '' as const,
      created_at: Date.now() - (PRESET_WORDS.length - i) * 1000,
    })));

    await db.bulkPut('quotes', PRESET_QUOTES.map((q) => ({ ...q })));

    await db.bulkPut('inspirations', PRESET_INSPIRATIONS.map((it) => ({
      kind: it.kind, title: it.title, body: it.body, source: it.source,
      tags: it.tags, cover: '', url: it.url ?? '', favorite: false,
    })));

    await db.bulkPut('fixed_items', PRESET_FIXED_ITEMS.map((f) => ({
      name: f.name, amount: f.amount, day: f.day, active: false,
      last_charged: '', skip_months: [] as string[],
    })));

    await db.put('settings', { key: 'seeded', value: true, id: 'set_seeded' });
    await db.put('settings', { key: 'contentVersion', value: 1, id: 'set_contentVersion' });
    this.settings.seeded = true;
    this.settings.contentVersion = 1;
  }

  /* ------------------------------ 增量内容安装（雅思体系） ------------------------------ */
  /**
   * 语料按「内容版本」增量安装，不依赖首次播种：
   * - 老用户升级也会自动补上新增语料（幂等，确定性 id）
   * - 合并时**保留用户进度**（单词的 learned/date、文章的 favorite、课程的 done/score）
   * - 语料用动态 import，不进首屏包
   */
  async ensureContent(onProgress?: (msg: string) => void): Promise<ContentInstallResult | null> {
    const current = Number(this.setting('contentVersion', 1));
    if (current >= CONTENT_VERSION) return null;

    onProgress?.('正在安装雅思语料…');
    const [wordMod, articleMod, courseMod, listeningMod] = await Promise.all([
      import('../data/words'),
      import('../data/ielts-articles'),
      import('../data/courses'),
      import('../data/listenings'),
    ]);

    type Existing = { id: string; [k: string]: unknown };
    const merge = <T extends { id: string }, E extends Existing>(
      defs: T[],
      existing: E[],
      keep: (def: T, old: E | undefined) => Partial<T>,
    ): Array<T> => {
      const map = new Map(existing.map((e) => [e.id, e]));
      return defs.map((d) => ({ ...d, ...keep(d, map.get(d.id)) }));
    };

    // 1) 雅思核心词（保留已学状态与分配日期）
    onProgress?.('正在写入雅思核心词…');
    const wordId = (w: string) => `w_ielts_${w.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const oldWords = this.list('words') as unknown as Array<Existing & { id: string }>;
    const wordDefs = wordMod.IELTS_WORDS.map((t) => ({
      id: wordId(t[0]),
      word: t[0],
      phonetic: t[1],
      meaning: t[2],
      example: t[3],
      example_cn: t[4],
      category: t[5],
      book: 'ielts' as const,
      date: '',
      stage: 'new' as 'new' | 'review',
      learned: false,
    }));
    await db.bulkPut('words', merge(wordDefs, oldWords, (_d, old) => (old
      ? { date: old.date as string, stage: old.stage as 'new' | 'review', learned: Boolean(old.learned) }
      : {})));

    // 2) 雅思备考文章（并入灵感补给站，kind = 'ielts'；保留收藏状态）
    onProgress?.('正在整理雅思备考文章…');
    const oldInsp = this.list('inspirations') as unknown as Array<Existing & { id: string }>;
    const articleDefs = articleMod.IELTS_ARTICLES.map((a) => ({
      id: `insp_ielts_${a.slug}`,
      kind: 'ielts' as const,
      title: a.title,
      summary: a.summary,
      body: a.body,
      cover: '',
      source: '原创 · 雅思备考',
      url: '',
      tags: a.tags,
      favorite: false,
    }));
    await db.bulkPut('inspirations', merge(articleDefs, oldInsp, (_d, old) => (old ? { favorite: Boolean(old.favorite) } : {})));

    // 3) 课程与课（保留做题进度与得分）
    onProgress?.('正在建立雅思课程…');
    const oldLessons = this.list('lessons') as unknown as Array<Existing & { id: string }>;
    const courseDefs = courseMod.IELTS_COURSES.map((c) => ({
      id: `course_${c.slug}`,
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      desc: c.desc,
      level: c.level,
      cover: '',
      order: c.order,
      tags: c.tags,
    }));
    await db.bulkPut('courses', courseDefs);
    const lessonDefs = courseMod.IELTS_LESSONS.map((l) => ({
      id: `lesson_${l.slug}`,
      course_id: `course_${l.course}`,
      unit_no: l.unit_no,
      unit_title: l.unit_title,
      title: l.title,
      kind: l.kind,
      minutes: l.minutes,
      body: l.body,
      key_points: l.key_points,
      exercises: l.exercises,
      order: l.order,
      done: false,
      score: 0,
      done_at: null as number | null,
    }));
    await db.bulkPut('lessons', merge(lessonDefs, oldLessons, (_d, old) => (old
      ? { done: Boolean(old.done), score: Number(old.score ?? 0), done_at: (old.done_at ?? null) as number | null }
      : {})));

    // 4) 原创听力练习（保留播放次数、得分与续听位置）
    onProgress?.('正在整理听力练习库…');
    const oldListenings = this.list('listenings') as unknown as Array<Existing & { id: string }>;
    const listeningDefs = listeningMod.LISTENINGS.map((l) => ({
      id: `lo_${l.slug}`,
      slug: l.slug,
      section: l.section,
      title: l.title,
      scene: l.scene,
      level: l.level,
      minutes: l.minutes,
      lines: l.lines,
      questions: l.questions,
      vocab: l.vocab,
      tips: l.tips,
      plays: 0,
      done: false,
      score: 0,
      done_at: null as number | null,
      last_line: 0,
    }));
    await db.bulkPut('listenings', merge(listeningDefs, oldListenings, (_d, old) => (old
      ? {
        plays: Number(old.plays ?? 0),
        done: Boolean(old.done),
        score: Number(old.score ?? 0),
        done_at: (old.done_at ?? null) as number | null,
        last_line: Number(old.last_line ?? 0),
      }
      : {})));

    await this.setSetting('contentVersion', CONTENT_VERSION);
    await this.refresh();
    return {
      words: wordDefs.length,
      articles: articleDefs.length,
      courses: courseDefs.length,
      lessons: lessonDefs.length,
      listenings: listeningDefs.length,
      duplicates: wordMod.IELTS_WORD_DUPLICATES.length,
    };
  }

  /* ------------------------------ 读 ------------------------------ */
  list<K extends TableName>(table: K): Array<RowOf<K>> {
    return (this.cache.get(table) ?? []) as unknown as Array<RowOf<K>>;
  }

  find<K extends TableName>(table: K, pred: (row: RowOf<K>) => boolean): Array<RowOf<K>> {
    return this.list(table).filter(pred);
  }

  one<K extends TableName>(table: K, pred: (row: RowOf<K>) => boolean): RowOf<K> | undefined {
    return this.list(table).find(pred);
  }

  byId<K extends TableName>(table: K, id: string): RowOf<K> | undefined {
    return this.list(table).find((r) => r.id === id);
  }

  get<K extends TableName>(table: K): Array<RowOf<K>> {
    return this.list(table);
  }

  count(table: TableName): number {
    return this.list(table).length;
  }

  /* ------------------------------ 写 ------------------------------ */
  async save<K extends TableName>(table: K, row: Partial<RowOf<K>>): Promise<RowOf<K>> {
    const saved = await db.put(table, row);
    await this.refresh(table);
    return saved;
  }

  async saveMany<K extends TableName>(table: K, rows: Array<Partial<RowOf<K>>>): Promise<void> {
    await db.bulkPut(table, rows);
    await this.refresh(table);
  }

  async drop(table: TableName, id: string): Promise<void> {
    await db.remove(table, id);
    await this.refresh(table);
  }

  async patch<K extends TableName>(table: K, id: string, changes: Partial<RowOf<K>>): Promise<void> {
    await db.patch(table, id, changes);
    await this.refresh(table);
  }

  /** 重新载入并广播（可指定表名，仅用于日志语义） */
  async refresh(table?: TableName, silent = false): Promise<void> {
    const next = new Map<TableName, BaseRow[]>();
    if (table) {
      const rows = (await db.all(table)) as unknown as BaseRow[];
      next.set(table, rows);
      for (const [k, v] of this.cache) if (k !== table) next.set(k, v);
      this.cache = next;
      if (table === 'settings') {
        this.settings = { ...DEFAULT_SETTINGS };
        for (const r of next.get('settings') as unknown as Array<{ key: string; value: unknown }>) this.settings[r.key] = r.value;
      }
    } else {
      await this.reload();
    }
    if (!silent) this.emit('change', table ?? '*');
  }

  /* ------------------------------ 设置 ------------------------------ */
  setting<T = unknown>(key: string, fallback?: T): T {
    const v = this.settings[key];
    return (v === undefined || v === null ? (fallback as T) : (v as T));
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    this.settings[key] = value;
    await db.put('settings', { key, value, id: `set_${key}` });
    this.applyAppearance();
    await this.refresh('settings', true);
    this.emit('change', 'settings');
  }

  allSettings(): Record<string, unknown> {
    return { ...this.settings };
  }

  /* ------------------------------ 账户 ------------------------------ */
  account(kind: AccountKind): RowOf<'accounts'> | undefined {
    return this.one('accounts', (a) => a.kind === kind);
  }

  accounts(): Array<RowOf<'accounts'>> {
    const order: AccountKind[] = ['daily', 'fixed', 'income', 'coin', 'wish'];
    return order
      .map((k) => this.account(k))
      .filter((a): a is RowOf<'accounts'> => !!a);
  }

  /** 日常账户：月初重置额度 */
  async ensureMonth(): Promise<void> {
    const month = ym(today());
    const daily = this.account('daily');
    if (!daily) return;
    if (daily.month !== month) {
      await db.patch('accounts', daily.id, { month, quota: daysOfThisMonth(today()) * DAILY_BASE, balance: 0 });
      await this.refresh('accounts');
    }
  }

  async adjustBalance(kind: AccountKind, delta: number): Promise<void> {
    const acc = this.account(kind);
    if (!acc) return;
    await db.patch('accounts', acc.id, { balance: Number((acc.balance + delta).toFixed(2)) });
    await this.refresh('accounts');
  }

  couple(): Couple | undefined {
    const row = this.list('couple')[0] as unknown as Couple | undefined;
    return row;
  }

  /* ------------------------------ 外观 ------------------------------ */
  applyAppearance(): void {
    const root = document.documentElement;
    root.dataset.eye = String(this.setting('eye', 'soft'));
    root.dataset.fs = String(this.setting('fontSize', 'm'));
    root.dataset.round = String(this.setting('round', 'soft'));
    root.dataset.motion = String(this.setting('motion', 'on'));
    const theme = String(this.setting('theme', 'day'));
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'night' ? '#1A3C2A' : '#1A3C2A');
    this.emit('appearance');
  }

  /* ------------------------------ 事件 ------------------------------ */
  on(evt: StoreEvent, fn: Handler): () => void {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt)!.add(fn);
    return () => this.handlers.get(evt)?.delete(fn);
  }

  emit(evt: StoreEvent, payload?: unknown): void {
    for (const fn of Array.from(this.handlers.get(evt) ?? [])) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[store] handler error @${evt}`, err);
      }
    }
  }

  /* ------------------------------ 云端 ------------------------------ */
  async enableCloud(adapter: db.RemoteAdapter, uid: string): Promise<void> {
    db.setUser(uid);
    db.setRemote(adapter);
    this.driveMode = 'cloud';
    this.cloudUser = uid;
    this.emit('cloud', { mode: 'cloud' });
  }

  async syncDown(): Promise<number> {
    if (this.driveMode !== 'cloud') return 0;
    const n = await db.pullRemote();
    if (n) await this.refresh();
    return n;
  }

  get data() {
    return this.cache as ReadonlyMap<TableName, BaseRow[]>;
  }
}

export const store = new Store();
export type { TableMap };
