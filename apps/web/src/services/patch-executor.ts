import * as autolayoutModule from '@hdesign/autolayout';
import type { GenerateLayout, GenerateMep } from '@hdesign/autolayout';
import {
  bboxFromPoints,
  clamp,
  createCircuit,
  createDefaultCircuits,
  createFurnitureItem,
  createMepDevice,
  distanceToSegment,
  MEP_META,
  normalizeAngle,
  STYLE_TOKEN_KEYS,
  pointInPolygon,
  polygonCentroid,
  type Circuit,
  type DesignBrief,
  type DesignOp,
  type DesignPatch,
  type FurnitureItem,
  type MaterialAssignment,
  type MepDevice,
  type MepKind,
  type Point,
  type Project,
  type Room,
  type RoomType,
  type StyleTokens,
} from '@hdesign/domain';
import { useDocStore } from '../store/doc-store';
import {
  applyCatalogStyle,
  applyCatalogStyleTokens,
  getCatalogSku,
  listCatalogMaterials,
  listCatalogSkus,
  listCatalogStyles,
  type CatalogMaterial,
  type CatalogSku,
  type CatalogStyle,
} from './ai-design';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type BriefApplyMode = 'replace' | 'fill-empty' | 'style-only';

export interface PatchDeps {
  skus: CatalogSku[];
  materials: CatalogMaterial[];
  styles: CatalogStyle[];
  generateLayout?: GenerateLayout;
  generateMep?: GenerateMep;
}

export interface PatchExecutionOptions {
  /** Only used by the `applyBrief` op and executeDesignBrief. */
  mode?: BriefApplyMode;
  /** Override catalogue/layout dependencies (tests, custom catalogues). */
  deps?: PatchDeps;
  /** Extra rationale stamped on AI-created entities. */
  rationale?: string;
}

export interface PatchRejection {
  op: DesignOp['op'];
  reason: string;
}

export interface PatchDiff {
  furnitureAdded: Array<{ id: string; name: string; roomId?: string }>;
  furnitureRemoved: Array<{ id: string; name: string }>;
  furnitureUpdated: Array<{ id: string; name: string; changes: string[] }>;
  roomsUpdated: Array<{ id: string; name: string; changes: string[] }>;
  materialsUpdated: number;
  mepAdded: number;
  mepRemoved: number;
  styleChanged: boolean;
  circuitsChanged: boolean;
}

export interface PatchExecutionResult {
  applied: string[];
  rejected: PatchRejection[];
  summary: string;
  diff: PatchDiff;
  changed: boolean;
  /** Resulting project snapshot (pure variants) or the store doc after commit. */
  project: Project;
}

/* ------------------------------------------------------------------ */
/* Dependencies                                                       */
/* ------------------------------------------------------------------ */

const autolayout = autolayoutModule as unknown as {
  generateLayout?: GenerateLayout;
  generateMep?: GenerateMep;
};

export function defaultPatchDeps(): PatchDeps {
  return {
    skus: listCatalogSkus(),
    materials: listCatalogMaterials(),
    styles: listCatalogStyles(),
    generateLayout: autolayout.generateLayout,
    generateMep: autolayout.generateMep,
  };
}

/**
 * Minimal fallback for seed SKUs so AI apply/BOM keep working before
 * workstream B's catalogue package ships its runtime data.
 */
const FALLBACK_SKUS: CatalogSku[] = [
  ['sofa-3', '三人沙发', 'sofa', 2200, 900, 780, ['living']],
  ['sofa-2', '双人沙发', 'sofa', 1600, 850, 780, ['living']],
  ['coffee-table', '茶几', 'table', 1000, 550, 420, ['living']],
  ['tv-cabinet', '电视柜', 'storage', 1800, 400, 450, ['living']],
  ['rug', '客厅地毯', 'textile', 2600, 2000, 12, ['living']],
  ['dining-table', '餐桌', 'table', 1400, 800, 750, ['living', 'dining']],
  ['dining-chair', '餐椅', 'chair', 450, 480, 820, ['living', 'dining']],
  ['floor-lamp', '落地灯', 'lighting', 400, 400, 1550, ['living', 'master-bedroom']],
  ['plant', '绿植', 'plant', 500, 500, 1400, ['living']],
  ['bed-double', '双人床', 'bed', 1500, 2000, 900, ['master-bedroom', 'bedroom']],
  ['bed-single', '单人床', 'bed', 1200, 1900, 850, ['bedroom', 'kids-room']],
  ['nightstand', '床头柜', 'storage', 400, 400, 500, ['master-bedroom', 'bedroom']],
  ['wardrobe', '衣柜', 'storage', 1800, 600, 2200, ['master-bedroom', 'bedroom']],
  ['desk', '书桌', 'table', 1100, 550, 750, ['bedroom', 'study']],
  ['chair', '书椅', 'chair', 450, 480, 850, ['bedroom', 'study']],
  ['kitchen-counter', '厨房地柜', 'kitchen', 2400, 600, 850, ['kitchen']],
  ['fridge', '冰箱', 'appliance', 700, 650, 1800, ['kitchen']],
  ['shower', '淋浴房', 'bath', 900, 900, 2000, ['bath']],
  ['toilet', '马桶', 'bath', 400, 650, 780, ['bath']],
  ['vanity', '浴室柜', 'bath', 900, 500, 850, ['bath']],
  ['bookshelf', '书架', 'storage', 1200, 350, 2000, ['study', 'living']],
].map(([id, name, category, w, d, h, roomTypes]) => ({
  id: String(id),
  name: String(name),
  category: String(category),
  w: Number(w),
  d: Number(d),
  h: Number(h),
  styleTags: [],
  materialSlots: [],
  roomTypes: roomTypes as RoomType[],
  wallMounted: false,
  collisionExempt: category === 'textile' || category === 'lighting',
}));

