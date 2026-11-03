import { describe, expect, it } from 'vitest';
import { createFurnitureItem, type FurnitureItem } from '@hdesign/domain';
import {
  collisionIds,
  collisionSummary,
  findFurnitureCollisions,
  footprintBBox,
  footprintCorners,
  footprintsIntersect,
} from './collision';

function item(
  overrides: Parameters<typeof createFurnitureItem>[0] & { id?: string },
): FurnitureItem {
  const created = createFurnitureItem(overrides);
  return created;
}

function at(
  id: string,
  name: string,
  x: number,
  y: number,
  w = 1000,
  d = 1000,
  rotation = 0,
  skuId = id,
): FurnitureItem {
  return { ...item({ skuId, name, x, y, w, d, rotation }), id };
}

describe('findFurnitureCollisions', () => {
  it('reports two overlapping items', () => {
    const sofas = [at('a', '三人沙发', 0, 0, 2000, 900), at('b', '沙发', 800, 0, 2000, 900)];
    const collisions = findFurnitureCollisions(sofas);
    expect(collisions).toHaveLength(1);
    expect(collisionIds(collisions)).toEqual(new Set(['a', 'b']));
    expect(collisionSummary(collisions)).toContain('家具重叠');
  });

  it('ignores items that only touch or are separated', () => {
    const sofas = [at('a', '沙发', 0, 0, 1000, 1000), at('b', '沙发', 1500, 0, 1000, 1000)];
    expect(findFurnitureCollisions(sofas)).toEqual([]);
  });

  it('exempts rugs under furniture', () => {
    const items = [
      at('rug', '地毯', 0, 0, 3000, 4000, 0, 'rug'),
      at('sofa', '三人沙发', 0, 0, 2200, 900),
    ];
    expect(findFurnitureCollisions(items)).toEqual([]);
  });

  it('exempts wall-mounted and counter items', () => {
    const items = [
      at('tv', '电视柜', 0, 0, 2000, 400),
      at('wall', '壁灯', 0, 0, 200, 200),
      at('counter', '水槽台面', 0, 0, 800, 600),
    ];
    expect(findFurnitureCollisions(items)).toEqual([]);
  });

  it('allows a seat tucked under a table', () => {
    const items = [at('table', '餐桌', 0, 0, 1400, 800), at('chair', '餐椅', 0, 260, 450, 500)];
    expect(findFurnitureCollisions(items)).toEqual([]);
  });

  it('still warns when a chair is only partially overlapping a table at its edge', () => {
    const items = [at('table', '餐桌', 0, 0, 1400, 800), at('chair', '餐椅', 0, 450, 450, 500)];
    // Chair centre is outside the table, but its footprint intersects the table edge.
    const collisions = findFurnitureCollisions(items);
    expect(collisions).toHaveLength(1);
  });

  it('detects collisions between rotated footprints', () => {
    const items = [at('a', '沙发', 0, 0, 2000, 400, 45), at('b', '沙发', 0, 0, 2000, 400, -45)];
    expect(findFurnitureCollisions(items)).toHaveLength(1);
  });

  it('supports excluding the actively dragged item', () => {
    const items = [at('a', '沙发', 0, 0), at('b', '沙发', 400, 0)];
    expect(findFurnitureCollisions(items, { excludeIds: ['a'] })).toEqual([]);
  });

  it('filters hairline overlaps with the area tolerance', () => {
    const items = [at('a', '沙发', 0, 0, 1000, 1000), at('b', '沙发', 990, 0, 1000, 1000)];
    expect(findFurnitureCollisions(items, { tolerance: 20000 })).toEqual([]);
    expect(findFurnitureCollisions(items, { tolerance: 1 })).toHaveLength(1);
  });
});

describe('footprint geometry', () => {
  it('rotates corners around the item centre', () => {
    const sofa = at('a', '沙发', 100, 100, 1000, 400, 90);
    const corners = footprintCorners(sofa);
    const box = footprintBBox(sofa);
    expect(box.w).toBeCloseTo(400, 3);
    expect(box.h).toBeCloseTo(1000, 3);
    expect(corners).toHaveLength(4);
  });

  it('uses the separating axis theorem for rotated rectangles', () => {
    const first = footprintCorners(at('a', '沙发', 0, 0, 1000, 500, 45));
    const second = footprintCorners(at('b', '沙发', 0, 0, 1000, 500, -45));
    const third = footprintCorners(at('c', '沙发', 5000, 5000, 1000, 500, 0));
    expect(footprintsIntersect(first, second)).toBe(true);
    expect(footprintsIntersect(first, third)).toBe(false);
  });
});
