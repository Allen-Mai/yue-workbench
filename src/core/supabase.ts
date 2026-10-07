/* ==========================================================================
   core/supabase.ts · 零依赖 Supabase 适配器（PostgREST + Auth + Storage）
   未配置环境变量时完全不加载，应用以纯本地模式运行。
   Vercel 环境变量：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
   ========================================================================== */

import type { BaseRow, TableName } from '../types';
import { TABLES, type RemoteAdapter } from './db';

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const SUPABASE_URL = (ENV.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
export const BUCKET = 'workbench';

export function configured(): boolean {
  return /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

const SESSION_KEY = 'ywb.session';

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s?.access_token ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

let session: Session | null = readSession();
const authListeners = new Set<(s: Session | null) => void>();

export function onAuth(fn: (s: Session | null) => void): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

function setSession(s: Session | null): void {
  session = s;
  writeSession(s);
  for (const fn of Array.from(authListeners)) {
    try {
      fn(s);
    } catch (err) {
      console.error(err);
    }
  }
}

export function currentSession(): Session | null {
  return session;
}

export function userId(): string | null {
  return session?.user?.id ?? null;
}

export function userEmail(): string | null {
  return session?.user?.email ?? null;
}

function headers(extra: Record<string, string> = {}, withAuth = true): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (withAuth) h.Authorization = `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`;
  return h;
}

async function req(path: string, init: RequestInit = {}, withAuth = true): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...headers({}, withAuth), ...((init.headers as Record<string, string>) ?? {}) },
  });
  return res;
}

/* ------------------------------ Auth ------------------------------ */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string };
}

function toSession(t: TokenResponse): Session {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
    user: { id: t.user.id, email: t.user.email },
  };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const res = await req('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  if (!res.ok) throw new Error(`登录失败：${await safeError(res)}`);
  const s = toSession((await res.json()) as TokenResponse);
  setSession(s);
  return s;
}

export async function signUp(email: string, password: string): Promise<Session | null> {
  const res = await req('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
  if (!res.ok) throw new Error(`注册失败：${await safeError(res)}`);
  const data = (await res.json()) as TokenResponse & { session?: TokenResponse };
  if (data.access_token) {
    const s = toSession(data);
    setSession(s);
    return s;
  }
  return null; // 需要邮箱验证
}

export async function signOut(): Promise<void> {
  try {
    await req('/auth/v1/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  setSession(null);
}

async function safeError(res: Response): Promise<string> {
  try {
    const t = await res.text();
    const j = JSON.parse(t) as { msg?: string; error_description?: string; message?: string };
    return j.msg ?? j.error_description ?? j.message ?? t.slice(0, 200);
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function ensureFresh(): Promise<void> {
  if (!session) return;
  if (Date.now() < session.expires_at) return;
  try {
    const res = await req('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }, false);
    if (res.ok) setSession(toSession((await res.json()) as TokenResponse));
    else setSession(null);
  } catch {
    /* 离线：保留旧会话，等待下次在线重试 */
  }
}

/* ------------------------------ 数据适配器 ------------------------------ */

/**
 * 行 ↔ 远端记录转换。
 * 远端表结构：{ id, user_id, payload jsonb, created_at, updated_at }
 * 业务字段全部放进 payload —— 这样前端字段可以自由演进，
 * Supabase Migration 更新表结构时不会破坏已存储的用户数据。
 */
const META_KEYS = new Set(['id', 'user_id', 'created_at', 'updated_at', 'payload']);

function toRemote(row: BaseRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (META_KEYS.has(k)) continue;
    payload[k] = v;
  }
  return { id: row.id, user_id: row.user_id, payload, created_at: row.created_at, updated_at: row.updated_at };
}

function fromRemote(rec: Record<string, unknown>): BaseRow {
  const payload = (rec.payload ?? {}) as Record<string, unknown>;
  return {
    ...payload,
    id: String(rec.id),
    user_id: String(rec.user_id ?? ''),
    created_at: Number(rec.created_at ?? Date.now()),
    updated_at: Number(rec.updated_at ?? Date.now()),
  } as unknown as BaseRow;
}

/** 把 payload 里内联的 dataURL 图片上传到 Storage 并替换为公开链接 */
async function uploadInlineImages(rec: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload = rec.payload as Record<string, unknown> | undefined;
  if (!payload) return rec;
  const adapter = createAdapter();
  const walk = async (value: unknown, key: string): Promise<unknown> => {
    if (typeof value === 'string') {
      return /^data:image\//i.test(value) ? await adapter.uploadImage!(value, key || 'photo') : value;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const v of value) out.push(await walk(v, key));
      return out;
    }
    return value;
  };
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'photos' || k === 'cover' || k === 'image' || Array.isArray(v)) {
      try {
        payload[k] = await walk(v, k);
      } catch (err) {
        console.warn('[supabase] 图片上传失败，保留本地 dataURL', k, err);
      }
    }
  }
  return rec;
}

async function upsert(table: TableName, rows: BaseRow[], uploadImages = true): Promise<void> {
  if (!rows.length) return;
  await ensureFresh();
  let records = rows.map(toRemote);
  if (uploadImages) {
    records = await Promise.all(records.map((r) => uploadInlineImages(r)));
  }
  const res = await req(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(records),
  });
  if (!res.ok) throw new Error(`${table} 写入失败：${await safeError(res)}`);
}

export function createAdapter(): RemoteAdapter {
  return {
    name: 'supabase',
    async put(table, row) {
      await upsert(table, [row]);
    },
    async remove(table, id) {
      await ensureFresh();
      const res = await req(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`${table} 删除失败：${await safeError(res)}`);
    },
    async replaceAll(table, rows) {
      await upsert(table, rows, false);
    },
    async pullAll() {
      await ensureFresh();
      const out: Partial<Record<TableName, BaseRow[]>> = {};
      await Promise.all(
        TABLES.map(async (t) => {
          try {
            const res = await req(`/rest/v1/${t}?select=*&limit=5000`);
            if (!res.ok) return;
            const rows = (await res.json()) as Array<Record<string, unknown>>;
            out[t] = rows.map(fromRemote);
          } catch (err) {
            console.warn('[supabase] 拉取失败', t, err);
          }
        }),
      );
      return out;
    },
    async uploadImage(dataUrl, name) {
      await ensureFresh();
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : 'jpg';
      const uid = userId() ?? 'anon';
      const path = `${uid}/${new Date().toISOString().slice(0, 7)}/${name}-${Date.now().toString(36)}.${ext}`;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
          'Content-Type': blob.type || 'image/webp',
          'x-upsert': 'true',
        },
        body: blob,
      });
      if (!res.ok) throw new Error(`图片上传失败：${await safeError(res)}`);
      return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    },
  };
}

export async function healthcheck(): Promise<boolean> {
  if (!configured()) return false;
  try {
    const res = await req('/rest/v1/', {}, false);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export const supabase = {
  configured, createAdapter, signIn, signUp, signOut, currentSession, userId, userEmail, onAuth, healthcheck,
};
