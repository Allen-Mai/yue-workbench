/* ==========================================================================
   ui/icons.ts · 像素手绘 SVG 图标库（统一 16×16 像素网格 · 森系绿色系）
   写法：每个图标是一串 "x,y,w,h,色" 矩形元组，空格分隔 —— 真正的像素画。
   ========================================================================== */

import { svg, type Child } from './dom';

/* 调色板（单字母 → 颜色） */
const C: Record<string, string> = {
  k: '#3D2C1B', // 深棕描边
  b: '#8B6B47', // 树皮棕
  o: '#C4A882', // 橡木棕
  g: '#5A7A4A', // 苔藓绿（主）
  t: '#2D5A3D', // 中墨绿
  d: '#1A3C2A', // 深墨绿
  l: '#7DBF8A', // 高亮绿
  s: '#A8BBA0', // 鼠尾草绿
  m: '#DCE9D8', // 雾绿
  r: '#D64550', // 像素红
  e: '#E9898F', // 浅红
  n: '#E8A87C', // 暖橙
  h: '#F0D58C', // 蜂蜜黄
  y: '#F0E4C8', // 米黄
  w: '#FDF8EC', // 奶油白
};

export const PIXEL_PALETTE = C;

interface Rect { x: number; y: number; w: number; h: number; c: string }

function parse(spec: string): Rect[] {
  return spec
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const [x, y, w, h, c] = tuple.split(',');
      return { x: +x, y: +y, w: +w, h: +h, c: c || 'g' };
    });
}

/* -------------------------------------------------------------------------
   图标定义（16×16）
   ------------------------------------------------------------------------- */
