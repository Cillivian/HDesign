import * as catalogPkg from '@hdesign/catalog';

/**
 * Adapter around `@hdesign/catalog` (owned by workstream B).
 *
 * The catalog is a moving target during parallel development, so this module
 * only calls it through a runtime-checked namespace import and always keeps a
 * local reference table as a fallback. When B ships `getMaterial` /
 * `getFurnitureSku` the richer data is used automatically; otherwise the
 * drawing engine still produces stable, meaningful BOM numbers.
 */

export interface MaterialInfo {
  id: string;
  name: string;
  scope: 'floor' | 'wall' | 'ceiling' | 'joinery' | 'countertop';
  color: string;
  /** Reference price per square metre (CNY). */
  pricePerSqm?: number;
  /** Construction wastage multiplier applied to net quantities. */
  wastage: number;
  type: string;
}

export interface FurnitureInfo {
  skuId: string;
  name: string;
  /** Mid-point of the catalog price range; 0 when unknown. */
  price: number;
  hasPrice: boolean;
  /** Symbol key resolved by @hdesign/symbols (workstream B catalog field). */
  symbol?: string;
  category?: string;
}

export interface CatalogAdapterStatus {
  catalog: boolean;
  symbols: boolean;
}

interface ExternalCatalog {
  getMaterial?: (id: string) => unknown;
  getFurnitureSku?: (skuId: string) => unknown;
  MATERIALS?: unknown;
  FURNITURE?: unknown;
}

const externalCatalog = catalogPkg as unknown as ExternalCatalog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function externalMaterial(id: string): MaterialInfo | null {
  if (typeof externalCatalog.getMaterial !== 'function') return null;
  try {
    const raw = externalCatalog.getMaterial(id);
    if (!isRecord(raw)) return null;
    const name = typeof raw.name === 'string' && raw.name ? raw.name : null;
    if (!name) return null;
    const scope = raw.scope;
    const normalizedScope: MaterialInfo['scope'] =
      scope === 'wall' || scope === 'ceiling' || scope === 'joinery' || scope === 'countertop'
        ? scope
        : 'floor';
    return {
      id,
      name,
      scope: normalizedScope,
      color: typeof raw.color === 'string' ? raw.color : '#C9BCA6',
      pricePerSqm: typeof raw.pricePerSqm === 'number' ? raw.pricePerSqm : undefined,
      wastage: guessWastage(id),
      type: typeof raw.type === 'string' ? raw.type : 'generic',
    };
  } catch {
    return null;
  }
}

function externalFurniture(skuId: string): FurnitureInfo | null {
  if (typeof externalCatalog.getFurnitureSku !== 'function') return null;
  try {
    const raw = externalCatalog.getFurnitureSku(skuId);
    if (!isRecord(raw)) return null;
    const name = typeof raw.name === 'string' && raw.name ? raw.name : null;
    if (!name) return null;
    let price = 0;
    const range = raw.priceRange;
    if (Array.isArray(range) && range.length === 2) {
      const low = Number(range[0]);
      const high = Number(range[1]);
      if (Number.isFinite(low) && Number.isFinite(high)) price = Math.round((low + high) / 2);
    }
    return {
      skuId,
      name,
      price,
      hasPrice: price > 0,
      symbol: typeof raw.symbol === 'string' ? raw.symbol : undefined,
      category: typeof raw.category === 'string' ? raw.category : undefined,
    };
  } catch {
    return null;
  }
}

export function catalogAvailable(): boolean {
  return (
    typeof externalCatalog.getMaterial === 'function' ||
    typeof externalCatalog.getFurnitureSku === 'function' ||
    isRecord(externalCatalog.MATERIALS) ||
    isRecord(externalCatalog.FURNITURE)
  );
}

/* ------------------------------------------------------------------ */
/* Local fallback reference tables                                     */
/* ------------------------------------------------------------------ */

function guessWastage(materialId: string): number {
  const id = materialId.toLowerCase();
  if (id.includes('tile')) return 1.08;
  if (id.includes('oak') || id.includes('wood') || id.includes('walnut')) return 1.05;
  if (id.includes('stone') || id.includes('marble') || id.includes('terrazzo')) return 1.1;
  if (id.includes('carpet')) return 1.05;
  if (id.includes('paint') || id.includes('latex')) return 1.02;
  return 1.05;
}

