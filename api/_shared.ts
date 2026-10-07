/* ==========================================================================
   api/_shared.ts · 服务端公共工具（Vercel Serverless Functions）
   以 Vercel 环境变量访问 Supabase（Service Role）与 web-push（VAPID）
   未配置时全部优雅降级，返回 200 + note，前端不会因此报错。
   ========================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
export const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:workbench@example.com';
export const CRON_SECRET = process.env.CRON_SECRET || '';

export function cloudReady(): boolean {
  return /^https?:\/\//.test(SUPABASE_URL) && SERVICE_KEY.length > 20;
}

export function pushReady(): boolean {
  return VAPID_PUBLIC.length > 20 && VAPID_PRIVATE.length > 20;
}

export function json(res: any, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (chunk: any) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

/** 校验 Vercel Cron 的 Authorization: Bearer <CRON_SECRET> */
export function cronAuthorized(req: any): boolean {
  if (!CRON_SECRET) return true; // 未配置密钥时不拦截（便于本地调试）
  const header = String(req.headers?.authorization || '');
  const token = header.replace(/^Bearer\s+/i, '');
  const url = new URL(req.url || '/', 'http://localhost');
  const qs = url.searchParams.get('secret') || '';
  return token === CRON_SECRET || qs === CRON_SECRET;
}

/* ------------------------------ Supabase REST ------------------------------ */
export async function sb(path: string, init: RequestInit = {}): Promise<any> {
  if (!cloudReady()) throw new Error('Supabase 未配置');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function select(table: string, query = ''): Promise<any[]> {
  return sb(`${table}?select=*${query ? `&${query}` : ''}`).then((r) => r ?? []);
}

export function upsert(table: string, rows: any[]): Promise<any> {
  if (!rows.length) return Promise.resolve(null);
  return sb(table, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
}

export function del(table: string, query: string): Promise<any> {
  return sb(`${table}?${query}`, { method: 'DELETE' });
}

/* ------------------------------ Web Push ------------------------------ */
let wp: any = null;
async function webpush(): Promise<any> {
  if (wp) return wp;
  const mod: any = await import('web-push');
  wp = mod?.default ?? mod;
  wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  return wp;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
}

/** 向所有（或指定 user 的）订阅推送；自动清理失效订阅 */
export async function sendPush(payload: PushPayload, userId?: string): Promise<{ sent: number; failed: number; total: number }> {
  if (!cloudReady() || !pushReady()) return { sent: 0, failed: 0, total: 0 };
  const query = userId ? `user_id=eq.${encodeURIComponent(userId)}` : '';
  let subs: any[] = [];
  try {
    subs = await select('push_subs', query);
  } catch (err) {
    console.warn('[push] 读取订阅失败', err);
    return { sent: 0, failed: 0, total: 0 };
  }
  if (!subs.length) return { sent: 0, failed: 0, total: 0 };

  const lib = await webpush();
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || './index.html#/hub',
    tag: payload.tag || 'ywb',
    image: payload.image,
  });

  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: s.keys };
      try {
        await lib.sendNotification(subscription, data, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (err: any) {
        failed++;
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          try { await del('push_subs', `endpoint=eq.${encodeURIComponent(s.endpoint)}`); } catch { /* ignore */ }
        }
      }
    }),
  );
  return { sent, failed, total: subs.length };
}

/* ------------------------------ 提醒推送（共用逻辑） ------------------------------ */
/**
 * 检查提醒并推送。reminders.next_due 由客户端打开应用时写回
 * （这样服务端无需重复实现农历换算）。
 */
export async function runReminderPush(today: string, hhmm: string): Promise<{ checked: number; fired: string[] }> {
  if (!cloudReady() || !pushReady()) return { checked: 0, fired: [] };
  let reminders: any[] = [];
  try {
    reminders = await select('reminders', `next_due=gte.${addDays(today, -1)}&next_due=lte.${addDays(today, 31)}`);
  } catch (err: any) {
    console.warn('[reminders] 查询失败', err);
    return { checked: 0, fired: [] };
  }

  const fired: string[] = [];
  for (const r of reminders) {
    const payload = (r.payload ?? {}) as Record<string, any>;
    const due = String(r.next_due || payload.next_due || '');
    if (!due) continue;
    const done: string[] = Array.isArray(payload.done_dates)
      ? payload.done_dates
      : Array.isArray(r.done_dates) ? r.done_dates : [];
    if (done.includes(due)) continue;

    const days = diffDays(due, today);
    const advance = Number(r.advance ?? payload.advance ?? 0);
    const time = String(r.time ?? payload.time ?? '');

    let kind: 'today' | 'advance' | null = null;
    if (days === 0) {
      if (!time || hhmm >= time) kind = 'today';
    } else if (advance > 0 && days === advance) {
      kind = 'advance';
    }
    if (!kind) continue;

    const title = kind === 'today'
      ? `⏰ ${r.title || payload.title || '提醒'}`
      : `🔔 还有 ${days} 天 · ${r.title || payload.title || '提醒'}`;
    const text = [
      time ? `时间 ${time}` : '',
      payload.contact ? `联系人 ${payload.contact}` : '',
      payload.note ? String(payload.note).slice(0, 60) : '',
    ].filter(Boolean).join(' · ') || '别忘了这件事～';

    const result = await sendPush({ title, body: text, url: './index.html#/remind', tag: `rem-${r.id}-${due}-${kind}` }, r.user_id);
    fired.push(`${r.id}:${result.sent}/${result.total}`);
  }
  return { checked: reminders.length, fired };
}

/* ------------------------------ 日期工具 ------------------------------ */
export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 以北京时间为准的「今天」（Vercel 默认 UTC） */
export function beijingToday(): string {
  const now = new Date();
  const cn = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  return ymd(cn);
}

export function beijingHHmm(): string {
  const now = new Date();
  const cn = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  return `${pad(cn.getHours())}:${pad(cn.getMinutes())}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y1, m1 - 1, d1, 12).getTime() - new Date(y2, m2 - 1, d2, 12).getTime()) / 86400000);
}
