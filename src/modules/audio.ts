/* ==========================================================================
   modules/audio.ts · 我的听力音频（导入自己的合法音频 + 精听播放器）
   路由： #/inspire/ielts/audio            音频库（导入 / 配对字幕 / 管理）
          #/inspire/ielts/audio/<id>       播放器（变速 / A-B 复读 / 字幕同步 / 进度记忆）

   ⚠️ 版权与隐私边界（强制）：
   音频只能由用户从本机主动选择（自己在正版渠道合法获得的文件）。
   解析与播放全部在浏览器内存里完成，音频 Blob 与字幕只写入本机 IndexedDB
   （audios 表被标记为 LOCAL_ONLY）：不上传 Supabase、不写进导出 JSON、不进入代码仓库。
   应用自身不内置、不下载、不抓取任何音频。
   ========================================================================== */

import { h, mount, clear } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, ProgressBar, SectionTitle, Segmented, Stat,
  Tag, Toast, confirmDialog, openForm,
} from '../ui/components';
import * as db from '../core/db';
import { store } from '../core/store';
import { formatBytes } from '../core/image';
import { subtitle, type AudioCue } from '../core/subtitle';
import type { AudioRow, ModuleCtx } from '../types';

const fmtT = subtitle.formatTime;

/* ------------------------------ 数据 ------------------------------ */
async function allAudios(): Promise<AudioRow[]> {
  const rows = (await db.all('audios')) as unknown as AudioRow[];
  return rows.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
}
async function getAudio(id: string): Promise<AudioRow | undefined> {
  return (await db.get('audios', id)) as unknown as AudioRow | undefined;
}

/* ------------------------------ 导入 ------------------------------ */
const AUDIO_EXT = /\.(mp3|m4a|m4b|mp4|aac|wav|ogg|oga|opus|flac|weba|webm|aiff?|3gp)$/i;
const SUB_EXT = /\.(srt|vtt|txt|md|sbv|ass|ssa)$/i;

function baseName(name: string): string {
  return String(name).replace(/\.[^.]+$/, '').trim().toLowerCase();
}

function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac,.srt,.vtt,.txt,.md';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    let done = false;
    const finish = (files: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('cancel', () => finish([]));
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.click();
  });
}

/** 探测音频时长（失败返回 0，不阻断导入） */
function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('audio');
    let settled = false;
    const done = (v: number) => {
      if (settled) return;
      settled = true;
      try {
        a.removeAttribute('src');
        a.load?.();
      } catch { /* ignore */ }
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v) && v > 0 ? v : 0);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    window.setTimeout(() => done(a.duration), 6000);
    a.src = url;
  });
}

async function importFiles(files: File[], rerender: () => void): Promise<void> {
  if (!files.length) return;
  const audioFiles: File[] = [];
  const subFiles = new Map<string, File>();
  for (const f of files) {
    if (AUDIO_EXT.test(f.name) || f.type.startsWith('audio/')) audioFiles.push(f);
    else if (SUB_EXT.test(f.name)) subFiles.set(baseName(f.name), f);
  }
  if (!audioFiles.length) {
    Toast(subFiles.size
      ? '只选到了字幕文件，请把音频文件一起选中（同名会自动配对）'
      : '没有识别到音频文件（支持 mp3 / m4a / wav / ogg / opus / flac / aac）', 'error');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    Toast(`正在导入 ${i + 1}/${audioFiles.length}：${file.name.slice(0, 22)}`, 'default');
    try {
      const existing = await allAudios();
      const dup = existing.find((r) => r.fileName === file.name && Number(r.size) === file.size);

      // 配对同名字幕
      let cues: AudioCue[] = [];
      let transcript = '';
      let subName = '';
      const sub = subFiles.get(baseName(file.name));
      if (sub) {
        try {
          const raw = await sub.text();
          const parsed = subtitle.parseSubtitle(raw, subtitle.detectSubtitleFormat(sub.name));
          cues = parsed.cues;
          transcript = parsed.transcript;
          subName = sub.name;
        } catch (err) {
          console.warn('[audio] 字幕解析失败', sub.name, err);
        }
      }

      const duration = await probeDuration(file);
      await db.put('audios', {
        id: dup?.id,
        title: dup?.title || file.name.replace(/\.[^.]+$/, ''),
        source: dup?.source ?? '',
        fileName: file.name,
        mime: file.type || 'audio/mpeg',
        size: file.size,
        duration: duration || dup?.duration || 0,
        audio: file,
        cues: cues.length ? cues : (dup?.cues ?? []),
        transcript: transcript || dup?.transcript || '',
        tags: dup?.tags ?? [],
        lastPos: dup?.lastPos ?? 0,
        rate: dup?.rate ?? 1,
        plays: dup?.plays ?? 0,
        finished: dup?.finished ?? false,
        abStart: dup?.abStart ?? 0,
        abEnd: dup?.abEnd ?? 0,
      } as Partial<AudioRow>);
      ok += 1;
      if (subName) console.info(`[audio] 已配对字幕 ${subName}（${cues.length} 条时间轴）`);
    } catch (err) {
      fail += 1;
      console.warn('[audio] 导入失败', file.name, err);
      Toast(`《${file.name}》导入失败：${err instanceof Error ? err.message : err}`, 'error');
    }
  }
  store.emit('change', 'audios');
  if (ok) {
    const paired = Array.from(subFiles.keys()).length;
    Toast(`已导入 ${ok} 个音频${paired ? `，配对字幕 ${paired} 个` : ''}${fail ? `，${fail} 个失败` : ''}`, 'success');
  }
  rerender();
}

