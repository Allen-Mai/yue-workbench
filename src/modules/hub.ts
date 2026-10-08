/* ==========================================================================
   modules/hub.ts · 今日中枢
   待办列表（可编辑/完成即锁定/可取消完成）· 植物养护自动汇总
   每日学习三项 · 五账户速览 · 今日开销速览
   ========================================================================== */

import { h, mount, clear } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, ListRow, ProgressBar, SectionTitle, Stat, Tag,
  Toast, confirmDialog, openForm,
} from '../ui/components';
import { store } from '../core/store';
import * as db from '../core/db';
import { addDays, fmtDate, fmtMoney, nowTime, today, ymd, WEEK_CN } from '../core/date';
import { syncPlantTodos, careInfo, taskTitle, latestPhoto } from '../core/plants';
import { STUDY_ITEMS } from '../data/presets';
import { award, coinsOn, dayVariableSpend, totalCoins, settleDay } from '../core/coins';
import { checkAchievements, isFullDay, streak } from '../core/stats';
import { renderWordStudy } from './words';
import type { ModuleCtx, Todo } from '../types';

const TODO_DAILY_CAP = 2;   // 待办类每日最多 2 金币
const STUDY_DAILY_CAP = 0.6; // 学习类每日最多 0.6 金币

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，早点休息';
  if (hour < 11) return '早安，新的一天开始啦';
  if (hour < 14) return '中午好，别忘了午休';
  if (hour < 18) return '下午好，喝杯水吧';
  if (hour < 22) return '晚上好，今天辛苦了';
  return '夜里安静，适合写点东西';
}

/* ------------------------------ 待办 ------------------------------ */
function todoRow(todo: Todo, ctx: ModuleCtx): HTMLElement {
  const checkbox = h('button', {
    class: `btn btn-icon ${todo.done ? '' : ''}`.trim(),
    type: 'button',
    title: todo.done ? '取消完成' : '标记完成',
    style: `border-radius:50%;border:2px solid ${todo.done ? 'var(--moss)' : 'var(--sage)'};background:${todo.done ? 'var(--moss-mist)' : 'transparent'}`,
  });
  checkbox.appendChild(pixelIcon(todo.done ? 'check' : 'seed', 16, { color: todo.done ? undefined : 'var(--sage)' }));
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    void toggleTodo(todo, ctx);
  });

  const meta: Array<Node | string> = [];
  if (todo.date) meta.push(h('span', null, `${fmtDate(todo.date, 'cn')} 周${WEEK_CN[new Date(`${todo.date}T12:00:00`).getDay()]}`));
  if (todo.time) meta.push(h('span', null, `⏰ ${todo.time}`));
  if (todo.source === 'plant') meta.push(Tag('植物养护', 'green'));
  if (todo.source === 'reminder') meta.push(Tag('提醒', 'honey'));
  if (todo.source === 'study') meta.push(Tag('每日学习', 'line'));

  const right: Node[] = [];
  if (!todo.done) {
    right.push(IconButton('edit', {
      title: '编辑内容与时间',
      onClick: (e) => { e.stopPropagation(); void editTodo(todo, ctx); },
    }));
  } else {
    right.push(h('span', { class: 'tag tag-green', title: '已完成并锁定，如需修改请先取消完成' }, '已锁定'));
  }
  right.push(IconButton('trash', {
    title: '删除',
    onClick: async (e) => {
      e.stopPropagation();
      if (await confirmDialog('删除这条待办？', todo.title, { danger: true })) {
        await db.remove('todos', todo.id);
        await store.refresh('todos');
        await rerender(ctx);
      }
    },
  }));

  return ListRow({
    icon: todo.done ? 'check' : 'seed',
    title: todo.title,
    meta: meta.length ? h('span', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, ...meta) : null,
    right: h('span', { style: 'display:flex;gap:2px;align-items:center' }, checkbox, ...right),
    done: todo.done,
  });
}

