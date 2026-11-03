import {
  bboxFromPoints,
  polygonAreaSqm,
  roomBBox,
  roomLabelPoint,
  type Point,
  type Room,
} from '@hdesign/domain';

/** Model unit conversion: document coordinates are millimetres, three.js units are metres. */
export const MM_TO_M = 0.001;

export interface FloorShapePoint {
  x: number;
  y: number;
}

export interface FloorOutline {
  roomId: string;
  /** Outline in THREE.Shape space: x = plan x, y = -plan y (so a -90° X rotation maps y to world z). */
  points: FloorShapePoint[];
  areaSqm: number;
  /** Plan-space label anchor in mm, guaranteed inside the polygon. */
  label: Point;
  /** Room bbox in plan mm. */
  bbox: { x: number; y: number; w: number; h: number };
}

/** Floor outline used by `<ShapeGeometry>` — pure so it can be unit tested. */
export function roomFloorOutline(room: Room): FloorOutline {
  return {
    roomId: room.id,
    points: room.polygon.map((point) => ({
      x: point.x * MM_TO_M,
      y: -point.y * MM_TO_M,
    })),
    areaSqm: polygonAreaSqm(room.polygon),
    label: roomLabelPoint(room),
    bbox: roomBBox(room),
  };
}

/** World-space position (metres) of a room label sprite. */
export function roomLabelWorld(
  room: Room,
  heightMm = 260,
): [number, number, number] {
  const point = roomLabelPoint(room);
  return [point.x * MM_TO_M, heightMm * MM_TO_M, point.y * MM_TO_M];
}

export function roomLabelText(room: Room): { title: string; subtitle: string } {
  return { title: room.name, subtitle: `${polygonAreaSqm(room.polygon).toFixed(1)} ㎡` };
}

/** Ceiling plane height in metres for a room. */
export function roomCeilingHeightM(room: Room): number {
  return room.ceiling.height * MM_TO_M;
}

/** Normalised floor material key for texture selection. */
export function floorMaterialKind(materialId: string): 'wood' | 'tile' | 'stone' | 'carpet' | 'plain' {
  const id = materialId.toLowerCase();
  if (id.includes('wood') || id.includes('oak') || id.includes('walnut') || id.includes('timber')) return 'wood';
  if (id.includes('anti-slip') || id.includes('vinyl')) return 'tile';
  if (id.includes('tile') || id.includes('ceramic') || id.includes('porcelain')) return 'tile';
  if (id.includes('stone') || id.includes('marble') || id.includes('terrazzo')) return 'stone';
  if (id.includes('carpet') || id.includes('rug')) return 'carpet';
  return 'plain';
}

/** Overall extent used to size the ground plane and shadow camera. */
export function outlineExtent(outline: FloorOutline): { widthM: number; depthM: number } {
  const box = bboxFromPoints(
    outline.points.map((point) => ({ x: point.x, y: -point.y })),
  );
  return { widthM: Math.max(box.w, 0.5), depthM: Math.max(box.h, 0.5) };
}
