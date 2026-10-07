/* ==========================================================================
   modules/capsule.ts · 时光胶囊
   总览（在一起天数 / 下一个纪念日 / 可随时修改开始时间并自动重算）
   情侣日志 · 备忘录（同构：日期 + 文字 + 九宫格照片 + 编辑 / 删除）
   导出 TXT（按日期倒序）
   ========================================================================== */

import { h, mount } from '../ui/dom';
import {
  Button, Card, EmptyState, IconButton, SectionTitle, Stat, Toast,
  confirmDialog, openForm,
} from '../ui/components';
import { Gallery } from '../ui/gallery';
import { store } from '../core/store';
import { daysTogether, diffDays, fmtDate, nextAnniversary, today, WEEK_CN } from '../core/date';
import { exporter } from '../core/exporter';
import type { Couple, CoupleLog, Memo, ModuleCtx, ModuleDef } from '../types';

/* 单条记录：情侣日志与备忘录结构完全一致，只差表名 */
type LogTable = 'couple_logs' | 'memos';
type LogRow = CoupleLog | Memo;

interface LogConfig {
  table: LogTable;
  sub: string;
  title: string;
  one: string;
  emptyTip: string;
  icon: string;
  exportName: string;
}

const COUPLE_CFG: LogConfig = {
  table: 'couple_logs',
  sub: 'couple',
  title: '情侣日志',
  one: '日志',
  emptyTip: '写下今天想对 TA 说的话，配上照片，以后翻起来会很暖。',
  icon: 'heart',
  exportName: '情侣日志',
};

const MEMO_CFG: LogConfig = {
  table: 'memos',
  sub: 'memo',
  title: '备忘录',
  one: '备忘',
  emptyTip: '忽然想起的事情先记在这里，配上照片更容易回想起来。',
  icon: 'diary',
  exportName: '备忘录',
};

const CFGS: LogConfig[] = [COUPLE_CFG, MEMO_CFG];

