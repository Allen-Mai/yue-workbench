/* ==========================================================================
   modules/shelf.ts · 本地书架 + 阅读器
   路由： #/inspire/shelf            书架（导入 / 继续阅读 / 删除）
          #/inspire/shelf/<bookId>   阅读器（目录 / 字号 / 进度记忆）

   ⚠️ 隐私与版权边界（强制）：
   书籍来源只能是「用户从本机主动选择的文件」，解析全部在浏览器内存里完成，
   正文与原始文件只写入本机 IndexedDB（books 表被标记为 LOCAL_ONLY）：
   不上传 Supabase、不写进导出 JSON、不进入代码仓库。应用自身不内置任何书的正文。
   ========================================================================== */

import { h, mount, clear } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, Modal, ProgressBar, SectionTitle, Stat, Tag, Toast, confirmDialog, openForm,
} from '../ui/components';
import * as db from '../core/db';
import { store } from '../core/store';
import { ebook, type ParsedBook } from '../core/ebook';
import { formatBytes } from '../core/image';
import { fmtDate, today } from '../core/date';
import type { BookRow, ModuleCtx } from '../types';

const FORMAT_META: Record<string, { label: string; tone: 'green' | 'honey' | 'line'; icon: string }> = {
  epub: { label: 'EPUB', tone: 'green', icon: 'book' },
  txt: { label: 'TXT', tone: 'line', icon: 'diary' },
  md: { label: 'Markdown', tone: 'line', icon: 'edit' },
  pdf: { label: 'PDF', tone: 'honey', icon: 'image' },
};

async function allBooks(): Promise<BookRow[]> {
  const rows = (await db.all('books')) as unknown as BookRow[];
  return rows.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
}
async function getBook(id: string): Promise<BookRow | undefined> {
  return (await db.get('books', id)) as unknown as BookRow | undefined;
}

interface DirEntryLike {
  kind: string;
  name: string;
  getFile(): Promise<File>;
}
interface DirHandleLike {
  values(): AsyncIterable<DirEntryLike>;
}

/** File System Access API：直接选一个文件夹，一次导入里面所有电子书 */
function supportsFolderPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

