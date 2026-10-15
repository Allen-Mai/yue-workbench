/* ==========================================================================
   api/push/subscribe.ts · 保存 / 删除 Web Push 订阅
   POST   { endpoint, keys, ua, timezone }  → upsert 到 push_subs
   DELETE { endpoint }                       → 删除订阅
   ========================================================================== */

import { cloudReady, del, json, readBody, upsert } from '../_shared.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    json(res, 204, {});
    return;
  }

  const body = await readBody(req);

  if (req.method === 'DELETE') {
    const endpoint = String(body?.endpoint || '');
    if (!endpoint) return json(res, 400, { ok: false, error: '缺少 endpoint' });
    if (!cloudReady()) return json(res, 200, { ok: true, note: '未配置 Supabase，订阅仅保存在本机' });
    try {
      await del('push_subs', `endpoint=eq.${encodeURIComponent(endpoint)}`);
      return json(res, 200, { ok: true });
    } catch (err: any) {
      return json(res, 500, { ok: false, error: String(err?.message ?? err) });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method Not Allowed' });

  const endpoint = String(body?.endpoint || '');
  const keys = body?.keys ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return json(res, 400, { ok: false, error: '订阅信息不完整（需要 endpoint / keys.p256dh / keys.auth）' });
  }

  if (!cloudReady()) {
    return json(res, 200, {
      ok: true,
      note: '未配置 Supabase：订阅已在浏览器中生效，但无法在网页关闭后由服务端推送。请在 Vercel 配置 SUPABASE_SERVICE_ROLE_KEY / VAPID 密钥。',
    });
  }

  try {
    // 订阅与用户绑定：优先使用 Supabase JWT 中的 sub，未登录则记为空（设备订阅）
    let userId: string | null = null;
    const auth = String(req.headers?.authorization || '');
    const token = auth.replace(/^Bearer\s+/i, '');
    if (token.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
        userId = payload?.sub ?? null;
      } catch {
        userId = null;
      }
    }

    await upsert('push_subs', [{
      id: `sub_${Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-48)}`,
      user_id: userId,
      endpoint,
      keys,
      ua: String(body?.ua || '').slice(0, 300),
      timezone: String(body?.timezone || 'Asia/Shanghai'),
      created_at: Date.now(),
      updated_at: Date.now(),
    }]);
    return json(res, 200, { ok: true });
  } catch (err: any) {
    return json(res, 500, { ok: false, error: String(err?.message ?? err) });
  }
}
