/* ==========================================================================
   core/ebook.ts · 浏览器端电子书解析（零依赖）
   - EPUB：手写 ZIP 解析 + DecompressionStream('deflate-raw') 解压 + DOMParser 抽取正文
   - TXT / MD：按「第X章 / Chapter N」切章，过长自动再切分
   - PDF：不做重排，原样保留 Blob，交给浏览器自带阅读器
   一切都在本机内存里完成，不上传、不落代码库。
   ========================================================================== */

export type BookFormat = 'epub' | 'txt' | 'md' | 'pdf';

export interface BookChapter {
  title: string;
  text: string;
}

export interface ParsedBook {
  title: string;
  author: string;
  format: BookFormat;
  /** 封面 dataURL，可能为空 */
  cover: string;
  chapters: BookChapter[];
  chars: number;
  /** PDF 等二进制格式的原始文件（仅本机保存） */
  file?: Blob;
  warnings: string[];
}

/* ------------------------------ ZIP 解析 ------------------------------ */
interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function u16(dv: DataView, o: number): number { return dv.getUint16(o, true); }
function u32(dv: DataView, o: number): number { return dv.getUint32(o, true); }

function readZipEntries(buf: ArrayBuffer): Map<string, ZipEntry> {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // 从尾部找 EOCD（0x06054b50）
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 EPUB/ZIP 文件（找不到中央目录）');
  const count = u16(dv, eocd + 10);
  let p = u32(dv, eocd + 16);
  const out = new Map<string, ZipEntry>();
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < count; i++) {
    if (u32(dv, p) !== 0x02014b50) break;
    const method = u16(dv, p + 10);
    const compressedSize = u32(dv, p + 20);
    const size = u32(dv, p + 24);
    const nameLen = u16(dv, p + 28);
    const extraLen = u16(dv, p + 30);
    const commentLen = u16(dv, p + 32);
    const localOffset = u32(dv, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    out.set(name, { name, method, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error('当前浏览器不支持 DecompressionStream，请用 Chrome 103+ / Edge / Safari 16.4+');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipFile(buf: ArrayBuffer, entries: Map<string, ZipEntry>, name: string): Promise<Uint8Array | null> {
  const e = entries.get(name);
  if (!e) return null;
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  if (u32(dv, e.localOffset) !== 0x04034b50) return null;
  const nameLen = u16(dv, e.localOffset + 26);
  const extraLen = u16(dv, e.localOffset + 28);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new Error(`不支持的压缩方式：${e.method}`);
}

async function readZipText(buf: ArrayBuffer, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const data = await readZipFile(buf, entries, name);
  if (!data) return null;
  return new TextDecoder('utf-8').decode(data);
}

/* ------------------------------ HTML → 文本 ------------------------------ */
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BR', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'FIGCAPTION', 'TD', 'PRE', 'HR']);

function htmlToText(doc: Document): string {
  const body = doc.body ?? doc.documentElement;
  if (!body) return '';
  body.querySelectorAll('script,style,svg,image,noscript,head').forEach((n) => n.remove());
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const block = BLOCK_TAGS.has(el.tagName.toUpperCase());
    if (block) out.push('\n');
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block) out.push('\n');
  };
  walk(body);
  return out
    .join('')
    .replace(/[ \t\u00a0\u3000]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseXml(text: string, type: 'application/xhtml+xml' | 'text/html' | 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(text, type);
  return doc;
}

/** 取正文里第一个像标题的元素文本（供「无目录」的书判断章节起点） */
function firstHeading(doc: Document): string {
  for (const sel of ['h1', 'h2', 'h3']) {
    const el = doc.querySelector(`body ${sel}, ${sel}`);
    const t = el?.textContent?.replace(/\s+/g, ' ').trim();
    if (t && t.length >= 2 && t.length <= 60) return t;
  }
  return '';
}

/** 解析 EPUB 目录（NCX 或 EPUB3 nav），返回 href(去锚点) → 标题 */
async function buildToc(buf: ArrayBuffer, entries: Map<string, ZipEntry>, opf: Document, items: Map<string, { href: string; type: string; props: string }>, resolve: (h: string) => string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const put = (src: string, title: string) => {
    const key = resolve(src.split('#')[0]);
    const t = String(title ?? '').replace(/\s+/g, ' ').trim();
    if (key && t && !map.has(key)) map.set(key, t);
  };

  let tocPath = '';
  for (const it of items.values()) {
    if (/dtbncx/i.test(it.type) || /\.ncx$/i.test(it.href)) { tocPath = resolve(it.href); break; }
  }
  if (!tocPath) {
    for (const it of items.values()) {
      if (/\bnav\b/i.test(it.props)) { tocPath = resolve(it.href); break; }
    }
  }
  if (!tocPath) return map;

  try {
    const xml = await readZipText(buf, entries, tocPath);
    if (!xml) return map;
    const doc = parseXml(xml, 'application/xml');
    // NCX：<navPoint><navLabel><text>标题</text></navLabel><content src="a.html#x"/>
    for (const np of Array.from(doc.getElementsByTagName('navPoint'))) {
      const src = np.getElementsByTagName('content')[0]?.getAttribute('src') ?? '';
      const text = np.getElementsByTagName('text')[0]?.textContent ?? '';
      if (src) put(src, text);
    }
    // EPUB3 nav：<nav><ol><li><a href="a.html">标题</a>
    if (!map.size) {
      for (const a of Array.from(doc.getElementsByTagName('a'))) {
        const href = a.getAttribute('href') ?? '';
        const text = a.textContent ?? '';
        if (href && !/^https?:/i.test(href)) put(href, text);
      }
    }
  } catch (err) {
    console.warn('[ebook] 目录解析失败', err);
  }
  return map;
}

/* ------------------------------ 长章节切分 ------------------------------ */
const MAX_CHAPTER_CHARS = 18000;

export function splitLongChapters(chapters: BookChapter[]): BookChapter[] {
  const out: BookChapter[] = [];
  for (const ch of chapters) {
    if (ch.text.length <= MAX_CHAPTER_CHARS) {
      out.push(ch);
      continue;
    }
    const paras = ch.text.split('\n');
    let buf: string[] = [];
    let len = 0;
    let part = 1;
    const flush = () => {
      if (!buf.length) return;
      out.push({ title: part === 1 ? ch.title : `${ch.title}（${part}）`, text: buf.join('\n').trim() });
      part += 1;
      buf = [];
      len = 0;
    };
    for (const p of paras) {
      if (len + p.length > MAX_CHAPTER_CHARS) flush();
      buf.push(p);
      len += p.length + 1;
    }
    flush();
  }
  return out.filter((c) => c.text.length > 0);
}

/* ------------------------------ EPUB ------------------------------ */
export async function parseEpub(file: File | Blob, onProgress?: (msg: string) => void): Promise<ParsedBook> {
  const warnings: string[] = [];
  onProgress?.('正在解压 EPUB…');
  const buf = await file.arrayBuffer();
  const entries = readZipEntries(buf);

  const container = await readZipText(buf, entries, 'META-INF/container.xml');
  if (!container) throw new Error('EPUB 缺少 META-INF/container.xml');
  const cdoc = parseXml(container, 'application/xml');
  const rootPath = cdoc.querySelector('rootfile')?.getAttribute('full-path')
    ?? cdoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!rootPath) throw new Error('EPUB 缺少 OPF 路径');
  const opfText = await readZipText(buf, entries, rootPath);
  if (!opfText) throw new Error(`找不到 OPF 文件：${rootPath}`);
  const opf = parseXml(opfText, 'application/xml');
  const baseDir = rootPath.includes('/') ? `${rootPath.slice(0, rootPath.lastIndexOf('/'))}/` : '';
  const resolve = (href: string) => {
    const clean = href.split('#')[0];
    const full = `${baseDir}${clean}`;
    // 处理 ../
    const parts: string[] = [];
    for (const seg of full.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.' && seg !== '') parts.push(seg);
    }
    return parts.join('/');
  };

  const title = opf.querySelector('dc\\:title, title')?.textContent?.trim()
    || opf.getElementsByTagName('dc:title')[0]?.textContent?.trim()
    || fileTitleFallback(file)
    || '未命名书籍';
  const author = opf.querySelector('dc\\:creator, creator')?.textContent?.trim()
    || opf.getElementsByTagName('dc:creator')[0]?.textContent?.trim()
    || '';

  // manifest：id → { href, type, props }
  const items = new Map<string, { href: string; type: string; props: string }>();
  for (const el of Array.from(opf.getElementsByTagName('item'))) {
    const id = el.getAttribute('id') ?? '';
    const href = el.getAttribute('href') ?? '';
    if (id && href) {
      items.set(id, { href, type: el.getAttribute('media-type') ?? '', props: el.getAttribute('properties') ?? '' });
    }
  }
  // spine 顺序
  const spine: string[] = [];
  for (const el of Array.from(opf.getElementsByTagName('itemref'))) {
    const idref = el.getAttribute('idref');
    if (idref) spine.push(idref);
  }
  if (!spine.length) throw new Error('EPUB 的 spine 为空，无法确定阅读顺序');

  onProgress?.(`正在解析正文（0/${spine.length}）…`);
  const tocMap = await buildToc(buf, entries, opf, items, resolve);
  const useToc = tocMap.size > 0;
  const chapters: BookChapter[] = [];
  let current: BookChapter | null = null;
  let idx = 0;
  let mergedPages = 0;
  for (const idref of spine) {
    idx += 1;
    const item = items.get(idref);
    if (!item) continue;
    if (!/xhtml|html|xml/i.test(item.type || item.href)) continue;
    try {
      const href = resolve(item.href);
      const html = await readZipText(buf, entries, href);
      if (!html) continue;
      let doc: Document;
      try {
        doc = parseXml(html, 'application/xhtml+xml');
        if (!doc.body && !doc.querySelector('body')) throw new Error('xhtml 解析异常');
      } catch {
        doc = parseXml(html, 'text/html');
      }
      const text = htmlToText(doc);
      if (text.length < 20) continue; // 封面页 / 空白页

      // 关键：分片式 EPUB 会把一章切成多个 html，TOC 只标了章节起始文件。
      // 有目录时以目录为准（续页并入上一章）；没有目录时才靠正文标题判断。
      const heading = firstHeading(doc);
      const tocTitle = tocMap.get(href);
      const startsNew = useToc ? !!tocTitle : !!heading;

      if (startsNew || !current) {
        current = {
          title: (heading || tocTitle || `第 ${chapters.length + 1} 节`).slice(0, 60),
          text,
        };
        chapters.push(current);
      } else {
        current.text = `${current.text}\n\n${text}`;
        mergedPages += 1;
      }
    } catch (err) {
      warnings.push(`章节解析失败：${item.href}`);
      console.warn('[ebook] 章节解析失败', item.href, err);
    }
    if (idx % 10 === 0) onProgress?.(`正在解析正文（${idx}/${spine.length}）…`);
  }
  if (mergedPages) console.info(`[ebook] 已将 ${mergedPages} 个续页并入所属章节`);

  // 封面：先按 OPF 声明找，再退回「体积够大的第一张图」
  let cover = '';
  try {
    let coverHref = '';
    const metaCover = opf.querySelector('meta[name="cover"]')?.getAttribute('content');
    if (metaCover && items.get(metaCover)) coverHref = items.get(metaCover)!.href;
    if (!coverHref) {
      for (const it of items.values()) {
        if (/^image\//i.test(it.type) && /cover/i.test(it.href)) { coverHref = it.href; break; }
      }
    }
    if (!coverHref) {
      for (const it of items.values()) {
        if (!/^image\//i.test(it.type)) continue;
        const e = entries.get(resolve(it.href));
        if (e && e.size > 8 * 1024) { coverHref = it.href; break; }
      }
    }
    if (coverHref) {
      const data = await readZipFile(buf, entries, resolve(coverHref));
      if (data) cover = await blobToDataUrl(new Blob([data as unknown as BlobPart], { type: mimeOf(coverHref) }), 420);
    }
  } catch (err) {
    console.warn('[ebook] 封面提取失败', err);
  }

  const merged = splitLongChapters(chapters);
  if (!merged.length) throw new Error('没有解析出任何正文（可能是加密或纯图片版 EPUB）');

  return {
    title,
    author,
    format: 'epub',
    cover,
    chapters: merged,
    chars: merged.reduce((s, c) => s + c.text.length, 0),
    warnings,
  };
}

function mimeOf(name: string): string {
  const e = name.toLowerCase();
  if (e.endsWith('.png')) return 'image/png';
  if (e.endsWith('.webp')) return 'image/webp';
  if (e.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function fileTitleFallback(file: File | Blob): string {
  const n = (file as File).name;
  return n ? n.replace(/\.[^.]+$/, '') : '';
}

/** Blob → dataURL：优先缩放到 420px（省空间），失败则退 FileReader，再退手工 base64 */
async function blobToDataUrl(blob: Blob, maxSide = 0): Promise<string> {
  if (maxSide && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 不可用');
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const out = canvas.toDataURL('image/jpeg', 0.82);
      if (out && out.length > 64) return out;
    } catch (err) {
      console.warn('[ebook] 封面缩放失败，改用原图', err);
    }
  }
  try {
    if (typeof FileReader === 'function') {
      const viaReader = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error ?? new Error('FileReader 失败'));
        fr.readAsDataURL(blob);
      });
      if (viaReader && viaReader.length > 32) return viaReader;
    }
  } catch (err) {
    console.warn('[ebook] FileReader 转换失败，改用手工 base64', err);
  }
  // 最后兜底：手工 base64（不依赖 FileReader / canvas）
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(buf.subarray(i, i + CHUNK)));
  }
  const b64 = typeof btoa === 'function' ? btoa(bin) : '';
  if (!b64) return '';
  return `data:${blob.type || 'image/jpeg'};base64,${b64}`;
}

/* ------------------------------ TXT / MD ------------------------------ */
/**
 * 章节标题识别。
 * 注意：这里**不能用 `\b`** —— 中文字符不属于 `\w`，
 * 「第 1 章 起点」中 `章` 之后接空格时 `\b` 永远匹配不上，会导致所有中文章节标题漏识别。
 */
const CHAPTER_RE = /^\s*(第\s*[零一二三四五六七八九十百千两0-9]+\s*[章节卷回部篇集]|Chapter\s+[0-9IVXLC]+|CHAPTER\s+[0-9IVXLC]+|Part\s+[0-9IVXLC]+|序言?|前言|后记|尾声|附录[A-Za-z0-9]?|楔子|引子)(\s|$|[:：、.．·-])/;

export function cleanMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .trim();
}

