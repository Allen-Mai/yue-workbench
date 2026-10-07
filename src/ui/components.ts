/* ==========================================================================
   ui/components.ts · 治愈森系组件库（零依赖）
   ========================================================================== */

import { h, svg, mount, clear, frag, esc, type Child } from './dom';
import { pixelIcon, dogLine } from './icons';
import { image } from '../core/image';

/* ------------------------------ 卡片 ------------------------------ */
export interface CardOptions {
  title?: string | Child;
  subtitle?: string;
  icon?: string;
  actions?: Child[];
  body?: Child | Child[];
  footer?: Child | Child[];
  className?: string;
  variant?: 'default' | 'green' | 'warm' | 'flat' | 'pixel';
  hoverable?: boolean;
  onClick?: () => void;
  decor?: boolean;
}

export function Card(opts: CardOptions): HTMLElement {
  const cls = ['card'];
  if (opts.variant && opts.variant !== 'default') cls.push(`is-${opts.variant}`);
  if (opts.hoverable) cls.push('is-hoverable');
  if (opts.className) cls.push(opts.className);

  const el = h('div', { class: cls.join(' ') });
  if (opts.onClick) el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select, .no-card-click')) return;
    opts.onClick!();
  });

  if (opts.title || opts.actions || opts.icon) {
    el.appendChild(
      h('div', { class: 'card-head' },
        opts.icon ? h('span', { class: 'card-head-icon' }, pixelIcon(opts.icon, 18)) : null,
        h('div', null,
          h('div', { class: 'card-title' }, opts.title ?? ''),
          opts.subtitle ? h('div', { class: 'card-sub' }, opts.subtitle) : null,
        ),
        opts.actions?.length ? h('div', { class: 'card-actions no-card-click' }, ...opts.actions) : null,
      ),
    );
  }
  const body = h('div', { class: 'card-body' });
  if (Array.isArray(opts.body)) body.append(...(opts.body.filter(Boolean) as Node[]));
  else if (opts.body != null) body.appendChild(opts.body as Node);
  el.appendChild(body);

  if (opts.footer) {
    const foot = h('div', { class: 'card-foot' });
    if (Array.isArray(opts.footer)) foot.append(...(opts.footer.filter(Boolean) as Node[]));
    else foot.appendChild(opts.footer as Node);
    el.appendChild(foot);
  }
  if (opts.decor) corners(el);
  return el;
}

/* ------------------------------ 按钮 ------------------------------ */
export interface ButtonOptions {
  variant?: 'default' | 'primary' | 'soft' | 'ghost' | 'danger' | 'pixel';
  icon?: string;
  iconColor?: string;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  title?: string;
  disabled?: boolean;
  onClick?: (ev: MouseEvent) => void;
}

export function Button(label: string | Child, opts: ButtonOptions = {}): HTMLButtonElement {
  const cls = ['btn'];
  if (opts.variant && opts.variant !== 'default') cls.push(`btn-${opts.variant}`);
  if (opts.size === 'sm') cls.push('btn-sm');
  if (opts.size === 'lg') cls.push('btn-lg');
  if (opts.block) cls.push('btn-block');
  const btn = h('button', {
    class: cls.join(' '),
    type: 'button',
    title: opts.title ?? (typeof label === 'string' ? label : ''),
    disabled: opts.disabled,
  });
  if (opts.icon) btn.appendChild(pixelIcon(opts.icon, opts.size === 'sm' ? 14 : 16, { color: opts.iconColor }));
  if (opts.onClick) btn.addEventListener('click', opts.onClick);
  if (typeof label === 'string') btn.appendChild(document.createTextNode(label));
  else btn.appendChild(label as Node);
  return btn;
}

