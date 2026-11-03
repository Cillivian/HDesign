import * as catalogModule from '@hdesign/catalog';
import type { FurnitureSku, MaterialDef } from '@hdesign/catalog';

/**
 * Thin runtime bridge to `@hdesign/catalog`.
 *
 * Workstream B builds the catalog in parallel, so the module is imported
 * defensively: before the data lands every lookup returns `undefined` and the
 * 3D scene falls back to its local skuId / name heuristics.
 */
interface CatalogRuntime {
  FURNITURE?: FurnitureSku[];
  getFurnitureSku?: (id: string) => FurnitureSku | undefined;
  MATERIALS?: MaterialDef[];
  getMaterial?: (id: string) => MaterialDef | undefined;
}

const catalog = catalogModule as unknown as CatalogRuntime;

export function lookupFurnitureSku(skuId: string): FurnitureSku | undefined {
  try {
    if (typeof catalog.getFurnitureSku === 'function') {
      const sku = catalog.getFurnitureSku(skuId);
      if (sku) return sku;
    }
    if (Array.isArray(catalog.FURNITURE)) {
      return catalog.FURNITURE.find((sku) => sku.id === skuId);
    }
  } catch {
    /* catalog is optional while workstream B is in flight */
  }
  return undefined;
}

export function lookupMaterial(materialId: string): MaterialDef | undefined {
  try {
    if (typeof catalog.getMaterial === 'function') {
      const material = catalog.getMaterial(materialId);
      if (material) return material;
    }
    if (Array.isArray(catalog.MATERIALS)) {
      return catalog.MATERIALS.find((material) => material.id === materialId);
    }
  } catch {
    /* catalog is optional while workstream B is in flight */
  }
  return undefined;
}

export function lookupMaterialColor(materialId: string): string | undefined {
  return lookupMaterial(materialId)?.color;
}
