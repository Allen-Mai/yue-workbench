/* ==========================================================================
   core/db.ts · IndexedDB 持久层（本地优先 · 永久保存 · 可挂接云端同步）
   - 所有表同构：id / user_id / created_at / updated_at
   - 写操作完成后触发 'change' 事件，UI 自动刷新
   - 通过 setRemote() 挂接 Supabase 适配器即可实现云端双向同步
   ========================================================================== */

import type { TableName, TableMap, RowOf, BaseRow } from '../types';
import { uid } from '../ui/dom';

export const DB_NAME = 'yue-workbench';
/** 版本历史：1 = 基础 21 张表；2 = 新增 courses / lessons（雅思课程）；
 *  3 = 新增 listenings（原创听力练习）；4 = 新增 books（本地书架，仅本机）。
 *  注意：每新增一张表都必须把这里 +1，否则老用户的库里没有新表，
 *  读取时会抛 NotFoundError。openDb() 里还有一层自愈兜底，双保险。 */
export const DB_VERSION = 4;
export const LOCAL_USER = 'local';

export const TABLES: TableName[] = [
  'todos', 'plants', 'plant_logs', 'inspirations', 'quotes',
  'words', 'word_logs', 'courses', 'lessons', 'listenings', 'accounts', 'transactions', 'fixed_items',
  'shopping', 'wishes', 'gold_prices', 'couple', 'couple_logs',
  'memos', 'reads', 'reminders', 'coins', 'achievements', 'settings', 'push_subs',
  'books',
];

/**
 * 仅保存在本机、**绝不上云、绝不导出**的表。
 * 本地书架里放的是用户自己导入的电子书（多为版权作品），
 * 上传到 Supabase 或写进导出文件都会造成版权内容外泄与体积爆炸。
 */
export const LOCAL_ONLY_TABLES = new Set<TableName>(['books']);

/** 带 date 字段、需要建索引的表 */
const DATE_TABLES = new Set<TableName>([
  'todos', 'plant_logs', 'words', 'word_logs', 'transactions',
  'shopping', 'wishes', 'gold_prices', 'couple_logs', 'memos', 'reads', 'reminders', 'coins',
]);

export interface RemoteAdapter {
  readonly name: string;
  put(table: TableName, row: BaseRow): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  replaceAll(table: TableName, rows: BaseRow[]): Promise<void>;
  pullAll(): Promise<Partial<Record<TableName, BaseRow[]>>>;
  uploadImage?(dataUrl: string, name: string): Promise<string>;
}

type ChangeOp = 'put' | 'remove' | 'bulk' | 'clear' | 'import';
export type ChangeHandler = (table: TableName, op: ChangeOp) => void;

const changeHandlers = new Set<ChangeHandler>();
let remote: RemoteAdapter | null = null;
let currentUser = LOCAL_USER;
let dbPromise: Promise<IDBDatabase> | null = null;

export function onDbChange(fn: ChangeHandler): () => void {
  changeHandlers.add(fn);
  return () => changeHandlers.delete(fn);
}

function fire(table: TableName, op: ChangeOp): void {
  for (const fn of Array.from(changeHandlers)) {
    try {
      fn(table, op);
    } catch (err) {
      console.error('[db] change handler error', err);
    }
  }
}

export function setRemote(adapter: RemoteAdapter | null): void {
  remote = adapter;
}

export function getRemote(): RemoteAdapter | null {
  return remote;
}

export function setUser(userId: string): void {
  currentUser = userId || LOCAL_USER;
}

export function currentUserId(): string {
  return currentUser;
}

/** 图片：配置云端后自动上传并返回 URL，否则原样返回 dataURL */
export async function persistImage(dataUrl: string, name = 'photo'): Promise<string> {
  if (remote?.uploadImage && /^data:/.test(dataUrl)) {
    try {
      return await remote.uploadImage(dataUrl, name);
    } catch (err) {
      console.warn('[db] 图片上传失败，回退为本地存储', err);
    }
  }
  return dataUrl;
}

/* ------------------------------ 打开数据库 ------------------------------ */
/** 建表（幂等）：升级时补齐所有缺失的 object store 与索引 */
function upgradeDb(db: IDBDatabase): void {
  for (const t of TABLES) {
    if (db.objectStoreNames.contains(t)) continue;
    const os = db.createObjectStore(t, { keyPath: 'id' });
    os.createIndex('created_at', 'created_at');
    os.createIndex('user_id', 'user_id');
    if (DATE_TABLES.has(t)) os.createIndex('date', 'date');
  }
}