const FALLBACK_MATERIALS: CatalogMaterial[] = [
  ['floor-oak', '橡木地板', 'floor', '#C9A97D', 'wood', 180],
  ['floor-oak-walnut', '胡桃木地板', 'floor', '#8A6242', 'wood', 220],
  ['floor-tile-600', '600 地砖', 'floor', '#C7C4BC', 'tile', 120],
  ['floor-tile-anti-slip', '防滑地砖', 'floor', '#B6B2A8', 'tile', 110],
  ['floor-marble', '大理石地面', 'floor', '#E7E4DC', 'stone', 380],
  ['floor-carpet', '满铺地毯', 'floor', '#BFAE98', 'carpet', 90],
  ['wall-latex-warm', '暖白乳胶漆', 'wall', '#F3EEE4', 'paint', 35],
  ['wall-latex-grey', '浅灰乳胶漆', 'wall', '#D8D5CC', 'paint', 35],
  ['wall-microcement', '微水泥', 'wall', '#B9B3A6', 'microcement', 160],
  ['wall-wood-veneer', '木饰面', 'wall', '#A9825C', 'wood', 260],
  ['wall-tile-matte', '哑光瓷砖', 'wall', '#D6D3CA', 'tile', 130],
  ['ceiling-latex', '白色乳胶漆顶面', 'ceiling', '#F7F6F2', 'paint', 30],
  ['joinery-oak', '橡木饰面柜体', 'joinery', '#C2A276', 'wood', 680],
  ['joinery-lacquer', '哑光烤漆柜体', 'joinery', '#E8E5DE', 'laminate', 520],
  ['countertop-quartz', '石英石台面', 'countertop', '#D9D7D0', 'stone', 480],
].map(([id, name, scope, color, type, price]) => ({
  id: String(id),
  name: String(name),
  scope: String(scope),
  color: String(color),
  type: String(type),
  pricePerSqm: Number(price),
  tags: [],
}));

function effectiveSkus(deps: PatchDeps): CatalogSku[] {
  return deps.skus.length > 0 ? deps.skus : FALLBACK_SKUS;
}

function effectiveMaterials(deps: PatchDeps): CatalogMaterial[] {
  return deps.materials.length > 0 ? deps.materials : FALLBACK_MATERIALS;
}

function effectiveStyles(deps: PatchDeps): CatalogStyle[] {
  return deps.styles;
}

export function findSkuIn(deps: PatchDeps, skuId: string | undefined): CatalogSku | undefined {
  if (!skuId) return undefined;
  const skus = effectiveSkus(deps);
  const exact = skus.find((sku) => sku.id === skuId) ?? (deps.skus.length === 0 ? getCatalogSku(skuId) : undefined);
  if (exact) return exact;
  const key = skuId.toLowerCase();
  const fuzzy = skus.find(
    (sku) => sku.id.toLowerCase().includes(key) || sku.name.toLowerCase().includes(key),
  );
  return fuzzy;
}

export function resolveNearestSkuIn(
  deps: PatchDeps,
  options: { skuId?: string; category?: string; name?: string; roomType?: RoomType },
): CatalogSku | undefined {
  const { skuId, category, name, roomType } = options;
  const skus = effectiveSkus(deps);
  if (skuId) {
    const exact = findSkuIn(deps, skuId);
    if (exact && exact.id === skuId) return exact;
  }
  const requestedCategory = (category ?? '').toLowerCase();
  const nameHint = (name ?? '').toLowerCase();
  const scored = skus
    .map((sku) => {
      let score = 0;
      if (skuId && sku.id.toLowerCase() === skuId.toLowerCase()) score += 200;
      if (skuId && sku.id.toLowerCase().includes(skuId.toLowerCase())) score += 80;
      if (requestedCategory && sku.category.toLowerCase() === requestedCategory) score += 60;
      if (requestedCategory && sku.category.toLowerCase().includes(requestedCategory)) score += 20;
      if (nameHint) {
        if (sku.name.toLowerCase().includes(nameHint)) score += 50;
        if (nameHint.includes(sku.name.toLowerCase())) score += 30;
        if (sku.id.toLowerCase().includes(nameHint)) score += 22;
      }
      if (roomType && sku.roomTypes.includes(roomType)) score += 12;
      if (roomType && sku.roomTypes.length > 0 && !sku.roomTypes.includes(roomType)) score -= 30;
      return { sku, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.sku.id.localeCompare(b.sku.id));
  return scored[0]?.sku;
}

function findMaterialIn(deps: PatchDeps, materialId: string | undefined): CatalogMaterial | undefined {
  if (!materialId) return undefined;
  return effectiveMaterials(deps).find((material) => material.id === materialId);
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                             */
/* ------------------------------------------------------------------ */

function footprintBox(item: Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'rotation'>) {
  const angle = (normalizeAngle(item.rotation) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = item.w * cos + item.d * sin;
  const d = item.w * sin + item.d * cos;
  return { x: item.x - w / 2, y: item.y - d / 2, w, h: d };
}

function boxesOverlap(a: { x: number; y: number; w: number; h: number }, b: typeof a, gap = 60): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function sampleInsideRoom(room: Room, box: { x: number; y: number; w: number; h: number }): boolean {
  const points: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w / 2, y: box.y + box.h / 2 },
  ];
  return points.every((point) => pointInPolygon(point, room.polygon));
}

function clampToProjectBounds(project: Project, point: Point): Point {
  const points = project.walls.flatMap((wall) => [wall.a, wall.b]);
  const boxes = project.rooms.map((room) => bboxFromPoints(room.polygon));
  const all = points.length > 0 ? bboxFromPoints(points) : boxes.length > 0 ? boxes[0]! : { x: 0, y: 0, w: 0, h: 0 };
  if (all.w === 0 && all.h === 0) return point;
  return {
    x: clamp(point.x, all.x, all.x + all.w),
    y: clamp(point.y, all.y, all.y + all.h),
  };
}

interface Placement {
  x: number;
  y: number;
  rotation: number;
}

function placeInRoom(
  room: Room,
  footprint: { w: number; d: number },
  existing: FurnitureItem[],
  options: { near?: Point; wallMounted?: boolean } = {},
): Placement {
  const box = bboxFromPoints(room.polygon);
  const margin = 120;
  const w = Math.min(footprint.w, Math.max(300, box.w - margin * 2));
  const d = Math.min(footprint.d, Math.max(300, box.h - margin * 2));
  const centroid = polygonCentroid(room.polygon);
  const candidates: Point[] = [];
  const step = 250;
  for (let y = box.y + d / 2 + margin; y <= box.y + box.h - d / 2 - margin; y += step) {
    for (let x = box.x + w / 2 + margin; x <= box.x + box.w - w / 2 - margin; x += step) {
      candidates.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  if (candidates.length === 0) candidates.push(centroid);
  const roomItems = existing.filter((item) => item.roomId === room.id);
  const rotations = options.wallMounted ? [0, 90, 180, 270] : [0];
  const tried: Array<{ point: Point; rotation: number; rotationCost: number; nearCost: number }> = [];
  for (const point of candidates) {
    for (const rotation of rotations) {
      const candidateBox = footprintBox({ x: point.x, y: point.y, w, d, rotation });
      if (!sampleInsideRoom(room, candidateBox)) continue;
      const collides = roomItems.some((item) => boxesOverlap(footprintBox(item), candidateBox, 80));
      if (collides) continue;
      tried.push({
        point,
        rotation,
        rotationCost: Math.min(rotation, 360 - rotation),
        nearCost: options.near ? Math.hypot(point.x - options.near.x, point.y - options.near.y) : 0,
      });
    }
  }
  if (tried.length > 0) {
    tried.sort((a, b) => {
      if (options.near) return a.nearCost - b.nearCost;
      // Prefer walls for storage-like items, centre for the rest.
      const aWall = Math.min(...room.polygon.map((p) => Math.hypot(a.point.x - p.x, a.point.y - p.y)));
      const bWall = Math.min(...room.polygon.map((p) => Math.hypot(b.point.x - p.x, b.point.y - p.y)));
      const aCost = options.wallMounted ? aWall : Math.hypot(a.point.x - centroid.x, a.point.y - centroid.y);
      const bCost = options.wallMounted ? bWall : Math.hypot(b.point.x - centroid.x, b.point.y - centroid.y);
      return aCost - bCost || a.rotationCost - b.rotationCost;
    });
    const best = tried[0]!;
    return { x: best.point.x, y: best.point.y, rotation: best.rotation };
  }
  // Last resort: centroid when it is inside, otherwise bbox centre.
  const fallback = pointInPolygon(centroid, room.polygon) ? centroid : { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return { x: Math.round(fallback.x), y: Math.round(fallback.y), rotation: 0 };
}

function mepPointFor(room: Room, kind: MepKind, index: number, project: Project): { x: number; y: number; wallId?: string } {
  const box = bboxFromPoints(room.polygon);
  const centroid = polygonCentroid(room.polygon);
  const interior = kind === 'light' || kind === 'light-spot' || kind === 'floor-heat';
  if (interior) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, index + 1))));
    return {
      x: centroid.x + ((index % cols) - Math.floor(cols / 2)) * Math.min(900, box.w / 4),
      y: centroid.y + (Math.floor(index / cols) - 0.5) * Math.min(900, box.h / 4),
    };
  }
  // Wall-mounted: walk polygon edges and take points offset inwards.
  const edges: Array<{ a: Point; b: Point; mid: Point }> = room.polygon.map((point, edgeIndex) => {
    const next = room.polygon[(edgeIndex + 1) % room.polygon.length]!;
    return {
      a: point,
      b: next,
      mid: { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
    };
  });
  edges.sort((a, b) => Math.hypot(b.mid.x - centroid.x, b.mid.y - centroid.y) - Math.hypot(a.mid.x - centroid.x, a.mid.y - centroid.y));
  const longEdges = [...edges].sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y));
  const pool = kind === 'socket' || kind === 'socket-16a' || kind === 'switch' || kind === 'switch-double' ? longEdges : edges;
  const edge = pool[index % pool.length]!;
  const t = 0.2 + 0.2 * (index % 4);
  const base = { x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t };
  // Nudge towards the room centroid so the device sits just inside the wall line.
  const direction = { x: centroid.x - base.x, y: centroid.y - base.y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const point = { x: base.x + (direction.x / length) * 160, y: base.y + (direction.y / length) * 160 };
  const nearestWall = project.walls
    .map((wall) => ({ wall, projection: distanceToSegment(point, wall.a, wall.b) }))
    .sort((a, b) => a.projection - b.projection)[0];
  if (nearestWall && nearestWall.projection < 500) {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
      wallId: nearestWall.wall.id,
    };
  }
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/* ------------------------------------------------------------------ */
/* Diff                                                               */
/* ------------------------------------------------------------------ */

