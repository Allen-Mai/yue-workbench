/* ==========================================================================
   modules/plants.ts · 植物养护（花园总览 + 单株成长日记）
   --------------------------------------------------------------------------
   一级页 #/plants        · 花园总览：统计 / 卡片列表 / 新增 / 编辑 / 删除
   二级页 #/plants/detail/<id> · 成长日记：相册 / 时间轴 / 成长分析
   养护节律与待办汇总全部复用 core/plants.ts，本文件只负责界面与交互。
   ========================================================================== */

import { h, mount } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, ProgressBar, SectionTitle, Stat, Tag,
  Toast, confirmDialog, openForm,
} from '../ui/components';
import { Uploader, Gallery } from '../ui/gallery';
import { heatmap } from '../ui/charts';
import {
  addPlantLog, baseName, careInfo, caredToday, emotionalFeedback, latestPhoto,
  plantAge, recordFrequency, statusOf, syncPlantTodos,
} from '../core/plants';
import { store } from '../core/store';
import * as db from '../core/db';
import { addDays, diffDays, fmtDate, today } from '../core/date';
import { CATEGORY_META, PLANT_FEEDBACKS, PLANT_STATUS_META, PLANT_TAGS } from '../data/presets';
import type { ModuleCtx, ModuleDef, Plant, PlantCategory, PlantLog, PlantStatus } from '../types';

/* store 方法绑定为模块级函数，避免解构丢 this */
const listPlants = () => store.list('plants');
const listLogs = () => store.list('plant_logs');
const savePlantRow = store.save.bind(store);
const dropPlantRow = store.drop.bind(store);

/** 今天是否需要照顾这株植物 */
function isDueToday(plant: Plant): boolean {
  return careInfo(plant).due;
}

/* 反馈 → 像素图标（茂盛在 PLANT_STATUS_META 里没有对应项） */
const FEEDBACK_ICON: Record<string, string> = {
  发芽: 'seed',
  生长: 'sprout',
  开花: 'flower',
  休眠: 'moon',
  茂盛: 'tree',
};

function iconOfFeedback(feedback: string): string {
  return FEEDBACK_ICON[feedback] ?? 'sprout';
}

/* ------------------------------ 通用小工具 ------------------------------ */

/** 植物当前成长状态（优先取最新日记的情绪反馈） */
function currentStatus(plant: Plant): { key: string; label: string; icon: string } {
  const s = String(statusOf(plant) ?? plant.status);
  if (s in PLANT_STATUS_META) {
    const meta = PLANT_STATUS_META[s as PlantStatus];
    return { key: s, label: meta.label, icon: meta.icon };
  }
  return { key: s, label: s, icon: iconOfFeedback(s) };
}

function plantLogs(plantId: string): PlantLog[] {
  return listLogs()
    .filter((l) => l.plant_id === plantId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created_at - a.created_at));
}

function logsOfDate(plantId: string, date: string): PlantLog[] {
  return plantLogs(plantId).filter((l) => l.date === date);
}

/** 花园坚持天数：最早种植日期 → 今天 */
function gardenDays(): number {
  const plants = listPlants();
  if (!plants.length) return 0;
  const earliest = plants.map((p) => p.planted_at).filter(Boolean).sort()[0] ?? today();
  return Math.max(0, diffDays(today(), earliest));
}

/** 统一的重绘：先刷新缓存，再用同一个容器重跑本模块 */
async function rerender(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  try {
    await ctx.refresh('plants');
  } catch (err) {
    console.warn('[plants] 刷新失败', err);
  }
  await plantsModule.render(el, ctx);
}

/** 安全同步今日养护待办（失败也不阻断渲染） */
async function syncTodos(): Promise<void> {
  try {
    await syncPlantTodos(today());
  } catch (err) {
    console.warn('[plants] 待办同步失败', err);
    Toast('今日待办同步失败，稍后可刷新重试', 'error');
  }
}

async function reload(): Promise<void> {
  try {
    await store.refresh('plant_logs');
  } catch (err) {
    console.warn('[plants] 缓存刷新失败', err);
  }
}

