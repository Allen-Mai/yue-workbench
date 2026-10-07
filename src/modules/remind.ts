/* ==========================================================================
   modules/remind.ts · 智能提醒中心
   生日（公历 / 农历） · 定期联系 · 自定义提醒
   分页：待处理 / 即将到来 / 历史 · 手写月历 · 到点通知（站内 + 系统级）
   ========================================================================== */

import { h, mount, clear } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, DatePicker, EmptyState, Field, IconButton, Input, Modal, NumberInput,
  SectionTitle, Segmented, Select, Stat, Tag, TextArea, TimePicker, Toast,
  confirmDialog, openForm,
} from '../ui/components';
import { store } from '../core/store';
import {
  WEEK_CN, addDays, diffDays, fmtDate, lunarBirthdayInYear, relative, today,
} from '../core/date';
import { notify } from '../core/notify';
import { push } from '../core/push';
import type { ModuleCtx, ModuleDef, Reminder, ReminderType } from '../types';

/* ------------------------------ 常量 ------------------------------ */
const TYPE_META: Record<ReminderType, { label: string; icon: string; tone: 'green' | 'red' | 'honey' | 'line'; dot: '' | 'red' | 'green' }> = {
  birthday: { label: '生日提醒', icon: 'gift', tone: 'red', dot: 'red' },
  contact: { label: '定期联系', icon: 'heart', tone: 'green', dot: 'green' },
  custom: { label: '自定义', icon: 'remind', tone: 'honey', dot: '' },
};

const ADVANCE_OPTS = [
  { value: '0', label: '当天提醒' },
  { value: '1', label: '提前 1 天' },
  { value: '2', label: '提前 2 天' },
  { value: '3', label: '提前 3 天' },
  { value: '5', label: '提前 5 天' },
  { value: '7', label: '提前 7 天' },
  { value: '14', label: '提前 14 天' },
  { value: '30', label: '提前 30 天' },
];

const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `农历 ${i + 1} 月` }));
const DAY_OPTS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `初${i + 1}日` }));

const LS_KEY = 'ywb:remind:notified';
const SESSION_KEY = 'ywb:remind:notified';

/* ------------------------------ 类型辅助 ------------------------------ */
function isReminderType(v: unknown): v is ReminderType {
  return v === 'birthday' || v === 'contact' || v === 'custom';
}

function typeOf(r: Reminder): ReminderType {
  return isReminderType(r.type) ? r.type : 'custom';
}

function typeLabel(r: Reminder): string {
  return TYPE_META[typeOf(r)].label;
}

function isDoneOn(r: Reminder, date: string): boolean {
  return (r.done_dates ?? []).includes(date);
}

/**
 * 计算下一个到期日（与 main.ts 的 dueDateOf 同算法，仅用于展示）
 * yearly → 今年的月日，已过则明年
 * monthly → 本月的日，已过则下月
 * weekly → 本周/下周对应的星期几（以 date 那天的 getDay() 为目标）
 * none → 原日期
 */
function dueDateOf(r: Reminder, ref = today()): string {
  if (!r.date) return '';
  if (r.repeat === 'yearly') {
    const md = r.date.slice(5);
    const candidate = `${ref.slice(0, 4)}-${md}`;
    return diffDays(candidate, ref) < 0 ? `${Number(ref.slice(0, 4)) + 1}-${md}` : candidate;
  }
  if (r.repeat === 'monthly') {
    const dd = r.date.slice(8);
    const candidate = `${ref.slice(0, 7)}-${dd}`;
    return diffDays(candidate, ref) < 0 ? `${addDays(candidate, 32).slice(0, 7)}-${dd}` : candidate;
  }
  if (r.repeat === 'weekly') {
    const target = new Date(`${r.date}T12:00:00`).getDay();
    const cur = new Date(`${ref}T12:00:00`).getDay();
    const delta = (target - cur + 7) % 7;
    return addDays(ref, delta);
  }
  return r.date;
}

/** 农历生日在 ref 年份对应的公历日期（平月） */
function lunarDateOf(r: Reminder, year: number): string {
  const [, m, d] = String(r.date ?? '').split('-').map(Number);
  if (!m || !d) return '';
  return lunarBirthdayInYear(m, d, year);
}

