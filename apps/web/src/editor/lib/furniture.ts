import {
  angleOf,
  clamp,
  createId,
  createFurnitureItem,
  rotatePoint,
  type FurnitureItem,
  type Point,
} from '@hdesign/domain';

/** Furniture presets used by the place tool when the catalog is not loaded yet. */
export interface FurniturePreset {
  skuId: string;
  name: string;
  w: number;
  d: number;
  h: number;
  color: string;
  wallMounted?: boolean;
}

/**
 * Minimal built-in presets so placing furniture never depends on the catalog
 * package being populated. The catalog (workstream B) is merged in at runtime
 * when available; matching sku ids win over these defaults.
 */
export const FALLBACK_PRESETS: FurniturePreset[] = [
  { skuId: 'sofa-3', name: '三人沙发', w: 2200, d: 900, h: 800, color: '#B9A88F' },
  { skuId: 'sofa-2', name: '双人沙发', w: 1600, d: 900, h: 800, color: '#B9A88F' },
  { skuId: 'bed-double', name: '双人床', w: 1800, d: 2000, h: 500, color: '#C4B49A' },
  { skuId: 'bed-single', name: '单人床', w: 1200, d: 2000, h: 500, color: '#C4B49A' },
  { skuId: 'dining-table', name: '餐桌', w: 1400, d: 800, h: 750, color: '#A98F6F' },
  { skuId: 'desk', name: '书桌', w: 1200, d: 600, h: 750, color: '#A98F6F' },
  { skuId: 'chair', name: '餐椅', w: 450, d: 500, h: 850, color: '#8E8676' },
  { skuId: 'wardrobe', name: '衣柜', w: 1800, d: 600, h: 2200, color: '#B4A88F' },
  { skuId: 'kitchen-base', name: '厨房地柜', w: 2400, d: 600, h: 850, color: '#9C9484' },
  { skuId: 'toilet', name: '马桶', w: 400, d: 650, h: 780, color: '#D8D8D2' },
  { skuId: 'floor-lamp', name: '落地灯', w: 400, d: 400, h: 1600, color: '#B7A98C' },
  { skuId: 'plant', name: '绿植', w: 500, d: 500, h: 1200, color: '#6F8A6A' },
  { skuId: 'rug', name: '地毯', w: 2000, d: 3000, h: 20, color: '#C9BFA9' },
  { skuId: 'tv-cabinet', name: '电视柜', w: 2000, d: 400, h: 450, color: '#A69C86' },
  { skuId: 'coffee-table', name: '茶几', w: 1000, d: 500, h: 400, color: '#A98F6F' },
  { skuId: 'nightstand', name: '床头柜', w: 500, d: 450, h: 550, color: '#B4A88F' },
  { skuId: 'generic', name: '家具', w: 800, d: 800, h: 800, color: '#B9A88F' },
];

const catalogCache = new Map<string, FurniturePreset>();
const exemptSkuIds = new Set<string>();
const wallMountedSkuIds = new Set<string>();

interface CatalogSkuLike {
  id: string;
  name: string;
  w: number;
  d: number;
  h: number;
  color: string;
  wallMounted?: boolean;
  collisionExempt?: boolean;
}

/** Merge catalog SKUs (workstream B) into the preset map, defensively. */
export function registerCatalogSkus(skus: unknown): void {
  if (!Array.isArray(skus)) return;
  for (const sku of skus as CatalogSkuLike[]) {
    if (!sku || typeof sku.id !== 'string') continue;
    if (sku.collisionExempt) exemptSkuIds.add(sku.id);
    if (sku.wallMounted) wallMountedSkuIds.add(sku.id);
    catalogCache.set(sku.id, {
      skuId: sku.id,
      name: sku.name ?? sku.id,
      w: Number.isFinite(sku.w) ? sku.w : 800,
      d: Number.isFinite(sku.d) ? sku.d : 800,
      h: Number.isFinite(sku.h) ? sku.h : 800,
      color: sku.color ?? '#B9A88F',
      wallMounted: sku.wallMounted,
    });
  }
}

let catalogLoadStarted = false;

/**
 * Try to pull furniture presets from @hdesign/catalog.
 * The package is owned by another workstream and may only export types, so the
 * import is defensive and the built-in presets remain the fallback.
 */
export async function ensureCatalogLoaded(): Promise<void> {
  if (catalogLoadStarted || catalogCache.size > 0) return;
  catalogLoadStarted = true;
  try {
    const module = (await import('@hdesign/catalog')) as unknown as Record<string, unknown>;
    const skus = module.FURNITURE_SKUS ?? module.FURNITURE_CATALOG ?? module.furnitureSkus;
    registerCatalogSkus(skus);
  } catch {
    /* catalog package may be empty or unavailable during parallel development */
  }
}

