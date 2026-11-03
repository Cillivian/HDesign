import {
  bboxFromPoints,
  distance,
  pointInPolygon,
  rotatePoint,
  type BBox,
  type FurnitureItem,
  type Point,
} from '@hdesign/domain';
import { skuCollisionExempt, skuWallMounted } from './furniture';

/**
 * Furniture collision warnings.
 *
 * The editor warns (never blocks) when two placed items overlap. A few classes
 * of items are exempt because overlap is intentional: rugs under furniture,
 * wall-mounted / counter-top items, and seats tucked under tables.
 */

export interface FurnitureCollision {
  a: FurnitureItem;
  b: FurnitureItem;
  /** Approximate overlapping area in mm². */
  overlapArea: number;
}

export interface CollisionOptions {
  /** Items ignored as collision sources (e.g. the item being dragged). */
  excludeIds?: string[];
  /** Minimum overlapping area to report; filters hairline numeric noise. */
  tolerance?: number;
}

const RUG_KEYWORDS = ['地毯', '毛毡', '地垫', 'rug', 'carpet', 'mat'];
const WALL_MOUNTED_KEYWORDS = [
  '挂',
  '壁灯',
  '吊灯',
  '吸顶',
  '吊柜',
  '挂画',
  '镜子',
  'wall',
  'pendant',
  'ceiling',
  'mirror',
  'armchair-wall',
];
const COUNTER_KEYWORDS = ['台面', 'counter', '水槽', '灶', 'sink', 'cooktop'];
const SEAT_KEYWORDS = ['椅', '凳', '沙发凳', 'chair', 'stool', 'seat'];
const TABLE_KEYWORDS = ['桌', '餐桌', '书桌', '茶几', '岛台', 'table', 'desk', 'island'];

