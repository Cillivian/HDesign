import type { Point } from '@hdesign/domain';
import type { BinaryImage, GrayImage } from './types';
import { downsampleGray, quantile } from './raster';

export interface EdgeField {
  width: number;
  height: number;
  /** Gradient magnitude per pixel. */
  magnitude: Float32Array;
  /** Gradient direction (radians) per pixel. */
  direction: Float32Array;
}

export interface HoughLine {
  a: Point;
  b: Point;
  thetaDeg: number;
  votes: number;
}

/**
 * Sobel gradient field. Magnitude is normalised so a full black/white step is ~1020.
 */
export function sobel(gray: GrayImage): EdgeField {
  const { width, height, data } = gray;
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return data[cy * width + cx]!;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        -at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1);
      const index = y * width + x;
      magnitude[index] = Math.abs(gx) + Math.abs(gy);
      direction[index] = Math.atan2(gy, gx);
    }
  }
  return { width, height, magnitude, direction };
}

/**
 * Estimates the dominant skew angle in degrees, limited to ±maxSkewDeg.
 * Uses gradient orientation voting, which is cheaper and more stable than a full
 * Hough accumulator for near axis-aligned plans.
 */
export function estimateSkewDeg(gray: GrayImage, maxSkewDeg = 5): number {
  const factor = Math.max(1, Math.round(Math.max(gray.width, gray.height) / 480));
  const small = downsampleGray(gray, factor);
  const edges = sobel(small);
  const magnitudes: number[] = [];
  for (let index = 0; index < edges.magnitude.length; index += 1) {
    const value = edges.magnitude[index]!;
    if (value > 40) magnitudes.push(value);
  }
  if (magnitudes.length < 40) return 0;
  const cutoff = Math.max(60, quantile(magnitudes, 0.82));
  let weightSum = 0;
  let angleSum = 0;
  for (let index = 0; index < edges.magnitude.length; index += 1) {
    const magnitude = edges.magnitude[index]!;
    if (magnitude < cutoff) continue;
    // Gradient is perpendicular to the stroke; the stroke orientation is +90°.
    const lineAngle = (edges.direction[index]! * 180) / Math.PI + 90;
    let deviation = lineAngle - Math.round(lineAngle / 90) * 90;
    if (deviation > 45) deviation -= 90;
    if (deviation < -45) deviation += 90;
    if (Math.abs(deviation) > maxSkewDeg) continue;
    weightSum += magnitude;
    angleSum += deviation * magnitude;
  }
  if (weightSum <= 0) return 0;
  const estimate = angleSum / weightSum;
  return Math.abs(estimate) < 0.15 ? 0 : estimate;
}

/**
 * Probabilistic Hough transform over binary foreground pixels.
 * Produces line segments with vote counts; used for the debug overlay and as a
 * fallback extractor for hollow (double-line) wall drawings.
 */