/* ------------------------------ 添加 / 编辑植物 ------------------------------ */
function plantDialog(plant: Plant | null, el: HTMLElement, ctx: ModuleCtx): void {
  const isEdit = !!plant;
  const categoryOptions = (Object.keys(CATEGORY_META) as PlantCategory[]).map((k) => ({
    value: k,
    label: CATEGORY_META[k].label,
  }));
  const statusOptions = (Object.keys(PLANT_STATUS_META) as PlantStatus[]).map((k) => ({
    value: k,
    label: PLANT_STATUS_META[k].label,
  }));

  openForm({
    title: isEdit ? `编辑 · ${baseName(plant.name)}` : '添加新植物',
    width: 'wide',
    submitText: isEdit ? '保存修改' : '种下它',
    fields: [
      { name: 'name', label: '植物名称', required: true, span: 2, value: plant?.name ?? '', placeholder: '例如：水培观音竹、土培茉莉' },
      { name: 'category', label: '养护方式', type: 'select', required: true, value: plant?.category ?? 'hydro2', options: categoryOptions },
      { name: 'planted_at', label: '种植日期', type: 'date', required: true, value: plant?.planted_at ?? today() },
      { name: 'status', label: '成长状态', type: 'select', required: true, value: plant?.status ?? 'sprout', options: statusOptions },
      { name: 'note', label: '养护备注', type: 'textarea', rows: 3, span: 2, value: plant?.note ?? '', placeholder: '光照、水位、换水小技巧…' },
    ],
    onSubmit: async (v) => {
      const row: Partial<Plant> = {
        name: String(v.name ?? '').trim(),
        category: String(v.category) as PlantCategory,
        planted_at: String(v.planted_at),
        status: String(v.status) as PlantStatus,
        note: String(v.note ?? '').trim(),
      };
      if (plant) row.id = plant.id;
      await savePlantRow('plants', row);
      Toast(isEdit ? '已更新植物资料' : `已种下「${row.name}」，待办会自动同步`, 'success');
      await rerender(el, ctx);
    },
  });
}

/* ------------------------------ 删除植物 ------------------------------ */
async function deletePlant(plant: Plant, el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const logCount = plantLogs(plant.id).length;
  const ok = await confirmDialog(
    `删除「${baseName(plant.name)}」？`,
    `${logCount ? `它的 ${logCount} 条成长日记` : '它'}会一起被永久删除，无法恢复。`,
    { danger: true, okText: '删除' },
  );
  if (!ok) return;
  try {
    await db.removeWhere('plant_logs', (l) => l.plant_id === plant.id);
    await dropPlantRow('plants', plant.id);
    await syncTodos();
    Toast('已删除，愿它在你心里继续生长', 'success');
  } catch (err) {
    console.error('[plants] 删除植物失败', err);
    Toast('删除失败，请重试', 'error');
  }
  await rerender(el, ctx);
}

/* ==========================================================================
   一级页 · 花园总览
   ========================================================================== */
function plantCard(plant: Plant, el: HTMLElement, ctx: ModuleCtx): HTMLElement {
  const info = careInfo(plant);
  const status = currentStatus(plant);
  const photo = latestPhoto(plant);
  const age = plantAge(plant);
  const cared = caredToday(plant);
  const logCount = plantLogs(plant.id).length;

  const dueTag = info.due
    ? Tag(`今天需${info.action}`, cared ? 'green' : 'honey')
    : Tag(info.dueText, 'line');

  const thumb = photo
    ? h('img', { src: photo, alt: `${baseName(plant.name)} 最新照片`, loading: 'lazy' })
    : h('div', { class: 'center', style: 'padding:10px 0' },
      pixelIcon(CATEGORY_META[plant.category].icon, 30),
      h('div', { class: 'tiny muted', style: 'margin-top:4px' }, '还没有照片'),
    );

  const card = Card({
    variant: info.due && !cared ? 'green' : 'default',
    hoverable: true,
    title: h('span', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap' },
      h('span', { style: 'font-weight:700' }, plant.name),
      h('span', { title: `当前状态：${status.label}`, style: 'display:inline-flex' }, pixelIcon(status.icon, 17)),
    ),
    subtitle: `种植于 ${fmtDate(plant.planted_at, 'cn')}`,
    icon: CATEGORY_META[plant.category].icon,
    actions: [
      IconButton('edit', { title: '编辑这株植物', onClick: (e) => { e.stopPropagation(); plantDialog(plant, el, ctx); } }),
      IconButton('trash', { title: '删除这株植物', onClick: (e) => { e.stopPropagation(); void deletePlant(plant, el, ctx); } }),
    ],
    body: h('div', { style: 'display:flex;gap:var(--sp-3);align-items:flex-start' },
      h('div', {
        style: 'flex:0 0 74px;width:74px;height:74px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--paper-3);display:grid;place-items:center',
      }, thumb),
      h('div', { style: 'min-width:0;flex:1' },
        h('div', { class: 'row row-wrap', style: 'gap:6px' }, Tag(`第 ${age} 天`, 'green'), Tag(CATEGORY_META[plant.category].label, 'line')),
        h('div', { class: 'small', style: 'margin-top:6px;font-weight:600' }, info.countdownText),
        h('div', { class: 'row row-wrap', style: 'gap:6px;margin-top:6px' },
          dueTag,
          cared ? Tag('今日已照顾', 'green') : null,
        ),
      ),
    ),
    footer: [h('span', { class: 'tiny muted' }, `${logCount} 条日记 · 点击卡片进入成长日记`)],
    onClick: () => ctx.go(`#/plants/detail/${plant.id}`),
  });
  card.classList.add('plant-card');
  return card;
}

