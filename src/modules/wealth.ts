/* ==========================================================================
   modules/wealth.ts · 财富工坊
   记账（可变/固定/收入）· 花销分析 · 收入管理 · 固定支出自动扣减
   购买清单 · 心愿兑换（金币 1:1）· 实时金价 + 到价提醒
   —— 零依赖，全部走 store / db 写入；金额一律 number + fmtMoney 展示
   ========================================================================== */

import { h, clear, mount } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, ListRow, ProgressBar, SectionTitle, Segmented,
  Stat, Tag, Toast, confirmDialog, openForm, promptDialog,
} from '../ui/components';
import { lineChart, pieChart, sparkline, Legend, emptyChart } from '../ui/charts';
import { Gallery, Lightbox } from '../ui/gallery';
import { store } from '../core/store';
import { notify } from '../core/notify';
import { settleDay } from '../core/coins';
import { addDays, diffDays, fmtDate, fmtMoney, monthRange, today, ym, ymd } from '../core/date';
import {
  ACCOUNT_META, DAILY_BASE, FIXED_CATEGORIES, INCOME_CATEGORIES, QUICK_FIXED,
  QUICK_INCOME, QUICK_VARIABLE, VARIABLE_CATEGORIES,
} from '../data/presets';
import type {
  AccountKind, FixedItem, GoldPrice, ModuleCtx, ModuleDef, ShoppingItem,
  Transaction, TxKind, Wish,
} from '../types';

/* ==========================================================================
   通用小工具
   ========================================================================== */

const WISH_TIERS: Array<10 | 20 | 50 | 100> = [10, 20, 50, 100];

/** 金额归一：保留两位，避免浮点累积误差 */
function money(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}

function moneyOf(v: unknown): number {
  return money(Number(v ?? 0));
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  const s = v == null ? '' : String(v).trim();
  return s || fallback;
}

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function validDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** 某月天数（'YYYY-MM'） */
function daysInMonthStr(month: string): number {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/** 某月日常账户月额度 = 当月天数 × 50 */
function monthQuota(month = ym(today())): number {
  return money(daysInMonthStr(month) * DAILY_BASE);
}

/** 'YYYY-MM' → 'M月' */
function monthCN(month: string): string {
  const m = Number(String(month).slice(5, 7));
  return `${m || 0}月`;
}

/** 某月可变支出合计 */
function variableSpendOf(month: string): number {
  const prefix = `${month}-`;
  return money(store
    .list('transactions')
    .filter((t) => t.kind === 'variable' && String(t.date).startsWith(prefix))
    .reduce((s, t) => s + num(t.amount), 0));
}

/** 当月可变支出合计（含今天） */
function variableSpendThisMonth(date = today()): number {
  return variableSpendOf(ym(date));
}

function fixedSpendOf(month: string): number {
  const prefix = `${month}-`;
  return money(store
    .list('transactions')
    .filter((t) => t.kind === 'fixed' && String(t.date).startsWith(prefix))
    .reduce((s, t) => s + num(t.amount), 0));
}

function incomeOf(month: string): number {
  const prefix = `${month}-`;
  return money(store
    .list('transactions')
    .filter((t) => t.kind === 'income' && String(t.date).startsWith(prefix))
    .reduce((s, t) => s + num(t.amount), 0));
}

/** 交易对账户的净影响（支出为负、收入为正） */
function accountDelta(kind: TxKind, amount: number): number {
  const a = money(amount);
  if (kind === 'income' || kind === 'wish') return a;
  return money(-a);
}

/** 账户影响展示 */
function deltaLabel(kind: TxKind, amount: number): string {
  const d = accountDelta(kind, amount);
  return `${d >= 0 ? '+' : '−'}${fmtMoney(Math.abs(d))}`;
}

const KIND_META: Record<TxKind, { label: string; icon: string; tone: 'green' | 'red' | 'honey' | 'oak'; account: AccountKind }> = {
  variable: { label: '可变支出', icon: 'cart', tone: 'oak', account: 'daily' },
  fixed: { label: '固定支出', icon: 'home', tone: 'red', account: 'fixed' },
  income: { label: '收入', icon: 'income', tone: 'green', account: 'income' },
  coin: { label: '金币', icon: 'coin', tone: 'honey', account: 'coin' },
  wish: { label: '心愿', icon: 'gift', tone: 'honey', account: 'wish' },
};

function categoriesOf(kind: TxKind): string[] {
  if (kind === 'fixed') return FIXED_CATEGORIES;
  if (kind === 'income') return INCOME_CATEGORIES;
  return VARIABLE_CATEGORIES;
}

function goldHistory(): GoldPrice[] {
  return store
    .list('gold_prices')
    .filter((g) => !!g.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** 异步入口统一错误兜底 */
async function guard(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[wealth] ${label}`, err);
    Toast(err instanceof Error && err.message ? err.message : `${label}失败，请稍后重试`, 'error');
  }
}

/* ==========================================================================
   一、账务写入（可变 / 固定 / 收入）
   ========================================================================== */

/**
 * 写一笔流水并同步账户余额 + 结算当日省钱金币。
 * 注意：可变支出必须由调用方先确认额度。
 */
async function saveTx(input: {
  kind: TxKind; amount: number; category: string; date: string; note: string; photos: string[];
}): Promise<void> {
  const kind = input.kind;
  const amount = money(input.amount);
  const date = validDate(input.date) ? input.date : today();
  await store.save('transactions', {
    kind,
    amount,
    category: str(input.category, '其它'),
    date,
    note: String(input.note ?? ''),
    photos: Array.isArray(input.photos) ? input.photos.slice(0, 6) : [],
  } as Partial<Transaction>);
  await store.adjustBalance(KIND_META[kind].account, accountDelta(kind, amount));
  // 省钱金币按当日可变支出重新结算（幂等）
  await settleDay(date, true);
}

async function deleteTx(tx: Transaction, ctx: ModuleCtx): Promise<void> {
  const meta = KIND_META[tx.kind] ?? KIND_META.variable;
  const ok = await confirmDialog(
    '删除这笔流水？',
    `${fmtDate(tx.date, 'cn')} · ${tx.category || '未分类'} · ${fmtMoney(tx.amount)} 元。删除后会把这笔钱退回对应账户（${ACCOUNT_META[meta.account].name}）。`,
    { danger: true },
  );
  if (!ok) return;
  await store.drop('transactions', tx.id);
  await store.adjustBalance(meta.account, money(-accountDelta(tx.kind, tx.amount)));
  await settleDay(tx.date, true);
  Toast('已删除并回滚账户余额', 'success');
  rerender(ctx);
}

/** 记账 / 编辑表单 */
function openTxForm(kind: TxKind, ctx: ModuleCtx, initial?: Transaction): void {
  const cats = categoriesOf(kind);
  const isIncome = kind === 'income';
  openForm({
    title: `${initial ? '编辑' : '记一笔'}${KIND_META[kind].label}`,
    width: 'normal',
    fields: [
      { name: 'kind', label: '类型', type: 'select', value: kind, span: 2, options: [
        { value: 'variable', label: '可变支出 · 走日常账户（占月额度）' },
        { value: 'fixed', label: '固定支出 · 走固定账户（不占额度）' },
        { value: 'income', label: '收入 · 走收入账户（独立统计）' },
      ] },
      { name: 'amount', label: '金额（元）', type: 'money', value: initial ? initial.amount : '', required: true, min: 0.01, step: 0.01, span: 2, hint: isIncome ? '收入金额' : '支出金额' },
      { name: 'category', label: '类别', type: 'select', value: initial?.category ?? cats[0], options: cats },
      { name: 'date', label: '日期', type: 'date', value: initial?.date ?? today(), required: true },
      { name: 'note', label: '备注', value: initial?.note ?? '', placeholder: '买了什么 / 从哪来，可留空', span: 2 },
      { name: 'photos', label: '照片（可选）', type: 'photos', value: initial?.photos ?? [], span: 2, hint: '小票 / 实物照片，自动压缩为 WebP' },
    ],
    onSubmit: async (v) => {
      const k = (String(v.kind || kind) as TxKind);
      const amount = moneyOf(v.amount);
      const date = str(v.date, today());
      if (!validDate(date)) throw new Error('日期格式不正确');
      if (amount <= 0) throw new Error('金额必须大于 0');

      if (k === 'variable') {
        // 额度检查：本月已用 + 本次
        const month = ym(date);
        const used = variableSpendOf(month);
        const quota = monthQuota(month);
        const next = money(used + amount);
        if (next > quota) {
          const ok = await confirmDialog(
            used >= quota ? '本月日常额度已耗尽' : '即将超出本月日常额度',
            `本月日常额度 ${fmtMoney(quota)} 元，已用 ${fmtMoney(used)} 元；再加这一笔 ${fmtMoney(amount)} 元就是 ${fmtMoney(next)} 元，超出 ${fmtMoney(next - quota)} 元。\n\n确认后仍会记账，但本月省钱奖励（金币）基本拿不到了。`,
            { danger: true, okText: '仍然记账' },
          );
          if (!ok) throw new Error('已取消：本月日常额度不足');
        }
      }
      if (initial) {
        if (initial.kind !== k) {
          await store.drop('transactions', initial.id);
          await store.adjustBalance(KIND_META[initial.kind].account, money(-accountDelta(initial.kind, initial.amount)));
        } else {
          await store.adjustBalance(KIND_META[k].account, money(-accountDelta(k, initial.amount)));
        }
      }
      await saveTx({ kind: k, amount, category: str(v.category, cats[0]), date, note: String(v.note ?? ''), photos: (v.photos as string[]) ?? [] });
      Toast(initial ? '已更新流水' : '已记账', 'success');
      rerender(ctx);
    },
  });
}

/** 快速记账按钮组（点一下即以该类别打开表单） */
function quickEntry(ctx: ModuleCtx): HTMLElement {
  const group = (label: string, kind: TxKind, cats: string[]): HTMLElement =>
    h('div', { class: 'row row-wrap', style: 'gap:6px;align-items:center;margin-bottom:8px' },
      h('span', { class: 'tiny muted', style: 'min-width:66px' }, label),
      ...cats.map((c) => Button(c, {
        variant: kind === 'income' ? 'soft' : kind === 'fixed' ? 'ghost' : 'default',
        size: 'sm',
        icon: KIND_META[kind].icon,
        onClick: () => openTxForm(kind, ctx),
      })),
      h('span', { class: 'tiny muted' }, `（以「${cats[0]}」以外的类别保存后可在列表里改）`),
    );

  return Card({
    icon: 'money',
    title: '快速记账',
    subtitle: '点一下就打开表单，类别已选好，填金额即可',
    body: [
      group('可变支出', 'variable', QUICK_VARIABLE),
      group('固定支出', 'fixed', QUICK_FIXED),
      group('收入记录', 'income', QUICK_INCOME),
      h('div', { class: 'row row-wrap mt-2' },
        Button('可变支出 · 其它', { variant: 'soft', size: 'sm', icon: 'plus', onClick: () => openTxForm('variable', ctx) }),
        Button('固定支出 · 其它', { variant: 'soft', size: 'sm', icon: 'plus', onClick: () => openTxForm('fixed', ctx) }),
        Button('收入 · 其它', { variant: 'soft', size: 'sm', icon: 'plus', onClick: () => openTxForm('income', ctx) }),
      ),
    ],
    footer: [h('span', { class: 'tiny muted' }, '可变支出占日常额度（当月天数 × 50 元）· 固定支出走固定账户不占额度 · 收入独立统计，两者都不参与省钱奖励。')],
  });
}

/* ==========================================================================
   页面重渲染
   ========================================================================== */

function rerender(ctx: ModuleCtx): void {
  void (async () => {
    try {
      await ctx.refresh('wealth');
      ctx.go(`#/wealth${ctx.sub ? `/${ctx.sub}` : ''}`);
    } catch (err) {
      console.error('[wealth] rerender', err);
      Toast('刷新失败，请手动切换页面重试', 'error');
    }
  })();
}

