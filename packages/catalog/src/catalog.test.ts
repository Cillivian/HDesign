import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFurnitureItem,
  createRoom,
  rectPolygon,
  ROOM_TYPES,
  STYLE_TOKEN_KEYS,
  type RoomType,
} from '@hdesign/domain';
import {
  applyStyleToProject,
  applyStyleTokensToProject,
  buildCustomStyle,
  catalogShortlist,
  extractPalette,
  FURNITURE,
  getFurnitureSku,
  getMaterial,
  getStylePreset,
  MATERIALS,
  resolveStyleTokens,
  STYLE_PRESETS,
  styleTokensFromPalette,
  type FurnitureCategory,
} from '../src';

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

const SEED_MATERIALS = [
  'floor-oak',
  'floor-oak-walnut',
  'floor-tile-600',
  'floor-tile-anti-slip',
  'wall-latex-warm',
];

const STYLE_IDS = [
  'modern-minimal',
  'cream',
  'nordic',
  'japandi',
  'new-chinese',
  'light-luxury',
  'loft',
  'mid-century',
  'wabi-sabi',
  'american-retro',
  'dopamine',
  'mono',
];

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const CATEGORIES: FurnitureCategory[] = [
  'bed',
  'sofa',
  'table',
  'chair',
  'storage',
  'kitchen',
  'bath',
  'appliance',
  'lighting',
  'textile',
  'decor',
  'plant',
];

describe('catalogue integrity', () => {
  it('ships 100+ furniture SKUs with unique ids', () => {
    expect(FURNITURE.length).toBeGreaterThanOrEqual(100);
    const ids = new Set(FURNITURE.map((sku) => sku.id));
    expect(ids.size).toBe(FURNITURE.length);
  });

  it('contains every SKU used by the demo seed', () => {
    for (const id of SEED_SKUS) {
      const sku = getFurnitureSku(id);
      expect(sku, `missing seed sku ${id}`).toBeDefined();
      expect(sku!.w).toBeGreaterThan(0);
      expect(sku!.d).toBeGreaterThan(0);
      expect(sku!.h).toBeGreaterThan(0);
    }
  });

  it('has realistic dimensions, prices, categories and room types', () => {
    for (const sku of FURNITURE) {
      expect(CATEGORIES, `${sku.id} category`).toContain(sku.category);
      expect(sku.name.length).toBeGreaterThan(0);
      expect(sku.symbol.length).toBeGreaterThan(0);
      expect(sku.builder.length).toBeGreaterThan(0);
      expect(HEX.test(sku.color), `${sku.id} colour ${sku.color}`).toBe(true);
      expect(sku.w).toBeGreaterThanOrEqual(100);
      expect(sku.w).toBeLessThanOrEqual(4000);
      expect(sku.d).toBeGreaterThanOrEqual(30);
      expect(sku.d).toBeLessThanOrEqual(3000);
      expect(sku.h).toBeGreaterThanOrEqual(10);
      expect(sku.h).toBeLessThanOrEqual(3000);
      expect(sku.priceRange[0]).toBeGreaterThan(0);
      expect(sku.priceRange[1]).toBeGreaterThanOrEqual(sku.priceRange[0]);
      expect(sku.roomTypes.length).toBeGreaterThan(0);
      expect(Array.isArray(sku.styleTags)).toBe(true);
      expect(sku.materialSlots.length).toBeGreaterThan(0);
      for (const room of sku.roomTypes) {
        expect(ROOM_TYPES as readonly string[], `${sku.id} room ${room}`).toContain(room);
      }
    }
  });

  it('tags every SKU with known style ids only', () => {
    for (const sku of FURNITURE) {
      for (const tag of sku.styleTags) {
        expect(STYLE_IDS, `${sku.id} tag ${tag}`).toContain(tag);
      }
    }
  });
});

