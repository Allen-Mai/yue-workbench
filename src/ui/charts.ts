/* ==========================================================================
   ui/charts.ts · 纯手写 SVG 图表（零依赖 · 只用主题绿/棕/蜂蜜黄）
   ========================================================================== */

import { svg, h } from './dom';
import { fmtMoney } from '../core/date';

export const CHART_COLORS = ['#5A7A4A', '#7DBF8A', '#A8BBA0', '#C4A882', '#E8A87C', '#F0D58C', '#D64550', '#2D5A3D', '#9A7B52', '#DCC9A6'];

export interface LinePoint { x: string; y: number }
export interface LineSeries { name: string; color?: string; points: LinePoint[] }

export interface LineChartOptions {
  series: LineSeries[];
  height?: number;
  width?: number;
  area?: boolean;
  yFormat?: (n: number) => string;
  showDots?: boolean;
  gridLines?: number;
}

/** 折线图（周/月趋势） */
export function lineChart(opts: LineChartOptions): SVGElement {
  const width = opts.width ?? 640;
  const height = opts.height ?? 220;
  const pad = { top: 16, right: 14, bottom: 30, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const series = opts.series.filter((s) => s.points.length);
  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const allValues = series.flatMap((s) => s.points.map((p) => p.y));
  const maxV = Math.max(1, ...allValues);
  const minV = Math.min(0, ...allValues);
  const span = maxV - minV || 1;
  const fmt = opts.yFormat ?? ((n: number) => String(Math.round(n)));

  const root = svg('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '折线图',
  });

  const xAt = (i: number) => pad.left + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const yAt = (v: number) => pad.top + innerH - ((v - minV) / span) * innerH;

  // 网格 + Y 轴刻度
  const lines = Math.max(2, opts.gridLines ?? 4);
  for (let i = 0; i <= lines; i++) {
    const v = minV + (span * i) / lines;
    const y = yAt(v);
    root.appendChild(svg('line', { class: 'grid-line', x1: pad.left, y1: y, x2: width - pad.right, y2: y }));
    root.appendChild(svg('text', { x: pad.left - 7, y: y + 3.5, 'text-anchor': 'end' }, fmt(v)));
  }
  // X 轴标签（最多 7 个，避免拥挤）
  const step = Math.max(1, Math.ceil(labels.length / 7));
  labels.forEach((lb, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    root.appendChild(svg('text', { x: xAt(i), y: height - 9, 'text-anchor': 'middle' }, lb));
  });

  series.forEach((s, si) => {
    const color = s.color ?? CHART_COLORS[si % CHART_COLORS.length];
    const pts = s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ');
    if (opts.area !== false && series.length === 1) {
      root.appendChild(svg('polygon', {
        class: 'series-area',
        points: `${pad.left},${pad.top + innerH} ${pts} ${xAt(s.points.length - 1)},${pad.top + innerH}`,
        fill: color,
      }));
    }
    root.appendChild(svg('polyline', { class: 'series-line', points: pts, stroke: color }));
    if (opts.showDots !== false && s.points.length <= 32) {
      s.points.forEach((p, i) => {
        root.appendChild(svg('circle', { class: 'dot', cx: xAt(i), cy: yAt(p.y), r: 2.8, fill: color },
          svg('title', null, `${p.x}：${fmt(p.y)}`)));
      });
    }
  });

  return root;
}

export interface BarItem { label: string; value: number; color?: string }

/** 柱状图（金币明细 / 收支对比） */
export function barChart(opts: { items: BarItem[]; height?: number; width?: number; valueFormat?: (n: number) => string; horizontal?: boolean }): SVGElement | HTMLElement {
  const items = opts.items.filter(Boolean);
  const fmt = opts.valueFormat ?? ((n: number) => String(Math.round(n * 10) / 10));
  if (!items.length) return emptyChart();

  if (opts.horizontal) {
    const width = opts.width ?? 640;
    const rowH = 34;
    const height = opts.height ?? items.length * rowH + 16;
    const labelW = 78;
    const maxV = Math.max(1, ...items.map((i) => i.value));
    const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '柱状图' });
    items.forEach((it, i) => {
      const y = 8 + i * rowH;
      const w = ((width - labelW - 60) * it.value) / maxV;
      root.appendChild(svg('text', { x: labelW - 8, y: y + 15, 'text-anchor': 'end' }, it.label));
      root.appendChild(svg('rect', { class: 'bar', x: labelW, y, width: Math.max(2, w), height: 20, fill: it.color ?? CHART_COLORS[i % CHART_COLORS.length] }));
      root.appendChild(svg('text', { x: labelW + Math.max(2, w) + 7, y: y + 15 }, fmt(it.value)));
    });
    return root;
  }

  const width = opts.width ?? 640;
  const height = opts.height ?? 220;
  const pad = { top: 20, right: 12, bottom: 32, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxV = Math.max(1, ...items.map((i) => i.value));
  const slot = innerW / items.length;
  const barW = Math.min(46, slot * 0.6);
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '柱状图' });

  for (let i = 0; i <= 4; i++) {
    const v = (maxV * i) / 4;
    const y = pad.top + innerH - (v / maxV) * innerH;
    root.appendChild(svg('line', { class: 'grid-line', x1: pad.left, y1: y, x2: width - pad.right, y2: y }));
    root.appendChild(svg('text', { x: pad.left - 7, y: y + 3.5, 'text-anchor': 'end' }, fmt(v)));
  }
  items.forEach((it, i) => {
    const bh = Math.max(it.value > 0 ? 3 : 0, (it.value / maxV) * innerH);
    const x = pad.left + slot * i + (slot - barW) / 2;
    const y = pad.top + innerH - bh;
    root.appendChild(svg('rect', { class: 'bar', x, y, width: barW, height: bh, fill: it.color ?? CHART_COLORS[i % CHART_COLORS.length] },
      svg('title', null, `${it.label}：${fmt(it.value)}`)));
    root.appendChild(svg('text', { x: x + barW / 2, y: height - 10, 'text-anchor': 'middle' }, it.label));
    if (it.value > 0) root.appendChild(svg('text', { x: x + barW / 2, y: y - 6, 'text-anchor': 'middle' }, fmt(it.value)));
  });
  return root;
}