const ART_SRC: Record<string, string> = {
  /* —— 侧栏导航 —— */
  hub: '7,0,2,3,b 5,2,4,2,b 3,4,10,2,b 2,6,12,9,y 6,9,4,6,b 11,3,3,2,l 13,1,2,2,l 3,7,2,3,g 11,7,2,3,g',
  plant: '6,1,4,3,l 4,4,8,2,g 2,3,3,3,l 11,3,3,3,l 7,5,2,3,b 4,8,8,1,o 3,9,10,6,n 4,14,8,1,b',
  inspire: '1,2,2,12,d 3,2,10,12,g 4,4,8,9,w 5,6,6,1,s 5,8,6,1,s 5,10,4,1,s 12,1,3,2,h 14,0,2,2,h',
  wealth: '6,1,4,1,h 4,2,8,1,h 3,3,10,1,h 2,4,12,8,h 3,12,10,1,h 4,13,8,1,h 6,14,4,1,h 5,5,6,6,n 6,6,4,4,h',
  capsule: '2,1,12,2,b 3,3,10,2,y 5,5,6,2,h 6,7,4,2,h 5,9,6,2,y 3,11,10,2,y 2,13,12,2,b 7,4,2,1,k 7,11,2,1,k',
  remind: '7,0,2,1,h 6,1,4,1,h 5,2,6,1,h 4,3,8,6,h 3,9,10,3,h 3,12,10,1,n 6,13,4,2,n 7,15,2,1,n',
  trophy: '4,1,8,1,h 4,2,8,5,h 2,2,2,4,h 12,2,2,4,h 6,7,4,2,n 7,9,2,3,b 4,12,8,1,b 3,13,10,1,b',
  settings: '2,3,12,1,g 8,1,2,5,g 2,7,12,1,g 3,5,2,5,g 2,11,12,1,g 9,9,2,5,g',
  gear: '6,0,4,3,s 0,6,3,4,s 13,6,3,4,s 6,13,4,3,s 3,3,10,10,s 6,6,4,4,w',

  /* —— 植物养护 —— */
  seed: '7,4,2,10,b 6,2,4,2,l 3,1,4,3,l 9,4,4,3,l 5,9,2,2,o',
  sprout: '7,5,2,9,g 6,4,4,2,g 2,1,5,4,l 9,2,5,4,l 5,13,6,2,b 3,14,10,1,y',
  flower: '6,2,4,4,h 2,6,4,4,h 10,6,4,4,h 6,10,4,4,h 6,6,4,4,n 7,7,2,2,r',
  drop: '7,1,2,3,l 6,3,4,2,l 5,5,6,3,l 4,8,8,5,l 5,12,6,2,s 6,14,4,1,s 5,6,2,2,w',
  watering: '2,6,6,7,g 3,7,4,5,l 7,4,5,2,g 10,2,4,3,g 1,8,2,3,g 13,4,2,2,l 12,7,2,2,l 14,8,2,2,l',
  leaf: '7,0,2,3,b 5,2,6,2,l 3,4,10,3,g 3,7,10,4,g 4,11,8,2,g 6,13,4,1,d 8,3,1,10,d',
  tree: '7,0,2,3,b 3,2,10,3,g 1,5,14,4,g 2,9,12,3,g 6,12,4,4,b 4,13,2,3,b 10,13,2,3,b',
  grass: '3,9,1,5,g 5,7,1,7,g 7,10,1,4,g 9,6,1,8,g 11,9,1,5,g 12,11,1,3,g',
  water: '2,13,12,2,s 2,12,12,1,l 7,2,2,3,l 5,5,6,2,l 3,7,10,4,g 4,11,8,1,l',

  /* —— 通用操作 —— */
  plus: '7,2,2,12,g 2,7,12,2,g',
  minus: '2,7,12,2,g',
  close: '3,3,2,2,k 5,5,2,2,k 7,7,2,2,k 9,9,2,2,k 11,11,2,2,k 11,3,2,2,k 9,5,2,2,k 5,9,2,2,k 3,11,2,2,k',
  check: '2,6,2,2,g 4,8,2,2,g 6,10,2,2,g 8,8,2,2,g 10,6,2,2,g 12,4,2,2,g',
  edit: '11,1,4,2,h 10,3,4,2,n 8,5,4,2,o 6,7,4,2,o 4,9,4,2,o 3,11,3,3,k',
  trash: '4,1,8,2,k 2,3,12,2,d 5,5,6,11,d 6,6,1,9,g 9,6,1,9,g',
  search: '5,2,6,1,s 3,3,2,2,s 11,3,2,2,s 2,5,1,6,s 13,5,1,6,s 3,11,2,2,s 11,11,2,2,s 5,13,6,1,s 10,10,5,5,g',
  filter: '1,2,14,2,g 3,6,10,2,g 5,10,6,2,g 7,13,2,2,g',
  refresh: '8,1,6,2,l 11,3,3,3,l 12,6,3,3,l 10,9,3,3,l 7,11,5,2,l 5,12,2,2,l 3,10,2,3,l 2,7,2,4,l 3,3,2,3,l 6,1,2,2,l',
  link: '2,9,4,4,s 5,8,4,4,s 8,5,4,4,s 10,2,4,4,s 6,6,4,4,g',
  upload: '7,1,2,6,g 5,3,2,2,g 9,3,2,2,g 3,5,2,2,g 11,5,2,2,g 2,11,12,2,o',
  download: '7,1,2,6,g 5,7,2,2,g 9,7,2,2,g 3,9,2,2,g 11,9,2,2,g 2,11,12,2,o',
  image: '2,2,12,12,w 2,2,12,2,y 3,11,4,3,l 6,9,4,3,g 10,10,3,3,g 3,4,3,3,h',
  camera: '2,5,12,8,t 6,3,4,2,t 6,7,4,4,h 7,8,2,2,d 3,6,2,2,h 12,6,2,2,h',
  mic: '6,1,4,8,g 5,2,1,6,l 10,2,1,6,l 5,9,6,2,g 7,11,2,3,o 4,14,8,1,o 6,6,4,1,l',
  speaker: '2,6,3,4,g 5,4,3,8,g 8,2,2,12,g 11,5,2,2,g 11,9,2,2,g 13,7,1,2,g',
  notice: '7,0,2,1,h 6,1,4,1,h 5,2,6,1,h 4,3,8,6,h 3,9,10,3,h 3,12,10,1,n 6,13,4,2,n',
  list: '2,3,3,3,g 6,3,8,3,y 2,7,3,3,g 6,7,8,3,y 2,11,3,3,g 6,11,8,3,y',
  dots: '3,7,2,2,k 7,7,2,2,k 11,7,2,2,k',
  arrowLeft: '3,7,8,2,g 5,5,2,2,g 5,9,2,2,g 7,3,2,2,g 7,11,2,2,g',
  arrowRight: '5,7,8,2,g 9,5,2,2,g 9,9,2,2,g 7,3,2,2,g 7,11,2,2,g',
  arrowUp: '7,2,2,10,g 5,4,2,2,g 9,4,2,2,g 3,6,2,2,g 11,6,2,2,g',
  arrowDown: '7,4,2,10,g 5,10,2,2,g 9,10,2,2,g 3,8,2,2,g 11,8,2,2,g',
  star: '6,1,4,3,h 3,4,10,2,h 1,6,14,2,h 3,8,4,3,h 9,8,4,3,h 2,11,4,3,h 10,11,4,3,h',
  sparkle: '7,1,2,9,h 2,4,12,2,h 5,10,2,2,n 9,2,2,2,n',
  heart: '3,2,3,2,r 10,2,3,2,r 2,4,4,3,r 10,4,4,3,r 2,7,12,2,r 3,9,10,2,r 5,11,6,2,r 7,13,2,1,r 4,3,2,2,e',
  fire: '7,1,2,4,r 5,4,6,3,r 3,7,10,5,n 5,12,6,2,h 6,6,4,4,h',
  lock: '4,7,8,7,y 5,3,6,4,o 6,4,4,3,w 7,9,2,3,k',
  target: '6,1,4,1,r 3,3,2,2,r 11,3,2,2,r 1,6,2,4,r 13,6,2,4,r 3,11,2,2,r 11,11,2,2,r 6,14,4,1,r 5,5,6,2,w 5,9,6,2,w 4,7,8,2,w 7,7,2,2,r',
  clock: '6,1,4,1,g 4,2,8,1,g 2,3,2,2,g 12,3,2,2,g 1,5,1,6,g 14,5,1,6,g 2,11,2,2,g 12,11,2,2,g 4,13,8,1,g 6,14,4,1,g 7,4,2,5,d 7,7,4,2,d',
  calendar: '2,3,12,12,w 2,3,12,3,g 4,1,2,3,b 10,1,2,3,b 3,7,2,2,s 6,7,2,2,g 9,7,2,2,s 12,7,1,2,s 3,10,2,2,g 6,10,2,2,s 9,10,2,2,g',
  chart: '2,9,3,5,g 6,5,3,9,g 10,2,3,12,g 1,14,14,1,o',
  pie: '6,1,4,1,g 4,2,4,2,g 2,3,2,4,g 1,7,1,4,g 2,11,2,3,g 4,13,6,1,g 6,14,4,1,g 8,2,3,2,h 10,4,3,4,h 9,9,3,3,h 7,12,3,2,h',
  cart: '1,1,2,2,g 3,3,2,2,g 4,5,10,6,g 5,12,2,2,d 11,12,2,2,d 6,6,7,4,l',
  gift: '1,6,14,2,r 2,8,12,7,h 6,6,4,9,o 3,1,4,5,g 9,1,4,5,g 7,2,2,4,r',
  wallet: '1,4,14,10,y 1,4,14,2,o 4,8,8,4,g 12,9,2,2,h',
  money: '1,4,14,8,l 2,5,12,6,w 7,6,2,4,g 4,7,1,2,g 11,7,1,2,g',
  income: '7,1,2,7,g 4,5,3,3,g 9,5,3,3,g 1,10,14,2,o 3,13,10,2,y',
  piggy: '3,5,10,7,e 2,7,2,4,e 11,4,2,3,e 12,10,2,3,e 5,12,2,3,e 10,12,2,3,e 6,3,4,2,e 6,8,4,2,h 13,7,2,2,h',
  chest: '1,6,14,8,b 1,6,14,3,o 3,2,10,4,o 7,9,2,3,h 2,7,12,1,h',
  crown: '1,10,14,3,h 2,4,3,6,h 6,2,4,8,h 11,4,3,6,h 3,3,2,2,r 7,1,2,2,r 11,3,2,2,r',
  home: '7,1,2,3,b 5,3,4,2,b 3,5,10,2,b 2,7,12,8,y 6,10,4,5,b 3,8,2,3,g 11,8,2,3,g',
  sun: '7,0,2,2,h 7,14,2,2,h 0,7,2,2,h 14,7,2,2,h 5,4,6,1,h 3,5,2,2,h 11,5,2,2,h 2,7,1,4,h 13,7,1,4,h 3,11,2,2,h 11,11,2,2,h 5,13,6,1,h 5,6,6,6,n 6,7,4,4,h',
  moon: '6,1,4,1,s 4,2,8,1,s 3,3,4,2,s 2,5,3,6,s 3,11,4,2,s 4,13,8,1,s 6,14,4,1,s 6,3,4,8,w 5,5,2,6,w',
  news: '1,2,14,12,w 1,2,14,2,k 3,5,4,4,s 8,5,6,1,k 8,7,6,1,k 8,9,6,1,k 3,10,11,1,k 3,12,8,1,k',
  beads: '6,0,4,4,r 2,2,4,4,g 10,2,4,4,h 6,6,4,4,n 2,10,4,4,l 10,10,4,4,s 7,7,2,2,k',
  diary: '2,2,3,12,b 5,2,9,12,g 6,5,7,1,w 6,7,7,1,w 6,9,7,1,w 6,11,4,1,w 11,1,3,5,r',
  compass: '6,1,4,1,g 4,2,8,1,g 2,3,2,2,g 12,3,2,2,g 1,5,1,6,g 14,5,1,6,g 2,11,2,2,g 12,11,2,2,g 4,13,8,1,g 6,14,4,1,g 7,5,2,6,r 6,7,1,3,r 9,6,2,4,g',
  apple: '5,5,6,1,r 4,6,8,1,r 3,7,10,6,r 4,13,8,1,r 5,14,6,1,r 5,7,2,2,e 4,8,2,3,e 7,2,2,3,b 9,2,3,1,l 10,1,2,2,l',
  dog: '6,2,4,3,b 4,5,8,3,b 3,8,10,6,b 4,14,8,1,b 2,9,2,3,b 12,9,2,3,b',
};

