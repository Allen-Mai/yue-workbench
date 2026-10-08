/* ==========================================================================
   core/subtitle.ts · 字幕与时间轴解析（零依赖）
   支持：SRT / WebVTT / 带时间戳的纯文本 / 纯文本原文
   说明：解析只在浏览器内存里进行，不涉及任何第三方内容获取。
   ========================================================================== */

export interface AudioCue {
  /** 开始时间（秒） */
  start: number;
  /** 结束时间（秒） */
  end: number;
  text: string;
}

/* ------------------------------ 时间格式 ------------------------------ */
/** "00:01:23,456" / "01:23.4" / "83" → 秒 */
export function parseTimecode(raw: string): number {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return NaN;
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** 秒 → "mm:ss"（超过 1 小时自动带小时） */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/* ------------------------------ SRT ------------------------------ */
export function parseSrt(raw: string): AudioCue[] {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const cues: AudioCue[] = [];
  // 以空行分块
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0])) i = 1; // 序号行
    const timeLine = lines[i];
    const m = /^(\S+)\s*-->\s*(\S+)/.exec(timeLine ?? '');
    if (!m) continue;
    const start = parseTimecode(m[1]);
    const end = parseTimecode(m[2]);
    const body = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (!Number.isFinite(start) || !body) continue;
    cues.push({ start, end: Number.isFinite(end) ? end : start + 3, text: body });
  }
  return cues;
}

/* ------------------------------ WebVTT ------------------------------ */
export function parseVtt(raw: string): AudioCue[] {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const body = text.replace(/^WEBVTT[^\n]*\n/, '');
  const cues: AudioCue[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let i = 0;
    if (!/-->/.test(lines[0])) i = 1; // 可能的 cue id 行
    const m = /^(\S+)\s*-->\s*(\S+)/.exec(lines[i] ?? '');
    if (!m) continue;
    const start = parseTimecode(m[1]);
    const end = parseTimecode(m[2]);
    const t = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!Number.isFinite(start) || !t) continue;
    cues.push({ start, end: Number.isFinite(end) ? end : start + 3, text: t });
  }
  return cues;
}

/* ------------------------------ 带时间戳的纯文本 ------------------------------ */
/**
 * 每行形如：
 *   [00:12] This is a sentence.
 *   00:12  This is a sentence.
 *   00:00:12.500|This is a sentence.
 */
export function parseTimestampedText(raw: string): AudioCue[] {
  const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n');
  const hits: Array<{ start: number; text: string }> = [];
  const re = /^\s*[[(]?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*[\])]?\s*[|\-–—:：]?\s*(.+)$/;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = re.exec(t);
    if (!m) return []; // 只要有一行不像时间戳，就整体当作无时间轴
    const start = parseTimecode(m[1]);
    const text = m[2].trim();
    if (!Number.isFinite(start) || !text) return [];
    hits.push({ start, text });
  }
  if (hits.length < 2) return [];
  return hits.map((h, i) => ({
    start: h.start,
    end: i + 1 < hits.length ? hits[i + 1].start : h.start + 6,
    text: h.text,
  }));
}

/* ------------------------------ 统一入口 ------------------------------ */
export type SubtitleFormat = 'srt' | 'vtt' | 'timestamped' | 'plain';

export interface ParsedSubtitle {
  format: SubtitleFormat;
  cues: AudioCue[];
  /** 纯文本原文（cues 为空或作为全文使用） */
  transcript: string;
}

export function detectSubtitleFormat(fileName: string): SubtitleFormat {
  const n = fileName.toLowerCase();
  if (n.endsWith('.srt')) return 'srt';
  if (n.endsWith('.vtt')) return 'vtt';
  return 'plain';
}

export function parseSubtitle(raw: string, format: SubtitleFormat): ParsedSubtitle {
  const text = String(raw ?? '').replace(/^\uFEFF/, '');
  if (format === 'srt') {
    const cues = parseSrt(text);
    return { format, cues, transcript: cues.length ? cues.map((c) => c.text).join('\n') : text.trim() };
  }
  if (format === 'vtt') {
    const cues = parseVtt(text);
    return { format, cues, transcript: cues.length ? cues.map((c) => c.text).join('\n') : text.trim() };
  }
  const cues = parseTimestampedText(text);
  if (cues.length) return { format: 'timestamped', cues, transcript: cues.map((c) => c.text).join('\n') };
  return { format: 'plain', cues: [], transcript: text.replace(/\r\n?/g, '\n').trim() };
}

/** 把纯文本按行切成「无时间轴」的假 cues，仅用于逐行显示（不可跳转） */
export function transcriptToLines(transcript: string): string[] {
  return String(transcript ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 当前时间落在哪一条 cue（二分查找） */
export function cueAt(cues: AudioCue[], time: number): number {
  if (!cues.length) return -1;
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return -1;
  // 时间落在两条字幕之间时，仍高亮上一条直到下一条开始
  return found;
}

export const subtitle = {
  parseTimecode, formatTime, parseSrt, parseVtt, parseTimestampedText,
  parseSubtitle, detectSubtitleFormat, transcriptToLines, cueAt,
};
