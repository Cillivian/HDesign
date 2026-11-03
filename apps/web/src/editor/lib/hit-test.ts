import {
  bboxFromPoints,
  distance,
  distanceToSegment,
  pointInPolygon,
  rotatePoint,
  type Annotation,
  type BBox,
  type FurnitureItem,
  type Layer,
  type Point,
  type Project,
  type Wall,
} from '@hdesign/domain';
import type { Selection } from '../../store/ui-store';
import { footprintCorners } from './collision';
import { openingAtPoint } from './openings';
import { annotationBBox } from './transform';
import type { ResizeCorner } from './furniture';

export type EntityKind = Exclude<Selection['kind'], 'none'>;

export interface HitResult {
  kind: EntityKind;
  id: string;
}

export type SelectionHandle =
  | { type: 'rotate'; point: Point }
  | { type: 'resize'; corner: ResizeCorner; point: Point }
  | { type: 'vertex'; wallEnd: 'a' | 'b'; point: Point };

function itemCorners(item: FurnitureItem): Point[] {
  return footprintCorners(item);
}

export function pointInFurniture(item: FurnitureItem, point: Point): boolean {
  return pointInPolygon(point, itemCorners(item));
}

function annotationHit(annotation: Annotation, point: Point, tolerance: number): boolean {
  if (annotation.kind === 'text') {
    const origin = annotation.points[0];
    if (!origin) return false;
    const box = annotationBBox(annotation);
    return (
      point.x >= box.x - tolerance &&
      point.x <= box.x + box.w + tolerance &&
      point.y >= box.y - tolerance &&
      point.y <= box.y + box.h + tolerance
    );
  }
  return (
    distanceToSegment(
      point,
      annotation.points[0]!,
      annotation.points[1] ?? annotation.points[0]!,
    ) <=
    tolerance * 2
  );
}

/**
 * Hit test in world space, respecting layer order (topmost layer wins), layer
 * visibility and lock state. Handle hit tests are handled separately so drawing
 * tools can ignore selection chrome.
 */
export function hitTestPoint(
  doc: Project,
  layers: Layer[],
  point: Point,
  tolerance: number,
): HitResult | null {
  const ordered = [...layers].sort((first, second) => second.order - first.order);

  for (const layer of ordered) {
    if (!layer.visible || layer.locked) continue;
    const layerId = layer.id;

    for (const annotation of doc.annotations) {
      if (annotation.layerId !== layerId) continue;
      if (annotationHit(annotation, point, tolerance)) {
        return { kind: 'annotation', id: annotation.id };
      }
    }

    for (const device of doc.mep.devices) {
      if (device.layerId !== layerId) continue;
      const radius = Math.max(140, tolerance * 2.5);
      if (distance(point, { x: device.x, y: device.y }) <= radius) {
        return { kind: 'mep', id: device.id };
      }
    }

    for (let index = doc.furniture.length - 1; index >= 0; index -= 1) {
      const item = doc.furniture[index]!;
      if (item.layerId !== layerId) continue;
      if (pointInFurniture(item, point)) return { kind: 'furniture', id: item.id };
    }

    const openingHit = openingAtPoint(
      doc.openings.filter((opening) => opening.layerId === layerId),
      doc.walls,
      point,
      tolerance,
    );
    if (openingHit) return { kind: 'opening', id: openingHit.opening.id };

    for (let index = doc.walls.length - 1; index >= 0; index -= 1) {
      const wall = doc.walls[index]!;
      if (wall.layerId !== layerId) continue;
      if (distanceToSegment(point, wall.a, wall.b) <= wall.thickness / 2 + tolerance) {
        return { kind: 'wall', id: wall.id };
      }
    }

    for (let index = doc.rooms.length - 1; index >= 0; index -= 1) {
      const room = doc.rooms[index]!;
      if (room.layerId !== layerId) continue;
      if (pointInPolygon(point, room.polygon)) return { kind: 'room', id: room.id };
    }
  }

  return null;
}

/** Rotated corner positions of a single furniture item, in world units. */
export function furnitureCornerPoints(
  item: FurnitureItem,
): Array<{ corner: ResizeCorner; point: Point }> {
  const corners = itemCorners(item);
  const order: ResizeCorner[] = ['nw', 'ne', 'se', 'sw'];
  return corners.map((point, index) => ({ corner: order[index]!, point }));
}

/** World position of the rotate handle: outside the top edge of the item. */
export function rotateHandlePoint(item: FurnitureItem, offsetWorld: number): Point {
  const center = { x: item.x, y: item.y };
  const topCenterLocal = { x: 0, y: -item.d / 2 };
  const topCenter = rotatePoint(
    { x: center.x + topCenterLocal.x, y: center.y + topCenterLocal.y },
    center,
    item.rotation,
  );
  const rad = (item.rotation * Math.PI) / 180;
  const up = { x: Math.sin(rad), y: -Math.cos(rad) };
  return { x: topCenter.x + up.x * offsetWorld, y: topCenter.y + up.y * offsetWorld };
}