async function pickFolder(): Promise<File[]> {
  const picker = (window as unknown as { showDirectoryPicker?: (o?: unknown) => Promise<DirHandleLike> }).showDirectoryPicker;
  if (!picker) return [];
  const dir = await picker({ mode: 'read' });
  const out: File[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue;
    if (!/\.(epub|txt|md|markdown|pdf)$/i.test(entry.name)) continue;
    try {
      out.push(await entry.getFile());
    } catch (err) {
      console.warn('[shelf] 读取文件失败', entry.name, err);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return out;
}

async function importFolder(rerender: () => void): Promise<void> {
  try {
    const files = await pickFolder();
    if (!files.length) {
      Toast('这个文件夹里没有找到 .epub / .txt / .md / .pdf', 'error');
      return;
    }
    await importFiles(files, rerender);
  } catch (err) {
    // 用户取消选择时不报错
    const name = err instanceof Error ? err.name : '';
    if (name !== 'AbortError') Toast(`选择文件夹失败：${err instanceof Error ? err.message : err}`, 'error');
  }
}

/* ------------------------------ 导入 ------------------------------ */
function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.epub,.txt,.md,.markdown,.pdf,application/epub+zip,application/pdf,text/plain,text/markdown';
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

async function importFiles(files: File[], rerender: () => void): Promise<void> {
  if (!files.length) return;
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    Toast(`正在导入 ${i + 1}/${files.length}：${file.name.slice(0, 20)}`, 'default');
    try {
      const parsed: ParsedBook = await ebook.parseBook(file, (msg) => {
        /* 进度提示（大量章节时） */
        void msg;
      });
      const existing = (await db.all('books')) as unknown as BookRow[];
      const dup = existing.find((b) => b.title === parsed.title && Number(b.size) === file.size);
      if (dup) {
        const replace = await confirmDialog(
          '这本书已经在书架里了',
          `《${parsed.title}》已存在（${formatBytes(file.size)}）。要替换为这次导入的版本吗？阅读进度会保留。`,
          { okText: '替换' },
        );
        if (!replace) continue;
      }
      await db.put('books', {
        id: dup?.id,
        title: parsed.title,
        author: parsed.author,
        format: parsed.format,
        cover: parsed.cover,
        chapters: parsed.chapters,
        chars: parsed.chars,
        size: file.size,
        file: parsed.file,
        shelf: '我的书架',
        lastChapter: dup?.lastChapter ?? 0,
        lastScroll: 0,
        progress: dup?.progress ?? 0,
        opened: dup?.opened ?? 0,
        finished: dup?.finished ?? false,
      } as Partial<BookRow>);
      ok += 1;
      if (parsed.warnings.length) console.info('[shelf] 导入提示', parsed.title, parsed.warnings);
    } catch (err) {
      fail += 1;
      console.warn('[shelf] 导入失败', file.name, err);
      Toast(`《${file.name}》导入失败：${err instanceof Error ? err.message : err}`, 'error');
    }
  }
  store.emit('change', 'books');
  if (ok) Toast(`已导入 ${ok} 本${fail ? `，${fail} 本失败` : ''}`, 'success');
  rerender();
}

/* ==========================================================================
   书架
   ========================================================================== */
export async function renderShelf(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const bookId = ctx.params[1] ?? '';
  if (bookId) {
    await renderReader(el, ctx, bookId);
    return;
  }

  ctx.setTitle('我的书架', '本机存储 · 不上传 · 不随部署泄露');
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '我的书架' },
  ]);

  const rerender = () => { void renderShelf(el, ctx); };
  const books = await allBooks();
  const chars = books.reduce((s, b) => s + Number(b.chars || 0), 0);
  const reading = books.find((b) => Number(b.progress || 0) > 0 && !b.finished);

  const importBtn = Button('导入书籍', { variant: 'primary', icon: 'upload', onClick: () => void pickFiles().then((f) => importFiles(f, rerender)) });
  const folderBtn = supportsFolderPicker()
    ? Button('导入整个文件夹', {
      variant: 'soft', icon: 'download',
      title: '一次导入文件夹里的全部电子书（Chrome / Edge 支持）',
      onClick: () => void importFolder(rerender),
    })
    : null;

  const dropZone = h('div', { class: 'shelf-drop' },
    h('div', { style: 'display:flex;justify-content:center;gap:8px;margin-bottom:6px' }, pixelIcon('book', 26), pixelIcon('upload', 22)),
    h('div', null, '把 .epub / .txt / .md / .pdf 拖到这里，或点「导入书籍」选择文件'),
    supportsFolderPicker()
      ? h('div', { class: 'tiny', style: 'margin-top:6px;color:var(--moss-mid)' }, '也可以点「导入整个文件夹」，一次选中一整个书目录')
      : null,
    h('div', { class: 'tiny muted', style: 'margin-top:6px' },
      '解析全部在本机浏览器里完成：正文与原始文件只存你本机的 IndexedDB，不上传云端、不写进导出文件、不进入代码仓库。'),
  );
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-over');
    const files = Array.from((e as DragEvent).dataTransfer?.files ?? []);
    void importFiles(files, rerender);
  });
  dropZone.addEventListener('click', () => void pickFiles().then((f) => importFiles(f, rerender)));

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'book',
    title: '我的书架',
    subtitle: '自己导入的电子书 · 点开就能读 · 记住阅读位置',
    actions: [
      importBtn,
      folderBtn,
      books.length ? Button('全部清空', {
        variant: 'ghost', icon: 'trash', size: 'sm',
        onClick: async () => {
          if (!(await confirmDialog('清空整个书架？', `将删除书架里的 ${books.length} 本书（只删本机数据，原文件仍在你的硬盘上）。`, { danger: true, okText: '清空' }))) return;
          for (const b of books) await db.remove('books', b.id);
          store.emit('change', 'books');
          Toast('书架已清空', 'success');
          rerender();
        },
      }) : null,
    ],
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '书架藏书', value: books.length, unit: '本', tone: 'green', icon: 'book' }),
        Stat({ label: '正文字数', value: chars > 10000 ? `${(chars / 10000).toFixed(1)} 万` : chars, unit: '字', icon: 'edit' }),
        Stat({ label: '本地占用', value: formatBytes(books.reduce((s, b) => s + Number(b.size || 0), 0)), tone: 'oak', icon: 'download' }),
        Stat({ label: '正在读', value: reading ? `第 ${Number(reading.lastChapter || 0) + 1} 章` : '—', tone: 'honey', icon: 'refresh' }),
      ),
      h('div', { class: 'mt-3' }, dropZone),
    ],
  });

  if (!books.length) {
    mount(el, head, EmptyState({
      icon: 'book',
      title: '书架还是空的',
      text: '点「导入书籍」或把文件拖到上面：支持 .epub（会自动解析章节）· .txt / .md（按「第X章」自动切章）· .pdf（用浏览器自带阅读器打开）。',
      action: Button('导入第一本书', { variant: 'primary', icon: 'upload', onClick: () => void pickFiles().then((f) => importFiles(f, rerender)) }),
    }));
    return;
  }

  const cards = h('div', { class: 'grid grid-auto' }, ...books.map((b) => {
    const meta = FORMAT_META[b.format] ?? FORMAT_META.txt;
    const pct = Math.max(0, Math.min(100, Number(b.progress || 0)));
    const card = Card({
      hoverable: true,
      decor: true,
      title: b.title,
      subtitle: b.author ? `${b.author} · ${meta.label}` : meta.label,
      body: [
        h('div', { class: 'shelf-cover' },
          b.cover
            ? h('img', { src: b.cover, alt: '', loading: 'lazy' })
            : h('div', { class: 'shelf-cover-fallback' }, pixelIcon('book', 30), h('span', null, b.title.slice(0, 6))),
        ),
        h('div', { class: 'row row-wrap', style: 'gap:6px;margin:8px 0' },
          Tag(meta.label, meta.tone),
          b.chapters.length ? Tag(`${b.chapters.length} 章`, 'line') : Tag('PDF', 'line'),
          b.chars ? Tag(`${b.chars > 10000 ? `${(b.chars / 10000).toFixed(1)} 万字` : `${b.chars} 字`}`, 'line') : null,
          b.finished ? Tag('已读完', 'green') : null,
        ),
        h('div', { class: 'row', style: 'justify-content:space-between;font-size:12px;color:var(--ink-faint)' },
          h('span', null, b.chapters.length ? `读到第 ${Number(b.lastChapter || 0) + 1}/${b.chapters.length} 章` : `打开过 ${b.opened || 0} 次`),
          h('span', null, `${pct}%`),
        ),
        h('div', { class: 'mt-2' }, ProgressBar(pct)),
      ],
      footer: [
        Button(pct > 0 && !b.finished ? '继续阅读' : '开始阅读', {
          variant: 'primary', size: 'sm', icon: 'book',
          onClick: () => ctx.go(`#/inspire/shelf/${b.id}`),
        }),
        IconButton('edit', {
          title: '修改书名 / 作者',
          onClick: (e) => {
            e.stopPropagation();
            openForm({
              title: '修改书籍信息',
              fields: [
                { name: 'title', label: '书名', value: b.title, required: true, span: 2 },
                { name: 'author', label: '作者', value: b.author, span: 2 },
              ],
              onSubmit: async (v) => {
                await db.patch('books', b.id, { title: String(v.title).trim(), author: String(v.author ?? '').trim() });
                store.emit('change', 'books');
                Toast('已保存', 'success');
                rerender();
              },
            });
          },
        }),
        IconButton('trash', {
          title: '从书架删除',
          onClick: async (e) => {
            e.stopPropagation();
            if (!(await confirmDialog('删除这本书？', `《${b.title}》会从本机书架移除（硬盘上的原文件不受影响）。`, { danger: true, okText: '删除' }))) return;
            await db.remove('books', b.id);
            store.emit('change', 'books');
            Toast('已删除', 'success');
            rerender();
          },
        }),
      ],
    });
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      ctx.go(`#/inspire/shelf/${b.id}`);
    });
    return card;
  }));

  mount(el, head, SectionTitle(`全部藏书（${books.length}）`, { icon: 'list' }), cards);
}

