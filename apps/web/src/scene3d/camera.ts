import {
  bboxUnion,
  bboxFromPoints,
  clamp,
  roomBBox,
  roomLabelPoint,
  type FurnitureItem,
  type Point,
  type Room,
  type Wall,
} from '@hdesign/domain';

/** Camera / sunlight math for the 3D scene. Pure functions, mm in — metres out. */

export const MM_TO_M = 0.001;

export interface SceneBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  center: Point;
  widthMm: number;
  depthMm: number;
  /** Longest plan extent (mm), used to scale camera distances / shadow frustum. */
  spanMm: number;
}

export function sceneBounds(walls: Wall[], rooms: Room[], furniture: FurnitureItem[]): SceneBounds {
  let box: { x: number; y: number; w: number; h: number } | null = null;
  const points: Point[] = [];
  for (const wall of walls) points.push(wall.a, wall.b);
  for (const room of rooms) points.push(...room.polygon);
  for (const item of furniture) {
    points.push(
      { x: item.x - item.w / 2, y: item.y - item.d / 2 },
      { x: item.x + item.w / 2, y: item.y + item.d / 2 },
    );
  }
  if (points.length > 0) box = bboxFromPoints(points);
  if (!box || box.w < 100 || box.h < 100) box = { x: 0, y: 0, w: 10000, h: 7000 };
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.w,
    maxY: box.y + box.h,
    center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
    widthMm: box.w,
    depthMm: box.h,
    spanMm: Math.max(box.w, box.h),
  };
}

export function unionBounds(bounds: SceneBounds, extra: { x: number; y: number; w: number; h: number }): SceneBounds {
  const box = bboxUnion(
    { x: bounds.minX, y: bounds.minY, w: bounds.widthMm, h: bounds.depthMm },
    extra,
  );
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.w,
    maxY: box.y + box.h,
    center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
    widthMm: box.w,
    depthMm: box.h,
    spanMm: Math.max(box.w, box.h),
  };
}

export type OrbitPreset = 'top' | 'bird' | 'corner';

export interface CameraPose {
  /** World position in metres. */
  position: [number, number, number];
  /** Look-at target in metres. */
  target: [number, number, number];
  fov?: number;
}

function spanMeters(bounds: SceneBounds): number {
  return Math.max(bounds.spanMm * MM_TO_M, 3);
}

export function orbitPose(kind: OrbitPreset, bounds: SceneBounds): CameraPose {
  const span = spanMeters(bounds);
  const cx = bounds.center.x * MM_TO_M;
  const cz = bounds.center.y * MM_TO_M;
  if (kind === 'top') {
    // Wide fov + generous height so the whole plan fits the portrait-ish canvas
    // even with the side panels open.
    const height = span * 1.3 + 2.5;
    return {
      position: [cx, height, cz + 0.001],
      target: [cx, 0, cz],
      fov: 50,
    };
  }
  if (kind === 'corner') {
    const dist = span * 1.02 + 2.5;
    return {
      position: [cx + dist * 0.78, dist * 0.58 + 1.5, cz + dist * 0.84],
      target: [cx, 0.6, cz],
      fov: 45,
    };
  }
  const dist = span * 1.1 + 2;
  return {
    position: [cx + dist * 0.52, dist * 0.78 + 1.5, cz + dist * 0.8],
    target: [cx, 0, cz],
    fov: 42,
  };
}

/** Close-up pose used when focusing a room / selected entity. */
export function focusPose(
  center: Point,
  radiusMm: number,
  kind: OrbitPreset = 'bird',
  targetHeightMm = 350,
): CameraPose {
  const radius = Math.max(radiusMm * MM_TO_M, 0.6);
  const dist = clamp(radius * 2.8 + 1.2, 2.4, 16);
  const cx = center.x * MM_TO_M;
  const cz = center.y * MM_TO_M;
  const ty = Math.max(targetHeightMm * MM_TO_M, 0.2);
  if (kind === 'corner') {
    return {
      position: [cx + dist * 0.92, dist * 0.34 + 0.9, cz + dist * 0.9],
      target: [cx, ty, cz],
      fov: 45,
    };
  }
  return {
    position: [cx + dist * 0.55, dist * 0.72 + 1.1, cz + dist * 0.7],
    target: [cx, ty, cz],
    fov: 42,
  };
}

export function roomFocusPose(room: Room, kind: OrbitPreset = 'bird'): CameraPose {
  const box = roomBBox(room);
  const radius = Math.max(box.w, box.h) / 2;
  return focusPose(roomLabelPoint(room), radius, kind, 500);
}

export function entityFocusPose(center: Point, radiusMm: number): CameraPose {
  return focusPose(center, radiusMm, 'bird');
}
