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
    this.settings.seeded = true;
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