/* ==========================================================================
   阅读器
   ========================================================================== */
async function renderReader(el: HTMLElement, ctx: ModuleCtx, bookId: string): Promise<void> {
  const book = await getBook(bookId);
  if (!book) {
    mount(el, EmptyState({
      icon: 'search',
      title: '找不到这本书',
      action: Button('回到书架', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go('#/inspire/shelf') }),
    }));
    return;
  }

  const chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const isPdf = book.format === 'pdf';
  let chapterIndex = Math.max(0, Math.min(Number(book.lastChapter || 0), Math.max(0, chapters.length - 1)));
  let fontSize = Number(store.setting('readerFontSize', 17));
  let objectUrl = '';

  ctx.setTitle(book.title, book.author || FORMAT_META[book.format]?.label || '');
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '我的书架', hash: '#/inspire/shelf' },
    { label: book.title.length > 14 ? `${book.title.slice(0, 14)}…` : book.title },
  ]);

  /* -------- 进度 -------- */
  const saveProgress = async (extra: Partial<BookRow> = {}) => {
    const pct = chapters.length ? Math.round(((chapterIndex + 1) / chapters.length) * 100) : 100;
    await db.patch('books', book.id, {
      lastChapter: chapterIndex,
      lastScroll: window.scrollY || 0,
      progress: Math.max(Number(book.progress || 0), pct),
      finished: chapters.length ? chapterIndex >= chapters.length - 1 && pct >= 99 : true,
      ...extra,
    });
  };
  await saveProgress({ opened: Number(book.opened || 0) + 1 });

  const contentHost = h('div', { class: 'reader-body', style: `font-size:${fontSize}px` });

  const renderChapter = (restoreScroll: boolean) => {
    clear(contentHost);
    contentHost.style.fontSize = `${fontSize}px`;
    if (!chapters.length) return;
    const ch = chapters[chapterIndex];
    contentHost.appendChild(h('h3', { class: 'reader-chapter-title' }, ch.title));
    for (const para of String(ch.text ?? '').split('\n')) {
      const t = para.trim();
      if (!t) continue;
      contentHost.appendChild(h('p', { class: 'reader-para' }, t));
    }
    if (restoreScroll) {
      const y = Number(book.lastScroll || 0);
      window.setTimeout(() => window.scrollTo({ top: y, behavior: 'auto' }), 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const goChapter = (i: number) => {
    if (i < 0 || i >= chapters.length) return;
    chapterIndex = i;
    renderChapter(false);
    void saveProgress();
    paintNav();
  };

  const navLabel = h('span', { class: 'tiny muted' });
  const paintNav = () => {
    if (isPdf) {
      navLabel.textContent = 'PDF 原版式';
      return;
    }
    navLabel.textContent = `第 ${chapterIndex + 1} / ${chapters.length} 章 · 全书 ${book.chars > 10000 ? `${(book.chars / 10000).toFixed(1)} 万字` : `${book.chars} 字`}`;
  };

  const catalogBtn = Button('目录', {
    variant: 'soft', icon: 'list', size: 'sm',
    onClick: () => {
      if (!chapters.length) { Toast('PDF 没有解析目录', 'default'); return; }
      const listHost = h('div', { class: 'list', style: 'max-height:56vh;overflow:auto' });
      chapters.forEach((c, i) => {
        const row = h('button', {
          type: 'button',
          class: `chip ${i === chapterIndex ? 'is-active' : ''}`.trim(),
          style: 'width:100%;justify-content:flex-start;text-align:left;border-radius:10px;min-height:36px;white-space:normal;height:auto;padding:6px 10px',
        }, `${i + 1}. ${c.title}`);
        row.addEventListener('click', () => { goChapter(i); m.close(); });
        listHost.appendChild(row);
      });
      const m = Modal({ title: `目录（${chapters.length} 章）`, body: listHost, width: 'normal', actions: [{ label: '关闭', variant: 'ghost' }] });
    },
  });

  const fontBtn = Button(`字号 ${fontSize}`, {
    variant: 'ghost', icon: 'edit', size: 'sm',
    onClick: async () => {
      const next = fontSize >= 24 ? 15 : fontSize + 2;
      fontSize = next;
      await store.setSetting('readerFontSize', next);
      contentHost.style.fontSize = `${next}px`;
      clear(fontBtn);
      fontBtn.appendChild(pixelIcon('edit', 16));
      fontBtn.appendChild(document.createTextNode(` 字号 ${next}`));
      Toast(`正文字号 ${next}px`, 'success');
    },
  });

  /* -------- 头部 -------- */
  const head = Card({
    variant: 'green',
    decor: true,
    icon: FORMAT_META[book.format]?.icon ?? 'book',
    title: book.title,
    subtitle: [book.author, FORMAT_META[book.format]?.label, formatBytes(Number(book.size || 0))].filter(Boolean).join(' · '),
    actions: [
      Button('返回书架', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => { void saveProgress().then(() => ctx.go('#/inspire/shelf')); } }),
      catalogBtn,
      fontBtn,
    ],
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:8px;align-items:center' }, navLabel),
      h('div', { class: 'mt-2' }, ProgressBar(chapters.length ? ((chapterIndex + 1) / chapters.length) * 100 : Number(book.progress || 0))),
    ],
  });

  if (isPdf && book.file) {
    objectUrl = URL.createObjectURL(book.file);
    const openNew = Button('在新标签打开', {
      variant: 'primary', icon: 'arrowRight', size: 'sm',
      onClick: () => { window.open(objectUrl, '_blank', 'noopener'); },
    });
    mount(el,
      head,
      Card({
        icon: 'image',
        title: 'PDF 阅读（浏览器自带阅读器）',
        subtitle: '保持原版式；如需更好体验可点「在新标签打开」全屏阅读',
        actions: [openNew],
        body: h('iframe', {
          src: objectUrl,
          title: book.title,
          style: 'width:100%;height:min(78vh,900px);border:1px solid var(--line);border-radius:14px;background:var(--paper-3)',
        }),
        footer: [h('span', { class: 'tiny muted' }, '若上方空白，说明当前浏览器不允许内嵌 PDF 预览，请用「在新标签打开」。')],
      }),
    );
    ctx.onCleanup(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); void saveProgress(); });
    return;
  }

  const chapterNav = h('div', { class: 'row row-wrap', style: 'gap:10px;align-items:center' },
    Button('上一章', { variant: 'soft', icon: 'arrowLeft', size: 'sm', onClick: () => goChapter(chapterIndex - 1) }),
    Button('下一章', { variant: 'primary', icon: 'arrowRight', size: 'sm', onClick: () => goChapter(chapterIndex + 1) }),
    h('span', { class: 'spacer' }),
    chapterIndex >= chapters.length - 1
      ? Button('标记为已读完', {
        variant: 'soft', icon: 'check', size: 'sm',
        onClick: async () => {
          await db.patch('books', book.id, { finished: true, progress: 100 });
          Toast('已标记为读完 🌿', 'success');
        },
      })
      : null,
  );

  paintNav();
  renderChapter(true);

  mount(el,
    head,
    Card({ icon: 'book', title: '正文', actions: [chapterNav], body: contentHost, footer: [
      h('span', { class: 'tiny muted' }, '阅读位置会自动记住；回到书架后点「继续阅读」可从这里接着看。'),
    ] }),
  );

  // 滚动节流保存
  let scrollTimer: number | undefined;
  const onScroll = () => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => { void saveProgress(); }, 1200);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  ctx.onCleanup(() => {
    window.removeEventListener('scroll', onScroll);
    if (scrollTimer) window.clearTimeout(scrollTimer);
    void saveProgress();
  });

  // 键盘翻章
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft' && e.altKey) goChapter(chapterIndex - 1);
    if (e.key === 'ArrowRight' && e.altKey) goChapter(chapterIndex + 1);
  };
  window.addEventListener('keydown', onKey);
  ctx.onCleanup(() => window.removeEventListener('keydown', onKey));
}

export { today, fmtDate };
