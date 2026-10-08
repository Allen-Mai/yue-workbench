/* ==========================================================================
   modules/listening.ts · 原创雅思听力练习（雅思课程 → 听力精讲 → 练习库）
   路由： #/inspire/ielts/listening            练习库（按 Section 分组）
          #/inspire/ielts/listening/<slug>     精听播放器 + 答题判分
   播放：系统语音合成（Web Speech API），按说话人自动分配合成音色，
        支持变速、逐句精听、原文隐藏（盲听）；全部内容为原创，无版权素材。
   ========================================================================== */

import { h, mount, clear } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, ListRow, ProgressBar, SectionTitle, Segmented, Stat, Tag, Toast,
} from '../ui/components';
import { store } from '../core/store';
import { fmtDate, today } from '../core/date';
import { award, coinsOn } from '../core/coins';
import { checkAchievements } from '../core/stats';
import { speak } from './words';
import { SECTION_META } from '../data/listenings/types';
import type { ListeningRow, ModuleCtx } from '../types';

const STUDY_DAILY_CAP = 0.6;

/* ==========================================================================
   语音播放器：按说话人分配不同音色，支持变速 / 逐句 / 续听
   ========================================================================== */
function englishVoices(): SpeechSynthesisVoice[] {
  try {
    const all = window.speechSynthesis?.getVoices?.() ?? [];
    const en = all.filter((v) => /^en/i.test(v.lang));
    const gb = en.filter((v) => /en[-_]GB/i.test(v.lang));
    // 优先用两个以上英式音源来区分说话人；不足时退回全部英文音源
    if (gb.length >= 2) return gb;
    if (en.length >= 2) return en;
    return en.length ? en : all.slice(0, 2);
  } catch {
    return [];
  }
}

class SpeechPlayer {
  private lines: Array<{ speaker: string; text: string }> = [];
  private queue: SpeechSynthesisUtterance[] = []; // 持有引用，规避 Chrome 的 GC 中断 bug
  private speakers = new Map<string, number>();
  private token = 0;
  idx = 0;
  rate = 1;
  playing = false;

  onLine?: (i: number) => void;
  onStateChange?: (playing: boolean) => void;
  onDone?: () => void;

  load(lines: Array<{ speaker: string; text: string }>): void {
    this.stop();
    this.lines = Array.isArray(lines) ? lines : [];
    this.speakers.clear();
    this.idx = 0;
  }

  get total(): number {
    return this.lines.length;
  }

  private speakerIndex(speaker: string): number {
    const key = String(speaker || 'Narrator');
    if (!this.speakers.has(key)) this.speakers.set(key, this.speakers.size);
    return this.speakers.get(key) ?? 0;
  }

  private makeUtterance(i: number, token: number): SpeechSynthesisUtterance {
    const line = this.lines[i];
    const u = new SpeechSynthesisUtterance(String(line.text ?? ''));
    u.lang = 'en-GB';
    u.rate = this.rate;
    const voices = englishVoices();
    const si = this.speakerIndex(line.speaker);
    if (voices.length) u.voice = voices[si % voices.length];
    // 只有一个音源时，用音高区分说话人
    u.pitch = voices.length > 1 ? 1 : [0.92, 1.15, 1.02, 1.08][si % 4];
    u.onstart = () => {
      if (token !== this.token) return;
      this.idx = i;
      this.onLine?.(i);
    };
    return u;
  }

  private markDone(token: number): void {
    if (token !== this.token) return;
    this.playing = false;
    this.onStateChange?.(false);
    this.onDone?.();
  }

  /** 从第 from 行开始播放全部（或只播放 from 这一行） */
  play(from = 0, only = false): void {
    const synth = window.speechSynthesis;
    if (!synth) {
      Toast('当前环境不支持语音播放', 'error');
      return;
    }
    if (!this.lines.length) return;
    synth.cancel();
    this.queue = [];
    this.token += 1;
    const token = this.token;
    const start = Math.max(0, Math.min(from, this.lines.length - 1));
    const end = only ? start + 1 : this.lines.length;

    for (let i = start; i < end; i++) {
      const u = this.makeUtterance(i, token);
      if (i === end - 1) {
        const prevEnd = u.onend;
        u.onend = () => {
          this.queue = this.queue.filter((x) => x !== u);
          this.markDone(token);
        };
        void prevEnd;
      }
      this.queue.push(u);
      synth.speak(u);
    }
    this.idx = start;
    this.playing = true;
    this.onLine?.(start);
    this.onStateChange?.(true);
  }

