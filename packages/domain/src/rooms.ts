import { bboxFromPoints, pointInPolygon, polygonAreaSqm, polygonCentroid } from './geometry';
import type { BBox, Point, Room } from './schema';

export function roomAreaSqm(room: Room): number {
  return polygonAreaSqm(room.polygon);
}

export function roomCentroid(room: Room): Point {
  return polygonCentroid(room.polygon);
}

export function roomBBox(room: Room): BBox {
  return bboxFromPoints(room.polygon);
}

/** A point guaranteed to be inside the room polygon: centroid when valid, bbox center otherwise. */
export function roomLabelPoint(room: Room): Point {
  const centroid = polygonCentroid(room.polygon);
  if (pointInPolygon(centroid, room.polygon)) return centroid;
  const box = roomBBox(room);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function roomContainsPoint(room: Room, point: Point): boolean {
  return pointInPolygon(point, room.polygon);
}

export function findRoomAt(rooms: Room[], point: Point): Room | undefined {
  return rooms.find((room) => roomContainsPoint(room, point));
}

export function roomLongestEdge(room: Room): { a: Point; b: Point; length: number } {
  let best = { a: room.polygon[0]!, b: room.polygon[1] ?? room.polygon[0]!, length: 0 };
  for (let i = 0; i < room.polygon.length; i += 1) {
    const a = room.polygon[i]!;
    const b = room.polygon[(i + 1) % room.polygon.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > best.length) best = { a, b, length };
  }
  return best;
}

export function rectPolygon(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function totalRoomAreaSqm(rooms: Room[]): number {
  return rooms.reduce((sum, room) => sum + roomAreaSqm(room), 0);
}
