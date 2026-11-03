import { renderSheet, sheetFileName, type SheetRenderOptions, type SheetRenderResult } from '@hdesign/drawing';
import type { Project, SheetSpec } from '@hdesign/domain';

/**
 * Browser-side SVG helpers shared by the sheets panel and the exporters.
 * The renderer itself is DOM-free; this module only turns the SVG string into
 * blobs / object URLs / canvases.
 */

export interface SheetExportBase {
  render: SheetRenderResult;
  svg: string;
  filename: string;
}

export function renderSheetDocument(
  project: Project,
  sheet: SheetSpec,
  options: SheetRenderOptions = {},
): SheetExportBase {
  const render = renderSheet(project, sheet, options);
  return {
    render,
    svg: render.svg,
    filename: sheetFileName(project, sheet.kind, 'svg'),
  };
}

export function svgToBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/** Data URL for `<img>` / canvas rasterisation. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function renderSvgBlob(project: Project, sheet: SheetSpec, options: SheetRenderOptions = {}): SheetExportBase & { blob: Blob } {
  const base = renderSheetDocument(project, sheet, options);
  return { ...base, blob: svgToBlob(base.svg) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give Safari a tick before revoking the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/**
 * Rasterises an SVG document string into a canvas at the requested pixel size.
 * Waits for fonts + images so CJK text is not captured as tofu.
 */
export async function rasterizeSvg(svg: string, widthPx: number, heightPx: number): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.decoding = 'sync';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SVG 光栅化失败：浏览器无法加载图形'));
  });
  image.src = svgToDataUrl(svg);
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持 Canvas 2D，无法导出位图');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片编码失败，可能是图幅过大'));
      },
      type,
      quality,
    );
  });
}