/** 列表里展示的日期文案 */
function dateText(r: Reminder): string {
  if (typeOf(r) === 'birthday' && r.calendar === 'lunar') {
    const [, m, d] = String(r.date ?? '').split('-').map(Number);
    const solar = lunarDateOf(r, new Date().getFullYear());
    return `农历 ${m || '?'}月${d || '?'}日 → 公历 ${solar || '—'}`;
  }
  return r.date ? `${r.date} 周${WEEK_CN[new Date(`${r.date}T12:00:00`).getDay()]}` : '未设置日期';
}

function freqText(r: Reminder): string {
  if (typeOf(r) === 'birthday') return '每年重复';
  const map: Record<Reminder['repeat'], string> = { none: '不重复', yearly: '每年', monthly: '每月', weekly: '每周' };
  return map[r.repeat] ?? '不重复';
}

/* ------------------------------ 表单 ------------------------------ */
interface Draft {
  type: ReminderType;
  name: string;
  calendar: 'solar' | 'lunar';
  solarDate: string;
  lunarMonth: number;
  lunarDay: number;
  title: string;
  date: string;
  repeat: Reminder['repeat'];
  advance: number;
  contact: string;
  phone: string;
  time: string;
  note: string;
}

function draftOf(r?: Reminder): Draft {
  const d: Draft = {
    type: r ? typeOf(r) : 'birthday',
    name: '',
    calendar: r?.calendar === 'lunar' ? 'lunar' : 'solar',
    solarDate: today(),
    lunarMonth: 1,
    lunarDay: 1,
    title: r?.title ?? '',
    date: r?.date ?? today(),
    repeat: r?.repeat ?? 'none',
    advance: Number(r?.advance ?? 0),
    contact: r?.contact ?? '',
    phone: r?.phone ?? '',
    time: r?.time ?? '',
    note: r?.note ?? '',
  };
  if (r) {
    if (d.type === 'birthday') d.name = r.title;
    if (d.type === 'contact') d.title = r.title;
    if (d.type === 'birthday' && r.calendar === 'lunar') {
      const [, m, day] = String(r.date ?? '').split('-').map(Number);
      d.lunarMonth = Math.min(12, Math.max(1, m || 1));
      d.lunarDay = Math.min(30, Math.max(1, day || 1));
    } else {
      d.solarDate = r.date || today();
    }
  }
  return d;
}

function advanceOptions(cur: number): Array<{ value: string; label: string }> {
  const base = [...ADVANCE_OPTS];
  if (cur > 0 && !base.some((o) => Number(o.value) === cur)) base.push({ value: String(cur), label: `提前 ${cur} 天` });
  return base;
}

function segValue(v: string): Reminder['repeat'] {
  return v === 'yearly' || v === 'monthly' || v === 'weekly' ? v : 'none';
}

