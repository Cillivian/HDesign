import { DEFAULT_LAYER_IDS, type LayerKind, type Project } from '@hdesign/domain';

/**
 * Layer helpers shared by the editor and the layer/property panels.
 * Layers are the only grouping mechanism in the document, so every new entity
 * must resolve to one of the existing layers.
 */

export interface LayerEntityCounts {
  walls: number;
  openings: number;
  rooms: number;
  furniture: number;
  mep: number;
  annotations: number;
  total: number;
}

export function layerEntityCounts(doc: Project, layerId: string): LayerEntityCounts {
  const walls = doc.walls.filter((wall) => wall.layerId === layerId).length;
  const openings = doc.openings.filter((opening) => opening.layerId === layerId).length;
  const rooms = doc.rooms.filter((room) => room.layerId === layerId).length;
  const furniture = doc.furniture.filter((item) => item.layerId === layerId).length;
  const mep = doc.mep.devices.filter((device) => device.layerId === layerId).length;
  const annotations = doc.annotations.filter((annotation) => annotation.layerId === layerId).length;
  return {
    walls,
    openings,
    rooms,
    furniture,
    mep,
    annotations,
    total: walls + openings + rooms + furniture + mep + annotations,
  };
}

const KIND_TO_DEFAULT_LAYER: Partial<Record<LayerKind, string>> = {
  structure: DEFAULT_LAYER_IDS.structure,
  furniture: DEFAULT_LAYER_IDS.furniture,
  'mep-water': DEFAULT_LAYER_IDS.water,
  'mep-electric': DEFAULT_LAYER_IDS.electric,
  annotation: DEFAULT_LAYER_IDS.annotation,
  dimension: DEFAULT_LAYER_IDS.dimension,
};

const KIND_TO_PREFERRED_LAYERS: Partial<Record<LayerKind, string[]>> = {
  structure: [DEFAULT_LAYER_IDS.structure],
  furniture: [DEFAULT_LAYER_IDS.furniture],
  'mep-water': [DEFAULT_LAYER_IDS.water],
  'mep-electric': [DEFAULT_LAYER_IDS.electric],
  annotation: [DEFAULT_LAYER_IDS.annotation],
  dimension: [DEFAULT_LAYER_IDS.dimension],
};

/**
 * Resolve a writable layer id for a new entity.
 * Falls back to the first layer with a matching kind, then to the first layer at
 * all, so deleted default layers never leave orphaned geometry.
 */
export function resolveLayerId(doc: Project, kind: LayerKind, preferredId?: string): string {
  if (preferredId && doc.layers.some((layer) => layer.id === preferredId)) return preferredId;
  const candidates = KIND_TO_PREFERRED_LAYERS[kind] ?? [];
  for (const candidate of candidates) {
    if (doc.layers.some((layer) => layer.id === candidate)) return candidate;
  }
  const defaultId = KIND_TO_DEFAULT_LAYER[kind];
  if (defaultId && doc.layers.some((layer) => layer.id === defaultId)) return defaultId;
  const sameKind = doc.layers.find((layer) => layer.kind === kind);
  if (sameKind) return sameKind.id;
  return doc.layers[0]?.id ?? DEFAULT_LAYER_IDS.structure;
}

/** Prefer a visible, unlocked layer of the kind so new geometry is immediately usable. */
export function resolveVisibleLayerId(doc: Project, kind: LayerKind, preferredId?: string): string {
  const candidates = doc.layers.filter(
    (layer) => layer.kind === kind && layer.visible && !layer.locked,
  );
  const preferred = candidates.find((layer) => layer.id === preferredId);
  if (preferred) return preferred.id;
  if (candidates.length) return candidates[0]!.id;
  return resolveLayerId(doc, kind, preferredId);
}

export function layerNameById(doc: Project, layerId: string): string {
  return doc.layers.find((layer) => layer.id === layerId)?.name ?? '未分配图层';
}

/** Highest `order` value, used when appending a new layer on top. */
export function maxLayerOrder(doc: Project): number {
  return doc.layers.reduce((max, layer) => Math.max(max, layer.order), 0);
}

/** True when every layer with this id is hidden (used by property/editor hints). */
export function isLayerVisible(doc: Project, layerId: string): boolean {
  return doc.layers.find((layer) => layer.id === layerId)?.visible ?? true;
}

export function isLayerLocked(doc: Project, layerId: string): boolean {
  return doc.layers.find((layer) => layer.id === layerId)?.locked ?? false;
}

/** Count label for the layer list, e.g. "墙 3 · 家具 4". */
export function layerCountLabel(counts: LayerEntityCounts): string {
  const parts: string[] = [];
  if (counts.walls) parts.push(`墙 ${counts.walls}`);
  if (counts.openings) parts.push(`门窗 ${counts.openings}`);
  if (counts.rooms) parts.push(`房间 ${counts.rooms}`);
  if (counts.furniture) parts.push(`家具 ${counts.furniture}`);
  if (counts.mep) parts.push(`点位 ${counts.mep}`);
  if (counts.annotations) parts.push(`标注 ${counts.annotations}`);
  return parts.length ? parts.join(' · ') : '空图层';
}

export function sortedLayers(doc: Project): Project['layers'] {
  return [...doc.layers].sort((first, second) => second.order - first.order);
}