/* ==========================================================================
   音频库
   ========================================================================== */
export async function renderAudio(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const id = ctx.params[2] ?? '';
  if (id) {
    await renderAudioPlayer(el, ctx, id);
    return;
  }

  ctx.setTitle('我的听力音频', '导入自己合法持有的音频 · 仅存本机');
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '我的听力音频' },
  ]);

  const rerender = () => { void renderAudio(el, ctx); };
  const rows = await allAudios();
  const totalSec = rows.reduce((s, r) => s + Number(r.duration || 0), 0);
  const withSub = rows.filter((r) => (r.cues?.length ?? 0) > 0).length;

  const importBtn = Button('导入音频（可连字幕一起选）', {
    variant: 'primary', icon: 'upload',
    onClick: () => void pickFiles().then((f) => importFiles(f, rerender)),
  });

  const dropZone = h('div', { class: 'shelf-drop' },
    h('div', { style: 'display:flex;justify-content:center;gap:8px;margin-bottom:6px' }, pixelIcon('speaker', 26), pixelIcon('upload', 22)),
    h('div', null, '把 mp3 / m4a / wav / ogg 拖到这里；同名 .srt / .vtt / .txt 字幕会自动配对'),
    h('div', { class: 'tiny muted', style: 'margin-top:6px' },
      '音频与字幕只写入你本机的 IndexedDB，不上传云端、不写进导出文件、不进入代码仓库。请只导入你在正版渠道合法获得的音频。'),
  );
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-over');
    void importFiles(Array.from((e as DragEvent).dataTransfer?.files ?? []), rerender);
  });
  dropZone.addEventListener('click', () => void pickFiles().then((f) => importFiles(f, rerender)));

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'speaker',
    title: '我的听力音频',
    subtitle: '精听播放器：变速 · A-B 复读 · 字幕同步 · 进度记忆',
    actions: [
      importBtn,
      Button('原创练习库', { variant: 'soft', icon: 'book', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/listening') }),
      rows.length ? Button('全部清空', {
        variant: 'ghost', icon: 'trash', size: 'sm',
        onClick: async () => {
          if (!(await confirmDialog('清空全部音频？', `将删除本机保存的 ${rows.length} 个音频（你硬盘上的原文件不受影响）。`, { danger: true, okText: '清空' }))) return;
          for (const r of rows) await db.remove('audios', r.id);
          store.emit('change', 'audios');
          Toast('已清空', 'success');
          rerender();
        },
      }) : null,
    ],
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '音频数量', value: rows.length, unit: '个', tone: 'green', icon: 'speaker' }),
        Stat({ label: '总时长', value: fmtT(totalSec), icon: 'clock' }),
        Stat({ label: '带字幕时间轴', value: withSub, unit: '个', tone: 'honey', icon: 'list' }),
        Stat({ label: '本地占用', value: formatBytes(rows.reduce((s, r) => s + Number(r.size || 0), 0)), tone: 'oak', icon: 'download' }),
      ),
      h('div', { class: 'mt-3' }, dropZone),
    ],
  });

  if (!rows.length) {
    mount(el, head, EmptyState({
      icon: 'speaker',
      title: '还没有导入音频',
      text: '点「导入音频」选择你合法持有的音频文件。'
        + '如果同时选中同名的 .srt / .vtt 字幕，会自动配对出时间轴 —— 那样就能逐句跳转、A-B 复读、字幕同步高亮。'
        + '没有字幕也可以导入，之后可以粘贴原文或单独导入字幕文件。',
      action: Button('导入音频', { variant: 'primary', icon: 'upload', onClick: () => void pickFiles().then((f) => importFiles(f, rerender)) }),
    }));
    return;
  }

  const cards = h('div', { class: 'grid grid-auto' }, ...rows.map((r) => {
    const cueCount = r.cues?.length ?? 0;
    const pct = Number(r.duration || 0) > 0 ? Math.min(100, Math.round((Number(r.lastPos || 0) / Number(r.duration)) * 100)) : (r.finished ? 100 : 0);
    const card = Card({
      hoverable: true,
      decor: true,
      icon: 'speaker',
      title: r.title,
      subtitle: [r.source, formatBytes(Number(r.size || 0)), Number(r.duration || 0) ? fmtT(Number(r.duration)) : ''].filter(Boolean).join(' · '),
      body: [
        h('div', { class: 'row row-wrap', style: 'gap:6px;margin:6px 0' },
          cueCount ? Tag(`字幕 ${cueCount} 句`, 'green') : (r.transcript ? Tag('有原文·无时间轴', 'line') : Tag('无原文', 'line')),
          r.finished ? Tag('已完成', 'honey') : null,
          Number(r.plays || 0) > 0 ? Tag(`播放 ${r.plays} 次`, 'line') : null,
        ),
        h('div', { class: 'row', style: 'justify-content:space-between;font-size:12px;color:var(--ink-faint)' },
          h('span', null, Number(r.lastPos || 0) > 0 ? `上次听到 ${fmtT(Number(r.lastPos))}` : '还没播放过'),
          h('span', null, `${pct}%`),
        ),
        h('div', { class: 'mt-2' }, ProgressBar(pct)),
      ],
      footer: [
        Button(Number(r.lastPos || 0) > 0 ? '继续精听' : '开始精听', {
          variant: 'primary', size: 'sm', icon: 'speaker',
          onClick: () => ctx.go(`#/inspire/ielts/audio/${r.id}`),
        }),
        IconButton('edit', {
          title: '编辑标题 / 来源 / 原文',
          onClick: (e) => {
            e.stopPropagation();
            openForm({
              title: '音频信息',
              width: 'wide',
              fields: [
                { name: 'title', label: '标题', value: r.title, required: true, span: 2 },
                { name: 'source', label: '来源说明', value: r.source, span: 2, placeholder: '例如：正版新概念英语 第 1 册 Lesson 1' },
                { name: 'tags', label: '标签', type: 'chips', options: ['雅思听力', '精听', '跟读', '新概念', 'BBC', 'TED'], value: r.tags ?? [] },
                { name: 'transcript', label: '原文（每行一句；也可写成 [00:12] 句子 带时间轴）', type: 'textarea', rows: 10, value: r.transcript, span: 2 },
              ],
              onSubmit: async (v) => {
                const parsed = subtitle.parseSubtitle(String(v.transcript ?? ''), 'plain');
                await db.patch('audios', r.id, {
                  title: String(v.title).trim(),
                  source: String(v.source ?? '').trim(),
                  tags: Array.isArray(v.tags) ? (v.tags as string[]) : [],
                  transcript: parsed.transcript,
                  cues: parsed.cues.length ? parsed.cues : (r.cues ?? []),
                });
                store.emit('change', 'audios');
                Toast(parsed.cues.length ? `已保存，并识别出 ${parsed.cues.length} 条时间轴` : '已保存原文', 'success');
                rerender();
              },
            });
          },
        }),
        IconButton('trash', {
          title: '删除',
          onClick: async (e) => {
            e.stopPropagation();
            if (!(await confirmDialog('删除这个音频？', `《${r.title}》会从本机移除（硬盘原文件不受影响）。`, { danger: true, okText: '删除' }))) return;
            await db.remove('audios', r.id);
            store.emit('change', 'audios');
            Toast('已删除', 'success');
            rerender();
          },
        }),
      ],
    });
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      ctx.go(`#/inspire/ielts/audio/${r.id}`);
    });
    return card;
  }));

  mount(el, head, SectionTitle(`全部音频（${rows.length}）`, { icon: 'list' }), cards);
}

