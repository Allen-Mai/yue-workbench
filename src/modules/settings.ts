/* ==========================================================================
   modules/settings.ts · 设置（外观护眼 · 数据云端 · 导出导入 · 推送 · 金币账户 · 维护）
   契约：CONTRACT.md v10.0 · 像素森系 + 治愈护眼 · 零第三方依赖
   ========================================================================== */

import { h, mount } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, Field, KeyValue, ListRow, ProgressBar, SectionTitle, Segmented, Select, Stat,
  Switch, Tag, Toast, confirmDialog, openForm, promptDialog,
} from '../ui/components';
import { store } from '../core/store';
import * as db from '../core/db';
import { exporter } from '../core/exporter';
import { supabase } from '../core/supabase';
import { notify } from '../core/notify';
import { push, VAPID_PUBLIC_KEY, type PushStatus } from '../core/push';
import { formatBytes } from '../core/image';
import { settleDay, coinsOn } from '../core/coins';
import { checkAchievements } from '../core/stats';
import { daysOfThisMonth, fmtDate, fmtMoney, today, ym } from '../core/date';
import { resetWordAssignment } from './words';
import { ACCOUNT_META, DAILY_BASE, DEFAULT_SETTINGS } from '../data/presets';
import type { AccountKind, ModuleCtx, ModuleDef, TableName } from '../types';

/* ==========================================================================
   0. 通用小工具
   ========================================================================== */

/** 只在模块存活期间有效的本地 UI 状态（不写入数据库） */
interface LocalState {
  region: string;
  loginEmail: string;
  table: TableName;
}
const local: LocalState = { region: '未知', loginEmail: '', table: 'todos' };

/** 模块级渲染上下文（重绘时用最新的 ctx） */
let liveCtx: ModuleCtx | null = null;

/** 数据 / 推送 面板容器（局部重绘用） */
let bodyHost: HTMLElement | null = null;

/** 首次加载异步取到的占用空间（局部重绘时沿用） */
let usageCache: { used: number; quota: number } | null = null;
let usageLoaded = false;
/** 最近一次读取到的推送 / 通知状态 */
let pushStatus: PushStatus = 'default';
let notifyPerm: NotificationPermission | 'unsupported' = 'default';

function msg(err: unknown, fallback = '操作失败，请稍后再试'): string {
  if (err instanceof Error && err.message) return err.message;
  const s = String(err ?? '').trim();
  return s || fallback;
}

/** 外观设置键（严格对齐 data/presets.ts 的 DEFAULT_SETTINGS） */
type AppearanceKey = 'eye' | 'fontSize' | 'round' | 'motion' | 'backupRemind' | 'coinPopup';

function pickSetting<T extends string | boolean>(key: AppearanceKey, fallback: T): T {
  const raw = store.setting<T>(key, fallback);
  return raw === undefined || raw === null ? fallback : raw;
}

/** 写入设置：内部会调用 applyAppearance() 应用 html[data-*] */
async function putSetting(key: AppearanceKey, value: unknown, tip: string): Promise<void> {
  await store.setSetting(key, value);
  Toast(tip, 'success');
}

/* ------------------------------ 局部重绘 ------------------------------ */
function repaint(): void {
  if (!bodyHost || !liveCtx) return;
  const host = bodyHost;
  const ctx = liveCtx;
  try {
    const top = host.offsetTop;
    mount(host, ...renderBody(ctx));
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: Math.max(0, top - 72), behavior: 'auto' });
      } catch {
        window.scrollTo(0, Math.max(0, top - 72));
      }
    });
  } catch (err) {
    console.error('[settings] 局部重绘失败', err);
    Toast(`界面刷新失败：${msg(err)}`, 'error');
  }
}

/** 异步操作的安全包装：任何异常都只提示，不白屏（透传事件参数） */
function guard<A extends unknown[]>(fn: (...args: A) => Promise<void> | void): (...args: A) => void {
  return (...args: A) => {
    void Promise.resolve()
      .then(() => fn(...args))
      .catch((err) => {
        console.error('[settings] 操作失败', err);
        Toast(msg(err), 'error');
      });
  };
}

/* ==========================================================================
   1. 外观 · 护眼
   ========================================================================== */

/* 模块内的样式（只注入一次，全部使用主题 token，无纯白纯黑） */
const PREVIEW_CSS = `
.ywb-2col{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:var(--sp-4)}
@media (max-width:880px){.ywb-2col{grid-template-columns:minmax(0,1fr)}}
.ywb-preview{padding:14px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--paper-2);transition:background var(--dur) var(--ease-soft)}
.ywb-preview-main{font-size:var(--fs);line-height:1.7;color:var(--ink);letter-spacing:.4px}
.ywb-preview-muted{font-size:var(--fs-xs);color:var(--ink-faint);margin-top:6px;line-height:1.6}
.ywb-preview-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--moss-soft);margin-right:6px}
.ywb-preview-sway{display:inline-block;animation:ywbLeafSway 3.6s var(--ease-soft) infinite}
.ywb-swatch{height:56px;border-radius:var(--r-sm);border:1px solid var(--line);display:grid;place-items:center;font-size:var(--fs-xs);letter-spacing:.6px}
.ywb-swatch-soft{background:linear-gradient(160deg,#FDF8EC,#F3E7CE);color:#3D2C1B}
.ywb-swatch-warm{background:linear-gradient(160deg,#F7EEDC,#EFDCBC);color:#40301D}
.ywb-swatch-night{background:linear-gradient(160deg,#32322A,#2A2A22);color:#EDE6D6;border-color:#4E4E43}
@keyframes ywbLeafSway{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
html[data-motion="off"] .ywb-preview-sway{animation:none}
`;

function ensurePreviewStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ywb-settings-style')) return;
  const style = h('style', { id: 'ywb-settings-style' });
  style.textContent = PREVIEW_CSS;
  document.head.appendChild(style);
}

const EYE_LABEL: Record<string, string> = {
  soft: '护眼模式 · 暖纸低蓝光',
  warm: '更暖 · 夜里看更柔和',
  night: '夜间深色 · 关灯也不刺眼',
};

function appearanceCard(): HTMLElement {
  const eye = pickSetting('eye', 'soft');
  const fontSize = pickSetting('fontSize', 'm');
  const round = pickSetting('round', 'soft');
  const motion = pickSetting<string>('motion', 'on') !== 'off';

  const seg = (
    key: 'eye' | 'fontSize' | 'round',
    label: string,
    items: Array<{ value: string; label: string }>,
    value: string,
    tip: string,
    hint?: string,
  ): HTMLElement => Field(label, Segmented(items, {
    value,
    onChange: guard(async (v) => {
      await putSetting(key, v, tip);
      repaint();
    }),
  }), { hint });

  return Card({
    icon: 'sun',
    title: '外观 · 护眼',
    subtitle: '所有设置即时生效，并保存在本机',
    body: [
      seg('eye', '护眼模式', [
        { value: 'soft', label: '暖纸（默认）' },
        { value: 'warm', label: '更暖' },
        { value: 'night', label: '夜间深色' },
      ], eye, '已切换护眼模式', EYE_LABEL[eye] ?? ''),
      seg('fontSize', '字号', [
        { value: 's', label: '小' },
        { value: 'm', label: '中' },
        { value: 'l', label: '大' },
      ], fontSize, '已调整字号', '正文 15–16px 最护眼，长时间阅读建议「中」'),
      seg('round', '圆角', [
        { value: 'soft', label: '柔和' },
        { value: 'sharp', label: '利落' },
      ], round, '已调整圆角'),
      Field('动效', Switch({
        checked: motion,
        label: motion ? '开启（轻柔回弹）' : '已关闭',
        onChange: guard(async (v) => {
          await putSetting('motion', v ? 'on' : 'off', v ? '已开启动效' : '已关闭动效（更省电）');
          repaint();
        }),
      }), { hint: '关闭后停止呼吸/摇摆等循环动画；系统开启「减少动态效果」时也会自动关闭' }),
    ],
    footer: [
      h('div', { class: 'tiny muted' }, '底色始终是暖奶油米黄，文字是深棕，不使用纯白纯黑，眼睛更舒服 🌿'),
    ],
  });
}

function previewCard(): HTMLElement {
  const eyeText: Record<string, string> = { soft: '暖纸', warm: '更暖', night: '夜间' };
  const fsText: Record<string, string> = { s: '小', m: '中', l: '大' };
  const roundText: Record<string, string> = { soft: '柔和', sharp: '利落' };
  const eye = pickSetting('eye', 'soft');
  const fs = pickSetting('fontSize', 'm');
  const rd = pickSetting('round', 'soft');
  const mo = pickSetting<string>('motion', 'on') === 'off' ? '已关闭' : '开启';

  const live = h('div', { class: 'ywb-preview' },
    h('div', { class: 'ywb-preview-main' },
      h('span', { class: 'ywb-preview-sway' }, pixelIcon('leaf', 15)),
      ' 今天也给植物换了水，小茉莉又开了一朵。',
    ),
    h('div', { class: 'ywb-preview-muted' },
      h('span', { class: 'ywb-preview-dot' }),
      '次要文字示例 · 这一行更浅、更小，长时间阅读也不累。',
    ),
    h('div', { class: 'mt-2' }, Tag('像素森系 · 治愈护眼', 'line')),
  );

  const swatch = (cls: string, text: string) => h('div', { class: `ywb-swatch ${cls}` }, text);

  return Card({
    icon: 'sparkle',
    title: '实时预览',
    subtitle: `护眼 ${eyeText[eye] ?? eye} · 字号 ${fsText[fs] ?? fs} · 圆角 ${roundText[rd] ?? rd} · 动效 ${mo}`,
    body: [
      live,
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--sp-2);margin-top:var(--sp-3)' },
        swatch('ywb-swatch-soft', '暖纸 soft'),
        swatch('ywb-swatch-warm', '更暖 warm'),
        swatch('ywb-swatch-night', '夜间 night'),
      ),
      h('div', { class: 'tiny muted mt-3' }, '上面的卡片、按钮、标签都会跟随这些设置一起变化，无需刷新页面。'),
    ],
  });
}

