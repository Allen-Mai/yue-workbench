/* ==========================================================================
   modules/words.ts · 单词学习
   每日 N 个新词 + 复习前日 N 个词 · 读音 · 跟读录音对比 · 例句与精准翻译
   支持「通用词库 / 雅思核心词库」切换，以及雅思四类用途分类筛选
   二级页：#/hub/words · #/inspire/words
   ========================================================================== */

import { h, mount, clear, debounce } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, Chips, EmptyState, Field, IconButton, Input, ListRow, ProgressBar,
  SectionTitle, Segmented, Stat, Tag, Toast, confirmDialog, openForm, promptDialog,
} from '../ui/components';
import { store } from '../core/store';
import {
  currentFilter, ensurePlan, filteredWords, markWord, planFor, progress, stats, wordLogs,
  wordsPerDay, resetAssignment, matchesFilter, type WordFilter,
} from '../core/words';
import { fmtDate, today } from '../core/date';
import { award, coinsOn } from '../core/coins';
import { WORD_CATEGORY_DESC, WORD_CATEGORY_ICON, WORD_CATEGORY_LABEL } from '../data/words/types';
import { exporter } from '../core/exporter';
import type { ModuleCtx, Word, WordCategory } from '../types';

/* ------------------------------ 发音 ------------------------------ */
/** 朗读文本（可传入按钮，朗读期间给它加上呼吸动画）
 *  - 英文：优先英式音源；句子正常语速，单词放慢便于跟读
 *  - 中文：优先普通话音源，正常语速
 */
export function speak(text: string, lang = 'en-US', btn?: HTMLElement | null, onEnd?: () => void): void {
  try {
    const raw = String(text ?? '').trim();
    if (!raw) {
      onEnd?.();
      return;
    }
    if (!('speechSynthesis' in window)) {
      Toast('当前浏览器不支持朗读', 'error');
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(raw);
    u.lang = lang;
    const isCJK = /[\u4e00-\u9fa5]/.test(raw);
    const words = raw.split(/\s+/).filter(Boolean).length;
    u.rate = isCJK ? 0.95 : words > 2 ? 0.92 : 0.86;
    u.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const lower = lang.toLowerCase();
    let prefer: SpeechSynthesisVoice | undefined;
    if (lower.startsWith('zh')) {
      prefer = voices.find((x) => /zh[-_]?(CN|Hans)|cmn[-_]?Hans/i.test(x.lang))
        ?? voices.find((x) => /zh|cmn/i.test(x.lang));
    } else if (lower.startsWith('en')) {
      prefer = voices.find((x) => /en[-_]GB/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
    } else {
      prefer = voices.find((x) => x.lang?.toLowerCase().startsWith(lower.slice(0, 2)));
    }
    if (prefer) u.voice = prefer;

    const done = () => {
      btn?.classList.remove('is-speaking');
      onEnd?.();
    };
    u.onend = done;
    u.onerror = done;
    if (btn) btn.classList.add('is-speaking');
    // 兜底：部分浏览器 onend 不触发
    window.setTimeout(done, Math.max(2600, raw.length * (isCJK ? 260 : 95)));
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn('[words] 朗读失败', err);
    onEnd?.();
  }
}

export interface SpeakInlineOptions {
  /** 朗读语言：英文例句用 en-US，中文翻译用 zh-CN */
  lang?: string;
  /** 图标像素尺寸 */
  size?: number;
  /** 弱化样式（用于中文翻译这种次要朗读） */
  soft?: boolean;
}

/** 行内小喇叭：点击朗读给定文本，朗读期间有呼吸动画 */
export function speakInline(text: string, title = '朗读', opts: SpeakInlineOptions = {}): HTMLButtonElement {
  const btn = h('button', {
    type: 'button',
    class: `speak-inline ${opts.soft ? 'is-soft' : ''}`.trim(),
    title,
    'aria-label': title,
  });
  btn.appendChild(pixelIcon('speaker', opts.size ?? 15, { color: opts.soft ? 'var(--ink-faint)' : 'var(--moss-mid)' }));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    speak(text, opts.lang ?? 'en-US', btn);
  });
  return btn;
}

