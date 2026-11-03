import type { RasterImage } from '@hdesign/plan-recognition';
import { ImportError } from './errors';

/** Import pipeline limits: long edge of the rasterised source and raw pixel budget. */
export const MAX_SOURCE_LONG_EDGE = 2400;
export const MAX_SOURCE_PIXELS = 24_000_000;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isSupportedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

export function validateFile(file: File): void {
  if (!isPdfFile(file) && !isSupportedImage(file)) {
    throw new ImportError(
      'UNSUPPORTED_FILE',
      '不支持这种文件格式',
      '支持 PNG / JPG / WebP / PDF；请先另存为这些格式再导入',
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError(
      'FILE_TOO_LARGE',
      `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB）`,
      '单文件请控制在 30 MB 以内，或先压缩图片分辨率',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Canvas conversions                                                 */
/* ------------------------------------------------------------------ */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new ImportError('IMAGE_DECODE_FAILED', '浏览器无法创建画布', '请更换浏览器或释放内存后重试');
  }
  return context;
}

export function canvasToRaster(canvas: HTMLCanvasElement): RasterImage {
  const context = context2d(canvas);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(image.data) };
}

export function rasterToCanvas(raster: RasterImage): HTMLCanvasElement {
  const canvas = createCanvas(raster.width, raster.height);
  const context = context2d(canvas);
  const image = new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height);
  context.putImageData(image, 0, 0);
  return canvas;
}

export function rasterToDataUrl(
  raster: RasterImage,
  mime: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.9,
): string {
  return rasterToCanvas(raster).toDataURL(mime, quality);
}

export function rasterToBlob(
  raster: RasterImage,
  mime: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  const canvas = rasterToCanvas(raster);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法生成图片数据'))),
      mime,
      quality,
    );
  });
}

export function rasterLongEdge(raster: { width: number; height: number }): number {
  return Math.max(raster.width, raster.height);
}

/** Scales a raster down (never up) so its long edge fits `maxEdge`. */
export function rasterWithin(raster: RasterImage, maxEdge: number): RasterImage {
  const longEdge = rasterLongEdge(raster);
  if (longEdge <= maxEdge) return raster;
  const scale = maxEdge / longEdge;
  const canvas = createCanvas(raster.width * scale, raster.height * scale);
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(rasterToCanvas(raster), 0, 0, canvas.width, canvas.height);
  return canvasToRaster(canvas);
}

/** JPEG data URL scaled to fit the long edge budget (vision tiles). */
export function rasterToJpegDataUrl(raster: RasterImage, maxEdge: number, quality = 0.84): string {
  const scaled = rasterWithin(raster, maxEdge);
  return rasterToCanvas(scaled).toDataURL('image/jpeg', quality);
}

/** Crops a rectangle (full-image pixel coordinates) and encodes it as JPEG. */
export function cropRasterJpegDataUrl(
  raster: RasterImage,
  box: { x: number; y: number; w: number; h: number },
  maxEdge: number,
  quality = 0.84,
): { dataUrl: string; width: number; height: number } {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(raster.width - x, Math.round(box.w));
  const h = Math.min(raster.height - y, Math.round(box.h));
  if (w <= 0 || h <= 0) {
    throw new ImportError('IMAGE_DECODE_FAILED', '裁剪区域超出图像范围');
  }
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = createCanvas(w * scale, h * scale);
  const context = context2d(canvas);
  context.drawImage(rasterToCanvas(raster), x, y, w, h, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width: canvas.width,
    height: canvas.height,
  };
}

/* ------------------------------------------------------------------ */
/* Decoding user images                                               */
/* ------------------------------------------------------------------ */

async function decodeBitmap(blob: Blob): Promise<{ bitmap: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片解码失败'));
      element.src = url;
    });
    return { bitmap: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface DecodedImage {
  raster: RasterImage;
  width: number;
  height: number;
  /** True when the source was downscaled to fit the pixel budget. */
  scaledDown: boolean;
}

/** Decodes an image file into a bounded RGBA raster. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  validateFile(file);
  let decoded: { bitmap: ImageBitmap | HTMLImageElement; width: number; height: number };
  try {
    decoded = await decodeBitmap(file);
  } catch {
    throw new ImportError(
      'IMAGE_DECODE_FAILED',
      '图片无法解码',
      '文件可能损坏或格式不受支持，请转为 PNG / JPG 后重试',
    );
  }
  const { bitmap, width, height } = decoded;
  if (width * height > MAX_SOURCE_PIXELS) {
    if (bitmap instanceof ImageBitmap) bitmap.close();
    throw new ImportError(
      'TOO_MANY_PIXELS',
      `图片像素过多（${width}×${height}）`,
      '请先压缩到 2400 像素长边以内再导入',
    );
  }
  const scale = Math.min(1, MAX_SOURCE_LONG_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = createCanvas(targetWidth, targetHeight);
  const context = context2d(canvas);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap as CanvasImageSource, 0, 0, targetWidth, targetHeight);
  if (bitmap instanceof ImageBitmap) bitmap.close();
  return {
    raster: canvasToRaster(canvas),
    width: targetWidth,
    height: targetHeight,
    scaledDown: scale < 1,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers used by the wizard / apply step                            */
/* ------------------------------------------------------------------ */

export function rasterToUnderlayBlob(raster: RasterImage): Promise<Blob> {
  return rasterToBlob(raster, 'image/jpeg', 0.9);
}

export function availableMemoryHint(): string {
  return '若浏览器提示内存不足，请关闭其他标签页后重试';
}
