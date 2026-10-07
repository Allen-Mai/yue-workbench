/* ==========================================================================
   main.ts · 应用外壳（左侧固定导航 200px ⇄ 72px + 右侧内容区）
   无 Tab 栏 · 无悬浮窗 · 单页路由分发
   ========================================================================== */

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';

import { h, mount, clear, qs } from './ui/dom';
import { pixelIcon, dogLine } from './ui/icons';
import { initDecor, backgroundDots } from './ui/decor';
import { Banner, Button, IconButton, Modal, Toast } from './ui/components';
import { store, CONTENT_VERSION } from './core/store';
import * as db from './core/db';
import { router, type Route } from './core/router';
import { notify } from './core/notify';
import { push } from './core/push';
import { syncPlantTodos, careInfo } from './core/plants';
import { settleDay, checkPopups, totalCoins } from './core/coins';
import { checkAchievements } from './core/stats';
import { supabase } from './core/supabase';
import { addDays, diffDays, nowTime, today, ymd } from './core/date';
import { modules, getModule } from './modules';
import type { ModuleCtx, ModuleDef } from './types';
import type { Reminder } from './types';

/* ------------------------------ 外壳骨架 ------------------------------ */
let contentEl: HTMLElement;
let navEl: HTMLElement;
let titleEl: HTMLElement;
let subEl: HTMLElement;
let crumbEl: HTMLElement;
let coinEl: HTMLElement;
let cloudEl: HTMLElement;
let cleanups: Array<() => void> = [];
let currentModule: ModuleDef | null = null;

const app = qs<HTMLElement>(document, '#app')!;

function buildShell(): void {
  const brand = h('div', { class: 'sidebar-brand' },
    h('span', { class: 'sidebar-brand-mark' }, pixelIcon('apple', 28)),
    h('span', { class: 'sidebar-brand-text' },
      h('strong', null, '月月的工作台'),
      h('small', null, '像素森系 · 每日生长'),
    ),
  );

  navEl = h('nav', { class: 'sidebar-nav', 'aria-label': '主导航' });

  const foot = h('div', { class: 'sidebar-foot' },
    h('div', { class: 'sidebar-dog' },
      dogLine(34, 'rgba(168,187,160,.9)'),
      h('span', null, '天地通，年月通，日事通，万事皆成！'),
    ),
  );

  const toggle = h('button', { class: 'sidebar-toggle', type: 'button', title: '折叠 / 展开导航', 'aria-label': '折叠导航' }, '‹');
  toggle.addEventListener('click', () => {
    const collapsed = !app.classList.contains('is-collapsed');
    app.classList.toggle('is-collapsed', collapsed);
    toggle.textContent = collapsed ? '›' : '‹';
    void store.setSetting('navCollapsed', collapsed);
  });

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' }, brand, navEl, foot, toggle);

  const hamburger = IconButton('list', {
    title: '导航',
    onClick: () => {
      app.classList.toggle('is-drawer-open');
      scrim.classList.toggle('is-open', app.classList.contains('is-drawer-open'));
    },
  });
  hamburger.classList.add('btn', 'btn-icon', 'topbar-hamburger');

  titleEl = h('div', { class: 'topbar-title' }, '今日中枢');
  subEl = h('div', { class: 'topbar-sub' }, '');
  crumbEl = h('div', { class: 'breadcrumb' });
  coinEl = h('button', {
    class: 'btn btn-sm btn-pixel', type: 'button', title: '金币账户 · 点击查看成就殿堂',
    onClick: () => router.go('#/trophy'),
  });
  cloudEl = h('span', { class: 'tag tag-line', title: '数据存储模式' }, '本地');

  const topbar = h('header', { class: 'topbar' },
    hamburger,
    h('div', { style: 'min-width:0' }, titleEl, subEl, crumbEl),
    h('div', { class: 'topbar-actions' }, cloudEl, coinEl),
  );

  contentEl = h('main', { class: 'content', id: 'content' });

  const scrim = h('div', { class: 'scrim', onClick: () => { app.classList.remove('is-drawer-open'); scrim.classList.remove('is-open'); } });
  scrim.addEventListener('click', () => { app.classList.remove('is-drawer-open'); scrim.classList.remove('is-open'); });

  const main = h('div', { class: 'main' }, topbar, contentEl);

  // 波点背景挂在 #app 之下（z-index:0），保证永远在内容之下、只做装饰
  document.body.insertBefore(backgroundDots(), app);
  mount(app, sidebar, scrim, main);
  contentEl = qs<HTMLElement>(app, '#content')!;
  navEl = qs<HTMLElement>(app, '.sidebar-nav')!;

  if (store.setting('navCollapsed', false)) {
    app.classList.add('is-collapsed');
    toggle.textContent = '›';
  }
}

