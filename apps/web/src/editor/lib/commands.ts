import {
  clamp,
  createOpening,
  createRoom,
  createId,
  findRoomAt,
  polygonAreaSqm,
  polygonCentroid,
  type Layer,
  type MepDevice,
  type Opening,
  type Project,
  type RoomFace,
  type Wall,
} from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useUiStore, type Selection } from '../../store/ui-store';
import { duplicateFurnitureItem } from './furniture';
import { clampOpeningToWall, wallDirectionUnit, wallLengthValue } from './openings';

/**
 * Discrete editor commands (selection-scoped). Each function produces exactly
 * one undo step; continuous gestures are batched by the interaction layer using
 * beginGesture/endGesture instead.
 */

export interface CommandResult {
  affected: number;
  blocked: number;
  message?: string;
}

function selectionLayerIds(doc: Project, selection: Selection): string[] {
  const ids = selection.ids;
  switch (selection.kind) {
    case 'wall':
      return doc.walls.filter((wall) => ids.includes(wall.id)).map((wall) => wall.layerId);
    case 'opening':
      return doc.openings
        .filter((opening) => ids.includes(opening.id))
        .map((opening) => opening.layerId);
    case 'room':
      return doc.rooms.filter((room) => ids.includes(room.id)).map((room) => room.layerId);
    case 'furniture':
      return doc.furniture.filter((item) => ids.includes(item.id)).map((item) => item.layerId);
    case 'mep':
      return doc.mep.devices
        .filter((device) => ids.includes(device.id))
        .map((device) => device.layerId);
    case 'annotation':
      return doc.annotations
        .filter((annotation) => ids.includes(annotation.id))
        .map((annotation) => annotation.layerId);
    default:
      return [];
  }
}

function lockedLayerIds(doc: Project, selection: Selection): string[] {
  const ids = new Set(selectionLayerIds(doc, selection));
  return doc.layers.filter((layer) => ids.has(layer.id) && layer.locked).map((layer) => layer.id);
}

export function selectionHasLockedLayer(doc: Project, selection: Selection): boolean {
  return lockedLayerIds(doc, selection).length > 0;
}

export function selectionLockedLayerNames(doc: Project, selection: Selection): string[] {
  const ids = new Set(lockedLayerIds(doc, selection));
  return doc.layers.filter((layer) => ids.has(layer.id)).map((layer) => layer.name);
}

export function selectionEntityCounts(
  doc: Project,
  selection: Selection,
): Array<{ kind: string; count: number }> {
  const ids = new Set(selection.ids);
  switch (selection.kind) {
    case 'wall':
      return [{ kind: '墙体', count: doc.walls.filter((wall) => ids.has(wall.id)).length }];
    case 'opening':
      return [
        { kind: '门窗', count: doc.openings.filter((opening) => ids.has(opening.id)).length },
      ];
    case 'room':
      return [{ kind: '房间', count: doc.rooms.filter((room) => ids.has(room.id)).length }];
    case 'furniture':
      return [{ kind: '家具', count: doc.furniture.filter((item) => ids.has(item.id)).length }];
    case 'mep':
      return [
        { kind: '点位', count: doc.mep.devices.filter((device) => ids.has(device.id)).length },
      ];
    case 'annotation':
      return [
        {
          kind: '标注',
          count: doc.annotations.filter((annotation) => ids.has(annotation.id)).length,
        },
      ];
    default:
      return [];
  }
}

