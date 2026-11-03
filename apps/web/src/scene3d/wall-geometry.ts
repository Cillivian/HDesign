import {
  clamp,
  wallLength,
  type Opening,
  type OpeningKind,
  type Point,
  type Wall,
  type WallKind,
} from '@hdesign/domain';

/**
 * Pure wall-opening segmentation for the 3D scene.
 *
 * Walls are boxes (no CSG): every run of wall is cut along its length into
 * solid spans plus the sill / lintel boxes above and below each opening.
 * The component layer only turns these numbers into three.js boxes.
 */

/** Dollhouse cut height used by the “剖切” view mode. */
export const DEFAULT_CUT_HEIGHT = 1200;
/** Low walls never extrude taller than this even if authored taller. */
export const LOW_WALL_HEIGHT = 1100;
/** Parts thinner than 1 mm are dropped instead of producing degenerate boxes. */
const MIN_PART = 1;

export interface WallBuildOptions {
  /** Clip everything above this height (mm) — used for the dollhouse cut. */
  cutHeight?: number;
}

export interface WallBoxPart {
  key: string;
  wallId: string;
  role: 'solid' | 'sill' | 'lintel';
  /** Start / end along the wall measured from `wall.a`, in mm. */
  start: number;
  end: number;
  bottom: number;
  top: number;
  /** Plan-space centre of the box, mm. */
  cx: number;
  cy: number;
  /** Y-rotation for a three.js box whose local +x runs from a to b. */
  yaw: number;
  thickness: number;
  isLoadBearing: boolean;
  wallKind: WallKind;
}

export interface WallOpeningFrame {
  key: string;
  wallId: string;
  openingId: string;
  kind: OpeningKind;
  start: number;
  end: number;
  width: number;
  bottom: number;
  top: number;
  /** Plan-space centre of the opening, mm. */
  cx: number;
  cy: number;
  yaw: number;
  thickness: number;
  /** Hinge side and swing direction, used to render doors ajar. */
  hinge: 'start' | 'end';
  openIn: boolean;
}

export interface WallBuild {
  boxes: WallBoxPart[];
  frames: WallOpeningFrame[];
}

export interface OpeningDetailPart {
  key: string;
  role: 'frame' | 'leaf' | 'glass' | 'mullion';
  /** Centre offset along the wall measured from `wall.a`, in mm. */
  along: number;
  bottom: number;
  height: number;
  width: number;
  depth: number;
  /** Local z offset (mm) perpendicular to the wall, used for ajar door leaves. */
  offsetZ?: number;
  /** Y rotation (radians) relative to the wall, used for ajar door leaves. */
  rotationY?: number;
}

export function effectiveWallHeight(wall: Wall): number {
  if (wall.kind === 'low-wall') return Math.min(wall.height, LOW_WALL_HEIGHT);
  return wall.height;
}

/** Y-rotation (radians) that aligns a box's +x with the wall direction in world x/z. */
export function wallYaw(wall: Wall): number {
  return -Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
}

