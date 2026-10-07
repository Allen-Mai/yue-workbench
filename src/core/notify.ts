/* ==========================================================================
   core/notify.ts · 通知：站内横幅 + 轻提示 + 系统级通知（锁屏可见）
   ========================================================================== */

import { Banner, Toast } from '../ui/components';

export type NotifyTone = 'default' | 'remind' | 'alert' | 'coin';

export interface NotifyOptions {
  title: string;
  text?: string;
  icon?: string;
  tone?: NotifyTone;
  ms?: number;
  onClick?: () => void;
  /** 同时发系统级通知（手机锁屏可见） */
  system?: boolean;
  tag?: string;
}

function permission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** 系统级通知：优先走 Service Worker（锁屏/后台可见），降级到 Notification */
export async function system(title: string, body?: string, data?: Record<string, unknown>, tag?: string): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: body ?? '',
    tag: tag ?? 'yue-workbench',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    lang: 'zh-CN',
    data: data ?? {},
    vibrate: [80, 40, 80],
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch (err) {
    console.warn('[notify] Service Worker 通知失败，降级', err);
  }
  try {
    new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('[notify] 系统通知失败', err);
    return false;
  }
}

/** 统一入口：横幅 +（可选）系统通知 */
export function push(opts: NotifyOptions): void {
  Banner({
    title: opts.title,
    text: opts.text,
    icon: opts.icon ?? 'notice',
    tone: opts.tone === 'default' ? 'remind' : opts.tone,
    ms: opts.ms,
    onClick: opts.onClick,
  });
  if (opts.system) void system(opts.title, opts.text, { url: location.hash }, opts.tag);
}

export function toast(text: string, tone: 'default' | 'success' | 'error' | 'coin' = 'default'): void {
  Toast(text, tone);
}

/** 当前是否支持并已授权 */
export function status(): { supported: boolean; permission: NotificationPermission | 'unsupported' } {
  return { supported: typeof Notification !== 'undefined', permission: permission() };
}

/** 到达提醒时间的判断（提前 N 天 + 当天 + 当天到点） */
export function shouldFire(remindYmd: string, todayYmd: string, advance: number, time: string, nowHHmm: string): boolean {
  const t = new Date(`${todayYmd}T00:00:00`);
  const r = new Date(`${remindYmd}T00:00:00`);
  const days = Math.round((r.getTime() - t.getTime()) / 86400000);
  if (days === 0) {
    if (!time) return true;
    return nowHHmm >= time;
  }
  return days === advance;
}

export const notify = { push, toast, system, requestPermission, status, shouldFire, permission };