/* ==========================================================================
   流水列表
   ========================================================================== */

function txRow(tx: Transaction, ctx: ModuleCtx): HTMLElement {
  const meta = KIND_META[tx.kind] ?? KIND_META.variable;
  const first = (tx.photos ?? [])[0];
  const row = ListRow({
    thumb: first || undefined,
    icon: first ? undefined : meta.icon,
    title: `${tx.category || '未分类'} · ${fmtMoney(tx.amount)} 元`,
    meta: [
      fmtDate(tx.date, 'md'),
      tx.note ? tx.note : '',
      meta.label,
      `账户：${ACCOUNT_META[meta.account].name}`,
    ].filter(Boolean).join(' · '),
    right: h('span', { style: 'display:flex;gap:2px;align-items:center' },
      Tag(deltaLabel(tx.kind, tx.amount), accountDelta(tx.kind, tx.amount) >= 0 ? 'green' : 'red'),
      IconButton('edit', { title: '编辑这笔流水', onClick: (e) => { e.stopPropagation(); openTxForm(tx.kind, ctx, tx); } }),
      IconButton('trash', { title: '删除并回滚余额', onClick: (e) => { e.stopPropagation(); void guard('删除流水', () => deleteTx(tx, ctx)); } }),
    ),
  });

  const photos = tx.photos ?? [];
  if (photos.length) {
    row.style.cursor = 'zoom-in';
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, a, input, .no-card-click')) return;
      Lightbox(photos, 0);
    });
  }
  return row;
}

function txListCard(title: string, rows: Transaction[], ctx: ModuleCtx, emptyText: string): HTMLElement {
  return Card({
    icon: 'list',
    title,
    body: rows.length
      ? h('div', { class: 'list' }, ...rows.map((t) => txRow(t, ctx)))
      : EmptyState({ icon: 'money', title: '还没有流水', text: emptyText }),
  });
}

/* ==========================================================================
   二、花销分析（趋势 + 结构）
   ========================================================================== */

interface TrendPoint { x: string; y: number }

