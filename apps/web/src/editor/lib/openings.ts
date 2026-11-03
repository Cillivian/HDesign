import {
  add,
  angleOf,
  clamp,
  distance,
  distanceToSegment,
  lerp,
  normalizeAngle,
  projectPointOnSegment,
  rotatePoint,
  scale,
  sub,
  type Opening,
  type OpeningKind,
  type Point,
  type Wall,
} from '@hdesign/domain';

/**
 * Parametric opening helpers: every opening is stored as a signed offset plus a
 * width along its host wall, so resizing/moving the wall keeps doors and windows
 * glued to it.
 */

export interface OpeningSpan {
  start: Point;
  end: Point;
  center: Point;
  /** Normalised position of the opening centre along the wall (0..1). */
  tCenter: number;
  length: number;
  wallLength: number;
  direction: Point;
  normal: Point;
}

export function wallLengthValue(wall: Wall): number {
  return distance(wall.a, wall.b);
}

export function wallDirectionUnit(wall: Wall): Point {
  const length = wallLengthValue(wall);
  if (length < 1e-6) return { x: 1, y: 0 };
  return { x: (wall.b.x - wall.a.x) / length, y: (wall.b.y - wall.a.y) / length };
}

/** Unit normal pointing to the left of the wall direction (screen y-down). */
export function wallNormalUnit(wall: Wall): Point {
  const direction = wallDirectionUnit(wall);
  return { x: -direction.y, y: direction.x };
}

export function pointAlongWall(wall: Wall, t: number): Point {
  return lerp(wall.a, wall.b, clamp(t, 0, 1));
}

export function openingSpan(wall: Wall, opening: Opening): OpeningSpan {
  const length = Math.max(wallLengthValue(wall), 1);
  const tStart = clamp(opening.offset / length, 0, 1);
  const tEnd = clamp((opening.offset + opening.width) / length, 0, 1);
  return {
    start: pointAlongWall(wall, tStart),
    end: pointAlongWall(wall, tEnd),
    center: pointAlongWall(wall, (tStart + tEnd) / 2),
    tCenter: (tStart + tEnd) / 2,
    length: distance(pointAlongWall(wall, tStart), pointAlongWall(wall, tEnd)),
    wallLength: length,
    direction: wallDirectionUnit(wall),
    normal: wallNormalUnit(wall),
  };
}

export const DEFAULT_OPENING_WIDTH: Record<OpeningKind, number> = {
  door: 900,
  window: 1500,
  sliding: 1800,
  arch: 2000,
};

export const MIN_OPENING_WIDTH = 300;

/** Clamp an opening so it always fits fully inside its host wall. */
export function clampOpeningToWall(
  wall: Wall,
  opening: Pick<Opening, 'offset' | 'width'>,
): {
  offset: number;
  width: number;
} {
  const length = wallLengthValue(wall);
  const width = clamp(opening.width, MIN_OPENING_WIDTH, Math.max(MIN_OPENING_WIDTH, length - 50));
  const offset = clamp(opening.offset, 0, Math.max(0, length - width));
  return { offset, width: Math.min(width, length) };
}

export interface WallHit {
  wall: Wall;
  /** Projection parameter along the wall centre line (0..1). */
  t: number;
  point: Point;
  distance: number;
}

/** Nearest wall centre line for a world point; null when outside tolerance. */
export function nearestWallAt(walls: Wall[], point: Point, tolerance: number): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of walls) {
    const projection = projectPointOnSegment(point, wall.a, wall.b);
    const distanceToCentre = distanceToSegment(point, wall.a, wall.b);
    const allowed = tolerance + wall.thickness / 2;
    if (distanceToCentre > allowed) continue;
    if (best && distanceToCentre >= best.distance) continue;
    best = { wall, t: projection.t, point: projection.point, distance: distanceToCentre };
  }
  return best;
}

export interface OpeningHit {
  opening: Opening;
  wall: Wall;
}

/** Topmost opening under a world point (used for select / drag along wall). */
export function openingAtPoint(
  openings: Opening[],
  walls: Wall[],
  point: Point,
  tolerance: number,
): OpeningHit | null {
  let best: OpeningHit | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const opening of openings) {
    const wall = walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) continue;
    const span = openingSpan(wall, opening);
    const spanDistance = distanceToSegment(point, span.start, span.end);
    if (spanDistance > tolerance + wall.thickness / 2) continue;
    const centreDistance = distanceToSegment(point, wall.a, wall.b);
    const combined = spanDistance + centreDistance;
    if (combined < bestDistance) {
      bestDistance = combined;
      best = { opening, wall };
    }
  }
  return best;
}

export interface InsertOpeningInput {
  kind: OpeningKind;
  offset: number;
  width: number;
  height?: number;
  sill?: number;
}

