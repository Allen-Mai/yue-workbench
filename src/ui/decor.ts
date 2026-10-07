/* ==========================================================================
   ui/decor.ts · 手绘森系装饰（启动页草地 / 空状态 / 波点 / 叶片 / 线条小狗）
   ========================================================================== */

import { h, svg, type Child } from './dom';
import { pixelIcon, dogLine } from './icons';

/** 像素草地：深浅绿色块交错，带层次与立体感 */
export function grassField(width = 320, height = 120, scale = 1): SVGElement {
  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: width * scale,
    height: height * scale,
    class: 'pixel',
    shapeRendering: 'crispEdges',
    'aria-hidden': 'true',
    style: 'display:block;max-width:100%',
  });
  const block = 10;
  // 由远及近三层草地（越近越亮，形成回归质感）
  const layers: Array<{ y: number; rows: number; colors: string[] }> = [
    { y: height - 66, rows: 2, colors: ['#8FB683', '#A3C795'] },
    { y: height - 46, rows: 2, colors: ['#6E9A5F', '#7DBF8A'] },
    { y: height - 26, rows: 3, colors: ['#4F7040', '#5A7A4A'] },
  ];
  layers.forEach((layer, li) => {
    for (let r = 0; r < layer.rows; r++) {
      for (let x = 0; x < width; x += block) {
        const seed = (x / block + r * 3 + li * 7) % 2;
        root.appendChild(svg('rect', {
          x, y: layer.y + r * block, width: block, height: block,
          fill: layer.colors[seed],
        }));
      }
    }
  });
  // 像素草叶
  const blades = [[18, 12], [54, 18], [96, 10], [140, 20], [186, 14], [228, 18], [268, 12], [300, 16]];
  blades.forEach(([x, hgt], i) => {
    const baseY = height - 26 - (i % 2) * 4;
    for (let k = 0; k < hgt; k += 4) {
      root.appendChild(svg('rect', { x: x + (k % 8 === 0 ? 0 : 3), y: baseY - k, width: 4, height: 4, fill: k > hgt / 2 ? '#7DBF8A' : '#5A7A4A' }));
    }
  });
  // 像素树（左右各一，做出纵深）
  const tree = (tx: number, ty: number, s: number) => {
    const g = svg('g', null);
    for (let i = 0; i < 5; i++) {
      g.appendChild(svg('rect', { x: tx - (5 - i) * 3 * s, y: ty - i * 6 * s, width: (10 + (5 - i) * 6) * s, height: 6 * s, fill: i < 2 ? '#4F7040' : '#5A7A4A' }));
    }
    g.appendChild(svg('rect', { x: tx - 2 * s, y: ty, width: 4 * s, height: 12 * s, fill: '#8B6B47' }));
    return g;
  };
  root.appendChild(tree(44, height - 76, 1));
  root.appendChild(tree(width - 52, height - 82, 1.2));
  // 像素小花
  const flower = (fx: number, fy: number, color: string) => {
    const g = svg('g', null);
    g.appendChild(svg('rect', { x: fx, y: fy + 6, width: 2, height: 8, fill: '#5A7A4A' }));
    g.appendChild(svg('rect', { x: fx - 4, y: fy + 2, width: 4, height: 4, fill: color }));
    g.appendChild(svg('rect', { x: fx + 2, y: fy + 2, width: 4, height: 4, fill: color }));
    g.appendChild(svg('rect', { x: fx - 1, y: fy - 1, width: 4, height: 4, fill: color }));
    g.appendChild(svg('rect', { x: fx - 1, y: fy + 4, width: 4, height: 3, fill: '#F0D58C' }));
    return g;
  };
  root.appendChild(flower(78, height - 40, '#E9898F'));
  root.appendChild(flower(210, height - 34, '#F0D58C'));
  root.appendChild(flower(286, height - 44, '#E8A87C'));
  return root;
}

/** 启动页主视觉：像素苹果 + 线条小狗 + 分层草地 */
export function splashArt(width = 340): HTMLElement {
  const stage = h('div', {
    style: `position:relative;width:${width}px;max-width:86vw;margin:0 auto`,
  });
  const grass = h('div', { style: 'position:relative;z-index:1' }, grassField(320, 120, width / 320));
  const actors = h('div', {
    style: 'position:absolute;left:0;right:0;bottom:52px;display:flex;align-items:flex-end;justify-content:center;gap:14px;z-index:2',
  });
  const apple = pixelIcon('apple', Math.round(width * 0.2));
  apple.classList.add('anim-breathe');
  const dog = dogLine(Math.round(width * 0.29), 'rgba(91,64,48,.92)');
  dog.classList.add('anim-float');
  actors.append(dog, apple);
  stage.append(grass, actors);
  return stage;
}

/** 空状态插画：草地 + 线条小狗 */
export function emptyForest(width = 220): HTMLElement {
  return h('div', { style: 'text-align:center' },
    h('div', { style: 'display:flex;justify-content:center' }, dogLine(88, 'rgba(91,64,48,.55)')),
    h('div', { style: `width:${width}px;max-width:80vw;margin:0 auto;opacity:.9` }, grassField(220, 90, width / 220)),
  );
}

/** 加载页（模块级骨架） */
export function loadingForest(text = '正在生长…'): HTMLElement {
  return h('div', { class: 'loading-block' },
    h('div', { style: 'display:flex;gap:8px;align-items:flex-end' },
      pixelIcon('sprout', 26), pixelIcon('leaf', 20), pixelIcon('flower', 22)),
    h('div', { class: 'small muted' }, text),
  );
}

/** 波点分隔条（暖棕圆点） */
export function dotStrip(): HTMLElement {
  return h('div', { class: 'dot-strip' });
}

/** 行内像素小花装饰 */
export function pixelFlower(size = 16): SVGElement {
  return pixelIcon('flower', size);
}

/** 注入全局手绘抖动滤镜（供 .hand 使用） */
export function initDecor(): void {
  if (document.getElementById('wobble-filter')) return;
  const defs = svg('svg', { width: 0, height: 0, style: 'position:absolute;pointer-events:none', id: 'wobble-filter', 'aria-hidden': 'true' });
  const filter = svg('filter', { id: 'wobble', x: '-8%', y: '-8%', width: '116%', height: '116%' },
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.014 0.02', numOctaves: '2', seed: '7', result: 'noise' }),
    svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'noise', scale: '2.6', xChannelSelector: 'R', yChannelSelector: 'G' }),
  );
  defs.appendChild(filter);
  document.body.appendChild(defs);
}

/** 背景波点层（页面级，低透明度） */
export function backgroundDots(): HTMLElement {
  return h('div', {
    style: 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.4;'
      + 'background-image:radial-gradient(circle, var(--dot) 1.6px, transparent 1.8px);background-size:26px 26px;'
      + 'mask-image:linear-gradient(180deg,transparent,#000 22%,#000 68%,transparent);'
      + '-webkit-mask-image:linear-gradient(180deg,transparent,#000 22%,#000 68%,transparent)',
  });
}

export const decor = { grassField, splashArt, emptyForest, loadingForest, dotStrip, initDecor, backgroundDots, dogLine, pixelFlower };