  pause(): void {
    try {
      window.speechSynthesis?.pause();
    } catch { /* ignore */ }
    this.playing = false;
    this.onStateChange?.(false);
  }

  resume(): void {
    try {
      window.speechSynthesis?.resume();
    } catch { /* ignore */ }
    this.playing = true;
    this.onStateChange?.(true);
  }

  stop(): void {
    this.token += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch { /* ignore */ }
    this.queue = [];
    this.playing = false;
    this.onStateChange?.(false);
  }

  setRate(r: number, restart = true): void {
    this.rate = r;
    if (restart && this.playing) this.play(this.idx);
  }
}

const RATE_OPTIONS = [
  { value: '0.7', label: '0.7×' },
  { value: '0.85', label: '0.85×' },
  { value: '1', label: '1.0×' },
  { value: '1.15', label: '1.15×' },
];

/* ------------------------------ 数据 ------------------------------ */
function allListenings(): ListeningRow[] {
  return store.list('listenings').slice().sort((a, b) => a.section - b.section || a.created_at - b.created_at);
}
function findListening(slug: string): ListeningRow | undefined {
  return allListenings().find((l) => l.slug === slug || l.id === `lo_${slug}` || l.id === slug);
}
function wordCount(item: ListeningRow): number {
  return (item.lines ?? []).reduce((s, l) => s + String(l.text ?? '').split(/\s+/).filter(Boolean).length, 0);
}
function estimateMinutes(item: ListeningRow): number {
  return Math.max(1, Math.round(wordCount(item) / 130));
}

/* ==========================================================================
   练习库列表
   ========================================================================== */
export function listeningListView(el: HTMLElement, ctx: ModuleCtx, backHash = '#/inspire/ielts'): void {
  const all = allListenings();
  let filter: 'all' | '1' | '2' | '3' | '4' = 'all';

  ctx.setTitle('听力练习库', '原创雅思风格听力 · 系统语音朗读 · 逐句精听');
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '听力练习库' },
  ]);

  const listHost = h('div', { class: 'col' });

  const render = () => {
    clear(listHost);
    const items = all.filter((l) => filter === 'all' || String(l.section) === filter);
    const groups = new Map<number, ListeningRow[]>();
    for (const it of items) {
      const arr = groups.get(it.section) ?? [];
      arr.push(it);
      groups.set(it.section, arr);
    }
    for (const [sec, arr] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
      const meta = SECTION_META[sec as 1 | 2 | 3 | 4];
      listHost.appendChild(SectionTitle(`${meta?.label ?? `Section ${sec}`} · ${meta?.kind ?? ''}（${arr.length}）`, { icon: meta?.icon ?? 'speaker' }));
      listHost.appendChild(h('div', { class: 'grid grid-auto' }, ...arr.map((it) => {
        const done = it.done;
        const card = Card({
          hoverable: true,
          decor: true,
          icon: done ? 'check' : 'speaker',
          title: it.title,
          subtitle: `${meta?.label ?? ''} · ${meta?.speakers ?? ''} · 约 ${estimateMinutes(it)} 分钟 · ${wordCount(it)} 词`,
          body: [
            h('div', { class: 'tiny muted', style: 'line-height:1.85;min-height:44px' }, it.scene),
            h('div', { class: 'row row-wrap', style: 'gap:6px;margin-top:8px' },
              Tag(it.level, 'honey'),
              Tag(`${(it.lines ?? []).length} 句`, 'line'),
              Tag(`${(it.questions ?? []).length} 题`, 'line'),
              it.plays > 0 ? Tag(`听过 ${it.plays} 次`, 'green') : null,
              done ? Tag(`已完成 ${it.score} 分`, it.score >= 80 ? 'green' : 'honey') : null,
            ),
          ],
          footer: [
            Button(done ? '再练一次' : it.plays > 0 ? '继续精听' : '开始精听', {
              variant: 'primary', size: 'sm', icon: 'speaker',
              onClick: () => ctx.go(`#/inspire/ielts/listening/${it.slug}`),
            }),
          ],
        });
        card.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          ctx.go(`#/inspire/ielts/listening/${it.slug}`);
        });
        return card;
      })));
    }
    if (!items.length) {
      listHost.appendChild(EmptyState({
        icon: 'speaker',
        title: '这个 Section 还没有材料',
        text: '换个 Section 看看，或稍后刷新（语料可能还在安装）。',
      }));
    }
  };

  const doneCount = all.filter((l) => l.done).length;
  const totalPlays = all.reduce((s, l) => s + Number(l.plays || 0), 0);
  const avg = doneCount ? Math.round(all.filter((l) => l.done).reduce((s, l) => s + Number(l.score || 0), 0) / doneCount) : 0;

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'speaker',
    title: '原创听力练习库',
    subtitle: '全部素材由本地语音合成朗读，可变速、逐句精听、隐藏原文做盲听',
    actions: [
      Button('我的音频', { variant: 'soft', icon: 'upload', size: 'sm', title: '导入你自己合法持有的音频（可配字幕）', onClick: () => ctx.go('#/inspire/ielts/audio') }),
      backHash ? Button('返回雅思专区', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go(backHash) }) : null,
    ],
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '材料总数', value: all.length, unit: '篇', tone: 'green', icon: 'speaker' }),
        Stat({ label: '已完成', value: doneCount, unit: '篇', tone: 'honey', icon: 'check' }),
        Stat({ label: '平均得分', value: doneCount ? avg : '—', unit: doneCount ? '分' : '', icon: 'star' }),
        Stat({ label: '累计播放', value: totalPlays, unit: '次', tone: 'oak', icon: 'refresh' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(all.length ? (doneCount / all.length) * 100 : 0)),
      h('div', { class: 'tiny muted mt-2' },
        '这些材料是平台原创内容（不是真题、也不是任何教材的课文），用系统语音朗读，'
        + '所以你可以放心跟读、变速、反复听。想练真人口音的话，正版剑桥雅思书附带的音频请用官方渠道收听。'),
    ],
  });

  const seg = Segmented([
    { value: 'all', label: `全部 ${all.length}` },
    ...[1, 2, 3, 4].map((s) => ({ value: String(s), label: `S${s} ${all.filter((l) => l.section === s).length}` })),
  ], { value: filter, onChange: (v) => { filter = v as typeof filter; render(); } });

  render();
  mount(el, head, h('div', { class: 'row row-wrap', style: 'gap:10px;margin:var(--sp-4) 0' }, seg), listHost);
}