/* ------------------------------ 跟读录音 ------------------------------ */
interface Recorder {
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  recording: boolean;
}

function createRecorder(onState: (recording: boolean) => void): Recorder {
  let media: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  const rec: Recorder = {
    recording: false,
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        Toast('当前环境不支持录音（iOS 需从主屏幕图标打开）', 'error');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        media = new MediaRecorder(stream);
        chunks = [];
        media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        media.start();
        rec.recording = true;
        onState(true);
      } catch (err) {
        Toast(`无法访问麦克风：${err instanceof Error ? err.message : ''}`, 'error');
      }
    },
    async stop() {
      if (!media) return null;
      const done = new Promise<string | null>((resolve) => {
        media!.onstop = () => {
          const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
          stream?.getTracks().forEach((t) => t.stop());
          resolve(URL.createObjectURL(blob));
        };
      });
      media.stop();
      rec.recording = false;
      onState(false);
      media = null;
      return done;
    },
  };
  return rec;
}

/* ------------------------------ 单词卡 ------------------------------ */
function wordCard(word: Word, opts: { stage: 'new' | 'review'; onDone: () => void }): HTMLElement {
  const cat = word.category as WordCategory | '' | undefined;
  let lastRecording = '';

  const recordBtn = Button('跟读', { variant: 'ghost', icon: 'mic', size: 'sm' });
  const playMine = Button('听我的', { variant: 'ghost', icon: 'speaker', size: 'sm', disabled: true });
  const recorder = createRecorder((recording) => {
    clear(recordBtn);
    recordBtn.appendChild(pixelIcon(recording ? 'close' : 'mic', 14));
    recordBtn.appendChild(document.createTextNode(recording ? ' 停止' : ' 跟读'));
  });

  recordBtn.addEventListener('click', async () => {
    if (recorder.recording) {
      const url = await recorder.stop();
      if (url) {
        lastRecording = url;
        playMine.disabled = false;
        Toast('录好啦，点「听我的」和原音对比一下', 'success');
      }
    } else {
      await recorder.start();
      speak(word.word);
    }
  });
  playMine.addEventListener('click', () => {
    if (!lastRecording) return;
    void new Audio(lastRecording).play();
  });

  const done = (ok: boolean) => {
    void markWord(word.id, ok, !!lastRecording).then(async () => {
      if (ok) {
        const remain = 0.6 - coinsOn(today(), 'study');
        if (remain > 0) {
          await award('study', Math.min(opts.stage === 'new' ? 0.4 : 0.2, remain), `单词学习：${word.word}`, today());
        }
      }
      Toast(ok ? `记住了 · ${word.word}` : `再复习一次 · ${word.word}`, ok ? 'success' : 'default');
      opts.onDone();
    });
  };

  return Card({
    title: h('span', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' },
      h('span', { style: 'font-size:18px;font-weight:700;letter-spacing:.6px' }, word.word),
      h('span', { class: 'muted', style: 'font-size:13px' }, word.phonetic),
      cat ? Tag(WORD_CATEGORY_LABEL[cat], 'green') : null,
      h('span', { class: 'tiny muted' }, opts.stage === 'new' ? '新词' : '复习'),
    ),
    icon: opts.stage === 'new' ? 'sprout' : 'refresh',
    actions: [
      IconButton('speaker', { title: '朗读', onClick: () => speak(word.word) }),
      recordBtn,
      playMine,
    ],
    body: [
      h('div', { class: 'quote-line', style: 'margin-bottom:6px' },
        speakInline(word.meaning, '朗读中文释义', { lang: 'zh-CN', size: 13, soft: true }),
        h('span', { class: 'small' }, h('b', null, word.meaning)),
      ),
      h('div', { class: 'quote-block' },
        h('div', { class: 'quote-line' },
          speakInline(word.example, '朗读英文例句'),
          h('span', null, word.example),
        ),
        h('div', { class: 'quote-line', style: 'margin-top:6px' },
          speakInline(word.example_cn, '朗读中文翻译', { lang: 'zh-CN', size: 13, soft: true }),
          h('span', { class: 'muted tiny' }, word.example_cn),
        ),
      ),
    ],
    footer: [
      Button('记住了', { variant: 'primary', icon: 'check', size: 'sm', onClick: () => done(true) }),
      Button('还不熟', { variant: 'soft', icon: 'refresh', size: 'sm', onClick: () => done(false) }),
      h('span', { class: 'spacer' }),
      lastRecording ? null : h('span', { class: 'tiny muted' }, '先点喇叭听原音，再跟读对比'),
    ],
    decor: true,
  });
}