/* ==========================================================================
   播放器
   ========================================================================== */
async function renderAudioPlayer(el: HTMLElement, ctx: ModuleCtx, id: string): Promise<void> {
  const row = await getAudio(id);
  if (!row || !row.audio) {
    mount(el, EmptyState({
      icon: 'search',
      title: '找不到这个音频',
      text: '可能是本地数据被清理了。重新导入即可。',
      action: Button('回到音频库', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go('#/inspire/ielts/audio') }),
    }));
    return;
  }

  const cues: AudioCue[] = Array.isArray(row.cues) ? row.cues : [];
  const lines = subtitle.transcriptToLines(row.transcript);

  ctx.setTitle(row.title, row.source || fmtBytes(Number(row.size || 0)));
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '我的听力音频', hash: '#/inspire/ielts/audio' },
    { label: row.title.length > 14 ? `${row.title.slice(0, 14)}…` : row.title },
  ]);

  /* -------- audio 元素 -------- */
  const objectUrl = URL.createObjectURL(row.audio);
  const audioEl = document.createElement('audio');
  audioEl.preload = 'metadata';
  audioEl.src = objectUrl;
  audioEl.playbackRate = Number(row.rate || 1);

  let abStart = Number(row.abStart || 0);
  let abEnd = Number(row.abEnd || 0);
  let countedPlay = false;
  let dragging = false;

  /* -------- 控件 -------- */
  const playBtn = Button('播放', { variant: 'primary', icon: 'speaker', size: 'lg', onClick: () => toggle() });
  const paintPlay = () => {
    clear(playBtn);
    playBtn.appendChild(pixelIcon(audioEl.paused ? 'speaker' : 'close', 18));
    playBtn.appendChild(document.createTextNode(audioEl.paused ? ' 播放' : ' 暂停'));
  };

  const backBtn = Button('-5s', { variant: 'soft', size: 'sm', onClick: () => seek(audioEl.currentTime - 5) });
  const fwdBtn = Button('+5s', { variant: 'soft', size: 'sm', onClick: () => seek(audioEl.currentTime + 5) });

  const range = h('input', {
    type: 'range', min: 0, max: 100, step: 0.1, value: 0,
    class: 'audio-range',
    'aria-label': '播放进度',
  }) as HTMLInputElement;
  range.addEventListener('pointerdown', () => { dragging = true; });
  range.addEventListener('pointerup', () => { dragging = false; });
  range.addEventListener('input', () => {
    const d = Number(audioEl.duration || row.duration || 0);
    if (d > 0) audioEl.currentTime = (Number(range.value) / 100) * d;
    paintTimes();
  });

  const timeLabel = h('span', { class: 'tiny muted' }, '00:00 / 00:00');
  const abZone = h('div', { class: 'audio-ab' });
  const abBar = h('i');

  const paintTimes = () => {
    const d = Number(audioEl.duration || row.duration || 0);
    const c = Number(audioEl.currentTime || 0);
    timeLabel.textContent = `${fmtT(c)} / ${d ? fmtT(d) : '--:--'}`;
    if (!dragging && d > 0) range.value = String((c / d) * 100);
    // A-B 区间可视化
    clear(abZone);
    abZone.appendChild(abBar);
    if (d > 0 && abEnd > abStart) {
      abBar.style.left = `${(abStart / d) * 100}%`;
      abBar.style.width = `${((abEnd - abStart) / d) * 100}%`;
    } else {
      abBar.style.width = '0%';
    }
  };

  const rateSeg = Segmented(
    [0.6, 0.75, 0.9, 1, 1.25, 1.5].map((r) => ({ value: String(r), label: `${r}×` })),
    {
      value: String(row.rate || 1),
      onChange: (v) => {
        audioEl.playbackRate = Number(v);
        void db.patch('audios', row.id, { rate: Number(v) });
        Toast(`播放速度 ${v}×`, 'success');
      },
    },
  );

  const setA = () => {
    abStart = audioEl.currentTime;
    if (abEnd && abEnd <= abStart) abEnd = 0;
    void db.patch('audios', row.id, { abStart, abEnd });
    Toast(`A 点设为 ${fmtT(abStart)}`, 'success');
    paintTimes();
  };
  const setB = () => {
    if (audioEl.currentTime <= abStart) {
      Toast('B 点必须在 A 点之后', 'error');
      return;
    }
    abEnd = audioEl.currentTime;
    void db.patch('audios', row.id, { abStart, abEnd });
    Toast(`B 点设为 ${fmtT(abEnd)}，开始 A-B 循环`, 'success');
    paintTimes();
  };
  const clearAB = () => {
    abStart = 0;
    abEnd = 0;
    void db.patch('audios', row.id, { abStart: 0, abEnd: 0 });
    Toast('已清除 A-B 区间', 'default');
    paintTimes();
  };

  /* -------- 字幕列表 -------- */
  const listHost = h('div', { class: 'col', style: 'gap:6px' });
  const cueEls: HTMLElement[] = [];
  let lastCue = -2;

  const renderText = () => {
    clear(listHost);
    cueEls.length = 0;
    if (cues.length) {
      cues.forEach((c, i) => {
        const active = false;
        const node = h('div', { class: `cue-line ${active ? 'is-active' : ''}`.trim(), title: '点击跳到这一句' },
          h('span', { class: 'cue-time' }, fmtT(c.start)),
          h('span', { class: 'cue-text' }, c.text),
        );
        node.addEventListener('click', () => {
          seek(c.start);
          void audioEl.play().catch(() => undefined);
        });
        listHost.appendChild(node);
        cueEls.push(node);
      });
    } else if (lines.length) {
      lines.forEach((t) => {
        listHost.appendChild(h('div', { class: 'cue-line is-plain' },
          h('span', { class: 'cue-text' }, t),
        ));
      });
    } else {
      listHost.appendChild(EmptyState({
        icon: 'edit',
        title: '还没有原文',
        text: '点上面的「编辑原文」粘贴文本；写成「[00:12] 句子」的形式会自动生成时间轴。也可以单独导入 .srt / .vtt 字幕文件。',
      }));
    }
    paintTimes();
  };

  const seek = (t: number) => {
    const d = Number(audioEl.duration || row.duration || 0);
    const target = Math.max(0, d > 0 ? Math.min(t, d) : t);
    audioEl.currentTime = target;
    paintTimes();
  };

  /* -------- 事件 -------- */
  const onTime = () => {
    paintTimes();
    // A-B 复读
    if (abEnd > abStart && audioEl.currentTime >= abEnd) {
      audioEl.currentTime = abStart;
      return;
    }
    // 字幕高亮
    if (cues.length) {
      const idx = subtitle.cueAt(cues, audioEl.currentTime);
      if (idx !== lastCue) {
        lastCue = idx;
        cueEls.forEach((n, i) => n.classList.toggle('is-active', i === idx));
        cueEls[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  };
  const onPlay = () => {
    paintPlay();
    if (!countedPlay) {
      countedPlay = true;
      void db.patch('audios', row.id, { plays: Number(row.plays || 0) + 1 });
    }
  };
  const onPause = () => { paintPlay(); void savePos(); };
  const onEnded = () => {
    paintPlay();
    void db.patch('audios', row.id, { finished: true, lastPos: 0 });
  };
  const onLoaded = () => {
    if (!row.duration && audioEl.duration) void db.patch('audios', row.id, { duration: audioEl.duration });
    paintTimes();
  };
  const onError = () => Toast('这个音频格式当前浏览器无法播放，可试试转成 mp3 或 m4a', 'error');

  audioEl.addEventListener('timeupdate', onTime);
  audioEl.addEventListener('play', onPlay);
  audioEl.addEventListener('pause', onPause);
  audioEl.addEventListener('ended', onEnded);
  audioEl.addEventListener('loadedmetadata', onLoaded);
  audioEl.addEventListener('error', onError);

  function toggle(): void {
    if (audioEl.paused) void audioEl.play().catch(() => Toast('播放失败，可能是格式不受支持', 'error'));
    else audioEl.pause();
    paintPlay();
  }

  /* -------- 进度保存 -------- */
  let saveTimer: number | undefined;
  const savePos = async () => {
    if (audioEl.ended) return;
    const pos = Number(audioEl.currentTime || 0);
    if (!Number.isFinite(pos)) return;
    await db.patch('audios', row.id, { lastPos: pos });
  };
  const scheduleSave = () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { void savePos(); }, 3000);
  };
  audioEl.addEventListener('timeupdate', scheduleSave);

  /* -------- 字幕 / 原文导入 -------- */
  const importSubtitle = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.vtt,.txt,.md,.sbv,.ass,.ssa';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const raw = await file.text();
        const parsed = subtitle.parseSubtitle(raw, subtitle.detectSubtitleFormat(file.name));
        await db.patch('audios', row.id, { cues: parsed.cues, transcript: parsed.transcript });
        store.emit('change', 'audios');
        Toast(parsed.cues.length
          ? `已导入字幕：${parsed.cues.length} 条时间轴`
          : '已导入原文（未识别到时间戳，只能逐行显示）', 'success');
        void renderAudioPlayer(el, ctx, id);
      } catch (err) {
        Toast(`字幕导入失败：${err instanceof Error ? err.message : err}`, 'error');
      }
    });
    input.click();
  };

  /* -------- 渲染 -------- */
  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'speaker',
    title: row.title,
    subtitle: [row.source, formatBytes(Number(row.size || 0)), Number(row.duration || 0) ? fmtT(Number(row.duration)) : ''].filter(Boolean).join(' · '),
    actions: [
      Button('返回音频库', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => { void savePos().then(() => ctx.go('#/inspire/ielts/audio')); } }),
      Button('导入字幕', { variant: 'soft', icon: 'upload', size: 'sm', onClick: importSubtitle }),
      Button('编辑原文', {
        variant: 'soft', icon: 'edit', size: 'sm',
        onClick: () => openForm({
          title: '原文 / 字幕文本',
          width: 'wide',
          fields: [
            {
              name: 'transcript',
              label: '原文（每行一句；写成「[00:12] 句子」可自动生成时间轴）',
              type: 'textarea', rows: 14, span: 2, value: row.transcript,
            },
          ],
          submitText: '保存原文',
          onSubmit: async (v) => {
            const parsed = subtitle.parseSubtitle(String(v.transcript ?? ''), 'plain');
            await db.patch('audios', row.id, {
              transcript: parsed.transcript,
              cues: parsed.cues.length ? parsed.cues : [],
            });
            store.emit('change', 'audios');
            Toast(parsed.cues.length ? `已保存，识别出 ${parsed.cues.length} 条时间轴` : '已保存原文（无时间轴）', 'success');
            void renderAudioPlayer(el, ctx, id);
          },
        }),
      }),
    ],
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:6px' },
        cues.length ? Tag(`字幕时间轴 ${cues.length} 句`, 'green') : Tag('无时间轴', 'line'),
        ...(row.tags ?? []).map((t) => Tag(t, 'line')),
      ),
    ],
  });

  const playerCard = Card({
    icon: 'speaker',
    title: '精听播放器',
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:10px;align-items:center' }, playBtn, backBtn, fwdBtn, rateSeg),
      h('div', { class: 'audio-track' },
        h('div', { class: 'audio-ab-wrap' }, abZone),
        range,
      ),
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        timeLabel,
        h('div', { class: 'row row-wrap', style: 'gap:6px' },
          Button('设 A', { variant: 'ghost', size: 'sm', icon: 'arrowLeft', onClick: setA }),
          Button('设 B 并循环', { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: setB }),
          Button('清除 A-B', { variant: 'ghost', size: 'sm', onClick: clearAB }),
        ),
      ),
      h('div', { class: 'tiny muted mt-2' },
        '快捷键：空格 播放/暂停 · ← → 快退快进 5 秒 · R 回到开头。'
        + 'A-B 复读：播到你想重复的起点按「设 A」，到终点按「设 B 并循环」，就会一直循环这一段。'),
    ],
  });

  const textCard = Card({
    icon: 'book',
    title: cues.length ? `原文与字幕（${cues.length} 句，点击跳转）` : `原文（${lines.length} 行）`,
    subtitle: cues.length ? '播放时会自动高亮当前句' : '没有时间戳，只能逐行对照阅读',
    body: listHost,
    footer: [h('span', { class: 'tiny muted' }, '把字幕写成「[00:12] 句子」的形式再保存，就能获得逐句跳转与高亮。')],
  });

  renderText();
  paintPlay();
  paintTimes();

  mount(el, head, playerCard, textCard);

  /* -------- 快捷键与清理 -------- */
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(audioEl.currentTime - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(audioEl.currentTime + 5); }
    else if (e.key === 'r' || e.key === 'R') seek(0);
    else if (e.key === '[') setA();
    else if (e.key === ']') setB();
  };
  window.addEventListener('keydown', onKey);

  ctx.onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    if (saveTimer) window.clearTimeout(saveTimer);
    void savePos();
    try {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    } catch { /* ignore */ }
    URL.revokeObjectURL(objectUrl);
  });
}

function fmtBytes(n: number): string {
  return n ? formatBytes(n) : '';
}
