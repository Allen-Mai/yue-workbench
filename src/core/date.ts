/* ==========================================================================
   core/date.ts · 日期工具（含 1900–2100 农历换算、纪念日、周/月区间）
   约定：日期一律用 'YYYY-MM-DD' 字符串，时间用 'HH:mm'
   ========================================================================== */

export const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
export const MONTH_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** 本地时间的安全解析（用中午 12:00 规避时区/夏令时边界） */
export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

export function ymd(d: Date | number | string = new Date()): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = typeof d === 'number' ? new Date(d) : d;
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function today(): string {
  return ymd(new Date());
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(date: string, n: number): string {
  const d = parseYmd(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function addMonths(date: string, n: number): string {
  const d = parseYmd(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const max = daysInMonth(d.getFullYear(), d.getMonth() + 1);
  d.setDate(Math.min(day, max));
  return ymd(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 86400000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 当月天数 */
export function daysOfThisMonth(date = today()): number {
  const d = parseYmd(date);
  return daysInMonth(d.getFullYear(), d.getMonth() + 1);
}

export function ym(date = today()): string {
  return String(date).slice(0, 7);
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
  return { start, end };
}

/** 周一为一周开始 */
export function weekStart(date = today()): string {
  const d = parseYmd(date);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return ymd(d);
}

export function weekEnd(date = today()): string {
  return addDays(weekStart(date), 6);
}

/** 形如 2024-W23（用于周维度分组） */
export function weekKey(date = today()): string {
  const ws = weekStart(date);
  const d = parseYmd(ws);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor(diffDays(ws, ymd(jan1)) / 7) + 1;
  return `${d.getFullYear()}-W${pad(week)}`;
}

export function isSameWeek(a: string, b: string): boolean {
  return weekStart(a) === weekStart(b);
}

/* ------------------------------ 展示格式 ------------------------------ */
export function fmtDate(date: string, style: 'full' | 'short' | 'md' | 'cn' = 'md'): string {
  const d = parseYmd(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  switch (style) {
    case 'full':
      return `${y}年${m}月${day}日 周${WEEK_CN[d.getDay()]}`;
    case 'short':
      return `${y}-${pad(m)}-${pad(day)}`;
    case 'cn':
      return `${m}月${day}日`;
    default:
      return `${m}月${day}日 周${WEEK_CN[d.getDay()]}`;
  }
}

export function fmtTime(t: string): string {
  if (!t) return '';
  const [h, mi] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : '晚上';
  return `${suffix} ${String(h).padStart(2, '0')}:${pad(mi || 0)}`;
}

export function relative(date: string): string {
  const n = diffDays(date, today());
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === 2) return '后天';
  if (n === -1) return '昨天';
  if (n === -2) return '前天';
  if (n > 0) return `${n}天后`;
  return `${-n}天前`;
}

export function nowStamp(): string {
  const d = new Date();
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fileStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/* ==========================================================================
   农历：1900–2100
   lunarInfo 每年一个 16 进制数：
     bit 0-3  闰月月份（0 表示无闰月）
     bit 4-15 12/13 个月的大小月（1 = 30 天）
     bit 16   闰月天数（1 = 30 天）
   ========================================================================== */
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];
export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2100;

const LUNAR_MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_CN = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

function leapMonth(y: number): number {
  return LUNAR_INFO[y - LUNAR_MIN_YEAR] & 0xf;
}

function leapDays(y: number): number {
  if (!leapMonth(y)) return 0;
  return (LUNAR_INFO[y - LUNAR_MIN_YEAR] & 0x10000) ? 30 : 29;
}

function monthDays(y: number, m: number): number {
  return (LUNAR_INFO[y - LUNAR_MIN_YEAR] & (0x10000 >> m)) ? 30 : 29;
}

function lunarYearDays(y: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - LUNAR_MIN_YEAR] & i) ? 1 : 0;
  return sum + leapDays(y);
}

/** 农历 → 公历。leap 为 true 时取闰月。越界时回退到当年同月同日。 */
export function lunarToSolar(year: number, month: number, day: number, leap = false): string {
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) {
    return `${year}-${pad(Math.min(12, Math.max(1, month)))}-${pad(Math.min(28, Math.max(1, day)))}`;
  }
  const leapM = leapMonth(year);
  let offset = 0;
  for (let m = 1; m < month; m++) {
    offset += monthDays(year, m);
    if (m === leapM) offset += leapDays(year); // 闰月已在循环中跳过，切勿重复累加
  }
  if (leap && leapM === month) offset += monthDays(year, month); // 取闰月本身：跳过同名平月
  offset += day - 1;

  const base = new Date(LUNAR_MIN_YEAR, 0, 31, 12, 0, 0, 0); // 1900-01-31 = 农历 1900 正月初一
  let remain = 0;
  for (let y = LUNAR_MIN_YEAR; y < year; y++) remain += lunarYearDays(y);
  base.setDate(base.getDate() + remain + offset);
  return ymd(base);
}

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  monthCN: string;
  dayCN: string;
  text: string;
}

/** 公历 → 农历 */
export function solarToLunar(date: string): LunarDate {
  const d = parseYmd(date);
  let offset = diffDays(ymd(d), '1900-01-31'); // 1900-01-31 = 农历 1900 正月初一
  let year = LUNAR_MIN_YEAR;
  for (; year <= LUNAR_MAX_YEAR; year++) {
    const days = lunarYearDays(year);
    if (offset < days) break;
    offset -= days;
  }
  if (offset < 0) offset = 0;

  const leapM = leapMonth(year);
  let month = 1;
  let day = 1;
  let isLeap = false;
  for (; month <= 12; month++) {
    const normal = monthDays(year, month);
    if (offset < normal) {
      day = offset + 1;
      break;
    }
    offset -= normal;
    if (leapM === month) {
      const leap = leapDays(year);
      if (offset < leap) {
        isLeap = true;
        day = offset + 1;
        break;
      }
      offset -= leap;
    }
    day = offset + 1; // 兜底：不应发生（腊月最后一天之后）
  }
  if (month > 12) month = 12;

  const monthCN = `${isLeap ? '闰' : ''}${LUNAR_MONTH_CN[month - 1] ?? month}月`;
  const dayCN = LUNAR_DAY_CN[Math.min(day, 30) - 1] ?? String(day);
  return { year, month, day, isLeap, monthCN, dayCN, text: `${monthCN}${dayCN}` };
}

export function lunarText(date: string): string {
  return solarToLunar(date).text;
}

/** 找到农历生日在 targetYear 年对应的公历日期（无闰月时用平月） */
export function lunarBirthdayInYear(month: number, day: number, targetYear: number): string {
  return lunarToSolar(targetYear, month, day, false);
}

/* ------------------------------ 纪念日 / 周年 ------------------------------ */
export function daysTogether(startYmd: string, ref = today()): number {
  return Math.max(0, diffDays(ref, startYmd)) + 1;
}

export interface NextAnniversary {
  date: string;
  days: number;
  years: number;
  label: string;
}

/** 下一个周年（含 100 天 / 520 天 / 1000 天 等里程碑） */
export function nextAnniversary(startYmd: string, ref = today()): NextAnniversary {
  const passed = diffDays(ref, startYmd);
  const milestones = [100, 200, 365, 520, 730, 1000, 1314, 1500, 2000, 3000];
  let best: NextAnniversary | null = null;
  for (const ms of milestones) {
    if (ms > passed) {
      const date = addDays(startYmd, ms);
      best = { date, days: diffDays(date, ref), years: Math.floor(ms / 365), label: `${ms} 天纪念日` };
      break;
    }
  }
  // 周年
  const d = parseYmd(startYmd);
  let y = parseYmd(ref).getFullYear();
  let date = `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (diffDays(date, ref) < 0) {
    y += 1;
    date = `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const ann: NextAnniversary = {
    date,
    days: diffDays(date, ref),
    years: y - d.getFullYear(),
    label: `${y - d.getFullYear()} 周年纪念日`,
  };
  if (!best || ann.days <= best.days) return ann;
  return best;
}

/* ------------------------------ 通用 ------------------------------ */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function fmtMoney(n: number, digits = 2): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString('zh-CN');
}