export function IconButton(icon: string, opts: { title?: string; onClick?: (e: MouseEvent) => void; color?: string; size?: number } = {}): HTMLButtonElement {
  const b = h('button', { class: 'btn btn-icon', type: 'button', title: opts.title ?? '', 'aria-label': opts.title ?? icon });
  b.appendChild(pixelIcon(icon, opts.size ?? 17, { color: opts.color }));
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

export function ButtonGroup(...buttons: Child[]): HTMLElement {
  return h('div', { class: 'btn-group' }, ...buttons);
}

/* ------------------------------ 表单控件 ------------------------------ */
export function Field(label: string, control: Node, opts: { hint?: string; required?: boolean; className?: string } = {}): HTMLElement {
  return h('div', { class: `field ${opts.className ?? ''}`.trim() },
    h('label', { class: 'field-label' }, label, opts.required ? h('span', { class: 'req' }, '*') : null),
    control,
    opts.hint ? h('div', { class: 'field-hint' }, opts.hint) : null,
  );
}

export function Input(opts: { value?: string | number; placeholder?: string; type?: string; onInput?: (v: string) => void; onEnter?: () => void; min?: number | string; max?: number | string; step?: number | string; disabled?: boolean; className?: string } = {}): HTMLInputElement {
  const el = h('input', {
    class: `input ${opts.className ?? ''}`.trim(),
    type: opts.type ?? 'text',
    placeholder: opts.placeholder ?? '',
    value: opts.value ?? '',
    min: opts.min,
    max: opts.max,
    step: opts.step,
    disabled: opts.disabled,
  });
  if (opts.onInput) el.addEventListener('input', () => opts.onInput!(el.value));
  if (opts.onEnter) el.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') opts.onEnter!(); });
  return el;
}

export function TextArea(opts: { value?: string; rows?: number; placeholder?: string; onInput?: (v: string) => void; className?: string } = {}): HTMLTextAreaElement {
  const el = h('textarea', {
    class: `textarea ${opts.className ?? ''}`.trim(),
    rows: opts.rows ?? 4,
    placeholder: opts.placeholder ?? '',
  });
  el.value = opts.value ?? '';
  if (opts.onInput) el.addEventListener('input', () => opts.onInput!(el.value));
  return el;
}

export function Select(
  options: Array<{ value: string; label: string }>,
  opts: { value?: string; onChange?: (v: string) => void; className?: string } = {},
): HTMLSelectElement {
  const el = h('select', { class: `select ${opts.className ?? ''}`.trim() }) as HTMLSelectElement;
  for (const o of options) {
    const op = h('option', { value: o.value }, o.label) as HTMLOptionElement;
    if (o.value === opts.value) op.selected = true;
    el.appendChild(op);
  }
  if (opts.value == null && options.length) el.value = options[0].value;
  if (opts.onChange) el.addEventListener('change', () => opts.onChange!(el.value));
  return el;
}

export function DatePicker(opts: { value?: string; onChange?: (v: string) => void; className?: string } = {}): HTMLInputElement {
  return Input({ type: 'date', value: opts.value ?? '', onInput: opts.onChange, className: opts.className });
}

export function TimePicker(opts: { value?: string; onChange?: (v: string) => void; className?: string } = {}): HTMLInputElement {
  return Input({ type: 'time', value: opts.value ?? '', onInput: opts.onChange, className: opts.className });
}

export function NumberInput(opts: { value?: number; min?: number; max?: number; step?: number; onChange?: (v: number) => void; placeholder?: string; className?: string } = {}): HTMLInputElement {
  return Input({
    type: 'number',
    value: opts.value ?? '',
    min: opts.min,
    max: opts.max,
    step: opts.step ?? 'any',
    placeholder: opts.placeholder,
    className: opts.className,
    onInput: (v) => opts.onChange?.(v === '' ? NaN : Number(v)),
  });
}

export function Switch(opts: { checked?: boolean; label?: string; onChange?: (v: boolean) => void } = {}): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: !!opts.checked }) as HTMLInputElement;
  if (opts.onChange) input.addEventListener('change', () => opts.onChange!(input.checked));
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }), opts.label ? h('span', { class: 'switch-label' }, opts.label) : null);
}