function reminderForm(ctx: ModuleCtx, editing?: Reminder): void {
  const draft = draftOf(editing);
  const grid = h('div', { class: 'form-grid' });
  const errorEl = h('div', { class: 'field-error', style: 'min-height:16px' });

  const build = (): void => {
    clear(grid);
    const typeSel = Select(
      (['birthday', 'contact', 'custom'] as ReminderType[]).map((t) => ({ value: t, label: TYPE_META[t].label })),
      { value: draft.type, onChange: (v) => { if (isReminderType(v)) { draft.type = v; build(); } } },
    );
    grid.appendChild(Field('提醒类型', typeSel, { required: true, className: 'span-2' }));

    if (draft.type === 'birthday') {
      const calSel = Select(
        [{ value: 'solar', label: '公历（阳历）' }, { value: 'lunar', label: '农历（阴历）' }],
        { value: draft.calendar, onChange: (v) => { draft.calendar = v === 'lunar' ? 'lunar' : 'solar'; build(); } },
      );
      grid.appendChild(Field('姓名', Input({
        value: draft.name, placeholder: '例如：妈妈 / 小熊',
        onInput: (v) => { draft.name = v; },
      }), { required: true }));
      grid.appendChild(Field('历法', calSel, { required: true }));

      const preview = h('div', { class: 'tiny muted' });
      const syncPreview = (): void => {
        if (draft.calendar !== 'lunar') {
          preview.textContent = `公历每年 ${String(draft.solarDate).slice(5)} · 每年重复`;
          return;
        }
        const y = new Date().getFullYear();
        const m = String(draft.lunarMonth).padStart(2, '0');
        const d = String(draft.lunarDay).padStart(2, '0');
        const solar = lunarBirthdayInYear(draft.lunarMonth, draft.lunarDay, y);
        preview.textContent = `农历 ${draft.lunarMonth}月${draft.lunarDay}日（${y}-${m}-${d}）→ 今年公历 ${solar || '—'}`;
      };

      if (draft.calendar === 'solar') {
        grid.appendChild(Field('公历生日', DatePicker({
          value: draft.solarDate,
          onChange: (v) => { draft.solarDate = v; syncPreview(); },
        }), { required: true, className: 'span-2', hint: '只需月份与日期，年份不参与计算' }));
      } else {
        grid.appendChild(Field('农历月份', Select(MONTH_OPTS, {
          value: String(draft.lunarMonth),
          onChange: (v) => { draft.lunarMonth = Number(v) || 1; syncPreview(); },
        }), { required: true }));
        grid.appendChild(Field('农历日', Select(DAY_OPTS, {
          value: String(draft.lunarDay),
          onChange: (v) => { draft.lunarDay = Number(v) || 1; syncPreview(); },
        }), { required: true, hint: '按平月换算闰月' }));
      }
      grid.appendChild(Field('今年对应公历', preview, { className: 'span-2' }));
      syncPreview();

      grid.appendChild(Field('提前提醒', Select(advanceOptions(draft.advance), {
        value: String(draft.advance),
        onChange: (v) => { draft.advance = Number(v) || 0; },
      }), { hint: '到期日之前 N 天也会提醒' }));
      grid.appendChild(Field('重复', h('div', { class: 'small muted' }, '每年重复（生日固定为每年，无需修改）')));
    } else if (draft.type === 'contact') {
      grid.appendChild(Field('联系人', Input({
        value: draft.contact, placeholder: '例如：外婆 / 老同学阿哲',
        onInput: (v) => { draft.contact = v; },
      }), { required: true }));
      grid.appendChild(Field('称呼备注', Input({
        value: draft.title, placeholder: '例如：每周问候一次',
        onInput: (v) => { draft.title = v; },
      }), { hint: '显示在提醒标题上' }));
      grid.appendChild(Field('频率', Segmented([
        { value: 'weekly', label: '每周' },
        { value: 'monthly', label: '每月' },
        { value: 'none', label: '仅一次' },
      ], { value: draft.repeat === 'yearly' ? 'weekly' : draft.repeat, onChange: (v) => { draft.repeat = segValue(v); } }), { required: true }));
      grid.appendChild(Field('具体时间', TimePicker({
        value: draft.time,
        onChange: (v) => { draft.time = v; },
      }), { hint: '留空表示全天任意时刻' }));
      grid.appendChild(Field('起始日期', DatePicker({
        value: draft.date,
        onChange: (v) => { draft.date = v; },
      }), { required: true, hint: '每周 / 每月以此为基准换算' }));
      grid.appendChild(Field('提前提醒', Select(advanceOptions(draft.advance), {
        value: String(draft.advance),
        onChange: (v) => { draft.advance = Number(v) || 0; },
      })));
      grid.appendChild(Field('电话', Input({
        value: draft.phone, placeholder: '可留空',
        onInput: (v) => { draft.phone = v; },
      })));
    } else {
      grid.appendChild(Field('事项', Input({
        value: draft.title, placeholder: '例如：交房租 / 体检 / 换滤芯',
        onInput: (v) => { draft.title = v; },
      }), { required: true, className: 'span-2' }));
      grid.appendChild(Field('日期', DatePicker({
        value: draft.date,
        onChange: (v) => { draft.date = v; },
      }), { required: true }));
      grid.appendChild(Field('周期', Segmented([
        { value: 'none', label: '不重复' },
        { value: 'weekly', label: '每周' },
        { value: 'monthly', label: '每月' },
        { value: 'yearly', label: '每年' },
      ], { value: draft.repeat, onChange: (v) => { draft.repeat = segValue(v); } })));
      grid.appendChild(Field('提前天数', NumberInput({
        value: draft.advance, min: 0, max: 365,
        onChange: (v) => { draft.advance = Number.isNaN(v) ? 0 : Math.max(0, Math.round(v)); },
      }), { hint: '0 表示当天提醒' }));
      grid.appendChild(Field('具体时间', TimePicker({
        value: draft.time,
        onChange: (v) => { draft.time = v; },
      }), { hint: '可留空' }));
      grid.appendChild(Field('备注', TextArea({
        value: draft.note, rows: 3, placeholder: '补充说明…',
        onInput: (v) => { draft.note = v; },
      }), { className: 'span-2' }));
    }

    if (editing) {
      const done = editing.done_dates ?? [];
      grid.appendChild(Field('已处理记录', h('div', { class: 'tiny muted' }, done.length ? done.join('、') : '暂无'), { className: 'span-2' }));
    }
  };

  build();

  const save = async (): Promise<void> => {
    const name = draft.name.trim();
    const title = (draft.type === 'birthday' ? name : draft.title.trim())
      || (draft.type === 'contact' ? draft.contact.trim() : '');
    if (!title) {
      errorEl.textContent = draft.type === 'birthday' ? '请填写「姓名」' : '请填写标题';
      return;
    }
    let date = draft.date;
    if (draft.type === 'birthday') {
      date = draft.calendar === 'lunar'
        ? `2000-${String(draft.lunarMonth).padStart(2, '0')}-${String(draft.lunarDay).padStart(2, '0')}`
        : (draft.solarDate || today());
      if (!date) { errorEl.textContent = '请选择日期'; return; }
    } else if (!date) {
      errorEl.textContent = '请选择日期';
      return;
    }
    errorEl.textContent = '';
    try {
      await store.save('reminders', {
        id: editing?.id,
        type: draft.type,
        title,
        calendar: draft.type === 'birthday' ? draft.calendar : 'solar',
        date,
        advance: Math.max(0, Math.round(Number(draft.advance) || 0)),
        repeat: draft.type === 'birthday' ? 'yearly' : (draft.type === 'contact' ? segValue(draft.repeat) : draft.repeat),
        time: draft.type === 'birthday' ? '' : draft.time,
        contact: draft.type === 'contact' ? draft.contact.trim() : '',
        phone: draft.type === 'contact' ? draft.phone.trim() : '',
        note: draft.type === 'custom' ? draft.note.trim() : draft.note.trim(),
        done_dates: editing?.done_dates ?? [],
      } as Partial<Reminder>);
      Toast(editing ? '已更新提醒' : '已添加提醒', 'success');
      await ctx.refresh('reminders');
      m.close();
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : '保存失败，请重试';
    }
  };

  const m = Modal({
    title: editing ? '编辑提醒' : '新增提醒',
    width: 'normal',
    body: [grid, errorEl],
    actions: [
      { label: '取消', variant: 'ghost' },
      { label: '保存', variant: 'primary', onClick: () => void save() },
    ],
  });
}

