/* ==========================================================================
   modules/trophy.ts · 成就殿堂
   本周金币明细 · 近 7 周金币走势 · 成就徽章墙 · 每周日成就卡片
   28 天打卡热力图 · 统计概览
   ========================================================================== */

import { h, mount } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, Modal, ProgressBar, SectionTitle, Stat, Tag, Toast,
} from '../ui/components';
import { barChart, heatmap, lineChart } from '../ui/charts';
import { store } from '../core/store';
import { FEATURES } from '../core/features';
import { BADGES } from '../data/presets';

/** 成就殿堂展示的徽章：植物养护隐藏时，「植物达人」一并隐藏（定义仍保留在 BADGES 里） */
const VISIBLE_BADGES = FEATURES.plants ? BADGES : BADGES.filter((b) => b.key !== 'plantmaster');
import { activityDays, checkAchievements, computeStats, weekCoinBreakdown } from '../core/stats';
import { totalCoins, weeklyTrend } from '../core/coins';
import { fmtDate, today, weekStart, ymd } from '../core/date';
import { exporter } from '../core/exporter';
import type { BadgeStats } from '../data/presets';
import type { ModuleCtx, ModuleDef } from '../types';

/* ------------------------------ 数据小工具 ------------------------------ */
function coinsOfThisWeek(): number {
  return weekCoinBreakdown().reduce((s, i) => s + i.value, 0);
}

function unlockedCount(): number {
  // 只统计当前可见的徽章，避免「已隐藏的徽章」把分子算多
  const keys = new Set(VISIBLE_BADGES.map((b) => b.key));
  return store.list('achievements').filter((a) => keys.has(String(a.key))).length;
}

function topBreakdownItem(): { label: string; value: number } | null {
  const items = weekCoinBreakdown().filter((i) => i.value > 0);
  if (!items.length) return null;
  return items.reduce((best, it) => (it.value > best.value ? it : best), items[0]);
}

/** 距离解锁还差多少（用于未解锁徽章的进度提示） */
function progressText(key: string, stats: BadgeStats): string {
  switch (key) {
    case 'streak7': return `当前连续 ${stats.streak} / 7 天`;
    case 'streak30': return `当前连续 ${stats.streak} / 30 天`;
    case 'read50': return `已读 ${stats.readCount} / 50 篇`;
    case 'saver': return `已省 ${stats.savedTotal} / 500 元`;
    case 'plantmaster': return `植物记录 ${stats.plantDays} / 30 天`;
    case 'coin100': return `金币 ${stats.coinsTotal.toFixed(1)} / 100 枚`;
    case 'coin500': return `金币 ${stats.coinsTotal.toFixed(1)} / 500 枚`;
    case 'couple100': return `在一起 ${stats.coupleDays} / 100 天`;
    case 'couple365': return `在一起 ${stats.coupleDays} / 365 天`;
    case 'firststep': return '写下第一条记录即可解锁';
    default: return '继续加油';
  }
}

/* ------------------------------ 成就卡片 ------------------------------ */
function cardText(): string {
  const stats = computeStats();
  const top = topBreakdownItem();
  const trend = weeklyTrend(7);
  const lines: string[] = [];
  lines.push('🌿 月月的工作台 · 本周成就卡片');
  lines.push('────────────────────────────');
  lines.push(`统计周起：${weekStart(today())}`);
  lines.push(`生成时间：${today()}`);
  lines.push('');
  lines.push(`本周金币总数：${coinsOfThisWeek().toFixed(1)} 枚`);
  lines.push(`最高单项：${top ? `${top.label} ${top.value.toFixed(1)} 枚` : '本周还没有金币入账'}`);
  lines.push(`连续打卡天数：${stats.streak} 天`);
  lines.push(`解锁徽章数：${unlockedCount()} / ${VISIBLE_BADGES.length}`);
  lines.push('');
  lines.push('【本周金币明细】');
  for (const it of weekCoinBreakdown()) lines.push(`· ${it.label}：${it.value.toFixed(1)} 枚`);
  lines.push('');
  lines.push('【近 7 周走势】');
  for (const t of trend) lines.push(`· ${t.label}：${t.value.toFixed(1)} 枚`);
  lines.push('');
  lines.push('【统计概览】');
  lines.push(`· 连续全勤：${stats.streak} 天`);
  lines.push(`· 累计阅读：${stats.readCount} 篇`);
  lines.push(`· 累计省钱：${stats.savedTotal} 元`);
  if (FEATURES.plants) lines.push(`· 植物记录：${stats.plantDays} 天`);
  lines.push(`· 金币总额：${stats.coinsTotal.toFixed(1)} 枚`);
  lines.push(`· 在一起：${stats.coupleDays} 天`);
  lines.push('');
  lines.push('天地通，年月通，日事通，万事皆成！');
  return lines.join('\n');
}