/* ==========================================================================
   2. 数据存储与云端
   ========================================================================== */

function storageInfo(): HTMLElement {
  const used = usageCache?.used ?? 0;
  const quota = usageCache?.quota ?? 0;
  const cloud = store.driveMode === 'cloud';
  return h('div', null,
    h('div', { class: 'row row-wrap' },
      cloud ? Tag('云端模式 · Supabase', 'green') : Tag('本地模式 · IndexedDB', 'line'),
      h('span', { class: 'tiny muted' }, '数据始终先写本机，再自动同步云端'),
    ),
    h('div', { class: 'grid grid-auto mt-3' },
      Stat({ label: '已占用空间', value: usageLoaded ? formatBytes(used) : '读取中…', tone: 'oak', icon: 'chest' }),
      Stat({
        label: '可用配额',
        value: quota ? formatBytes(quota) : '未知',
        tone: 'green',
        icon: 'chart',
      }),
      Stat({ label: '数据表', value: String(db.TABLES.length), unit: '张', tone: 'honey', icon: 'list' }),
      Stat({ label: '当前身份', value: cloud ? '云端账号' : '本机', tone: 'green', icon: 'lock' }),
    ),
    h('div', { class: 'tiny muted mt-2' },
      usageLoaded
        ? '浏览器可能随时清理缓存数据，建议申请持久化存储 + 定期导出备份。'
        : '部分浏览器（如 Safari 隐私模式）不提供存储占用信息，可以用「导出全部数据」查看实际内容。',
    ),
  );
}

/** 未配置 Supabase 时的说明 */
function cloudDisabledBlock(): HTMLElement {
  return h('div', null,
    h('div', { class: 'ywb-preview', style: 'background:var(--moss-mist);border-color:var(--line-green)' },
      h('div', { class: 'small' }, '云端同步尚未开启（未配置 Supabase）'),
      h('div', { class: 'tiny muted mt-2' },
        '把 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 填到 Vercel 的环境变量里，重新部署即可开启云端同步与跨设备共享。',
      ),
      h('div', { class: 'tiny muted mt-2' },
        '在此之前：你的数据已永久保存在本机（IndexedDB），并且随时可以导出 JSON 备份，不会丢。',
      ),
    ),
    h('div', { class: 'row row-wrap mt-3' },
      Button('登录云端', { variant: 'soft', icon: 'lock', disabled: true, title: '未配置 Supabase' }),
      Button('注册账号', { variant: 'ghost', icon: 'plus', disabled: true, title: '未配置 Supabase' }),
    ),
  );
}

function cloudPanel(): HTMLElement {
  if (!supabase.configured()) return cloudDisabledBlock();

  const session = supabase.currentSession();
  const email = supabase.userEmail() ?? session?.user?.email ?? '';
  if (session?.user?.id) {
    /* -------- 已登录 -------- */
    return h('div', null,
      h('div', { class: 'row row-wrap' },
        Tag('已登录', 'green'),
        h('span', { class: 'small' }, email || session.user.id),
        store.driveMode === 'cloud' ? Tag('同步已开启', 'green') : Tag('同步待开启', 'honey'),
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('立即同步', {
          variant: 'primary', icon: 'refresh',
          onClick: guard(async () => {
            if (store.driveMode !== 'cloud') {
              await store.enableCloud(supabase.createAdapter(), session.user.id);
            }
            const n = await store.syncDown();
            await store.refresh();
            Toast(n ? `已同步 ${n} 条云端数据` : '云端已是最新，无需同步', 'success');
            repaint();
          }),
        }),
        Button('退出登录', {
          variant: 'ghost', icon: 'close',
          onClick: guard(async () => {
            await supabase.signOut();
            Toast('已退出登录，正在重新加载…', 'success');
            setTimeout(() => location.reload(), 500);
          }),
        }),
      ),
      h('div', { class: 'tiny muted mt-2' }, '退出后本机数据保留，只是不再与云端双向同步。'),
    );
  }

  /* -------- 未登录：邮箱 + 密码 -------- */
  const emailInput = h('input', {
    class: 'input', type: 'email', placeholder: 'you@example.com', value: local.loginEmail, autocomplete: 'username',
  }) as HTMLInputElement;
  emailInput.addEventListener('input', () => { local.loginEmail = emailInput.value; });

  const passInput = h('input', {
    class: 'input', type: 'password', placeholder: '密码（至少 6 位）', autocomplete: 'current-password',
  }) as HTMLInputElement;

  const readInputs = (): { e: string; p: string } | null => {
    const e = emailInput.value.trim();
    const p = passInput.value;
    if (!e || !p) {
      Toast('请先填写邮箱和密码', 'error');
      return null;
    }
    return { e, p };
  };

  const login = guard(async () => {
    const v = readInputs();
    if (!v) return;
    const s = await supabase.signIn(v.e, v.p);
    await store.enableCloud(supabase.createAdapter(), s.user.id);
    const n = await store.syncDown();
    await store.refresh();
    Toast(n ? `登录成功，已同步 ${n} 条数据` : '登录成功，云端暂时没有新数据', 'success');
    repaint();
  });

  const signup = guard(async () => {
    const v = readInputs();
    if (!v) return;
    const s = await supabase.signUp(v.e, v.p);
    if (!s) {
      Toast('注册成功，请到邮箱确认后再登录', 'success');
      return;
    }
    await store.enableCloud(supabase.createAdapter(), s.user.id);
    await store.syncDown();
    await store.refresh();
    Toast('注册成功，云端同步已开启', 'success');
    repaint();
  });

  const connectTest = guard(async () => {
    Toast('正在检测云端连接…');
    const ok = await supabase.healthcheck();
    Toast(ok ? '云端连接正常 🌿' : '云端暂时连不上，请检查环境变量与网络', ok ? 'success' : 'error');
    repaint();
  });

  return h('div', null,
    h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--sp-2)' },
      Field('邮箱', emailInput),
      Field('密码', passInput, { hint: '密码只发送给 Supabase，本机不保存明文' }),
    ),
    h('div', { class: 'row row-wrap mt-2' },
      Button('登录', { variant: 'primary', icon: 'lock', onClick: login }),
      Button('注册', { variant: 'soft', icon: 'plus', onClick: signup }),
      Button('检测云端连接', { variant: 'ghost', icon: 'link', onClick: connectTest }),
    ),
    h('div', { class: 'tiny muted mt-2' },
      '已配置 Supabase（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 已读取）· 登录后本机数据会与云端合并，按 updated_at 取较新的一份。',
    ),
  );
}