function statCard(): HTMLElement {
  const plants = listPlants();
  const dueCount = plants.filter(isDueToday).length;
  const logTotal = listLogs().length;
  return Card({
    variant: 'green',
    decor: true,
    title: '我的小花园',
    subtitle: '今天也一起慢慢长大',
    icon: 'plant',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '植物总数', value: plants.length, unit: '株', tone: 'green', icon: 'plant' }),
        Stat({
          label: '今日待照顾',
          value: dueCount,
          unit: '株',
          tone: dueCount ? 'honey' : 'green',
          icon: dueCount ? 'drop' : 'check',
        }),
        Stat({ label: '累计记录', value: logTotal, unit: '条', tone: 'oak', icon: 'list' }),
        Stat({ label: '坚持天数', value: gardenDays(), unit: '天', tone: 'honey', icon: 'fire' }),
      ),
      h('div', { class: 'small muted mt-3' },
        dueCount
          ? `有 ${dueCount} 株植物到养护日了，今日中枢已自动生成待办。`
          : '今天没有到期的养护任务，植物们都在安静生长。',
      ),
    ],
    footer: [h('span', { class: 'tiny muted' }, '记录里带上「换水」或「浇水」标签，今日中枢对应待办会自动打勾。')],
  });
}

function addTile(el: HTMLElement, ctx: ModuleCtx): HTMLElement {
  const card = Card({
    variant: 'flat',
    className: 'no-card-click',
    body: h('div', { style: 'display:grid;place-items:center;gap:8px;padding:14px 6px;min-height:120px' },
      Button('+ 添加新植物', { variant: 'primary', icon: 'plus', block: true, onClick: () => plantDialog(null, el, ctx) }),
      h('div', { class: 'tiny muted center' }, '水培勤换水 · 土培每日浇水'),
    ),
  });
  return card;
}

function renderOverview(el: HTMLElement, ctx: ModuleCtx): void {
  const plants = listPlants()
    .slice()
    .sort((a, b) => (a.planted_at < b.planted_at ? -1 : a.planted_at > b.planted_at ? 1 : a.created_at - b.created_at));

  const garden = Card({
    icon: 'leaf',
    title: `花园（${plants.length}）`,
    actions: [
      Button('+ 添加新植物', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => plantDialog(null, el, ctx) }),
    ],
    body: plants.length
      ? h('div', { class: 'grid grid-auto' },
        ...plants.map((p) => plantCard(p, el, ctx)),
        addTile(el, ctx),
      )
      : [
        EmptyState({
          icon: 'sprout',
          title: '花园里还空着',
          text: '种下第一株植物吧：水培蒜苗两天换一次水，土培茉莉每天早晨浇一次。',
          action: Button('+ 添加新植物', { variant: 'primary', icon: 'plus', onClick: () => plantDialog(null, el, ctx) }),
        }),
        h('div', { class: 'row', style: 'justify-content:center;padding-bottom:10px' },
          Button('+ 添加新植物', { variant: 'soft', icon: 'plus', onClick: () => plantDialog(null, el, ctx) }),
        ),
      ],
    footer: [h('span', { class: 'tiny muted' }, '点击任意卡片进入成长日记 · 卡片右上角可编辑或删除')],
  });

  mount(el, statCard(), SectionTitle('我的植物', { icon: 'plant' }), garden);
}

