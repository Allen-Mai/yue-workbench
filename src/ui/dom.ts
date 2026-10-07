/* ==========================================================================
   ui/dom.ts · 轻量 DOM 工具（零依赖，替代 JSX）
   ========================================================================== */

export type Child = Node | string | number | null | undefined | false;

type Listener = (ev: Event) => void;

export interface Props {
  class?: string;
  className?: string;
  id?: string;
  style?: string | Partial<CSSStyleDeclaration> | Record<string, string | number>;
  dataset?: Record<string, string | number>;
  on?: Record<string, Listener>;
  /** 仅允许传入**可信** HTML（图标/内部模板）；用户数据必须 esc() */
  html?: string;
  text?: string;
  ref?: (el: HTMLElement) => void;
  [attr: string]: unknown;
}

const RESERVED = new Set(['class', 'className', 'style', 'dataset', 'on', 'html', 'text', 'ref']);

function applyStyle(el: HTMLElement, style: Props['style']): void {
  if (!style) return;
  if (typeof style === 'string') {
    el.setAttribute('style', style);
    return;
  }
  for (const [k, v] of Object.entries(style)) {
    if (v == null) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else (el.style as unknown as Record<string, string>)[k] = String(v);
  }
}

function append(el: Element | DocumentFragment, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) {
      append(el, c as unknown as Child[]);
      continue;
    }
    el.appendChild(typeof c === 'object' ? (c as Node) : document.createTextNode(String(c)));
  }
}

/** 创建元素：h('div', { class: 'card' }, '文本', h('b', null, '粗')) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || RESERVED.has(key)) continue;
      if (key === 'disabled' || key === 'checked' || key === 'selected' || key === 'readOnly' || key === 'multiple') {
        (el as unknown as Record<string, unknown>)[key] = Boolean(value);
        continue;
      }
      if (key === 'value' && el instanceof HTMLInputElement) {
        el.value = String(value);
        continue;
      }
      if (key.startsWith('aria-') || key === 'role' || key === 'title') el.setAttribute(key, String(value));
      else (el as unknown as Record<string, unknown>)[key] = value;
    }
    if (props.class || props.className) el.className = String(props.class ?? props.className);
    applyStyle(el, props.style);
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = String(v);
    if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn as Listener);
    if (props.text != null) el.textContent = String(props.text);
    if (props.html != null) el.innerHTML = props.html;
    if (props.ref) props.ref(el as HTMLElement);
  }
  append(el, children);
  return el;
}

/** 创建 SVG 元素（命名空间正确） */
export function svg(tag: string, props?: Props | null, ...children: Child[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || RESERVED.has(key)) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        continue;
      }
      el.setAttribute(key, String(value));
    }
    if (props.class || props.className) el.setAttribute('class', String(props.class ?? props.className));
    if (props.style && typeof props.style === 'string') el.setAttribute('style', props.style);
    if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn as Listener);
    if (props.text != null) el.textContent = String(props.text);
    if (props.html != null) el.innerHTML = props.html;
    if (props.ref) props.ref(el as unknown as HTMLElement);
  }
  append(el, children);
  return el;
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** 清空并挂载，返回父节点 */
export function mount(parent: Element, ...children: Child[]): Element {
  parent.textContent = '';
  append(parent, children);
  return parent;
}

export function clear(el: Element): void {
  el.textContent = '';
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T>(sel);
}

export function qsa<T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

/** 事件委托 */
export function on(
  root: EventTarget,
  evt: string,
  selector: string | null,
  handler: (el: HTMLElement, ev: Event) => void,
): () => void {
  const fn = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (!selector) {
      handler(target, ev);
      return;
    }
    const match = target.closest(selector);
    if (match && (root as unknown as Node).contains?.(match)) handler(match as HTMLElement, ev);
  };
  root.addEventListener(evt, fn);
  return () => root.removeEventListener(evt, fn);
}

/** XSS 过滤：所有用户输入渲染为 HTML 前必须经过 */
export function esc(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 富文本净化（文章正文：保留基础排版标签，去掉脚本/事件/样式） */
export function sanitizeRich(html: string): string {
  const tpl = document.createElement('div');
  tpl.innerHTML = String(html ?? '');
  tpl.querySelectorAll('script,style,iframe,object,embed,form,input,link,meta').forEach((n) => n.remove());
  const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'IMG', 'A', 'HR', 'SPAN', 'DIV', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
  tpl.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(attr.name);
      else if (n === 'style' || n === 'class' || n === 'id' || n === 'srcset') el.removeAttribute(attr.name);
      else if ((n === 'href' || n === 'src') && /^\s*(javascript|data:text\/html|vbscript)/i.test(attr.value)) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (el.tagName === 'IMG') {
      el.setAttribute('loading', 'lazy');
      el.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  return tpl.innerHTML;
}

/** 折叠空白，用于摘要 */
export function summarize(text: string, len = 80): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}

/** 除抖 */
export function debounce<T extends (...a: never[]) => void>(fn: T, wait = 250): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  }) as T;
}

/** 复制到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 降级 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 唯一 id */
export function uid(prefix = ''): string {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${Date.now().toString(36)}${hex}`;
}