export function pointAlongWall(wall: Wall, distance: number): Point {
  const len = wallLength(wall);
  if (len < 1e-6) return { ...wall.a };
  const t = distance / len;
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

/** Doors, arches and sliding doors with a low threshold are walk-through. */
export function openingIsPassable(opening: Opening): boolean {
  return (
    (opening.kind === 'door' || opening.kind === 'arch' || opening.kind === 'sliding') &&
    opening.sill <= 150
  );
}

interface OpeningSpan {
  opening: Opening;
  start: number;
  end: number;
}

function openingSpans(wall: Wall, openings: Opening[]): OpeningSpan[] {
  const len = wallLength(wall);
  const spans: OpeningSpan[] = [];
  for (const opening of openings) {
    if (opening.wallId !== wall.id || opening.width <= 0) continue;
    const start = clamp(opening.offset, 0, len);
    const end = clamp(opening.offset + opening.width, 0, len);
    if (end - start < MIN_PART) continue;
    spans.push({ opening, start, end });
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  return spans;
}

export function segmentWall(
  wall: Wall,
  openings: Opening[],
  options: WallBuildOptions = {},
): WallBuild {
  const len = wallLength(wall);
  const height = effectiveWallHeight(wall);
  const cut = options.cutHeight ?? Number.POSITIVE_INFINITY;
  const yaw = wallYaw(wall);
  const thickness = wall.thickness;
  const boxes: WallBoxPart[] = [];
  const frames: WallOpeningFrame[] = [];

  const pushBox = (start: number, end: number, bottom: number, top: number, role: WallBoxPart['role']) => {
    const clippedBottom = Math.min(bottom, cut);
    const clippedTop = Math.min(top, cut);
    if (end - start < MIN_PART || clippedTop - clippedBottom < MIN_PART) return;
    const mid = (start + end) / 2;
    const point = pointAlongWall(wall, mid);
    boxes.push({
      key: `${wall.id}:${role}:${start.toFixed(1)}-${end.toFixed(1)}:${bottom.toFixed(1)}`,
      wallId: wall.id,
      role,
      start,
      end,
      bottom: clippedBottom,
      top: clippedTop,
      cx: point.x,
      cy: point.y,
      yaw,
      thickness,
      isLoadBearing: wall.isLoadBearing,
      wallKind: wall.kind,
    });
  };

  if (len < MIN_PART || height < MIN_PART) return { boxes, frames };

  let cursor = 0;
  for (const { opening, start, end } of openingSpans(wall, openings)) {
    const spanStart = Math.max(start, cursor);
    if (spanStart > cursor) pushBox(cursor, spanStart, 0, height, 'solid');

    if (end > spanStart) {
      const sill = clamp(opening.sill, 0, height);
      const top = clamp(opening.sill + opening.height, sill, height);
      if (sill > 0) pushBox(spanStart, end, 0, sill, 'sill');
      if (top < height) pushBox(spanStart, end, top, height, 'lintel');

      const clippedTop = Math.min(top, cut);
      if (clippedTop - Math.min(sill, cut) >= MIN_PART) {
        const mid = (spanStart + end) / 2;
        const point = pointAlongWall(wall, mid);
        frames.push({
          key: `${wall.id}:${opening.id}`,
          wallId: wall.id,
          openingId: opening.id,
          kind: opening.kind,
          start: spanStart,
          end,
          width: end - spanStart,
          bottom: Math.min(sill, cut),
          top: clippedTop,
          cx: point.x,
          cy: point.y,
          yaw,
          thickness,
          hinge: opening.swing.hinge,
          openIn: opening.swing.open === 'in',
        });
      }
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < len) pushBox(cursor, len, 0, height, 'solid');

  return { boxes, frames };
}

export function segmentWalls(
  walls: Wall[],
  openings: Opening[],
  options: WallBuildOptions = {},
): WallBuild {
  const boxes: WallBoxPart[] = [];
  const frames: WallOpeningFrame[] = [];
  for (const wall of walls) {
    const built = segmentWall(wall, openings, options);
    boxes.push(...built.boxes);
    frames.push(...built.frames);
  }
  return { boxes, frames };
}

/**
 * Door leaf / window glass / trim that fills an opening frame. Split out so it
 * can be unit tested without three.js.
 */
export function openingDetailParts(frame: WallOpeningFrame): OpeningDetailPart[] {
  const parts: OpeningDetailPart[] = [];
  const height = frame.top - frame.bottom;
  const width = frame.width;
  if (height < 20 || width < 20) return parts;

  const push = (part: Omit<OpeningDetailPart, 'key'>) => {
    if (part.width < 5 || part.height < 5 || part.depth < 2) return;
    parts.push({ ...part, key: `${frame.key}:${part.role}:${parts.length}` });
  };

  const trim = Math.min(60, Math.max(25, width * 0.06));
  const trimDepth = frame.thickness + 24;
  const jambHeight = Math.min(height, frame.top - frame.bottom);
  const headHeight = Math.min(trim, jambHeight);

  // Jambs + head are shared by every opening kind.
  push({ role: 'frame', along: frame.start + trim / 2, bottom: frame.bottom, height: jambHeight, width: trim, depth: trimDepth });
  push({ role: 'frame', along: frame.end - trim / 2, bottom: frame.bottom, height: jambHeight, width: trim, depth: trimDepth });
  if (headHeight > 0) {
    push({ role: 'frame', along: (frame.start + frame.end) / 2, bottom: frame.top - headHeight, height: headHeight, width, depth: trimDepth });
  }

  if (frame.kind === 'door') {
    // Ajar leaf so the passable door gap is visually honest.
    const leafWidth = Math.max(0, width - trim * 2 - 10);
    const swing = (72 * Math.PI) / 180;
    const direction = frame.hinge === 'start' ? 1 : -1;
    const side = frame.openIn ? 1 : -1;
    const dirX = direction * Math.cos(swing);
    const dirZ = side * Math.sin(swing);
    const hingeAlong = frame.hinge === 'start' ? frame.start + trim : frame.end - trim;
    push({
      role: 'leaf',
      along: hingeAlong + (leafWidth / 2) * dirX,
      offsetZ: (leafWidth / 2) * dirZ,
      rotationY: Math.atan2(-dirZ, dirX),
      bottom: frame.bottom + 20,
      height: Math.max(0, height - 60),
      width: leafWidth,
      depth: Math.min(52, frame.thickness * 0.45),
    });
  } else if (frame.kind === 'window') {
    push({
      role: 'glass',
      along: (frame.start + frame.end) / 2,
      bottom: frame.bottom + trim,
      height: Math.max(0, height - trim * 2),
      width: Math.max(0, width - trim * 2),
      depth: 16,
    });
    push({
      role: 'mullion',
      along: (frame.start + frame.end) / 2,
      bottom: frame.bottom + trim,
      height: Math.max(0, height - trim * 2),
      width: 42,
      depth: 30,
    });
    push({
      role: 'frame',
      along: (frame.start + frame.end) / 2,
      bottom: frame.bottom,
      height: Math.min(50, height),
      width,
      depth: frame.thickness + 50,
    });
  } else if (frame.kind === 'sliding') {
    const panelWidth = Math.max(0, width / 2 - trim);
    for (const sign of [-1, 1] as const) {
      push({
        role: 'glass',
        along: (frame.start + frame.end) / 2 + (sign * width) / 4,
        bottom: frame.bottom + trim,
        height: Math.max(0, height - trim * 2),
        width: panelWidth,
        depth: 22,
      });
    }
  }

  return parts;
}