/* ------------------------------ 列表 ------------------------------ */
function markDone(r: Reminder, ctx: ModuleCtx): void {
  const due = dueDateOf(r) || r.date;
  openForm({
    title: '标记已处理',
    fields: [
      {
        name: 'due', label: '处理的是哪一次', type: 'date', value: due, required: true,
        hint: '该日期会写入「已处理」记录，用于区分每一次提醒',
      },
      {
        name: 'note', label: '备注', type: 'textarea', rows: 2, value: '',
        placeholder: '例如：打了电话、送出生日祝福',
      },
    ],
    onSubmit: async (v) => {
      const date = String(v.due);
      const done = Array.from(new Set([...(r.done_dates ?? []), date]));
      const patch: Partial<Reminder> = { done_dates: done };
      const note = String(v.note ?? '').trim();
      if (note) patch.note = note;
      await store.patch('reminders', r.id, patch);
      Toast('已标记为处理完成', 'success');
      await ctx.refresh('reminders');
    },
  });
}

function undoDone(r: Reminder, date: string, ctx: ModuleCtx): void {
  void (async () => {
    await store.patch('reminders', r.id, {
      done_dates: (r.done_dates ?? []).filter((d) => d !== date),
    });
    Toast('已撤销处理标记', 'success');
    await ctx.refresh('reminders');
  })();
}

async function removeReminder(r: Reminder, ctx: ModuleCtx): Promise<void> {
  if (!(await confirmDialog('删除这条提醒？', `${r.title} · ${typeLabel(r)}`, { danger: true }))) return;
  await store.drop('reminders', r.id);
  Toast('已删除', 'success');
  await ctx.refresh('reminders');
}