async function toggleTodo(todo: Todo, ctx: ModuleCtx): Promise<void> {
  const next = !todo.done;
  await db.patch('todos', todo.id, { done: next, done_at: next ? Date.now() : null, locked: next });
  await store.refresh('todos');

  if (next) {
    // 完成待办 → 金币（每日上限）
    const used = coinsOn(todo.date, 'todo');
    if (used < TODO_DAILY_CAP) {
      await award('todo', Math.min(0.2, TODO_DAILY_CAP - used), `完成待办：${todo.title.slice(0, 12)}`, todo.date);
    }
    // 若是植物养护任务，同步补一条植物日记（未填内容也标记完成）
    if (todo.source === 'plant') {
      await syncPlantTodos(todo.date);
      Toast('植物养护待办已完成，记得去写成长日记哦', 'success');
    }
    await checkAchievements(true);
  } else if (todo.source === 'plant') {
    // 取消完成 → 删除当天该植物的养护记录标记（保留日记内容，只去掉标签）
    const logs = store.list('plant_logs').filter((l) => l.plant_id === todo.source_ref && l.date === todo.date);
    for (const l of logs) {
      const keep = (l.tags ?? []).filter((t) => t !== '换水' && t !== '浇水');
      await db.patch('plant_logs', l.id, { tags: keep as never });
    }
    await store.refresh('plant_logs');
  }
  await rerender(ctx);
}

async function editTodo(todo: Todo, ctx: ModuleCtx): Promise<void> {
  if (todo.done) {
    Toast('已完成并锁定，请先取消完成再编辑', 'error');
    return;
  }
  openForm({
    title: '编辑待办',
    width: 'normal',
    fields: [
      { name: 'title', label: '内容', required: true, value: todo.title, span: 2 },
      { name: 'date', label: '日期', type: 'date', value: todo.date, required: true },
      { name: 'time', label: '时间', type: 'time', value: todo.time, hint: '留空表示不限时间' },
    ],
    onSubmit: async (v) => {
      await db.patch('todos', todo.id, {
        title: String(v.title).trim(),
        date: String(v.date),
        time: String(v.time ?? ''),
      });
      await store.refresh('todos');
      Toast('已更新', 'success');
      await rerender(ctx);
    },
  });
}

function addTodoDialog(ctx: ModuleCtx, date = today()): void {
  openForm({
    title: '添加待办',
    fields: [
      { name: 'title', label: '内容', required: true, placeholder: '例如：给茉莉浇水、读 10 页书', span: 2 },
      { name: 'date', label: '日期', type: 'date', value: date, required: true },
      { name: 'time', label: '时间', type: 'time', value: '', hint: '可留空' },
    ],
    onSubmit: async (v) => {
      await store.save('todos', {
        title: String(v.title).trim(),
        date: String(v.date),
        time: String(v.time ?? ''),
        done: false,
        done_at: null,
        source: 'manual',
        source_ref: '',
        locked: false,
      });
      Toast('已添加待办', 'success');
      await rerender(ctx);
    },
  });
}

/* ------------------------------ 每日学习 ------------------------------ */
async function ensureStudyTodos(date: string): Promise<void> {
  const existing = store.list('todos').filter((t) => t.date === date && t.source === 'study');
  for (const item of STUDY_ITEMS) {
    if (existing.some((t) => t.source_ref === item.key)) continue;
    await db.put('todos', {
      title: `每日学习 · ${item.label}`,
      date,
      time: '',
      done: false,
      done_at: null,
      source: 'study',
      source_ref: item.key,
      locked: false,
    });
  }
  await store.refresh('todos');
}

async function toggleStudy(key: string, ctx: ModuleCtx): Promise<void> {
  const date = today();
  if (key === 'en') {
    ctx.go('#/hub/words');
    return;
  }
  const todo = store.list('todos').find((t) => t.date === date && t.source === 'study' && t.source_ref === key);
  if (!todo) return;
  const next = !todo.done;
  await db.patch('todos', todo.id, { done: next, done_at: next ? Date.now() : null });
  await store.refresh('todos');
  if (next) {
    const used = coinsOn(date, 'study');
    if (used < STUDY_DAILY_CAP) {
      await award('study', Math.min(0.2, STUDY_DAILY_CAP - used), `每日学习：${STUDY_ITEMS.find((s) => s.key === key)?.label ?? key}`, date);
    }
    await settleDay(date, true);
    await checkAchievements(true);
  }
  await rerender(ctx);
}

