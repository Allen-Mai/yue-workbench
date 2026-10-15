/* ==========================================================================
   api/push/send.ts · 手动发送一条推送（测试用）
   POST { title, body, url?, tag? }  需 Authorization: Bearer <CRON_SECRET>
   ========================================================================== */

import { cronAuthorized, json, pushReady, readBody, sendPush } from '../_shared.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method Not Allowed' });
  if (!cronAuthorized(req)) return json(res, 401, { ok: false, error: '未授权' });
  if (!pushReady()) {
    return json(res, 200, { ok: false, note: '未配置 VAPID 密钥（VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY）' });
  }
  const body = await readBody(req);
  const result = await sendPush({
    title: String(body?.title || '月月的工作台'),
    body: String(body?.body || '这是一条测试推送 🌿'),
    url: String(body?.url || './index.html#/hub'),
    tag: String(body?.tag || 'ywb-test'),
  });
  return json(res, 200, { ok: true, ...result });
}