export function houghSegments(
  mask: BinaryImage,
  options: { minVotes?: number; minLength?: number; maxLines?: number; gapTolerance?: number } = {},
): HoughLine[] {
  const { width, height, data } = mask;
  const factor = Math.max(1, Math.round(Math.max(width, height) / 900));
  const points: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y += factor) {
    for (let x = 0; x < width; x += factor) {
      if (data[y * width + x]) points.push({ x, y });
    }
  }
  if (points.length < 30) return [];

  const thetaBins = 180;
  const diagonal = Math.hypot(width, height);
  const rhoStep = 2 * factor;
  const rhoBins = Math.ceil((diagonal * 2) / rhoStep) + 1;
  const rhoOffset = diagonal;
  const accumulator = new Uint16Array(thetaBins * rhoBins);
  const cosTable = new Float32Array(thetaBins);
  const sinTable = new Float32Array(thetaBins);
  for (let theta = 0; theta < thetaBins; theta += 1) {
    const radians = (theta * Math.PI) / 180;
    cosTable[theta] = Math.cos(radians);
    sinTable[theta] = Math.sin(radians);
  }
  for (const point of points) {
    for (let theta = 0; theta < thetaBins; theta += 1) {
      const rho = point.x * cosTable[theta]! + point.y * sinTable[theta]!;
      const bin = Math.round((rho + rhoOffset) / rhoStep);
      if (bin >= 0 && bin < rhoBins) accumulator[theta * rhoBins + bin] += 1;
    }
  }

  let maxVotes = 0;
  for (let index = 0; index < accumulator.length; index += 1) {
    if (accumulator[index]! > maxVotes) maxVotes = accumulator[index]!;
  }
  const threshold = Math.max(options.minVotes ?? 18, Math.round(maxVotes * 0.32));
  const minLength = options.minLength ?? Math.max(12, Math.round(24 / factor));
  const gapTolerance = options.gapTolerance ?? 2.6 * factor;

  const peaks: Array<{ theta: number; rho: number; votes: number }> = [];
  for (let theta = 0; theta < thetaBins; theta += 1) {
    for (let bin = 0; bin < rhoBins; bin += 1) {
      const votes = accumulator[theta * rhoBins + bin]!;
      if (votes < threshold) continue;
      peaks.push({ theta, rho: bin * rhoStep - rhoOffset, votes });
    }
  }
  peaks.sort((left, right) => right.votes - left.votes);

  const lines: HoughLine[] = [];
  const used = new Set<number>();
  const maxLines = options.maxLines ?? 80;
  for (const peak of peaks) {
    if (lines.length >= maxLines) break;
    // Non-maximum suppression in (theta, rho) space.
    let suppressed = false;
    for (const other of peaks) {
      if (other === peak) continue;
      if (other.votes < peak.votes) continue;
      const dTheta = Math.abs(other.theta - peak.theta);
      const dRho = Math.abs(other.rho - peak.rho);
      if (dTheta <= 2 && dRho <= 3 * factor) {
        suppressed = true;
        break;
      }
    }
    if (suppressed) continue;

    const radians = (peak.theta * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const direction = { x: -sin, y: cos };
    const normal = { x: cos, y: sin };
    const onLine: number[] = [];
    for (let index = 0; index < points.length; index += 1) {
      if (used.has(index)) continue;
      const point = points[index]!;
      const distance = Math.abs(point.x * normal.x + point.y * normal.y - peak.rho);
      if (distance > 1.6 * factor) continue;
      onLine.push(index);
    }
    if (onLine.length < minLength) continue;
    const projections = onLine
      .map((index) => {
        const point = points[index]!;
        return {
          index,
          t: point.x * direction.x + point.y * direction.y,
          point,
        };
      })
      .sort((left, right) => left.t - right.t);

    let runStart = 0;
    for (let cursor = 1; cursor <= projections.length; cursor += 1) {
      const previous = projections[cursor - 1]!;
      const current = projections[cursor];
      const isBreak = !current || current.t - previous.t > gapTolerance;
      if (!isBreak) continue;
      const first = projections[runStart]!;
      const last = projections[cursor - 1]!;
      const length = last.t - first.t;
      if (length >= minLength) {
        for (let index = runStart; index < cursor; index += 1) used.add(projections[index]!.index);
        lines.push({
          a: { x: first.point.x, y: first.point.y },
          b: { x: last.point.x, y: last.point.y },
          thetaDeg: peak.theta,
          votes: peak.votes,
        });
      }
      runStart = cursor;
    }
    if (lines.length >= maxLines) break;
  }
  return lines;
}

/** Returns true when a pixel neighbourhood contains foreground ink. */
export function hasInk(mask: BinaryImage, x: number, y: number, radius = 1): boolean {
  const { width, height, data } = mask;
  const x0 = Math.max(0, Math.round(x) - radius);
  const x1 = Math.min(width - 1, Math.round(x) + radius);
  const y0 = Math.max(0, Math.round(y) - radius);
  const y1 = Math.min(height - 1, Math.round(y) + radius);
  for (let row = y0; row <= y1; row += 1) {
    for (let column = x0; column <= x1; column += 1) {
      if (data[row * width + column]) return true;
    }
  }
  return false;
}

/** Normalised angle difference in degrees, result in (-45, 45]. */
export function angleToAxis(deg: number): number {
  let value = deg % 180;
  if (value < 0) value += 180;
  let deviation = value % 90;
  if (deviation > 45) deviation -= 90;
  return deviation;
}

/** Angle of segment a->b in degrees, 0 = +x (screen coordinates). */
export function segmentAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