export const PIXEL_NAMES = Object.keys(ART_SRC);

const CACHE = new Map<string, Rect[]>();
function art(name: string): Rect[] {
  let r = CACHE.get(name);
  if (!r) {
    r = parse(ART_SRC[name] ?? ART_SRC.leaf);
    CACHE.set(name, r);
  }
  return r;
}

export interface IconOptions {
  /** 覆盖全部颜色（单色图标，例如导航高亮/失败态） */
  color?: string;
  class?: string;
  /** 无障碍标题 */
  title?: string;
  /** 柔和描边（浅色背景上更清晰） */
  outline?: boolean;
}

/** 生成像素图标 SVG（可安全插入 DOM） */
export function pixelIcon(name: string, size = 20, opts: IconOptions = {}): SVGSVGElement {
  const rects = art(name);
  const children: Child[] = [];
  if (opts.outline) {
    for (const r of rects) {
      children.push(
        svg('rect', { x: r.x - 1, y: r.y - 1, width: r.w + 2, height: r.h + 2, fill: '#FDF8EC', opacity: 0.85 }),
      );
    }
  }
  for (const r of rects) {
    children.push(
      svg('rect', {
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        fill: opts.color ?? C[r.c] ?? C.g,
      }),
    );
  }
  const el = svg(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      class: `pixel ${opts.class ?? ''}`.trim(),
      shapeRendering: 'crispEdges',
      'aria-hidden': opts.title ? 'false' : 'true',
      role: opts.title ? 'img' : 'presentation',
      style: 'display:block;flex:0 0 auto',
    },
    opts.title ? svg('title', null, opts.title) : null,
    ...children,
  );
  return el as unknown as SVGSVGElement;
}