/* ==========================================================================
   二级页 · 单株植物成长日记
   ========================================================================== */

/* ------------------------------ 日记表单 ------------------------------ */
interface LogFormOptions {
  plant: Plant;
  date?: string;
  tags?: string[];
  feedback?: string;
  text?: string;
  photos?: string[];
  title?: string;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
}

function logForm(opts: LogFormOptions): void {
  openForm({
    title: opts.title ?? '写一条成长记录',
    width: 'wide',
    submitText: '保存记录',
    fields: [
      { name: 'date', label: '记录日期', type: 'date', required: true, value: opts.date ?? today() },
      { name: 'feedback', label: '动态反馈', type: 'select', required: true, value: opts.feedback ?? PLANT_STATUS_META[opts.plant.status].feedback, options: [...PLANT_FEEDBACKS] },
      { name: 'tags', label: '操作标签', type: 'chips', span: 2, value: opts.tags ?? [], options: [...PLANT_TAGS], hint: '含「换水」或「浇水」时，今日中枢对应待办会自动完成' },
      { name: 'text', label: '记录内容', type: 'textarea', rows: 4, span: 2, value: opts.text ?? '', placeholder: '今天它怎么样了？闻到了什么、看到了哪片新叶…' },
      { name: 'photos', label: '照片', type: 'photos', span: 2, value: opts.photos ?? [], hint: '自动压缩为 WebP ≤200KB，可多选' },
    ],
    onSubmit: opts.onSubmit,
  });
}

/* ------------------------------ 时间轴 ------------------------------ */
function logItem(log: PlantLog, isLatest: boolean, plant: Plant, el: HTMLElement, ctx: ModuleCtx): HTMLElement {
  const feedback = String(log.feedback ?? '');
  const tags = (log.tags ?? []) as string[];
  const photos = log.photos ?? [];

  const chips = h('span', { class: 'row row-wrap', style: 'gap:4px' },
    ...tags.map((t) => Tag(t, t === '换水' || t === '浇水' ? 'green' : 'line')),
  );

  const actions = h('span', { class: 'row no-card-click', style: 'margin-left:auto;gap:2px' },
    IconButton('edit', { title: '编辑这条记录', onClick: (e) => { e.stopPropagation(); editLog(log, plant, el, ctx); } }),
    IconButton('trash', { title: '删除这条记录', onClick: (e) => { e.stopPropagation(); void deleteLog(log, el, ctx); } }),
  );

  return h('div', { class: `tl-item ${isLatest ? 'is-latest' : ''}`.trim() },
    h('div', { class: 'tl-date' },
      h('span', null, `${fmtDate(log.date)} · 距今 ${Math.max(0, diffDays(today(), log.date))} 天`),
      isLatest ? Tag('最新', 'green') : null,
      actions,
    ),
    Card({
      variant: 'flat',
      body: [
        h('div', { class: 'row row-wrap', style: 'gap:6px;margin-bottom:6px' },
          h('span', { class: 'row', style: 'gap:6px' },
            pixelIcon(iconOfFeedback(feedback), 18),
            h('span', { style: 'font-weight:700' }, feedback || '观察'),
          ),
          chips.childNodes.length ? chips : null,
        ),
        log.text
          ? h('div', { class: 'small', style: 'line-height:1.9;white-space:pre-wrap;word-break:break-word' }, log.text)
          : h('div', { class: 'tiny muted' }, '（这条记录没有写文字）'),
        photos.length
          ? h('div', { class: 'mt-2' },
            Gallery(photos, { cols: 3 }),
            h('div', { class: 'tiny muted mt-2' }, `${photos.length} 张照片 · 点击可全屏左右滑动`),
          )
          : null,
      ],
    }),
  );
}

