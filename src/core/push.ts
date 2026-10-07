/* ==========================================================================
   core/push.ts · Web Push 订阅（VAPID + PushManager + Service Worker）
   未配置 VAPID 时自动降级为「仅系统通知 Notification API」。
   ========================================================================== */

import { notify } from './notify';

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const VAPID_PUBLIC_KEY = ENV.VITE_VAPID_PUBLIC_KEY ?? '';

export type PushStatus = 'unsupported' | 'default' | 'denied' | 'granted' | 'subscribed' | 'error';

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function status(): Promise<PushStatus> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';
  const sub = await currentSubscription();
  if (sub) return 'subscribed';
  return 'granted';
}

/** 申请权限 → 订阅 → 上报后端 */
export async function enable(): Promise<{ ok: boolean; status: PushStatus; message: string }> {
  if (!supported()) return { ok: false, status: 'unsupported', message: '当前浏览器不支持系统级推送（iOS 请在 Safari 中「添加到主屏幕」后，从主屏幕图标打开再开启）' };
  const perm = await notify.requestPermission();
  if (perm !== 'granted') return { ok: false, status: 'denied', message: '通知权限被拒绝，请在系统设置 → 通知 → 月月的工作台 中开启' };

  const reg = await registration();
  if (!reg) return { ok: false, status: 'error', message: 'Service Worker 尚未就绪，请刷新页面后重试' };

  if (!VAPID_PUBLIC_KEY) {
    // 无 VAPID：仍然可以用本地系统通知，只是无法在页面关闭后由服务器推送
    return {
      ok: true,
      status: 'granted',
      message: '已开启本地系统通知。若需「关闭网页也能收到推送」，请在 Vercel 配置 VAPID 密钥并重新部署。',
    };
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        ua: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    if (!res.ok) throw new Error(`服务端保存失败：HTTP ${res.status}`);
    return { ok: true, status: 'subscribed', message: '系统级推送已开启，锁屏也能收到提醒 🌿' };
  } catch (err) {
    return { ok: false, status: 'error', message: `订阅失败：${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function disable(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return true;
  try {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}

/** 本地到点触发（页面在前台时的兜底提醒） */
export function localReminder(title: string, body: string, data?: Record<string, unknown>): void {
  notify.push({ title, text: body, system: true, tone: 'remind', icon: 'remind', onClick: () => { location.hash = String(data?.url ?? '#/remind'); } });
}

export const push = { enable, disable, status, currentSubscription, registration, base64UrlToUint8Array, localReminder, VAPID_PUBLIC_KEY };