async function saveCard(): Promise<'shared' | 'downloaded'> {
  const name = `成就卡片-${today()}.txt`;
  const res = await exporter.shareOrDownload(name, cardText(), '月月的工作台 · 成就卡片');
  await store.setSetting('lastWeeklyCard', today());
  return res;
}

function cardPreview(): HTMLElement {
  const stats = computeStats();
  const top = topBreakdownItem();
  return h('div', {
    class: 'card',
    style: 'background:linear-gradient(160deg,var(--card-solid),rgba(240,213,140,.3));border-color:var(--honey)',
  },
    h('div', { class: 'card-body' },
      h('div', { class: 'center mb-2' },
        pixelIcon('crown', 34),
        h('div', { class: 'card-title mt-2' }, '本周成就卡片'),
        h('div', { class: 'tiny muted' }, `${weekStart(today())} ~ ${today()}`),
      ),
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本周金币总数', value: coinsOfThisWeek().toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
        Stat({ label: '最高单项', value: top ? `${top.label} ${top.value.toFixed(1)}` : '暂无', tone: 'green', icon: 'star' }),
        Stat({ label: '连续打卡', value: stats.streak, unit: '天', tone: 'green', icon: 'fire' }),
        Stat({ label: '解锁徽章', value: `${unlockedCount()}/${VISIBLE_BADGES.length}`, unit: '个', tone: 'honey', icon: 'trophy' }),
      ),
      h('div', { class: 'tiny muted mt-3' },
        '「一键保存」与「分享」都会导出一份纯文本卡片（成就卡片-YYYY-MM-DD.txt），保存后本周不会重复弹窗。'),
    ),
  );
}

function weeklyCardDialog(auto: boolean): void {
  const m = Modal({
    title: auto ? '周末快乐！这是你的本周成就卡片' : '生成本周成就卡片',
    width: 'normal',
    body: cardPreview(),
    actions: [
      {
        label: '一键保存',
        variant: 'primary',
        keepOpen: true,
        onClick: () => {
          void (async () => {
            try {
              await saveCard();
              Toast('成就卡片已保存到本地', 'success');
            } catch (err) {
              console.warn('[trophy] 成就卡片保存失败', err);
              Toast('保存失败，请稍后重试', 'error');
            }
          })();
        },
      },
      {
        label: '分享',
        variant: 'soft',
        keepOpen: true,
        onClick: () => {
          void (async () => {
            try {
              const res = await saveCard();
              Toast(res === 'shared' ? '已唤起系统分享' : '已下载成就卡片文件', 'success');
            } catch (err) {
              console.warn('[trophy] 成就卡片分享失败', err);
              Toast('分享失败，请稍后重试', 'error');
            }
          })();
        },
      },
      { label: '关闭', variant: 'ghost', onClick: () => m.close() },
    ],
  });
}

/** 周日且本周还没生成过 → 自动弹出 */
function shouldAutoCard(): boolean {
  return new Date().getDay() === 0 && String(store.setting('lastWeeklyCard', '')) !== today();
}

