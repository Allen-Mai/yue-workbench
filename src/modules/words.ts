/* ==========================================================================
   modules/words.ts · 单词学习（每日 5 个新词 + 复习前日 5 个词）
   读音（喇叭）· 跟读（录音对比）· 例句与精准中文翻译
   作为二级页被复用：#/hub/words 与 #/inspire/words
   ========================================================================== */

import { h, mount, clear } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, ListRow, ProgressBar, SectionTitle, Stat, Tag, Toast, openForm, confirmDialog,
} from '../ui/components';
import { store } from '../core/store';
import { ensurePlan, markWord, planFor, progress, wordLogs } from '../core/words';
import { exporter } from '../core/exporter';
import { today, fmtDate } from '../core/date';
import { award, coinsOn } from '../core/coins';
import type { ModuleCtx, Word } from '../types';

/* ------------------------------ 发音 ------------------------------ */
export function speak(text: string, lang = 'en-US'): void {
  try {
    if (!('speechSynthesis' in window)) {
      Toast('当前浏览器不支持朗读', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.88;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang?.toLowerCase().startsWith(lang.slice(0, 2)))
      ?? voices.find((x) => /en/i.test(x.lang));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn('[words] 朗读失败', err);
  }
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
  const played = h('span', { class: 'tiny muted' }, opts.stage === 'new' ? '新词' : '复习');
  let lastRecording = '';

  const recordBtn = Button('跟读', { variant: 'ghost', icon: 'mic', size: 'sm' });
  const playMine = Button('听我的', { variant: 'ghost', icon: 'speaker', size: 'sm', disabled: true });
  const recorder = createRecorder((recording) => {
    recordBtn.textContent = '';
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
    const audio = new Audio(lastRecording);
    void audio.play();
  });

  const done = (ok: boolean) => {
    void markWord(word.id, ok, !!lastRecording).then(async () => {
      if (ok) {
        const cap = opts.stage === 'new' ? 0.4 : 0.2;
        if (coinsOn(today(), 'study') < 0.6) {
          await award('study', Math.min(cap, 0.6 - coinsOn(today(), 'study')), `单词学习：${word.word}`, today());
        }
      }
      Toast(ok ? `记住了 · ${word.word}` : `再复习一次 · ${word.word}`, ok ? 'success' : 'default');
      opts.onDone();
    });
  };

  const card = Card({
    title: h('span', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' },
      h('span', { style: 'font-size:18px;font-weight:700;letter-spacing:.6px' }, word.word),
      h('span', { class: 'muted', style: 'font-size:13px' }, word.phonetic),
      played,
    ),
    icon: opts.stage === 'new' ? 'sprout' : 'refresh',
    actions: [
      IconButton('speaker', { title: '朗读', onClick: () => speak(word.word) }),
      recordBtn,
      playMine,
    ],
    body: [
      h('div', { class: 'small', style: 'margin-bottom:6px' }, h('b', null, word.meaning)),
      h('div', { class: 'quote-block' },
        h('div', null, word.example),
        h('div', { class: 'muted tiny', style: 'margin-top:4px' }, word.example_cn),
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
  return card;
}

/* ------------------------------ 页面主体 ------------------------------ */
export async function renderWordStudy(el: HTMLElement, ctx: ModuleCtx, opts: { backHash?: string; backLabel?: string } = {}): Promise<void> {
  ctx.setTitle('单词学习', '每日 5 个新词 + 复习前日 5 个词');
  if (opts.backHash) {
    ctx.setBreadcrumb([
      { label: '工作台' },
      { label: opts.backLabel ?? '今日中枢', hash: opts.backHash },
      { label: '单词学习' },
    ]);
  }

  const plan = await ensurePlan(today());
  const prog = progress(today());
  const logs = wordLogs(today());

  const header = Card({
    variant: 'green',
    title: `今日任务 · ${fmtDate(today())}`,
    icon: 'book',
    actions: [
      opts.backHash ? Button('返回', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go(opts.backHash!) }) : null,
      Button('添加单词', { variant: 'soft', icon: 'plus', size: 'sm', onClick: () => addWordDialog(ctx) }),
    ],
    body: [
      h('div', { class: 'row', style: 'gap:16px;flex-wrap:wrap' },
        Stat({ label: '今日进度', value: `${prog.done}/${prog.total || 10}`, unit: '个', tone: 'green', icon: 'check' }),
        Stat({ label: '累计词库', value: store.count('words'), unit: '个', icon: 'leaf' }),
        Stat({ label: '已掌握', value: store.list('words').filter((w) => w.learned).length, unit: '个', tone: 'honey', icon: 'star' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(prog.total ? (prog.done / prog.total) * 100 : 0)),
      h('div', { class: 'tiny muted mt-2' }, '读完听发音 → 跟读录音 → 点「记住了」。每完成一个词可获得金币（每日单词金币上限 0.6）。'),
    ],
    decor: true,
  });

  const freshWrap = h('div', { class: 'grid grid-2' });
  const reviewWrap = h('div', { class: 'grid grid-2' });

  const rerender = async () => { await renderWordStudy(el, ctx, opts); };

  const freshList = plan.fresh.length ? plan.fresh : [];
  const reviewList = plan.review.length ? plan.review : [];

  for (const w of freshList) freshWrap.appendChild(wordCard(w, { stage: 'new', onDone: () => void rerender() }));
  for (const w of reviewList) reviewWrap.appendChild(wordCard(w, { stage: 'review', onDone: () => void rerender() }));

  const body: Node[] = [header];

  body.push(SectionTitle('今日新词 5 个', { icon: 'sprout' }));
  body.push(freshList.length ? freshWrap : EmptyState({ icon: 'seed', title: '词库暂时没有新词了', text: '点击上方「添加单词」补充你的专属词库。' }));

  body.push(SectionTitle('复习前日 5 个', { icon: 'refresh' }));
  body.push(reviewList.length ? reviewWrap : EmptyState({ icon: 'book', title: '今天是第一天', text: '明天开始会出现复习任务，先认识今天的 5 个新词吧。' }));

  body.push(SectionTitle('今日学习记录', { icon: 'list' }));
  const logCard = Card({
    icon: 'check',
    title: '掌握情况',
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
  });
  body.push(logCard);

  body.push(SectionTitle('我的词库', { icon: 'book' }));
  const library = Card({
    icon: 'list',
    title: `全部单词（${store.count('words')}）`,
    actions: [
      Button('导出词库', { variant: 'ghost', icon: 'download', size: 'sm', onClick: () => exportLibrary() }),
    ],
    body: h('div', { class: 'list' },
      ...store.list('words').slice(0, 30).map((w) => ListRow({
        icon: 'leaf',
        title: h('span', null, h('b', null, w.word), h('span', { class: 'muted' }, ` ${w.phonetic}`)),
        meta: [w.meaning, w.date ? `分配于 ${w.date}` : '未分配'].join(' · '),
        right: IconButton('speaker', { title: '朗读', onClick: () => speak(w.word) }),
      })),
    ),
    footer: [h('span', { class: 'tiny muted' }, '最多展示 30 条 · 完整词库请用「导出词库」')],
  });
  body.push(library);

  mount(el, ...body);
}

/* ------------------------------ 词库维护 ------------------------------ */
export function addWordDialog(ctx: ModuleCtx): void {
  openForm({
    title: '添加单词',
    fields: [
      { name: 'word', label: '单词', required: true, placeholder: '例如 blossom' },
      { name: 'phonetic', label: '音标', placeholder: '/ˈblɒsəm/' },
      { name: 'meaning', label: '中文释义', required: true, placeholder: 'n. 花朵 v. 开花' },
      { name: 'example', label: '英文例句', type: 'textarea', rows: 2, span: 2 },
      { name: 'example_cn', label: '精准中文翻译', type: 'textarea', rows: 2, span: 2 },
      { name: 'date', label: '分配日期', type: 'date', value: today(), hint: '留空表示加入待分配词库' },
    ],
    onSubmit: async (v) => {
      await store.save('words', {
        word: String(v.word).trim(),
        phonetic: String(v.phonetic ?? ''),
        meaning: String(v.meaning ?? ''),
        example: String(v.example ?? ''),
        example_cn: String(v.example_cn ?? ''),
        date: String(v.date ?? ''),
        stage: 'new',
        learned: false,
      });
      Toast('已加入词库', 'success');
      await ctx.refresh('words');
    },
  });
}

function exportLibrary(): void {
  const rows = [['单词', '音标', '释义', '例句', '翻译', '分配日期']];
  for (const w of store.list('words')) rows.push([w.word, w.phonetic, w.meaning, w.example, w.example_cn, w.date]);
  const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
  exporter.download(`单词库-${today()}.csv`, csv, 'text/csv;charset=utf-8');
  Toast('词库已导出', 'success');
}

/* ------------------------------ 词库重置（设置页用） ------------------------------ */
export async function resetWordAssignment(): Promise<void> {
  if (!(await confirmDialog('重新分配全部单词？', '所有单词的分配日期会被清空，明天的计划将重新抽取。', { danger: true }))) return;
  for (const w of store.list('words')) {
    await store.patch('words', w.id, { date: '', learned: false });
  }
  Toast('已重置单词分配', 'success');
}

export const wordsModule = null;
export { planFor, clear };