export function emptyDiff(): PatchDiff {
  return {
    furnitureAdded: [],
    furnitureRemoved: [],
    furnitureUpdated: [],
    roomsUpdated: [],
    materialsUpdated: 0,
    mepAdded: 0,
    mepRemoved: 0,
    styleChanged: false,
    circuitsChanged: false,
  };
}

export function diffProjects(before: Project, after: Project): PatchDiff {
  const diff = emptyDiff();
  const beforeFurniture = new Map(before.furniture.map((item) => [item.id, item]));
  const afterFurniture = new Map(after.furniture.map((item) => [item.id, item]));
  for (const item of after.furniture) {
    if (!beforeFurniture.has(item.id)) {
      diff.furnitureAdded.push({ id: item.id, name: item.name, roomId: item.roomId });
    } else {
      const previous = beforeFurniture.get(item.id)!;
      const changes: string[] = [];
      if (previous.skuId !== item.skuId) changes.push('SKU');
      if (previous.w !== item.w || previous.d !== item.d || previous.h !== item.h) changes.push('尺寸');
      if (previous.color !== item.color) changes.push('颜色');
      if (previous.materialId !== item.materialId) changes.push('材质');
      if (previous.x !== item.x || previous.y !== item.y) changes.push('位置');
      if (normalizeAngle(previous.rotation) !== normalizeAngle(item.rotation)) changes.push('角度');
      if (previous.name !== item.name) changes.push('名称');
      if (changes.length > 0) diff.furnitureUpdated.push({ id: item.id, name: item.name, changes });
    }
  }
  for (const item of before.furniture) {
    if (!afterFurniture.has(item.id)) diff.furnitureRemoved.push({ id: item.id, name: item.name });
  }
  const beforeRooms = new Map(before.rooms.map((room) => [room.id, room]));
  for (const room of after.rooms) {
    const previous = beforeRooms.get(room.id);
    if (!previous) continue;
    const changes: string[] = [];
    if (previous.type !== room.type) changes.push('类型');
    if (previous.name !== room.name) changes.push('名称');
    if (previous.floorMaterialId !== room.floorMaterialId) changes.push('地面材质');
    if (previous.wallMaterialId !== room.wallMaterialId) changes.push('墙面材质');
    if (changes.length > 0) diff.roomsUpdated.push({ id: room.id, name: room.name, changes });
  }
  const materialKey = (item: MaterialAssignment) => `${item.roomId ?? '*'}|${item.scope}|${item.materialId}`;
  const beforeMaterials = new Set(before.materials.map(materialKey));
  diff.materialsUpdated = after.materials.filter((item) => !beforeMaterials.has(materialKey(item))).length;
  diff.mepAdded = Math.max(0, after.mep.devices.length - before.mep.devices.length);
  diff.mepRemoved = Math.max(0, before.mep.devices.length - after.mep.devices.length);
  diff.styleChanged =
    before.style.id !== after.style.id ||
    JSON.stringify(before.style.overrides) !== JSON.stringify(after.style.overrides);
  diff.circuitsChanged = JSON.stringify(before.mep.circuits) !== JSON.stringify(after.mep.circuits);
  return diff;
}

export function diffIsEmpty(diff: PatchDiff): boolean {
  return (
    diff.furnitureAdded.length === 0 &&
    diff.furnitureRemoved.length === 0 &&
    diff.furnitureUpdated.length === 0 &&
    diff.roomsUpdated.length === 0 &&
    diff.materialsUpdated === 0 &&
    diff.mepAdded === 0 &&
    diff.mepRemoved === 0 &&
    !diff.styleChanged &&
    !diff.circuitsChanged
  );
}