export function Chips(
  items: Array<string | { value: string; label: string }>,
  opts: { value?: string | string[]; multi?: boolean; onChange?: (v: string | string[]) => void; size?: 'sm' | 'md' } = {},
): HTMLElement {
  const norm = items.map((i) => (typeof i === 'string' ? { value: i, label: i } : i));
  let selected: string[] = Array.isArray(opts.value) ? [...opts.value] : opts.value ? [opts.value] : [];
  const wrap = h('div', { class: 'chips' });
  const render = () => {
    clear(wrap);
    for (const it of norm) {
      const b = h('button', {
        type: 'button',
        class: `chip ${opts.size === 'sm' ? 'chip-sm' : ''} ${selected.includes(it.value) ? 'is-active' : ''}`.trim(),
      }, it.label);
      b.addEventListener('click', () => {
        if (opts.multi) {
          selected = selected.includes(it.value) ? selected.filter((v) => v !== it.value) : [...selected, it.value];
          opts.onChange?.(selected);
        } else {
          selected = selected.includes(it.value) && !opts.value ? [] : [it.value];
          opts.onChange?.(opts.multi ? selected : selected[0] ?? '');
        }
        render();
      });
      wrap.appendChild(b);
    }
  };
  render();
  return wrap;
}

export function Segmented(
  items: Array<{ value: string; label: string }>,
  opts: { value?: string; onChange?: (v: string) => void } = {},
): HTMLElement {
  let current = opts.value ?? items[0]?.value ?? '';
  const wrap = h('div', { class: 'segmented' });
  const render = () => {
    clear(wrap);
    for (const it of items) {
      const b = h('button', { type: 'button', class: it.value === current ? 'is-active' : '' }, it.label);
      b.addEventListener('click', () => {
        current = it.value;
        render();
        opts.onChange?.(current);
      });
      wrap.appendChild(b);
    }
  };
  render();
  return wrap;
}

/* ------------------------------ 展示元件 ------------------------------ */
export function Stat(opts: { label: string; value: string | number; unit?: string; tone?: 'green' | 'red' | 'honey' | 'oak'; icon?: string }): HTMLElement {
  return h('div', { class: `stat ${opts.tone ? `tone-${opts.tone}` : ''}`.trim() },
    h('div', { class: 'stat-label' }, opts.icon ? pixelIcon(opts.icon, 13) : null, opts.label),
    h('div', { class: 'stat-value' }, String(opts.value), opts.unit ? h('span', { class: 'stat-unit' }, opts.unit) : null),
  );
}

export function ListRow(opts: {
  icon?: string; thumb?: string; title: Child; meta?: Child; right?: Child;
  onClick?: () => void; done?: boolean; className?: string;
}): HTMLElement {
  const row = h('div', { class: `list-row ${opts.onClick ? 'clickable' : ''} ${opts.done ? 'is-done' : ''} ${opts.className ?? ''}`.trim() });
  if (opts.thumb) row.appendChild(h('img', { class: 'list-thumb', src: opts.thumb, alt: '', loading: 'lazy' }));
  else if (opts.icon) row.appendChild(h('div', { class: 'list-icon' }, pixelIcon(opts.icon, 18)));
  row.appendChild(h('div', { class: 'list-main' },
    h('div', { class: 'list-title' }, opts.title),
    opts.meta ? h('div', { class: 'list-meta' }, opts.meta) : null,
  ));
  if (opts.right) row.appendChild(h('div', { class: 'list-right no-card-click' }, opts.right as Node));
  if (opts.onClick) row.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.no-card-click, button, a, input')) return;
    opts.onClick!();
  });
  return row;
}

export function ProgressBar(pct: number, tone?: 'red' | 'honey'): HTMLElement {
  const p = h('div', { class: `progress ${tone ? `tone-${tone}` : ''}`.trim() });
  p.appendChild(h('i', { style: `width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%` }));
  return p;
}

export function Tag(text: string, tone?: 'green' | 'red' | 'honey' | 'line'): HTMLElement {
  return h('span', { class: `tag ${tone ? `tag-${tone}` : ''}`.trim() }, text);
}