function matches(item: FurnitureItem, keywords: string[]): boolean {
  const haystack = `${item.name} ${item.skuId}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

/** Rugs are floor layers: furniture standing on them is fine. */
export function isRug(item: FurnitureItem): boolean {
  return matches(item, RUG_KEYWORDS);
}

/** Wall-mounted / counter-top items legitimately overlap base furniture. */
export function isWallOrCounterItem(item: FurnitureItem): boolean {
  return (
    skuWallMounted(item.skuId) ||
    matches(item, WALL_MOUNTED_KEYWORDS) ||
    matches(item, COUNTER_KEYWORDS)
  );
}

export function collisionExempt(item: FurnitureItem): boolean {
  return skuCollisionExempt(item.skuId) || isRug(item) || isWallOrCounterItem(item);
}

export function isSeat(item: FurnitureItem): boolean {
  return matches(item, SEAT_KEYWORDS);
}

export function isTable(item: FurnitureItem): boolean {
  return matches(item, TABLE_KEYWORDS);
}

/** World-space corners of the item footprint after rotation. */
export function footprintCorners(item: FurnitureItem): Point[] {
  const halfW = item.w / 2;
  const halfD = item.d / 2;
  const center = { x: item.x, y: item.y };
  return [
    { x: item.x - halfW, y: item.y - halfD },
    { x: item.x + halfW, y: item.y - halfD },
    { x: item.x + halfW, y: item.y + halfD },
    { x: item.x - halfW, y: item.y + halfD },
  ].map((corner) => rotatePoint(corner, center, item.rotation));
}

/** Screen-axis aligned bounds of the rotated footprint. */
export function footprintBBox(item: FurnitureItem): BBox {
  return bboxFromPoints(footprintCorners(item));
}

function projectOnAxis(points: Point[], axis: Point): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function rectAxes(corners: Point[]): Point[] {
  const axes: Point[] = [];
  for (let i = 0; i < 2; i += 1) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    axes.push({ x: -dy / length, y: dx / length });
  }
  return axes;
}

/** Separating axis test for two convex quads (rotated rectangles). */
export function footprintsIntersect(first: Point[], second: Point[]): boolean {
  const axes = [...rectAxes(first), ...rectAxes(second)];
  for (const axis of axes) {
    const a = projectOnAxis(first, axis);
    const b = projectOnAxis(second, axis);
    if (a.max < b.min + 1e-6 || b.max < a.min + 1e-6) return false;
  }
  return true;
}

function overlapArea(first: BBox, second: BBox): number {
  const width = Math.min(first.x + first.w, second.x + second.w) - Math.max(first.x, second.x);
  const height = Math.min(first.y + first.h, second.y + second.h) - Math.max(first.y, second.y);
  return Math.max(0, width) * Math.max(0, height);
}

function centerInsideTable(seat: FurnitureItem, table: FurnitureItem): boolean {
  const tableCorners = footprintCorners(table);
  return pointInPolygon({ x: seat.x, y: seat.y }, tableCorners);
}

function isTuckedSeatPair(first: FurnitureItem, second: FurnitureItem): boolean {
  const seat = isSeat(first) ? first : isSeat(second) ? second : null;
  const table = isTable(first) ? first : isTable(second) ? second : null;
  if (!seat || !table || seat === table) return false;
  if (centerInsideTable(seat, table)) return true;
  const seatArea = seat.w * seat.d;
  const tableBox = footprintBBox(table);
  const seatBox = footprintBBox(seat);
  const ratio = overlapArea(seatBox, tableBox) / Math.max(seatArea, 1);
  return ratio < 0.3;
}

/** All colliding furniture pairs in the document. */
export function findFurnitureCollisions(
  items: FurnitureItem[],
  options: CollisionOptions = {},
): FurnitureCollision[] {
  const excluded = new Set(options.excludeIds ?? []);
  const tolerance = options.tolerance ?? 500;
  const collisions: FurnitureCollision[] = [];
  const candidates = items.filter((item) => !excluded.has(item.id) && !collisionExempt(item));

  for (let i = 0; i < candidates.length; i += 1) {
    const first = candidates[i]!;
    const firstCorners = footprintCorners(first);
    const firstBox = bboxFromPoints(firstCorners);
    for (let j = i + 1; j < candidates.length; j += 1) {
      const second = candidates[j]!;
      const secondBox = footprintBBox(second);
      if (
        firstBox.x + firstBox.w < secondBox.x ||
        secondBox.x + secondBox.w < firstBox.x ||
        firstBox.y + firstBox.h < secondBox.y ||
        secondBox.y + secondBox.h < firstBox.y
      ) {
        continue;
      }
      if (!footprintsIntersect(firstCorners, footprintCorners(second))) continue;
      if (isTuckedSeatPair(first, second)) continue;
      const area = overlapArea(firstBox, secondBox);
      if (area < tolerance) continue;
      collisions.push({ a: first, b: second, overlapArea: area });
    }
  }
  return collisions;
}

/** Items that participate in at least one collision, for highlight rendering. */
export function collisionIds(collisions: FurnitureCollision[]): Set<string> {
  const ids = new Set<string>();
  for (const collision of collisions) {
    ids.add(collision.a.id);
    ids.add(collision.b.id);
  }
  return ids;
}

/** Human-readable summary line for the editor HUD (Chinese UI). */
export function collisionSummary(collisions: FurnitureCollision[]): string | null {
  if (collisions.length === 0) return null;
  const ids = new Set<string>();
  for (const collision of collisions) {
    ids.add(collision.a.id);
    ids.add(collision.b.id);
  }
  return `${collisions.length} 处家具重叠 · ${ids.size} 件家具受影响`;
}

/** Walk clearance helper used by the sidebar warning copy. */
export function nearestItemDistance(item: FurnitureItem, items: FurnitureItem[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const other of items) {
    if (other.id === item.id) continue;
    best = Math.min(best, distance({ x: item.x, y: item.y }, { x: other.x, y: other.y }));
  }
  return best;
}