function reminderRow(r: Reminder, ctx: ModuleCtx, view: 'pending' | 'upcoming' | 'history'): HTMLElement {
  const meta = TYPE_META[typeOf(r)];
  const due = dueDateOf(r) || r.date;
  const left = due ? diffDays(due, today()) : 0;
  const card = Card({
    className: 'no-card-click',
    variant: view === 'pending' ? 'warm' : 'default',
    icon: meta.icon,
    title: r.title || '（未命名提醒）',
    subtitle: `${typeLabel(r)} · ${freqText(r)}`,
    actions: [
      IconButton('edit', { title: '编辑', onClick: () => reminderForm(ctx, r) }),
      IconButton('trash', { title: '删除', onClick: () => void removeReminder(r, ctx) }),
    ],
    body: [
      h('div', { class: 'row row-wrap' },
        Tag(dateText(r), meta.tone),
        Tag(`下一个到期：${due || '—'}`, due && left <= 0 ? 'honey' : 'line'),
        r.advance > 0 ? Tag(`提前 ${r.advance} 天`, 'line') : null,
        r.time ? Tag(`时间 ${r.time}`, 'line') : null,
      ),
      h('div', { class: 'tiny muted mt-2' },
        due
          ? `${relative(due)} · ${fmtDate(due)}${r.advance > 0 ? ` · 会在提前 ${r.advance} 天与当天分别提醒` : ''}`
          : '还没有设置日期'),
      r.contact || r.phone ? h('div', { class: 'small mt-2' }, `联系人：${r.contact || '—'}${r.phone ? ` · ${r.phone}` : ''}`) : null,
      r.note ? h('div', { class: 'small muted mt-2' }, `备注：${r.note}`) : null,
      view === 'history' && (r.done_dates?.length ?? 0)
        ? h('div', { class: 'row row-wrap mt-2' },
          ...(r.done_dates ?? []).slice(-6).map((d) => Button(`✓ ${d}`, {
            variant: 'ghost', size: 'sm', title: '点击撤销这次处理标记',
            onClick: () => undoDone(r, d, ctx),
          })),
        )
        : null,
    ],
    footer: view === 'history'
      ? [h('span', { class: 'tiny muted' }, `已处理 ${(r.done_dates ?? []).length} 次（点上方日期可撤销）`)]
      : [
        Button('标记已处理', { variant: 'primary', icon: 'check', size: 'sm', onClick: () => markDone(r, ctx) }),
        r.contact && r.phone ? Button('打电话', { variant: 'soft', icon: 'link', size: 'sm', onClick: () => { location.href = `tel:${r.phone}`; } }) : null,
      ],
  });
  return card;
}

/* ------------------------------ 日历 ------------------------------ */
function calendarCard(filterDate: string, onPick: (d: string) => void, rerender: () => void): HTMLElement {
  const parseMonth = (): { year: number; month: number } => {
    const src = filterDate || today();
    const [y, m] = src.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: m || new Date().getMonth() + 1 };
  };
  const { year, month } = parseMonth();
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const firstDay = new Date(`${first}T12:00:00`).getDay();
  const total = new Date(year, month, 0).getDate();
  const reminders = store.list('reminders');

  const grid = h('div', { class: 'cal' });
  for (let i = 0; i < 7; i++) grid.appendChild(h('div', { class: 'cal-head' }, `周${WEEK_CN[i]}`));

  const dotsFor = (date: string): string[] => {
    const out = new Set<string>();
    for (const r of reminders) {
      if (dueDateOf(r, date) !== date) continue;
      out.add(TYPE_META[typeOf(r)].dot);
    }
    return Array.from(out);
  };

  const buildCell = (date: string, out: boolean): HTMLElement => {
    const cell = h('button', {
      type: 'button',
      class: `cal-cell${out ? ' is-out' : ''}${date === today() ? ' is-today' : ''}${date === filterDate ? ' is-selected' : ''}`,
      title: date,
    });
    cell.appendChild(h('span', null, String(Number(date.slice(8)))));
    const dots = dotsFor(date);
    if (dots.length) {
      const bar = h('div', { class: 'cal-dots' });
      for (const tone of dots) bar.appendChild(h('i', { class: tone }));
      cell.appendChild(bar);
    }
    cell.addEventListener('click', () => {
      onPick(date === filterDate ? '' : date);
      rerender();
    });
    return cell;
  };

  const monthLabel = h('div', { class: 'small', style: 'font-weight:700' }, `${year} 年 ${month} 月`);
  const shift = (n: number) => {
    const d = new Date(year, month - 1 + n, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    onPick(next);
    rerender();
  };

  const renderCells = (): void => {
    while (grid.children.length > 7) grid.removeChild(grid.lastChild as Node);
    for (let i = 0; i < firstDay; i++) {
      const prev = addDays(first, i - firstDay);
      grid.appendChild(buildCell(prev, true));
    }
    for (let d = 1; d <= total; d++) {
      grid.appendChild(buildCell(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, false));
    }
    const tail = (7 - ((firstDay + total) % 7)) % 7;
    for (let i = 1; i <= tail; i++) grid.appendChild(buildCell(addDays(`${year}-${String(month).padStart(2, '0')}-${String(total).padStart(2, '0')}`, i), true));
  };
  renderCells();
  monthLabel.textContent = `${year} 年 ${month} 月`;

  return Card({
    icon: 'calendar',
    title: '月历视图',
    subtitle: filterDate ? `已筛选：${filterDate}` : '点击某一天筛选当天提醒',
    actions: [
      IconButton('arrowLeft', { title: '上个月', onClick: () => shift(-1) }),
      monthLabel,
      IconButton('arrowRight', { title: '下个月', onClick: () => shift(1) }),
      filterDate ? Button('清除筛选', { variant: 'ghost', size: 'sm', onClick: () => { onPick(''); rerender(); } }) : null,
    ],
    body: [
      grid,
      h('div', { class: 'row row-wrap tiny muted mt-3' },
        h('span', { class: 'row', style: 'gap:4px' }, h('i', { style: 'width:6px;height:6px;border-radius:50%;background:var(--red);display:block' }), '生日'),
        h('span', { class: 'row', style: 'gap:4px' }, h('i', { style: 'width:6px;height:6px;border-radius:50%;background:var(--moss-soft);display:block' }), '联系'),
        h('span', { class: 'row', style: 'gap:4px' }, h('i', { style: 'width:6px;height:6px;border-radius:50%;background:var(--orange);display:block' }), '自定义'),
        h('span', null, '（小圆点表示当天有对应类型的提醒）'),
      ),
    ],
  });
}