export function SectionTitle(text: string, opts: { icon?: string; extra?: Child } = {}): HTMLElement {
  return h('div', { class: 'section-title' },
    opts.icon ? pixelIcon(opts.icon, 15) : null,
    h('span', null, text),
    opts.extra ? h('span', { style: 'margin-left:auto' }, opts.extra as Node) : null,
  );
}

export function EmptyState(opts: { icon?: string; title: string; text?: string; action?: Node }): HTMLElement {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-art' }, opts.icon ? pixelIcon(opts.icon, 44) : dogLine(96)),
    h('div', { class: 'empty-title' }, opts.title),
    opts.text ? h('div', { class: 'empty-text' }, opts.text) : null,
    opts.action ? h('div', { class: 'empty-action' }, opts.action) : null,
  );
}

export function Skeleton(height = 16): HTMLElement {
  return h('div', { class: 'skeleton', style: `height:${height}px` });
}

export function LoadingBlock(text = '正在生长…'): HTMLElement {
  return h('div', { class: 'loading-block' }, h('span', { class: 'spinner' }), h('span', null, text));
}

export function Divider(text?: string): HTMLElement {
  if (!text) return h('hr');
  return h('div', { class: 'divider-dot' }, text);
}

/* ------------------------------ 弹窗 ------------------------------ */
export interface ModalOptions {
  title: string;
  body: Child | Child[];
  actions?: Array<{ label: string; variant?: ButtonOptions['variant']; onClick?: () => void; keepOpen?: boolean }>;
  width?: 'normal' | 'wide';
  onClose?: () => void;
}