function openAt(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => upgradeDb(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    req.onblocked = () => reject(new Error('本地数据库被其它标签页占用，请关闭本应用的其他标签页后刷新'));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = (async () => {
    if (typeof indexedDB === 'undefined') throw new Error('当前环境不支持 IndexedDB');
    let db = await openAt(DB_VERSION);
    db.onversionchange = () => db.close();
    // 自愈：若库里缺少任何一张表（忘记升版本 / 版本冲突），用更高版本重建缺失表
    const missing = TABLES.filter((t) => !db.objectStoreNames.contains(t));
    if (missing.length) {
      console.warn('[db] 缺少数据表，正在自愈升级：', missing.join(', '));
      const next = db.version + 1;
      db.close();
      db = await openAt(next);
      db.onversionchange = () => db.close();
    }
    return db;
  })();
  dbPromise = p;
  return p.catch((err) => {
    dbPromise = null; // 失败后允许重试
    throw err;
  });
}

export async function ready(): Promise<void> {
  await openDb();
}

function tx<T>(table: TableName, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(table, mode);
        const store = t.objectStore(table);
        let req: IDBRequest<T>;
        try {
          req = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ------------------------------ 基础读写 ------------------------------ */
function normalize<K extends TableName>(table: K, row: Partial<RowOf<K>>): RowOf<K> {
  const now = Date.now();
  const base = row as unknown as BaseRow;
  const out = {
    ...row,
    id: base.id || uid(`${table.slice(0, 3)}_`),
    user_id: base.user_id || currentUser,
    created_at: base.created_at || now,
    updated_at: now,
  } as unknown as RowOf<K>;
  return out;
}

export async function put<K extends TableName>(table: K, row: Partial<RowOf<K>>): Promise<RowOf<K>> {
  const full = normalize(table, row);
  await tx(table, 'readwrite', (s) => s.put(full) as IDBRequest<IDBValidKey>);
  fire(table, 'put');
  if (remote && !LOCAL_ONLY_TABLES.has(table)) {
    remote.put(table, full as unknown as BaseRow).catch((e) => console.warn('[db] 云端写入失败', table, e));
  }
  return full;
}

export async function bulkPut<K extends TableName>(
  table: K,
  rows: Array<Partial<RowOf<K>>>,
  opts: { sync?: boolean } = {},
): Promise<number> {
  if (!rows.length) return 0;
  const full = rows.map((r) => normalize(table, r));
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(table, 'readwrite');
    const store = t.objectStore(table);
    for (const r of full) store.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  fire(table, 'bulk');
  // 云端：整表一次性 upsert，避免 N 次请求（批量导入 1000+ 条时尤其重要）
  if (remote && opts.sync !== false && !LOCAL_ONLY_TABLES.has(table)) {
    remote.replaceAll(table, full as unknown as BaseRow[]).catch((e) => console.warn('[db] 云端批量写入失败', table, e));
  }
  return full.length;
}

export async function get<K extends TableName>(table: K, id: string): Promise<RowOf<K> | undefined> {
  const r = await tx<RowOf<K> | undefined>(table, 'readonly', (s) => s.get(id) as IDBRequest<RowOf<K> | undefined>);
  return r;
}

export async function all<K extends TableName>(table: K): Promise<Array<RowOf<K>>> {
  const rows = await tx<Array<RowOf<K>>>(table, 'readonly', (s) => s.getAll() as IDBRequest<Array<RowOf<K>>>);
  return (rows ?? []).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

export async function where<K extends TableName>(
  table: K,
  pred: (row: RowOf<K>) => boolean,
): Promise<Array<RowOf<K>>> {
  return (await all(table)).filter(pred);
}

export async function remove(table: TableName, id: string): Promise<void> {
  await tx(table, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
  fire(table, 'remove');
  if (remote && !LOCAL_ONLY_TABLES.has(table)) remote.remove(table, id).catch((e) => console.warn('[db] 云端删除失败', e));
}

export async function removeWhere<K extends TableName>(table: K, pred: (row: RowOf<K>) => boolean): Promise<number> {
  const rows = await where(table, pred);
  for (const r of rows) await remove(table, r.id);
  return rows.length;
}

export async function clear(table: TableName): Promise<void> {
  await tx(table, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
  fire(table, 'clear');
}

export async function count(table: TableName): Promise<number> {
  return tx<number>(table, 'readonly', (s) => s.count());
}

/** 单条局部更新（自动刷新 updated_at） */
export async function patch<K extends TableName>(table: K, id: string, changes: Partial<RowOf<K>>): Promise<RowOf<K> | undefined> {
  const cur = await get(table, id);
  if (!cur) return undefined;
  return put(table, { ...cur, ...changes, id } as Partial<RowOf<K>>);
}

/* ------------------------------ 导出 / 导入 ------------------------------ */
export type ExportPayload = {
  app: 'yue-workbench';
  version: number;
  exported_at: string;
  user_id: string;
  tables: Partial<Record<TableName, unknown[]>>;
};

export async function exportAll(): Promise<ExportPayload> {
  const tables: Partial<Record<TableName, unknown[]>> = {};
  for (const t of TABLES) {
    if (LOCAL_ONLY_TABLES.has(t)) continue; // 本地书架不导出（版权内容 + 体积过大）
    const rows = await all(t);
    if (rows.length) tables[t] = rows;
  }
  return {
    app: 'yue-workbench',
    version: DB_VERSION,
    exported_at: new Date().toISOString(),
    user_id: currentUser,
    tables,
  };
}

export async function importAll(
  payload: Partial<ExportPayload> | Partial<Record<TableName, unknown[]>>,
  mode: 'merge' | 'replace' = 'merge',
): Promise<{ tables: number; rows: number }> {
  const src = (payload as ExportPayload).tables ?? (payload as Partial<Record<TableName, unknown[]>>);
  let rowCount = 0;
  let tableCount = 0;
  for (const t of TABLES) {
    if (LOCAL_ONLY_TABLES.has(t)) continue; // 本地书架不参与导入
    const rows = src?.[t];
    if (!Array.isArray(rows) || !rows.length) continue;
    tableCount++;
    if (mode === 'replace') await clear(t);
    const clean = rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({ ...r, user_id: currentUser }));
    await bulkPut(t, clean as Array<Partial<RowOf<typeof t>>>, { sync: false });
    rowCount += clean.length;
  }
  if (remote) {
    for (const t of TABLES) {
      const rows = src?.[t];
      if (Array.isArray(rows) && rows.length) {
        remote.replaceAll(t, rows as BaseRow[]).catch((e) => console.warn('[db] 云端整表同步失败', t, e));
      }
    }
  }
  fire('settings', 'import');
  return { tables: tableCount, rows: rowCount };
}

/** 云端拉取并合并（云端较新则覆盖本地） */
export async function pullRemote(): Promise<number> {
  if (!remote) return 0;
  const data = await remote.pullAll();
  let n = 0;
  for (const t of TABLES) {
    const rows = data[t];
    if (!Array.isArray(rows) || !rows.length) continue;
    const localRows = await all(t);
    const map = new Map(localRows.map((r) => [r.id, r as unknown as BaseRow]));
    const toWrite: BaseRow[] = [];
    for (const r of rows as BaseRow[]) {
      const cur = map.get(r.id);
      if (!cur || (r.updated_at ?? 0) > (cur.updated_at ?? 0)) toWrite.push(r);
    }
    if (toWrite.length) {
      await bulkPut(t, toWrite as Array<Partial<RowOf<typeof t>>>);
      n += toWrite.length;
    }
  }
  if (n) fire('settings', 'import');
  return n;
}

/** 估算占用空间 */
export async function usage(): Promise<{ used: number; quota: number }> {
  try {
    const est = await navigator.storage?.estimate?.();
    return { used: est?.usage ?? 0, quota: est?.quota ?? 0 };
  } catch {
    return { used: 0, quota: 0 };
  }
}

export async function requestPersist(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export const db = {
  ready, put, bulkPut, get, all, where, remove, removeWhere, clear, count, patch,
  exportAll, importAll, pullRemote, usage, requestPersist, onDbChange, setRemote, setUser,
  persistImage, TABLES,
};

export type { TableMap, RowOf };