function refreshCoins(): void {
  const total = totalCoins();
  clear(coinEl);
  coinEl.appendChild(pixelIcon('coin', 14));
  coinEl.appendChild(document.createTextNode(` ${total.toFixed(1)}`));
}

function buildNav(): void {
  clear(navEl);
  const list = modules.filter((m) => !m.single).sort((a, b) => a.order - b.order);
  for (const m of list) {
    const btn = h('button', { class: 'nav-item', type: 'button', dataset: { id: m.id }, title: m.title });
    btn.appendChild(h('span', { class: 'nav-item-icon' }, pixelIcon(m.icon, 22)));
    btn.appendChild(h('span', { class: 'nav-item-label' }, m.title));
    const badge = m.badge?.() ?? 0;
    if (badge > 0) btn.appendChild(h('span', { class: 'nav-item-badge' }, String(badge)));
    btn.addEventListener('click', () => {
      router.go(`#/${m.id}`);
      if (window.innerWidth <= 880) {
        app.classList.remove('is-drawer-open');
        qs(app, '.scrim')?.classList.remove('is-open');
      }
    });
    navEl.appendChild(btn);
  }
  highlightNav();
}

function highlightNav(): void {
  const id = router.moduleId();
  navEl.querySelectorAll<HTMLElement>('.nav-item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === id);
  });
}

/* ------------------------------ 模块上下文 ------------------------------ */
function makeCtx(route: Route): ModuleCtx {
  return {
    params: route.segments.slice(1),
    sub: route.segments[1] ?? '',
    param: route.segments[2] ?? '',
    query: route.query,
    go: (hash) => router.go(hash),
    refresh: async (m) => { await store.refresh(undefined, true); store.emit('change', m ?? '*'); },
    onCleanup: (fn) => cleanups.push(fn),
    setTitle: (title, sub) => {
      clear(titleEl);
      titleEl.appendChild(document.createTextNode(title));
      clear(subEl);
      if (sub) subEl.appendChild(document.createTextNode(sub));
    },
    setBreadcrumb: (items) => {
      clear(crumbEl);
      items.forEach((it, i) => {
        if (i) crumbEl.appendChild(document.createTextNode('／'));
        if (it.hash) {
          const b = h('button', { type: 'button' }, it.label);
          b.addEventListener('click', () => router.go(it.hash!));
          crumbEl.appendChild(b);
        } else {
          crumbEl.appendChild(h('span', null, it.label));
        }
      });
    },
  };
}

/* ------------------------------ 路由分发 ------------------------------ */
async function renderRoute(route: Route): Promise<void> {
  const id = route.segments[0] || 'hub';
  const mod = getModule(id) ?? getModule('hub')!;

  if (currentModule && currentModule !== mod) currentModule.onLeave?.();
  if (currentModule !== mod) {
    for (const fn of cleanups) {
      try { fn(); } catch (err) { console.error(err); }
    }
    cleanups = [];
  }
  currentModule = mod;

  const ctx = makeCtx(route);
  ctx.setTitle(mod.title, mod.desc ?? '');
  ctx.setBreadcrumb([{ label: '工作台' }, { label: mod.title }]);
  highlightNav();

  try {
    await mod.onEnter?.(ctx);
    clear(contentEl);
    await mod.render(contentEl, ctx);
  } catch (err) {
    console.error('[main] 模块渲染失败', err);
    mount(contentEl,
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, '这个板块暂时打了个盹'),
        h('p', { class: 'muted small' }, err instanceof Error ? err.message : String(err)),
        Button('重新加载', { variant: 'primary', icon: 'refresh', onClick: () => void renderRoute(route) }),
      ),
    );
  }
  refreshCoins();
  buildNav();
  document.title = `${mod.title} · 月月的工作台`;
}

/* ------------------------------ 提醒调度 ------------------------------ */
function reminderIsDone(r: Reminder, date: string): boolean {
  return (r.done_dates ?? []).includes(date);
}