export function Modal(opts: ModalOptions): { close: () => void; el: HTMLElement } {
  const host = h('div', { class: 'modal-host' });
  const bodyEl = h('div', { class: 'modal-body' });
  if (Array.isArray(opts.body)) bodyEl.append(...(opts.body.filter(Boolean) as Node[]));
  else bodyEl.appendChild(opts.body as Node);

  const close = () => {
    host.remove();
    document.body.classList.remove('no-scroll');
    opts.onClose?.();
  };

  const head = h('div', { class: 'modal-head' },
    h('div', { class: 'modal-title' }, opts.title),
    IconButton('close', { title: '关闭', onClick: close }),
  );
  head.querySelector('.btn-icon')?.classList.add('modal-close');

  const modal = h('div', { class: `modal ${opts.width === 'wide' ? 'wide-modal' : ''}`.trim() }, head, bodyEl);

  if (opts.actions?.length) {
    const foot = h('div', { class: 'modal-foot' });
    for (const a of opts.actions) {
      foot.appendChild(Button(a.label, {
        variant: a.variant ?? 'primary',
        onClick: () => {
          a.onClick?.();
          if (!a.keepOpen) close();
        },
      }));
    }
    modal.appendChild(foot);
  }

  host.appendChild(modal);
  host.addEventListener('click', (e) => { if (e.target === host) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  document.body.appendChild(host);
  document.body.classList.add('no-scroll');
  const first = modal.querySelector<HTMLElement>('input, textarea, select, button.btn-primary');
  setTimeout(() => first?.focus(), 60);
  return { close, el: modal };
}

export function confirmDialog(title: string, text?: string, opts: { danger?: boolean; okText?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean, close: () => void) => { settled = true; close(); resolve(v); };
    const m = Modal({
      title,
      body: h('div', { class: 'article-body' }, text ?? '确定要执行这个操作吗？'),
      actions: [
        { label: '取消', variant: 'ghost', onClick: () => done(false, m.close) },
        { label: opts.okText ?? '确定', variant: opts.danger ? 'danger' : 'primary', onClick: () => done(true, m.close) },
      ],
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}

export function promptDialog(title: string, opts: { label?: string; value?: string; placeholder?: string; multiline?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let value = opts.value ?? '';
    const control = opts.multiline
      ? TextArea({ value, rows: 4, placeholder: opts.placeholder, onInput: (v) => (value = v) })
      : Input({ value, placeholder: opts.placeholder, onInput: (v) => (value = v), onEnter: () => finish(value) });
    const m = Modal({
      title,
      body: Field(opts.label ?? '内容', control),
      actions: [
        { label: '取消', variant: 'ghost', onClick: () => finish(null) },
        { label: '保存', variant: 'primary', onClick: () => finish(value) },
      ],
      onClose: () => { if (!settled) resolve(null); },
    });
    function finish(v: string | null) { settled = true; m.close(); resolve(v); }
  });
}

/* ------------------------------ 通用表单弹窗 ------------------------------ */
export type FormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'chips' | 'switch' | 'photos' | 'money' | 'range';

export interface FormField {
  name: string;
  label: string;
  type?: FormFieldType;
  value?: unknown;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }> | string[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  span?: 1 | 2;
  validate?: (v: unknown, all: Record<string, unknown>) => string | null;
}

export interface FormResult {
  values: Record<string, unknown>;
}

/** 通用表单弹窗：模块里 90% 的新增/编辑都走它，保证风格统一 */
export function openForm(opts: {
  title: string;
  fields: FormField[];
  submitText?: string;
  width?: 'normal' | 'wide';
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
  extra?: Child | Child[];
}): { close: () => void } {
  const values: Record<string, unknown> = {};
  const controls: Array<() => unknown> = [];
  const errorEl = h('div', { class: 'field-error', style: 'min-height:16px' });

  const grid = h('div', { class: 'form-grid' });

  for (const f of opts.fields) {
    const initial = f.value;
    values[f.name] = initial ?? (f.type === 'switch' ? false : f.type === 'chips' ? [] : '');
    let rangeLabel: HTMLElement | null = null;
    let control: Node;
    switch (f.type) {
      case 'textarea':
        control = TextArea({ value: String(initial ?? ''), rows: f.rows ?? 5, placeholder: f.placeholder, onInput: (v) => (values[f.name] = v) });
        break;
      case 'number':
      case 'money':
        control = NumberInput({ value: initial == null || initial === '' ? undefined : Number(initial), min: f.min, max: f.max, step: f.step ?? (f.type === 'money' ? 0.01 : 1), placeholder: f.placeholder, onChange: (v) => (values[f.name] = Number.isNaN(v) ? 0 : v) });
        break;
      case 'range':
        control = h('div', { class: 'row' },
          Input({
            type: 'range', min: f.min ?? 0, max: f.max ?? 100, step: f.step ?? 1, value: Number(initial ?? 0),
            onInput: (v) => { values[f.name] = Number(v); if (rangeLabel) rangeLabel.textContent = v; },
          }),
          h('span', { class: 'small muted', style: 'min-width:38px;text-align:right', ref: (el) => { rangeLabel = el as HTMLElement; } }, String(initial ?? 0)),
        );
        break;
      case 'date':
        control = DatePicker({ value: String(initial ?? ''), onChange: (v) => (values[f.name] = v) });
        break;
      case 'time':
        control = TimePicker({ value: String(initial ?? ''), onChange: (v) => (values[f.name] = v) });
        break;
      case 'select': {
        const options = (f.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
        control = Select(options, { value: String(initial ?? ''), onChange: (v) => (values[f.name] = v) });
        break;
      }
      case 'chips': {
        const options = (f.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
        control = Chips(options, {
          multi: true,
          value: Array.isArray(initial) ? (initial as string[]) : [],
          onChange: (v) => (values[f.name] = v),
        });
        break;
      }
      case 'switch':
        control = Switch({ checked: !!initial, onChange: (v) => (values[f.name] = v) });
        break;
      case 'photos': {
        const current = Array.isArray(initial) ? [...(initial as string[])] : [];
        const host = h('div', { class: 'uploader' });
        const thumbWrap = h('div', { class: 'gallery' });
        const drop = h('div', { class: 'uploader-drop' }, '点击选择照片（自动压缩为 WebP ≤200KB，可多选）');
        drop.addEventListener('click', async () => {
          const picked = await image.pick({ multiple: true, onProgress: (t) => (drop.textContent = t) });
          for (const p of picked) current.push(p.dataUrl);
          values[f.name] = current;
          renderThumbs();
          drop.textContent = `已选 ${current.length} 张 · 点击继续添加`;
        });
        const renderThumbs = () => {
          clear(thumbWrap);
          for (let i = 0; i < current.length; i++) {
            const item = h('div', { class: 'gallery-item' }, h('img', { src: current[i], alt: '' }));
            const del = h('button', { class: 'g-del', type: 'button', title: '删除' }, '×');
            del.addEventListener('click', (e) => {
              e.stopPropagation();
              current.splice(i, 1);
              values[f.name] = current;
              renderThumbs();
            });
            item.appendChild(del);
            thumbWrap.appendChild(item);
          }
        };
        values[f.name] = current;
        renderThumbs();
        host.append(drop, thumbWrap);
        control = host;
        break;
      }
      default:
        control = Input({ value: String(initial ?? ''), placeholder: f.placeholder, onInput: (v) => (values[f.name] = v) });
    }
    const fieldEl = Field(f.label, control as Node, { hint: f.hint, required: f.required, className: f.span === 2 ? 'span-2' : '' });
    grid.appendChild(fieldEl);
    controls.push(() => values[f.name]);
  }

  const body: Child[] = [grid];
  if (opts.extra) body.push(...(Array.isArray(opts.extra) ? opts.extra : [opts.extra]));
  body.push(errorEl);

  let closed = false;
  const submit = async () => {
    for (const f of opts.fields) {
      const v = values[f.name];
      if (f.required && (v === '' || v == null || (Array.isArray(v) && !v.length))) {
        errorEl.textContent = `请填写「${f.label}」`;
        return;
      }
      if (f.validate) {
        const err = f.validate(v, values);
        if (err) { errorEl.textContent = err; return; }
      }
    }
    errorEl.textContent = '';
    try {
      await opts.onSubmit?.(values);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : '保存失败，请重试';
      return;
    }
    if (!closed) { closed = true; m.close(); }
  };

  const m = Modal({
    title: opts.title,
    body,
    width: opts.width,
    actions: [
      { label: '取消', variant: 'ghost' },
      { label: opts.submitText ?? '保存', variant: 'primary', onClick: () => void submit() },
    ],
  });
  return { close: () => { closed = true; m.close(); } };
}

/* ------------------------------ 提示 / 横幅 ------------------------------ */
let toastHost: HTMLElement | null = null;
let bannerHost: HTMLElement | null = null;

function hosts(): { toast: HTMLElement; banner: HTMLElement } {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
    const filter = document.getElementById('wobble-filter');
    if (!filter) {
      const defs = svg('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true', id: 'wobble-holder' });
      const filterEl = svg('filter', { id: 'wobble' },
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.02 0.03', numOctaves: '2', result: 'n' }),
        svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '2.4', xChannelSelector: 'R', yChannelSelector: 'G' }),
      );
      defs.appendChild(filterEl);
      document.body.appendChild(defs);
    }
  }
  if (!bannerHost) {
    bannerHost = h('div', { class: 'banner-host' });
    document.body.appendChild(bannerHost);
  }
  return { toast: toastHost, banner: bannerHost };
}

export function Toast(text: string, tone: 'default' | 'success' | 'error' | 'coin' = 'default', ms = 2400): void {
  const host = hosts().toast;
  const el = h('div', { class: `toast ${tone !== 'default' ? `tone-${tone}` : ''}`.trim() },
    pixelIcon(tone === 'error' ? 'close' : tone === 'coin' ? 'coin' : tone === 'success' ? 'check' : 'leaf', 16),
    h('span', null, text),
  );
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 420);
  }, ms);
}