export interface PieItem { label: string; value: number; color?: string }

/** 饼图 / 环形图（支出结构、收入结构） */
export function pieChart(opts: { items: PieItem[]; size?: number; donut?: boolean; valueFormat?: (n: number) => string }): SVGElement | HTMLElement {
  const items = opts.items.filter((i) => i.value > 0);
  if (!items.length) return emptyChart();
  const size = opts.size ?? 240;
  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const total = items.reduce((s, i) => s + i.value, 0);
  const fmt = opts.valueFormat ?? ((n: number) => fmtMoney(n, 0));
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': '饼图' });

  let angle = -Math.PI / 2;
  items.forEach((it, i) => {
    const sweep = (it.value / total) * Math.PI * 2;
    const end = angle + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const d = sweep >= Math.PI * 1.999
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    const path = svg('path', { class: 'slice', d, fill: it.color ?? CHART_COLORS[i % CHART_COLORS.length] },
      svg('title', null, `${it.label}：${fmt(it.value)}（${((it.value / total) * 100).toFixed(1)}%）`));
    root.appendChild(path);
    angle = end;
  });

  if (opts.donut !== false) {
    root.appendChild(svg('circle', { cx, cy, r: r * 0.56, fill: 'var(--card-solid)' }));
    root.appendChild(svg('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', style: 'font-size:13px;fill:var(--ink-faint)' }, '合计'));
    root.appendChild(svg('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', style: 'font-size:16px;font-weight:700;fill:var(--ink)' }, fmt(total)));
  }
  return root;
}

/** 迷你走势线（金价、余额） */
export function sparkline(values: number[], color = CHART_COLORS[0], width = 160, height = 44): SVGElement {
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': '走势' });
  const vals = values.length ? values : [0, 0];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / Math.max(1, vals.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((v - min) / span) * (height - 10);
    return `${x},${y}`;
  });
  root.appendChild(svg('polyline', { class: 'series-line', points: pts.join(' '), stroke: color }));
  const last = pts[pts.length - 1].split(',');
  root.appendChild(svg('circle', { cx: last[0], cy: last[1], r: 2.6, fill: color }));
  return root;
}

/** 打卡热力图（近 N 天） */
export function heatmap(days: Array<{ date: string; value: number }>, color = CHART_COLORS[0]): SVGElement {
  const cell = 14;
  const gap = 3;
  const cols = Math.min(7, days.length);
  const rows = Math.ceil(days.length / 7);
  const width = cols * (cell + gap);
  const height = rows * (cell + gap);
  const max = Math.max(1, ...days.map((d) => d.value));
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': '打卡热力图' });
  days.forEach((d, i) => {
    const x = (i % 7) * (cell + gap);
    const y = Math.floor(i / 7) * (cell + gap);
    root.appendChild(svg('rect', {
      x, y, width: cell, height: cell, rx: 3,
      fill: d.value > 0 ? color : 'var(--line-soft)',
      opacity: d.value > 0 ? 0.25 + 0.75 * (d.value / max) : 1,
    }, svg('title', null, `${d.date}：${d.value}`)));
  });
  return root;
}

export function emptyChart(text = '暂无数据'): HTMLElement {
  return h('div', { class: 'chart-empty' }, text);
}

export function Legend(items: PieItem[]): HTMLElement {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return h('div', { class: 'chart-legend' },
    ...items.map((it, i) =>
      h('span', null,
        h('i', { style: `background:${it.color ?? CHART_COLORS[i % CHART_COLORS.length]}` }),
        `${it.label} ${((it.value / total) * 100).toFixed(0)}%`,
      ),
    ),
  );
}

/** 图表卡片：图 + 图例一体 */
export function ChartBlock(opts: { title?: string; chart: Node; legend?: Node; note?: string }): HTMLElement {
  return h('div', { class: 'chart-wrap' },
    h('div', null, opts.chart as Node),
    opts.legend ?? null,
    opts.note ? h('div', { class: 'tiny muted mt-2' }, opts.note) : null,
  );
}

export const charts = { lineChart, barChart, pieChart, sparkline, heatmap, Legend, emptyChart };