/* ------------------------------ 到点通知 ------------------------------ */
function loadFired(): string[] {
  try {
    const a = localStorage.getItem(LS_KEY);
    const b = sessionStorage.getItem(SESSION_KEY);
    const parsed = (raw: string | null): string[] => {
      const v: unknown = JSON.parse(raw ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    };
    return Array.from(new Set([...parsed(a), ...parsed(b)]));
  } catch {
    return [];
  }
}

function markFired(key: string): void {
  try {
    const cur = loadFired();
    if (cur.includes(key)) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...cur, key]));
  } catch {
    /* 忽略隐私模式下的存储异常 */
  }
}

/** 今天应该提醒的到期项（含提前 N 天）；用 sessionStorage（+localStorage）做当天去重，刷新不重复弹 */
function fireDueNotifications(): Reminder[] {
  const fired = new Set(loadFired());
  const date = today();
  const dueNow: Reminder[] = [];
  for (const r of store.list('reminders')) {
    const due = dueDateOf(r, date);
    if (!due || isDoneOn(r, due)) continue;
    const left = diffDays(due, date);
    const advance = Number(r.advance ?? 0);
    const isToday = left === 0;
    const isAdvance = advance > 0 && left === advance;
    const late = left < 0 && r.repeat === 'none';
    if (!isToday && !isAdvance && !late) continue;
    dueNow.push(r);
    const key = `remind-${r.id}-${date}`;
    if (fired.has(key)) continue;
    const title = isToday ? `⏰ 今天：${r.title}` : left > 0 ? `🔔 还有 ${left} 天 · ${r.title}` : `⚠️ 已过期 ${-left} 天 · ${r.title}`;
    const text = [
      typeLabel(r),
      r.time ? `时间 ${r.time}` : '',
      r.contact ? `联系人 ${r.contact}` : '',
      r.note || '',
      '去提醒中心处理',
    ].filter(Boolean).join(' · ');
    notify.push({
      title,
      text,
      tone: 'remind',
      system: true,
      icon: 'remind',
      tag: key,
      onClick: () => ctxGoRemind(),
    });
    markFired(key);
  }
  return dueNow;
}

function ctxGoRemind(): void {
  if (location.hash !== '#/remind') location.hash = '#/remind';
}

