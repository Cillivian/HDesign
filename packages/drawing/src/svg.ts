/**
 * Tiny deterministic SVG writer used by the sheet renderer.
 * Everything here is pure string building so the renderer stays DOM-free and testable.
 */

export const SHEET_FONT =
  "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Source Han Sans SC',sans-serif";
export const SHEET_MONO = "'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace";

/** XML-escapes text content and attribute values. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Escapes a value that will be used inside a double-quoted attribute. */
export function attr(value: string | number): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Fixed-precision number formatting (never exponential, deterministic). */
export function num(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(digits));
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

export interface RectOptions {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  rx?: number;
  opacity?: number;
  extra?: string;
}

export function rect(x: number, y: number, w: number, h: number, options: RectOptions = {}): string {
  const parts = [`x="${num(x)}"`, `y="${num(y)}"`, `width="${num(Math.max(0, w))}"`, `height="${num(Math.max(0, h))}"`];
  if (options.rx) parts.push(`rx="${num(options.rx)}"`);
  parts.push(`fill="${attr(options.fill ?? 'none')}"`);
  if (options.stroke) parts.push(`stroke="${attr(options.stroke)}"`);
  if (options.strokeWidth !== undefined) parts.push(`stroke-width="${num(options.strokeWidth)}"`);
  if (options.dash) parts.push(`stroke-dasharray="${attr(options.dash)}"`);
  if (options.opacity !== undefined) parts.push(`opacity="${num(options.opacity, 2)}"`);
  if (options.extra) parts.push(options.extra);
  return `<rect ${parts.join(' ')}/>`;
}

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: { stroke?: string; strokeWidth?: number; dash?: string; opacity?: number; linecap?: string } = {},
): string {
  const parts = [
    `x1="${num(x1)}"`,
    `y1="${num(y1)}"`,
    `x2="${num(x2)}"`,
    `y2="${num(y2)}"`,
    `stroke="${attr(options.stroke ?? '#23261F')}"`,
    `stroke-width="${num(options.strokeWidth ?? 0.2)}"`,
  ];
  if (options.dash) parts.push(`stroke-dasharray="${attr(options.dash)}"`);
  if (options.opacity !== undefined) parts.push(`opacity="${num(options.opacity, 2)}"`);
  if (options.linecap) parts.push(`stroke-linecap="${attr(options.linecap)}"`);
  return `<line ${parts.join(' ')}/>`;
}

export function polygon(
  points: Array<{ x: number; y: number }>,
  options: RectOptions = {},
): string {
  const data = points.map((point) => `${num(point.x)},${num(point.y)}`).join(' ');
  const parts = [`points="${data}"`, `fill="${attr(options.fill ?? 'none')}"`];
  if (options.stroke) parts.push(`stroke="${attr(options.stroke)}"`);
  if (options.strokeWidth !== undefined) parts.push(`stroke-width="${num(options.strokeWidth)}"`);
  if (options.dash) parts.push(`stroke-dasharray="${attr(options.dash)}"`);
  if (options.opacity !== undefined) parts.push(`opacity="${num(options.opacity, 2)}"`);
  return `<polygon ${parts.join(' ')}/>`;
}

export function path(
  d: string,
  options: RectOptions & { linecap?: string; linejoin?: string } = {},
): string {
  const parts = [`d="${attr(d)}"`, `fill="${attr(options.fill ?? 'none')}"`];
  if (options.stroke) parts.push(`stroke="${attr(options.stroke)}"`);
  if (options.strokeWidth !== undefined) parts.push(`stroke-width="${num(options.strokeWidth)}"`);
  if (options.dash) parts.push(`stroke-dasharray="${attr(options.dash)}"`);
  if (options.opacity !== undefined) parts.push(`opacity="${num(options.opacity, 2)}"`);
  if (options.linecap) parts.push(`stroke-linecap="${attr(options.linecap)}"`);
  if (options.linejoin) parts.push(`stroke-linejoin="${attr(options.linejoin)}"`);
  return `<path ${parts.join(' ')}/>`;
}

export interface TextOptions {
  fontSize?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number | 'bold' | 'normal';
  rotate?: number;
  opacity?: number;
  family?: string;
  letterSpacing?: number;
  extra?: string;
}

export function text(x: number, y: number, content: string, options: TextOptions = {}): string {
  const parts = [
    `x="${num(x)}"`,
    `y="${num(y)}"`,
    `font-size="${num(options.fontSize ?? 2.6, 2)}"`,
    `fill="${attr(options.fill ?? '#23261F')}"`,
    `font-family="${attr(options.family ?? SHEET_FONT)}"`,
  ];
  if (options.anchor && options.anchor !== 'start') parts.push(`text-anchor="${options.anchor}"`);
  if (options.weight) parts.push(`font-weight="${options.weight}"`);
  if (options.rotate) parts.push(`transform="rotate(${num(options.rotate)})"`);
  if (options.opacity !== undefined) parts.push(`opacity="${num(options.opacity, 2)}"`);
  if (options.letterSpacing !== undefined) parts.push(`letter-spacing="${num(options.letterSpacing, 2)}"`);
  if (options.extra) parts.push(options.extra);
  return `<text ${parts.join(' ')}>${escapeXml(content)}</text>`;
}

/** Text that keeps its paper-millimetre size regardless of the surrounding plan transform. */
export function paperText(
  x: number,
  y: number,
  content: string,
  options: TextOptions & { scaleDenominator: number; rotate?: number },
): string {
  const inverse = options.scaleDenominator;
  const parts = [
    `transform="translate(${num(x)} ${num(y)}) scale(${num(inverse, 3)})`,
    options.rotate ? ` rotate(${num(options.rotate)})` : '',
    `"`,
  ];
  return `<g ${parts.join('')}>${text(0, 0, content, options)}</g>`;
}

export function group(content: string, transform?: string, extra?: string): string {
  const attributes = [transform ? `transform="${attr(transform)}"` : '', extra ?? ''].filter(Boolean).join(' ');
  return `<g${attributes ? ` ${attributes}` : ''}>${content}</g>`;
}

export function defs(content: string): string {
  return `<defs>${content}</defs>`;
}

/** A deterministic, DOM-safe id factory (defs ids must be unique when several sheets are mounted). */
export function createIdFactory(prefix: string): (suffix: string) => string {
  const safe = prefix.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'sheet';
  return (suffix: string) => `${safe}-${suffix.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

/** Minimal SVG document wrapper. Width/height are physical millimetres. */
export function svgDocument(
  widthMm: number,
  heightMm: number,
  content: string,
  background = '#FFFFFF',
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(widthMm, 2)}mm" height="${num(heightMm, 2)}mm" viewBox="0 0 ${num(widthMm, 2)} ${num(heightMm, 2)}" fill="none" role="img">`,
    `<title>HDesign sheet</title>`,
    rect(0, 0, widthMm, heightMm, { fill: background }),
    content,
    '</svg>',
  ].join('');
}

/** Distance along an angle, used for tick marks and hatch offsets. */
export function polar(cx: number, cy: number, radius: number, angleRad: number): { x: number; y: number } {
  return { x: cx + Math.cos(angleRad) * radius, y: cy + Math.sin(angleRad) * radius };
}

/** Formats millimetres as a drawing dimension label (mm below 10 m, metres above). */
export function formatLengthMm(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10000) {
    const metres = rounded / 1000;
    return `${Number(metres.toFixed(2))}m`;
  }
  return `${rounded}`;
}

/** Deterministic id-safe slug for file names / SVG ids. */
export function slug(value: string, fallback = 'sheet'): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|#%\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
