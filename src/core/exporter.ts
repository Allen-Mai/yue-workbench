/* ==========================================================================
   core/exporter.ts · 数据导出 / 导入（JSON · CSV · TXT）
   ========================================================================== */

import * as db from './db';
import { fileStamp, nowStamp, ymd } from './date';
import type { TableName } from '../types';

export function download(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8'): void {
  const blob = typeof content === 'string' ? new Blob(['\ufeff' + content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1200);
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const head = keys.join(',');
  const body = rows.map((r) => keys.map((k) => csvEscape(r[k])).join(',')).join('\n');
  return `${head}\n${body}`;
}

export const TABLE_LABEL: Record<string, string> = {
  todos: '待办', plants: '植物', plant_logs: '植物日记', inspirations: '灵感内容', quotes: '摘抄',
  words: '单词', word_logs: '单词记录', courses: '雅思课程', lessons: '课程章节',
  listenings: '听力练习', books: '本地书架', accounts: '账户', transactions: '流水', fixed_items: '固定支出',
  shopping: '购买清单', wishes: '心愿', gold_prices: '金价', couple: '情侣信息', couple_logs: '情侣日志',
  memos: '备忘录', reads: '阅读记录', reminders: '提醒', coins: '金币', achievements: '成就',
  settings: '设置', push_subs: '推送订阅',
};

/** 导出全部数据为 JSON（含所有表） */
export async function exportJSON(): Promise<void> {
  const payload = await db.exportAll();
  download(`月月的工作台-全部数据-${fileStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

/** 导出全部数据为 CSV（每张表一个文件） */
export async function exportCSV(table?: TableName): Promise<number> {
  const tables = table ? [table] : db.TABLES;
  let n = 0;
  for (const t of tables) {
    const rows = (await db.all(t)) as unknown as Array<Record<string, unknown>>;
    if (!rows.length) continue;
    const csv = toCSV(rows);
    if (!csv) continue;
    download(`${TABLE_LABEL[t] ?? t}-${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    n++;
    await new Promise((r) => setTimeout(r, 260)); // 浏览器连续下载需要间隔
  }
  return n;
}

/** 导出单表 CSV（用于「导出全部数据」以外的精细导出） */
export async function exportTableCSV(table: TableName): Promise<boolean> {
  const rows = (await db.all(table)) as unknown as Array<Record<string, unknown>>;
  if (!rows.length) return false;
  download(`${TABLE_LABEL[table] ?? table}-${fileStamp()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  return true;
}

export function exportTXT(filename: string, text: string): void {
  download(filename.endsWith('.txt') ? filename : `${filename}.txt`, text, 'text/plain;charset=utf-8');
}

/** 生成可读的纯文本报告（用于打印 / 分享） */
export async function exportReport(): Promise<string> {
  const data = await db.exportAll();
  const lines: string[] = [];
  lines.push('月月的工作台 · 数据报告');
  lines.push(`导出时间：${nowStamp()}`);
  lines.push('');
  for (const [t, rows] of Object.entries(data.tables)) {
    lines.push(`【${TABLE_LABEL[t] ?? t}】共 ${(rows as unknown[]).length} 条`);
    lines.push('');
  }
  return lines.join('\n');
}

/** 选择 JSON 文件并导入 */
export function pickImport(mode: 'merge' | 'replace' = 'merge'): Promise<{ tables: number; rows: number } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (v: { tables: number; rows: number } | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      try {
        const text = await file.text();
        const json = JSON.parse(text) as Record<string, unknown>;
        const res = await db.importAll(json, mode);
        finish(res);
      } catch (err) {
        console.error('[exporter] 导入失败', err);
        finish(null);
      }
    });
    input.click();
  });
}

/** 一键保存文本（分享面板优先） */
export async function shareOrDownload(filename: string, text: string, title = '月月的工作台'): Promise<'shared' | 'downloaded'> {
  try {
    const file = new File([text], filename, { type: 'text/plain;charset=utf-8' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title });
      return 'shared';
    }
  } catch {
    /* 回退下载 */
  }
  download(filename, text);
  return 'downloaded';
}

export function todayFile(prefix: string, ext: string): string {
  return `${prefix}-${ymd()}.${ext}`;
}

export const exporter = { download, toCSV, exportJSON, exportCSV, exportTableCSV, exportTXT, exportReport, pickImport, shareOrDownload, TABLE_LABEL };
