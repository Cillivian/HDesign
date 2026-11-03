import type { Project, SheetSpec } from '@hdesign/domain';
import { renderSheet, sheetFileName, type SheetRenderOptions } from '@hdesign/drawing';
import { canvasToBlob, downloadBlob, rasterizeSvg, svgToBlob } from './svg';

/** Raster multiplier relative to the paper's 96 dpi pixel size. */
export type PngScale = 2 | 3;

export interface PngExportOptions extends SheetRenderOptions {
  rasterScale?: PngScale;
  /** Hard cap on the canvas pixel count (guards very large sheets / mobile GPUs). */
  maxPixels?: number;
}

export interface PngExportResult {
  blob: Blob;
  filename: string;
  widthPx: number;
  heightPx: number;
  scale: PngScale;
  warnings: string[];
}

const MM_PER_INCH = 25.4;

/** 96 dpi paper pixels × raster multiplier, clamped to a safe canvas size. */
export function pngPixelSize(widthMm: number, heightMm: number, scale: PngScale, maxPixels = 36_000_000): {
  widthPx: number;
  heightPx: number;
  effectiveScale: number;
  clamped: boolean;
} {
  const base = 96 / MM_PER_INCH;
  let widthPx = widthMm * base * scale;
  let heightPx = heightMm * base * scale;
  let effectiveScale: number = scale;
  let clamped = false;
  if (widthPx * heightPx > maxPixels) {
    const factor = Math.sqrt(maxPixels / (widthPx * heightPx));
    widthPx *= factor;
    heightPx *= factor;
    effectiveScale = Math.max(1, scale * factor);
    clamped = true;
  }
  return {
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
    effectiveScale: Math.round(effectiveScale * 10) / 10,
    clamped,
  };
}

export async function renderSheetPng(
  project: Project,
  sheet: SheetSpec,
  options: PngExportOptions = {},
): Promise<PngExportResult> {
  const rasterScale = options.rasterScale ?? 2;
  const render = renderSheet(project, sheet, options);
  const size = pngPixelSize(render.widthMm, render.heightMm, rasterScale, options.maxPixels);
  const canvas = await rasterizeSvg(render.svg, size.widthPx, size.heightPx);
  const blob = await canvasToBlob(canvas);
  const warnings = [...render.warnings];
  if (size.clamped) warnings.push(`图幅过大，PNG 已按 ${size.effectiveScale}x 输出以避免内存溢出`);
  return {
    blob,
    filename: sheetFileName(project, sheet.kind, 'png'),
    widthPx: size.widthPx,
    heightPx: size.heightPx,
    scale: rasterScale,
    warnings,
  };
}

export async function downloadSheetPng(
  project: Project,
  sheet: SheetSpec,
  options: PngExportOptions = {},
): Promise<PngExportResult> {
  const result = await renderSheetPng(project, sheet, options);
  downloadBlob(result.blob, result.filename);
  return result;
}

export { svgToBlob };