/** Catalog-level collision exemption (rugs, wall-mounted, counters, …). */
export function skuCollisionExempt(skuId: string): boolean {
  return exemptSkuIds.has(skuId);
}

export function skuWallMounted(skuId: string): boolean {
  return wallMountedSkuIds.has(skuId);
}

export function resolveFurniturePreset(skuId?: string | null): FurniturePreset {
  if (skuId) {
    const fromCatalog = catalogCache.get(skuId);
    if (fromCatalog) return fromCatalog;
    const fallback = FALLBACK_PRESETS.find((preset) => preset.skuId === skuId);
    if (fallback) return fallback;
    const byFuzzy = FALLBACK_PRESETS.find(
      (preset) => skuId.includes(preset.skuId) || preset.skuId.includes(skuId),
    );
    if (byFuzzy) return { ...byFuzzy, skuId };
    return { ...FALLBACK_PRESETS[FALLBACK_PRESETS.length - 1]!, skuId };
  }
  return FALLBACK_PRESETS[FALLBACK_PRESETS.length - 1]!;
}

export function placeFurniture(
  skuId: string | null | undefined,
  point: Point,
  roomId?: string,
): FurnitureItem {
  const preset = resolveFurniturePreset(skuId);
  return createFurnitureItem({
    skuId: preset.skuId,
    name: preset.name,
    x: point.x,
    y: point.y,
    w: preset.w,
    d: preset.d,
    h: preset.h,
    color: preset.color,
    roomId,
  });
}

export function duplicateFurnitureItem(item: FurnitureItem, offset = 200): FurnitureItem {
  return {
    ...item,
    id: createId('furn'),
    x: item.x + offset,
    y: item.y + offset,
    locked: false,
    meta: undefined,
  };
}

export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

const CORNER_SIGNS: Record<ResizeCorner, { sx: number; sy: number }> = {
  nw: { sx: -1, sy: -1 },
  ne: { sx: 1, sy: -1 },
  se: { sx: 1, sy: 1 },
  sw: { sx: -1, sy: 1 },
};

export interface ResizeResult {
  x: number;
  y: number;
  w: number;
  d: number;
}

const MIN_FOOTPRINT = 100;

/**
 * Resize a furniture footprint from one corner while the opposite corner stays
 * anchored. Works in the item's local (rotated) frame.
 */
export function resizeFurnitureFromCorner(
  item: FurnitureItem,
  corner: ResizeCorner,
  pointerWorld: Point,
  options: { minW?: number; minD?: number; preserveAspect?: boolean } = {},
): ResizeResult {
  const minW = options.minW ?? MIN_FOOTPRINT;
  const minD = options.minD ?? MIN_FOOTPRINT;
  const { sx, sy } = CORNER_SIGNS[corner];
  const center = { x: item.x, y: item.y };
  const local = rotatePoint(pointerWorld, center, -item.rotation);
  const localX = local.x - center.x;
  const localY = local.y - center.y;

  let w = Math.max(minW, item.w / 2 + sx * localX);
  let d = Math.max(minD, item.d / 2 + sy * localY);

  if (options.preserveAspect) {
    const ratio = item.w / Math.max(item.d, 1);
    if (w / d > ratio) d = w / ratio;
    else w = d * ratio;
  }

  const localCenterX = (sx * (w - item.w)) / 2;
  const localCenterY = (sy * (d - item.d)) / 2;
  const worldCenter = rotatePoint(
    { x: center.x + localCenterX, y: center.y + localCenterY },
    center,
    item.rotation,
  );

  return { x: worldCenter.x, y: worldCenter.y, w, d };
}

/** Rotation degrees while dragging the rotate handle, optional 15° snapping. */
export function rotationFromPointer(
  item: FurnitureItem,
  pointerWorld: Point,
  startPointerAngle: number,
  startRotation: number,
  snapStep = 0,
): number {
  const currentAngle = angleOf({ x: item.x, y: item.y }, pointerWorld);
  let delta = currentAngle - startPointerAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  let rotation = startRotation + delta;
  if (snapStep > 0) rotation = Math.round(rotation / snapStep) * snapStep;
  return clamp(Math.round(rotation * 10) / 10, -360, 360);
}

/** Font size for the furniture label, clamped for legibility at any footprint. */
export function furnitureLabelSize(item: FurnitureItem): number {
  return clamp(Math.min(item.w, item.d) * 0.18, 90, 220);
}
