import type { PaperSize, PaperSpec, SheetScale } from './types';
import { SHEET_SCALES } from './types';

export const PAPERS: Record<PaperSize, PaperSpec> = {
  A4: { id: 'A4', widthMm: 297, heightMm: 210, marginMm: 8 },
  A3: { id: 'A3', widthMm: 420, heightMm: 297, marginMm: 8 },
  A2: { id: 'A2', widthMm: 594, heightMm: 420, marginMm: 10 },
};

export function paperSpec(size: PaperSize): PaperSpec {
  return PAPERS[size];
}

export function isSheetScale(value: number): value is SheetScale {
  return (SHEET_SCALES as readonly number[]).includes(value);
}

/**
 * Picks the scale denominator that fits a model bbox into the available paper area.
 * Prefers the requested scale; when the model overflows, falls back to the next
 * legal (larger denominator = smaller drawing) scale. When even 1:200 overflows,
 * shrinks continuously and reports `autoFitted`.
 */
export function fitScale(
  modelWidthMm: number,
  modelHeightMm: number,
  availableWidthMm: number,
  availableHeightMm: number,
  requested: number,
): { scale: number; autoFitted: boolean } {
  const width = Math.max(1, modelWidthMm);
  const height = Math.max(1, modelHeightMm);
  const required = Math.max(width / Math.max(1, availableWidthMm), height / Math.max(1, availableHeightMm));
  if (required <= requested) return { scale: requested, autoFitted: false };
  const candidates = SHEET_SCALES.filter((scale) => scale > requested);
  for (const candidate of candidates) {
    if (required <= candidate) return { scale: candidate, autoFitted: false };
  }
  return { scale: Math.max(required, requested), autoFitted: true };
}

/** Paper millimetres per model millimetre. */
export function paperScaleFactor(scaleDenominator: number): number {
  return 1 / Math.max(1, scaleDenominator);
}

/** Largest "nice" model length whose paper size stays below `maxPaperMm`. */
export function niceScaleBarLength(scaleDenominator: number, maxPaperMm: number): number {
  const target = maxPaperMm * scaleDenominator;
  const nice = [
    200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000,
    15000, 20000, 30000, 50000, 100000,
  ];
  let best = nice[0]!;
  for (const value of nice) {
    if (value <= target) best = value;
  }
  return best;
}

export function formatScale(denominator: number): string {
  const rounded = Math.round(denominator * 10) / 10;
  return `1:${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}
