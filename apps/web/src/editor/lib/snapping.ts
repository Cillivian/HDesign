import {
  angleOf,
  bboxFromPoints,
  clamp,
  distance,
  distanceToSegment,
  lerp,
  projectPointOnSegment,
  type BBox,
  type FurnitureItem,
  type Point,
  type Project,
} from '@hdesign/domain';
import type { Viewport } from '../../store/ui-store';

/**
 * Snapping and alignment-guide maths for the 2D editor.
 *
 * All coordinates are world millimetres; tolerances are passed in world units so
 * callers can convert a screen pixel budget at the current zoom.
 */

export type SnapKind = 'vertex' | 'midpoint' | 'wall' | 'furniture' | 'mep' | 'grid' | 'angle';

export interface SnapTarget {
  point: Point;
  kind: SnapKind;
  entityId?: string;
}

export interface SnapGuide {
  orientation: 'vertical' | 'horizontal';
  /** World coordinate of the guide line. */
  at: number;
  /** Extent of the guide line in world units. */
  from: number;
  to: number;
}

export interface SnapSettings {
  enabled: boolean;
  gridSize: number;
  /** Max distance in world units for a nearby entity to capture the point. */
  tolerance: number;
}

export interface SnapContext {
  doc: Project;
  settings: SnapSettings;
  /** Layers currently hidden in the viewport — never snap to their geometry. */
  visibleLayerIds?: Set<string>;
  excludeIds?: string[];
}

export interface PointSnapResult {
  point: Point;
  kind: SnapKind | null;
}

export interface DrawSnapResult extends PointSnapResult {
  guides: SnapGuide[];
}

const KIND_PRIORITY: Record<SnapKind, number> = {
  vertex: 0,
  midpoint: 1,
  mep: 2,
  furniture: 3,
  wall: 4,
  grid: 5,
  angle: 6,
};

function isVisible(layerId: string, visible?: Set<string>): boolean {
  return !visible || visible.has(layerId);
}

/** Collect point-style snap targets (wall and room vertices, midpoints, furniture anchors). */
export function collectSnapTargets(ctx: SnapContext): SnapTarget[] {
  const { doc, visibleLayerIds, excludeIds = [] } = ctx;
  const targets: SnapTarget[] = [];
  const excluded = new Set(excludeIds);

  for (const wall of doc.walls) {
    if (excluded.has(wall.id) || !isVisible(wall.layerId, visibleLayerIds)) continue;
    targets.push({ point: { ...wall.a }, kind: 'vertex', entityId: wall.id });
    targets.push({ point: { ...wall.b }, kind: 'vertex', entityId: wall.id });
    targets.push({ point: lerp(wall.a, wall.b, 0.5), kind: 'midpoint', entityId: wall.id });
  }
  for (const room of doc.rooms) {
    if (excluded.has(room.id) || !isVisible(room.layerId, visibleLayerIds)) continue;
    for (const point of room.polygon) {
      targets.push({ point: { ...point }, kind: 'vertex', entityId: room.id });
    }
  }
  for (const item of doc.furniture) {
    if (excluded.has(item.id) || !isVisible(item.layerId, visibleLayerIds)) continue;
    targets.push({ point: { x: item.x, y: item.y }, kind: 'furniture', entityId: item.id });
  }
  for (const device of doc.mep.devices) {
    if (excluded.has(device.id) || !isVisible(device.layerId, visibleLayerIds)) continue;
    targets.push({ point: { x: device.x, y: device.y }, kind: 'mep', entityId: device.id });
  }
  return targets;
}

function nearestTarget(point: Point, targets: SnapTarget[], tolerance: number): SnapTarget | null {
  let best: SnapTarget | null = null;
  let bestDistance = tolerance;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const targetDistance = distance(point, target.point);
    if (targetDistance > tolerance) continue;
    const priority = KIND_PRIORITY[target.kind] ?? 9;
    if (
      targetDistance < bestDistance - 0.01 ||
      (Math.abs(targetDistance - bestDistance) <= 0.01 && priority < bestPriority)
    ) {
      best = target;
      bestDistance = targetDistance;
      bestPriority = priority;
    }
  }
  return best;
}

