/* ==========================================================================
   api/cron/monthly-backup.ts · 每月 1 日：提醒导出备份（规格强制）
   ========================================================================== */

import { beijingToday, cloudReady, cronAuthorized, json, pushReady, sendPush } from '../_shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any): Promise<void> {
  if (!cronAuthorized(req)) return json(res, 401, { ok: false, error: '未授权' });
  const today = beijingToday();
  if (!today.endsWith('-01') && !new URL(req.url || '/', 'http://x').searchParams.has('force')) {
    return json(res, 200, { ok: true, note: `今天不是 1 号（${today}），跳过` });
  }
  if (!cloudReady() || !pushReady()) {
    return json(res, 200, { ok: true, note: '云端或 VAPID 未配置，由客户端在打开应用时提醒备份' });
  }
  const result = await sendPush({
    title: '📦 该导出备份啦（每月 1 日提醒）',
    body: '打开「设置 → 导出全部数据」，保存一份 JSON 备份，数据永远属于你 🌿',
    url: './index.html#/settings',
    tag: `backup-${today.slice(0, 7)}`,
  });
  return json(res, 200, { ok: true, ...result });
}
