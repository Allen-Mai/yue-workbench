/* ==========================================================================
   modules/inspire.ts · 灵感补给站（order 3）
   子分类：好书推荐 / 经典名句 / 电影推荐 / 知识解读 / 理财串珠 / 好词好句摘抄
   路由：#/inspire/<kind>            —— 列表
         #/inspire/<kind>/<id>       —— 详情（完整文章）
         #/inspire/quote             —— 好词好句摘抄（手动添加 / 筛选 / 搜索 / 导出 TXT）
         #/inspire/words             —— 单词学习（复用 modules/words.ts）
   已读记录写入 reads 表 —— 这是金币「已读满 4 篇」组合技的统计来源
   ========================================================================== */

import { h, mount, debounce } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, Chips, EmptyState, IconButton, Input, ListRow, SectionTitle, Segmented, Stat, Tag,
  Toast, confirmDialog, openForm, StatGrid,
} from '../ui/components';
import { store } from '../core/store';
import { fetchCover, localCover } from '../core/cover';
import { exporter } from '../core/exporter';
import { addDays, today, weekStart } from '../core/date';
import { settleDay, coinsOn } from '../core/coins';
import { checkAchievements } from '../core/stats';
import { QUOTE_TAGS } from '../data/presets';
import { renderWordStudy } from './words';
import type { Inspiration, ModuleCtx, Quote } from '../types';

/* ------------------------------ 分类定义 ------------------------------ */
type ContentKind = 'book' | 'quote' | 'movie' | 'knowledge' | 'beads';

interface KindMeta {
  value: ContentKind;
  label: string;
  icon: string;
  desc: string;
  /** 详情页 / 空状态的引导文案 */
  tip: string;
  /** 新增表单的标题占位 */
  titleHint: string;
  /** 新增表单的正文占位 */
  bodyHint: string;
  /** 新增表单的标签占位 */
  tagHint: string;
}

const KINDS: KindMeta[] = [
  {
    value: 'book', label: '好书推荐', icon: 'leaf', desc: '读过的书与它的余味',
    tip: '把一本好书留在这里：它讲了什么、哪一句打动你、适合什么时候读。',
    titleHint: '例如《小森林》', bodyHint: '这本书讲了什么？哪一句让你停下来？', tagHint: '森系,生活',
  },
  {
    value: 'quote', label: '经典名句', icon: 'diary', desc: '一句话的重量',
    tip: '名言警句、书摘、歌词都可以，用一句话点亮今天。',
    titleHint: '例如 不积跬步，无以至千里', bodyHint: '写下这句名句，以及它出现的语境。', tagHint: '励志,哲思',
  },
  {
    value: 'movie', label: '电影推荐', icon: 'image', desc: '值得重看的画面',
    tip: '记录一部看完心里还留着画面的电影。',
    titleHint: '例如《海蒂和爷爷》', bodyHint: '剧情、名场面、看完的感受。', tagHint: '治愈,自然',
  },
  {
    value: 'knowledge', label: '知识解读', icon: 'news', desc: '搞懂一件事',
    tip: '用自己的话讲清楚一个知识点，讲得出来才算学会。',
    titleHint: '例如 为什么水培植物要定期换水？', bodyHint: '用「因为…所以…」把这件事讲清楚。', tagHint: '植物,科普',
  },
  {
    value: 'beads', label: '理财串珠', icon: 'beads', desc: '一颗一颗串起来的理财心得',
    tip: '把攒下来的理财经验串成珠子，一颗一颗来。',
    titleHint: '例如 理财串珠 ⑦：先记三天再谈省钱', bodyHint: '这一颗珠子是什么？怎么用在自己身上？', tagHint: '理财,方法',
  },
];

const KIND_MAP: Record<string, KindMeta> = Object.fromEntries(KINDS.map((k) => [k.value, k]));

/** 顶部 Segmented：5 个 inspirations 分类（kind 值唯一） */
const SEGMENTS = KINDS.map((k) => ({ value: k.value as string, label: k.label }));

const DEFAULT_KIND: ContentKind = 'book';

function metaOf(kind: string): KindMeta {
  return KIND_MAP[kind] ?? KIND_MAP[DEFAULT_KIND];
}

function isContentKind(kind: string): kind is ContentKind {
  return kind !== 'quote' && !!KIND_MAP[kind];
}