export interface BannerOptions {
  title: string;
  text?: string;
  icon?: string;
  tone?: 'default' | 'remind' | 'alert' | 'coin';
  ms?: number;
  onClick?: () => void;
}

export function Banner(opts: BannerOptions): void {
  const host = hosts().banner;
  const el = h('div', { class: `banner ${opts.tone ? `tone-${opts.tone}` : ''}`.trim() },
    h('span', { class: 'banner-icon' }, pixelIcon(opts.icon ?? 'notice', 22)),
    h('div', { class: 'banner-main' },
      h('div', { class: 'banner-title' }, opts.title),
      opts.text ? h('div', { class: 'banner-text' }, opts.text) : null,
    ),
  );
  const close = h('button', { class: 'banner-close', type: 'button', title: '关闭' }, '×');
  close.addEventListener('click', () => dismiss());
  el.appendChild(close);
  if (opts.onClick) el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.banner-close')) return;
    opts.onClick!();
    dismiss();
  });
  const dismiss = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 420);
  };
  host.appendChild(el);
  if (opts.ms) setTimeout(dismiss, opts.ms);
  else setTimeout(dismiss, 9000);
}

/** 金币庆祝弹窗 */
export function coinPopup(title: string, text: string): void {
  const el = h('div', { class: 'coin-pop' },
    h('div', { class: 'coin-pop-inner' },
      h('div', { style: 'display:flex;justify-content:center;gap:6px;margin-bottom:8px' },
        pixelIcon('coin', 34), pixelIcon('sparkle', 26), pixelIcon('coin', 26)),
      h('div', { class: 'coin-pop-title' }, title),
      h('div', { class: 'coin-pop-text' }, text),
    ),
  );
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/** 卡片四角波点/叶片装饰（纯装饰，不可点击） */
export function corners(el: HTMLElement, kind: 'dot' | 'leaf' | 'dog' = 'dot'): void {
  const spots: Array<'tl' | 'tr' | 'bl' | 'br'> = kind === 'leaf' ? ['tr', 'bl'] : ['tl', 'br'];
  for (const pos of spots) {
    const wrap = h('span', { class: `decor-corner ${pos}` });
    if (kind === 'dog') wrap.appendChild(dogLine(28, 'rgba(139,107,71,.5)'));
    else if (kind === 'leaf') wrap.appendChild(pixelIcon('leaf', 18));
    else {
      wrap.appendChild(svg('svg', { width: 34, height: 34, viewBox: '0 0 34 34', 'aria-hidden': 'true' },
        svg('circle', { cx: 6, cy: 28, r: 2.1, fill: 'var(--dot)', opacity: 0.75 }),
        svg('circle', { cx: 16, cy: 22, r: 1.7, fill: 'var(--dot)', opacity: 0.6 }),
        svg('circle', { cx: 25, cy: 15, r: 2.4, fill: 'var(--dot)', opacity: 0.5 }),
        svg('circle', { cx: 30, cy: 30, r: 1.4, fill: 'var(--dot)', opacity: 0.55 }),
      ));
    }
    wrap.style.opacity = '0.55';
    el.appendChild(wrap);
  }
}

/* ------------------------------ 组合模板 ------------------------------ */
export function PageHead(opts: { title: string; desc?: string; icon?: string; actions?: Child[] }): HTMLElement {
  return h('div', { class: 'page-head' },
    h('h2', null, opts.icon ? pixelIcon(opts.icon, 24) : null, opts.title),
    opts.desc ? h('span', { class: 'page-desc' }, opts.desc) : null,
    opts.actions?.length ? h('div', { class: 'page-head-actions' }, ...opts.actions) : null,
  );
}

export function ScrollX(...children: Child[]): HTMLElement {
  return h('div', { class: 'scroll-x' }, ...children);
}

export function StatGrid(...stats: Child[]): HTMLElement {
  return h('div', { class: 'grid grid-auto' }, ...stats);
}

export function KeyValue(rows: Array<[string, Child]>): HTMLElement {
  const table = h('table', { class: 'table' });
  const tb = h('tbody');
  for (const [k, v] of rows) {
    tb.appendChild(h('tr', null, h('th', { style: 'width:38%' }, k), h('td', null, v as Node)));
  }
  table.appendChild(tb);
  return table;
}

export function escText(s: unknown): string {
  return esc(s);
}

export { mount, frag, clear };