/* ==========================================================================
   精听播放器 + 答题
   ========================================================================== */
export function listeningDetailView(el: HTMLElement, ctx: ModuleCtx, item: ListeningRow, backHash = '#/inspire/ielts/listening'): void {
  const lines = Array.isArray(item.lines) ? item.lines : [];
  const questions = Array.isArray(item.questions) ? item.questions : [];
  const meta = SECTION_META[item.section as 1 | 2 | 3 | 4];

  const player = new SpeechPlayer();
  player.load(lines.map((l) => ({ speaker: l.speaker, text: l.text })));
  player.rate = 1;

  let showText = false;
  let currentLine = -1;
  let playCounted = false;

  ctx.setTitle(item.title, `${meta?.label ?? ''} · ${meta?.kind ?? ''}`);
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '听力练习库', hash: backHash },
    { label: item.title },
  ]);

  /* -------- 播放控制 -------- */
  const playBtn = Button('播放', { variant: 'primary', icon: 'speaker', onClick: () => togglePlay() });
  const lineLabel = h('span', { class: 'tiny muted' }, `第 0 / ${lines.length} 句`);
  const textToggle = Button('显示原文', { variant: 'soft', icon: 'book', size: 'sm', onClick: () => { showText = !showText; paintTextToggle(); renderLines(); } });
  const paintTextToggle = () => {
    clear(textToggle);
    textToggle.appendChild(pixelIcon(showText ? 'close' : 'book', 16));
    textToggle.appendChild(document.createTextNode(showText ? ' 隐藏原文' : ' 显示原文'));
  };

  const paintPlay = () => {
    clear(playBtn);
    playBtn.appendChild(pixelIcon(player.playing ? 'close' : 'speaker', 16));
    playBtn.appendChild(document.createTextNode(player.playing ? ' 停止' : ' 播放'));
  };

  const countPlay = () => {
    if (playCounted) return;
    playCounted = true;
    void store.patch('listenings', item.id, { plays: Number(item.plays || 0) + 1 });
  };

  const savePosition = () => {
    const line = player.idx;
    if (line === Number(item.last_line || 0)) return;
    void store.patch('listenings', item.id, { last_line: line });
  };

  function togglePlay(): void {
    if (player.playing) {
      player.stop();
      savePosition();
      paintPlay();
      return;
    }
    const from = Number(item.last_line || 0) > 0 && Number(item.last_line) < lines.length ? Number(item.last_line) : 0;
    player.play(from);
    countPlay();
    paintPlay();
  }

  player.onStateChange = () => paintPlay();
  player.onLine = (i) => {
    currentLine = i;
    lineLabel.textContent = `第 ${i + 1} / ${lines.length} 句`;
    highlight(i);
  };
  player.onDone = () => {
    paintPlay();
    lineLabel.textContent = `已播完（共 ${lines.length} 句）`;
    savePosition();
  };

  const rateSeg = Segmented(RATE_OPTIONS, {
    value: String(player.rate),
    onChange: (v) => {
      player.setRate(Number(v));
      Toast(`播放速度 ${v}×`, 'success');
    },
  });

  /* -------- 原文列表 -------- */
  const linesHost = h('div', { class: 'col', style: 'gap:6px' });
  const lineEls: HTMLElement[] = [];

  const highlight = (i: number) => {
    lineEls.forEach((n, k) => n.classList.toggle('is-active', k === i));
    lineEls[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  function renderLines(): void {
    clear(linesHost);
    lineEls.length = 0;
    lines.forEach((line, i) => {
      const row = h('div', {
        class: `lo-line ${currentLine === i ? 'is-active' : ''}`,
        title: '点击只听这一句',
      });
      const btn = h('button', { class: 'speak-inline', type: 'button', title: '只听这一句' });
      btn.appendChild(pixelIcon('speaker', 15, { color: 'var(--moss-mid)' }));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        player.play(i, true);
        countPlay();
      });
      row.appendChild(btn);

      if (showText) {
        row.appendChild(h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'lo-speaker' }, line.speaker),
          h('div', { class: 'lo-text' }, line.text),
          line.cn ? h('div', { class: 'lo-cn' }, line.cn) : null,
        ));
      } else {
        row.appendChild(h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'lo-speaker' }, `第 ${i + 1} 句 · ${line.speaker}`),
          h('div', { class: 'lo-hidden' }, '•••• •• ••••• •• ••••••• •• •• •••••'),
        ));
      }
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        player.play(i, true);
        countPlay();
      });
      linesHost.appendChild(row);
      lineEls.push(row);
    });
  }

  /* -------- 答题 -------- */
  const answers: Array<number | string> = questions.map(() => '');
  let submitted = false;
  const quizHost = h('div', { class: 'col', style: 'gap:10px' });
  const resultHost = h('div');
  const inputEls: Array<HTMLInputElement | null> = [];
  const optionEls: HTMLButtonElement[][] = [];

  const renderQuiz = () => {
    clear(quizHost);
    inputEls.length = 0;
    optionEls.length = 0;
    questions.forEach((q, qi) => {
      const body: Node[] = [];
      if (q.type === 'choice') {
        const wrap = h('div', { class: 'col', style: 'gap:6px' });
        const buttons: HTMLButtonElement[] = [];
        (q.options ?? []).forEach((opt, oi) => {
          const b = h('button', {
            type: 'button',
            class: `chip ${answers[qi] === oi ? 'is-active' : ''}`.trim(),
            style: 'justify-content:flex-start;text-align:left;width:100%;min-height:38px;border-radius:12px;white-space:normal;height:auto;padding:8px 12px',
          }, `${String.fromCharCode(65 + oi)}. ${opt}`);
          b.addEventListener('click', () => {
            if (submitted) return;
            answers[qi] = oi;
            buttons.forEach((x, k) => x.classList.toggle('is-active', k === oi));
          });
          buttons.push(b);
          wrap.appendChild(b);
        });
        optionEls.push(buttons);
        inputEls.push(null);
        body.push(wrap);
      } else {
        const input = h('input', {
          class: 'input',
          type: 'text',
          placeholder: '输入你听到的答案（1–2 个英文单词）',
          value: String(answers[qi] ?? ''),
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
        }) as HTMLInputElement;
        input.addEventListener('input', () => { answers[qi] = input.value; });
        inputEls.push(input);
        optionEls.push([]);
        body.push(input);
      }
      quizHost.appendChild(h('div', { class: 'card', style: 'padding:14px' },
        h('div', { style: 'font-weight:700;margin-bottom:8px' },
          `第 ${qi + 1} 题`,
          h('span', { class: 'tag tag-line', style: 'margin-left:6px' }, q.type === 'choice' ? '选择' : '填空'),
          h('div', { style: 'font-weight:400;margin-top:6px;font-size:14px' }, q.q),
        ),
        ...body,
      ));
    });
  };

  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');

  const grade = () => {
    const unanswered = answers.filter((a) => a === '' || a === undefined).length;
    if (unanswered) {
      Toast(`还有 ${unanswered} 题没作答`, 'error');
      return;
    }
    submitted = true;
    let right = 0;
    const cards = Array.from(quizHost.children) as HTMLElement[];
    questions.forEach((q, qi) => {
      let ok = false;
      if (q.type === 'choice') {
        ok = Number(answers[qi]) === Number(q.answer);
        (optionEls[qi] ?? []).forEach((b, oi) => {
          b.classList.remove('is-active');
          b.style.cursor = 'default';
          if (oi === Number(q.answer)) {
            b.style.borderColor = 'var(--moss)';
            b.style.background = 'var(--moss-mist)';
            b.style.color = 'var(--moss-mid)';
          } else if (oi === Number(answers[qi])) {
            b.style.borderColor = 'var(--red)';
            b.style.background = 'rgba(214,69,80,.1)';
            b.style.color = 'var(--red)';
          }
        });
      } else {
        ok = norm(answers[qi]) === norm(q.answer) || norm(answers[qi]).includes(norm(q.answer));
        const input = inputEls[qi];
        if (input) {
          input.readOnly = true;
          input.style.borderColor = ok ? 'var(--moss)' : 'var(--red)';
          input.style.background = ok ? 'var(--moss-mist)' : 'rgba(214,69,80,.08)';
        }
      }
      if (ok) right += 1;
      cards[qi]?.appendChild(h('div', { class: 'quote-block', style: 'margin-top:8px;font-size:13px' },
        h('b', null, ok ? '✓ 答对了：' : `✗ 正确答案：${q.type === 'choice' ? String.fromCharCode(65 + Number(q.answer)) : q.answer}　`),
        q.explain,
      ));
    });

    const score = Math.round((right / questions.length) * 100);
    clear(resultHost);
    resultHost.appendChild(h('div', { class: 'card', style: 'padding:14px' },
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '答对', value: `${right}/${questions.length}`, unit: '题', tone: right === questions.length ? 'green' : 'honey', icon: 'check' }),
        Stat({ label: '得分', value: score, unit: '分', tone: score >= 60 ? 'green' : 'red', icon: 'target' }),
        Stat({ label: '判定', value: score >= 60 ? '完成' : '再听一遍', tone: score >= 60 ? 'green' : 'red', icon: score >= 60 ? 'trophy' : 'refresh' }),
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('重做一次', {
          variant: 'soft', icon: 'refresh',
          onClick: () => { submitted = false; answers.fill(''); renderQuiz(); clear(resultHost); },
        }),
        Button(showText ? '隐藏原文' : '显示原文对答案', {
          variant: 'primary', icon: 'book',
          onClick: () => { showText = true; paintTextToggle(); renderLines(); },
        }),
      ),
    ));
    void saveScore(item, score);
  };

  renderLines();
  paintPlay();
  paintTextToggle();
  renderQuiz();

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'speaker',
    title: item.title,
    subtitle: `${meta?.label ?? ''} · ${meta?.speakers ?? ''} · 约 ${estimateMinutes(item)} 分钟 · ${wordCount(item)} 词`,
    actions: [
      Button('返回练习库', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => { player.stop(); ctx.go(backHash); } }),
    ],
    body: [
      h('div', { class: 'tiny muted', style: 'line-height:1.85' }, item.scene),
      h('div', { class: 'row row-wrap', style: 'gap:6px;margin-top:8px' },
        Tag(item.level, 'honey'),
        Tag(`${lines.length} 句`, 'line'),
        Tag(`${questions.length} 题`, 'line'),
        item.done ? Tag(`已完成 ${item.score} 分`, item.score >= 80 ? 'green' : 'honey') : null,
        Tag(`听过 ${Number(item.plays || 0)} 次`, 'line'),
      ),
    ],
  });

  const playerCard = Card({
    icon: 'speaker',
    title: '精听播放器',
    subtitle: '建议先盲听一遍 → 再显示原文 → 然后逐句精听跟读',
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:10px;align-items:center' },
        playBtn,
        Button('重头播放', { variant: 'soft', icon: 'refresh', size: 'sm', onClick: () => { player.play(0); countPlay(); paintPlay(); } }),
        Button('上一句', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => { player.play(Math.max(0, currentLine - 1), true); countPlay(); } }),
        Button('下一句', { variant: 'ghost', icon: 'arrowRight', size: 'sm', onClick: () => { player.play(Math.min(lines.length - 1, currentLine + 1), true); countPlay(); } }),
        textToggle,
      ),
      h('div', { class: 'row row-wrap', style: 'gap:10px;align-items:center;margin-top:10px' },
        h('span', { class: 'tiny muted' }, '语速'),
        rateSeg,
        lineLabel,
      ),
      h('div', { class: 'tiny muted mt-2' },
        '朗读使用你设备的语音合成（不是真人录音）：为了区分说话人，系统会用不同音色/音高替代。'
        + '想练真人口音，请用正版剑桥雅思书附带的官方音频。'),
      SectionTitle('原文', { icon: 'book', extra: h('span', { class: 'tiny muted' }, showText ? '点击任意一句可单独重听' : '已隐藏，点「显示原文」查看') }),
      linesHost,
    ],
  });

  const quizCard = Card({
    icon: 'edit',
    title: `听力题目（${questions.length} 道）`,
    subtitle: '先听完再作答，提交后会显示正确答案与解析',
    body: [
      quizHost,
      h('div', { class: 'mt-3' }, Button('提交并判分', { variant: 'primary', icon: 'check', block: true, onClick: grade })),
      resultHost,
    ],
  });

  const vocabCard = Card({
    icon: 'leaf',
    title: '考点词汇',
    body: (item.vocab ?? []).length
      ? h('div', { class: 'grid grid-2' }, ...(item.vocab ?? []).map((v) => h('div', { class: 'quote-line' },
        (() => {
          const b = h('button', { class: 'speak-inline', type: 'button', title: '朗读' });
          b.appendChild(pixelIcon('speaker', 14, { color: 'var(--moss-mid)' }));
          b.addEventListener('click', (e) => { e.stopPropagation(); speak(v.word, 'en-US', b); });
          return b;
        })(),
        h('span', null, h('b', null, v.word), h('span', { class: 'muted' }, `　${v.meaning}`)),
      )))
      : EmptyState({ icon: 'leaf', title: '暂无词汇' }),
  });

  const tipsCard = Card({
    icon: 'star',
    title: '本段考点提示',
    body: (item.tips ?? []).length
      ? h('ul', { style: 'margin:0;padding-left:1.3em;line-height:2' }, ...(item.tips ?? []).map((t) => h('li', null, t)))
      : EmptyState({ icon: 'star', title: '暂无提示' }),
  });

  mount(el, head, playerCard, quizCard, vocabCard, tipsCard);

  // 离开本页时停止播放
  ctx.onCleanup(() => {
    player.stop();
    savePosition();
  });
}