/* ------------------------------ 推送卡片 ------------------------------ */
function pushCard(): HTMLElement {
  const statusEl = h('span', { class: 'tag tag-line' }, '读取中…');
  const refreshStatus = (): void => {
    void (async () => {
      try {
        const s = await push.status();
        statusEl.textContent = `当前状态：${s}`;
        statusEl.className = `tag ${s === 'subscribed' || s === 'granted' ? 'tag-green' : s === 'denied' ? 'tag-red' : 'tag-line'}`;
      } catch {
        statusEl.textContent = '当前状态：未知';
      }
    })();
  };
  refreshStatus();
  return Card({
    icon: 'notice',
    title: '系统推送权限',
    actions: [statusEl],
    body: [
      h('div', { class: 'small muted' },
        '开启后，到点的提醒会出现在手机锁屏上（关闭网页也能收到需要配置 VAPID 密钥）。'),
      h('div', { class: 'row row-wrap mt-3' },
        Button('申请系统推送权限', {
          variant: 'primary', icon: 'remind',
          onClick: () => {
            void (async () => {
              try {
                const res = await push.enable();
                Toast(res.message, res.ok ? 'success' : 'error');
              } catch (err) {
                Toast(err instanceof Error ? err.message : '申请推送权限失败', 'error');
              }
              refreshStatus();
            })();
          },
        }),
        Button('刷新状态', { variant: 'ghost', icon: 'refresh', size: 'sm', onClick: refreshStatus }),
      ),
    ],
  });
}