function storageCard(): HTMLElement {
  return Card({
    icon: 'hub',
    title: '数据存储与云端',
    subtitle: store.driveMode === 'cloud' ? '云端 Supabase（本机仍保留完整副本）' : '本地 IndexedDB · 永久保存在本机',
    body: [
      SectionTitle('存储状态', { icon: 'chart' }),
      storageInfo(),
      h('div', { class: 'row row-wrap mt-3' },
        Button('申请持久化存储', {
          variant: 'soft', icon: 'lock',
          onClick: guard(async () => {
            const ok = await db.requestPersist();
            const u = await db.usage();
            usageCache = u;
            usageLoaded = true;
            Toast(
              ok
                ? '已获得持久化授权，浏览器不会自动清理你的数据了'
                : '浏览器未授予持久化：清缓存/换设备时数据可能丢失，请定期导出备份',
              ok ? 'success' : 'error',
            );
            repaint();
          }),
        }),
      ),
      h('div', { class: 'tiny muted mt-2' },
        '浏览器在磁盘紧张时可能清理网站缓存。申请持久化后数据不会被自动清除（除非你手动清理）。',
      ),
      SectionTitle('云端同步 · Supabase', { icon: 'link' }),
      cloudPanel(),
    ],
  });
}

/* ==========================================================================
   3. 导出 / 导入
   ========================================================================== */

