import type { Point } from '@hdesign/domain';

/** Drawing helpers for Konva scene functions (world millimetres). */

export const CANVAS_FONT =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

/** Scene authors store annotation font sizes in print points; the canvas works in mm. */
export const ANNOTATION_FONT_SCALE = 12;

export const CANVAS_FONT_MONO =
  '"SF Mono", "JetBrains Mono", "Cascadia Mono", ui-monospace, Menlo, monospace';

/** Polyline approximation of an arc; angles in degrees, sweep may be negative. */
export function arcPoints(
  center: Point,
  radius: number,
  startDeg: number,
  sweepDeg: number,
): number[] {
  const points: number[] = [];
  const count = Math.max(2, Math.ceil(Math.abs(sweepDeg) / 6));
  for (let index = 0; index <= count; index += 1) {
    const angle = ((startDeg + (sweepDeg * index) / count) * Math.PI) / 180;
    points.push(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
  }
  return points;
}

/** Sweep sign that makes the arc bulge toward `target`. */
export function sweepToward(center: Point, startDeg: number, target: Point): number {
  const targetAngle = (Math.atan2(target.y - center.y, target.x - center.x) * 180) / Math.PI;
  let delta = targetAngle - startDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta >= 0 ? Math.abs(delta) : -Math.abs(delta);
}

/** Normalize an angle difference into [-180, 180]. */
export function angleDelta(startDeg: number, endDeg: number): number {
  let delta = endDeg - startDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/** Nice grid step (world units) that keeps at least `minPx` between lines. */
export function adaptiveGridStep(baseStep: number, scale: number, minPx = 9): number {
  const safeBase = baseStep > 0 ? baseStep : 100;
  let step = safeBase;
  const multipliers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const multiplier of multipliers) {
    step = safeBase * multiplier;
    if (step * scale >= minPx) return step;
  }
  return step;
}

/**
 * Konva 10 removed `fillOpacity`/`strokeOpacity`, so translucent fills must be
 * baked into an rgba() colour. Handles #rgb/#rrggbb/#rrggbbaa and rgb()/rgba().
 */
export function withAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const value = color.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expand = (start: number, length: number) =>
      parseInt(length === 1 ? hex[start]! + hex[start]! : hex.slice(start, start + 2), 16);
    if (hex.length === 3 || hex.length === 4) {
      return `rgba(${expand(0, 1)}, ${expand(1, 1)}, ${expand(2, 1)}, ${clamped})`;
    }
    if (hex.length === 6 || hex.length === 8) {
      return `rgba(${expand(0, 2)}, ${expand(2, 2)}, ${expand(4, 2)}, ${clamped})`;
    }
  }
  if (value.startsWith('rgb')) {
    const inner = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
    const parts = inner
      .split(',')
      .slice(0, 3)
      .map((part) => part.trim());
    if (parts.length === 3) return `rgba(${parts.join(', ')}, ${clamped})`;
  }
  return value;
}

/** Format a millimetre length for canvas chips: 1234 → "1234", 12345 → "12.35 m". */
export function formatLength(mm: number): string {
  if (!Number.isFinite(mm)) return '—';
  if (Math.abs(mm) >= 10000) return `${(mm / 1000).toFixed(2)} m`;
  return `${Math.round(mm)}`;
}

export function formatAngle(deg: number): string {
  return `${(Math.round(deg * 10) / 10).toFixed(1)}°`;
}

/** Polygon points for a room face, flattened for Konva. */
export function flattenPoints(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}
