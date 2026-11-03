import type { BBox, Point, Wall } from './schema';

export const EPSILON = 1e-6;
export const MM_PER_M = 1000;
export const SQM = 1_000_000;

export interface SegmentProjection {
  t: number;
  point: Point;
  distance: number;
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function lengthOf(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midPoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function normalizeAngle(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Angle of the vector a->b in degrees, 0 = +x, grows clockwise in screen coords. */
export function angleOf(a: Point, b: Point): number {
  return normalizeAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

export function snapAngle(angle: number, step = 15): number {
  return normalizeAngle(Math.round(angle / step) * step);
}

export function snapTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rotatePoint(point: Point, origin: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export function projectPointOnSegment(p: Point, a: Point, b: Point): SegmentProjection {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < EPSILON) {
    return { t: 0, point: { ...a }, distance: distance(p, a) };
  }
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  return { t, point, distance: distance(p, point) };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return projectPointOnSegment(p, a, b).distance;
}

export function distanceToPolyline(p: Point, points: Point[], closed = false): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distance(p, points[0]!);
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(best, distanceToSegment(p, points[i]!, points[i + 1]!));
  }
  if (closed && points.length > 2) {
    best = Math.min(best, distanceToSegment(p, points[points.length - 1]!, points[0]!));
  }
  return best;
}

/** Signed polygon area in mm². Positive for clockwise winding in screen coordinates. */
export function signedPolygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(signedPolygonArea(points));
}

export function polygonAreaSqm(points: Point[]): number {
  return polygonArea(points) / SQM;
}

export function polygonCentroid(points: Point[]): Point {
  const area = signedPolygonArea(points);
  if (Math.abs(area) < EPSILON) {
    const sum = points.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function polygonPerimeter(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    total += distance(points[i]!, points[(i + 1) % points.length]!);
  }
  return total;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the polygon boundary; 0 when on the boundary. */
export function distanceToPolygonEdge(point: Point, polygon: Point[]): number {
  return distanceToPolyline(point, polygon, true);
}

export function bboxFromPoints(points: Point[]): BBox {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function bboxCenter(box: BBox): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function expandBBox(box: BBox, padding: number): BBox {
  return { x: box.x - padding, y: box.y - padding, w: box.w + padding * 2, h: box.h + padding * 2 };
}

export function bboxUnion(a: BBox | null, b: BBox): BBox {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: maxX - x, h: maxY - y };
}

export function bboxesOverlap(a: BBox, b: BBox, tolerance = 0): boolean {
  return !(
    a.x + a.w <= b.x + tolerance ||
    b.x + b.w <= a.x + tolerance ||
    a.y + a.h <= b.y + tolerance ||
    b.y + b.h <= a.y + tolerance
  );
}

export function wallLength(wall: Wall): number {
  return lengthOf(wall.a, wall.b);
}

export function wallRectPolygon(wall: Wall): Point[] {
  const len = wallLength(wall);
  if (len < EPSILON) {
    const r = wall.thickness / 2;
    return [
      { x: wall.a.x - r, y: wall.a.y - r },
      { x: wall.a.x + r, y: wall.a.y - r },
      { x: wall.a.x + r, y: wall.a.y + r },
      { x: wall.a.x - r, y: wall.a.y + r },
    ];
  }
  const ux = (wall.b.x - wall.a.x) / len;
  const uy = (wall.b.y - wall.a.y) / len;
  const nx = -uy * (wall.thickness / 2);
  const ny = ux * (wall.thickness / 2);
  return [
    { x: wall.a.x + nx, y: wall.a.y + ny },
    { x: wall.b.x + nx, y: wall.b.y + ny },
    { x: wall.b.x - nx, y: wall.b.y - ny },
    { x: wall.a.x - nx, y: wall.a.y - ny },
  ];
}

export function wallDirection(wall: Wall): Point {
  const len = wallLength(wall);
  if (len < EPSILON) return { x: 1, y: 0 };
  return { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
}

export function nearestPointOnWall(point: Point, wall: Wall): SegmentProjection {
  return projectPointOnSegment(point, wall.a, wall.b);
}

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < EPSILON) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

export function cleanPolygon(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (!last || Math.abs(last.x - p.x) > EPSILON || Math.abs(last.y - p.y) > EPSILON) {
      result.push({ x: p.x, y: p.y });
    }
  }
  if (result.length > 1) {
    const first = result[0]!;
    const last = result[result.length - 1]!;
    if (Math.abs(first.x - last.x) < EPSILON && Math.abs(first.y - last.y) < EPSILON) {
      result.pop();
    }
  }
  return result;
}

export function ensureCounterClockwise(points: Point[]): Point[] {
  const cleaned = cleanPolygon(points);
  return signedPolygonArea(cleaned) < 0 ? cleaned.reverse() : cleaned;
}

export function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatMm(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)}`;
}

export function formatSqm(areaSqm: number): string {
  return `${areaSqm.toFixed(1)} ㎡`;
}

/** Douglas-Peucker simplification, tolerance in document units (mm). */
export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  let maxDistance = 0;
  let index = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distanceToSegment(points[i]!, first, last);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }
  if (maxDistance > tolerance) {
    const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
    const right = simplifyPolyline(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [
    { ...first },
    { ...last },
  ];
}