function backupCard(): HTMLElement {
  const last = String(store.setting('lastBackupAt', '') ?? '');
  const lastText = last ? `${fmtDate(last.slice(0, 10), 'full')} ${last.slice(11, 16)}` : '还没有备份过';
  const remind = !!store.setting('backupRemind', true);

  const tableOptions = db.TABLES.map((t) => ({ value: t, label: `${exporter.TABLE_LABEL[t] ?? t}（${store.count(t)} 条）` }));
  const tableSel = Select(tableOptions, {
    value: local.table,
    onChange: (v) => { local.table = v as TableName; },
  });

  return Card({
    icon: 'download',
    title: '导出全部数据',
    subtitle: `上次备份：${lastText}`,
    body: [
      h('div', { class: 'row row-wrap' },
        Button('导出全部数据（JSON）', {
          variant: 'primary', icon: 'download',
          onClick: guard(async () => {
            await exporter.exportJSON();
            await store.setSetting('lastBackupAt', new Date().toISOString());
            Toast('已导出全部数据 JSON，请保存到安全的地方', 'success');
            repaint();
          }),
        }),
        Button('导出全部数据（CSV，每表一个文件）', {
          variant: 'soft', icon: 'list',
          onClick: guard(async () => {
            const n = await exporter.exportCSV();
            Toast(
              n
                ? `已导出 ${n} 个 CSV 文件 · 浏览器连续下载需要你允许「下载多个文件」`
                : '没有可导出的数据（所有表都是空的）',
              n ? 'success' : 'error',
            );
          }),
        }),
        Button('导出数据报告（TXT）', {
          variant: 'ghost', icon: 'diary',
          onClick: guard(async () => {
            const text = await exporter.exportReport();
            exporter.download(`月月的工作台-数据报告-${today()}.txt`, text, 'text/plain;charset=utf-8');
            Toast('数据报告已导出', 'success');
          }),
        }),
      ),
      h('div', { class: 'tiny muted mt-2' }, `上次备份时间：${lastText}`),
      h('div', { class: 'tiny muted mt-1' }, 'CSV 每张表一个文件，浏览器可能询问「是否允许下载多个文件」，选择允许即可。'),

      SectionTitle('单表导出', { icon: 'list' }),
      h('div', { class: 'row row-wrap', style: 'align-items:flex-end' },
        h('div', { style: 'min-width:200px;flex:1 1 200px' }, Field('选择数据表', tableSel)),
        Button('导出该表 CSV', {
          variant: 'soft', icon: 'upload',
          onClick: guard(async () => {
            const t = local.table;
            const ok = await exporter.exportTableCSV(t);
            Toast(ok ? `已导出「${exporter.TABLE_LABEL[t] ?? t}」` : `「${exporter.TABLE_LABEL[t] ?? t}」还没有数据`, ok ? 'success' : 'error');
          }),
        }),
      ),

      SectionTitle('导入数据', { icon: 'upload' }),
      h('div', { class: 'row row-wrap' },
        Button('导入 JSON（合并）', {
          variant: 'soft', icon: 'upload',
          onClick: guard(async () => {
            const r = await exporter.pickImport('merge');
            if (!r) {
              Toast('已取消导入，或文件不是本应用导出的 JSON', 'error');
              return;
            }
            await store.refresh();
            Toast(`合并完成：${r.tables} 张表，共 ${r.rows} 行`, 'success');
            repaint();
          }),
        }),
        Button('导入 JSON（替换全部）', {
          variant: 'danger', icon: 'trash',
          onClick: guard(async () => {
            const ok = await confirmDialog(
              '替换全部数据？',
              '导入文件里出现的表会被整表覆盖，本机现有的同表数据将无法恢复。建议先导出一次备份。',
              { danger: true, okText: '继续选择文件' },
            );
            if (!ok) return;
            const r = await exporter.pickImport('replace');
            if (!r) {
              Toast('已取消导入', 'error');
              return;
            }
            await store.refresh();
            Toast(`替换完成：${r.tables} 张表，共 ${r.rows} 行`, 'success');
            repaint();
          }),
        }),
      ),
      h('div', { class: 'tiny muted mt-2' }, '导入的文件来自「导出全部数据（JSON）」，合并模式只新增或覆盖同 id 的行。'),

      SectionTitle('备份提醒', { icon: 'notice' }),
      Field('每月备份提醒', Switch({
        checked: remind,
        label: remind ? '已开启' : '已关闭',
        onChange: guard(async (v) => {
          await putSetting('backupRemind', v, v ? '已开启每月备份提醒' : '已关闭备份提醒');
          repaint();
        }),
      }), { hint: '每月 1 日会推送站内横幅 + 系统通知，提醒你导出一次 JSON 备份' }),
    ],
    footer: [
      h('div', { class: 'tiny muted' }, '备份文件里包含全部表（含照片链接 / dataURL），请妥善保管，不要上传到公开网盘。'),
    ],
  });
}

/* ==========================================================================
   4. 推送提醒（系统级）
   ========================================================================== */

const PUSH_TEXT: Record<string, string> = {
  unsupported: '当前浏览器不支持系统级推送（可能是 iOS Safari 网页版，需先添加到主屏幕）',
  default: '尚未授权：点击下方按钮申请通知权限',
  denied: '权限已被拒绝：请在「系统设置 → 通知 → 月月的工作台」中重新开启',
  granted: '已授权系统通知，但还没有服务器推送订阅（关闭网页后收不到远程推送）',
  subscribed: '已订阅服务器推送，关闭网页 / 锁屏也能收到提醒',
  error: '订阅时出错，可以稍后重试',
};

function pushCard(): HTMLElement {
  const permText: Record<string, string> = {
    unsupported: '浏览器不支持 Notification API',
    default: '未授权',
    denied: '已拒绝',
    granted: '已授权',
  };
  const vapidReady = !!VAPID_PUBLIC_KEY;

  return Card({
    icon: 'remind',
    title: '推送提醒（系统级）',
    subtitle: '锁屏也能收到的提醒',
    body: [
      h('div', { class: 'row row-wrap' },
        Tag(`推送：${pushStatus}`, pushStatus === 'subscribed' ? 'green' : pushStatus === 'denied' || pushStatus === 'error' ? 'red' : 'honey'),
        Tag(`通知权限：${notifyPerm}`, notifyPerm === 'granted' ? 'green' : notifyPerm === 'denied' ? 'red' : 'line'),
        Tag(vapidReady ? 'VAPID 公钥已配置' : 'VAPID 公钥未配置', vapidReady ? 'green' : 'honey'),
      ),
      h('div', { class: 'small mt-3' }, PUSH_TEXT[pushStatus] ?? '状态未知'),
      h('div', { class: 'tiny muted mt-2' },
        vapidReady
          ? '已配置 VAPID：可以订阅服务器推送，即使关闭网页也能收到提醒。'
          : '未配置 VITE_VAPID_PUBLIC_KEY：只能使用本地系统通知，页面关闭后无法收到远程推送（在 Vercel 配置后重新部署即可）。',
      ),
      h('div', { class: 'tiny muted mt-1' },
        `通知权限当前为「${permText[notifyPerm] ?? notifyPerm}」· 站内横幅不需要任何权限，永远可用。`,
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('开启系统级推送', {
          variant: 'primary', icon: 'notice',
          onClick: guard(async () => {
            const r = await push.enable();
            Toast(r.message, r.ok ? 'success' : 'error');
            pushStatus = await push.status();
            notifyPerm = notify.status().permission;
            repaint();
          }),
        }),
        Button('关闭推送', {
          variant: 'soft', icon: 'close',
          onClick: guard(async () => {
            const ok = await push.disable();
            Toast(ok ? '已取消推送订阅' : '取消订阅失败，请稍后重试', ok ? 'success' : 'error');
            pushStatus = await push.status();
            repaint();
          }),
        }),
        Button('发送一条测试通知', {
          variant: 'ghost', icon: 'sparkle',
          onClick: guard(async () => {
            const ok = await notify.system(
              '月月的工作台 · 测试通知',
              '如果你在锁屏看到了这条消息，说明系统级推送已经正常工作 🌿',
            );
            Toast(
              ok ? '已发送，去锁屏看看有没有收到 🌿' : '发送失败：请先开启通知权限（或本机不支持系统通知）',
              ok ? 'success' : 'error',
            );
            notifyPerm = notify.status().permission;
            repaint();
          }),
        }),
      ),
      h('div', { class: 'ywb-preview mt-3', style: 'background:var(--oak-mist);border-color:var(--line)' },
        h('div', { class: 'small' }, 'iPhone / iPad 说明'),
        h('div', { class: 'tiny muted mt-2' },
          'iOS 只允许「已添加到主屏幕」的网页接收锁屏推送：请用 Safari 打开 → 分享 → 添加到主屏幕 → 从主屏幕图标启动 → 再回到这里开启推送。直接在 Safari 标签页里是收不到锁屏通知的（PWA 限制）。',
        ),
      ),
    ],
    footer: [
      h('div', { class: 'tiny muted' }, '提醒时间由「智能提醒中心」和每月 1 日的备份提醒触发，只要页面在后台或已订阅，就能收到通知。'),
    ],
  });
}