/** 像素图标 HTML 字符串（用于 html: 场景） */
export function pixelIconHTML(name: string, size = 20, color?: string): string {
  const rects = art(name)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${color ?? C[r.c] ?? C.g}"/>`)
    .join('');
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges" style="display:block;flex:0 0 auto">${rects}</svg>`;
}

/** 线条小狗（森系手绘线条，默认深棕） */
export function dogLine(size = 64, tone = '#5B4030', opts: { tail?: boolean; class?: string } = {}): SVGSVGElement {
  const g = svg('g', {
    fill: 'none',
    stroke: tone,
    'stroke-width': 2.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  const add = (d: string, extra: Record<string, string | number> = {}) =>
    g.appendChild(svg('path', { d, ...extra }));
  // 头
  add('M20 22a12 12 0 1 0 24 0a12 12 0 1 0-24 0');
  // 耳朵
  add('M20 16c-6-2-10 3-9 9s5 9 9 6');
  add('M44 16c6-2 10 3 9 9s-5 9-9 6');
  // 眼睛
  g.appendChild(svg('circle', { cx: 27, cy: 20, r: 1.7, fill: tone, stroke: 'none' }));
  g.appendChild(svg('circle', { cx: 37, cy: 20, r: 1.7, fill: tone, stroke: 'none' }));
  // 鼻子与嘴
  add('M32 25c-1.6 0-2.6 1.2-2.6 2.4S30.4 30 32 30s2.6-1.4 2.6-2.6S33.6 25 32 25z');
  add('M32 30v3');
  add('M32 33c-1.8 3-5 3.2-7.2 1.2');
  add('M32 33c1.8 3 5 3.2 7.2 1.2');
  // 身体
  add('M22 34c-4 8-2 16 4 20h12c6-4 8-12 4-20');
  // 前腿
  add('M26 54v6');
  add('M38 54v6');
  // 尾巴
  if (opts.tail !== false) add('M46 36c6-2 9 5 6 11');
  return svg(
    'svg',
    {
      viewBox: '0 0 64 64',
      width: size,
      height: size,
      class: `dog-line ${opts.class ?? ''}`.trim(),
      'aria-hidden': 'true',
      style: 'display:block',
    },
    g,
  ) as unknown as SVGSVGElement;
}

/** 像素苹果（主图标元素） */
export function pixelApple(size = 48): SVGSVGElement {
  return pixelIcon('apple', size);
}