function editLog(log: PlantLog, plant: Plant, el: HTMLElement, ctx: ModuleCtx): void {
  logForm({
    plant,
    title: '编辑成长记录',
    date: log.date,
    tags: (log.tags ?? []) as string[],
    feedback: String(log.feedback ?? ''),
    text: log.text ?? '',
    photos: log.photos ?? [],
    onSubmit: async (v) => {
      const tags = Array.isArray(v.tags) ? (v.tags as string[]) : [];
      const photos = Array.isArray(v.photos) ? (v.photos as string[]) : [];
      try {
        await store.patch('plant_logs', log.id, {
          date: String(v.date),
          text: String(v.text ?? '').trim(),
          tags: tags as never,
          feedback: String(v.feedback) as never,
          photos,
        });
        await syncTodos();
        Toast('记录已更新', 'success');
      } catch (err) {
        console.error('[plants] 更新记录失败', err);
        Toast('更新失败，请重试', 'error');
      }
      await rerender(el, ctx);
    },
  });
}

async function deleteLog(log: PlantLog, el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const ok = await confirmDialog('删除这条记录？', `${fmtDate(log.date)} 的成长记录会被永久删除。`, { danger: true, okText: '删除' });
  if (!ok) return;
  try {
    await db.remove('plant_logs', log.id);
    await reload();
    await syncTodos();
    Toast('已删除这条记录', 'success');
  } catch (err) {
    console.error('[plants] 删除记录失败', err);
    Toast('删除失败，请重试', 'error');
  }
  await rerender(el, ctx);
}

/* ------------------------------ 成长分析 ------------------------------ */
function analysisCard(plant: Plant): HTMLElement {
  const logs = plantLogs(plant.id);
  const age = plantAge(plant);
  const last = logs[0];
  const gap = last ? Math.max(0, diffDays(today(), last.date)) : age;
  const freq = recordFrequency(plant);
  const [body] = emotionalFeedback(plant).split('\n');

  const cells: Array<{ date: string; value: number }> = [];
  const from = addDays(today(), -29);
  for (let i = 0; i < 30; i++) {
    const d = addDays(from, i);
    cells.push({ date: d, value: logs.filter((l) => l.date === d).length });
  }
  const monthCount = cells.reduce((s, c) => s + c.value, 0);

  return Card({
    icon: 'chart',
    title: '成长分析',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '种植天数', value: age, unit: '天', tone: 'green', icon: 'calendar' }),
        Stat({ label: '最近记录距今', value: gap, unit: '天', tone: gap > 3 ? 'honey' : 'green', icon: 'clock' }),
        Stat({ label: '记录频率', value: `平均 ${freq.toFixed(2)} 条/天`, tone: 'oak', icon: 'list' }),
        Stat({ label: '累计记录', value: logs.length, unit: '条', tone: 'oak', icon: 'check' }),
      ),
      h('div', { class: 'quote-block mt-3' }, body),
      SectionTitle('近 30 天记录热度', { icon: 'chart' }),
      h('div', { class: 'mt-2', style: 'overflow-x:auto;-webkit-overflow-scrolling:touch' }, heatmap(cells)),
      h('div', { class: 'tiny muted mt-2' },
        `近 30 天共 ${monthCount} 条记录 · 每格代表一天，颜色越深记录越多`,
      ),
    ],
    footer: [h('span', { class: 'tiny muted' }, '照顾好它，也照顾好自己。')],
  });
}

/* ------------------------------ 相册区 ------------------------------ */
function albumCard(plant: Plant, el: HTMLElement, ctx: ModuleCtx): HTMLElement {
  const album = new Set<string>();
  for (const l of plantLogs(plant.id)) {
    for (const p of l.photos ?? []) album.add(p);
  }
  const albumPhotos = Array.from(album);

  const uploader = Uploader({
    multiple: true,
    max: 60,
    value: albumPhotos,
    label: '点击选择照片 · 自动压缩为 WebP ≤200KB · 可多选',
    onChange: (photos) => {
      const chosen = photos[photos.length - 1];
      if (!chosen) return;
      logForm({
        plant,
        photos: [chosen],
        title: '把照片挂到成长日记',
        onSubmit: async (v) => {
          const tags = Array.isArray(v.tags) ? (v.tags as string[]) : [];
          const picked = Array.isArray(v.photos) ? (v.photos as string[]) : [chosen];
          try {
            await addPlantLog({
              plant_id: plant.id,
              date: String(v.date || today()),
              text: String(v.text ?? '').trim(),
              tags,
              feedback: String(v.feedback),
              photos: picked,
            });
            Toast('照片已经挂到日记上啦', 'success');
          } catch (err) {
            console.error('[plants] 保存照片记录失败', err);
            Toast('照片保存失败，请重试', 'error');
          }
          await rerender(el, ctx);
        },
      });
    },
  });

  return Card({
    icon: 'camera',
    title: `照片相册（${albumPhotos.length}）`,
    subtitle: '照片先进相册，保存时同时挂到一条新的成长日记上',
    body: uploader,
    footer: [h('span', { class: 'tiny muted' }, '相册会汇总所有日记里的照片 · 点击缩略图可全屏查看，左右滑动切换')],
  });
}