function trendPoints(range: string): TrendPoint[] {
  const ref = today();
  if (range === 'm12') {
    const out: TrendPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)) - 1 - i, 1, 12, 0, 0, 0);
      const month = ym(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
      out.push({ x: monthCN(month), y: variableSpendOf(month) });
    }
    return out;
  }
  const days = range === 'd7' ? 7 : 30;
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(ref, -i);
    const v = money(store
      .list('transactions')
      .filter((t) => t.kind === 'variable' && t.date === date)
      .reduce((s, t) => s + num(t.amount), 0));
    out.push({ x: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`, y: v });
  }
  return out;
}

function variableByCategory(month: string): Array<{ label: string; value: number }> {
  const prefix = `${month}-`;
  const map = new Map<string, number>();
  for (const t of store.list('transactions')) {
    if (t.kind !== 'variable' || !String(t.date).startsWith(prefix)) continue;
    const key = t.category || '未分类';
    map.set(key, money((map.get(key) ?? 0) + num(t.amount)));
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function analysisCards(ctx: ModuleCtx): HTMLElement[] {
  const month = ym(today());
  const rangeKey = store.setting<string>('wealthTrendRange', 'd30');
  const quota = monthQuota(month);
  const used = variableSpendThisMonth();
  const remain = money(quota - used);
  const days = daysInMonthStr(month);
  const avg = money(used / Math.max(1, days));

  const points = trendPoints(rangeKey);
  const trendChart = points.some((p) => p.y > 0)
    ? lineChart({
      series: [{ name: '可变支出', color: '#5A7A4A', points }],
      height: 220,
      yFormat: (n) => fmtMoney(n, 0),
    })
    : emptyChart('这段时间还没有可变支出记录');

  const trendCard = Card({
    icon: 'chart',
    title: '可变支出趋势',
    actions: [Segmented([
      { value: 'd7', label: '近 7 天' },
      { value: 'd30', label: '近 30 天' },
      { value: 'm12', label: '近 12 个月' },
    ], {
      value: rangeKey,
      onChange: (v) => {
        void (async () => {
          await store.setSetting('wealthTrendRange', v);
          rerender(ctx);
        })();
      },
    })],
    body: [
      trendChart,
      h('div', { class: 'tiny muted mt-2' }, rangeKey === 'm12'
        ? '按月份聚合：每月全部可变支出合计（含固定支出以外的所有日常开销）。'
        : `按天聚合：${rangeKey === 'd7' ? '近 7 天' : '近 30 天'}每天的可变支出合计。`),
    ],
    footer: [h('span', { class: 'tiny muted' }, '只想减少可变支出：固定支出走另一本账，金币奖励只看可变支出。')],
  });

  const cats = variableByCategory(month);
  const pieItems = cats.map((c) => ({ label: c.label, value: c.value }));
  const pie = cats.length
    ? pieChart({ items: pieItems, donut: true, size: 240, valueFormat: (n) => `${fmtMoney(n, 0)} 元` })
    : emptyChart('本月还没有可变支出');

  const structureCard = Card({
    icon: 'pie',
    title: `本月支出结构（${monthCN(month)}）`,
    body: [
      pie,
      cats.length ? Legend(pieItems) : null,
      h('div', { class: 'list mt-3' },
        ...cats.slice(0, 8).map((c) => ListRow({
          icon: 'cart',
          title: c.label,
          meta: `占本月可变支出 ${pct(c.value, used || 1)}`,
          right: Tag(`${fmtMoney(c.value)} 元`, 'red'),
        })),
      ),
    ],
  });

  const quotaCard = Card({
    icon: 'wallet',
    title: '本月额度面板',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月可变支出', value: fmtMoney(used), unit: '元', tone: used > quota ? 'red' : 'oak', icon: 'cart' }),
        Stat({ label: '本月额度', value: fmtMoney(quota), unit: '元', tone: 'green', icon: 'wallet' }),
        Stat({ label: '剩余额度', value: fmtMoney(remain), unit: '元', tone: remain < 0 ? 'red' : 'green', icon: 'piggy' }),
        Stat({ label: '每日均值', value: fmtMoney(avg), unit: '元', tone: 'honey', icon: 'calendar' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(quota ? (used / quota) * 100 : 0, used > quota ? 'red' : undefined)),
      h('div', { class: 'tiny muted mt-2' },
        `月额度 = 当月天数 ${days} 天 × ${DAILY_BASE} 元 = ${fmtMoney(quota)} 元 · 月初自动重置 · 已用 ${pct(used, quota || 1)}`),
      used > quota
        ? h('div', { class: 'mt-2' }, Tag('本月已超额度：本月不再产生省钱金币，下月 1 日自动重置', 'red'))
        : null,
    ],
  });

  return [quotaCard, trendCard, structureCard];
}

/* ==========================================================================
   三、收入管理
   ========================================================================== */

function incomeCards(): HTMLElement[] {
  const ref = today();
  const points: TrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)) - 1 - i, 1, 12, 0, 0, 0);
    const month = ym(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    points.push({ x: monthCN(month), y: incomeOf(month) });
  }

  const incomeChart = points.some((p) => p.y > 0)
    ? lineChart({ series: [{ name: '收入', color: '#2D5A3D', points }], height: 200, yFormat: (n) => fmtMoney(n, 0) })
    : emptyChart('还没有收入记录');

  const month = ym(ref);
  const prefix = `${month}-`;
  const map = new Map<string, number>();
  for (const t of store.list('transactions')) {
    if (t.kind !== 'income' || !String(t.date).startsWith(prefix)) continue;
    const key = t.category || '其它';
    map.set(key, money((map.get(key) ?? 0) + num(t.amount)));
  }
  const cats = Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const pie = cats.length
    ? pieChart({ items: cats, donut: true, size: 240, valueFormat: (n) => `${fmtMoney(n, 0)} 元` })
    : emptyChart('本月还没有收入');

  const income = incomeOf(month);
  const variable = variableSpendThisMonth(ref);
  const fixed = fixedSpendOf(month);
  const balance = money(income - variable - fixed);
  const savingRate = income > 0 ? `${(((income - variable - fixed) / income) * 100).toFixed(1)}%` : '—';

  const balanceCard = Card({
    icon: 'piggy',
    title: `本月收支结余（${monthCN(month)}）`,
    variant: balance >= 0 ? 'green' : 'warm',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月收入', value: fmtMoney(income), unit: '元', tone: 'green', icon: 'income' }),
        Stat({ label: '可变支出', value: fmtMoney(variable), unit: '元', tone: 'oak', icon: 'cart' }),
        Stat({ label: '固定支出', value: fmtMoney(fixed), unit: '元', tone: 'red', icon: 'home' }),
        Stat({ label: '结余', value: fmtMoney(balance), unit: '元', tone: balance >= 0 ? 'green' : 'red', icon: 'money' }),
      ),
      h('div', { class: 'tiny muted mt-2' }, `结余 = 收入 − 可变支出 − 固定支出 · 结余率 ${savingRate}（金币兑换的部分不计入结余）`),
    ],
  });

  const incomeTrendCard = Card({
    icon: 'chart',
    title: '收入趋势（近 6 个月）',
    body: [
      incomeChart,
      h('div', { class: 'tiny muted mt-2' }, '收入账户独立统计，不参与省钱奖励，也不占日常额度。'),
    ],
  });

  const incomeStructureCard = Card({
    icon: 'pie',
    title: `本月收入结构（${monthCN(month)}）`,
    body: cats.length
      ? [
        pie,
        Legend(cats),
        h('div', { class: 'list mt-3' },
          ...cats.map((c) => ListRow({
            icon: 'income',
            title: c.label,
            meta: `占本月收入 ${pct(c.value, income || 1)}`,
            right: Tag(`${fmtMoney(c.value)} 元`, 'green'),
          })),
        ),
      ]
      : EmptyState({ icon: 'income', title: '本月还没有收入', text: '记一笔收入（工资 / 兼职 / 红包），结余卡片就会自动算出来。' }),
  });

  return [balanceCard, incomeTrendCard, incomeStructureCard];
}

/* ==========================================================================
   四、固定支出管理
   ========================================================================== */

let fixedRunning: Promise<number> | null = null;

/** 自动扣减：幂等，同一个月只扣一次 */
async function applyFixedCharges(): Promise<number> {
  if (fixedRunning) return fixedRunning;
  fixedRunning = (async (): Promise<number> => {
    let count = 0;
    const date = today();
    const month = ym(date);
    const dom = Number(date.slice(8, 10));
    for (const item of store.list('fixed_items')) {
      if (!item.active) continue;
      const amount = money(item.amount);
      if (amount <= 0) continue;                 // 未填金额不扣
      if (item.last_charged === month) continue; // 幂等：本月已扣
      if ((item.skip_months ?? []).includes(month)) continue;
      if (dom < num(item.day, 1)) continue;      // 还没到扣款日
      const chargeDate = `${month}-${String(Math.min(Math.max(num(item.day, 1), 1), 28)).padStart(2, '0')}`;
      await saveTx({
        kind: 'fixed',
        amount,
        category: '其它',
        date: chargeDate,
        note: `固定支出自动扣款：${item.name}`,
        photos: [],
      });
      await store.patch('fixed_items', item.id, { last_charged: month } as Partial<FixedItem>);
      notify.push({
        title: `已自动扣减固定支出 · ${item.name}`,
        text: `${monthCN(month)} ${num(item.day, 1)} 日扣款 ${fmtMoney(amount)} 元，固定支出账户已更新。`,
        system: true,
        tone: 'remind',
        icon: 'home',
      });
      count++;
    }
    return count;
  })();
  try {
    return await fixedRunning;
  } finally {
    fixedRunning = null;
  }
}

function openFixedForm(ctx: ModuleCtx, item?: FixedItem): void {
  openForm({
    title: item ? `编辑固定支出 · ${item.name}` : '新增固定支出',
    fields: [
      { name: 'name', label: '名称', value: item?.name ?? '', required: true, placeholder: '例如：房租、水电燃气、视频会员', span: 2 },
      { name: 'amount', label: '每月金额（元）', type: 'money', value: item?.amount ? item.amount : '', required: true, min: 0.01, step: 0.01, hint: '填 0 元不会自动扣款' },
      { name: 'day', label: '扣款日', type: 'number', value: item?.day ?? 1, required: true, min: 1, max: 28, step: 1, hint: '1–28 日（避免大小月）' },
      { name: 'active', label: '启用自动扣款', type: 'switch', value: item ? item.active : true, span: 2, hint: '关闭后不会自动记账，也不会推送通知' },
    ],
    onSubmit: async (v) => {
      const name = str(v.name);
      const amount = moneyOf(v.amount);
      const day = Math.min(28, Math.max(1, Math.round(num(v.day, 1))));
      if (!name) throw new Error('名称不能为空');
      if (amount <= 0) throw new Error('金额必须大于 0');
      if (item) {
        await store.patch('fixed_items', item.id, { name, amount, day, active: !!v.active } as Partial<FixedItem>);
      } else {
        await store.save('fixed_items', {
          name, amount, day, active: !!v.active, last_charged: '', skip_months: [],
        } as Partial<FixedItem>);
      }
      Toast(item ? '已更新固定支出项' : '已添加固定支出项', 'success');
      rerender(ctx);
    },
  });
}

async function chargeEarly(item: FixedItem, ctx: ModuleCtx): Promise<void> {
  const month = ym(today());
  const amount = money(item.amount);
  if (amount <= 0) {
    Toast('请先编辑这一项并填写金额', 'error');
    return;
  }
  if (item.last_charged === month) {
    Toast('本月已经扣过了，同一个月只扣一次', 'error');
    return;
  }
  const ok = await confirmDialog('提前扣款？', `立即从固定支出账户扣减 ${fmtMoney(amount)} 元，并记为 ${monthCN(month)} 的固定支出（本月不会再自动扣一次）。`);
  if (!ok) return;
  await saveTx({
    kind: 'fixed',
    amount,
    category: '其它',
    date: today(),
    note: `固定支出提前扣款：${item.name}`,
    photos: [],
  });
  await store.patch('fixed_items', item.id, { last_charged: month } as Partial<FixedItem>);
  Toast(`已扣减 ${fmtMoney(amount)} 元`, 'success');
  rerender(ctx);
}

async function skipOnce(item: FixedItem, ctx: ModuleCtx): Promise<void> {
  const month = ym(today());
  const skip = Array.from(new Set([...(item.skip_months ?? []), month]));
  await store.patch('fixed_items', item.id, { skip_months: skip } as Partial<FixedItem>);
  Toast(`已跳过 ${monthCN(month)} 的自动扣款`, 'success');
  rerender(ctx);
}

async function deleteFixed(item: FixedItem, ctx: ModuleCtx): Promise<void> {
  if (!(await confirmDialog('删除这个固定支出项？', `${item.name} · 每月 ${fmtMoney(item.amount)} 元。已产生的流水不会删除。`, { danger: true }))) return;
  await store.drop('fixed_items', item.id);
  Toast('已删除', 'success');
  rerender(ctx);
}

function fixedRow(item: FixedItem, ctx: ModuleCtx): HTMLElement {
  const month = ym(today());
  const skipped = (item.skip_months ?? []).includes(month);
  const charged = item.last_charged === month;
  const amount = money(item.amount);
  const status = !item.active
    ? { text: '未启用', tone: 'line' as const }
    : amount <= 0
      ? { text: '待填写金额', tone: 'honey' as const }
      : charged
        ? { text: '本月已扣', tone: 'green' as const }
        : skipped
          ? { text: '本月已跳过', tone: 'honey' as const }
          : { text: '等待扣款', tone: 'green' as const };

  const right: Node[] = [Tag(status.text, status.tone)];
  right.push(Button('提前扣款', {
    variant: 'soft', size: 'sm', icon: 'money',
    disabled: charged || amount <= 0,
    onClick: () => void guard('提前扣款', () => chargeEarly(item, ctx)),
  }));
  right.push(IconButton('refresh', {
    title: '跳过一次',
    onClick: () => void guard('跳过扣款', () => skipOnce(item, ctx)),
  }));
  right.push(IconButton('edit', {
    title: '编辑金额与扣款日',
    onClick: () => openFixedForm(ctx, item),
  }));
  right.push(IconButton('trash', {
    title: '删除',
    onClick: () => void guard('删除固定支出', () => deleteFixed(item, ctx)),
  }));

  return ListRow({
    icon: item.active ? 'home' : 'lock',
    title: item.name,
    meta: [
      `每月 ${fmtMoney(amount)} 元`,
      `${num(item.day, 1)} 日扣款`,
      item.last_charged ? `上次扣款 ${item.last_charged}` : '从未扣款',
      skipped ? `本月已跳过` : '',
    ].filter(Boolean).join(' · '),
    right: h('span', { style: 'display:flex;gap:2px;align-items:center;flex-wrap:wrap;justify-content:flex-end' }, ...right),
  });
}

function fixedPage(ctx: ModuleCtx): HTMLElement {
  const month = ym(today());
  const items = store
    .list('fixed_items')
    .slice()
    .sort((a, b) => num(a.day, 1) - num(b.day, 1));

  const fixedMonth = fixedSpendOf(month);
  const variableMonth = variableSpendThisMonth();
  const totalOut = money(fixedMonth + variableMonth);
  const ratio = totalOut > 0 ? `${((fixedMonth / totalOut) * 100).toFixed(1)}%` : '—';

  const stats = Card({
    icon: 'home',
    title: `本月固定支出（${monthCN(month)}）`,
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月固定支出', value: fmtMoney(fixedMonth), unit: '元', tone: 'red', icon: 'home' }),
        Stat({ label: '本月可变支出', value: fmtMoney(variableMonth), unit: '元', tone: 'oak', icon: 'cart' }),
        Stat({ label: '固定支出占比', value: ratio, unit: '', tone: 'honey', icon: 'pie' }),
        Stat({ label: '固定支出账户余额', value: fmtMoney(num(store.account('fixed')?.balance)), unit: '元', tone: 'green', icon: 'wallet' }),
      ),
      h('div', { class: 'tiny muted mt-2' }, '固定支出走独立账户：不占日常额度、不计入省钱奖励；比例 = 固定支出 ÷（固定 + 可变）。'),
    ],
  });

  const listCard = Card({
    icon: 'list',
    title: `固定支出项目（${items.length}）`,
    actions: [Button('新增项目', { variant: 'soft', size: 'sm', icon: 'plus', onClick: () => openFixedForm(ctx) })],
    body: items.length
      ? h('div', { class: 'list' }, ...items.map((it) => fixedRow(it, ctx)))
      : EmptyState({
        icon: 'home',
        title: '还没有固定支出项目',
        text: '先写下房租、水电燃气、宽带通讯这些每月都要付的钱，填好金额与扣款日。到扣款日当天打开这个页面，就会自动记账并提醒你。',
        action: Button('新增项目', { variant: 'primary', icon: 'plus', onClick: () => openFixedForm(ctx) }),
      }),
    footer: [h('span', { class: 'tiny muted' }, '自动扣款规则：启用 + 已填金额 + 当天 ≥ 扣款日 + 本月未扣过 + 本月未跳过 → 自动记一笔固定支出并推送通知（同一个月只扣一次）。')],
  });

  const history = store
    .list('transactions')
    .filter((t) => t.kind === 'fixed' && String(t.date).startsWith(`${month}-`))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return h('div', { class: 'col' },
    stats,
    listCard,
    txListCard(`本月已扣记录（${history.length}）`, history, ctx, '本月还没有固定支出流水。'),
  );
}

/* ==========================================================================
   五、购买清单
   ========================================================================== */

function shoppingSubtotal(it: ShoppingItem): number {
  return money(num(it.price) * Math.max(1, Math.round(num(it.qty, 1))));
}

function openShoppingForm(ctx: ModuleCtx, item?: ShoppingItem): void {
  openForm({
    title: item ? `编辑商品 · ${item.name}` : '添加商品',
    fields: [
      { name: 'name', label: '商品名称', value: item?.name ?? '', required: true, placeholder: '例如：抽纸、洗衣液', span: 2 },
      { name: 'price', label: '单价（元）', type: 'money', value: item?.price ?? '', required: true, min: 0, step: 0.01 },
      { name: 'qty', label: '数量', type: 'number', value: item?.qty ?? 1, required: true, min: 1, max: 999, step: 1 },
      { name: 'date', label: '日期', type: 'date', value: item?.date ?? today(), required: true },
      { name: 'category', label: '记账类别', type: 'select', value: item?.category ?? '日用品', options: VARIABLE_CATEGORIES, hint: '购买后按这个类别记一笔可变支出' },
    ],
    onSubmit: async (v) => {
      const name = str(v.name);
      const price = moneyOf(v.price);
      const qty = Math.max(1, Math.round(num(v.qty, 1)));
      const date = validDate(String(v.date)) ? String(v.date) : today();
      const category = str(v.category, '日用品');
      if (!name) throw new Error('商品名称不能为空');
      if (price < 0) throw new Error('单价不能为负数');
      const patch = { name, price, qty, date, category } as Partial<ShoppingItem>;
      if (item) await store.patch('shopping', item.id, patch);
      else await store.save('shopping', { ...patch, status: 'pending', bought_at: null } as Partial<ShoppingItem>);
      Toast(item ? '已更新商品' : '已加入购买清单', 'success');
      rerender(ctx);
    },
  });
}

/** 购买 → 自动记一笔可变支出 + 扣日常账户 + 标记已购买 */
async function buyShopping(it: ShoppingItem, ctx: ModuleCtx): Promise<void> {
  const subtotal = shoppingSubtotal(it);
  if (subtotal <= 0) {
    Toast('小计为 0，请先填写单价', 'error');
    return;
  }
  const month = ym(today());
  const used = variableSpendOf(month);
  const quota = monthQuota(month);
  const next = money(used + subtotal);
  if (next > quota) {
    const ok = await confirmDialog(
      used >= quota ? '本月日常额度已耗尽' : '即将超出本月日常额度',
      `「${it.name}」小计 ${fmtMoney(subtotal)} 元，本月已用 ${fmtMoney(used)} / ${fmtMoney(quota)} 元。确认后仍会记一笔可变支出并扣减日常账户。`,
      { danger: true, okText: '仍然购买' },
    );
    if (!ok) return;
  }
  await saveTx({
    kind: 'variable',
    amount: subtotal,
    category: str(it.category, '日用品'),
    date: today(),
    note: `购买清单：${it.name} × ${Math.max(1, Math.round(num(it.qty, 1)))}`,
    photos: [],
  });
  await store.patch('shopping', it.id, { status: 'bought', bought_at: Date.now() } as Partial<ShoppingItem>);
  Toast(`已记账 ${fmtMoney(subtotal)} 元，日常账户已扣减`, 'success');
  rerender(ctx);
}

async function restoreShopping(it: ShoppingItem, ctx: ModuleCtx): Promise<void> {
  await store.patch('shopping', it.id, { status: 'pending', bought_at: null } as Partial<ShoppingItem>);
  Toast('已恢复到待购买', 'success');
  rerender(ctx);
}

async function deleteShopping(it: ShoppingItem, ctx: ModuleCtx): Promise<void> {
  if (!(await confirmDialog('删除这件商品？', `${it.name} · 小计 ${fmtMoney(shoppingSubtotal(it))} 元。已产生的记账流水不会删除。`, { danger: true }))) return;
  await store.drop('shopping', it.id);
  Toast('已删除', 'success');
  rerender(ctx);
}

function shoppingRow(it: ShoppingItem, ctx: ModuleCtx): HTMLElement {
  const qty = Math.max(1, Math.round(num(it.qty, 1)));
  const subtotal = shoppingSubtotal(it);
  const bought = it.status === 'bought';
  const right: Node[] = [];
  if (!bought) {
    right.push(Button('购买', { variant: 'primary', size: 'sm', icon: 'cart', onClick: () => void guard('购买记账', () => buyShopping(it, ctx)) }));
  } else {
    right.push(Button('恢复', { variant: 'soft', size: 'sm', icon: 'refresh', onClick: () => void guard('恢复商品', () => restoreShopping(it, ctx)) }));
  }
  right.push(IconButton('edit', { title: '修改内容 / 价格 / 数量 / 日期', onClick: () => openShoppingForm(ctx, it) }));
  right.push(IconButton('trash', { title: '删除', onClick: () => void guard('删除商品', () => deleteShopping(it, ctx)) }));

  return ListRow({
    icon: bought ? 'check' : 'cart',
    done: bought,
    title: `${it.name} × ${qty}`,
    meta: [
      `单价 ${fmtMoney(num(it.price))} 元`,
      `小计 ${fmtMoney(subtotal)} 元`,
      `日期 ${fmtDate(it.date, 'cn')}`,
      it.category ? `类别 ${String(it.category)}` : '',
      bought && it.bought_at ? `购买于 ${fmtDate(ymd(num(it.bought_at)), 'cn')}` : '',
    ].filter(Boolean).join(' · '),
    right: h('span', { style: 'display:flex;gap:2px;align-items:center;flex-wrap:wrap;justify-content:flex-end' },
      Tag(bought ? '已购买' : '待购买', bought ? 'green' : 'honey'),
      ...right,
    ),
  });
}

function shoppingPage(ctx: ModuleCtx): HTMLElement {
  const all = store
    .list('shopping')
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pending = all.filter((i) => i.status !== 'bought');
  const bought = all.filter((i) => i.status === 'bought');
  const pendingTotal = money(pending.reduce((s, i) => s + shoppingSubtotal(i), 0));
  const boughtTotal = money(bought.reduce((s, i) => s + shoppingSubtotal(i), 0));

  const summary = Card({
    icon: 'cart',
    title: '购买清单概览',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '待购买件数', value: pending.length, unit: '件', tone: 'honey', icon: 'cart' }),
        Stat({ label: '待购买小计', value: fmtMoney(pendingTotal), unit: '元', tone: 'oak', icon: 'wallet' }),
        Stat({ label: '已购买小计', value: fmtMoney(boughtTotal), unit: '元', tone: 'green', icon: 'check' }),
      ),
      h('div', { class: 'tiny muted mt-2' }, '购买 = 自动记一笔「可变支出」并扣减日常账户；已购商品进入购买历史，可以恢复为待购买。'),
    ],
  });

  return h('div', { class: 'col' },
    summary,
    Card({
      icon: 'cart',
      title: `待购买（${pending.length}）`,
      actions: [Button('添加商品', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => openShoppingForm(ctx) })],
      body: pending.length
        ? h('div', { class: 'list' }, ...pending.map((it) => shoppingRow(it, ctx)))
        : EmptyState({
          icon: 'cart',
          title: '待购买清单是空的',
          text: '看到想买的东西先写下来，放三天。三天后还想要，再点「购买」——它会自动记进账本。',
          action: Button('添加商品', { variant: 'primary', icon: 'plus', onClick: () => openShoppingForm(ctx) }),
        }),
      footer: [h('span', { class: 'tiny muted' }, `待购买合计 ${fmtMoney(pendingTotal)} 元`)],
    }),
    Card({
      icon: 'chest',
      title: `购买历史（${bought.length}）`,
      body: bought.length
        ? h('div', { class: 'list' }, ...bought.map((it) => shoppingRow(it, ctx)))
        : EmptyState({ icon: 'chest', title: '还没有购买历史', text: '点「购买」之后，商品会移动到这里。' }),
      footer: [h('span', { class: 'tiny muted' }, `历史合计 ${fmtMoney(boughtTotal)} 元 · 全部来自购买清单自动记账`)],
    }),
  );
}

/* ==========================================================================
   六、心愿兑换清单
   ========================================================================== */

function openWishForm(ctx: ModuleCtx, wish?: Wish): void {
  openForm({
    title: wish ? `编辑心愿 · ${wish.title}` : '添加心愿',
    fields: [
      { name: 'title', label: '心愿', value: wish?.title ?? '', required: true, placeholder: '例如：一对小耳钉、一次短途旅行', span: 2 },
      {
        name: 'tier', label: '档位（1 金币 = 1 元）', type: 'select', value: String(wish?.tier ?? 10), span: 2,
        options: WISH_TIERS.map((t) => ({ value: String(t), label: `${t} 金币 = ${t} 元` })),
        hint: '四档：10 / 20 / 50 / 100 金币',
      },
      { name: 'date', label: '日期', type: 'date', value: wish?.date ?? today(), required: true },
    ],
    onSubmit: async (v) => {
      const title = str(v.title);
      const tier = (Number(v.tier) || 10) as 10 | 20 | 50 | 100;
      const date = validDate(String(v.date)) ? String(v.date) : today();
      if (!title) throw new Error('心愿名称不能为空');
      if (!WISH_TIERS.includes(tier)) throw new Error('档位只能是 10 / 20 / 50 / 100');
      if (wish) await store.patch('wishes', wish.id, { title, tier, date } as Partial<Wish>);
      else await store.save('wishes', { title, tier, status: 'open', date } as Partial<Wish>);
      Toast(wish ? '已更新心愿' : '已添加心愿', 'success');
      rerender(ctx);
    },
  });
}

/** 兑换：扣金币账户 → 加心愿账户 → 标记完成 → 写审计流水 */
async function redeemWish(wish: Wish, ctx: ModuleCtx): Promise<void> {
  if (wish.status === 'done') {
    Toast('这个心愿已经兑换过了', 'error');
    return;
  }
  const tier = money(Number(wish.tier) || 0);
  const coinBalance = money(num(store.account('coin')?.balance));
  if (tier <= 0) {
    Toast('档位金额不正确', 'error');
    return;
  }
  if (coinBalance < tier) {
    Toast(`金币不足：当前 ${coinBalance.toFixed(1)} 枚，还差 ${(tier - coinBalance).toFixed(1)} 枚`, 'error');
    return;
  }
  const ok = await confirmDialog('兑换这个心愿？', `「${wish.title}」需要 ${tier} 金币（= ${fmtMoney(tier)} 元）。兑换后金币账户 −${tier}，心愿账户 +${tier}，并记一笔审计流水。`);
  if (!ok) return;
  await store.patch('wishes', wish.id, { status: 'done' } as Partial<Wish>);
  await store.adjustBalance('coin', money(-tier));
  await store.adjustBalance('wish', money(tier));
  await store.save('transactions', {
    kind: 'coin',
    amount: money(-tier),
    category: '心愿兑换',
    date: today(),
    note: `兑换心愿：${wish.title}`,
    photos: [],
  } as Partial<Transaction>);
  Toast(`兑换成功！心愿账户 +${fmtMoney(tier)} 元`, 'coin');
  rerender(ctx);
}

async function deleteWish(wish: Wish, ctx: ModuleCtx): Promise<void> {
  if (!(await confirmDialog('删除这个心愿？', `${wish.title} · ${wish.tier} 金币。已兑换的账户变动不会回滚。`, { danger: true }))) return;
  await store.drop('wishes', wish.id);
  Toast('已删除', 'success');
  rerender(ctx);
}

function wishRow(wish: Wish, ctx: ModuleCtx, done: boolean): HTMLElement {
  const right: Node[] = [];
  if (done) {
    right.push(Tag('已兑换', 'green'));
  } else {
    right.push(Button('兑换', {
      variant: 'primary', size: 'sm', icon: 'gift',
      onClick: () => void guard('兑换心愿', () => redeemWish(wish, ctx)),
    }));
  }
  if (!done) right.push(IconButton('edit', { title: '编辑心愿', onClick: () => openWishForm(ctx, wish) }));
  right.push(IconButton('trash', { title: '删除', onClick: () => void guard('删除心愿', () => deleteWish(wish, ctx)) }));

  return ListRow({
    icon: done ? 'check' : 'gift',
    done,
    title: wish.title,
    meta: `${wish.tier} 金币 = ${fmtMoney(num(wish.tier))} 元 · ${fmtDate(wish.date, 'cn')}`,
    right: h('span', { style: 'display:flex;gap:2px;align-items:center' }, ...right),
  });
}

function wishPage(ctx: ModuleCtx): HTMLElement {
  const wishes = store
    .list('wishes')
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const open = wishes.filter((w) => w.status !== 'done');
  const done = wishes.filter((w) => w.status === 'done');

  const coinBalance = money(num(store.account('coin')?.balance));
  const wishBalance = money(num(store.account('wish')?.balance));
  const spentCoins = money(done.reduce((s, w) => s + num(w.tier), 0));
  const redeemHistory = store
    .list('transactions')
    .filter((t) => t.kind === 'coin')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const stats = Card({
    icon: 'coin',
    title: '金币与心愿账户',
    variant: 'warm',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '金币余额', value: coinBalance.toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
        Stat({ label: '心愿账户余额', value: fmtMoney(wishBalance), unit: '元', tone: 'green', icon: 'gift' }),
        Stat({ label: '已兑换金币', value: spentCoins.toFixed(1), unit: '枚', tone: 'oak', icon: 'check' }),
        Stat({ label: '已完成心愿', value: done.length, unit: '个', tone: 'green', icon: 'star' }),
      ),
      h('div', { class: 'tiny muted mt-2' }, '1 金币 = 1 元。四档：10 / 20 / 50 / 100。金币只用于心愿兑换，不占日常额度。'),
    ],
  });

  const openCard = Card({
    icon: 'gift',
    title: `待兑换心愿（${open.length}）`,
    actions: [Button('添加心愿', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => openWishForm(ctx) })],
    body: open.length
      ? h('div', { class: 'list' }, ...open.map((w) => wishRow(w, ctx, false)))
      : EmptyState({
        icon: 'gift',
        title: '还没有待兑换的心愿',
        text: '写下想要的东西和档位（10 / 20 / 50 / 100 金币）。攒够金币，点「兑换」就能把它转进心愿账户。',
        action: Button('添加心愿', { variant: 'primary', icon: 'plus', onClick: () => openWishForm(ctx) }),
      }),
    footer: [h('span', { class: 'tiny muted' }, `待兑换需要 ${money(open.reduce((s, w) => s + num(w.tier), 0)).toFixed(1)} 枚金币 · 当前 ${coinBalance.toFixed(1)} 枚`)],
  });

  const doneCard = Card({
    icon: 'chest',
    title: `已完成心愿（${done.length}）`,
    body: done.length
      ? h('div', { class: 'list' }, ...done.map((w) => wishRow(w, ctx, true)))
      : EmptyState({ icon: 'chest', title: '还没有完成的心愿', text: '攒到 10 枚金币就能兑换第一个小愿望。' }),
  });

  const auditCard = Card({
    icon: 'list',
    title: `兑换记录（${redeemHistory.length}）`,
    body: redeemHistory.length
      ? h('div', { class: 'list' }, ...redeemHistory.map((t) => ListRow({
        icon: 'coin',
        title: t.note || t.category || '兑换心愿',
        meta: `${fmtDate(t.date, 'md')} · ${t.category || '心愿兑换'}`,
        right: Tag(`${num(t.amount).toFixed(1)} 金币`, 'honey'),
      })))
      : EmptyState({ icon: 'coin', title: '还没有兑换记录', text: '每一次兑换都会留下一笔审计流水，方便回看金币去向。' }),
  });

  return h('div', { class: 'col' }, stats, openCard, doneCard, auditCard);
}

/* ==========================================================================
   七、实时金价
   ========================================================================== */

interface GoldQuote {
  intl: number;
  domestic: number;
  change: number;
  high: number;
  low: number;
  date: string;
  source: string;
}

const GOLD_ICON = 'money';

async function fetchGold(): Promise<GoldQuote | null> {
  try {
    const res = await fetch('/api/gold-price', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const intl = num(data.intl);
    const domestic = num(data.domestic);
    if (!intl && !domestic) throw new Error('返回数据为空');
    return {
      intl,
      domestic,
      change: num(data.change),
      high: num(data.high),
      low: num(data.low),
      date: validDate(String(data.date ?? '')) ? String(data.date) : today(),
      source: str(data.source, '接口'),
    };
  } catch (err) {
    console.warn('[wealth] 金价接口失败，改用本地历史', err);
    const last = goldHistory().pop();
    if (!last) return null;
    return {
      intl: num(last.intl),
      domestic: num(last.domestic),
      change: num(last.change),
      high: num(last.high),
      low: num(last.low),
      date: validDate(String(last.date)) ? String(last.date) : today(),
      source: '本地缓存',
    };
  }
}

/** 写入 gold_prices（同一天覆盖） */
async function persistGold(q: GoldQuote): Promise<void> {
  const existing = store.one('gold_prices', (g) => g.date === q.date);
  const payload: Partial<GoldPrice> = {
    date: q.date,
    intl: money(q.intl),
    domestic: money(q.domestic),
    change: money(q.change),
    high: money(q.high),
    low: money(q.low),
  };
  if (existing) await store.patch('gold_prices', existing.id, payload);
  else await store.save('gold_prices', payload);
}

/** 到价提醒：同一天只提醒一次 */
async function checkGoldAlert(domestic: number): Promise<void> {
  const target = money(num(store.setting('goldAlert', 0)));
  if (target <= 0 || domestic <= 0) return;
  if (domestic < target) return;
  const date = today();
  if (String(store.setting('goldAlertFired', '')) === date) return;
  await store.setSetting('goldAlertFired', date);
  notify.push({
    title: `金价到价提醒 · 国内 ${fmtMoney(domestic)} 元/克`,
    text: `已达到你设定的目标价 ${fmtMoney(target)} 元/克，可以去看看要不要出手。`,
    system: true,
    tone: 'alert',
    icon: 'money',
    ms: 15000,
  });
}

function goldTrendChart(days: number): Node {
  const rows = goldHistory().slice(-days).filter((g) => num(g.domestic) > 0);
  if (rows.length < 2) {
    return emptyChart(rows.length ? '再积累一天就有走势啦' : '还没有本地金价历史');
  }
  return lineChart({
    series: [{
      name: `国内金价（近 ${days} 天）`,
      color: '#5A7A4A',
      points: rows.map((g) => ({ x: `${Number(String(g.date).slice(5, 7))}/${Number(String(g.date).slice(8, 10))}`, y: num(g.domestic) })),
    }],
    height: 190,
    yFormat: (n) => n.toFixed(0),
  });
}

function goldStatsCard(q: GoldQuote): HTMLElement {
  const up = q.change > 0;
  const down = q.change < 0;
  const changeText = `${up ? '+' : ''}${fmtMoney(q.change)}（${up ? '↑ 涨' : down ? '↓ 跌' : '持平'}）`;
  return Card({
    icon: GOLD_ICON,
    title: `实时金价 · ${fmtDate(q.date, 'md')}`,
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '国际金价', value: fmtMoney(q.intl), unit: '美元/盎司', tone: 'oak', icon: 'money' }),
        Stat({ label: '国内金价', value: fmtMoney(q.domestic), unit: '元/克', tone: up ? 'red' : down ? 'green' : 'oak', icon: 'coin' }),
        Stat({ label: '涨跌幅', value: changeText, unit: '', tone: up ? 'red' : down ? 'green' : 'oak', icon: up ? 'arrowUp' : down ? 'arrowDown' : 'minus' }),
        Stat({ label: '当日最高 / 最低', value: `${fmtMoney(q.high)} / ${fmtMoney(q.low)}`, unit: '', tone: 'honey', icon: 'chart' }),
      ),
      h('div', { class: 'tiny muted mt-2' }, `数据来源：${q.source || '未知'} · 涨红跌绿（中文习惯）· ${store.setting('goldAlert', 0) ? `已设目标价 ${fmtMoney(num(store.setting('goldAlert', 0)))} 元/克` : '未设目标价'}`),
    ],
  });
}

function goldPage(ctx: ModuleCtx): HTMLElement {
  const state: { quote: GoldQuote | null; loading: boolean; failed: boolean } = {
    quote: null,
    loading: true,
    failed: false,
  };

  const body = h('div', { class: 'col' });
  const indicator = h('div', { class: 'tiny muted center', style: 'min-height:20px;line-height:20px' }, '↓ 下拉刷新');
  const statsHost = h('div');
  const trendHost = h('div', { class: 'col' });
  const refreshedAt = h('span', { class: 'tiny muted' }, '');

  const actionRow = h('div', { class: 'row row-wrap' }, Button('刷新', {
    variant: 'primary', size: 'sm', icon: 'refresh',
    onClick: () => void guard('刷新金价', () => refresh()),
  }));

  const card = Card({
    icon: GOLD_ICON,
    title: '实时金价',
    subtitle: '打开这个板块自动刷新一次 · 也可以用下拉手势刷新',
    actions: [actionRow],
    body: [indicator, statsHost, h('hr', { style: 'border-color:var(--line-soft)' }), trendHost, refreshedAt],
    footer: [h('span', { class: 'tiny muted' }, '数据优先来自 /api/gold-price；接口不可用时自动使用本地最近一条记录。刷新成功后会写入金价历史（同一天覆盖）。')],
  });

  function renderTrend(): void {
    const history = goldHistory();
    clear(trendHost);
    trendHost.append(
      SectionTitle('金价走势', { icon: 'chart' }),
      h('div', { class: 'grid grid-2' },
        Card({
          icon: 'chart',
          title: '近 7 日国内金价',
          body: history.length >= 2
            ? sparkline(history.slice(-7).map((g) => num(g.domestic)), '#5A7A4A', 260, 60)
            : goldTrendChart(7),
        }),
        Card({
          icon: 'chart',
          title: '近 30 日国内金价',
          body: goldTrendChart(30),
        }),
      ),
    );
  }

  function statusRow(): HTMLElement {
    if (state.failed) {
      return EmptyState({
        icon: 'refresh',
        title: '金价暂时取不到',
        text: '接口和本地历史都没有数据。检查网络后重试，或稍后再来看看。',
        action: Button('重试', { variant: 'primary', icon: 'refresh', onClick: () => void guard('刷新金价', () => refresh()) }),
      });
    }
    if (state.loading) {
      return h('div', { class: 'row', style: 'gap:8px;align-items:center' }, pixelIcon('refresh', 16), h('span', { class: 'small muted' }, '正在获取金价…'));
    }
    return h('span', { class: 'tiny muted' }, '暂时还没有数据');
  }

  function paint(): void {
    clear(statsHost);
    if (state.quote) statsHost.appendChild(goldStatsCard(state.quote));
    else statsHost.appendChild(statusRow());
    renderTrend();
  }

  async function refresh(): Promise<void> {
    indicator.textContent = '正在刷新…';
    const q = await fetchGold();
    if (q) {
      state.quote = q;
      state.failed = false;
      try {
        await persistGold(q);
      } catch (err) {
        console.warn('[wealth] 金价写入失败', err);
      }
      await checkGoldAlert(num(q.domestic));
      indicator.textContent = '↓ 下拉刷新';
      refreshedAt.textContent = `最近刷新：${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 本地历史共 ${store.list('gold_prices').length} 条`;
    } else {
      state.failed = true;
      indicator.textContent = '↓ 下拉刷新';
    }
    state.loading = false;
    paint();
  }

  // 渲染骨架（先出卡片结构，再异步填数据，避免整页闪烁）
  clear(body);
  body.append(card, goldAlertCard(ctx));
  paint();

  // 打开时自动刷新一次
  void guard('刷新金价', () => refresh());

  // 下拉刷新手势：向下拖动 > 60px 触发
  let startY = 0;
  let pulling = false;
  card.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    startY = t.clientY;
    pulling = false;
  }, { passive: true });
  card.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - startY;
    if (dy > 12 && (document.scrollingElement?.scrollTop ?? 0) <= 4) {
      pulling = true;
      if (e.cancelable) e.preventDefault();
      indicator.textContent = dy > 60 ? '松开即可刷新 ↑' : `↓ 继续下拉 ${Math.max(0, Math.round(60 - dy))}px`;
    }
  }, { passive: false });
  card.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dy = t ? t.clientY - startY : 0;
    const fire = pulling && dy > 60;
    pulling = false;
    if (fire) void guard('刷新金价', () => refresh());
    else indicator.textContent = '↓ 下拉刷新';
  }, { passive: true });

  return body;
}

/** 金价提醒设置卡（放在金价页底部） */
function goldAlertCard(ctx: ModuleCtx): HTMLElement {
  const target = money(num(store.setting('goldAlert', 0)));
  const fired = str(store.setting('goldAlertFired', ''));
  return Card({
    icon: 'target',
    title: '金价提醒',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '目标价', value: target > 0 ? fmtMoney(target) : '未设置', unit: target > 0 ? '元/克' : '', tone: 'honey', icon: 'target' }),
        Stat({ label: '今日已提醒', value: fired === today() ? '是' : '否', unit: '', tone: fired === today() ? 'green' : 'oak', icon: 'notice' }),
      ),
      h('div', { class: 'row row-wrap mt-2' },
        Button(target > 0 ? '修改目标价' : '设置目标价', {
          variant: 'soft', size: 'sm', icon: 'target',
          onClick: () => void guard('设置金价提醒', async () => {
            const input = await promptDialog('金价到价提醒', {
              label: '目标价（元/克，填 0 关闭提醒）',
              value: target > 0 ? String(target) : '',
              placeholder: '例如：520',
            });
            if (input == null) return;
            const value = money(num(input, 0));
            await store.setSetting('goldAlert', value > 0 ? value : 0);
            Toast(value > 0 ? `已设定目标价 ${fmtMoney(value)} 元/克` : '已关闭金价提醒', 'success');
            rerender(ctx);
          }),
        }),
        target > 0
          ? Button('关闭提醒', {
            variant: 'ghost', size: 'sm', icon: 'close',
            onClick: () => void guard('关闭金价提醒', async () => {
              await store.setSetting('goldAlert', 0);
              Toast('已关闭金价提醒', 'success');
              rerender(ctx);
            }),
          })
          : null,
      ),
      h('div', { class: 'tiny muted mt-2' }, '当国内金价 ≥ 目标价时，会推送站内横幅 + 系统通知（同一天只提醒一次）。'),
    ],
  });
}

/* ==========================================================================
   八、总览页
   ========================================================================== */

interface SubEntry { sub: string; title: string; icon: string; desc: string }

const SUB_ENTRIES: SubEntry[] = [
  { sub: 'tx', title: '记账', icon: 'money', desc: '可变 / 固定 / 收入，一笔不漏' },
  { sub: 'fixed', title: '固定支出', icon: 'home', desc: '预设项目自动扣减与提醒' },
  { sub: 'shopping', title: '购买清单', icon: 'cart', desc: '先写下来，买时自动记账' },
  { sub: 'wish', title: '心愿清单', icon: 'gift', desc: '金币 1:1 兑换小愿望' },
  { sub: 'gold', title: '实时金价', icon: 'target', desc: '国际 / 国内与到价提醒' },
];

function accountStatCards(): HTMLElement[] {
  const date = today();
  const month = ym(date);
  const quota = money(num(store.account('daily')?.quota) || monthQuota(month));
  const used = variableSpendThisMonth(date);
  const remain = money(quota - used);
  const out: HTMLElement[] = [];

  out.push(Stat({ label: '日常账户可余额度', value: fmtMoney(remain), unit: '元', tone: remain < 0 ? 'red' : 'oak', icon: 'wallet' }));
  out.push(Stat({ label: '固定支出账户', value: fmtMoney(num(store.account('fixed')?.balance)), unit: '元', tone: 'red', icon: 'home' }));
  out.push(Stat({ label: '收入账户', value: fmtMoney(num(store.account('income')?.balance)), unit: '元', tone: 'green', icon: 'income' }));
  out.push(Stat({ label: '金币账户', value: money(num(store.account('coin')?.balance)).toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }));
  out.push(Stat({ label: '心愿账户', value: fmtMoney(num(store.account('wish')?.balance)), unit: '元', tone: 'honey', icon: 'gift' }));
  out.push(Stat({ label: '本月可变支出', value: fmtMoney(used), unit: '元', tone: used > quota ? 'red' : 'oak', icon: 'cart' }));

  const income = incomeOf(month);
  const fixed = fixedSpendOf(month);
  const balance = money(income - used - fixed);
  out.push(Stat({ label: '本月结余', value: fmtMoney(balance), unit: '元', tone: balance >= 0 ? 'green' : 'red', icon: 'money' }));
  out.push(Stat({ label: '本月固定支出', value: fmtMoney(fixed), unit: '元', tone: 'red', icon: 'home' }));
  return out;
}

function overviewPage(ctx: ModuleCtx): HTMLElement {
  const date = today();
  const month = ym(date);
  const quota = money(num(store.account('daily')?.quota) || monthQuota(month));
  const used = variableSpendThisMonth(date);
  const remain = money(quota - used);

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'wealth',
    title: `财富工坊 · ${fmtDate(date, 'full')}`,
    subtitle: '五个账户各管一摊：日常额度、固定支出、收入、金币、心愿',
    actions: [
      Button('记一笔', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => openTxForm('variable', ctx) }),
      Button('看金价', { variant: 'soft', size: 'sm', icon: 'target', onClick: () => ctx.go('#/wealth/gold') }),
    ],
    body: [
      h('div', { class: 'grid grid-auto' }, ...accountStatCards()),
      h('div', { class: 'mt-3' }, ProgressBar(quota ? (used / quota) * 100 : 0, used > quota ? 'red' : undefined)),
      h('div', { class: 'tiny muted mt-2' },
        `月额度 ${fmtMoney(quota)} 元（当月天数 × ${DAILY_BASE} 元）· 已用 ${fmtMoney(used)} 元 · 剩余 ${fmtMoney(remain)} 元 · 月初自动重置`),
    ],
  });

  const entries = Card({
    icon: 'hub',
    title: '子页面入口',
    body: h('div', { class: 'grid grid-auto' }, ...SUB_ENTRIES.map((s) => {
      const item = Card({
        variant: 'flat',
        hoverable: true,
        className: 'no-card-click',
        body: h('div', { style: 'text-align:center;cursor:pointer' },
          h('div', { style: 'display:flex;justify-content:center;margin-bottom:6px' }, pixelIcon(s.icon, 30)),
          h('div', { style: 'font-weight:700' }, s.title),
          h('div', { class: 'tiny muted' }, s.desc),
        ),
      });
      item.addEventListener('click', () => ctx.go(`#/wealth/${s.sub}`));
      return item;
    })),
  });

  const recent = store
    .list('transactions')
    .filter((t) => t.kind === 'variable' || t.kind === 'fixed' || t.kind === 'income')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.created_at ?? 0) - (a.created_at ?? 0))
    .slice(0, 8);

  const analysis = analysisCards(ctx);   // [额度面板, 趋势, 结构]
  const incomeCardsList = incomeCards(); // [结余, 趋势, 结构]

  return h('div', { class: 'col' },
    head,
    quickEntry(ctx),
    entries,
    txListCard(`最近流水（最近 ${recent.length} 笔）`, recent, ctx, '还没有任何流水，点上面的快速记账按钮记第一笔吧。'),
    SectionTitle('花销与收入分析', { icon: 'chart', extra: Button('完整记账与分析', { variant: 'ghost', size: 'sm', icon: 'arrowRight', onClick: () => ctx.go('#/wealth/tx') }) }),
    analysis[0],
    h('div', { class: 'grid grid-2' }, analysis[1], analysis[2]),
    h('div', { class: 'grid grid-2' }, incomeCardsList[0], incomeCardsList[1]),
    incomeCardsList[2],
  );
}