export function deleteSelection(): CommandResult {
  const doc = useDocStore.getState().doc;
  const ui = useUiStore.getState();
  const selection = ui.selection;
  if (selection.kind === 'none' || selection.ids.length === 0) return { affected: 0, blocked: 0 };
  if (selectionHasLockedLayer(doc, selection)) {
    const names = selectionLockedLayerNames(doc, selection);
    return {
      affected: 0,
      blocked: selection.ids.length,
      message: `图层已锁定：${names.join('、')}`,
    };
  }

  const ids = new Set(selection.ids);
  useDocStore.getState().commit((draft) => {
    switch (selection.kind) {
      case 'wall': {
        const wallIds = new Set(
          draft.walls.filter((wall) => ids.has(wall.id)).map((wall) => wall.id),
        );
        draft.walls = draft.walls.filter((wall) => !wallIds.has(wall.id));
        draft.openings = draft.openings.filter((opening) => !wallIds.has(opening.wallId));
        for (const device of draft.mep.devices) {
          if (device.wallId && wallIds.has(device.wallId)) {
            delete device.wallId;
            delete device.t;
          }
        }
        // Rooms are derived from walls; drop rooms that no longer have any wall nearby.
        break;
      }
      case 'opening':
        draft.openings = draft.openings.filter((opening) => !ids.has(opening.id));
        break;
      case 'room':
        draft.rooms = draft.rooms.filter((room) => !ids.has(room.id));
        for (const item of draft.furniture) {
          if (item.roomId && ids.has(item.roomId)) item.roomId = undefined;
        }
        for (const device of draft.mep.devices) {
          if (device.roomId && ids.has(device.roomId)) device.roomId = undefined;
        }
        draft.materials = draft.materials.filter(
          (material) => !material.roomId || !ids.has(material.roomId),
        );
        break;
      case 'furniture':
        draft.furniture = draft.furniture.filter((item) => !ids.has(item.id));
        break;
      case 'mep':
        draft.mep.devices = draft.mep.devices.filter((device) => !ids.has(device.id));
        for (const circuit of draft.mep.circuits) {
          circuit.deviceIds = circuit.deviceIds.filter((deviceId) => !ids.has(deviceId));
        }
        break;
      case 'annotation':
        draft.annotations = draft.annotations.filter((annotation) => !ids.has(annotation.id));
        break;
      default:
        break;
    }
  });

  ui.clearSelection();
  return { affected: ids.size, blocked: 0 };
}

export function duplicateSelection(offset = 240): CommandResult {
  const ui = useUiStore.getState();
  const selection = ui.selection;
  if (selection.kind === 'none' || selection.ids.length === 0) return { affected: 0, blocked: 0 };

  const ids = new Set(selection.ids);
  const newIds: string[] = [];

  useDocStore.getState().commit((draft) => {
    switch (selection.kind) {
      case 'wall': {
        const wallMap = new Map<string, Wall>();
        for (const wall of draft.walls) {
          if (!ids.has(wall.id)) continue;
          const copy: Wall = {
            ...wall,
            id: createId('wall'),
            a: { x: wall.a.x + offset, y: wall.a.y + offset },
            b: { x: wall.b.x + offset, y: wall.b.y + offset },
            meta: undefined,
          };
          draft.walls.push(copy);
          wallMap.set(wall.id, copy);
          newIds.push(copy.id);
        }
        const newOpenings: Opening[] = [];
        for (const opening of draft.openings) {
          const host = wallMap.get(opening.wallId);
          if (!host) continue;
          const copy: Opening = {
            ...opening,
            id: createId('opening'),
            wallId: host.id,
            meta: undefined,
          };
          newOpenings.push(copy);
        }
        draft.openings.push(...newOpenings);
        break;
      }
      case 'opening': {
        for (const opening of draft.openings) {
          if (!ids.has(opening.id)) continue;
          const wall = draft.walls.find((entry) => entry.id === opening.wallId);
          const copy: Opening = { ...opening, id: createId('opening'), meta: undefined };
          if (wall) {
            const length = wallLengthValue(wall);
            copy.offset = clamp(
              opening.offset + opening.width,
              0,
              Math.max(0, length - opening.width),
            );
          }
          draft.openings.push(copy);
          newIds.push(copy.id);
        }
        break;
      }
      case 'room': {
        for (const room of draft.rooms) {
          if (!ids.has(room.id)) continue;
          const copy = {
            ...room,
            id: createId('room'),
            name: `${room.name} 副本`,
            polygon: room.polygon.map((point) => ({ x: point.x + offset, y: point.y + offset })),
            meta: undefined,
          };
          draft.rooms.push(copy);
          newIds.push(copy.id);
        }
        break;
      }
      case 'furniture': {
        for (const item of draft.furniture) {
          if (!ids.has(item.id)) continue;
          const copy = duplicateFurnitureItem(item, offset);
          draft.furniture.push(copy);
          newIds.push(copy.id);
        }
        break;
      }
      case 'mep': {
        for (const device of draft.mep.devices) {
          if (!ids.has(device.id)) continue;
          const copy: MepDevice = {
            ...device,
            id: createId('mep'),
            x: device.x + offset,
            y: device.y + offset,
            meta: undefined,
          };
          draft.mep.devices.push(copy);
          if (copy.circuitId) {
            const circuit = draft.mep.circuits.find((entry) => entry.id === copy.circuitId);
            if (circuit) circuit.deviceIds.push(copy.id);
          }
          newIds.push(copy.id);
        }
        break;
      }
      case 'annotation': {
        for (const annotation of draft.annotations) {
          if (!ids.has(annotation.id)) continue;
          const copy = {
            ...annotation,
            id: createId('note'),
            points: annotation.points.map((point) => ({
              x: point.x + offset,
              y: point.y + offset,
            })),
            meta: undefined,
          };
          draft.annotations.push(copy);
          newIds.push(copy.id);
        }
        break;
      }
      default:
        break;
    }
  });

  if (newIds.length) ui.setSelection(selection.kind, newIds);
  return { affected: newIds.length, blocked: 0 };
}

