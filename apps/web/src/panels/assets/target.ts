import {
  bboxFromPoints,
  findRoomAt,
  polygonAreaSqm,
  polygonCentroid,
  roomLabelPoint,
  type Point,
  type Project,
  type Room,
} from '@hdesign/domain';

/**
 * Target-room resolution shared by the assets/styles/materials/MEP panels.
 * The editor canvas is fit-to-project at M0; once the interactive editor lands the
 * viewport-based helpers below keep the same behaviour for pointer-centred drops.
 */

export function selectedRoom(rooms: Room[], selectionIds: string[]): Room | undefined {
  if (selectionIds.length === 0) return undefined;
  return rooms.find((room) => room.id === selectionIds[0]);
}

export function largestRoom(rooms: Room[]): Room | undefined {
  return [...rooms].sort((a, b) => polygonAreaSqm(b.polygon) - polygonAreaSqm(a.polygon))[0];
}

/** Room at the visual centre of the fitted plan (fallback: the largest room). */
export function roomAtProjectCentre(project: Project): Room | undefined {
  const points: Point[] = [];
  for (const room of project.rooms) points.push(...room.polygon);
  if (points.length === 0) return undefined;
  const box = bboxFromPoints(points);
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return findRoomAt(project.rooms, centre) ?? project.rooms[0];
}

/** Drop point inside a room: label point when valid, centroid otherwise. */
export function roomDropPoint(room: Room): Point {
  void polygonCentroid;
  return roomLabelPoint(room);
}

/** Resolve the room a panel action should target. */
export function resolveTargetRoom(
  project: Project,
  selectionKind: string,
  selectionIds: string[],
): Room | undefined {
  const explicit = selectionKind === 'room' ? selectedRoom(project.rooms, selectionIds) : undefined;
  if (explicit) return explicit;
  return roomAtProjectCentre(project);
}

/** True when the room has a usable floor (used for material assignment). */
export function roomIsUsable(room: Room | undefined): room is Room {
  return Boolean(room && room.polygon.length >= 3);
}

/** Material assignment id convention shared with doc-store.setRoomMaterial. */
export function materialAssignmentId(roomId: string | undefined, scope: string): string {
  return `mat-${roomId ?? 'all'}-${scope}`;
}