/* ==========================================================================
   5. 金币与账户
   ========================================================================== */

function accountCard(): HTMLElement {
  const accounts = store.accounts();
  const daily = store.account('daily');
  const month = ym(today());
  const monthSpend = store
    .list('transactions')
    .filter((t) => t.kind === 'variable' && String(t.date).slice(0, 7) === month)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const quota = Number(daily?.quota ?? 0);

  const rows = accounts.map((a) => {
    const meta = ACCOUNT_META[a.kind];
    const unit = a.kind === 'coin' ? '枚' : '元';
    return ListRow({
      icon: meta?.icon ?? 'wallet',
      title: meta?.name ?? a.kind,
      meta: `${meta?.desc ?? ''} · 本月 ${a.month || '—'}`,
      right: h('span', { class: 'row', style: 'gap:6px' },
        Tag(`${fmtMoney(a.balance)} ${unit}`, a.kind === 'daily' ? 'line' : 'green'),
        IconLabel(a.kind),
      ),
    });
  });

  return Card({
    icon: 'coin',
    title: '金币与账户',
    subtitle: '五个账户相互独立：日常额度、固定支出、收入、金币、心愿',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月可变支出', value: fmtMoney(monthSpend), unit: '元', tone: monthSpend > quota ? 'red' : 'oak', icon: 'money' }),
        Stat({ label: '月额度', value: fmtMoney(quota), unit: '元', tone: 'green', icon: 'target' }),
        Stat({ label: '剩余额度', value: fmtMoney(quota - monthSpend), unit: '元', tone: quota - monthSpend < 0 ? 'red' : 'green', icon: 'wallet' }),
        Stat({ label: '今日金币', value: coinsOn(today()).toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(quota ? (monthSpend / quota) * 100 : 0, monthSpend > quota ? 'red' : undefined)),
      h('div', { class: 'tiny muted mt-2' },
        `月额度 = 当月天数 × ${DAILY_BASE} 元（本月 ${daysOfThisMonth(today())} 天）· 日常账户月标记：${daily?.month ?? '—'}`,
      ),
      h('div', { class: 'list mt-3' }, ...rows),
      h('div', { class: 'row row-wrap mt-3' },
        Button('手动调整账户余额', {
          variant: 'soft', icon: 'edit',
          onClick: () => openForm({
            title: '手动调整账户余额',
            fields: [
              {
                name: 'kind', label: '账户', type: 'select', required: true,
                value: 'daily',
                options: (Object.keys(ACCOUNT_META) as AccountKind[]).map((k) => ({ value: k, label: ACCOUNT_META[k].name })),
              },
              { name: 'amount', label: '金额（正数增加 / 负数减少）', type: 'number', required: true, value: 0, hint: '例如 100 表示 +100，-30 表示 -30' },
              { name: 'note', label: '备注', type: 'textarea', rows: 3, placeholder: '为什么调整？例如：上月结余转入' },
            ],
            submitText: '确认调整',
            onSubmit: async (v) => {
              const kind = String(v.kind) as AccountKind;
              const amount = Number(v.amount);
              if (!Number.isFinite(amount) || amount === 0) {
                Toast('请填写一个非 0 的金额', 'error');
                return;
              }
              const acc = store.account(kind);
              if (!acc) {
                Toast('没有找到这个账户，请先到财富工坊初始化', 'error');
                return;
              }
              await store.adjustBalance(kind, amount);
              const after = store.account(kind);
              Toast(
                `已调整${ACCOUNT_META[kind]?.name ?? kind}：${amount > 0 ? '+' : ''}${fmtMoney(amount)} → 现在 ${fmtMoney(after?.balance ?? 0)}`,
                'success',
              );
              repaint();
            },
          }),
        }),
        Button('重置本月日常额度', {
          variant: 'ghost', icon: 'refresh',
          onClick: guard(async () => {
            const ok = await confirmDialog(
              '重置本月日常额度？',
              `日常账户余额会归零，月额度重新设为当月天数 × ${DAILY_BASE} 元，月标记更新为 ${month}。`,
            );
            if (!ok) return;
            const acc = store.account('daily');
            if (!acc) {
              Toast('日常账户不存在', 'error');
              return;
            }
            await store.patch('accounts', acc.id, {
              balance: 0,
              quota: daysOfThisMonth(today()) * DAILY_BASE,
              month: ym(today()),
            });
            Toast('本月日常额度已重置', 'success');
            repaint();
          }),
        }),
        Button('重新结算今日金币', {
          variant: 'ghost', icon: 'coin',
          onClick: guard(async () => {
            const r = await settleDay(today(), false);
            Toast(r.combos.length ? `今日结算完成：${r.combos.join('、')}` : '今日结算完成（没有新的金币入账）', 'success');
            repaint();
          }),
        }),
        Button('重新检查成就', {
          variant: 'ghost', icon: 'trophy',
          onClick: guard(async () => {
            const list = await checkAchievements(true);
            Toast(list.length ? `解锁了新成就：${list.length} 个 🎉` : '成就检查完成，暂时没有新解锁', 'success');
            repaint();
          }),
        }),
        Button('重置单词分配', {
          variant: 'ghost', icon: 'book',
          onClick: guard(async () => {
            await resetWordAssignment();
            await store.refresh();
            repaint();
          }),
        }),
      ),
      h('div', { class: 'tiny muted mt-2' },
        '手动调整只改账户余额本身，不会记账进流水/金币，也不会影响奖励结算。重置单词分配前会再确认一次。',
      ),
    ],
  });
}