/**
 * Parameters for inserting an opening centred on a point clicked on a wall.
 * The opening is shifted to stay inside short walls instead of being clipped.
 */
export function insertOpeningParams(
  wall: Wall,
  kind: OpeningKind,
  point: Point,
): InsertOpeningInput {
  const length = wallLengthValue(wall);
  const requested = DEFAULT_OPENING_WIDTH[kind];
  const width = clamp(requested, MIN_OPENING_WIDTH, Math.max(MIN_OPENING_WIDTH, length - 50));
  const projection = projectPointOnSegment(point, wall.a, wall.b);
  const centre = projection.t * length;
  const offset = clamp(centre - width / 2, 0, Math.max(0, length - width));
  return { kind, offset, width };
}

/** Offset that keeps an opening's centre under the cursor while dragging. */
export function offsetForPointerOnWall(
  wall: Wall,
  opening: Pick<Opening, 'width'>,
  point: Point,
): number {
  const length = wallLengthValue(wall);
  const projection = projectPointOnSegment(point, wall.a, wall.b);
  const centre = projection.t * length;
  return clamp(centre - opening.width / 2, 0, Math.max(0, length - opening.width));
}

/** Wall centre-line segments remaining after cutting the given openings out. */
export function wallSegmentsWithGaps(
  wall: Wall,
  openings: Pick<Opening, 'offset' | 'width'>[],
): Array<{ a: Point; b: Point }> {
  const length = wallLengthValue(wall);
  if (length < 1e-6) return [];
  const ranges = openings
    .map((opening) => ({
      start: clamp(opening.offset, 0, length),
      end: clamp(opening.offset + opening.width, 0, length),
    }))
    .filter((range) => range.end - range.start > 1)
    .sort((first, second) => first.start - second.start);

  const segments: Array<{ a: Point; b: Point }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor + 1) {
      segments.push({
        a: pointAlongWall(wall, cursor / length),
        b: pointAlongWall(wall, range.start / length),
      });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < length - 1) {
    segments.push({ a: pointAlongWall(wall, cursor / length), b: pointAlongWall(wall, 1) });
  }
  return segments;
}

export interface SwingGeometry {
  hinge: Point;
  /** Where the leaf ends when fully open (perpendicular to the wall). */
  openEnd: Point;
  /** Where the leaf ends when closed (inside the wall gap). */
  closedEnd: Point;
  radius: number;
  /** Arc start/end angles in degrees for the swing indicator. */
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}

export function swingGeometry(wall: Wall, opening: Opening): SwingGeometry {
  const span = openingSpan(wall, opening);
  const hingeAtStart = opening.swing.hinge === 'start';
  const hinge = hingeAtStart ? span.start : span.end;
  const closedEnd = hingeAtStart ? span.end : span.start;
  const closedVector = sub(closedEnd, hinge);
  const sign = opening.swing.open === 'in' ? 1 : -1;
  const openEnd = rotatePoint(add(hinge, closedVector), hinge, sign * 90);
  const startAngle = normalizeAngle(angleOf(hinge, closedEnd));
  const endAngle = normalizeAngle(angleOf(hinge, openEnd));
  return {
    hinge,
    openEnd,
    closedEnd,
    radius: Math.hypot(closedVector.x, closedVector.y),
    startAngle,
    endAngle,
    clockwise: sign > 0,
  };
}

/** Parallel bands (a,b) used to draw window / sliding symbols inside the gap. */
export function parallelOffsetSegments(
  span: OpeningSpan,
  offsets: number[],
): Array<{ a: Point; b: Point }> {
  return offsets.map((offset) => ({
    a: add(span.start, scale(span.normal, offset)),
    b: add(span.end, scale(span.normal, offset)),
  }));
}

/** Point at a fraction of the opening span, offset along the wall normal. */
export function pointInOpening(span: OpeningSpan, fraction: number, normalOffset: number): Point {
  return add(lerp(span.start, span.end, fraction), scale(span.normal, normalOffset));
}

/** Arc end point for an arch symbol (semi-circle over the opening). */
export function archSweep(
  span: OpeningSpan,
  wallThickness: number,
): {
  from: Point;
  to: Point;
  radius: number;
  clockwise: boolean;
} {
  const radius = span.length / 2;
  const center = span.center;
  const direction = span.direction;
  const from = add(center, scale(direction, -radius));
  const to = add(center, scale(direction, radius));
  const lift = Math.max(radius * 0.45, wallThickness * 0.6);
  const arcCenter = add(center, scale(span.normal, -lift));
  return {
    from,
    to,
    radius: Math.hypot(to.x - arcCenter.x, to.y - arcCenter.y),
    clockwise: true,
  };
}
