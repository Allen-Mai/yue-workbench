/* ==========================================================================
   core/cover.ts · 配图抓取与本地兜底
   - fetchCover(title, kind)：book 优先 Open Library 免密钥封面，其它/失败/超时用本地像素封面
   - localCover(title, seed?)：纯 SVG data URL，米黄渐变底 + 像素叶片/小花/波点 + 标题首字
   零第三方依赖；抓取结果内存缓存；任何失败都不抛异常（始终返回可用字符串）
   ========================================================================== */

/** 暖奶油 / 苔藓绿 调色板（与 tokens.css、icons.ts 保持一致） */
const PALETTE = {
  creamTop: '#FDF8EC',
  creamBottom: '#F0E4C8',
  moss: '#5A7A4A',
  mossSoft: '#7DBF8A',
  oak: '#C4A882',
  honey: '#F0D58C',
  red: '#D64550',
} as const;

export const COVER_W = 480;
export const COVER_H = 300;

/** 抓取超时（毫秒） */
const FETCH_TIMEOUT = 1200;

/** 内存缓存：key = `${kind}::${title}`，值 = 最终可用的图片地址 */
const cache = new Map<string, string>();
/** 同 key 并发去重，避免重复请求 */
const inflight = new Map<string, Promise<string>>();

/** 标题首字（去掉书名号/引号等包裹符号，emoji 安全） */
function initialOf(title: string): string {
  const cleaned = String(title ?? '')
    .replace(/^[\s《〈\[【("'“‘「『]+/, '')
    .trim();
  if (!cleaned) return '森';
  const chars = Array.from(cleaned);
  return chars[0] ?? '森';
}

function cacheKey(title: string, kind: string): string {
  return `${kind}::${title}`;
}

/* ------------------------------ 本地像素封面 ------------------------------ */

interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  opacity?: number;
}

function rects(list: RectSpec[]): string {
  return list
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"${
      r.opacity != null ? ` opacity="${r.opacity}"` : ''
    }/>`)
    .join('');
}

/**
 * 本地森系像素封面（SVG data URL）
 * 512×320 视图：米黄渐变底 + 像素叶片 / 像素小花 / 波点 + 标题首字
 */
export function localCover(title: string, seed?: number): string {
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed as number)) : hashSeed(title);
  const char = initialOf(title);

  /* -------- 波点（暖棕/蜂蜜黄，相位随 seed 变化） -------- */
  const dots: RectSpec[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 9; col++) {
      if ((row * 9 + col + safeSeed) % 3 === 0) continue;
      dots.push({
        x: 14 + col * 54 + ((row % 2) * 20),
        y: 16 + row * 62 + ((col % 2) * 14),
        w: (row + col + safeSeed) % 2 === 0 ? 7 : 5,
        h: (row + col + safeSeed) % 2 === 0 ? 7 : 5,
        fill: (row + col) % 3 === 0 ? PALETTE.honey : PALETTE.oak,
        opacity: 0.3,
      });
    }
  }

  /* -------- 叶片（苔藓绿 / 高亮绿） -------- */
  const leaves: RectSpec[] = [
    { x: 60, y: 74, w: 12, h: 12, fill: PALETTE.moss },
    { x: 72, y: 74, w: 12, h: 12, fill: PALETTE.mossSoft },
    { x: 48, y: 86, w: 12, h: 12, fill: PALETTE.mossSoft },
    { x: 60, y: 86, w: 12, h: 12, fill: PALETTE.moss },
    { x: 72, y: 86, w: 12, h: 12, fill: PALETTE.moss },
    { x: 84, y: 86, w: 12, h: 12, fill: PALETTE.mossSoft },
    { x: 60, y: 98, w: 12, h: 12, fill: PALETTE.moss },
    { x: 72, y: 98, w: 12, h: 12, fill: PALETTE.mossSoft },
    // 叶柄
    { x: 70, y: 110, w: 6, h: 18, fill: PALETTE.oak },
    // 右下小簇叶
    { x: 400, y: 208, w: 12, h: 12, fill: PALETTE.mossSoft },
    { x: 412, y: 208, w: 12, h: 12, fill: PALETTE.moss },
    { x: 388, y: 220, w: 12, h: 12, fill: PALETTE.moss },
    { x: 400, y: 220, w: 12, h: 12, fill: PALETTE.mossSoft },
    { x: 412, y: 220, w: 12, h: 12, fill: PALETTE.moss },
    { x: 406, y: 232, w: 6, h: 16, fill: PALETTE.oak },
  ];

  /* -------- 小花（蜂蜜黄花瓣 + 像素红花心） -------- */
  const flower = (fx: number, fy: number, petal: string = PALETTE.honey): RectSpec[] => [
    { x: fx, y: fy, w: 10, h: 10, fill: petal },
    { x: fx + 16, y: fy, w: 10, h: 10, fill: petal },
    { x: fx - 8, y: fy + 10, w: 10, h: 10, fill: petal },
    { x: fx, y: fy + 10, w: 10, h: 10, fill: PALETTE.red },
    { x: fx + 16, y: fy + 10, w: 10, h: 10, fill: petal },
    { x: fx + 8, y: fy + 10, w: 8, h: 8, fill: PALETTE.honey },
    { x: fx + 8, y: fy + 20, w: 6, h: 20, fill: PALETTE.moss },
  ];
  const flowers: RectSpec[] = [
    ...flower(40, 228),
    ...flower(360, 60, PALETTE.mossSoft),
  ];

  /* -------- 草地基线 -------- */
  const ground: RectSpec[] = [];
  for (let x = 0; x < COVER_W + 32; x += 16) {
    ground.push({ x, y: COVER_H - 34, w: 16, h: 8, fill: PALETTE.moss, opacity: 0.5 });
    ground.push({ x: x + 8, y: COVER_H - 26, w: 16, h: 8, fill: PALETTE.mossSoft, opacity: 0.45 });
  }

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_W}" height="${COVER_H}" viewBox="0 0 ${COVER_W} ${COVER_H}" role="img">`
    + `<defs><linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${PALETTE.creamTop}"/><stop offset="1" stop-color="${PALETTE.creamBottom}"/>`
    + `</linearGradient></defs>`
    + `<rect x="0" y="0" width="${COVER_W}" height="${COVER_H}" fill="url(#lcg)"/>`
    + `<rect x="7" y="7" width="${COVER_W - 14}" height="${COVER_H - 14}" fill="none" stroke="${PALETTE.oak}" stroke-width="3" opacity="0.45"/>`
    + rects(dots)
    + rects(ground)
    + rects(leaves)
    + rects(flowers)
    + `<circle cx="240" cy="146" r="84" fill="${PALETTE.creamTop}" opacity="0.92" stroke="${PALETTE.oak}" stroke-width="3"/>`
    + `<text x="240" y="186" text-anchor="middle" font-size="104" font-weight="700" fill="${PALETTE.moss}" font-family="PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif">${char}</text>`
    + `</svg>`;

  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  } catch {
    // 理论上不会发生（encodeURIComponent 不会抛）；极端情况也给一个最小可用封面
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${PALETTE.creamTop}"/></svg>`,
    )}`;
  }
}

/** 标题 → 稳定整数（用于波点相位） */
function hashSeed(text: string): number {
  let hash = 7;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 100000;
  return hash;
}

/* ------------------------------ 抓取 ------------------------------ */

/** Open Library 免密钥封面（仅 book） */
async function openLibraryCover(title: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const url = `https://openlibrary.org/search.json?limit=1&q=${encodeURIComponent(title)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { docs?: Array<{ cover_i?: number }> };
    const coverId = data?.docs?.[0]?.cover_i;
    if (!coverId) return null;
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  } catch {
    return null; // 网络失败 / 超时（AbortError）/ JSON 解析失败都静默回退
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取配图；失败、超时或非 book 类型一律回退本地像素封面。
 * 结果会写入内存缓存，重复调用不会再次发起网络请求。
 */
export async function fetchCover(title: string, kind: string): Promise<string> {
  const name = String(title ?? '').trim() || '灵感';
  const k = String(kind ?? '');
  const key = cacheKey(name, k);

  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<string> => {
    let result: string | null = null;
    if (k === 'book') result = await openLibraryCover(name);
    const final = result || localCover(name);
    cache.set(key, final);
    return final;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } catch {
    // 双保险：任何意外都不向调用方抛异常
    const fallback = localCover(name);
    cache.set(key, fallback);
    return fallback;
  } finally {
    inflight.delete(key);
  }
}

/* ------------------------------ 便捷工具 ------------------------------ */

/** 清空缓存（调试 / 换标题重试用） */
export function clearCoverCache(): void {
  cache.clear();
  inflight.clear();
}

/** 该地址是否是本地生成的 SVG 封面 */
export function isLocalCover(src: string): boolean {
  return /^data:image\/svg\+xml/i.test(String(src ?? ''));
}

export const cover = { fetchCover, localCover, clearCoverCache, isLocalCover, PALETTE };