/* ------------------------------ 筛选栏 ------------------------------ */
function filterCard(ctx: ModuleCtx, rerender: () => void): HTMLElement {
  const f = currentFilter();
  const s = stats(f);

  const bookSeg = Segmented([
    { value: 'ielts', label: `雅思核心词 ${s.ielts}` },
    { value: 'general', label: `通用词库 ${s.general}` },
    { value: 'all', label: `全部 ${s.total}` },
  ], {
    value: f.book,
    onChange: (v) => {
      void store.setSetting('wordBook', v).then(() => {
        Toast(v === 'ielts' ? '已切换到雅思核心词库' : v === 'general' ? '已切换到通用词库' : '已切换到全部词库', 'success');
        rerender();
      });
    },
  });

  const catItems = [
    { value: 'all', label: `全部 ${s.ielts}` },
    ...(Object.keys(WORD_CATEGORY_LABEL) as WordCategory[]).map((c) => ({
      value: c,
      label: `${WORD_CATEGORY_LABEL[c]} ${s.byCategory[c]}`,
    })),
  ];

  const catChips = Chips(catItems, {
    value: f.category,
    size: 'sm',
    onChange: (v) => {
      void store.setSetting('wordCategory', String(v || 'all')).then(() => {
        Toast(`已筛选：${v === 'all' ? '全部分类' : WORD_CATEGORY_LABEL[v as WordCategory]}`, 'success');
        rerender();
      });
    },
  });

  return Card({
    icon: 'filter',
    title: '词库筛选',
    subtitle: '选中的范围决定「今日新词」从哪里抽取，也决定下面词库列表的内容',
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:10px;margin-bottom:10px' }, bookSeg),
      f.book === 'ielts'
        ? h('div', null, catChips, h('div', { class: 'tiny muted mt-2' }, WORD_CATEGORY_DESC[f.category as WordCategory] ?? '雅思核心词库按听力 / 阅读 / 写作 / 口语四类用途组织，可只背当前最需要的一类。'))
        : h('div', { class: 'tiny muted' }, '通用词库为森系与理财主题的日常词汇，适合作为热身。'),
      h('div', { class: 'grid grid-auto mt-3' },
        Stat({ label: '命中筛选', value: f.book === 'ielts' && f.category !== 'all' ? s.byCategory[f.category as WordCategory] : (f.book === 'general' ? s.general : f.book === 'ielts' ? s.ielts : s.total), unit: '词', tone: 'green', icon: 'book' }),
        Stat({ label: '已掌握', value: s.learned, unit: '词', tone: 'honey', icon: 'star' }),
        Stat({ label: '每日新词', value: wordsPerDay(), unit: '个', icon: 'sprout' }),
        Stat({ label: '今日已分配', value: s.assignedToday, unit: '个', tone: 'oak', icon: 'calendar' }),
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('调整每日新词数', { variant: 'ghost', size: 'sm', icon: 'settings', onClick: async () => {
          const v = await promptDialog('每日新词数量', { label: '数量（1–20）', value: String(wordsPerDay()) });
          const n = Number(v);
          if (!v || !Number.isFinite(n)) return;
          await store.setSetting('wordsPerDay', Math.max(1, Math.min(20, Math.round(n))));
          Toast(`每日新词已设为 ${Math.max(1, Math.min(20, Math.round(n)))} 个`, 'success');
          rerender();
        } }),
        Button('去雅思课程', { variant: 'soft', size: 'sm', icon: 'inspire', onClick: () => ctx.go('#/inspire/ielts') }),
      ),
    ],
    decor: true,
  });
}