/** 账户行右侧的小图标（纯装饰，不可点击） */
function IconLabel(kind: AccountKind): HTMLElement {
  return h('span', { class: 'tiny muted', title: ACCOUNT_META[kind]?.desc ?? '' }, pixelIcon('check', 13));
}

/* ==========================================================================
   6. 关于 / 维护
   ========================================================================== */

function aboutCard(): HTMLElement {
  const rows: Array<[string, Node | string]> = [
    ['版本', 'v10.0 · 像素森系 + 治愈护眼'],
    ['技术栈', 'Vite + TypeScript（strict）· 原生 DOM · 零第三方运行时依赖'],
    ['数据存储', store.driveMode === 'cloud' ? 'IndexedDB + Supabase（云端同步）' : 'IndexedDB（本机永久保存）'],
    ['设备信息', `${navigator.platform || '未知平台'} · ${navigator.language || 'zh-CN'}`],
    ['数据表', `${db.TABLES.length} 张`],
    ['备份状态', String(store.setting('lastBackupAt', '') ?? '') ? '已有备份记录' : '还没有备份过'],
  ];

  const tableRows = db.TABLES.map((t) => ListRow({
    icon: 'list',
    title: exporter.TABLE_LABEL[t] ?? t,
    meta: t,
    right: Tag(`${store.count(t)} 条`, store.count(t) ? 'green' : 'line'),
  }));

  const tableCount = db.TABLES.length;
  const tableSum = db.TABLES.reduce((s, t) => s + store.count(t), 0);

  return Card({
    icon: 'apple',
    title: '关于 / 维护',
    subtitle: `月月的工作台 · v10.0 · 共 ${tableCount} 张表 / ${tableSum} 条记录`,
    body: [
      KeyValue(rows),
      SectionTitle('数据表清单', { icon: 'list', extra: h('span', { class: 'tiny muted' }, `${tableCount} 张表 · ${tableSum} 条`) }),
      h('div', { class: 'list' }, ...tableRows),
      SectionTitle('维护操作', { icon: 'gear' }),
      h('div', { class: 'row row-wrap' },
        Button('重新加载应用', {
          variant: 'soft', icon: 'refresh',
          onClick: () => location.reload(),
        }),
        Button('重新安装雅思语料', {
          variant: 'soft', icon: 'download',
          title: '重新写入雅思核心词 / 备考文章 / 课程（保留你的学习进度与做题得分）',
          onClick: guard(async () => {
            await store.setSetting('contentVersion', 1);
            const res = await store.ensureContent((m) => Toast(m));
            if (res) {
              Toast(`雅思语料已安装：${res.words} 词 · ${res.articles} 篇文章 · ${res.courses} 门课 ${res.lessons} 节${res.duplicates ? `（合并去重 ${res.duplicates} 条）` : ''}`, 'success');
            } else {
              Toast('语料已是最新版本', 'success');
            }
            repaint();
          }),
        }),
        Button('检查更新', {
          variant: 'soft', icon: 'download',
          onClick: guard(async () => {
            const reg = await navigator.serviceWorker?.getRegistration();
            if (!reg) {
              Toast('还没有注册 Service Worker（首次访问后生效），可以刷新页面重试', 'error');
              return;
            }
            try {
              await reg.update();
              if (reg.waiting) {
                Toast('发现新版本，刷新页面即可使用', 'success');
              } else {
                Toast('已是最新版本 🌿', 'success');
              }
            } catch (err) {
              Toast(`检查更新失败：${msg(err)}`, 'error');
            }
          }),
        }),
      ),
      SectionTitle('危险操作', { icon: 'trash' }),
      h('div', { class: 'ywb-preview', style: 'background:var(--oak-mist);border-color:var(--red-soft)' },
        h('div', { class: 'small' }, '清空所有数据（不可恢复）'),
        h('div', { class: 'tiny muted mt-2' },
          `会删除全部 ${db.TABLES.length} 张表的本地数据（含设置、金币、照片）。执行后无法找回，建议先导出 JSON 备份。`,
        ),
        h('div', { class: 'mt-3' },
          Button('清空所有数据', {
            variant: 'danger', icon: 'trash',
            onClick: guard(async () => {
              const first = await confirmDialog(
                '危险操作：清空所有数据？',
                '所有表的数据都会被删除，包括待办、植物、账目、金币、备忘录与设置。这一步不可撤销。',
                { danger: true, okText: '我已备份，继续' },
              );
              if (!first) return;
              const typed = await promptDialog('最后确认', {
                label: '请输入「清空」两个字以确认',
                placeholder: '清空',
              });
              if (typed === null) {
                Toast('已取消，数据没有变化', 'success');
                return;
              }
              if (typed.trim() !== '清空') {
                Toast('输入不匹配，已取消清空操作', 'error');
                return;
              }
              for (const t of db.TABLES) await db.clear(t);
              Toast('所有数据已清空，正在重新加载…', 'success');
              setTimeout(() => location.reload(), 600);
            }),
          }),
        ),
      ),
    ],
    footer: [
      h('div', { class: 'tiny muted' }, '天地通，年月通，日事通，万事皆成！🌿 数据都在你自己的设备上。'),
    ],
  });
}

