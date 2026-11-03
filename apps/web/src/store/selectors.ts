import { useMemo } from 'react';
import {
  polygonAreaSqm,
  type Annotation,
  type FurnitureItem,
  type Layer,
  type MepDevice,
  type Opening,
  type Room,
  type Wall,
} from '@hdesign/domain';
import { useDocStore } from './doc-store';
import { useUiStore } from './ui-store';

export interface RoomWithArea {
  room: Room;
  areaSqm: number;
}

export function useRoomsWithArea(): RoomWithArea[] {
  const rooms = useDocStore((state) => state.doc.rooms);
  return useMemo(
    () => rooms.map((room) => ({ room, areaSqm: polygonAreaSqm(room.polygon) })),
    [rooms],
  );
}

export interface SelectedEntities {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];
  mep: MepDevice[];
  annotations: Annotation[];
  total: number;
}

export function useSelectedEntities(): SelectedEntities {
  const kind = useUiStore((state) => state.selection.kind);
  const ids = useUiStore((state) => state.selection.ids);
  const walls = useDocStore((state) => state.doc.walls);
  const openings = useDocStore((state) => state.doc.openings);
  const rooms = useDocStore((state) => state.doc.rooms);
  const furniture = useDocStore((state) => state.doc.furniture);
  const mep = useDocStore((state) => state.doc.mep.devices);
  const annotations = useDocStore((state) => state.doc.annotations);
  return useMemo(() => {
    const inIds = (entity: { id: string }) => kind !== 'none' && ids.includes(entity.id);
    return {
      walls: kind === 'wall' ? walls.filter(inIds) : [],
      openings: kind === 'opening' ? openings.filter(inIds) : [],
      rooms: kind === 'room' ? rooms.filter(inIds) : [],
      furniture: kind === 'furniture' ? furniture.filter(inIds) : [],
      mep: kind === 'mep' ? mep.filter(inIds) : [],
      annotations: kind === 'annotation' ? annotations.filter(inIds) : [],
      total: kind === 'none' ? 0 : ids.length,
    };
  }, [kind, ids, walls, openings, rooms, furniture, mep, annotations]);
}

export function useProjectStats() {
  const rooms = useRoomAreaOnly();
  const walls = useDocStore((state) => state.doc.walls.length);
  const furniture = useDocStore((state) => state.doc.furniture.length);
  const devices = useDocStore((state) => state.doc.mep.devices.length);
  const areaSqm = useMemo(() => rooms.reduce((sum, item) => sum + item.areaSqm, 0), [rooms]);
  return { areaSqm, roomCount: rooms.length, wallCount: walls, furnitureCount: furniture, deviceCount: devices };
}

function useRoomAreaOnly(): RoomWithArea[] {
  return useRoomsWithArea();
}

export function useLayerMap(): Map<string, Layer> {
  const layers = useDocStore((state) => state.doc.layers);
  return useMemo(() => new Map(layers.map((layer) => [layer.id, layer])), [layers]);
}

export function useSortedLayers(): Layer[] {
  const layers = useDocStore((state) => state.doc.layers);
  return useMemo(() => [...layers].sort((a, b) => a.order - b.order), [layers]);
}

export function useLayerVisibility(): { visible: Set<string>; locked: Set<string> } {
  const layers = useDocStore((state) => state.doc.layers);
  return useMemo(() => {
    const visible = new Set<string>();
    const locked = new Set<string>();
    for (const layer of layers) {
      if (layer.visible) visible.add(layer.id);
      if (layer.locked) locked.add(layer.id);
    }
    return { visible, locked };
  }, [layers]);
}

export function isEntityVisible(
  layerId: string,
  visibility: { visible: Set<string> },
): boolean {
  return visibility.visible.has(layerId);
}

export function isEntityLocked(layerId: string, lockedLayers: { locked: Set<string> }): boolean {
  return lockedLayers.locked.has(layerId);
}