/* ------------------------------ 主页面 ------------------------------ */
export async function renderWordStudy(
  el: HTMLElement,
  ctx: ModuleCtx,
  opts: { backHash?: string; backLabel?: string } = {},
): Promise<void> {
  const f = currentFilter();
  const plan = await ensurePlan(today(), f);
  const prog = progress(today(), f);
  const logs = wordLogs(today());
  const s = stats(f);

  const rerender = () => { void renderWordStudy(el, ctx, opts); };

  ctx.setTitle('单词学习', f.book === 'ielts' ? `雅思核心词库 · 每日 ${wordsPerDay()} 新词 + 复习` : `通用词库 · 每日 ${wordsPerDay()} 新词 + 复习`);
  if (opts.backHash) {
    ctx.setBreadcrumb([
      { label: '工作台' },
      { label: opts.backLabel ?? '今日中枢', hash: opts.backHash },
      { label: '单词学习' },
    ]);
  }

  const header = Card({
    variant: 'green',
    title: `今日任务 · ${fmtDate(today())}`,
    icon: 'book',
    actions: [
      opts.backHash ? Button('返回', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go(opts.backHash!) }) : null,
      Button('雅思课程', { variant: 'soft', icon: 'inspire', size: 'sm', onClick: () => ctx.go('#/inspire/ielts') }),
      Button('添加单词', { variant: 'soft', icon: 'plus', size: 'sm', onClick: () => addWordDialog(rerender) }),
    ],
    body: [
      h('div', { class: 'row', style: 'gap:16px;flex-wrap:wrap' },
        Stat({ label: '今日进度', value: `${prog.done}/${prog.total || wordsPerDay() * 2}`, unit: '个', tone: 'green', icon: 'check' }),
        Stat({ label: '当前词库', value: f.book === 'ielts' ? s.ielts : f.book === 'general' ? s.general : s.total, unit: '词', icon: 'leaf' }),
        Stat({ label: '已掌握', value: s.learned, unit: '词', tone: 'honey', icon: 'star' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(prog.total ? (prog.done / prog.total) * 100 : 0)),
      h('div', { class: 'tiny muted mt-2' }, '读完听发音 → 跟读录音 → 点「记住了」。每完成一个词可获得金币（每日单词金币上限 0.6）。'),
    ],
    decor: true,
  });

  const freshWrap = h('div', { class: 'grid grid-2' });
  const reviewWrap = h('div', { class: 'grid grid-2' });
  for (const w of plan.fresh) freshWrap.appendChild(wordCard(w, { stage: 'new', onDone: rerender }));
  for (const w of plan.review) reviewWrap.appendChild(wordCard(w, { stage: 'review', onDone: rerender }));

  const body: Node[] = [header, SectionTitle('词库与筛选', { icon: 'filter' }), filterCard(ctx, rerender)];

  body.push(SectionTitle(`今日新词 ${plan.fresh.length} 个`, { icon: 'sprout' }));
  body.push(plan.fresh.length
    ? freshWrap
    : EmptyState({
      icon: 'seed',
      title: '这个范围的新词已经背完了',
      text: f.book === 'ielts' && f.category !== 'all'
        ? '可以换一个分类继续，或者把范围切回「全部」用新词补充。'
        : '点击上方「添加单词」补充你的专属词库。',
    }));

  body.push(SectionTitle(`复习前日 ${plan.review.length} 个`, { icon: 'refresh' }));
  body.push(plan.review.length
    ? reviewWrap
    : EmptyState({ icon: 'book', title: '今天是这个范围的第一天', text: '明天开始会出现复习任务，先认识今天的新词吧。' }));

  body.push(SectionTitle('今日学习记录', { icon: 'list' }));
  body.push(Card({
    icon: 'check',
    title: `掌握情况（${logs.length}）`,
    body: logs.length
      ? h('div', { class: 'list' }, ...logs.map((l) => {
        const w = store.byId('words', l.word_id);
        return ListRow({
          icon: l.correct ? 'check' : 'refresh',
          title: w?.word ?? '（已删除）',
          meta: [w?.meaning, l.recording ? '已跟读录音' : '未录音'].filter(Boolean).join(' · '),
          right: Tag(l.correct ? '记住' : '待复习', l.correct ? 'green' : 'honey'),
        });
      }))
      : EmptyState({ icon: 'seed', title: '还没有学习记录', text: '从上面第一个词开始吧。' }),
  }));

  body.push(SectionTitle('我的词库', { icon: 'book' }));
  body.push(libraryCard(ctx, rerender));

  mount(el, ...body);
}

/* ------------------------------ 词库浏览 ------------------------------ */
function libraryCard(ctx: ModuleCtx, rerender: () => void): HTMLElement {
  const f = currentFilter();
  const PAGE = 24;
  let page = 1;
  let keyword = '';
  let only: 'all' | 'new' | 'learned' = 'all';

  const listHost = h('div', { class: 'list' });
  const countEl = h('span', { class: 'tiny muted' });

  const renderList = () => {
    const hits = filteredWords(f).filter((w) => {
      if (only === 'new' && w.learned) return false;
      if (only === 'learned' && !w.learned) return false;
      if (!keyword) return true;
      const k = keyword.toLowerCase();
      return w.word.toLowerCase().includes(k)
        || w.meaning.includes(keyword)
        || w.example.toLowerCase().includes(k);
    });
    clear(listHost);
    const slice = hits.slice(0, page * PAGE);
    for (const w of slice) {
      const cat = w.category as WordCategory | '' | undefined;
      listHost.appendChild(ListRow({
        icon: 'leaf',
        title: h('span', null, h('b', null, w.word), h('span', { class: 'muted' }, ` ${w.phonetic}`)),
        meta: [w.meaning, cat ? WORD_CATEGORY_LABEL[cat] : '', w.date ? `分配于 ${w.date}` : '未分配'].filter(Boolean).join(' · '),
        right: h('span', { style: 'display:flex;gap:2px' },
          w.learned ? Tag('已掌握', 'green') : null,
          IconButton('speaker', { title: '朗读', onClick: () => speak(w.word) }),
        ),
      }));
    }
    if (!hits.length) {
      listHost.appendChild(EmptyState({ icon: 'search', title: '没有匹配的单词', text: '换个关键词，或把筛选范围放宽一些。' }));
    } else if (hits.length > slice.length) {
      listHost.appendChild(Button(`加载更多（还有 ${hits.length - slice.length} 个）`, {
        variant: 'soft', block: true,
        onClick: () => { page += 1; renderList(); },
      }));
    }
    countEl.textContent = `命中 ${hits.length} 个 · 已显示 ${slice.length} 个（共浏览上限受分页控制）`;
  };

  const seg = Segmented([
    { value: 'all', label: '全部' },
    { value: 'new', label: '未掌握' },
    { value: 'learned', label: '已掌握' },
  ], { value: only, onChange: (v) => { only = v as typeof only; page = 1; renderList(); } });

  const search = Input({
    placeholder: '搜索拼写 / 释义 / 例句…',
    onInput: debounce((v: string) => { keyword = v; page = 1; renderList(); }, 240) as (v: string) => void,
  });

  renderList();

  return Card({
    icon: 'list',
    title: `词库浏览（${f.book === 'ielts' ? '雅思核心' : f.book === 'general' ? '通用' : '全部'}）`,
    actions: [
      Button('导出当前筛选', { variant: 'ghost', icon: 'download', size: 'sm', onClick: () => exportLibrary(f) }),
    ],
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:10px;margin-bottom:10px' }, seg),
      h('div', { style: 'margin-bottom:10px' }, search),
      countEl,
      h('div', { class: 'mt-3' }, listHost),
    ],
    footer: [
      Button('重置全部单词分配', { variant: 'danger', size: 'sm', icon: 'refresh', onClick: async () => {
        const n = await resetAssignment();
        Toast(`已重置 ${n} 个单词的分配`, 'success');
        rerender();
      } }),
      h('span', { class: 'tiny muted' }, '重置后所有单词回到「未分配」，明天重新抽取；学习记录（word_logs）保留。'),
    ],
  });
}