/* ------------------------------------------------------------------ */
/* Execution helpers                                                  */
/* ------------------------------------------------------------------ */

const AI_META = (rationale: string) => ({ source: 'ai' as const, rationale });

function ensureCircuits(project: Project): void {
  const existing = new Set(project.mep.circuits.map((circuit) => circuit.id));
  for (const circuit of createDefaultCircuits()) {
    if (!existing.has(circuit.id)) project.mep.circuits.push(createCircuit(circuit));
  }
}

function circuitForRoom(room: Room | undefined, kind: MepKind, project: Project): string | undefined {
  const meta = MEP_META[kind];
  if (!meta) return undefined;
  const has = (id: string) => project.mep.circuits.some((circuit) => circuit.id === id);
  const preferred =
    meta.group === 'water'
      ? 'circuit-bath'
      : kind === 'light' || kind === 'light-spot' || kind === 'switch' || kind === 'switch-double'
        ? 'circuit-lighting'
        : kind === 'ac'
          ? 'circuit-ac'
          : kind === 'gas' || kind === 'socket-16a'
            ? 'circuit-kitchen'
            : 'circuit-general';
  if (room?.type === 'kitchen' && has('circuit-kitchen') && meta.group === 'electric') return 'circuit-kitchen';
  if (room?.type === 'bath' && has('circuit-bath') && meta.group === 'electric') return 'circuit-bath';
  return has(preferred) ? preferred : project.mep.circuits[0]?.id;
}

function roomTypeForBrief(briefRoom: { roomId?: string; type: RoomType } | undefined): RoomType | undefined {
  return briefRoom?.type;
}

/* ------------------------------------------------------------------ */
/* Style                                                              */
/* ------------------------------------------------------------------ */

interface StyleOp {
  presetId?: string;
  customName?: string;
  tokens?: Record<string, string | undefined>;
}

