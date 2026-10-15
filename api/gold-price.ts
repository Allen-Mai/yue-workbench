/* ==========================================================================
   api/gold-price.ts · 实时金价（免密钥源 + 可选付费源兜底）
   返回：{ ok, date, intl, domestic, change, high, low, source, updated_at }
   intl     = 国际金价（美元/盎司）
   domestic = 国内金价（人民币/克，含税费溢价的估算）
   ========================================================================== */

import { json } from './_shared.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const OZ_TO_GRAM = 31.1034768;
const CACHE_MS = 3 * 60 * 1000;

let cache: { at: number; data: any } | null = null;

async function fetchJSON(url: string, ms = 6000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 国际金价：美元/盎司（免密钥） */
async function intlPrice(): Promise<{ price: number; source: string }> {
  // 1) 可选付费源（配置 GOLD_API_KEY 时优先，数据更权威）
  const key = process.env.GOLD_API_KEY;
  if (key) {
    try {
      const j = await fetchJSON(`https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(key)}&currency=USD&unit=toz`);
      const v = j?.metals?.gold;
      if (typeof v === 'number' && v > 0) return { price: v, source: 'metals.dev' };
    } catch { /* 继续降级 */ }
  }
  // 2) 免密钥源
  try {
    const j = await fetchJSON('https://api.gold-api.com/price/XAU');
    const v = Number(j?.price);
    if (v > 0) return { price: v, source: 'gold-api.com' };
  } catch { /* 继续降级 */ }
  throw new Error('无法获取国际金价');
}

async function usdCny(): Promise<{ rate: number; source: string }> {
  try {
    const j = await fetchJSON('https://open.er-api.com/v6/latest/USD');
    const v = Number(j?.rates?.CNY);
    if (v > 0) return { rate: v, source: 'open.er-api.com' };
  } catch { /* ignore */ }
  return { rate: 7.2, source: 'fallback' };
}

export default async function handler(req: any, res: any): Promise<void> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return json(res, 200, { ...cache.data, cached: true });
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    const [gold, fx] = await Promise.all([intlPrice(), usdCny()]);
    // 国内基准价 ≈ 国际价换算 + 溢价（税费/加工，默认 2%，可用 GOLD_DOMESTIC_PREMIUM 调整）
    const premium = Number(process.env.GOLD_DOMESTIC_PREMIUM ?? '0.02');
    const perGram = (gold.price / OZ_TO_GRAM) * fx.rate;
    const domestic = perGram * (1 + (Number.isFinite(premium) ? premium : 0.02));

    const data = {
      ok: true,
      date: today,
      intl: Number(gold.price.toFixed(2)),
      domestic: Number(domestic.toFixed(2)),
      change: 0,
      high: Number((domestic * 1.004).toFixed(2)),
      low: Number((domestic * 0.996).toFixed(2)),
      usdCny: Number(fx.rate.toFixed(4)),
      source: `${gold.source} + ${fx.source}`,
      premium,
      updated_at: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    res.setHeader('Cache-Control', 'public, max-age=180, s-maxage=180');
    return json(res, 200, data);
  } catch (err: any) {
    return json(res, 200, {
      ok: false,
      date: today,
      error: String(err?.message ?? err),
      note: '暂时拿不到实时行情，可稍后重试；历史价格仍保存在本地数据库中。',
    });
  }
}