function nearestWallProjection(
  point: Point,
  ctx: SnapContext,
  tolerance: number,
): SnapTarget | null {
  const { doc, visibleLayerIds, excludeIds = [] } = ctx;
  const excluded = new Set(excludeIds);
  let best: SnapTarget | null = null;
  let bestDistance = tolerance;
  for (const wall of doc.walls) {
    if (excluded.has(wall.id) || !isVisible(wall.layerId, visibleLayerIds)) continue;
    const projection = projectPointOnSegment(point, wall.a, wall.b);
    if (projection.distance > bestDistance) continue;
    bestDistance = projection.distance;
    best = { point: projection.point, kind: 'wall', entityId: wall.id };
  }
  return best;
}

export function snapToGrid(point: Point, gridSize: number): Point {
  if (gridSize <= 0) return { ...point };
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Resolve a free cursor point to the best snap target.
 * Priority: entity target > wall projection > grid.
 */
export function snapPoint(point: Point, ctx: SnapContext): PointSnapResult {
  if (!ctx.settings.enabled) return { point: { ...point }, kind: null };

  const targets = collectSnapTargets(ctx);
  const target = nearestTarget(point, targets, ctx.settings.tolerance);
  if (target) return { point: { ...target.point }, kind: target.kind };

  const wall = nearestWallProjection(point, ctx, ctx.settings.tolerance);
  if (wall) return { point: { ...wall.point }, kind: 'wall' };

  if (ctx.settings.gridSize > 0) {
    return { point: snapToGrid(point, ctx.settings.gridSize), kind: 'grid' };
  }
  return { point: { ...point }, kind: null };
}

/** Snap only to existing geometry (no grid fallback). */
export function snapToGeometry(point: Point, ctx: SnapContext): SnapTarget | null {
  if (!ctx.settings.enabled) return null;
  const targets = collectSnapTargets(ctx);
  const target = nearestTarget(point, targets, ctx.settings.tolerance);
  if (target) return target;
  return nearestWallProjection(point, ctx, ctx.settings.tolerance);
}

/** Rotate a point around an origin so the direction lands on the nearest angle step. */
export function snapPointToAngle(origin: Point, point: Point, stepDeg = 15): Point {
  const radius = distance(origin, point);
  if (radius < 1e-6) return { ...point };
  const angle = angleOf(origin, point);
  const step = Math.max(1, stepDeg);
  const snapped = (Math.round(angle / step) * step * Math.PI) / 180;
  return {
    x: origin.x + Math.cos(snapped) * radius,
    y: origin.y + Math.sin(snapped) * radius,
  };
}

/**
 * Snap the endpoint of a wall segment being drawn.
 *
 * Existing geometry wins (so chains close cleanly); otherwise the direction is
 * constrained to the angle step; grid snapping is the final fallback.
 */
export function snapDrawingPoint(
  origin: Point | null,
  point: Point,
  ctx: SnapContext,
  angleStep = 15,
): DrawSnapResult {
  if (!ctx.settings.enabled) return { point: { ...point }, kind: null, guides: [] };

  const geometry = snapToGeometry(point, ctx);
  if (geometry) {
    return {
      point: { ...geometry.point },
      kind: geometry.kind,
      guides: origin ? alignmentGuides(origin, geometry.point, 0) : [],
    };
  }

  let candidate = { ...point };
  let kind: SnapKind = 'grid';
  if (origin && angleStep > 0) {
    candidate = snapPointToAngle(origin, point, angleStep);
  } else if (ctx.settings.gridSize > 0) {
    candidate = snapToGrid(point, ctx.settings.gridSize);
  }
  if (!origin) kind = ctx.settings.gridSize > 0 ? 'grid' : 'angle';
  return { point: candidate, kind, guides: origin ? alignmentGuides(origin, candidate, 0) : [] };
}

/** Thin alignment guides from `origin` to `point`, emitted only for near-axis lines. */
export function alignmentGuides(origin: Point, point: Point, tolerance: number): SnapGuide[] {
  const guides: SnapGuide[] = [];
  if (Math.abs(origin.x - point.x) <= tolerance) {
    guides.push({
      orientation: 'vertical',
      at: origin.x,
      from: Math.min(origin.y, point.y),
      to: Math.max(origin.y, point.y),
    });
  }
  if (Math.abs(origin.y - point.y) <= tolerance) {
    guides.push({
      orientation: 'horizontal',
      at: origin.y,
      from: Math.min(origin.x, point.x),
      to: Math.max(origin.x, point.x),
    });
  }
  return guides;
}

export interface DragSnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
  snappedX: boolean;
  snappedY: boolean;
}