async function resetStudy(ctx: ModuleCtx): Promise<void> {
  const date = today();
  if (!(await confirmDialog('重置今日学习？', '三项学习的完成状态会清空，可以重新打卡。'))) return;
  for (const t of store.list('todos').filter((x) => x.date === date && x.source === 'study')) {
    await db.patch('todos', t.id, { done: false, done_at: null });
  }
  await store.refresh('todos');
  Toast('已重置，今天可以重新打卡', 'success');
  await rerender(ctx);
}

/* ------------------------------ 渲染 ------------------------------ */
async function rerender(ctx: ModuleCtx): Promise<void> {
  await ctx.refresh();
  ctx.go(`#/hub${ctx.sub === 'words' ? '/words' : ''}`);
  store.emit('change', 'hub');
}

export const hubModule = {
  id: 'hub',
  title: '今日中枢',
  icon: 'hub',
  order: 1,
  desc: '待办 · 学习 · 账户 · 开销',
  badge(): number {
    return store.list('todos').filter((t) => t.date === today() && !t.done).length;
  },

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    if (ctx.sub === 'words') {
      await renderWordStudy(el, ctx, { backHash: '#/hub', backLabel: '今日中枢' });
      return;
    }

    const date = today();
    await syncPlantTodos(date);
    await ensureStudyTodos(date);

    const todos = store.list('todos')
      .filter((t) => t.date === date)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.time !== b.time) return (a.time || '99:99').localeCompare(b.time || '99:99');
        if (a.source !== b.source) return a.source === 'plant' ? -1 : 1;
        return a.created_at - b.created_at;
      });

    const studyTodos = todos.filter((t) => t.source === 'study');
    const normalTodos = todos.filter((t) => t.source !== 'study');
    const doneCount = todos.filter((t) => t.done).length;

    const duePlants = store.list('plants').filter((p) => careInfo(p, date).due);
    const spend = dayVariableSpend(date);
    const accounts = store.accounts();

    /* -------- 头部 -------- */
    const head = Card({
      variant: 'green',
      decor: true,
      title: `${greeting()}，${fmtDate(date, 'full')}`,
      icon: 'sun',
      actions: [
        Button('添加待办', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => addTodoDialog(ctx) }),
      ],
      body: [
        h('div', { class: 'grid grid-auto' },
          Stat({ label: '今日待办', value: `${doneCount}/${todos.length}`, unit: '条', tone: 'green', icon: 'check' }),
          Stat({ label: '连续全勤', value: streak(), unit: '天', tone: 'honey', icon: 'fire' }),
          Stat({ label: '今日可变支出', value: fmtMoney(spend), unit: '元', tone: spend > 50 ? 'red' : 'oak', icon: 'money' }),
          Stat({ label: '金币余额', value: totalCoins().toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
        ),
        h('div', { class: 'mt-3' }, ProgressBar(todos.length ? (doneCount / todos.length) * 100 : 0)),
        h('div', { class: 'tiny muted mt-2' },
          isFullDay(date) ? '今天已全勤，太棒了！🌿' : '把待办和三项学习都完成，就算今天全勤啦。'),
      ],
    });

    /* -------- 待办列表 -------- */
    const todoCard = Card({
      icon: 'list',
      title: `今日待办（${normalTodos.length}）`,
      actions: [
        Button('+ 添加待办', { variant: 'soft', icon: 'plus', size: 'sm', onClick: () => addTodoDialog(ctx) }),
        Button('明天', { variant: 'ghost', icon: 'calendar', size: 'sm', onClick: () => addTodoDialog(ctx, addDays(date, 1)) }),
      ],
      body: normalTodos.length
        ? h('div', { class: 'list' }, ...normalTodos.map((t) => todoRow(t, ctx)))
        : EmptyState({
          icon: 'seed',
          title: '今天还没有待办',
          text: '点击「+ 添加待办」写下今天要做的第一件事。植物到养护日时，任务会自动出现在这里。',
          action: Button('添加待办', { variant: 'primary', icon: 'plus', onClick: () => addTodoDialog(ctx) }),
        }),
      footer: [
        h('span', { class: 'tiny muted' }, `完成一条待办 +0.2 金币（每日上限 ${TODO_DAILY_CAP}）· 完成即锁定，可取消完成后再编辑`),
      ],
    });

    /* -------- 每日学习 -------- */
    const studyCard = Card({
      icon: 'book',
      title: '每日学习三项',
      actions: [Button('重置', { variant: 'ghost', icon: 'refresh', size: 'sm', onClick: () => void resetStudy(ctx) })],
      body: h('div', { class: 'grid grid-3' }, ...STUDY_ITEMS.map((item) => {
        const todo = studyTodos.find((t) => t.source_ref === item.key);
        const done = !!todo?.done;
        const card = Card({
          variant: done ? 'green' : 'flat',
          hoverable: true,
          className: 'no-card-click',
          body: h('div', { style: 'text-align:center;cursor:pointer' },
            h('div', { style: 'display:flex;justify-content:center;margin-bottom:8px' }, pixelIcon(item.icon, 30)),
            h('div', { style: 'font-weight:700' }, item.label),
            h('div', { class: 'tiny muted' }, item.desc),
            h('div', { class: 'mt-2' }, done ? Tag('已完成 · 点击撤销', 'green') : Tag('点击完成', 'line')),
          ),
        });
        card.addEventListener('click', () => void toggleStudy(item.key, ctx));
        return card;
      })),
      footer: [h('span', { class: 'tiny muted' }, `English 会打开单词学习（雅思核心词库，每日 5 个新词 + 5 个复习）· 每项 +0.2 金币（每日上限 ${STUDY_DAILY_CAP}）`)],
    });

    /* -------- 植物养护汇总 -------- */
    const plantCard = Card({
      icon: 'plant',
      title: '植物养护提醒',
      actions: [Button('去花园', { variant: 'soft', icon: 'arrowRight', size: 'sm', onClick: () => ctx.go('#/plants') })],
      body: duePlants.length
        ? h('div', { class: 'list' }, ...duePlants.map((p) => {
          const info = careInfo(p, date);
          return ListRow({
            thumb: latestPhoto(p) || undefined,
            icon: 'plant',
            title: taskTitle(p),
            meta: `${info.overdue ? `已逾期 ${-info.daysLeft} 天` : '今天到期'} · 上次${info.action} ${info.lastDate}`,
            right: Button('记录', {
              variant: 'primary', size: 'sm', icon: 'edit',
              onClick: () => ctx.go(`#/plants/detail/${p.id}`),
            }),
          });
        }))
        : EmptyState({ icon: 'leaf', title: '今天没有到期的养护任务', text: '植物们都在安静生长，去花园看看它们吧。' }),
    });

    /* -------- 五账户速览 -------- */
    const accountCards = accounts.map((a) => {
      const meta = {
        daily: { label: '日常账户', icon: 'wallet', tone: 'oak' as const, unit: '元' },
        fixed: { label: '固定支出', icon: 'home', tone: 'red' as const, unit: '元' },
        income: { label: '收入账户', icon: 'income', tone: 'green' as const, unit: '元' },
        coin: { label: '金币账户', icon: 'coin', tone: 'honey' as const, unit: '枚' },
        wish: { label: '心愿账户', icon: 'gift', tone: 'honey' as const, unit: '元' },
      }[a.kind];
      if (a.kind === 'daily') {
        const quota = a.quota || 0;
        const remain = quota - spend;
        return Card({
          variant: 'flat',
          className: 'no-card-click',
          body: [
            Stat({ label: meta.label, value: fmtMoney(Math.max(0, remain)), unit: '元可用', tone: remain < 0 ? 'red' : 'oak', icon: meta.icon }),
            h('div', { class: 'mt-2' }, ProgressBar(quota ? (spend / quota) * 100 : 0, spend > quota ? 'red' : undefined)),
            h('div', { class: 'tiny muted mt-2' }, `月额度 ${fmtMoney(quota)} 元（当月天数 × 50）· 已用 ${fmtMoney(spend)} 元 · 月初自动重置`),
          ],
        });
      }
      return Card({
        variant: 'flat',
        className: 'no-card-click',
        body: Stat({ label: meta.label, value: fmtMoney(a.balance), unit: meta.unit, tone: meta.tone, icon: meta.icon }),
      });
    });

    const accountCard = Card({
      icon: 'wallet',
      title: '五账户速览',
      actions: [Button('去记账', { variant: 'soft', icon: 'arrowRight', size: 'sm', onClick: () => ctx.go('#/wealth') })],
      body: h('div', { class: 'grid grid-auto' }, ...accountCards),
      footer: [h('span', { class: 'tiny muted' }, '五个账户相互独立：日常额度与固定支出绝不混用，金币 1:1 兑换进心愿账户。')],
    });

    /* -------- 今日开销速览 -------- */
    const todayTx = store.list('transactions').filter((t) => t.date === date && t.kind === 'variable');
    const spendCard = Card({
      icon: 'money',
      title: '今日开销速览',
      actions: [Button('记一笔', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => ctx.go('#/wealth') })],
      body: [
        Stat({ label: '今日可变支出合计', value: fmtMoney(spend), unit: '元', tone: spend > 50 ? 'red' : 'green', icon: 'money' }),
        h('div', { class: 'tiny muted mt-2' }, '省钱奖励规则：0 元 0 币 · 1–15 元 2 币 · 16–30 元 1 币 · 31 元以上 0 币（每周封顶 14 币）'),
        todayTx.length
          ? h('div', { class: 'list mt-3' }, ...todayTx.slice(0, 6).map((t) => ListRow({
            icon: 'cart',
            title: t.category || '未分类',
            meta: [t.note, fmtMoney(t.amount) + ' 元'].filter(Boolean).join(' · '),
            right: Tag(`-${fmtMoney(t.amount)}`, 'red'),
          })))
          : h('div', { class: 'tiny muted mt-3' }, '今天还没有可变支出记录。'),
      ],
    });

    /* -------- 组装 -------- */
    mount(el,
      head,
      h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--sp-4)' },
        h('div', { class: 'col' }, todoCard, studyCard),
        h('div', { class: 'col' }, plantCard, spendCard),
      ),
      SectionTitle('账户与金币', { icon: 'coin' }),
      h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--sp-4)' },
        accountCard,
        Card({
          icon: 'star',
          title: '今日金币',
          body: [
            Stat({ label: '今日获得', value: coinsOn(date).toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
            h('div', { class: 'list mt-3' },
              ...store.list('coins').filter((c) => c.date === date).map((c) => ListRow({
                icon: c.kind === 'save' ? 'piggy' : c.kind === 'combo' ? 'sparkle' : c.kind === 'study' ? 'book' : 'check',
                title: c.reason,
                right: Tag(`+${c.amount}`, 'honey'),
              })),
              store.list('coins').filter((c) => c.date === date).length ? null : h('div', { class: 'tiny muted' }, '今天还没有金币入账。'),
            ),
          ],
        }),
      ),
      SectionTitle('时间', { icon: 'clock' }),
      Card({
        icon: 'clock',
        title: `现在是 ${nowTime()}`,
        body: h('div', { class: 'row row-wrap' },
          Button('雅思听力练习', { variant: 'primary', icon: 'speaker', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/listening') }),
          Button('雅思备考', { variant: 'soft', icon: 'inspire', size: 'sm', onClick: () => ctx.go('#/inspire/ielts') }),
          Button('背单词', { variant: 'soft', icon: 'book', size: 'sm', onClick: () => ctx.go('#/hub/words') }),
          Button('写情侣日志', { variant: 'soft', icon: 'heart', size: 'sm', onClick: () => ctx.go('#/capsule/couple') }),
          Button('记一笔账', { variant: 'soft', icon: 'money', size: 'sm', onClick: () => ctx.go('#/wealth') }),
          Button('看看花园', { variant: 'soft', icon: 'plant', size: 'sm', onClick: () => ctx.go('#/plants') }),
          Button('添加提醒', { variant: 'soft', icon: 'remind', size: 'sm', onClick: () => ctx.go('#/remind') }),
          Button('写备忘录', { variant: 'soft', icon: 'diary', size: 'sm', onClick: () => ctx.go('#/capsule/memo') }),
        ),
      }),
    );

    // 完成状态变化时刷新徽章与金币
    void checkAchievements(false);
  },
};

export { ymd };