/* ------------------------------ 小工具 ------------------------------ */
function dayMeta(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${date} 周${WEEK_CN[d.getDay()]}`;
}

function byDateDesc(a: { date: string; created_at: number }, b: { date: string; created_at: number }): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.created_at - a.created_at;
}

function rows(cfg: LogConfig): LogRow[] {
  return [...(store.list(cfg.table) as LogRow[])].sort(byDateDesc);
}

/** 顶部子页切换（'' 总览 · 'couple' 情侣日志 · 'memo' 备忘录） */
function tabs(ctx: ModuleCtx): HTMLElement {
  const items: Array<{ value: string; label: string; hash: string }> = [
    { value: '', label: '总览', hash: '#/capsule' },
    { value: 'couple', label: '情侣日志', hash: '#/capsule/couple' },
    { value: 'memo', label: '备忘录', hash: '#/capsule/memo' },
  ];
  return h('div', { class: 'row row-wrap mb-4' },
    ...items.map((it) => Button(it.label, {
      variant: ctx.sub === it.value ? 'primary' : 'soft',
      size: 'sm',
      onClick: () => ctx.go(it.hash),
    })),
  );
}

/* ------------------------------ 开始时间表单 ------------------------------ */
function editCoupleDialog(ctx: ModuleCtx): void {
  const cur = store.couple();
  openForm({
    title: cur ? '修改开始时间' : '设置在一起的日子',
    submitText: '保存',
    fields: [
      { name: 'title', label: '称呼 / 名称', value: cur?.title ?? '', placeholder: '例如：月月 & 小熊', span: 2, hint: '留空会显示为「我们」' },
      { name: 'start_date', label: '开始时间', type: 'date', value: cur?.start_date ?? today(), required: true, span: 2, hint: '随时可以修改，改完所有天数会自动重算' },
    ],
    onSubmit: async (v) => {
      await store.save('couple', {
        id: cur?.id,
        title: String(v.title ?? '').trim() || '我们',
        start_date: String(v.start_date),
      } as Partial<Couple>);
      Toast('已保存，天数已重新计算', 'success');
      await ctx.refresh('couple');
    },
  });
}

/* ------------------------------ 总览 ------------------------------ */
function overview(el: HTMLElement, ctx: ModuleCtx): void {
  const couple = store.couple();

  if (!couple?.start_date) {
    mount(el,
      tabs(ctx),
      Card({
        variant: 'green',
        decor: true,
        icon: 'capsule',
        title: '欢迎来到时光胶囊',
        body: EmptyState({
          icon: 'heart',
          title: '还没有设置开始时间',
          text: '设定在一起的那一天，之后所有的天数、纪念日都会自动为你计算。',
          action: Button('设置开始时间', { variant: 'primary', icon: 'plus', onClick: () => editCoupleDialog(ctx) }),
        }),
      }),
    );
    return;
  }

  const start = couple.start_date;
  const days = daysTogether(start);
  const next = nextAnniversary(start);
  const logs = rows(COUPLE_CFG);
  const memos = rows(MEMO_CFG);
  const photoCount = [...logs, ...memos].reduce((s, l) => s + (l.photos?.length ?? 0), 0);

  mount(el,
    tabs(ctx),
    Card({
      variant: 'green',
      decor: true,
      icon: 'heart',
      title: `${couple.title || '我们'} · 在一起 ${days} 天`,
      subtitle: `从 ${fmtDate(start, 'full')} 开始`,
      actions: [
        Button('修改开始时间', { variant: 'soft', icon: 'edit', size: 'sm', onClick: () => editCoupleDialog(ctx) }),
        Button('导出为 TXT', { variant: 'ghost', icon: 'download', size: 'sm', onClick: () => void exportAll(ctx) }),
      ],
      body: [
        h('div', { class: 'grid grid-auto' },
          Stat({ label: '在一起', value: days, unit: '天', tone: 'green', icon: 'heart' }),
          Stat({ label: '距离下一个纪念日', value: next.days, unit: '天', tone: 'honey', icon: 'gift' }),
          Stat({ label: '情侣日志', value: logs.length, unit: '篇', tone: 'oak', icon: 'diary' }),
          Stat({ label: '备忘录', value: memos.length, unit: '条', tone: 'oak', icon: 'list' }),
          Stat({ label: '照片', value: photoCount, unit: '张', tone: 'green', icon: 'image' }),
        ),
        h('div', { class: 'mt-3' },
          h('div', { class: 'small' }, '下一个纪念日：', h('strong', null, next.label)),
          h('div', { class: 'tiny muted mt-2' },
            `${next.date} · ${fmtDate(next.date)} · ${next.days === 0 ? '就是今天！' : `还有 ${next.days} 天`}`),
        ),
        h('div', { class: 'tiny muted mt-2' },
          `开始时间可以随时修改（右上角「修改开始时间」），保存后「在一起天数」与纪念日会自动重算。`),
      ],
    }),
    SectionTitle('快捷入口', { icon: 'capsule' }),
    h('div', { class: 'grid grid-2' },
      Card({
        icon: 'heart',
        title: '情侣日志',
        body: [
          h('div', { class: 'small muted' }, `共 ${logs.length} 篇 · ${logs.reduce((s, l) => s + (l.photos?.length ?? 0), 0)} 张照片`),
          h('div', { class: 'row row-wrap mt-3' },
            Button('去写一篇', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => ctx.go('#/capsule/couple') }),
            logs[0] ? Button('导出 TXT', { variant: 'ghost', icon: 'download', size: 'sm', onClick: () => void exportOne(COUPLE_CFG) }) : null,
          ),
        ],
        footer: logs[0]
          ? [h('span', { class: 'tiny muted' }, `最近一篇：${logs[0].date} · ${String(logs[0].text ?? '').slice(0, 24) || '（无文字）'}`)]
          : undefined,
      }),
      Card({
        icon: 'diary',
        title: '备忘录',
        body: [
          h('div', { class: 'small muted' }, `共 ${memos.length} 条 · ${memos.reduce((s, l) => s + (l.photos?.length ?? 0), 0)} 张照片`),
          h('div', { class: 'row row-wrap mt-3' },
            Button('去记一条', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => ctx.go('#/capsule/memo') }),
            memos[0] ? Button('导出 TXT', { variant: 'ghost', icon: 'download', size: 'sm', onClick: () => void exportOne(MEMO_CFG) }) : null,
          ),
        ],
        footer: memos[0]
          ? [h('span', { class: 'tiny muted' }, `最近一条：${memos[0].date} · ${String(memos[0].text ?? '').slice(0, 24) || '（无文字）'}`)]
          : undefined,
      }),
    ),
    h('div', { class: 'tiny muted mt-3' },
      '金币小规则：情侣日志或备忘录的单条文字 ≥100 字且带照片时，当天会自动获得「记录套餐 +0.5」金币（每天最多一次）。'),
  );
}

/* ------------------------------ 新增 / 编辑 ------------------------------ */
function openLogForm(cfg: LogConfig, ctx: ModuleCtx, row?: LogRow): void {
  openForm({
    title: row ? `编辑${cfg.one}` : `新增${cfg.one}`,
    width: 'wide',
    fields: [
      { name: 'date', label: '日期', type: 'date', value: row?.date ?? today(), required: true },
      { name: 'text', label: '内容', type: 'textarea', rows: 6, value: row?.text ?? '', placeholder: `写下你的${cfg.one}…`, span: 2 },
      { name: 'photos', label: '照片', type: 'photos', value: row?.photos ?? [], span: 2, hint: '自动压缩为 WebP（≤200KB），点缩略图可全屏查看' },
    ],
    onSubmit: async (v) => {
      await store.save(cfg.table, {
        id: row?.id,
        date: String(v.date),
        text: String(v.text ?? ''),
        photos: Array.isArray(v.photos) ? (v.photos as string[]) : [],
      } as Partial<LogRow>);
      Toast(row ? '已更新' : '已保存', 'success');
      await ctx.refresh(cfg.table);
    },
  });
}

async function removeLog(cfg: LogConfig, row: LogRow, ctx: ModuleCtx): Promise<void> {
  const ok = await confirmDialog(`删除这条${cfg.one}？`, `${row.date} · ${String(row.text ?? '').slice(0, 30) || '（无文字）'}`, { danger: true });
  if (!ok) return;
  await store.drop(cfg.table, row.id);
  Toast('已删除', 'success');
  await ctx.refresh(cfg.table);
}

/* ------------------------------ 导出 ------------------------------ */
function buildText(cfg: LogConfig, list: LogRow[]): string {
  const couple = store.couple();
  const lines: string[] = [];
  lines.push(`月月的工作台 · ${cfg.title}`);
  if (cfg.table === 'couple_logs' && couple?.start_date) {
    lines.push(`在一起：${daysTogether(couple.start_date)} 天（自 ${couple.start_date}）`);
  }
  lines.push(`导出时间：${today()} · 共 ${list.length} 条`);
  lines.push('');
  for (const l of list) {
    lines.push(`【${dayMeta(l.date)}】`);
    const text = String(l.text ?? '').trim();
    lines.push(text || '（无文字）');
    const n = l.photos?.length ?? 0;
    if (n) lines.push(`（照片 ${n} 张，请在应用内查看）`);
    lines.push('');
  }
  if (!list.length) lines.push('（暂时还没有记录）');
  return lines.join('\n');
}

async function exportOne(cfg: LogConfig): Promise<void> {
  try {
    const list = rows(cfg);
    await exporter.shareOrDownload(`${cfg.exportName}-${today()}.txt`, buildText(cfg, list), cfg.title);
    Toast('已导出 TXT', 'success');
  } catch (err) {
    console.warn('[capsule] 导出失败', err);
    Toast('导出失败，请稍后重试', 'error');
  }
}

async function exportAll(_ctx: ModuleCtx): Promise<void> {
  try {
    const couple = store.couple();
    const blocks: string[] = [];
    blocks.push('月月的工作台 · 时光胶囊全量导出');
    blocks.push(`导出时间：${today()}`);
    if (couple?.start_date) {
      blocks.push(`在一起：${daysTogether(couple.start_date)} 天（自 ${couple.start_date}）`);
      const next = nextAnniversary(couple.start_date);
      blocks.push(`下一个纪念日：${next.label} · ${next.date} · 还有 ${next.days} 天`);
    }
    blocks.push('');
    for (const cfg of CFGS) {
      blocks.push('========================================');
      blocks.push(`【${cfg.title}】共 ${rows(cfg).length} 条`);
      blocks.push('========================================');
      blocks.push('');
      blocks.push(buildText(cfg, rows(cfg)));
      blocks.push('');
    }
    await exporter.shareOrDownload(`时光胶囊-${today()}.txt`, blocks.join('\n'), '时光胶囊');
    Toast('已导出 TXT', 'success');
  } catch (err) {
    console.warn('[capsule] 导出失败', err);
    Toast('导出失败，请稍后重试', 'error');
  }
}

/* ------------------------------ 日志 / 备忘录页面 ------------------------------ */
function logPage(el: HTMLElement, ctx: ModuleCtx, cfg: LogConfig): void {
  const list = rows(cfg);
  const photoTotal = list.reduce((s, l) => s + (l.photos?.length ?? 0), 0);
  const charTotal = list.reduce((s, l) => s + String(l.text ?? '').length, 0);
  const avg = list.length ? Math.round(charTotal / list.length) : 0;

  const cards = list.map((row) => {
    const body: Array<Node | string> = [h('div', { class: 'article-body' }, String(row.text ?? '') || '（无文字）')];
    if (row.photos?.length) {
      body.push(h('div', { class: 'mt-3' }, Gallery(row.photos, { cols: 3 })));
    }
    return Card({
      className: 'no-card-click',
      icon: cfg.icon,
      title: dayMeta(row.date),
      subtitle: `${String(row.text ?? '').length} 字${row.photos?.length ? ` · ${row.photos.length} 张照片` : ''}`,
      actions: [
        IconButton('edit', { title: '编辑', onClick: () => openLogForm(cfg, ctx, row) }),
        IconButton('trash', { title: '删除', onClick: () => void removeLog(cfg, row, ctx) }),
      ],
      body,
    });
  });

  mount(el,
    tabs(ctx),
    Card({
      variant: 'green',
      decor: true,
      icon: cfg.icon,
      title: cfg.title,
      actions: [
        Button(`新增${cfg.one}`, { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => openLogForm(cfg, ctx) }),
        Button('导出为 TXT', { variant: 'ghost', icon: 'download', size: 'sm', onClick: () => void exportOne(cfg) }),
      ],
      body: [
        h('div', { class: 'grid grid-auto' },
          Stat({ label: `${cfg.one}总数`, value: list.length, unit: '条', tone: 'green', icon: cfg.icon }),
          Stat({ label: '照片总数', value: photoTotal, unit: '张', tone: 'honey', icon: 'image' }),
          Stat({ label: '平均字数', value: avg, unit: '字', tone: 'oak', icon: 'edit' }),
        ),
        h('div', { class: 'tiny muted mt-3' },
          `金币小规则：单条文字 ≥100 字且含照片时，当天自动获得「记录套餐 +0.5」金币（每天最多一次）。`),
      ],
    }),
    list.length
      ? h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1fr)' }, ...cards)
      : Card({
        body: EmptyState({
          icon: cfg.icon,
          title: `还没有${cfg.one}`,
          text: cfg.emptyTip,
          action: Button(`新增${cfg.one}`, { variant: 'primary', icon: 'plus', onClick: () => openLogForm(cfg, ctx) }),
        }),
      }),
  );
}

/* ------------------------------ 模块 ------------------------------ */
export const capsuleModule: ModuleDef = {
  id: 'capsule',
  title: '时光胶囊',
  icon: 'capsule',
  order: 5,
  desc: '情侣日志 · 备忘录 · 纪念日',

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    try {
      if (ctx.sub === 'couple') logPage(el, ctx, COUPLE_CFG);
      else if (ctx.sub === 'memo') logPage(el, ctx, MEMO_CFG);
      else overview(el, ctx);
    } catch (err) {
      console.error('[capsule] 渲染失败', err);
      mount(el, Card({
        icon: 'capsule',
        title: '时光胶囊暂时打了个盹',
        body: EmptyState({
          icon: 'seed',
          title: '加载失败',
          text: err instanceof Error ? err.message : String(err),
          action: Button('重新加载', { variant: 'primary', icon: 'refresh', onClick: () => void ctx.refresh('couple_logs') }),
        }),
      }));
      Toast('时光胶囊加载失败', 'error');
    }
  },

  badge(): number {
    const start = store.couple()?.start_date;
    if (!start) return 0;
    const next = nextAnniversary(start);
    const left = diffDays(next.date, today());
    return left <= 7 ? 1 : 0;
  },
};
