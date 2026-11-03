import { describe, expect, it } from 'vitest';
import { createFurnitureItem, type FurnitureItem } from '@hdesign/domain';
import {
  FURNITURE_BUILDERS,
  buildFurnitureParts,
  normalizeBuilderKey,
  resolveBuilderKey,
} from './furniture-geometry';

function item(patch: Partial<FurnitureItem> & { skuId: string; name: string }): FurnitureItem {
  return createFurnitureItem({
    x: 0,
    y: 0,
    w: 1500,
    d: 900,
    h: 800,
    ...patch,
  });
}

describe('resolveBuilderKey', () => {
  const expected: Array<[string, string]> = [
    ['sofa-3', 'sofa'],
    ['sofa-2', 'sofa'],
    ['coffee-table', 'table'],
    ['tv-cabinet', 'tv'],
    ['rug', 'rug'],
    ['dining-table', 'table'],
    ['dining-chair', 'chair'],
    ['floor-lamp', 'lamp'],
    ['plant', 'plant'],
    ['bed-double', 'bed'],
    ['bed-single', 'bed'],
    ['nightstand', 'nightstand'],
    ['wardrobe', 'wardrobe'],
    ['desk', 'desk'],
    ['chair', 'chair'],
    ['kitchen-counter', 'counter'],
    ['fridge', 'fridge'],
    ['shower', 'shower'],
    ['toilet', 'toilet'],
    ['vanity', 'vanity'],
    ['bookshelf', 'bookshelf'],
  ];

  it.each(expected)('maps seed sku %s to builder %s', (skuId, builder) => {
    expect(resolveBuilderKey({ skuId })).toBe(builder);
  });

  it('prefers the catalogue builder key when it is available', () => {
    expect(resolveBuilderKey({ skuId: 'custom-123', name: '未知', builder: 'kitchen-counter' })).toBe('counter');
    expect(resolveBuilderKey({ skuId: 'custom-123', builder: 'desk-chair' })).toBe('chair');
    expect(resolveBuilderKey({ skuId: 'custom-123', builder: 'washing-machine' })).toBe('washing-machine');
  });

  it('falls back to Chinese furniture names', () => {
    expect(resolveBuilderKey({ skuId: 'sku-unknown-1', name: '三人沙发' })).toBe('sofa');
    expect(resolveBuilderKey({ skuId: 'sku-unknown-2', name: '双人床' })).toBe('bed');
    expect(resolveBuilderKey({ skuId: 'sku-unknown-3', name: '餐椅' })).toBe('chair');
    expect(resolveBuilderKey({ skuId: 'sku-unknown-4', name: '油烟机' })).toBe('range-hood');
  });

  it('degrades unknown items to the generic builder', () => {
    expect(resolveBuilderKey({ skuId: 'mystery-sku', name: '摆件' })).toBe('generic');
    expect(normalizeBuilderKey('')).toBe(null);
  });
});

describe('buildFurnitureParts', () => {
  it('produces finite, positive parts for every registered builder', () => {
    for (const builder of FURNITURE_BUILDERS) {
      const build = buildFurnitureParts(item({ skuId: builder, name: builder, w: 1200, d: 700, h: 900 }), builder);
      expect(build.builder).toBe(builder);
      expect(build.parts.length).toBeGreaterThan(0);
      for (const part of build.parts) {
        expect(part.position.every((value) => Number.isFinite(value))).toBe(true);
        expect(part.position[1]).toBeGreaterThanOrEqual(0);
        if (part.shape.kind === 'box') {
          expect(part.shape.size.every((value) => value > 0)).toBe(true);
        } else if (part.shape.kind === 'cylinder') {
          expect(part.shape.radius).toBeGreaterThan(0);
          expect(part.shape.height).toBeGreaterThan(0);
        } else if (part.shape.kind === 'sphere') {
          expect(part.shape.radius).toBeGreaterThan(0);
        } else {
          expect(part.shape.radius).toBeGreaterThan(0);
          expect(part.shape.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps furniture roughly inside its footprint', () => {
    const build = buildFurnitureParts(item({ skuId: 'sofa-3', name: '三人沙发' }));
    const maxX = Math.max(...build.parts.map((part) => Math.abs(part.position[0])));
    const maxZ = Math.max(...build.parts.map((part) => Math.abs(part.position[2])));
    expect(maxX).toBeLessThan(2200);
    expect(maxZ).toBeLessThan(900);
  });

  it('uses the generic box fallback for unknown skus', () => {
    const build = buildFurnitureParts(item({ skuId: 'unobtainium', name: '未知摆件' }));
    expect(build.builder).toBe('generic');
    expect(build.parts.length).toBe(3);
  });

  it('survives degenerate dimensions', () => {
    const build = buildFurnitureParts(item({ skuId: 'bed-x', name: '床', w: 50, d: 50, h: 10 }), 'bed');
    expect(build.parts.length).toBeGreaterThan(0);
    for (const part of build.parts) {
      expect(Number.isFinite(part.position[1])).toBe(true);
    }
  });
});