export function nudgeSelection(dx: number, dy: number): CommandResult {
  const selection = useUiStore.getState().selection;
  if (selection.kind === 'none' || selection.ids.length === 0) return { affected: 0, blocked: 0 };
  const doc = useDocStore.getState().doc;
  if (selectionHasLockedLayer(doc, selection)) {
    return { affected: 0, blocked: selection.ids.length, message: '图层已锁定，无法移动' };
  }
  const ids = new Set(selection.ids);
  useDocStore.getState().commit((draft) => {
    switch (selection.kind) {
      case 'wall':
        for (const wall of draft.walls) {
          if (!ids.has(wall.id)) continue;
          wall.a = { x: wall.a.x + dx, y: wall.a.y + dy };
          wall.b = { x: wall.b.x + dx, y: wall.b.y + dy };
        }
        break;
      case 'opening':
        for (const opening of draft.openings) {
          if (!ids.has(opening.id)) continue;
          const wall = draft.walls.find((entry) => entry.id === opening.wallId);
          if (!wall) continue;
          const direction = wallDirectionUnit(wall);
          const along = dx * direction.x + dy * direction.y;
          const clamped = clampOpeningToWall(wall, {
            offset: opening.offset + along,
            width: opening.width,
          });
          opening.offset = clamped.offset;
        }
        break;
      case 'room':
        for (const room of draft.rooms) {
          if (!ids.has(room.id)) continue;
          room.polygon = room.polygon.map((point) => ({ x: point.x + dx, y: point.y + dy }));
        }
        break;
      case 'furniture':
        for (const item of draft.furniture) {
          if (!ids.has(item.id)) continue;
          item.x += dx;
          item.y += dy;
          item.roomId = findRoomAt(draft.rooms, { x: item.x, y: item.y })?.id;
        }
        break;
      case 'mep':
        for (const device of draft.mep.devices) {
          if (!ids.has(device.id)) continue;
          device.x += dx;
          device.y += dy;
        }
        break;
      case 'annotation':
        for (const annotation of draft.annotations) {
          if (!ids.has(annotation.id)) continue;
          annotation.points = annotation.points.map((point) => ({
            x: point.x + dx,
            y: point.y + dy,
          }));
        }
        break;
      default:
        break;
    }
  });
  return { affected: ids.size, blocked: 0 };
}

/** Toggle furniture item-level locks, or layer locks for other entity kinds. */
export function toggleSelectionLock(): CommandResult & { locked: boolean } {
  const doc = useDocStore.getState().doc;
  const selection = useUiStore.getState().selection;
  if (selection.kind === 'none' || selection.ids.length === 0) {
    return { affected: 0, blocked: 0, locked: false };
  }
  const ids = new Set(selection.ids);

  if (selection.kind === 'furniture') {
    const items = doc.furniture.filter((item) => ids.has(item.id));
    const nextLocked = items.some((item) => !item.locked);
    useDocStore.getState().commit((draft) => {
      for (const item of draft.furniture) {
        if (ids.has(item.id)) item.locked = nextLocked;
      }
    });
    return { affected: items.length, blocked: 0, locked: nextLocked };
  }

  const layerIds = new Set(selectionLayerIds(doc, selection));
  const layers = doc.layers.filter((layer) => layerIds.has(layer.id));
  const nextLocked = layers.some((layer) => !layer.locked);
  useDocStore.getState().commit((draft) => {
    for (const layer of draft.layers) {
      if (layerIds.has(layer.id)) layer.locked = nextLocked;
    }
  });
  return {
    affected: layers.length,
    blocked: 0,
    locked: nextLocked,
    message: nextLocked ? '已锁定所选对象所在图层' : '已解锁所选对象所在图层',
  };
}