function dueDateOf(r: Reminder, ref = today()): string {
  if (!r.date) return '';
  if (r.repeat === 'yearly') {
    const md = r.date.slice(5);
    const candidate = `${ref.slice(0, 4)}-${md}`;
    return diffDays(candidate, ref) < 0 ? `${Number(ref.slice(0, 4)) + 1}-${md}` : candidate;
  }
  if (r.repeat === 'monthly') {
    const dd = r.date.slice(8);
    const candidate = `${ref.slice(0, 7)}-${dd}`;
    return diffDays(candidate, ref) < 0 ? addDays(candidate, 32).slice(0, 7) + `-${dd}` : candidate;
  }
  if (r.repeat === 'weekly') {
    const target = new Date(`${r.date}T12:00:00`).getDay();
    const cur = new Date(`${ref}T12:00:00`).getDay();
    const delta = (target - cur + 7) % 7;
    return addDays(ref, delta);
  }
  return r.date;
}

let reminderTimer: number | undefined;
const firedTags = new Set<string>();

function tick(): void {
  const now = new Date();
  const date = today();
  const hhmm = nowTime();
  const reminders = store.list('reminders');

  for (const r of reminders) {
    const due = dueDateOf(r, date);
    if (!due) continue;
    // 写回 next_due：供服务端 cron（/api/cron/reminders）在网页关闭时也能推送
    if (r.next_due !== due) {
      void db.patch('reminders', r.id, { next_due: due }).then(() => store.refresh('reminders', true));
    }
    if (reminderIsDone(r, due)) continue;
    const days = diffDays(due, date);
    const advance = Number(r.advance ?? 0);
    const tag = `rem-${r.id}-${due}-${days === 0 ? 'today' : `pre${advance}`}`;
    if (firedTags.has(tag)) continue;

    const shouldToday = days === 0 && (!r.time || hhmm >= r.time);
    const shouldPre = advance > 0 && days === advance;
    if (!shouldToday && !shouldPre) continue;

    firedTags.add(tag);
    const title = days === 0 ? `⏰ ${r.title}` : `🔔 还有 ${days} 天 · ${r.title}`;
    const body = [r.time ? `时间 ${r.time}` : '', r.contact ? `联系人 ${r.contact}` : '', r.note || '']
      .filter(Boolean).join(' · ') || '别忘了这件事～';
    notify.push({ title, text: body, tone: 'remind', icon: 'remind', system: true, tag, onClick: () => router.go('#/remind') });
  }

  // 植物养护：到点兜底提醒（每天一次）
  const plantTag = `plant-${date}`;
  if (!firedTags.has(plantTag) && hhmm >= '08:00') {
    firedTags.add(plantTag);
    const due = store.list('plants').filter((p) => careInfo(p, date).due);
    if (due.length) notify.push({ title: '🌿 今天有植物要照顾', text: `${due.length} 株植物到养护日了，今日中枢已自动生成待办`, tone: 'remind', icon: 'plant' });
  }

  // 每月 1 日：备份提醒
  if (date.endsWith('-01') && store.setting('backupRemind', true)) {
    const tag = `backup-${date.slice(0, 7)}`;
    if (!firedTags.has(tag)) {
      firedTags.add(tag);
      notify.push({
        title: '📦 该导出备份啦',
        text: '每月 1 日提醒：去「设置 → 导出全部数据」保存一份 JSON 备份吧～',
        tone: 'alert', icon: 'download', system: true, tag,
        onClick: () => router.go('#/settings'),
      });
    }
  }
}

/* ------------------------------ 每日启动任务 ------------------------------ */
async function dailyBoot(): Promise<void> {
  const date = today();
  await store.ensureMonth();
  await syncPlantTodos(date);
  await settleDay(date, true);
  await checkAchievements(true);
  await checkPopups();
  refreshCoins();
}

/* ------------------------------ 云端接管 ------------------------------ */
async function setupCloud(): Promise<void> {
  if (!supabase.configured()) {
    cloudEl.textContent = '本地';
    cloudEl.title = '数据保存在本设备（IndexedDB）· 可在设置中导出备份';
    return;
  }
  const session = supabase.currentSession();
  if (session?.user?.id) {
    await store.enableCloud(supabase.createAdapter(), session.user.id);
    cloudEl.textContent = '云端';
    cloudEl.className = 'tag tag-green';
    cloudEl.title = `已连接 Supabase · ${session.user.email ?? ''}`;
    try {
      const n = await store.syncDown();
      if (n) Toast(`已从云端同步 ${n} 条数据`, 'success');
      await dailyBoot();
    } catch (err) {
      console.warn('[main] 云端同步失败', err);
      Toast('云端同步失败，已继续使用本地数据', 'error');
    }
  } else {
    cloudEl.textContent = '待登录';
    cloudEl.title = '已配置 Supabase，请到「设置」登录以开启云端同步';
  }
}