/* ------------------------------ 词库维护 ------------------------------ */
function addWordDialog(onDone: () => void): void {
  openForm({
    title: '添加单词',
    fields: [
      { name: 'word', label: '单词', required: true, placeholder: '例如 blossom' },
      { name: 'phonetic', label: '音标', placeholder: '/ˈblɒsəm/' },
      { name: 'meaning', label: '中文释义', required: true, placeholder: 'n. 花朵 v. 开花' },
      { name: 'category', label: '雅思分类', type: 'select', options: [
        { value: '', label: '不分类（通用）' },
        ...Object.entries(WORD_CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l })),
      ], hint: '选择分类后会归入雅思词库对应筛选' },
      { name: 'example', label: '英文例句', type: 'textarea', rows: 2, span: 2 },
      { name: 'example_cn', label: '精准中文翻译', type: 'textarea', rows: 2, span: 2 },
      { name: 'date', label: '分配日期', type: 'date', value: '', hint: '留空表示加入待分配词库' },
    ],
    onSubmit: async (v) => {
      const category = String(v.category ?? '');
      await store.save('words', {
        word: String(v.word).trim(),
        phonetic: String(v.phonetic ?? ''),
        meaning: String(v.meaning ?? ''),
        example: String(v.example ?? ''),
        example_cn: String(v.example_cn ?? ''),
        date: String(v.date ?? ''),
        stage: 'new',
        learned: false,
        category: category as WordCategory | '',
        book: category ? 'ielts' : 'general',
      });
      Toast('已加入词库', 'success');
      onDone();
    },
  });
}

function exportLibrary(f: WordFilter): void {
  const rows = [['单词', '音标', '释义', '例句', '翻译', '分类', '词库', '是否已掌握', '分配日期']];
  for (const w of filteredWords(f)) {
    rows.push([
      w.word, w.phonetic, w.meaning, w.example, w.example_cn,
      w.category ? WORD_CATEGORY_LABEL[w.category as WordCategory] : '',
      (w.book ?? 'general') === 'ielts' ? '雅思核心' : '通用',
      w.learned ? '是' : '否', w.date,
    ]);
  }
  const csv = rows
    .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(','))
    .join('\n');
  exporter.download(`词库-${f.book}-${f.category}-${today()}.csv`, csv, 'text/csv;charset=utf-8');
  Toast(`已导出 ${rows.length - 1} 个单词`, 'success');
}

/** 设置页使用：重置单词分配 */
export async function resetWordAssignment(): Promise<void> {
  if (!(await confirmDialog('重新分配全部单词？', '所有单词的分配日期会被清空，明天的计划将重新抽取。学习记录会保留。', { danger: true }))) return;
  const n = await resetAssignment();
  Toast(`已重置 ${n} 个单词的分配`, 'success');
}

export { planFor, matchesFilter, clear };