/* ------------------------------ 二级页渲染 ------------------------------ */
function renderDetail(id: string, el: HTMLElement, ctx: ModuleCtx): void {
  const plant = store.byId('plants', id);
  if (!plant) {
    mount(el, EmptyState({
      icon: 'leaf',
      title: '找不到这株植物',
      text: '它可能已经被删除了。',
      action: Button('← 返回花园', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go('#/plants') }),
    }));
    return;
  }

  const info = careInfo(plant);
  const status = currentStatus(plant);
  const age = plantAge(plant);
  const logs = plantLogs(plant.id);
  const recent = logs.filter((l) => diffDays(today(), l.date) <= 6);

  ctx.setTitle(plant.name, `第 ${age} 天 · ${status.label}`);
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '植物养护', hash: '#/plants' },
    { label: plant.name },
  ]);

  /* 顶部：名称 / 种植日期 / 状态 / 编辑 / 倒计时 / 返回 */
  const overview = Card({
    variant: info.due ? 'green' : 'default',
    decor: true,
    icon: status.icon,
    title: h('span', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' },
      h('span', { style: 'font-weight:700' }, plant.name),
      Tag(status.label, info.due ? 'honey' : 'green'),
    ),
    subtitle: `种植于 ${fmtDate(plant.planted_at, 'full')}`,
    actions: [
      Button('← 返回', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go('#/plants') }),
      Button('编辑', { variant: 'soft', icon: 'edit', size: 'sm', onClick: () => plantDialog(plant, el, ctx) }),
    ],
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '养护倒计时', value: info.countdownText, tone: info.due ? 'honey' : 'green', icon: CATEGORY_META[plant.category].icon }),
        Stat({ label: '养护节律', value: `${info.action} · ${info.cycle} 天/次`, tone: 'oak', icon: 'clock' }),
        Stat({ label: '距今天数', value: age, unit: '天', tone: 'green', icon: 'calendar' }),
        Stat({ label: '成长日记', value: logs.length, unit: '条', tone: 'oak', icon: 'list' }),
      ),
      h('div', { class: 'row row-wrap mt-3', style: 'gap:8px' },
        info.due ? Tag(`今天需${info.action}`, caredToday(plant) ? 'green' : 'honey') : Tag(info.dueText, 'line'),
        Tag(CATEGORY_META[plant.category].label, 'line'),
        caredToday(plant) ? Tag('今日已照顾', 'green') : null,
      ),
      plant.note ? h('div', { class: 'small muted mt-3' }, `备注：${plant.note}`) : null,
    ],
    footer: [h('span', { class: 'tiny muted' }, `上次${info.action}：${info.lastDate} · 下次${info.action}：${info.nextDate}`)],
  });

  /* 今天记录了吗（可爱的小提醒） */
  const todayLogs = logsOfDate(plant.id, today());
  const todayCard = Card({
    variant: 'flat',
    icon: 'sun',
    title: `今天（${fmtDate(today(), 'cn')}）`,
    body: todayLogs.length
      ? h('div', { class: 'list' }, ...todayLogs.map((l) => h('div', { class: 'row row-wrap', style: 'gap:6px' },
        h('span', null, pixelIcon(iconOfFeedback(String(l.feedback)), 16)),
        h('span', { class: 'small' }, l.text || '（未填写内容）'),
        ...(l.tags ?? []).map((t) => Tag(t, 'line')),
      )))
      : h('div', { class: 'small muted' },
        caredToday(plant)
          ? `今天已经${info.action}过了，真棒～`
          : `今天还没有记录，记得${info.action}后写一条成长日记。`,
      ),
    footer: [h('span', { class: 'tiny muted' }, '记录带「换水」或「浇水」标签会同步完成今日中枢的植物待办')],
  });

  /* 时间轴 */
  const timeline = h('div', { class: 'timeline' },
    ...logs.map((l, i) => logItem(l, i === 0, plant, el, ctx)),
  );

  const timelineCard = Card({
    icon: 'clock',
    title: `成长日记（${logs.length}）`,
    actions: [
      Button('+ 写一条记录', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => addLogDialog(plant, el, ctx) }),
    ],
    body: logs.length
      ? timeline
      : EmptyState({
        icon: 'diary',
        title: '还没有成长记录',
        text: '第一次换水、第一片新叶，都值得记下来。',
        action: Button('+ 写一条记录', { variant: 'primary', icon: 'plus', onClick: () => addLogDialog(plant, el, ctx) }),
      }),
    footer: [h('span', { class: 'tiny muted' }, '按日期倒序排列 · 最新一条带脉冲圆点 · 每条右侧可编辑 / 删除')],
  });

  mount(el,
    overview,
    SectionTitle('本周节奏', { icon: 'leaf' }),
    Card({
      variant: 'flat',
      className: 'no-card-click',
      body: [
        Stat({ label: '最近 7 天记录', value: recent.length, unit: '条', tone: recent.length ? 'green' : 'honey', icon: 'check' }),
        h('div', { class: 'mt-2' }, ProgressBar(Math.min(100, (recent.length / 7) * 100))),
        h('div', { class: 'tiny muted mt-2' }, recent.length ? `最近一次记录：${fmtDate(recent[0].date)}` : '最近 7 天还没有记录，今天补一条吧～'),
      ],
    }),
    todayCard,
    SectionTitle('照片相册', { icon: 'camera' }),
    albumCard(plant, el, ctx),
    SectionTitle('成长日记', { icon: 'diary' }),
    timelineCard,
    SectionTitle('成长分析', { icon: 'chart' }),
    analysisCard(plant),
    h('div', { class: 'row row-wrap', style: 'justify-content:center;padding:var(--sp-3) 0 var(--sp-5)' },
      Button('← 返回花园', { variant: 'soft', icon: 'arrowLeft', onClick: () => ctx.go('#/plants') }),
      Button('+ 添加新植物', { variant: 'ghost', icon: 'plus', onClick: () => plantDialog(null, el, ctx) }),
    ),
  );
}