interface EdgeCandidates {
  values: number[];
  from: number;
  to: number;
}

function verticalCandidates(box: BBox): EdgeCandidates {
  return {
    values: [box.x, box.x + box.w / 2, box.x + box.w],
    from: box.y,
    to: box.y + box.h,
  };
}

function horizontalCandidates(box: BBox): EdgeCandidates {
  return {
    values: [box.y, box.y + box.h / 2, box.y + box.h],
    from: box.x,
    to: box.x + box.w,
  };
}

interface AlignmentHit {
  delta: number;
  guide: SnapGuide;
}

function bestAlignment(
  moving: EdgeCandidates,
  others: EdgeCandidates[],
  tolerance: number,
  orientation: SnapGuide['orientation'],
): AlignmentHit | null {
  let best: AlignmentHit | null = null;
  for (const other of others) {
    for (const movingValue of moving.values) {
      for (const otherValue of other.values) {
        const delta = otherValue - movingValue;
        if (Math.abs(delta) > tolerance) continue;
        if (best && Math.abs(delta) >= Math.abs(best.delta)) continue;
        best = {
          delta,
          guide: {
            orientation,
            at: otherValue,
            from: Math.min(moving.from, other.from) + delta,
            to: Math.max(moving.to, other.to) + delta,
          },
        };
      }
    }
  }
  return best;
}

/**
 * Alignment snapping for a dragged box against other furniture bounds.
 * Returns the delta correction to add to the raw drag translation plus guides.
 */
export function snapDragBounds(
  movingBox: BBox,
  otherBoxes: BBox[],
  settings: SnapSettings,
): DragSnapResult {
  if (!settings.enabled || otherBoxes.length === 0) {
    return { dx: 0, dy: 0, guides: [], snappedX: false, snappedY: false };
  }
  const movingVertical = verticalCandidates(movingBox);
  const movingHorizontal = horizontalCandidates(movingBox);
  const othersVertical = otherBoxes.map(verticalCandidates);
  const othersHorizontal = otherBoxes.map(horizontalCandidates);

  const horizontalHit = bestAlignment(
    movingVertical,
    othersVertical,
    settings.tolerance,
    'vertical',
  );
  const verticalHit = bestAlignment(
    movingHorizontal,
    othersHorizontal,
    settings.tolerance,
    'horizontal',
  );

  return {
    dx: horizontalHit?.delta ?? 0,
    dy: verticalHit?.delta ?? 0,
    guides: [horizontalHit?.guide, verticalHit?.guide].filter((guide): guide is SnapGuide =>
      Boolean(guide),
    ),
    snappedX: Boolean(horizontalHit),
    snappedY: Boolean(verticalHit),
  };
}

/** Move `delta` so the nearest wall direction reads exactly along the wall. */
export function projectDeltaOnWall(
  delta: Point,
  wallA: Point,
  wallB: Point,
): { dx: number; dy: number } {
  const length = distance(wallA, wallB);
  if (length < 1e-6) return { dx: 0, dy: 0 };
  const ux = (wallB.x - wallA.x) / length;
  const uy = (wallB.y - wallA.y) / length;
  const along = delta.x * ux + delta.y * uy;
  return { dx: ux * along, dy: uy * along };
}

/** Bounds of furniture items, useful for multi-select drag bounds. */
export function boundsOfItems(items: FurnitureItem[]): BBox {
  return bboxFromPoints(
    items.flatMap((item) => [
      { x: item.x - item.w / 2, y: item.y - item.d / 2 },
      { x: item.x + item.w / 2, y: item.y + item.d / 2 },
    ]),
  );
}

/** Clamp a screen-derived tolerance to a sane world range (2 mm .. 400 mm). */
export function worldTolerance(viewport: Viewport, px = 10): number {
  return clamp(px / viewport.scale, 2, 400);
}

/** Distance to the closest wall, exposed for tool hover logic. */
export function distanceToWalls(point: Point, walls: Project['walls']): number {
  let best = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    best = Math.min(best, distanceToSegment(point, wall.a, wall.b));
  }
  return best;
}
