/**
 * Shared SVG path primitives for the symbol library.
 * Symbols are pure path data: no DOM, no <rect>/<circle>/<text> elements, so the
 * same definitions can drive react-konva, SVG sheets and PDF drawing export.
 */

export type SymbolGroup = 'furniture' | 'mep';

export interface SymbolPath {
  /** SVG path `d` string. */
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  /** Optional role hint for consumers (outline, detail, accent…). */
  role?: 'outline' | 'detail' | 'accent' | 'fill';
}

export interface SymbolDef {
  key: string;
  label: string;
  group: SymbolGroup;
  /** Nominal footprint in mm used for catalogue matching and aspect ratio. */
  nominal: { w: number; d: number };
  /** Normalised drawing box: draw inside x:0..w, y:0..d (y down). */
  viewBox: { w: number; d: number };
  paths: SymbolPath[];
  /** Where a room label should sit relative to the symbol box. */
  labelAnchor: { x: number; y: number };
  /** Side that should face the wall when auto-oriented (plan symbols only). */
  wallSide?: 'top' | 'bottom' | 'left' | 'right';
}

const NUM_PRECISION = 100;

export function n(value: number): string {
  return String(Math.round(value * NUM_PRECISION) / NUM_PRECISION);
}

/** Normalised viewBox that keeps the nominal aspect ratio, longest side -> 100. */
export function normalizeBox(w: number, d: number): { w: number; d: number } {
  const longest = Math.max(w, d, 1);
  const scale = 100 / longest;
  return { w: round(w * scale), d: round(d * scale) };
}

function round(value: number): number {
  return Math.round(value * NUM_PRECISION) / NUM_PRECISION;
}

export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
}

export function polylinePath(points: Array<[number, number]>, close = false): string {
  if (points.length === 0) return '';
  const head = `M${n(points[0]![0])} ${n(points[0]![1])}`;
  const body = points
    .slice(1)
    .map(([x, y]) => `L${n(x)} ${n(y)}`)
    .join('');
  return close ? `${head}${body}Z` : `${head}${body}`;
}

export function rectPath(x: number, y: number, w: number, d: number): string {
  return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + d)}H${n(x)}Z`;
}

export function roundRectPath(x: number, y: number, w: number, d: number, r = 2): string {
  const radius = Math.max(0, Math.min(r, Math.min(w, d) / 2));
  if (radius <= 0) return rectPath(x, y, w, d);
  return [
    `M${n(x + radius)} ${n(y)}`,
    `H${n(x + w - radius)}`,
    `A${n(radius)} ${n(radius)} 0 0 1 ${n(x + w)} ${n(y + radius)}`,
    `V${n(y + d - radius)}`,
    `A${n(radius)} ${n(radius)} 0 0 1 ${n(x + w - radius)} ${n(y + d)}`,
    `H${n(x + radius)}`,
    `A${n(radius)} ${n(radius)} 0 0 1 ${n(x)} ${n(y + d - radius)}`,
    `V${n(y + radius)}`,
    `A${n(radius)} ${n(radius)} 0 0 1 ${n(x + radius)} ${n(y)}`,
    'Z',
  ].join('');
}

export function circlePath(cx: number, cy: number, r: number): string {
  return [
    `M${n(cx - r)} ${n(cy)}`,
    `A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}`,
    `A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}`,
    'Z',
  ].join('');
}

/** Dashed inner rectangle used for seat / mattress / rug details. */
export function insetRectPath(x: number, y: number, w: number, d: number, inset: number): string {
  return roundRectPath(x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, d - inset * 2), 1.5);
}

export const STROKE = 'currentColor';

export function p(
  d: string,
  role: SymbolPath['role'] = 'detail',
  extra: Partial<SymbolPath> = {},
): SymbolPath {
  return {
    d,
    fill: 'none',
    stroke: STROKE,
    strokeWidth: role === 'outline' ? 1.8 : 1.1,
    role,
    ...extra,
  };
}

export function filled(d: string, opacity = 0.14, role: SymbolPath['role'] = 'fill'): SymbolPath {
  return { d, fill: STROKE, stroke: 'none', opacity, role };
}