function addLogDialog(plant: Plant, el: HTMLElement, ctx: ModuleCtx): void {
  logForm({
    plant,
    title: `记录 · ${baseName(plant.name)}`,
    onSubmit: async (v) => {
      const tags = Array.isArray(v.tags) ? (v.tags as string[]) : [];
      const photos = Array.isArray(v.photos) ? (v.photos as string[]) : [];
      try {
        await addPlantLog({
          plant_id: plant.id,
          date: String(v.date || today()),
          text: String(v.text ?? '').trim(),
          tags,
          feedback: String(v.feedback),
          photos,
        });
        const careHit = tags.includes('换水') || tags.includes('浇水');
        Toast(careHit ? '记录已保存，今日中枢的养护待办已自动完成' : '记录已保存，它又多了一天故事', 'success');
      } catch (err) {
        console.error('[plants] 保存记录失败', err);
        Toast('保存失败，请重试', 'error');
      }
      await rerender(el, ctx);
    },
  });
}

/* ==========================================================================
   模块定义
   ========================================================================== */
export const plantsModule: ModuleDef = {
  id: 'plants',
  title: '植物养护',
  icon: 'plant',
  order: 2,
  desc: '花园总览 · 成长日记 · 养护提醒',
  badge(): number {
    try {
      return store.list('plants').filter(isDueToday).length;
    } catch {
      return 0;
    }
  },

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    await syncTodos();
    try {
      if (ctx.sub === 'detail' && ctx.param) renderDetail(ctx.param, el, ctx);
      else renderOverview(el, ctx);
    } catch (err) {
      console.error('[plants] 渲染失败', err);
      mount(el, Card({
        icon: 'notice',
        title: '花园里起了点小雾气',
        body: [
          h('div', { class: 'small muted' }, err instanceof Error ? err.message : '渲染出错，请重试'),
          h('div', { class: 'row mt-3' },
            Button('重新加载', { variant: 'primary', icon: 'refresh', onClick: () => void rerender(el, ctx) }),
            Button('返回花园', { variant: 'ghost', icon: 'arrowLeft', onClick: () => ctx.go('#/plants') }),
          ),
        ],
      }));
    }
  },
} satisfies ModuleDef;