export function parsePlainText(raw: string, format: 'txt' | 'md', fallbackTitle: string): ParsedBook {
  const text = format === 'md' ? cleanMarkdown(raw) : raw.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  const chapters: BookChapter[] = [];
  let title = fallbackTitle;
  let curTitle = '';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) chapters.push({ title: curTitle || `第 ${chapters.length + 1} 节`, text: body });
    buf = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (t && t.length <= 40 && CHAPTER_RE.test(t)) {
      flush();
      curTitle = t;
      if (!title || title === fallbackTitle) {
        // 第一个章节标题如果是书名级别，仍保留文件名作为书名
      }
      continue;
    }
    buf.push(line);
  }
  flush();

  const finalChapters = chapters.length >= 2
    ? chapters
    : [{ title: fallbackTitle || '正文', text }].filter((c) => c.text.trim().length > 0);

  const merged = splitLongChapters(finalChapters);
  return {
    title: fallbackTitle || '未命名书籍',
    author: '',
    format,
    cover: '',
    chapters: merged,
    chars: merged.reduce((s, c) => s + c.text.length, 0),
    warnings: chapters.length >= 2 ? [] : ['未识别到章节标题，已按整篇导入（阅读器会自动分页）'],
  };
}

/* ------------------------------ 统一入口 ------------------------------ */
export function detectFormat(file: File): BookFormat | null {
  const n = file.name.toLowerCase();
  if (n.endsWith('.epub')) return 'epub';
  if (n.endsWith('.txt')) return 'txt';
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'md';
  if (n.endsWith('.pdf')) return 'pdf';
  if (file.type === 'application/epub+zip') return 'epub';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/')) return 'txt';
  return null;
}

export async function parseBook(file: File, onProgress?: (msg: string) => void): Promise<ParsedBook> {
  const fmt = detectFormat(file);
  if (!fmt) throw new Error(`不支持的文件类型：${file.name}（支持 .epub / .txt / .md / .pdf）`);

  if (fmt === 'pdf') {
    return {
      title: fileTitleFallback(file),
      author: '',
      format: 'pdf',
      cover: '',
      chapters: [],
      chars: 0,
      file,
      warnings: ['PDF 不做重排，阅读时用浏览器自带的 PDF 阅读器打开（保持原版式）。'],
    };
  }
  if (fmt === 'epub') return parseEpub(file, onProgress);
  const raw = await file.text();
  return parsePlainText(raw, fmt, fileTitleFallback(file));
}

export const ebook = { parseBook, detectFormat, parseEpub, parsePlainText, splitLongChapters, cleanMarkdown };