async function saveScore(item: ListeningRow, score: number): Promise<void> {
  const first = !item.done;
  await store.patch('listenings', item.id, {
    done: score >= 60 ? true : item.done,
    score: Math.max(Number(item.score || 0), score),
    done_at: Date.now(),
  });
  if (score >= 60) {
    const remain = STUDY_DAILY_CAP - coinsOn(today(), 'study');
    if (remain > 0) await award('study', Math.min(0.2, remain), `听力练习：${item.title.slice(0, 14)}`, today());
    await checkAchievements(true);
    Toast(first ? `完成「${item.title.slice(0, 12)}」· ${score} 分` : `本次 ${score} 分（保留最高分）`, 'success');
  } else {
    Toast(`本次 ${score} 分，建议再听一遍后重做`, 'error');
  }
}

/* ==========================================================================
   入口
   ========================================================================== */
export async function renderListening(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const slug = ctx.params[2] ?? '';
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }

  const all = allListenings();
  if (!all.length) {
    ctx.setTitle('听力练习库', '原创雅思风格听力');
    mount(el, Card({
      icon: 'speaker',
      title: '听力练习库正在安装',
      subtitle: '首次进入会自动安装，装好后刷新即可',
      body: EmptyState({
        icon: 'seed',
        title: '还没有听力材料',
        text: '如果长时间停在这里，请刷新页面；或到「设置 → 维护操作 → 重新安装雅思语料」。',
        action: Button('刷新页面', { variant: 'primary', icon: 'refresh', onClick: () => location.reload() }),
      }),
    }));
    return;
  }

  if (!slug) {
    listeningListView(el, ctx);
    return;
  }

  const item = findListening(slug);
  if (!item) {
    mount(el, EmptyState({
      icon: 'search',
      title: '找不到这段听力',
      text: `「${slug}」不存在，可能语料已更新。`,
      action: Button('回到练习库', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go('#/inspire/ielts/listening') }),
    }));
    return;
  }

  listeningDetailView(el, ctx, item);
}

export { IconButton, ListRow, clear, fmtDate };