describe('materials', () => {
  it('includes the seed material ids with reference prices', () => {
    for (const id of SEED_MATERIALS) {
      const material = getMaterial(id);
      expect(material, `missing seed material ${id}`).toBeDefined();
      expect(material!.pricePerSqm).toBeGreaterThan(0);
      expect(HEX.test(material!.color)).toBe(true);
    }
  });

  it('has unique ids, valid scopes and style tags', () => {
    const ids = new Set(MATERIALS.map((material) => material.id));
    expect(ids.size).toBe(MATERIALS.length);
    const scopes = ['floor', 'wall', 'ceiling', 'joinery', 'countertop', 'metal', 'fabric'];
    for (const material of MATERIALS) {
      expect(scopes).toContain(material.scope);
      expect(HEX.test(material.color)).toBe(true);
      expect(material.name.length).toBeGreaterThan(0);
      expect(material.type.length).toBeGreaterThan(0);
      for (const tag of material.tags) expect(STYLE_IDS).toContain(tag);
    }
  });
});

describe('style presets', () => {
  it('ships all 12 presets in the requested order', () => {
    expect(STYLE_PRESETS.map((style) => style.id)).toEqual(STYLE_IDS);
    for (const id of STYLE_IDS) expect(getStylePreset(id)).toBeDefined();
  });

  it('provides the full token palette with valid hex colours', () => {
    for (const style of STYLE_PRESETS) {
      for (const key of STYLE_TOKEN_KEYS) {
        expect(style.tokens[key], `${style.id}.${key}`).toMatch(HEX);
      }
      expect(style.description.length).toBeGreaterThan(4);
      expect(style.moodKeywords.length).toBeGreaterThan(0);
      expect(style.lighting.temperature).toBeGreaterThanOrEqual(2000);
      expect(style.lighting.temperature).toBeLessThanOrEqual(6500);
      expect(style.lighting.intensity).toBeGreaterThan(0);
      expect(style.lighting.intensity).toBeLessThanOrEqual(1.2);
    }
  });

  it('maps materials that exist and match their scope', () => {
    for (const style of STYLE_PRESETS) {
      for (const [scope, materialId] of Object.entries(style.materials)) {
        const material = getMaterial(materialId!);
        expect(material, `${style.id} -> ${materialId}`).toBeDefined();
        expect(material!.scope).toBe(scope);
      }
    }
  });

  it('prefers furniture SKUs that exist with matching categories', () => {
    for (const style of STYLE_PRESETS) {
      for (const [category, ids] of Object.entries(style.furniturePreference)) {
        expect(ids!.length).toBeGreaterThan(0);
        for (const id of ids!) {
          const sku = getFurnitureSku(id);
          expect(sku, `${style.id} -> ${id}`).toBeDefined();
          expect(sku!.category, `${id} category`).toBe(category);
        }
      }
    }
  });
});

describe('catalogShortlist', () => {
  it('only returns SKUs usable in the room', () => {
    for (const roomType of ['living', 'kitchen', 'bath', 'master-bedroom', 'study'] as RoomType[]) {
      const list = catalogShortlist(roomType);
      expect(list.length).toBeGreaterThan(0);
      for (const sku of list) expect(sku.roomTypes).toContain(roomType);
    }
  });

  it('boosts the brief furniture pick and style preference', () => {
    const project = createEmptyProject('brief');
    const brief = {
      id: 'brief-1',
      variantLabel: 'A',
      summary: '',
      style: { presetId: 'japandi', moodKeywords: [], rationale: '' },
      rooms: [{ type: 'living' as RoomType, program: [], priority: 3, notes: '' }],
      furniture: [{ category: 'sofa', qty: 1, skuId: 'sofa-l', note: '' }],
      materials: [],
      mep: [],
      budget: { level: '舒适' as const },
      constraints: { keep: [], avoid: [] },
      questions: [],
      assumptions: [],
    };
    const list = catalogShortlist('living', brief);
    expect(list[0]!.id).toBe('sofa-l');
    void project;
  });
});

