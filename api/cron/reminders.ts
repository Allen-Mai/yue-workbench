/* ==========================================================================
   api/cron/reminders.ts · 提醒推送（可单独调用）
   默认部署只挂 2 条 Cron（Vercel Hobby 限额），每日 06:00 的
   /api/cron/daily 会一并调用本逻辑；升级到 Pro 后可在 vercel.json
   里加上 { "path": "/api/cron/reminders", "schedule": "*\/15 * * * *" }
   实现每 15 分钟精确定时推送。
   ========================================================================== */

import { beijingHHmm, beijingToday, cloudReady, cronAuthorized, json, pushReady, runReminderPush } from '../_shared.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any): Promise<void> {
  if (!cronAuthorized(req)) return json(res, 401, { ok: false, error: '未授权' });
  if (!cloudReady()) return json(res, 200, { ok: true, note: 'Supabase 未配置，跳过（本地模式由客户端提醒）' });
  if (!pushReady()) return json(res, 200, { ok: true, note: 'VAPID 未配置，跳过推送' });

  const today = beijingToday();
  const hhmm = beijingHHmm();
  const result = await runReminderPush(today, hhmm);
  return json(res, 200, { ok: true, today, hhmm, ...result });
}