const LOCAL_MATERIALS: Record<string, Omit<MaterialInfo, 'id' | 'wastage'>> = {
  'floor-oak': { name: '橡木复合地板', scope: 'floor', color: '#C9A97D', pricePerSqm: 168, type: 'wood' },
  'floor-oak-walnut': { name: '胡桃木地板', scope: 'floor', color: '#8A6242', pricePerSqm: 198, type: 'wood' },
  'floor-tile-600': { name: '600×600 抛釉地砖', scope: 'floor', color: '#DCDAD3', pricePerSqm: 128, type: 'tile' },
  'floor-tile-anti-slip': { name: '卫生间防滑地砖', scope: 'floor', color: '#B6B2A8', pricePerSqm: 138, type: 'tile' },
  'floor-tile-800': { name: '800×800 地砖', scope: 'floor', color: '#C7C4BC', pricePerSqm: 148, type: 'tile' },
  'floor-carpet': { name: '满铺地毯', scope: 'floor', color: '#BFAE98', pricePerSqm: 120, type: 'carpet' },
  'floor-terrazzo': { name: '水磨石地面', scope: 'floor', color: '#B9B6AC', pricePerSqm: 260, type: 'stone' },
  'wall-latex-warm': { name: '暖白乳胶漆', scope: 'wall', color: '#F3EEE4', pricePerSqm: 45, type: 'paint' },
  'wall-latex-cream': { name: '奶咖乳胶漆', scope: 'wall', color: '#D9C7B0', pricePerSqm: 48, type: 'paint' },
  'wall-microcement': { name: '微水泥墙面', scope: 'wall', color: '#B9B3A6', pricePerSqm: 220, type: 'paint' },
  'wall-wood-veneer': { name: '木饰面墙板', scope: 'wall', color: '#A9825C', pricePerSqm: 320, type: 'wood' },
  'wall-tile-matte': { name: '哑光墙砖', scope: 'wall', color: '#D6D3CA', pricePerSqm: 118, type: 'tile' },
  'ceiling-paint': { name: '顶面乳胶漆', scope: 'ceiling', color: '#F7F5EF', pricePerSqm: 38, type: 'paint' },
  'ceiling-gypsum': { name: '石膏板平顶', scope: 'ceiling', color: '#F2F0E9', pricePerSqm: 135, type: 'gypsum' },
  'ceiling-aluminium': { name: '铝扣板吊顶', scope: 'ceiling', color: '#E4E6E4', pricePerSqm: 158, type: 'metal' },
  'joinery-oak': { name: '橡木定制柜体', scope: 'joinery', color: '#C9A97D', pricePerSqm: 980, type: 'wood' },
  'countertop-quartz': { name: '石英石台面', scope: 'countertop', color: '#DEDCD4', pricePerSqm: 680, type: 'stone' },
};

export function materialInfo(id: string): MaterialInfo {
  const external = externalMaterial(id);
  if (external) return external;
  const local = LOCAL_MATERIALS[id];
  if (local) return { id, ...local, wastage: guessWastage(id) };
  return {
    id,
    name: `未登记材质 (${id})`,
    scope: 'floor',
    color: '#C9BCA6',
    wastage: guessWastage(id),
    type: 'generic',
  };
}

const LOCAL_FURNITURE_PRICES: Record<string, number> = {
  'sofa-3': 4800,
  'sofa-2': 3600,
  'coffee-table': 1200,
  'tv-cabinet': 2200,
  rug: 900,
  'dining-table': 2600,
  'dining-chair': 480,
  'floor-lamp': 380,
  plant: 120,
  'bed-double': 5200,
  'bed-single': 3200,
  nightstand: 450,
  wardrobe: 4200,
  desk: 1600,
  chair: 700,
  'kitchen-counter': 3800,
  fridge: 4200,
  shower: 2600,
  toilet: 1800,
  vanity: 2400,
  bookshelf: 1800,
};

export function furnitureInfo(skuId: string, fallbackName?: string): FurnitureInfo {
  const external = externalFurniture(skuId);
  if (external) return external;
  const price = LOCAL_FURNITURE_PRICES[skuId] ?? 0;
  return {
    skuId,
    name: fallbackName ?? skuId,
    price,
    hasPrice: price > 0,
  };
}

/** Reference installation prices for MEP points (CNY per point). */
export const MEP_POINT_PRICES: Record<string, number> = {
  socket: 65,
  'socket-16a': 95,
  switch: 45,
  'switch-double': 68,
  light: 120,
  'light-spot': 55,
  ac: 180,
  'weak-current': 85,
  'water-cold': 120,
  'water-hot': 135,
  drain: 150,
  'floor-drain': 90,
  gas: 160,
  'floor-heat': 680,
};

export function mepPointPrice(kind: string): number {
  return MEP_POINT_PRICES[kind] ?? 0;
}

export function adapterStatus(): CatalogAdapterStatus {
  return { catalog: catalogAvailable(), symbols: false };
}