/* ==========================================================================
   九、记账子页
   ========================================================================== */

function txPage(ctx: ModuleCtx): HTMLElement {
  const month = ym(today());
  const all = store
    .list('transactions')
    .filter((t) => t.kind === 'variable' || t.kind === 'fixed' || t.kind === 'income')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.created_at ?? 0) - (a.created_at ?? 0));

  const variable = all.filter((t) => t.kind === 'variable');
  const fixed = all.filter((t) => t.kind === 'fixed');
  const income = all.filter((t) => t.kind === 'income');
  const variableMonth = variableSpendThisMonth();
  const quota = money(num(store.account('daily')?.quota) || monthQuota(month));

  const filter = store.setting<string>('wealthTxKind', 'all');
  const list = filter === 'variable' ? variable : filter === 'fixed' ? fixed : filter === 'income' ? income : all;

  const summary = Card({
    icon: 'wallet',
    title: '账务总览',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月可变支出', value: fmtMoney(variableMonth), unit: '元', tone: variableMonth > quota ? 'red' : 'oak', icon: 'cart' }),
        Stat({ label: '本月剩余额度', value: fmtMoney(money(quota - variableMonth)), unit: '元', tone: quota - variableMonth < 0 ? 'red' : 'green', icon: 'piggy' }),
        Stat({ label: '本月固定支出', value: fmtMoney(fixedSpendOf(month)), unit: '元', tone: 'red', icon: 'home' }),
        Stat({ label: '本月收入', value: fmtMoney(incomeOf(month)), unit: '元', tone: 'green', icon: 'income' }),
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('记可变支出', { variant: 'primary', size: 'sm', icon: 'cart', onClick: () => openTxForm('variable', ctx) }),
        Button('记固定支出', { variant: 'soft', size: 'sm', icon: 'home', onClick: () => openTxForm('fixed', ctx) }),
        Button('记收入', { variant: 'soft', size: 'sm', icon: 'income', onClick: () => openTxForm('income', ctx) }),
        Button('固定支出项', { variant: 'ghost', size: 'sm', icon: 'list', onClick: () => ctx.go('#/wealth/fixed') }),
      ),
    ],
  });

  const filterRow = h('div', { class: 'row row-wrap', style: 'align-items:center' },
    h('span', { class: 'tiny muted' }, '筛选'),
    Segmented([
      { value: 'all', label: `全部 ${all.length}` },
      { value: 'variable', label: `可变 ${variable.length}` },
      { value: 'fixed', label: `固定 ${fixed.length}` },
      { value: 'income', label: `收入 ${income.length}` },
    ], {
      value: filter,
      onChange: (v) => {
        void (async () => {
          await store.setSetting('wealthTxKind', v);
          rerender(ctx);
        })();
      },
    }),
  );

  return h('div', { class: 'col' },
    summary,
    quickEntry(ctx),
    SectionTitle('流水明细', { icon: 'list' }),
    filterRow,
    txListCard(`流水（${list.length}）`, list, ctx, '这个筛选下还没有流水。'),
    h('div', { class: 'grid' }, ...analysisCards(ctx)),
    h('div', { class: 'grid' }, ...incomeCards()),
  );
}

