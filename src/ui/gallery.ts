/* ==========================================================================
   ui/gallery.ts · 九宫格相册 + 全屏 Lightbox（左右滑动 / 双指缩放）
   ========================================================================== */

import { h, clear } from './dom';
import { pixelIcon } from './icons';
import { IconButton } from './components';
import { image, formatBytes, type PickedImage } from '../core/image';

/** 全屏预览：左右滑动、键盘、点击关闭 */
export function Lightbox(photos: string[], startIndex = 0): void {
  if (!photos.length) return;
  let index = Math.max(0, Math.min(startIndex, photos.length - 1));
  const track = h('div', { class: 'lightbox-track' });
  for (let i = 0; i < photos.length; i++) {
    const slide = h('div', { class: 'lightbox-slide' });
    slide.appendChild(h('img', { src: photos[i], alt: `照片 ${i + 1}`, loading: i === index ? 'eager' : 'lazy' }));
    track.appendChild(slide);
  }
  const counter = h('span', null, `${index + 1} / ${photos.length}`);
  const stage = h('div', { class: 'lightbox-stage' }, track);
  const box = h('div', { class: 'lightbox' }, stage, counter);

  const sync = () => {
    track.style.transform = `translateX(${-index * 100}%)`;
    counter.textContent = `${index + 1} / ${photos.length}`;
  };
  const go = (n: number) => {
    index = Math.max(0, Math.min(photos.length - 1, n));
    sync();
  };

  const close = () => {
    box.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'ArrowRight') go(index + 1);
  };

  const closeBtn = IconButton('close', { title: '关闭', onClick: close, size: 22, color: '#F2EEE4' });
  closeBtn.classList.add('lightbox-close');
  box.appendChild(closeBtn);

  if (photos.length > 1) {
    const prev = h('button', { class: 'lightbox-nav prev', type: 'button', title: '上一张' }, '‹');
    const next = h('button', { class: 'lightbox-nav next', type: 'button', title: '下一张' }, '›');
    prev.addEventListener('click', (e) => { e.stopPropagation(); go(index - 1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); go(index + 1); });
    box.append(prev, next);
  }

  let startX = 0;
  let startY = 0;
  let dragging = false;
  stage.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; dragging = true;
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      track.style.transition = 'none';
      track.style.transform = `translateX(calc(${-index * 100}% + ${dx}px))`;
    }
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    dragging = false;
    track.style.transition = '';
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) close();
    else sync();
  }, { passive: true });

  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  document.body.classList.add('no-scroll');
  sync();
}

export interface GalleryOptions {
  cols?: 2 | 3 | 4;
  onDelete?: (index: number) => void;
  onAdd?: () => void;
  addLabel?: string;
}

/** 九宫格缩略图（点击全屏放大） */
export function Gallery(photos: string[], opts: GalleryOptions = {}): HTMLElement {
  const wrap = h('div', { class: `gallery ${opts.cols && opts.cols !== 3 ? `cols-${opts.cols}` : ''}`.trim() });
  photos.forEach((src, i) => {
    const item = h('div', { class: 'gallery-item', title: '点击放大' });
    item.appendChild(h('img', { src, alt: `照片 ${i + 1}`, loading: 'lazy' }));
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.g-del')) return;
      Lightbox(photos, i);
    });
    if (opts.onDelete) {
      const del = h('button', { class: 'g-del', type: 'button', title: '删除' }, '×');
      del.addEventListener('click', (e) => { e.stopPropagation(); opts.onDelete!(i); });
      item.appendChild(del);
    }
    wrap.appendChild(item);
  });
  if (opts.onAdd) {
    const add = h('div', { class: 'gallery-add' }, pixelIcon('plus', 20), h('span', null, opts.addLabel ?? '添加'));
    add.addEventListener('click', opts.onAdd);
    wrap.appendChild(add);
  }
  return wrap;
}

export interface UploaderOptions {
  value?: string[];
  multiple?: boolean;
  max?: number;
  label?: string;
  onChange?: (photos: string[]) => void;
}

/** 上传控件：选择 → 压缩 WebP ≤200KB → 九宫格预览 */
export function Uploader(opts: UploaderOptions = {}): HTMLElement {
  let photos = [...(opts.value ?? [])];
  const wrap = h('div', { class: 'uploader' });
  const grid = h('div');
  const status = h('div', { class: 'tiny muted', style: 'margin-top:4px' }, '支持多选 · 点击缩略图可全屏查看');
  const drop = h('div', { class: 'uploader-drop' },
    h('div', { style: 'display:flex;justify-content:center;gap:8px;margin-bottom:6px' }, pixelIcon('camera', 22), pixelIcon('image', 22)),
    h('span', null, opts.label ?? '点击选择照片（自动压缩为 WebP ≤200KB）'),
    status,
  );

  const render = () => {
    clear(grid);
    grid.appendChild(Gallery(photos, {
      cols: 3,
      onDelete: (i) => {
        photos.splice(i, 1);
        opts.onChange?.(photos);
        status.textContent = photos.length ? `当前 ${photos.length} 张` : '支持多选 · 点击缩略图可全屏查看';
        render();
      },
    }));
  };

  const doPick = async () => {
    const max = opts.max ?? 30;
    const remain = max - photos.length;
    if (remain <= 0) {
      status.textContent = `最多 ${max} 张`;
      return;
    }
    const picked = await image.pick({
      multiple: opts.multiple !== false,
      onProgress: (t) => (status.textContent = t),
    });
    const gained: PickedImage[] = picked.slice(0, remain);
    if (!gained.length) {
      status.textContent = '未选择照片';
      return;
    }
    photos = photos.concat(gained.map((p) => p.dataUrl));
    const total = gained.reduce((s, p) => s + p.bytes, 0);
    status.textContent = `已添加 ${gained.length} 张（共 ${formatBytes(total)}）· 当前 ${photos.length} 张`;
    opts.onChange?.(photos);
    render();
  };

  drop.addEventListener('click', () => void doPick());
  wrap.append(drop, grid);
  render();
  return wrap;
}

export { formatBytes };