/* ==========================================================================
   渲染
   ========================================================================== */

function renderBody(ctx: ModuleCtx): HTMLElement[] {
  return [
    SectionTitle('外观与护眼', { icon: 'leaf' }),
    h('div', { class: 'ywb-2col' },
      appearanceCard(),
      previewCard(),
    ),
    SectionTitle('数据与备份', { icon: 'download' }),
    h('div', { class: 'ywb-2col' },
      h('div', { class: 'col' }, storageCard(), backupCard()),
      h('div', { class: 'col' },
        pushCard(),
        accountCard(),
        Card({
          icon: 'compass',
          title: '使用小贴士',
          variant: 'green',
          body: [
            h('div', { class: 'small' }, '数据永远先写在本机，云端只是多一份同步副本。'),
            h('ul', { class: 'small muted', style: 'margin-top:8px;padding-left:18px;line-height:1.9' },
              h('li', null, '每周导出一次 JSON，换手机时用「导入 JSON（合并）」即可恢复。'),
              h('li', null, '护眼模式建议白天用「暖纸」、晚上用「更暖」或「夜间深色」。'),
              h('li', null, 'iPhone 想收锁屏推送，必须先从主屏幕图标打开应用。'),
            ),
          ],
          footer: [h('span', { class: 'tiny muted' }, ctx.sub ? `当前路径：#/settings/${ctx.sub}` : '当前路径：#/settings')],
        }),
      ),
    ),
    SectionTitle('关于与维护', { icon: 'gear' }),
    aboutCard(),
  ];
}

export const settingsModule: ModuleDef = {
  id: 'settings',
  title: '设置',
  icon: 'settings',
  order: 8,
  desc: '外观护眼 · 数据备份 · 推送 · 账户 · 维护',

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    liveCtx = ctx;
    ensurePreviewStyle();
    ctx.setTitle('设置', '外观护眼 · 数据备份 · 推送 · 账户 · 维护');

    // 先渲染骨架，避免白屏；异步信息随后填入
    const host = h('div', { class: 'col' });
    mount(el, host);
    bodyHost = host;

    try {
      if (!usageCache) usageCache = await db.usage();
      usageLoaded = true;
      pushStatus = await push.status();
      notifyPerm = notify.status().permission;
    } catch (err) {
      console.error('[settings] 读取状态失败', err);
      Toast('部分状态读取失败，显示的信息可能不是最新的', 'error');
    }

    mount(host, ...renderBody(ctx));
  },
};

/* 显式引用，避免「设置项被误删」时默认值静默漂移 */
export const SETTINGS_DEFAULTS = {
  eye: DEFAULT_SETTINGS.eye,
  fontSize: DEFAULT_SETTINGS.fontSize,
  round: DEFAULT_SETTINGS.round,
  motion: DEFAULT_SETTINGS.motion,
  backupRemind: DEFAULT_SETTINGS.backupRemind,
};