/** Selection chrome handles for the current selection (world units). */
export function selectionHandles(
  doc: Project,
  selection: Selection,
  worldPerPixel: number,
): SelectionHandle[] {
  const handleOffset = 36 * worldPerPixel;
  if (selection.kind === 'furniture' && selection.ids.length === 1) {
    const item = doc.furniture.find((entry) => entry.id === selection.ids[0]);
    if (!item || item.locked) return [];
    const handles: SelectionHandle[] = furnitureCornerPoints(item).map(({ corner, point }) => ({
      type: 'resize' as const,
      corner,
      point,
    }));
    handles.push({ type: 'rotate', point: rotateHandlePoint(item, handleOffset) });
    return handles;
  }
  if (selection.kind === 'wall' && selection.ids.length === 1) {
    const wall = doc.walls.find((entry) => entry.id === selection.ids[0]);
    if (!wall) return [];
    return [
      { type: 'vertex', wallEnd: 'a', point: { ...wall.a } },
      { type: 'vertex', wallEnd: 'b', point: { ...wall.b } },
    ];
  }
  return [];
}

export function hitTestHandle(
  handles: SelectionHandle[],
  point: Point,
  tolerance: number,
): SelectionHandle | null {
  let best: SelectionHandle | null = null;
  let bestDistance = tolerance;
  for (const handle of handles) {
    const handleDistance = distance(point, handle.point);
    if (handleDistance <= bestDistance) {
      bestDistance = handleDistance;
      best = handle;
    }
  }
  return best;
}

/** Screen-space axis aligned bounds of the current selection, for the marquee/outline. */
export function selectionBBox(doc: Project, selection: Selection): BBox | null {
  const points: Point[] = [];
  const addWall = (wall: Wall) => points.push(wall.a, wall.b);
  switch (selection.kind) {
    case 'wall':
      doc.walls.filter((wall) => selection.ids.includes(wall.id)).forEach(addWall);
      break;
    case 'opening': {
      for (const opening of doc.openings) {
        if (!selection.ids.includes(opening.id)) continue;
        const wall = doc.walls.find((entry) => entry.id === opening.wallId);
        if (!wall) continue;
        const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
        const start = opening.offset / length;
        const end = (opening.offset + opening.width) / length;
        points.push(
          {
            x: wall.a.x + (wall.b.x - wall.a.x) * start,
            y: wall.a.y + (wall.b.y - wall.a.y) * start,
          },
          {
            x: wall.a.x + (wall.b.x - wall.a.x) * end,
            y: wall.a.y + (wall.b.y - wall.a.y) * end,
          },
        );
      }
      break;
    }
    case 'room':
      doc.rooms
        .filter((room) => selection.ids.includes(room.id))
        .forEach((room) => points.push(...room.polygon));
      break;
    case 'furniture':
      doc.furniture
        .filter((item) => selection.ids.includes(item.id))
        .forEach((item) => points.push(...itemCorners(item)));
      break;
    case 'mep':
      doc.mep.devices
        .filter((device) => selection.ids.includes(device.id))
        .forEach((device) => {
          points.push(
            { x: device.x - 120, y: device.y - 120 },
            { x: device.x + 120, y: device.y + 120 },
          );
        });
      break;
    case 'annotation':
      doc.annotations
        .filter((annotation) => selection.ids.includes(annotation.id))
        .forEach((annotation) => {
          const box = annotationBBox(annotation);
          points.push({ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h });
        });
      break;
    case 'none':
      return null;
  }
  if (points.length === 0) return null;
  return bboxFromPoints(points);
}

/** Furniture within a marquee rectangle (top-left / bottom-right world points). */
export function furnitureInBox(doc: Project, from: Point, to: Point): string[] {
  const box = bboxFromPoints([from, to]);
  return doc.furniture
    .filter((item) => {
      const center = { x: item.x, y: item.y };
      return (
        center.x >= box.x &&
        center.x <= box.x + box.w &&
        center.y >= box.y &&
        center.y <= box.y + box.h
      );
    })
    .map((item) => item.id);
}

/** Walls fully inside a marquee rectangle (both endpoints inside). */
export function wallsInBox(doc: Project, from: Point, to: Point): string[] {
  const box = bboxFromPoints([from, to]);
  const inside = (point: Point) =>
    point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  return doc.walls.filter((wall) => inside(wall.a) && inside(wall.b)).map((wall) => wall.id);
}

/** Rooms whose centroid falls inside the marquee rectangle. */
export function roomsInBox(doc: Project, from: Point, to: Point): string[] {
  const box = bboxFromPoints([from, to]);
  return doc.rooms
    .filter((room) => {
      const total = room.polygon.reduce(
        (accumulator, point) => ({
          x: accumulator.x + point.x / room.polygon.length,
          y: accumulator.y + point.y / room.polygon.length,
        }),
        { x: 0, y: 0 },
      );
      return (
        total.x >= box.x && total.x <= box.x + box.w && total.y >= box.y && total.y <= box.y + box.h
      );
    })
    .map((room) => room.id);
}
