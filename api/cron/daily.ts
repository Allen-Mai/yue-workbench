/* ==========================================================================
   api/cron/daily.ts · 每日清晨推送：今日待办 + 植物养护摘要
   vercel.json 中配置为 0 22 * * *（UTC）= 北京时间 06:00
   ========================================================================== */

import {
  beijingHHmm, beijingToday, cloudReady, cronAuthorized, diffDays, json, pushReady, runReminderPush, select, sendPush,
} from '../_shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any): Promise<void> {
  if (!cronAuthorized(req)) return json(res, 401, { ok: false, error: '未授权' });
  if (!cloudReady()) return json(res, 200, { ok: true, note: 'Supabase 未配置，跳过（本地模式由客户端提醒）' });
  if (!pushReady()) return json(res, 200, { ok: true, note: 'VAPID 未配置，跳过推送' });

  const today = beijingToday();
  const out: Record<string, unknown> = { today };

  // 顺带把「今天到期 / 提前 N 天」的提醒推一遍（Hobby 计划只有 2 条 Cron，
  // 升级 Pro 后可再挂 /api/cron/reminders 每 15 分钟精确推送）
  try {
    out.reminders = await runReminderPush(today, beijingHHmm());
  } catch (err: any) {
    out.reminders = { error: String(err?.message ?? err) };
  }

  try {
    const todos = await select('todos', `date=eq.${today}`);
    const open = todos.filter((t: any) => !t.done);

    // 植物养护：按类别周期 + 最近一次养护日期推算（与客户端规则一致）
    const plants = await select('plants');
    const logs = await select('plant_logs');
    const cycleOf = (cat: string) => (cat === 'hydro2' ? 2 : cat === 'hydro10' ? 10 : 1);
    const actionOf = (cat: string) => (cat === 'soil' ? '浇水' : '换水');
    const due: string[] = [];
    for (const p of plants) {
      const cycle = cycleOf(String(p.category));
      const action = actionOf(String(p.category));
      const mine = logs
        .filter((l: any) => {
          const tags = Array.isArray(l.tags) ? l.tags : (l.payload?.tags ?? []);
          return l.plant_id === p.id && Array.isArray(tags) && tags.includes(action);
        })
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
      const last = mine[0]?.date ?? p.planted_at ?? today;
      const left = cycle - diffDays(today, String(last));
      if (left <= 0) due.push(`${String(p.name).replace(/[（(].*?[)）]/g, '')}${action}`);
    }

    const lines: string[] = [];
    if (open.length) lines.push(`待办 ${open.length} 条：${open.slice(0, 3).map((t: any) => t.title).join('、')}`);
    if (due.length) lines.push(`植物养护：${due.slice(0, 4).join('、')}`);
    if (!lines.length) lines.push('今天没有待办，去写一句日记吧 🌿');

    const byUser = new Map<string, string[]>();
    for (const t of todos) {
      const uid = String(t.user_id || '');
      byUser.set(uid, lines);
    }
    if (!byUser.size) byUser.set('', lines);

    const sent: string[] = [];
    for (const [uid, body] of byUser) {
      const result = await sendPush({
        title: '🌿 早安，今天的工作台已就绪',
        body: body.join(' · '),
        url: './index.html#/hub',
        tag: `daily-${today}`,
      }, uid || undefined);
      sent.push(`${uid || 'all'}:${result.sent}/${result.total}`);
    }
    out.openTodos = open.length;
    out.duePlants = due.length;
    out.sent = sent;
  } catch (err: any) {
    return json(res, 500, { ok: false, error: String(err?.message ?? err) });
  }

  return json(res, 200, { ok: true, ...out });
}