/* ------------------------------ 安装引导（iOS） ------------------------------ */
function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function maybeInstallHint(): void {
  if (standalone() || store.setting('installHintDismissed', false)) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const box = h('div', { class: 'banner tone-remind', style: 'margin:16px 0' },
    h('span', { class: 'banner-icon' }, pixelIcon('apple', 22)),
    h('div', { class: 'banner-main' },
      h('div', { class: 'banner-title' }, '把工作台装到手机主屏幕'),
      h('div', { class: 'banner-text' },
        isIOS
          ? '在 Safari 中点「分享」→「添加到主屏幕」，即可全屏运行并接收锁屏推送通知。'
          : '在浏览器菜单中选择「安装应用 / 添加到主屏幕」，即可全屏运行并接收系统级通知。'),
    ),
  );
  const close = h('button', { class: 'banner-close', type: 'button' }, '×');
  close.addEventListener('click', () => { box.remove(); void store.setSetting('installHintDismissed', true); });
  box.appendChild(close);
  contentEl.prepend(box);
}

/* ------------------------------ 启动 ------------------------------ */
async function boot(): Promise<void> {
  initDecor();
  buildShell();

  await store.init();
  buildNav();
  await setupCloud();
  await dailyBoot();

  router.on((route) => { void renderRoute(route); });
  router.start();

  // 雅思语料后台增量安装（不阻塞首屏；装好后提示并自动刷新当前页）
  if (Number(store.setting('contentVersion', 1)) < CONTENT_VERSION) {
    void store
      .ensureContent((msg) => Toast(msg))
      .then((res) => {
        if (!res) return;
        Toast(`雅思语料已就绪：${res.words} 个核心词 · ${res.articles} 篇备考文章 · ${res.courses} 门课程 ${res.lessons} 节`, 'success');
        void renderRoute(router.route());
      })
      .catch((err) => {
        console.error('[main] 雅思语料安装失败', err);
        Toast('雅思语料安装失败，稍后会自动重试', 'error');
      });
  }

  store.on('change', () => {
    refreshCoins();
    buildNav();
  });

  reminderTimer = window.setInterval(tick, 60 * 1000);
  window.setTimeout(tick, 4000);
  window.addEventListener('beforeunload', () => { if (reminderTimer) clearInterval(reminderTimer); });

  // Service Worker（离线 + 推送）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then(
        (reg) => {
          reg.addEventListener('updatefound', () => console.info('[sw] 发现新版本，正在更新'));
        },
        (err) => console.warn('[sw] 注册失败', err),
      );
    });
    navigator.serviceWorker.addEventListener('message', (ev) => {
      const data = ev.data as { type?: string; url?: string } | undefined;
      if (data?.type === 'navigate' && data.url) router.go(data.url);
    });
  }

  // 默认开启本地系统通知（需用户授权后才能收到锁屏提醒）
  if (notify.status().permission === 'default' && !store.setting('notifyAsked', false)) {
    await store.setSetting('notifyAsked', true);
    setTimeout(() => {
      Banner({
        title: '开启系统级提醒？',
        text: '开启后，到点的提醒会出现在手机锁屏上。也可以稍后在「设置 → 推送提醒」中开启。',
        icon: 'remind', tone: 'remind', ms: 12000,
        onClick: () => void push.enable().then((r) => Toast(r.message, r.ok ? 'success' : 'error')),
      });
    }, 2600);
  }

  setTimeout(maybeInstallHint, 900);
  setTimeout(() => document.getElementById('splash')?.classList.add('is-hidden'), 620);
  setTimeout(() => document.getElementById('splash')?.remove(), 1600);
}

window.addEventListener('error', (e) => console.error('[global]', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[promise]', e.reason));

void boot();

/* 调试入口：控制台可用 window.__YWB 查看数据 */
(window as unknown as Record<string, unknown>).__YWB = { store, router, notify, push, ymd };