/* ------------------------------ 徽章墙 ------------------------------ */
function badgeWall(): HTMLElement {
  const have = new Map(store.list('achievements').map((a) => [a.key, a]));
  const stats = computeStats();
  return h('div', { class: 'badge-wall' },
    ...VISIBLE_BADGES.map((b) => {
      const got = have.get(b.key);
      const unlocked = !!got;
      const box = h('div', {
        class: `badge ${unlocked ? 'is-unlocked' : 'is-locked'}`,
        title: unlocked ? `已解锁 · ${fmtDate(ymd(got.unlocked_at), 'full')}` : b.desc,
      });
      box.appendChild(h('div', { class: 'badge-art' }, pixelIcon(b.icon, 30)));
      box.appendChild(h('div', { class: 'badge-name' }, b.name));
      box.appendChild(h('div', { class: 'badge-desc' },
        unlocked
          ? `已解锁 ${fmtDate(ymd(got.unlocked_at), 'cn')}`
          : `${b.desc}\n${progressText(b.key, stats)}`));
      return box;
    }),
  );
}

/* ------------------------------ 页面 ------------------------------ */
async function page(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const stats = computeStats();
  const unlocked = unlockedCount();
  const pct = (unlocked / Math.max(1, VISIBLE_BADGES.length)) * 100;
  const breakdown = weekCoinBreakdown();
  const trend = weeklyTrend(7);
  const days = activityDays(28);

  const breakdownChart = breakdown.some((i) => i.value > 0)
    ? barChart({ items: breakdown, height: 230, valueFormat: (n) => n.toFixed(1) })
    : EmptyState({ icon: 'coin', title: '本周还没有金币入账', text: '完成待办、学习、省钱与记录套餐后，明细会出现在这里。' });

  const trendChart = trend.some((t) => t.value > 0)
    ? lineChart({
      series: [{ name: '每周金币', color: '#5A7A4A', points: trend.map((t) => ({ x: t.label.replace(' 周', ''), y: t.value })) }],
      height: 230,
      yFormat: (n) => n.toFixed(0),
    })
    : EmptyState({ icon: 'chart', title: '还没有足够的走势数据', text: '坚持几天，这里会画出近 7 周的金币曲线。' });

  mount(el,
    h('div', { class: 'col' },
      Card({
        variant: 'green',
        decor: true,
        icon: 'trophy',
        title: `已解锁 ${unlocked} / ${VISIBLE_BADGES.length} 个成就`,
        subtitle: `金币总额 ${totalCoins().toFixed(1)} 枚 · 连续全勤 ${stats.streak} 天`,
        actions: [
          Button('检查新成就', {
            variant: 'primary', icon: 'sparkle', size: 'sm',
            onClick: () => {
              void (async () => {
                try {
                  const news = await checkAchievements(true);
                  Toast(news.length ? `解锁了 ${news.length} 个新成就！` : '暂时没有新成就，继续加油', news.length ? 'coin' : 'default');
                  await ctx.refresh('achievements');
                } catch (err) {
                  console.error('[trophy] 成就检查失败', err);
                  Toast('检查成就失败，请稍后重试', 'error');
                }
              })();
            },
          }),
          Button('生成本周成就卡片', { variant: 'soft', icon: 'gift', size: 'sm', onClick: () => weeklyCardDialog(false) }),
        ],
        body: [
          h('div', { class: 'grid grid-auto' },
            Stat({ label: '已解锁成就', value: `${unlocked}/${VISIBLE_BADGES.length}`, unit: '个', tone: 'honey', icon: 'trophy' }),
            Stat({ label: '本周金币', value: coinsOfThisWeek().toFixed(1), unit: '枚', tone: 'green', icon: 'coin' }),
            Stat({ label: '连续全勤', value: stats.streak, unit: '天', tone: 'oak', icon: 'fire' }),
            Stat({ label: '在一起', value: stats.coupleDays, unit: '天', tone: 'green', icon: 'heart' }),
          ),
          h('div', { class: 'mt-3' }, ProgressBar(pct)),
          h('div', { class: 'tiny muted mt-2' },
            `总进度 ${pct.toFixed(0)}% · 每周日会自动生成一张成就卡片，提醒你保存这一周的收获`),
        ],
      }),

      SectionTitle('金币看板', { icon: 'coin' }),
      h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1fr) minmax(0,1fr)' },
        Card({
          icon: 'chart',
          title: '本周金币明细',
          subtitle: `${weekStart(today())} ~ ${today()}`,
          body: [
            breakdownChart,
            h('div', { class: 'tiny muted mt-2' },
              '待办 +0.2/条（每日上限 2）· 学习 +0.2/项（每日上限 0.6）· 省钱奖励每周封顶 14 币 · 组合技独立计算。'),
          ],
        }),
        Card({
          icon: 'chart',
          title: '金币走势（近 7 周）',
          subtitle: `合计 ${trend.reduce((s, t) => s + t.value, 0).toFixed(1)} 枚`,
          body: [trendChart],
        }),
      ),

      SectionTitle('成就徽章', { icon: 'trophy' }),
      Card({
        icon: 'trophy',
        title: '徽章墙',
        actions: [Tag(`${unlocked} / ${VISIBLE_BADGES.length}`, unlocked ? 'honey' : 'line')],
        body: badgeWall(),
        footer: [h('span', { class: 'tiny muted' },
          '未解锁的徽章会显示当前进度；达到条件后点「检查新成就」即可点亮，解锁时会自动弹出庆祝横幅。')],
      }),

      SectionTitle('习惯与统计', { icon: 'target' }),
      h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)' },
        Card({
          icon: 'calendar',
          title: '28 天打卡热力图',
          subtitle: '待办完成 + 植物日记 + 阅读记录',
          body: [
            h('div', { style: 'overflow-x:auto;-webkit-overflow-scrolling:touch' }, heatmap(days)),
            h('div', { class: 'tiny muted mt-2' },
              `近 28 天共 ${days.reduce((s, d) => s + d.value, 0)} 次记录 · 有记录的日子 ${days.filter((d) => d.value > 0).length} 天`),
          ],
        }),
        Card({
          icon: 'target',
          title: '统计概览',
          body: [
            h('div', { class: 'grid grid-auto' },
              Stat({ label: '连续全勤', value: stats.streak, unit: '天', tone: 'green', icon: 'fire' }),
              Stat({ label: '累计阅读', value: stats.readCount, unit: '篇', tone: 'oak', icon: 'book' }),
              Stat({ label: '累计省钱', value: stats.savedTotal, unit: '元', tone: 'honey', icon: 'piggy' }),
              ...(FEATURES.plants ? [Stat({ label: '植物记录', value: stats.plantDays, unit: '天', tone: 'green', icon: 'plant' })] : []),
              Stat({ label: '金币总额', value: stats.coinsTotal.toFixed(1), unit: '枚', tone: 'honey', icon: 'coin' }),
              Stat({ label: '在一起', value: stats.coupleDays, unit: '天', tone: 'green', icon: 'heart' }),
            ),
          ],
        }),
      ),
    ),
  );

  // 进入页面时静默检查一次（不弹横幅，避免与上面的 toast 抢注意力）
  void checkAchievements(false);

  // 周日自动成就卡片
  if (shouldAutoCard()) {
    weeklyCardDialog(true);
    await store.setSetting('lastWeeklyCard', today());
  }
}

/* ------------------------------ 模块 ------------------------------ */
export const trophyModule: ModuleDef = {
  id: 'trophy',
  title: '成就殿堂',
  icon: 'trophy',
  order: 7,
  desc: '金币明细 · 徽章墙 · 成就卡片',

  async render(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
    try {
      await page(el, ctx);
    } catch (err) {
      console.error('[trophy] 渲染失败', err);
      mount(el, Card({
        icon: 'trophy',
        title: '成就殿堂暂时打了个盹',
        body: EmptyState({
          icon: 'trophy',
          title: '加载失败',
          text: err instanceof Error ? err.message : String(err),
          action: Button('重新加载', {
            variant: 'primary', icon: 'refresh',
            onClick: () => {
              void (async () => {
                try {
                  await ctx.refresh('achievements');
                } catch (e) {
                  Toast(e instanceof Error ? e.message : '刷新失败', 'error');
                }
              })();
            },
          }),
        }),
      }));
      Toast('成就殿堂加载失败', 'error');
    }
  },

  badge(): number {
    // 侧栏角标只在「有事要做」时出现；未解锁徽章数常驻会变成噪音，
    // 因此这里不显示角标（进度在成就殿堂页面内有完整展示）。
    return 0;
  },
};