function reorderSelectedToBoundary(
  selection: Selection,
  boundary: 'front' | 'back',
): CommandResult {
  const ids = new Set(selection.ids);
  if (selection.kind === 'none' || ids.size === 0) return { affected: 0, blocked: 0 };
  useDocStore.getState().commit((draft) => {
    const reorder = <T extends { id: string }>(items: T[]): T[] => {
      const selected = items.filter((item) => ids.has(item.id));
      const rest = items.filter((item) => !ids.has(item.id));
      return boundary === 'front' ? [...rest, ...selected] : [...selected, ...rest];
    };
    switch (selection.kind) {
      case 'furniture':
        draft.furniture = reorder(draft.furniture);
        break;
      case 'mep':
        draft.mep.devices = reorder(draft.mep.devices);
        break;
      case 'annotation':
        draft.annotations = reorder(draft.annotations);
        break;
      case 'wall':
        draft.walls = reorder(draft.walls);
        break;
      case 'room':
        draft.rooms = reorder(draft.rooms);
        break;
      case 'opening':
        draft.openings = reorder(draft.openings);
        break;
      default:
        break;
    }
  });
  return { affected: ids.size, blocked: 0 };
}

export function bringSelectionToFront(): CommandResult {
  return reorderSelectedToBoundary(useUiStore.getState().selection, 'front');
}

export function sendSelectionToBack(): CommandResult {
  return reorderSelectedToBoundary(useUiStore.getState().selection, 'back');
}

export interface CreateRoomsResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Turn detected wall faces into room entities.
 *
 * - A face that matches an existing room (same footprint) is skipped, so the
 *   command is idempotent.
 * - When a wall partitions an existing room, the detected sub-faces replace that
 *   room's polygon (keeping its name/type) and create rooms for the rest.
 */
export function createRoomsFromFaces(faces: RoomFace[]): CreateRoomsResult {
  const doc = useDocStore.getState().doc;
  const existing = doc.rooms;
  const plans: Array<
    | { kind: 'create'; face: RoomFace; name: string }
    | { kind: 'replace'; roomId: string; face: RoomFace }
  > = [];
  let skipped = 0;

  const grouped = new Map<string, Array<{ face: RoomFace; areaSqm: number }>>();
  const unmatched: Array<{ face: RoomFace; areaSqm: number }> = [];

  for (const face of faces) {
    const centroid = face.centroid ?? polygonCentroid(face.polygon);
    const containing = findRoomAt(existing, centroid);
    if (!containing) {
      unmatched.push({ face, areaSqm: face.areaSqm });
      continue;
    }
    const roomArea = Math.abs(polygonAreaSqm(containing.polygon));
    const ratio = face.areaSqm / Math.max(roomArea, 1e-6);
    if (ratio > 0.92) {
      skipped += 1;
      continue;
    }
    const list = grouped.get(containing.id) ?? [];
    list.push({ face, areaSqm: face.areaSqm });
    grouped.set(containing.id, list);
  }

  for (const [roomId, group] of grouped) {
    const room = existing.find((entry) => entry.id === roomId);
    if (!room) continue;
    group.sort((first, second) => second.areaSqm - first.areaSqm);
    const [primary, ...rest] = group;
    if (!primary) continue;
    plans.push({ kind: 'replace', roomId, face: primary.face });
    rest.forEach((entry, index) => {
      plans.push({
        kind: 'create',
        face: entry.face,
        name: `${room.name} ${index + 2}`,
      });
    });
  }

  unmatched.sort((first, second) => second.areaSqm - first.areaSqm);
  let createIndex = 0;
  for (const entry of unmatched) {
    createIndex += 1;
    plans.push({
      kind: 'create',
      face: entry.face,
      name: `房间 ${existing.length + createIndex}`,
    });
  }

  const created = plans.filter((plan) => plan.kind === 'create').length;
  const updated = plans.filter((plan) => plan.kind === 'replace').length;
  if (plans.length === 0) return { created: 0, updated: 0, skipped };

  useDocStore.getState().commit((draft) => {
    for (const plan of plans) {
      if (plan.kind === 'replace') {
        const room = draft.rooms.find((entry) => entry.id === plan.roomId);
        if (!room) continue;
        room.polygon = plan.face.polygon.map((point) => ({ ...point }));
        room.meta = { ...room.meta, source: 'auto' };
        continue;
      }
      draft.rooms.push(
        createRoom(plan.face.polygon, {
          name: plan.name,
          type: 'other',
          meta: { source: 'auto' },
        }),
      );
    }
  });

  return { created, updated, skipped };
}

/** Layer ids touched by the selection and their order, used by the properties panel. */
export function selectionLayers(doc: Project, selection: Selection): Layer[] {
  const ids = new Set(selectionLayerIds(doc, selection));
  return doc.layers.filter((layer) => ids.has(layer.id));
}

/** Helper for the editor: new openings created by tools keep host-wall layer. */
export function makeOpeningForWall(
  wall: Wall,
  kind: Opening['kind'],
  offset: number,
  width: number,
): Opening {
  const clamped = clampOpeningToWall(wall, { offset, width });
  return createOpening(wall, kind, clamped.offset, clamped.width);
}
