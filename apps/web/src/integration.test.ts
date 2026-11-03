import { describe, expect, it } from 'vitest';
import { FURNITURE, MATERIALS, STYLE_PRESETS, getFurnitureSku } from '@hdesign/catalog';
import { generateLayout, generateMep } from '@hdesign/autolayout';
import { createDemoProjects } from './store/seed';

const SEED_SKUS = [
  'sofa-3',
  'sofa-2',
  'coffee-table',
  'tv-cabinet',
  'rug',
  'dining-table',
  'dining-chair',
  'floor-lamp',
  'plant',
  'bed-double',
  'bed-single',
  'nightstand',
  'wardrobe',
  'desk',
  'chair',
  'kitchen-counter',
  'fridge',
  'shower',
  'toilet',
  'vanity',
  'bookshelf',
];

describe('cross-package integration', () => {
  it('ships a catalogue that covers every demo sku', () => {
    expect(FURNITURE.length).toBeGreaterThanOrEqual(100);
    expect(STYLE_PRESETS.length).toBe(12);
    expect(MATERIALS.length).toBeGreaterThanOrEqual(20);
    for (const id of SEED_SKUS) {
      expect(getFurnitureSku(id), `missing sku ${id}`).toBeDefined();
    }
  });

  it('builds a deterministic furniture layout for the demo plan', () => {
    const project = createDemoProjects()[0]!;
    const first = generateLayout(project, { styleId: 'cream', mode: 'replace', seed: 7 });
    const second = generateLayout(project, { styleId: 'cream', mode: 'replace', seed: 7 });
    expect(first.furniture.length).toBeGreaterThan(10);
    expect(first.furniture.map((item) => [item.skuId, Math.round(item.x), Math.round(item.y)])).toEqual(
      second.furniture.map((item) => [item.skuId, Math.round(item.x), Math.round(item.y)]),
    );
    expect(first.diagnostics.length).toBeLessThan(10);
  });

  it('generates water/electric points for every demo room type', () => {
    const project = createDemoProjects()[0]!;
    const result = generateMep(project, { mode: 'replace' });
    expect(result.devices.length).toBeGreaterThan(5);
    const kinds = new Set(result.devices.map((device) => device.kind));
    expect(kinds.has('socket')).toBe(true);
    expect([...kinds].some((kind) => kind.startsWith('water') || kind === 'drain')).toBe(true);
    for (const device of result.devices) {
      expect(device.height).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(device.x)).toBe(true);
    }
  });
});