/* ------------------------------ 页面 ------------------------------ */
function page(el: HTMLElement, ctx: ModuleCtx): void {
  let view: 'pending' | 'upcoming' | 'history' = 'pending';
  let filterDate = '';

  const dueNow = fireDueNotifications();
  const listEl = h('div', { class: 'col' });
  const calEl = h('div');
  const segEl = h('div');

  const collect = (): Reminder[] => {
    const ref = today();
    const all = store.list('reminders').filter((r) => !filterDate || dueDateOf(r, filterDate) === filterDate || r.date === filterDate);
    const pending: Reminder[] = [];
    const upcoming: Reminder[] = [];
    const history: Reminder[] = [];
    for (const r of all) {
      const due = dueDateOf(r, ref) || r.date;
      if (!due) { history.push(r); continue; }
      const left = diffDays(due, ref);
      const doneCount = (r.done_dates ?? []).length;
      if (left < -1 && doneCount === 0) history.push(r);
      else if (isDoneOn(r, due) || (r.done_dates?.length ?? 0) > 0) history.push(r);
      else if (left <= 0) pending.push(r);
      else if (left <= 30) upcoming.push(r);
      else history.push(r);
    }
    const sort = (arr: Reminder[]) => arr.sort((a, b) => {
      const da = dueDateOf(a, ref) || '9999-12-31';
      const db = dueDateOf(b, ref) || '9999-12-31';
      return da === db ? a.created_at - b.created_at : (da < db ? -1 : 1);
    });
    if (view === 'pending') return sort(pending);
    if (view === 'upcoming') return sort(upcoming);
    return sort(history).reverse();
  };

  const counts = (): { pending: number; upcoming: number; history: number } => {
    const ref = today();
    let pending = 0;
    let upcoming = 0;
    let history = 0;
    for (const r of store.list('reminders')) {
      const due = dueDateOf(r, ref) || r.date;
      if (!due) { history++; continue; }
      const left = diffDays(due, ref);
      if (left < -1 && (r.done_dates?.length ?? 0) === 0) history++;
      else if (isDueHandled(r, due)) history++;
      else if (left <= 0) pending++;
      else if (left <= 30) upcoming++;
      else history++;
    }
    return { pending, upcoming, history };
  };

  function isDueHandled(r: Reminder, due: string): boolean {
    return (r.done_dates ?? []).includes(due) || (r.done_dates?.length ?? 0) > 0;
  }

  const render = (): void => {
    const c = counts();
    const rows = collect();
    const current = view;
    clear(segEl);
    segEl.appendChild(Segmented([
      { value: 'pending', label: `待处理 ${c.pending}` },
      { value: 'upcoming', label: `即将到来 ${c.upcoming}` },
      { value: 'history', label: `历史 ${c.history}` },
    ], { value: current, onChange: (v) => { view = v === 'upcoming' || v === 'history' ? v : 'pending'; render(); } }));

    clear(listEl);
    if (!rows.length) {
      listEl.appendChild(EmptyState({
        icon: 'remind',
        title: view === 'pending' ? '没有待处理的提醒' : view === 'upcoming' ? '未来 30 天暂时没有安排' : '还没有历史记录',
        text: filterDate ? `当前筛选：${filterDate}，点右侧「清除筛选」看全部。` : '点击右上角「新增提醒」写下第一件要记住的事。',
        action: Button('新增提醒', { variant: 'primary', icon: 'plus', onClick: () => reminderForm(ctx) }),
      }));
      return;
    }
    for (const r of rows) listEl.appendChild(reminderRow(r, ctx, view));
  };

  const rerenderAll = (): void => {
    clear(calEl);
    calEl.appendChild(calendarCard(filterDate, (d) => { filterDate = d; }, rerenderAll));
    render();
  };

  // 顶部：汇总统计 + 分段 + 日历 + 列表 + 推送卡片
  const monthKey = today().slice(0, 7);
  const handledThisMonth = store.list('reminders')
    .reduce((s, r) => s + (r.done_dates ?? []).filter((d) => d.startsWith(monthKey)).length, 0);
  const c = counts();
  const summaryShown = dueNow.length;

  mount(el,
    h('div', { class: 'col' },
      h('div', { class: 'row row-wrap mb-2' },
        Button('新增提醒', { variant: 'primary', icon: 'plus', onClick: () => reminderForm(ctx) }),
        c.pending ? Button('查看待处理', { variant: 'soft', icon: 'remind', size: 'sm', onClick: () => { view = 'pending'; render(); } }) : null,
        c.upcoming ? Button('查看即将到来', { variant: 'ghost', icon: 'calendar', size: 'sm', onClick: () => { view = 'upcoming'; render(); } }) : null,
      ),
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月已处理', value: handledThisMonth, unit: '项', tone: 'green', icon: 'check' }),
        Stat({ label: '即将到来', value: c.upcoming, unit: '项', tone: 'honey', icon: 'clock' }),
        Stat({ label: '待处理', value: c.pending, unit: '项', tone: c.pending ? 'red' : 'oak', icon: 'remind' }),
        Stat({ label: '提醒总数', value: store.list('reminders').length, unit: '条', tone: 'oak', icon: 'list' }),
      ),
      summaryShown
        ? h('div', { class: 'banner tone-remind', style: 'margin-top:0' },
          h('span', { class: 'banner-icon' }, pixelIcon('remind', 22)),
          h('div', { class: 'banner-main' },
            h('div', { class: 'banner-title' }, `今天有 ${summaryShown} 条提醒需要关注`),
            h('div', { class: 'banner-text' },
              dueNow.slice(0, 4).map((r) => `${r.title}（${dueDateOf(r) || r.date}）`).join(' · ')
              + (dueNow.length > 4 ? ` 等 ${dueNow.length} 条` : '')),
          ),
        )
        : null,
      SectionTitle('提醒日历', { icon: 'calendar' }),
      calEl,
      SectionTitle('提醒列表', { icon: 'list', extra: c.pending ? Tag(`${c.pending} 条待处理`, 'honey') : null }),
      segEl,
      listEl,
      SectionTitle('通知设置', { icon: 'notice' }),
      pushCard(),
      h('div', { class: 'tiny muted' },
        '说明：农历生日按 1900–2100 农历表换算为今年的公历日期；「提前 N 天」与当天各提醒一次，同一天内刷新页面不会重复弹窗。'),
    ),
  );

  rerenderAll();
}

/* ------------------------------ 模块 ------------------------------ */
export const remindModule: ModuleDef = {
  id: 'remind',
  title: '智能提醒中心',
  icon: 'remind',
  order: 6,
  desc: '生日 · 联系 · 自定义',

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    try {
      page(el, ctx);
    } catch (err) {
      console.error('[remind] 渲染失败', err);
      mount(el, Card({
        icon: 'remind',
        title: '提醒中心暂时打了盹',
        body: EmptyState({
          icon: 'remind',
          title: '加载失败',
          text: err instanceof Error ? err.message : String(err),
          action: Button('重新加载', { variant: 'primary', icon: 'refresh', onClick: () => void ctx.refresh('reminders') }),
        }),
      }));
      Toast('提醒中心加载失败', 'error');
    }
  },

  badge(): number {
    const ref = today();
    let n = 0;
    for (const r of store.list('reminders')) {
      const due = dueDateOf(r, ref) || r.date;
      if (!due) continue;
      const left = diffDays(due, ref);
      if (left > 0) continue;
      if ((r.done_dates ?? []).includes(due)) continue;
      n++;
    }
    return n;
  },
};

export { dueDateOf, lunarDateOf, typeLabel, typeOf };
