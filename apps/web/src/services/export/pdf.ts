import type { Project, SheetSpec } from '@hdesign/domain';
import { renderSheet, sheetFileName, type SheetRenderOptions } from '@hdesign/drawing';
import { canvasToBlob, downloadBlob, rasterizeSvg } from './svg';

export type PdfRenderMode = 'auto' | 'vector' | 'raster';

export interface PdfExportOptions extends SheetRenderOptions {
  /** `auto` keeps vector output for Latin-only sheets and rasterises CJK text. */
  mode?: PdfRenderMode;
  /** Raster fallback resolution (default 300 dpi). */
  dpi?: number;
  maxPixels?: number;
  onProgress?: (stage: string) => void;
}

export interface PdfExportResult {
  blob: Blob;
  filename: string;
  mode: 'vector' | 'raster';
  dpi?: number;
  warnings: string[];
}

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f]/;
const MAX_RASTER_PIXELS = 32_000_000;

export function svgHasCjk(svg: string): boolean {
  return CJK_PATTERN.test(svg);
}

/** Injects the SVG string into the DOM (svg2pdf needs layout boxes for text). */
function mountSvg(svg: string): { element: SVGSVGElement; cleanup: () => void } {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.innerHTML = svg;
  document.body.appendChild(host);
  const element = host.querySelector('svg');
  if (!element) {
    host.remove();
    throw new Error('SVG 解析失败，无法生成 PDF');
  }
  return {
    element: element as SVGSVGElement,
    cleanup: () => host.remove(),
  };
}

async function buildVectorPdf(svg: string, widthMm: number, heightMm: number): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  });
  const mounted = mountSvg(svg);
  try {
    await svg2pdf(mounted.element, pdf, {
      x: 0,
      y: 0,
      width: widthMm,
      height: heightMm,
      loadImages: false,
      loadExternalStyleSheets: false,
    });
  } finally {
    mounted.cleanup();
  }
  return pdf.output('blob');
}

async function buildRasterPdf(
  svg: string,
  widthMm: number,
  heightMm: number,
  dpi: number,
  maxPixels: number,
): Promise<{ blob: Blob; dpi: number; clamped: boolean }> {
  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  let widthPx = (widthMm / 25.4) * dpi;
  let heightPx = (heightMm / 25.4) * dpi;
  let clamped = false;
  if (widthPx * heightPx > maxPixels) {
    const factor = Math.sqrt(maxPixels / (widthPx * heightPx));
    widthPx *= factor;
    heightPx *= factor;
    clamped = true;
  }
  const canvas = await rasterizeSvg(svg, widthPx, heightPx);
  const imageData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  });
  pdf.addImage(imageData, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
  const effectiveDpi = Math.round(dpi * Math.min(1, Math.min(widthPx / ((widthMm / 25.4) * dpi), heightPx / ((heightMm / 25.4) * dpi))));
  return { blob: pdf.output('blob'), dpi: effectiveDpi, clamped };
}

export async function renderSheetPdf(
  project: Project,
  sheet: SheetSpec,
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const { mode = 'auto', dpi = 300, maxPixels = MAX_RASTER_PIXELS, onProgress, ...rest } = options;
  onProgress?.('正在生成矢量图形');
  const render = renderSheet(project, sheet, rest);
  const warnings = [...render.warnings];
  const wantsRaster = mode === 'raster' || (mode === 'auto' && svgHasCjk(render.svg));
  const filename = sheetFileName(project, sheet.kind, 'pdf');

  if (!wantsRaster) {
    try {
      onProgress?.('正在写入 PDF（矢量）');
      const blob = await buildVectorPdf(render.svg, render.widthMm, render.heightMm);
      return { blob, filename, mode: 'vector', warnings };
    } catch (error) {
      warnings.push(`矢量 PDF 失败，已改用 300dpi 位图：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onProgress?.(`正在光栅化（${dpi}dpi）`);
  const raster = await buildRasterPdf(render.svg, render.widthMm, render.heightMm, dpi, maxPixels);
  if (raster.clamped) warnings.push('图幅过大，PDF 位图分辨率已自动降低以避免内存溢出');
  return { blob: raster.blob, filename, mode: 'raster', dpi: raster.dpi, warnings };
}

export async function downloadSheetPdf(
  project: Project,
  sheet: SheetSpec,
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const result = await renderSheetPdf(project, sheet, options);
  downloadBlob(result.blob, result.filename);
  return result;
}

export { canvasToBlob };