/* ==========================================================================
   模块定义
   ========================================================================== */

let rendering = false;

export const wealthModule: ModuleDef = {
  id: 'wealth',
  title: '财富工坊',
  icon: 'wealth',
  order: 4,
  desc: '记账 · 预算 · 心愿 · 金价',

  badge(): number {
    const month = ym(today());
    return store
      .list('fixed_items')
      .filter((f) => f.active && money(f.amount) > 0 && f.last_charged !== month && !(f.skip_months ?? []).includes(month) && Number(today().slice(8, 10)) >= num(f.day, 1))
      .length;
  },

  async onEnter(): Promise<void> {
    if (!store.isReady) return;
    await store.ensureMonth();
    await guard('固定支出自动扣款', async () => { await applyFixedCharges(); });
  },

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    if (rendering) return;
    rendering = true;
    try {
      if (!store.isReady) {
        mount(el, Card({ icon: 'wealth', title: '财富工坊', body: h('div', { class: 'small muted' }, '正在读取账本…') }));
        return;
      }

      await store.ensureMonth();

      const sub = ctx.sub || '';
      let page: HTMLElement;

      switch (sub) {
        case 'tx':
          page = txPage(ctx);
          break;
        case 'fixed': {
          // 渲染该子页时执行一次自动扣减（幂等）
          await guard('固定支出自动扣款', async () => {
            const n = await applyFixedCharges();
            if (n > 0) Toast(`已自动扣减 ${n} 项固定支出`, 'success');
          });
          page = fixedPage(ctx);
          break;
        }
        case 'shopping':
          page = shoppingPage(ctx);
          break;
        case 'wish':
          page = wishPage(ctx);
          break;
        case 'gold':
          page = goldPage(ctx);
          break;
        default:
          page = overviewPage(ctx);
      }

      mount(el, page);
    } catch (err) {
      console.error('[wealth] 渲染失败', err);
      mount(el, EmptyState({
        icon: 'refresh',
        title: '财富工坊打了个盹',
        text: err instanceof Error ? err.message : '账本读取失败，请重试。',
        action: Button('重新加载', { variant: 'primary', icon: 'refresh', onClick: () => rerender(ctx) }),
      }));
    } finally {
      rendering = false;
    }
  },
};
