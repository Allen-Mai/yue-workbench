/* ==========================================================================
   core/image.ts · 图片选择与压缩（所有上传统一走这里：WebP ≤ 200KB）
   ========================================================================== */

export interface PickedImage {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  name: string;
}

export interface CompressOptions {
  maxBytes?: number;
  maxSide?: number;
  minQuality?: number;
}

const DEFAULTS: Required<CompressOptions> = { maxBytes: 200 * 1024, maxSide: 1600, minQuality: 0.42 };

async function decode(file: Blob): Promise<{ src: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close() };
    } catch {
      /* 回退到 Image */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = url;
  });
  return { src: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** 压缩为 WebP，循环降质直到 ≤ maxBytes（默认 200KB） */
export async function compress(file: File | Blob, opts: CompressOptions = {}): Promise<PickedImage> {
  const o = { ...DEFAULTS, ...opts };
  const { src, width, height, cleanup } = await decode(file);
  let scale = Math.min(1, o.maxSide / Math.max(width, height));
  let best: Blob | null = null;

  for (let attempt = 0; attempt < 7; attempt++) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);

    let quality = 0.86;
    let blob: Blob | null = null;
    while (quality >= o.minQuality) {
      blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (blob.size <= o.maxBytes) break;
      quality -= 0.12;
    }
    if (blob && (!best || blob.size < best.size)) best = blob;
    if (blob && blob.size <= o.maxBytes) {
      cleanup();
      return {
        dataUrl: await blobToDataUrl(blob),
        bytes: blob.size,
        width: w,
        height: h,
        name: (file as File).name ?? 'photo',
      };
    }
    scale *= 0.78; // 降质不够就降分辨率
  }

  cleanup();
  if (!best) throw new Error('图片压缩失败');
  return {
    dataUrl: await blobToDataUrl(best),
    bytes: best.size,
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    name: (file as File).name ?? 'photo',
  };
}

export interface PickOptions {
  multiple?: boolean;
  accept?: string;
  maxBytes?: number;
  maxSide?: number;
  onProgress?: (text: string) => void;
}

/** 打开系统相册选择并压缩 */
export function pick(opts: PickOptions = {}): Promise<PickedImage[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept ?? 'image/*';
    input.multiple = !!opts.multiple;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const finish = (out: PickedImage[]) => {
      input.remove();
      resolve(out);
    };

    input.addEventListener('cancel', () => finish([]));
    input.addEventListener('change', async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return finish([]);
      const out: PickedImage[] = [];
      for (let i = 0; i < files.length; i++) {
        opts.onProgress?.(`正在压缩 ${i + 1}/${files.length}…`);
        try {
          out.push(await compress(files[i], { maxBytes: opts.maxBytes, maxSide: opts.maxSide }));
        } catch (err) {
          console.warn('[image] 压缩失败', err);
        }
      }
      finish(out);
    });
    input.click();
  });
}

/** dataURL → Blob（上传 Storage 用） */
export async function toBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const image = { compress, pick, toBlob, formatBytes };