/* ------------------------------ 小工具 ------------------------------ */
function seedOf(text: string): number {
  let hash = 7;
  for (let i = 0; i < String(text).length; i++) hash = (hash * 31 + String(text).charCodeAt(i)) % 100000;
  return hash;
}

function firstLine(text: string, len = 58): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

/** 摘抄展示用的一句话文本 */
function quoteLine(q: Quote): string {
  const author = String(q.author ?? '').trim();
  const source = String(q.source ?? '').trim();
  const tail = author && source && !source.includes(author) ? `${author}《${source}》` : author || source;
  const tags = (q.tags ?? []).length ? ` [${(q.tags ?? []).join('、')}]` : '';
  return `${String(q.text ?? '').trim()} —— ${tail}${tags}`;
}

/* ------------------------------ 已读 / 收藏 ------------------------------ */
function isRead(id: string, date = today()): boolean {
  return store.list('reads').some((r) => r.date === date && r.inspire_id === id);
}

async function toggleFavorite(item: Inspiration, ctx: ModuleCtx): Promise<void> {
  try {
    await store.patch('inspirations', item.id, { favorite: !item.favorite });
    Toast(item.favorite ? '已取消收藏' : '已收藏，金币「阅读套餐」会用到它', 'success');
    await rerender(ctx);
  } catch (err) {
    Toast(`收藏失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

async function toggleRead(item: Inspiration, kind: string, ctx: ModuleCtx): Promise<void> {
  try {
    const date = today();
    const rows = store.list('reads').filter((r) => r.date === date && r.inspire_id === item.id);
    if (rows.length) {
      if (!(await confirmDialog('取消这篇的「已读」记录？', '同一天同一篇只记录一次已读，取消后可以重新打卡。'))) return;
      for (const r of rows) await store.drop('reads', r.id);
      Toast('已取消已读记录', 'default');
    } else {
      await store.save('reads', { date, inspire_id: item.id, kind });
      Toast('已记录已读 · 今天读满 4 篇有金币组合技', 'success');
      // 组合技「晨间 / 阅读」在满 4 篇时立即结算
      await settleDay(date, false);
      await checkAchievements(true);
    }
    store.emit('change', 'reads');
    await rerender(ctx);
  } catch (err) {
    Toast(`记录失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

async function rerender(ctx: ModuleCtx): Promise<void> {
  try {
    await ctx.refresh('inspirations');
  } catch (err) {
    console.warn('[inspire] 刷新缓存失败', err);
  }
  store.emit('change', 'inspire');
  ctx.go(`#/inspire${ctx.sub ? `/${ctx.sub}${ctx.param ? `/${ctx.param}` : ''}` : ''}`);
}

/* ------------------------------ 新增内容 ------------------------------ */
function addContentDialog(kind: ContentKind, ctx: ModuleCtx): void {
  const meta = metaOf(kind);
  openForm({
    title: `新增 · ${meta.label}`,
    width: 'wide',
    fields: [
      { name: 'title', label: '标题', required: true, span: 2, placeholder: meta.titleHint },
      { name: 'body', label: '正文', type: 'textarea', rows: 8, span: 2, placeholder: meta.bodyHint, hint: '空行分段，详情页会按段落排版' },
      { name: 'cover', label: '配图地址', span: 2, placeholder: 'https://… 留空则自动生成森系像素封面' },
      { name: 'source', label: '来源 / 作者', placeholder: '例如 五十岚大介' },
      { name: 'tags', label: '标签', placeholder: meta.tagHint, hint: '英文逗号或中文顿号分隔' },
      { name: 'url', label: '原文链接', span: 2, placeholder: 'https://… 详情页会显示「阅读原文」' },
      { name: 'favorite', label: '立即收藏', type: 'switch', value: false },
    ],
    onSubmit: async (v) => {
      await store.save('inspirations', {
        kind,
        title: String(v.title ?? '').trim(),
        body: String(v.body ?? ''),
        cover: String(v.cover ?? '').trim(),
        source: String(v.source ?? '').trim(),
        tags: String(v.tags ?? '').split(/[,，、;；]/).map((t) => t.trim()).filter(Boolean),
        url: String(v.url ?? '').trim(),
        favorite: !!v.favorite,
      });
      Toast('已收藏进灵感补给站', 'success');
      await rerender(ctx);
    },
  });
}

/* ------------------------------ 配图 ------------------------------ */
/** 优先用存库 cover，没有就抓网络图；图片加载失败时替换为本地封面 */
function coverNode(item: Inspiration, cls: string, alt = ''): HTMLImageElement {
  const img = h('img', {
    class: cls,
    src: item.cover || localCover(item.title, seedOf(item.title)),
    alt,
    loading: 'lazy',
    referrerPolicy: 'no-referrer',
  });
  if (!item.cover) {
    void fetchCover(item.title, item.kind).then((src) => {
      if (img.isConnected && src) img.src = src;
    }).catch(() => undefined);
  }
  img.addEventListener('error', () => {
    const fallback = localCover(item.title, seedOf(item.title));
    img.classList.add('is-local');
    if (img.getAttribute('src') !== fallback) img.setAttribute('src', fallback);
  });
  return img;
}

/* ------------------------------ 顶部操作区 + 统计 ------------------------------ */
function actionBar(kind: ContentKind, ctx: ModuleCtx): HTMLElement {
  return Card({
    variant: 'green',
    decor: true,
    title: '灵感补给站',
    subtitle: '好书 · 名句 · 电影 · 知识 · 理财串珠 · 摘抄',
    icon: 'inspire',
    actions: [
      Button('单词学习', { variant: 'soft', icon: 'book', size: 'sm', onClick: () => ctx.go('#/inspire/words') }),
      Button('新增内容', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => addContentDialog(kind, ctx) }),
    ],
    body: [
      h('div', { class: 'scroll-x' },
        Segmented(SEGMENTS, {
          value: kind,
          onChange: (v) => ctx.go(`#/inspire/${v}`),
        }),
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('好词好句摘抄', { variant: 'soft', size: 'sm', icon: 'diary', onClick: () => ctx.go('#/inspire/quote') }),
        h('span', { class: 'spacer' }),
        h('span', { class: 'tiny muted' }, '切换分类会写入地址栏：#/inspire/<分类>'),
      ),
    ],
  });
}

/** 本周阅读 / 收藏统计（所有子页面共用） */
function readStatsCard(ctx: ModuleCtx): HTMLElement {
  const start = weekStart(today());
  const end = addDays(start, 6);
  const readIds = new Set(store.list('reads').filter((r) => r.date >= start && r.date <= end).map((r) => r.inspire_id));
  const favorites = store.list('inspirations').filter((i) => i.favorite);

  return Card({
    icon: 'chart',
    title: `本周阅读（${start.slice(5)} ~ ${end.slice(5)}）`,
    actions: [
      Button('去读一篇', { variant: 'ghost', size: 'sm', icon: 'leaf', onClick: () => ctx.go('#/inspire/book') }),
    ],
    body: [
      StatGrid(
        Stat({ label: '本周已读', value: readIds.size, unit: '篇', tone: 'green', icon: 'check' }),
        Stat({ label: '已收藏', value: favorites.length, unit: '条', tone: 'honey', icon: 'star' }),
      ),
      h('div', { class: 'tiny muted mt-2' }, '金币组合技「晨间」= 待办全部完成 + 已读满 4 篇；「阅读」= 已读满 4 篇 + 收藏 ≥ 1 条。'),
    ],
  });
}

/** 各分类内容条数 */
function kindStatsCard(current: ContentKind | 'quote', ctx: ModuleCtx): HTMLElement {
  const counts = KINDS.map((k) => ({
    meta: k,
    n: store.list('inspirations').filter((i) => i.kind === k.value).length,
  }));

  return Card({
    icon: 'list',
    title: '各分类内容条数',
    body: h('div', { class: 'list' },
      ...counts.map((c) => ListRow({
        icon: c.meta.icon,
        title: c.meta.label,
        meta: c.meta.desc,
        onClick: () => ctx.go(`#/inspire/${c.meta.value}`),
        right: Tag(`${c.n} 条`, c.meta.value === current ? 'green' : 'line'),
      })),
      ListRow({
        icon: 'diary',
        title: '好词好句摘抄',
        meta: '收集喜欢的句子',
        onClick: () => ctx.go('#/inspire/quote'),
        right: Tag(`${store.list('quotes').length} 条`, current === 'quote' ? 'green' : 'line'),
      }),
    ),
  });
}

/* ------------------------------ 列表视图 ------------------------------ */
function itemCard(item: Inspiration, ctx: ModuleCtx): HTMLElement {
  const read = isRead(item.id);
  return Card({
    variant: 'flat',
    hoverable: true,
    className: 'no-card-click',
    body: [
      coverNode(item, 'article-cover'),
      h('div', { class: 'row mt-2', style: 'gap:6px;flex-wrap:wrap' },
        pixelIcon(metaOf(item.kind).icon, 15),
        h('span', { style: 'font-weight:700;flex:1;min-width:0' }, item.title),
        item.favorite ? Tag('已收藏', 'honey') : null,
        read ? Tag('已读', 'green') : null,
      ),
      h('div', { class: 'tiny muted mt-2' },
        [item.source, (item.tags ?? []).map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · ')),
      h('div', { class: 'small muted mt-2' }, firstLine(item.body)),
      h('div', { class: 'row mt-3' },
        Button('阅读全文', {
          variant: 'soft', size: 'sm', icon: 'arrowRight',
          onClick: () => ctx.go(`#/inspire/${item.kind}/${item.id}`),
        }),
      ),
    ],
  });
}

async function renderList(el: HTMLElement, ctx: ModuleCtx, kind: ContentKind): Promise<void> {
  const meta = metaOf(kind);
  ctx.setTitle('灵感补给站', `${meta.label} · ${meta.desc}`);

  const items = store.list('inspirations')
    .filter((i) => i.kind === kind)
    .slice()
    .sort((a, b) => b.created_at - a.created_at);

  mount(el,
    actionBar(kind, ctx),
    h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:var(--sp-4)' },
      readStatsCard(ctx),
      kindStatsCard(kind, ctx),
    ),
    SectionTitle(`${meta.label}（${items.length}）`, { icon: meta.icon }),
    items.length
      ? h('div', { class: 'grid grid-auto' }, ...items.map((i) => itemCard(i, ctx)))
      : EmptyState({
        icon: meta.icon,
        title: `还没有${meta.label}`,
        text: meta.tip,
        action: Button('新增内容', { variant: 'primary', icon: 'plus', onClick: () => addContentDialog(kind, ctx) }),
      }),
    h('div', { class: 'tiny muted mt-3' }, '点卡片上的「阅读全文」看完整文章；详情页可以收藏、标记已读、打开原文。'),
  );
}

/* ------------------------------ 详情视图 ------------------------------ */
function detailActions(item: Inspiration, kind: string, ctx: ModuleCtx): HTMLElement[] {
  const read = isRead(item.id);
  return [
    isContentKind(kind)
      ? Button('修改', {
        variant: 'ghost', size: 'sm', icon: 'edit',
        onClick: () => editContentDialog(item, ctx),
      })
      : null,
    Button('收藏', {
      variant: item.favorite ? 'soft' : 'ghost',
      size: 'sm',
      icon: item.favorite ? 'heart' : 'star',
      onClick: () => void toggleFavorite(item, ctx),
    }),
    Button(read ? '取消已读' : '已读', {
      variant: read ? 'soft' : 'primary',
      size: 'sm',
      icon: 'check',
      onClick: () => void toggleRead(item, kind, ctx),
    }),
  ].filter(Boolean) as HTMLElement[];
}

function editContentDialog(item: Inspiration, ctx: ModuleCtx): void {
  openForm({
    title: '编辑内容',
    width: 'wide',
    fields: [
      { name: 'title', label: '标题', required: true, span: 2, value: item.title },
      { name: 'body', label: '正文', type: 'textarea', rows: 8, span: 2, value: item.body, hint: '空行分段' },
      { name: 'cover', label: '配图地址', span: 2, value: item.cover, placeholder: '留空则自动生成森系像素封面' },
      { name: 'source', label: '来源 / 作者', value: item.source },
      { name: 'tags', label: '标签', value: (item.tags ?? []).join(','), hint: '逗号分隔' },
      { name: 'url', label: '原文链接', span: 2, value: item.url },
      { name: 'favorite', label: '收藏', type: 'switch', value: item.favorite },
    ],
    onSubmit: async (v) => {
      await store.patch('inspirations', item.id, {
        title: String(v.title ?? '').trim(),
        body: String(v.body ?? ''),
        cover: String(v.cover ?? '').trim(),
        source: String(v.source ?? '').trim(),
        tags: String(v.tags ?? '').split(/[,，、;；]/).map((t) => t.trim()).filter(Boolean),
        url: String(v.url ?? '').trim(),
        favorite: !!v.favorite,
      });
      Toast('已更新', 'success');
      await rerender(ctx);
    },
  });
}

async function renderDetail(el: HTMLElement, ctx: ModuleCtx, kind: string, id: string): Promise<void> {
  const item = store.byId('inspirations', id);
  if (!item) {
    ctx.setTitle('灵感补给站', '内容不存在或已删除');
    mount(el,
      EmptyState({
        icon: 'search',
        title: '没有找到这篇内容',
        text: '它可能已经被删除，回到列表看看别的吧。',
        action: Button('← 返回列表', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go(`#/inspire/${kind}`) }),
      }),
    );
    return;
  }

  const meta = metaOf(item.kind);
  const read = isRead(item.id);
  ctx.setTitle(item.title, `${meta.label}${item.source ? ` · ${item.source}` : ''}`);
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: meta.label, hash: `#/inspire/${item.kind}` },
    { label: item.title },
  ]);

  const paragraphs = String(item.body ?? '').split('\n').map((p) => p.trim()).filter(Boolean);

  const bodyCard = Card({
    variant: 'default',
    decor: true,
    icon: meta.icon,
    title: item.title,
    subtitle: [item.source, (item.tags ?? []).map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · '),
    actions: detailActions(item, kind, ctx),
    body: [
      coverNode(item, 'article-cover', item.title),
      h('div', { class: 'article-body mt-3' },
        ...(paragraphs.length
          ? paragraphs.map((p) => h('p', null, p))
          : [h('p', { class: 'muted' }, '（这篇还没有正文）')]),
      ),
    ],
    footer: [
      h('span', { class: 'row row-wrap', style: 'gap:8px;align-items:center' },
        Tag(meta.label, 'green'),
        item.favorite ? Tag('已收藏', 'honey') : null,
        read ? Tag(`今天已读`, 'green') : Tag('今天还没读', 'line'),
        h('span', { class: 'spacer' }),
        item.url
          ? Button('阅读原文', {
            variant: 'primary', size: 'sm', icon: 'link',
            onClick: () => window.open(item.url, '_blank', 'noopener'),
          })
          : h('span', { class: 'tiny muted' }, '这条内容没有原文链接'),
      ),
    ],
  });

  const others = store.list('inspirations')
    .filter((i) => i.id !== item.id && i.kind === item.kind)
    .slice(0, 6);

  const infoCard = Card({
    icon: 'notice',
    title: '关于这篇',
    body: [
      StatGrid(
        Stat({ label: '正文字数', value: String(item.body ?? '').replace(/\s+/g, '').length, unit: '字', icon: 'diary' }),
        Stat({ label: '收藏数（全部）', value: store.list('inspirations').filter((i) => i.favorite).length, unit: '条', tone: 'honey', icon: 'star' }),
        Stat({ label: '今日已读', value: store.list('reads').filter((r) => r.date === today()).length, unit: '篇', tone: 'green', icon: 'check' }),
        Stat({ label: '今日金币', value: coinsOn(today()).toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
      ),
      h('div', { class: 'row mt-3 row-wrap' },
        Button('← 返回列表', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go(`#/inspire/${item.kind}`) }),
        Button('回到灵感首页', { variant: 'ghost', icon: 'inspire', size: 'sm', onClick: () => ctx.go('#/inspire') }),
      ),
      others.length
        ? h('div', { class: 'list mt-3' },
          ...others.map((o) => ListRow({
            icon: meta.icon,
            title: o.title,
            meta: firstLine(o.body, 34),
            onClick: () => ctx.go(`#/inspire/${o.kind}/${o.id}`),
            right: Tag(o.favorite ? '已收藏' : '未收藏', o.favorite ? 'honey' : 'line'),
          })),
        )
        : null,
    ],
  });

  mount(el, bodyCard, infoCard);
}

/* ------------------------------ 好词好句摘抄 ------------------------------ */
function applyQuoteFilters(q: Quote, tag: string, keyword: string): boolean {
  if (tag && tag !== 'all' && !(q.tags ?? []).includes(tag)) return false;
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const haystack = [q.text, q.author, q.source, ...(q.tags ?? [])].join(' ').toLowerCase();
  return haystack.includes(kw);
}

function addQuoteDialog(ctx: ModuleCtx): void {
  openForm({
    title: '添加摘抄',
    fields: [
      { name: 'text', label: '内容', type: 'textarea', rows: 3, span: 2, required: true, placeholder: '摘抄的文字，可以是一句话或一小段' },
      { name: 'author', label: '作者', placeholder: '例如 苏轼 / 佚名' },
      { name: 'source', label: '出处', placeholder: '例如《浣溪沙》' },
      { name: 'tags', label: '分类标签', type: 'chips', options: [...QUOTE_TAGS], span: 2, hint: '可多选' },
    ],
    onSubmit: async (v) => {
      await store.save('quotes', {
        text: String(v.text ?? '').trim(),
        author: String(v.author ?? '').trim(),
        source: String(v.source ?? '').trim(),
        tags: Array.isArray(v.tags) ? (v.tags as string[]) : [],
      });
      Toast('摘抄已收进小本子', 'success');
      await rerender(ctx);
    },
  });
}

function exportQuotes(rows: Quote[]): void {
  if (!rows.length) {
    Toast('当前筛选下没有可导出的摘抄', 'error');
    return;
  }
  const text = [
    `好词好句摘抄 · 导出 ${today()} · 共 ${rows.length} 条`,
    '',
    ...rows.map((q) => quoteLine(q)),
  ].join('\n');
  try {
    exporter.exportTXT(`好词好句-${today()}.txt`, text);
    Toast(`已导出 ${rows.length} 条摘抄`, 'success');
  } catch (err) {
    Toast(`导出失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

/** 摘抄小卡片（一条一句 + 操作） */
function quoteCard(q: Quote, ctx: ModuleCtx): HTMLElement {
  return Card({
    variant: 'flat',
    className: 'no-card-click',
    decor: true,
    body: [
      h('div', { class: 'quote-block' },
        h('div', { style: 'font-size:var(--fs-lg);line-height:1.8' }, q.text),
        h('div', { class: 'tiny muted mt-2' },
          [q.author, q.source].filter(Boolean).join(' · ') || '佚名'),
      ),
      h('div', { class: 'row mt-2', style: 'gap:6px;flex-wrap:wrap' },
        ...(q.tags ?? []).map((t) => Tag(t, 'line')),
      ),
      h('div', { class: 'row mt-3' },
        Button('复制', {
          variant: 'ghost', size: 'sm', icon: 'link',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(quoteLine(q));
              Toast('已复制到剪贴板', 'success');
            } catch {
              Toast('复制失败，请手动选择文字', 'error');
            }
          },
        }),
        h('span', { class: 'spacer' }),
        IconButton('trash', {
          title: '删除这条摘抄',
          onClick: async () => {
            if (!(await confirmDialog('删除这条摘抄？', q.text))) return;
            try {
              await store.drop('quotes', q.id);
              Toast('已删除', 'success');
              await rerender(ctx);
            } catch (err) {
              Toast(`删除失败：${err instanceof Error ? err.message : String(err)}`, 'error');
            }
          },
        }),
      ),
    ],
  });
}

async function renderQuotePage(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  ctx.setTitle('好词好句摘抄', '收集喜欢的句子 · 随时翻出来看');
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '好词好句摘抄' },
  ]);

  let tag = ctx.query.get('tag') ?? 'all';
  let keyword = ctx.query.get('q') ?? '';

  const all = store.list('quotes');
  const counter = h('span', { class: 'tag tag-green' }, '');
  const listWrap = h('div', { class: 'grid grid-auto' });

  const refresh = (): void => {
    const rows = all.filter((q) => applyQuoteFilters(q, tag, keyword));
    counter.textContent = `${rows.length} / ${all.length} 条`;
    mount(listWrap, rows.length
      ? h('div', { class: 'grid grid-auto' }, ...rows.map((q) => quoteCard(q, ctx)))
      : EmptyState({
        icon: 'diary',
        title: '没有匹配的摘抄',
        text: keyword || (tag && tag !== 'all')
          ? '试试换个关键词，或把分类筛选切回「全部」。'
          : '点击「添加摘抄」写下第一句喜欢的话吧。',
        action: Button('添加摘抄', { variant: 'primary', icon: 'plus', onClick: () => addQuoteDialog(ctx) }),
      }));
  };

  const onSearch = debounce((v: string) => {
    keyword = v;
    refresh();
  }, 260);

  // 分类筛选 chips：单选（含「全部」）
  const tagChips = Chips(
    [{ value: 'all', label: '全部' }, ...QUOTE_TAGS.map((t) => ({ value: t as string, label: t as string }))],
    {
      value: tag,
      onChange: (v) => {
        tag = String(v || 'all');
        refresh();
      },
    },
  );

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'diary',
    title: '好词好句摘抄',
    subtitle: '手动添加 · 分类筛选 · 关键词搜索 · 一键导出 TXT',
    actions: [
      Button('添加摘抄', { variant: 'primary', icon: 'plus', size: 'sm', onClick: () => addQuoteDialog(ctx) }),
      Button('导出 TXT', {
        variant: 'soft', size: 'sm', icon: 'download',
        onClick: () => exportQuotes(all.filter((q) => applyQuoteFilters(q, tag, keyword))),
      }),
    ],
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:8px;align-items:center' },
        h('span', { class: 'small muted' }, '分类：'),
        tagChips,
      ),
      h('div', { class: 'row mt-3', style: 'gap:8px;align-items:center;flex-wrap:wrap' },
        h('div', { style: 'min-width:200px;flex:1' },
          Input({
            value: keyword,
            placeholder: '搜索摘抄内容 / 作者 / 出处 / 标签',
            onInput: (v) => onSearch(v),
          }),
        ),
        counter,
        Button('重置', {
          variant: 'ghost', size: 'sm', icon: 'refresh',
          onClick: () => { tag = 'all'; keyword = ''; void rerender(ctx); },
        }),
      ),
      h('div', { class: 'tiny muted mt-2' }, `导出格式：每条一行「内容 —— 作者《出处》 [标签]」· 文件名 好词好句-${today()}.txt`),
    ],
  });

  mount(el,
    head,
    h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:var(--sp-4)' },
      readStatsCard(ctx),
      kindStatsCard('quote', ctx),
    ),
    SectionTitle('我的摘抄本', { icon: 'list' }),
    listWrap,
    h('div', { class: 'tiny muted mt-3' }, '预置的 20 句名句已在首次启动时写入本地；你的每一条摘抄都只保存在这台设备上。'),
  );

  refresh();
}

/* ------------------------------ 模块入口 ------------------------------ */
export const inspireModule = {
  id: 'inspire',
  title: '灵感补给站',
  icon: 'inspire',
  order: 3,
  desc: '好书 · 名句 · 电影 · 知识 · 理财串珠',

  badge(): number {
    // 侧栏角标只表示「有待处理事项」；本周已读数属于成就类信息，
    // 放在页面统计卡里展示，这里保持安静（治愈系导航不加噪音）。
    return 0;
  },

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    // 二级页：单词学习（复用 modules/words.ts）
    if (ctx.sub === 'words') {
      await renderWordStudy(el, ctx, { backHash: '#/inspire', backLabel: '灵感补给站' });
      return;
    }

    const rawSub = ctx.params[0] ?? '';
    const kind: ContentKind = isContentKind(rawSub) ? rawSub : DEFAULT_KIND;
    const id = ctx.params[1] ?? '';

    const draw = async (): Promise<void> => {
      // 二级页：好词好句摘抄
      if (ctx.sub === 'quote') {
        await renderQuotePage(el, ctx);
        return;
      }
      if (id) {
        await renderDetail(el, ctx, rawSub || kind, id);
        return;
      }
      await renderList(el, ctx, kind);
    };

    try {
      await draw();
    } catch (err) {
      console.error('[inspire] 渲染失败', err);
      mount(el, EmptyState({
        icon: 'notice',
        title: '灵感补给站暂时打了个盹',
        text: err instanceof Error ? err.message : String(err),
        action: Button('重新加载', {
          variant: 'primary', icon: 'refresh',
          onClick: () => void draw().catch((e: unknown) => Toast(String(e), 'error')),
        }),
      }));
      Toast('灵感补给站加载失败，请重试', 'error');
    }
  },
};

export type { ContentKind, KindMeta, Inspiration, Quote };
