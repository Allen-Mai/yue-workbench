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
      h('div', { class: 'tiny muted mt-2' }, rangeKey === 'm
const __marker: number = 1;