describe('applyStyleToProject', () => {
  function styledProject() {
    const project = createEmptyProject('风格测试');
    project.rooms = [
      createRoom(rectPolygon(0, 0, 4000, 3000), {
        id: 'room-living',
        type: 'living',
        floorMaterialId: 'floor-oak',
        wallMaterialId: 'wall-latex-warm',
      }),
    ];
    project.furniture = [
      createFurnitureItem({
        skuId: 'sofa-3',
        name: '三人沙发',
        x: 2000,
        y: 2500,
        w: 2300,
        d: 950,
        h: 780,
        color: '#A9A294',
        roomId: 'room-living',
      }),
      createFurnitureItem({
        skuId: 'coffee-table',
        name: '茶几',
        x: 2000,
        y: 1500,
        w: 1000,
        d: 550,
        h: 420,
        color: '#8C7A63',
        roomId: 'room-living',
        meta: { source: 'manual' },
      }),
    ];
    project.materials = [
      { id: 'mat-room-living-floor', roomId: 'room-living', scope: 'floor', materialId: 'floor-oak-cream' },
    ];
    return project;
  }

  it('is pure and updates style, materials, rooms and furniture colours', () => {
    const project = styledProject();
    const before = JSON.stringify(project);
    const result = applyStyleToProject(project, 'japandi');
    expect(JSON.stringify(project)).toBe(before);
    expect(result.style.id).toBe('japandi');
    expect(result.furniture).toHaveLength(2);
    const tokens = getStylePreset('japandi')!.tokens;
    expect(result.furniture[0]!.color).toBe(tokens.fabric);
    expect(result.furniture[1]!.color).toBe(tokens.joinery);
    expect(result.furniture[0]!.x).toBe(2000);
    expect(result.rooms[0]!.floorMaterialId).toBe('floor-oak');
    expect(result.rooms[0]!.wallMaterialId).toBe('wall-latex-warm');
    const floor = result.materials.find((entry) => entry.scope === 'floor' && !entry.roomId);
    expect(floor?.materialId).toBe('floor-oak');
    // per-room override survives
    expect(result.materials.some((entry) => entry.roomId === 'room-living')).toBe(true);
  });

  it('applies explicit AI tokens', () => {
    const project = styledProject();
    const tokens = { ...getStylePreset('cream')!.tokens, wall: '#EEE8DC' };
    const result = applyStyleTokensToProject(project, tokens, 'custom-ai');
    expect(result.style.id).toBe('custom-ai');
    expect(result.style.customTokens?.wall).toBe('#EEE8DC');
    expect(resolveStyleTokens({ ...project, style: result.style }, 'custom-ai').wall).toBe('#EEE8DC');
  });
});

describe('palette extraction', () => {
  function pixels(): number[] {
    const result: number[] = [];
    const colors = [
      [247, 239, 227],
      [201, 169, 125],
      [90, 98, 88],
      [239, 230, 216],
      [60, 70, 60],
    ];
    for (let index = 0; index < 400; index += 1) {
      const color = colors[index % colors.length]!;
      result.push(color[0]!, color[1]!, color[2]!, 255);
    }
    return result;
  }

  it('extracts a deterministic palette and maps it to 10 valid tokens', () => {
    const first = extractPalette(pixels(), { k: 4 });
    const second = extractPalette(pixels(), { k: 4 });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(3);
    const tokens = styleTokensFromPalette(first);
    for (const key of STYLE_TOKEN_KEYS) expect(tokens[key]).toMatch(HEX);
  });

  it('builds a valid custom style preset', () => {
    const tokens = styleTokensFromPalette(extractPalette(pixels(), { k: 4 }));
    const style = buildCustomStyle('我的参考图', tokens);
    expect(style.id).toMatch(/^custom-/);
    expect(style.tokens).toEqual(tokens);
    for (const key of STYLE_TOKEN_KEYS) expect(style.tokens[key]).toMatch(HEX);
    for (const [scope, materialId] of Object.entries(style.materials)) {
      const material = getMaterial(materialId!);
      expect(material).toBeDefined();
      expect(material!.scope).toBe(scope);
    }
  });
});