function applyStyleOp(project: Project, op: StyleOp, deps: PatchDeps, reject: (reason: string) => void): boolean {
  const presetId = op.presetId?.trim();
  const tokenEntries = op.tokens
    ? Object.entries(op.tokens).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && (STYLE_TOKEN_KEYS as readonly string[]).includes(entry[0]),
      )
    : [];
  const tokens = tokenEntries.length > 0 ? (Object.fromEntries(tokenEntries) as StyleTokens) : undefined;
  const preset = presetId ? effectiveStyles(deps).find((style) => style.id === presetId) : undefined;
  if (presetId && !preset && !tokens) {
    reject(`风格预设不存在：${presetId}`);
    return false;
  }
  if (!presetId && !tokens) {
    reject('缺少风格预设或颜色 token');
    return false;
  }

  // Prefer workstream B's catalogue engine: it recolours furniture, syncs room
  // material ids and keeps AI/style metadata consistent.
  const applied =
    tokens !== undefined
      ? applyCatalogStyleTokens(project, tokens, presetId)
      : presetId
        ? applyCatalogStyle(project, presetId)
        : undefined;
  if (applied) {
    project.style = {
      ...applied.style,
      name: op.customName?.trim() || applied.style.name,
      overrides: tokens ? { ...applied.style.overrides, ...tokens } : applied.style.overrides,
      customTokens: tokens ? { ...applied.style.customTokens, ...tokens } : applied.style.customTokens,
    };
    project.materials = applied.materials;
    project.rooms = applied.rooms;
    project.furniture = applied.furniture;
    return true;
  }

  // Local fallback when the catalogue package is not available.
  const previous = project.style;
  project.style = {
    ...previous,
    id: presetId ?? (tokens ? 'custom-ai' : previous.id),
    name: op.customName?.trim() || previous.name,
    overrides: tokens ? { ...previous.overrides, ...tokens } : previous.overrides,
    customTokens: tokens ? { ...previous.customTokens, ...tokens } : previous.customTokens,
  };
  if (preset) {
    for (const room of project.rooms) {
      const floor = preset.materials.floor;
      const wall = preset.materials.wall;
      if (floor) room.floorMaterialId = floor;
      if (wall) room.wallMaterialId = wall;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Furniture ops                                                      */
/* ------------------------------------------------------------------ */

function clampDimension(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return clamp(value, min, max);
}

function sanitizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return undefined;
}

function createAiFurniture(
  sku: CatalogSku,
  room: Room | undefined,
  placement: Placement,
  rationale: string,
  overrides: { name?: string; color?: string; materialId?: string } = {},
): FurnitureItem {
  return createFurnitureItem({
    skuId: sku.id,
    name: overrides.name?.trim() || sku.name,
    x: Math.round(placement.x),
    y: Math.round(placement.y),
    w: clamp(sku.w > 0 ? sku.w : 600, 50, 8000),
    d: clamp(sku.d > 0 ? sku.d : 600, 50, 8000),
    h: clamp(sku.h > 0 ? sku.h : 800, 10, 4000),
    rotation: placement.rotation,
    color: overrides.color ?? sku.color ?? '#B9A88F',
    materialId: overrides.materialId,
    roomId: room?.id,
    meta: AI_META(rationale),
  });
}

function setFurnitureOp(
  project: Project,
  op: Extract<DesignOp, { op: 'setFurniture' }>,
  deps: PatchDeps,
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const item = project.furniture.find((entry) => entry.id === op.itemId);
  if (!item) return reject(`家具不存在：${op.itemId}`);
  const patch = op.patch;
  let sku: CatalogSku | undefined;
  if (patch.skuId) {
    sku = findSkuIn(deps, patch.skuId);
    if (!sku) return reject(`目录中找不到家具 SKU：${patch.skuId}`);
  }
  const before = { ...item };
  if (sku) {
    item.skuId = sku.id;
    item.name = sku.name;
    item.w = clamp(sku.w > 0 ? sku.w : item.w, 50, 8000);
    item.d = clamp(sku.d > 0 ? sku.d : item.d, 50, 8000);
    item.h = clamp(sku.h > 0 ? sku.h : item.h, 10, 4000);
    if (sku.color) item.color = sku.color;
  }
  if (patch.name !== undefined) item.name = patch.name.trim() || item.name;
  const color = sanitizeHexColor(patch.color);
  if (patch.color !== undefined && !color) return reject(`颜色格式无效：${patch.color}`);
  if (color) item.color = color;
  if (patch.materialId !== undefined) {
    const material = findMaterialIn(deps, patch.materialId);
    if (!material) return reject(`材质不存在：${patch.materialId}`);
    item.materialId = material.id;
  }
  const w = clampDimension(patch.w, 50, 8000);
  const d = clampDimension(patch.d, 50, 8000);
  const h = clampDimension(patch.h, 10, 4000);
  if (w !== undefined) item.w = w;
  if (d !== undefined) item.d = d;
  if (h !== undefined) item.h = h;
  if (patch.rotation !== undefined) item.rotation = clamp(patch.rotation, -360, 360);
  // Keep the item inside its room if the footprint grew.
  const room = item.roomId ? project.rooms.find((entry) => entry.id === item.roomId) : undefined;
  if (room && !sampleInsideRoom(room, footprintBox(item))) {
    const placement = placeInRoom(
      room,
      { w: item.w, d: item.d },
      project.furniture.filter((entry) => entry.id !== item.id),
      { near: { x: item.x, y: item.y } },
    );
    item.x = placement.x;
    item.y = placement.y;
  }
  item.meta = AI_META(rationale);
  const changed = (Object.keys(before) as Array<keyof FurnitureItem>).some((key) => before[key] !== item[key]);
  if (changed) applied.push(`调整家具 ${item.name}`);
}

function addFurnitureOp(
  project: Project,
  op: Extract<DesignOp, { op: 'addFurniture' }>,
  deps: PatchDeps,
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
): FurnitureItem[] {
  const room = project.rooms.find((entry) => entry.id === op.roomId);
  if (!room) {
    reject(`房间不存在：${op.roomId}`);
    return [];
  }
  const sku = resolveNearestSkuIn(deps, { skuId: op.skuId, roomType: room.type });
  if (!sku) {
    reject(`目录中找不到家具 SKU：${op.skuId}`);
    return [];
  }
  const nearItem = op.near ? project.furniture.find((entry) => entry.id === op.near) : undefined;
  const qty = clamp(Math.round(op.qty ?? 1), 1, 10);
  const created: FurnitureItem[] = [];
  let near = nearItem ? { x: nearItem.x, y: nearItem.y } : undefined;
  for (let index = 0; index < qty; index += 1) {
    const placement = placeInRoom(room, { w: sku.w, d: sku.d }, project.furniture, {
      near,
      wallMounted: sku.wallMounted,
    });
    const item = createAiFurniture(sku, room, placement, rationale);
    project.furniture.push(item);
    created.push(item);
    near = { x: placement.x, y: placement.y };
  }
  applied.push(`新增家具 ${sku.name} ×${created.length}（${room.name}）`);
  return created;
}

function replaceFurnitureOp(
  project: Project,
  op: Extract<DesignOp, { op: 'replaceFurniture' }>,
  deps: PatchDeps,
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const item = project.furniture.find((entry) => entry.id === op.itemId);
  if (!item) return reject(`家具不存在：${op.itemId}`);
  const room = item.roomId ? project.rooms.find((entry) => entry.id === item.roomId) : undefined;
  const sku = resolveNearestSkuIn(deps, { skuId: op.skuId, roomType: room?.type });
  if (!sku) return reject(`目录中找不到家具 SKU：${op.skuId}`);
  const placement = room
    ? placeInRoom(room, { w: sku.w, d: sku.d }, project.furniture.filter((entry) => entry.id !== item.id), {
        near: { x: item.x, y: item.y },
      })
    : { x: item.x, y: item.y, rotation: item.rotation };
  item.skuId = sku.id;
  item.name = sku.name;
  item.w = clamp(sku.w, 50, 8000);
  item.d = clamp(sku.d, 50, 8000);
  item.h = clamp(sku.h, 10, 4000);
  item.color = sku.color ?? item.color;
  item.x = placement.x;
  item.y = placement.y;
  item.rotation = placement.rotation;
  item.meta = AI_META(rationale);
  applied.push(`替换家具 ${sku.name}（${room?.name ?? '未归属房间'}）`);
}

function nudgeFurnitureOp(
  project: Project,
  op: Extract<DesignOp, { op: 'nudgeFurniture' }>,
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const item = project.furniture.find((entry) => entry.id === op.itemId);
  if (!item) return reject(`家具不存在：${op.itemId}`);
  const room = item.roomId ? project.rooms.find((entry) => entry.id === item.roomId) : undefined;
  const dx = clamp(op.dx ?? 0, -2000, 2000);
  const dy = clamp(op.dy ?? 0, -2000, 2000);
  const rotDelta = clamp(op.rotDelta ?? 0, -180, 180);
  const tryMove = (factor: number): boolean => {
    const candidate = {
      ...item,
      x: item.x + dx * factor,
      y: item.y + dy * factor,
      rotation: clamp(item.rotation + rotDelta * factor, -360, 360),
    };
    if (room && !sampleInsideRoom(room, footprintBox(candidate))) return false;
    if (!room) {
      const clamped = clampToProjectBounds(project, { x: candidate.x, y: candidate.y });
      if (clamped.x !== candidate.x || clamped.y !== candidate.y) return false;
    }
    item.x = Math.round(candidate.x);
    item.y = Math.round(candidate.y);
    item.rotation = candidate.rotation;
    return true;
  };
  if (!tryMove(1)) tryMove(0.5);
  item.meta = AI_META(rationale);
  applied.push(`移动家具 ${item.name}`);
}

/* ------------------------------------------------------------------ */
/* MEP                                                                */
/* ------------------------------------------------------------------ */

function addMepOp(
  project: Project,
  op: { roomId: string; kinds: MepKind[]; count?: number },
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
): MepDevice[] {
  const room = project.rooms.find((entry) => entry.id === op.roomId);
  if (!room) {
    reject(`房间不存在：${op.roomId}`);
    return [];
  }
  ensureCircuits(project);
  const count = clamp(Math.round(op.count ?? 1), 1, 8);
  const created: MepDevice[] = [];
  for (const kind of op.kinds) {
    const meta = MEP_META[kind];
    if (!meta) {
      reject(`未知的水电点位类型：${kind}`);
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      const position = mepPointFor(room, kind, index, project);
      const device = createMepDevice({
        kind,
        x: position.x,
        y: position.y,
        roomId: room.id,
        wallId: position.wallId,
        circuitId: circuitForRoom(room, kind, project),
        meta: AI_META(rationale),
      });
      project.mep.devices.push(device);
      created.push(device);
    }
  }
  if (created.length > 0) {
    applied.push(`新增水电点位 ${created.length} 个（${room.name}）`);
  }
  return created;
}

function removeMepOp(
  project: Project,
  op: Extract<DesignOp, { op: 'removeMep' }>,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const device = project.mep.devices.find((entry) => entry.id === op.deviceId);
  if (!device) return reject(`水电点位不存在：${op.deviceId}`);
  project.mep.devices = project.mep.devices.filter((entry) => entry.id !== op.deviceId);
  for (const circuit of project.mep.circuits) {
    circuit.deviceIds = circuit.deviceIds.filter((id) => id !== op.deviceId);
  }
  applied.push(`移除水电点位 ${MEP_META[device.kind]?.label ?? device.kind}`);
}

function setCircuitsOp(
  project: Project,
  op: Extract<DesignOp, { op: 'setCircuits' }>,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const deviceIds = new Set(project.mep.devices.map((device) => device.id));
  const seen = new Set<string>();
  const circuits: Circuit[] = [];
  for (const circuit of op.circuits) {
    if (seen.has(circuit.id)) {
      reject(`回路 id 重复：${circuit.id}`);
      return;
    }
    seen.add(circuit.id);
    circuits.push(
      createCircuit({
        ...circuit,
        deviceIds: circuit.deviceIds.filter((id) => deviceIds.has(id)),
      }),
    );
  }
  project.mep.circuits = circuits;
  applied.push(`更新回路 ${circuits.length} 条`);
}

/* ------------------------------------------------------------------ */
/* Room materials                                                     */
/* ------------------------------------------------------------------ */

function setRoomMaterialOp(
  project: Project,
  op: Extract<DesignOp, { op: 'setRoomMaterial' }>,
  deps: PatchDeps,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const room = project.rooms.find((entry) => entry.id === op.roomId);
  if (!room) return reject(`房间不存在：${op.roomId}`);
  const material = findMaterialIn(deps, op.materialId);
  if (!material) return reject(`材质不存在：${op.materialId}`);
  if (op.scope === 'floor') room.floorMaterialId = material.id;
  if (op.scope === 'wall') room.wallMaterialId = material.id;
  const id = `mat-${room.id}-${op.scope}`;
  const existing = project.materials.find((entry) => entry.id === id);
  if (existing) existing.materialId = material.id;
  else project.materials.push({ id, roomId: room.id, scope: op.scope, materialId: material.id, meta: AI_META('AI 材质建议') });
  applied.push(`材质：${room.name} ${op.scope} → ${material.name}`);
}

function setRoomTypeOp(
  project: Project,
  op: Extract<DesignOp, { op: 'setRoomType' }>,
  reject: (reason: string) => void,
  applied: string[],
): void {
  const room = project.rooms.find((entry) => entry.id === op.roomId);
  if (!room) return reject(`房间不存在：${op.roomId}`);
  if (room.type === op.type) return;
  room.type = op.type;
  room.meta = AI_META('AI 建议的房间类型');
  applied.push(`房间类型：${room.name} → ${op.type}`);
}

/* ------------------------------------------------------------------ */
/* regenerateRoom                                                     */
/* ------------------------------------------------------------------ */

export interface RegenerateRoomReport {
  diagnostics: string[];
  furniture: number;
  mep: number;
}

function regenerateRoomOp(
  project: Project,
  op: Extract<DesignOp, { op: 'regenerateRoom' }>,
  deps: PatchDeps,
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
): RegenerateRoomReport {
  const room = project.rooms.find((entry) => entry.id === op.roomId);
  if (!room) {
    reject(`房间不存在：${op.roomId}`);
    return { diagnostics: [], furniture: 0, mep: 0 };
  }
  const report: RegenerateRoomReport = { diagnostics: [], furniture: 0, mep: 0 };
  const mode = op.mode ?? 'layout';
  if (mode === 'layout' || mode === 'both') {
    if (deps.generateLayout) {
      const layoutOptions = {
        styleId: project.style.id,
        mode: 'replace' as const,
        roomIds: [room.id],
        brief: undefined,
      };
      const result = deps.generateLayout(structuredClone(project), layoutOptions);
      const forRoom = result.furniture.filter((item) => item.roomId === room.id);
      project.furniture = project.furniture.filter((item) => item.roomId !== room.id).concat(forRoom);
      report.furniture = forRoom.length;
      report.diagnostics.push(...result.diagnostics);
      applied.push(`重排 ${room.name} 家具 ${forRoom.length} 件`);
    } else {
      // Fallback: keep the room's items but re-fit them inside the room.
      const roomItems = project.furniture.filter((item) => item.roomId === room.id);
      for (const item of roomItems) {
        if (!sampleInsideRoom(room, footprintBox(item))) {
          const placement = placeInRoom(room, { w: item.w, d: item.d }, project.furniture.filter((entry) => entry.id !== item.id));
          item.x = placement.x;
          item.y = placement.y;
          item.rotation = placement.rotation;
          item.meta = AI_META(rationale);
        }
      }
      report.furniture = roomItems.length;
    }
  }
  if (mode === 'mep' || mode === 'both') {
    if (deps.generateMep) {
      ensureCircuits(project);
      const result = deps.generateMep(structuredClone(project), {
        mode: 'replace',
        styleId: project.style.id,
      });
      const forRoom = result.devices.filter((device) => device.roomId === room.id);
      project.mep.devices = project.mep.devices.filter((device) => device.roomId !== room.id).concat(forRoom);
      report.mep = forRoom.length;
      report.diagnostics.push(...result.diagnostics);
      applied.push(`重排 ${room.name} 水电点位 ${forRoom.length} 个`);
    } else {
      const removed = project.mep.devices.filter((device) => device.roomId === room.id).length;
      project.mep.devices = project.mep.devices.filter((device) => device.roomId !== room.id);
      report.mep = removed;
    }
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* DesignBrief                                                        */
/* ------------------------------------------------------------------ */

export interface BriefExecutionReport extends PatchExecutionResult {
  diagnostics: string[];
}

function applyBriefOp(
  project: Project,
  brief: DesignBrief,
  mode: BriefApplyMode,
  deps: PatchDeps,
  rationale: string,
  reject: (reason: string) => void,
  applied: string[],
  diagnostics: string[],
): void {
  const briefRoomIds = new Set(
    brief.rooms
      .map((entry) => entry.roomId)
      .filter((id): id is string => Boolean(id) && project.rooms.some((room) => room.id === id)),
  );
  // Room programme types
  for (const entry of brief.rooms) {
    if (!entry.roomId) continue;
    const room = project.rooms.find((candidate) => candidate.id === entry.roomId);
    if (!room) continue;
    if (room.type !== entry.type) {
      room.type = entry.type;
      room.meta = AI_META(rationale);
    }
  }
  // Style
  const styleApplied = applyStyleOp(
    project,
    { presetId: brief.style.presetId, customName: brief.style.customName, tokens: brief.style.tokens },
    deps,
    reject,
  );
  if (styleApplied) applied.push(`风格：${brief.style.customName ?? brief.style.presetId ?? 'AI 自定义'}`);
  // Materials
  for (const entry of brief.materials) {
    if (!entry.materialId) continue;
    const material = findMaterialIn(deps, entry.materialId);
    if (!material) {
      reject(`材质不存在：${entry.materialId}`);
      continue;
    }
    const targets = entry.roomId
      ? project.rooms.filter((room) => room.id === entry.roomId)
      : project.rooms.filter((room) => briefRoomIds.size === 0 || briefRoomIds.has(room.id));
    if (targets.length === 0) continue;
    for (const room of targets) {
      if (entry.scope === 'floor') room.floorMaterialId = material.id;
      if (entry.scope === 'wall') room.wallMaterialId = material.id;
      const id = `mat-${room.id}-${entry.scope}`;
      const existing = project.materials.find((item) => item.id === id);
      if (existing) existing.materialId = material.id;
      else
        project.materials.push({
          id,
          roomId: room.id,
          scope: entry.scope,
          materialId: material.id,
          meta: AI_META(rationale),
        });
    }
    applied.push(`材质：${material.name} ×${targets.length} 间`);
  }
  if (mode === 'style-only') return;

  // Furniture
  const scopeRooms = project.rooms.filter((room) => briefRoomIds.size === 0 || briefRoomIds.has(room.id));
  const scopeRoomIds = scopeRooms.map((room) => room.id);
  const existingCountForScope = project.furniture.filter((item) => item.roomId && scopeRoomIds.includes(item.roomId)).length;
  if (mode === 'replace') {
    const before = project.furniture.length;
    project.furniture = project.furniture.filter((item) => !item.roomId || !scopeRoomIds.includes(item.roomId));
    const removed = before - project.furniture.length;
    if (removed > 0) applied.push(`清空涉及房间家具 ${removed} 件`);
  }
  const shouldLayout = mode === 'replace' || existingCountForScope === 0;
  let furnitureCount = 0;
  if (deps.generateLayout && shouldLayout) {
    const layoutInput = structuredClone(project);
    const options = {
      styleId: brief.style.presetId ?? project.style.id,
      mode: mode === 'replace' ? ('replace' as const) : ('fill-empty' as const),
      brief,
      roomIds: scopeRoomIds.length > 0 ? scopeRoomIds : undefined,
    };
    const result = deps.generateLayout(layoutInput, options);
    const scoped = result.furniture.filter(
      (item) => !item.roomId || scopeRoomIds.length === 0 || scopeRoomIds.includes(item.roomId),
    );
    project.furniture.push(
      ...scoped.map((item) => ({
        ...item,
        meta: { ...item.meta, source: 'ai' as const, rationale: item.meta?.rationale ?? rationale },
      })),
    );
    furnitureCount = scoped.length;
    diagnostics.push(...result.diagnostics);
    if (furnitureCount > 0) applied.push(`布局引擎新增家具 ${furnitureCount} 件`);
  } else if (shouldLayout) {
    // No layout engine: place the brief's explicit furniture only.
    for (const item of brief.furniture) {
      const room = item.roomId
        ? project.rooms.find((candidate) => candidate.id === item.roomId)
        : scopeRooms[0];
      if (!room) {
        reject(`房间不存在：${item.roomId ?? '未指定'}`);
        continue;
      }
      const sku = resolveNearestSkuIn(deps, {
        skuId: item.skuId,
        category: item.category,
        name: item.category,
        roomType: room.type,
      });
      if (!sku) {
        reject(`目录中找不到家具：${item.skuId ?? item.category}`);
        continue;
      }
      const qty = clamp(item.qty ?? 1, 1, 20);
      for (let index = 0; index < qty; index += 1) {
        const placement = placeInRoom(room, { w: item.sizeHint?.w ?? sku.w, d: item.sizeHint?.d ?? sku.d }, project.furniture, {
          wallMounted: sku.wallMounted,
        });
        const created = createFurnitureItem({
          skuId: sku.id,
          name: sku.name,
          x: placement.x,
          y: placement.y,
          w: item.sizeHint?.w ?? sku.w,
          d: item.sizeHint?.d ?? sku.d,
          h: item.sizeHint?.h ?? sku.h,
          rotation: placement.rotation,
          color: sku.color,
          roomId: room.id,
          meta: AI_META(rationale),
        });
        project.furniture.push(created);
        furnitureCount += 1;
      }
    }
    if (furnitureCount > 0) applied.push(`新增推荐家具 ${furnitureCount} 件`);
    diagnostics.push('本地布局引擎不可用，已按方案清单估算摆放');
  }

  // MEP
  let mepCount = 0;
  if (deps.generateMep && brief.mep.length > 0) {
    ensureCircuits(project);
    const mepInput = structuredClone(project);
    const result = deps.generateMep(mepInput, {
      mode: mode === 'replace' ? 'replace' : 'fill',
      styleId: brief.style.presetId ?? project.style.id,
      brief,
    });
    const scoped = result.devices.filter(
      (device) => !device.roomId || scopeRoomIds.length === 0 || scopeRoomIds.includes(device.roomId),
    );
    if (mode === 'replace') {
      project.mep.devices = project.mep.devices.filter(
        (device) => !device.roomId || !scopeRoomIds.includes(device.roomId),
      );
    }
    project.mep.devices.push(
      ...scoped.map((device) => ({
        ...device,
        meta: { ...device.meta, source: 'ai' as const, rationale: device.meta?.rationale ?? rationale },
      })),
    );
    mepCount = scoped.length;
    diagnostics.push(...result.diagnostics);
  } else {
    for (const entry of brief.mep) {
      if (!entry.roomId) continue;
      const room = project.rooms.find((candidate) => candidate.id === entry.roomId);
      if (!room) continue;
      mepCount += addMepOp(project, { roomId: room.id, kinds: entry.kinds, count: 1 }, rationale, reject, applied).length;
    }
  }
  if (mepCount > 0) applied.push(`水电点位 ${mepCount} 个`);
}

/* ------------------------------------------------------------------ */
/* Patch op dispatch                                                  */
/* ------------------------------------------------------------------ */

export function executeDesignPatch(
  project: Project,
  patch: DesignPatch,
  options: PatchExecutionOptions = {},
): PatchExecutionResult {
  const deps = options.deps ?? defaultPatchDeps();
  const draft = structuredClone(project);
  const applied: string[] = [];
  const rejected: PatchRejection[] = [];
  const diagnostics: string[] = [];
  const rationale = options.rationale?.trim() || patch.rationale?.trim() || patch.summary;
  const reject = (op: DesignOp['op']) => (reason: string) => {
    rejected.push({ op, reason });
  };
  const mode = options.mode ?? 'fill-empty';

  for (const op of patch.ops) {
    switch (op.op) {
      case 'applyBrief':
        applyBriefOp(draft, op.brief, mode === 'style-only' ? 'style-only' : mode, deps, rationale, reject(op.op), applied, diagnostics);
        break;
      case 'setStyle':
        if (applyStyleOp(draft, op, deps, reject(op.op))) applied.push('更新风格');
        break;
      case 'setRoomMaterial':
        setRoomMaterialOp(draft, op, deps, reject(op.op), applied);
        break;
      case 'setRoomType':
        setRoomTypeOp(draft, op, reject(op.op), applied);
        break;
      case 'setFurniture':
        setFurnitureOp(draft, op, deps, rationale, reject(op.op), applied);
        break;
      case 'addFurniture':
        addFurnitureOp(draft, op, deps, rationale, reject(op.op), applied);
        break;
      case 'replaceFurniture':
        replaceFurnitureOp(draft, op, deps, rationale, reject(op.op), applied);
        break;
      case 'removeFurniture': {
        const item = draft.furniture.find((entry) => entry.id === op.itemId);
        if (!item) reject(op.op)(`家具不存在：${op.itemId}`);
        else {
          draft.furniture = draft.furniture.filter((entry) => entry.id !== op.itemId);
          applied.push(`移除家具 ${item.name}`);
        }
        break;
      }
      case 'nudgeFurniture':
        nudgeFurnitureOp(draft, op, rationale, reject(op.op), applied);
        break;
      case 'regenerateRoom': {
        const report = regenerateRoomOp(draft, op, deps, rationale, reject(op.op), applied);
        diagnostics.push(...report.diagnostics);
        break;
      }
      case 'addMep':
        addMepOp(draft, op, rationale, reject(op.op), applied);
        break;
      case 'removeMep':
        removeMepOp(draft, op, reject(op.op), applied);
        break;
      case 'setCircuits':
        setCircuitsOp(draft, op, reject(op.op), applied);
        break;
      default:
        rejected.push({ op: (op as DesignOp).op, reason: '不支持的指令类型' });
    }
  }

  const diff = diffProjects(project, draft);
  return {
    applied,
    rejected,
    summary: patch.summary,
    diff,
    changed: !diffIsEmpty(diff),
    project: draft,
  };
}

export function executeDesignBrief(
  project: Project,
  brief: DesignBrief,
  mode: BriefApplyMode = 'replace',
  options: Omit<PatchExecutionOptions, 'mode'> = {},
): BriefExecutionReport {
  const deps = options.deps ?? defaultPatchDeps();
  const draft = structuredClone(project);
  const applied: string[] = [];
  const rejected: PatchRejection[] = [];
  const diagnostics: string[] = [];
  const rationale = options.rationale?.trim() || brief.summary;
  applyBriefOp(draft, brief, mode, deps, rationale, (reason) => rejected.push({ op: 'applyBrief', reason }), applied, diagnostics);
  const diff = diffProjects(project, draft);
  return {
    applied,
    rejected,
    summary: brief.summary,
    diff,
    changed: !diffIsEmpty(diff),
    project: draft,
    diagnostics,
  };
}

/* ------------------------------------------------------------------ */
/* Store integration: one undoable commit                              */
/* ------------------------------------------------------------------ */

function commitProject(
  result: PatchExecutionResult,
  aiMeta: Partial<Project['aiMeta']>,
): PatchExecutionResult {
  const store = useDocStore.getState();
  if (!result.changed) {
    if (Object.keys(aiMeta).length > 0) store.updateAiMeta(aiMeta);
    return { ...result, project: store.doc };
  }
  store.commit(
    (draft) => {
      draft.walls = result.project.walls;
      draft.openings = result.project.openings;
      draft.rooms = result.project.rooms;
      draft.furniture = result.project.furniture;
      draft.materials = result.project.materials;
      draft.style = result.project.style;
      draft.mep = result.project.mep;
      Object.assign(draft.aiMeta, aiMeta);
    },
    { history: true },
  );
  return { ...result, project: useDocStore.getState().doc };
}

export function applyPatchToDoc(patch: DesignPatch, options: PatchExecutionOptions = {}): PatchExecutionResult {
  const project = useDocStore.getState().doc;
  const result = executeDesignPatch(project, patch, options);
  return commitProject(result, {
    lastPatchSummary: patch.summary.slice(0, 200),
    lastAppliedAt: new Date().toISOString(),
  });
}

export function applyBriefToDoc(
  brief: DesignBrief,
  mode: BriefApplyMode = 'replace',
  options: Omit<PatchExecutionOptions, 'mode'> = {},
): BriefExecutionReport {
  const project = useDocStore.getState().doc;
  const result = executeDesignBrief(project, brief, mode, options);
  const committed = commitProject(result, {
    lastBriefId: brief.id,
    lastBriefLabel: brief.variantLabel,
    lastAppliedAt: new Date().toISOString(),
    lastPatchSummary: brief.summary.slice(0, 200),
  });
  return { ...committed, diagnostics: result.diagnostics };
}

export function undoAppliedAiChange(): boolean {
  const store = useDocStore.getState();
  if (store.past.length === 0) return false;
  store.undo();
  return true;
}

/** Readable counts for the panel's diff preview. */
export function summarizeDiff(diff: PatchDiff): string[] {
  const lines: string[] = [];
  if (diff.furnitureAdded.length > 0) lines.push(`新增家具 ${diff.furnitureAdded.length} 件`);
  if (diff.furnitureRemoved.length > 0) lines.push(`移除家具 ${diff.furnitureRemoved.length} 件`);
  if (diff.furnitureUpdated.length > 0) lines.push(`调整家具 ${diff.furnitureUpdated.length} 件`);
  if (diff.roomsUpdated.length > 0) lines.push(`房间变化 ${diff.roomsUpdated.length} 间`);
  if (diff.materialsUpdated > 0) lines.push(`材质变化 ${diff.materialsUpdated} 处`);
  if (diff.mepAdded > 0) lines.push(`新增点位 ${diff.mepAdded} 个`);
  if (diff.mepRemoved > 0) lines.push(`移除点位 ${diff.mepRemoved} 个`);
  if (diff.styleChanged) lines.push('风格变化');
  if (diff.circuitsChanged) lines.push('回路调整');
  return lines;
}

/** Aggregate per-room furniture quantity from a brief, for candidate cards. */
export function briefFurnitureCounts(brief: DesignBrief): { total: number; byRoom: number } {
  const total = brief.furniture.reduce((sum, item) => sum + (item.qty ?? 1), 0);
  const rooms = new Set(brief.furniture.map((item) => item.roomId).filter(Boolean));
  return { total, byRoom: rooms.size };
}

export function briefRoomLabel(brief: DesignBrief, rooms: Room[]): string[] {
  return brief.rooms
    .map((entry) => {
      if (!entry.roomId) return undefined;
      return rooms.find((room) => room.id === entry.roomId)?.name ?? entry.roomId;
    })
    .filter((label): label is string => Boolean(label));
}

export function briefRoomTypes(brief: DesignBrief): RoomType[] {
  return brief.rooms.map((entry) => roomTypeForBrief(entry)).filter((type): type is RoomType => Boolean(type));
}
