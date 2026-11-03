import {
  distance,
  distanceToSegment,
  pointInPolygon,
  projectPointOnSegment,
  type Point,
  type Room,
  type Wall,
} from '@hdesign/domain';
import type { FurnitureItem } from '@hdesign/domain';

/** Wall edge of a room polygon with its inward normal (unit, points into the room). */
export interface RoomEdge {
  a: Point;
  b: Point;
  length: number;
  /** Direction a -> b in radians. */
  angle: number;
  /** Inward unit normal. */
  normal: Point;
  mid: Point;
}

export function roomEdges(room: Room): RoomEdge[] {
  const edges: RoomEdge[] = [];
  const polygon = room.polygon;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 200) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nx = -dy / length;
    const ny = dx / length;
    const probe = { x: mid.x + nx * 30, y: mid.y + ny * 30 };
    const inward = pointInPolygon(probe, polygon) ? { x: nx, y: ny } : { x: -nx, y: -ny };
    edges.push({ a: { ...a }, b: { ...b }, length, angle: Math.atan2(dy, dx), normal: inward, mid });
  }
  return edges;
}

export function edgePoint(edge: RoomEdge, t: number): Point {
  return {
    x: edge.a.x + (edge.b.x - edge.a.x) * t,
    y: edge.a.y + (edge.b.y - edge.a.y) * t,
  };
}

export function edgeDirection(edge: RoomEdge): Point {
  return { x: Math.cos(edge.angle), y: Math.sin(edge.angle) };
}

/** Rotation (deg) that puts an item's local -y (its back) against the wall. */
export function rotationFacingWall(edge: RoomEdge): number {
  const outward = { x: -edge.normal.x, y: -edge.normal.y };
  return (Math.atan2(outward.x, -outward.y) * 180) / Math.PI;
}

export interface Obb {
  cx: number;
  cy: number;
  w: number;
  d: number;
  /** Degrees, screen coordinates (y down, clockwise positive). */
  rotation: number;
}

export function obbCorners(obb: Obb): Point[] {
  const rad = (obb.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = obb.w / 2;
  const hd = obb.d / 2;
  const local: Point[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return local.map((point) => ({
    x: obb.cx + point.x * cos - point.y * sin,
    y: obb.cy + point.x * sin + point.y * cos,
  }));
}

export function obbFromItem(item: FurnitureItem): Obb {
  return { cx: item.x, cy: item.y, w: item.w, d: item.d, rotation: item.rotation };
}

function obbAxes(obb: Obb): Point[] {
  const rad = (obb.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ];
}

function projectRadius(obb: Obb, axis: Point): number {
  const axes = obbAxes(obb);
  return (
    Math.abs(axes[0]!.x * axis.x + axes[0]!.y * axis.y) * (obb.w / 2) +
    Math.abs(axes[1]!.x * axis.x + axes[1]!.y * axis.y) * (obb.d / 2)
  );
}

/**
 * Separating-axis overlap depth. Returns > 0 when the rectangles overlap by more
 * than `tolerance` mm (touching edges do not count as overlap).
 */
export function obbOverlapDepth(a: Obb, b: Obb, tolerance = 1): number {
  const axes = [...obbAxes(a), ...obbAxes(b)];
  let depth = Infinity;
  for (const axis of axes) {
    const centerDelta =
      (b.cx - a.cx) * axis.x + (b.cy - a.cy) * axis.y;
    const overlap =
      projectRadius(a, axis) + projectRadius(b, axis) - Math.abs(centerDelta);
    if (overlap < depth) depth = overlap;
    if (overlap <= tolerance) return 0;
  }
  return depth > tolerance ? depth : 0;
}

export function obbOverlaps(a: Obb, b: Obb, tolerance = 1): boolean {
  return obbOverlapDepth(a, b, tolerance) > 0;
}

export function obbCircleOverlaps(obb: Obb, center: Point, radius: number): boolean {
  const rad = (-obb.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = center.x - obb.cx;
  const dy = center.y - obb.cy;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const clampX = Math.max(-obb.w / 2, Math.min(obb.w / 2, localX));
  const clampY = Math.max(-obb.d / 2, Math.min(obb.d / 2, localY));
  return Math.hypot(localX - clampX, localY - clampY) < radius;
}

const INSIDE_GRID = [0.06, 0.33, 0.5, 0.67, 0.94];

/** True when the whole footprint stays inside the room polygon (concave safe). */
export function obbInsidePolygon(obb: Obb, polygon: Point[]): boolean {
  const corners = obbCorners(obb);
  for (const corner of corners) {
    if (!pointInPolygon(corner, polygon)) return false;
  }
  // Sample an interior grid: catches rectangles spanning a concave notch even
  // when all four corners happen to be inside.
  for (const fx of INSIDE_GRID) {
    for (const fy of INSIDE_GRID) {
      const rad = (obb.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = (fx - 0.5) * obb.w;
      const ly = (fy - 0.5) * obb.d;
      const point = {
        x: obb.cx + lx * cos - ly * sin,
        y: obb.cy + lx * sin + ly * cos,
      };
      if (!pointInPolygon(point, polygon)) return false;
    }
  }
  return true;
}

/** Approximate clearance between two footprints (0 when touching/overlapping). */
export function obbDistance(a: Obb, b: Obb): number {
  if (obbOverlaps(a, b, 0)) return 0;
  let best = Infinity;
  const cornersA = obbCorners(a);
  const cornersB = obbCorners(b);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      best = Math.min(
        best,
        distanceToSegment(cornersA[i]!, cornersB[j]!, cornersB[(j + 1) % 4]!),
        distanceToSegment(cornersB[j]!, cornersA[i]!, cornersA[(i + 1) % 4]!),
      );
    }
  }
  return best;
}

export function nearestEdge(edges: RoomEdge[], point: Point): { edge: RoomEdge; t: number; point: Point; distance: number } | undefined {
  let best: { edge: RoomEdge; t: number; point: Point; distance: number } | undefined;
  for (const edge of edges) {
    const projection = projectPointOnSegment(point, edge.a, edge.b);
    if (!best || projection.distance < best.distance) {
      best = { edge, t: projection.t, point: projection.point, distance: projection.distance };
    }
  }
  return best;
}

/** All room edges sorted by length descending (stable). */
export function edgesByLength(edges: RoomEdge[]): RoomEdge[] {
  return [...edges].sort((a, b) => b.length - a.length);
}

export function roomBBoxCenter(room: Room): Point {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of room.polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function pointDistance(a: Point, b: Point): number {
  return distance(a, b);
}

export function wallPoint(wall: Wall, offsetFromStart: number): Point {
  const length = distance(wall.a, wall.b) || 1;
  const t = offsetFromStart / length;
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function roundMm(value: number): number {
  return Math.round(value);
}

export function roundDeg(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  // Keep symbols axis aligned on purpose: auto-layout only produces 90° steps.
  return Math.round(normalized / 90) * 90 % 360;
}
