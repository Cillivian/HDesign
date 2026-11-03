import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFurnitureItem,
  createMepDevice,
  createOpening,
  createRoom,
  createWall,
  rectPolygon,
  type Project,
} from '@hdesign/domain';
import { bomDownloadName, bomToCsv, buildBom } from './bom';
import type { CatalogMaterial, CatalogSku } from './ai-design';

const MATERIALS: CatalogMaterial[] = [
  { id: 'floor-oak', name: '橡木地板', scope: 'floor', color: '#C9A97D', type: 'wood', pricePerSqm: 200, tags: [] },
  { id: 'wall-latex-warm', name: '暖白乳胶漆', scope: 'wall', color: '#F3EEE4', type: 'paint', pricePerSqm: 40, tags: [] },
  { id: 'ceiling-latex-white', name: '白色乳胶漆顶面', scope: 'ceiling', color: '#F7F6F2', type: 'paint', pricePerSqm: 50, tags: [] },
  { id: 'floor-tile-600', name: '600 地砖', scope: 'floor', color: '#C7C4BC', type: 'tile', pricePerSqm: 120, tags: [] },
];

const SKUS: CatalogSku[] = [
  {
    id: 'sofa-3',
    name: '三人沙发',
    category: 'sofa',
    w: 2200,
    d: 900,
    h: 780,
    styleTags: [],
    materialSlots: [],
    roomTypes: ['living'],
    wallMounted: false,
    collisionExempt: false,
    priceRange: [6000, 12000],
  },
];

function singleRoomProject(): Project {
  const project = createEmptyProject('清单测试');
  // 4000 × 3000mm room = 12㎡, perimeter 14m.
  project.rooms = [
    createRoom(rectPolygon(0, 0, 4000, 3000), {
      id: 'room-living',
      name: '客厅',
      type: 'living',
      floorMaterialId: 'floor-oak',
      wallMaterialId: 'wall-latex-warm',
    }),
  ];
  return project;
}

describe('buildBom', () => {
  it('computes floor / wall / ceiling / skirting quantities with wastage and openings', () => {
    const project = singleRoomProject();
    // A 900×2100 door centered on the bottom edge of the room.
    const bottomWall = createWall({ x: 0, y: 3000 }, { x: 4000, y: 3000 });
    project.walls = [bottomWall];
    project.openings = [createOpening(bottomWall, 'door', 1550, 900, { height: 2100 })];
    project.furniture = [
      createFurnitureItem({ skuId: 'sofa-3', name: '三人沙发', x: 2000, y: 1500, w: 2200, d: 900, h: 780, roomId: 'room-living' }),
    ];
    project.mep.devices = [
      createMepDevice({ kind: 'socket', x: 500, y: 2800, roomId: 'room-living', circuitId: 'circuit-general' }),
    ];

    const bom = buildBom(project, { generatedAt: '2026-01-01T00:00:00.000Z', skus: SKUS, materials: MATERIALS });
    const room = bom.rooms[0]!;

    expect(bom.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(room.floorAreaSqm).toBeCloseTo(12, 5);
    expect(room.floorWastage).toBe(0.05);
    expect(room.wallGrossAreaSqm).toBeCloseTo(14 * 2.8, 5); // 39.2
    expect(room.openingAreaSqm).toBeCloseTo(0.9 * 2.1, 5); // 1.89
    expect(room.wallAreaSqm).toBeCloseTo(39.2 - 1.89, 5);
    expect(room.ceilingAreaSqm).toBeCloseTo(12, 5);
    expect(room.skirtingM).toBeCloseTo(14 - 0.9, 5);
    expect(room.mepCounts.socket).toBe(1);

    const floor = room.lines.find((line) => line.id === 'bom-room-living-floor')!;
    expect(floor.qty).toBeCloseTo(12 * 1.05, 5); // wood 5% wastage
    expect(floor.unitPrice).toBe(200);
    expect(floor.total).toBeCloseTo(12.6 * 200, 5);

    const wall = room.lines.find((line) => line.id === 'bom-room-living-wall')!;
    expect(wall.qty).toBeCloseTo((39.2 - 1.89) * 1.05, 1);
    expect(wall.unitPrice).toBe(40);

    const ceiling = room.lines.find((line) => line.id === 'bom-room-living-ceiling')!;
    expect(ceiling.qty).toBeCloseTo(12 * 1.05, 5);

    const skirting = room.lines.find((line) => line.id === 'bom-room-living-skirting')!;
    expect(skirting.qty).toBeCloseTo(13.1 * 1.08, 1);
    expect(skirting.unit).toBe('m');

    const furniture = room.lines.find((line) => line.id === 'bom-room-living-fur-sofa-3')!;
    expect(furniture.qty).toBe(1);
    expect(furniture.unitPrice).toBe(9000); // midpoint of [6000, 12000]
    expect(furniture.total).toBe(9000);

    const subtotal = room.lines.reduce((sum, line) => sum + line.total, 0);
    expect(room.subtotal).toBeCloseTo(subtotal, 1);
    expect(room.range[0]).toBeLessThan(room.subtotal);
    expect(room.range[1]).toBeGreaterThan(room.subtotal);
  });

  it('uses tile wastage 8% for tile floors and groups accessory lines', () => {
    const project = singleRoomProject();
    project.rooms[0]!.floorMaterialId = 'floor-tile-600';
    project.mep.devices = [
      createMepDevice({ kind: 'socket', x: 400, y: 2800, roomId: 'room-living' }),
      createMepDevice({ kind: 'water-cold', x: 3600, y: 2800, roomId: 'room-living' }),
    ];
    const bom = buildBom(project, { skus: SKUS, materials: MATERIALS, generatedAt: '2026-01-01T00:00:00.000Z' });
    const room = bom.rooms[0]!;
    expect(room.floorWastage).toBe(0.08);
    const floor = room.lines.find((line) => line.id === 'bom-room-living-floor')!;
    expect(floor.qty).toBeCloseTo(12 * 1.08, 5);
    // Accessories: switch/socket panels, wire, water pipe.
    const accessoryIds = bom.lines.map((line) => line.id);
    expect(accessoryIds).toContain('bom-acc-panel');
    expect(accessoryIds).toContain('bom-acc-wire');
    expect(accessoryIds).toContain('bom-acc-pipe');
    expect(bom.totals.mepCount).toBe(2);
    expect(bom.totals.subtotal).toBeGreaterThan(room.subtotal);
  });

  it('produces a CSV with BOM and escaped cells', () => {
    const project = singleRoomProject();
    project.name = '两居，样板A';
    project.furniture = [
      createFurnitureItem({ skuId: 'sofa-3', name: '三人沙发', x: 2000, y: 1500, w: 2200, d: 900, h: 780, roomId: 'room-living' }),
    ];
    const bom = buildBom(project, { skus: SKUS, materials: MATERIALS, generatedAt: '2026-01-01T00:00:00.000Z' });
    const csv = bomToCsv(bom);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('房间,分类,名称');
    expect(csv).toContain('客厅');
    expect(csv).toContain('橡木地板');
    expect(csv).toContain('合计');
    // The project name contains a comma; it must be quoted in the note cell.
    expect(bomDownloadName(bom)).toBe('两居-样板A-物料清单.csv');
  });

  it('survives an empty project and projects without catalog data', () => {
    const empty = createEmptyProject('空方案');
    const bom = buildBom(empty, { generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(bom.rooms).toEqual([]);
    expect(bom.totals.subtotal).toBe(0);

    const project = singleRoomProject();
    const fallbackBom = buildBom(project, { generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(fallbackBom.rooms[0]!.lines.length).toBeGreaterThan(0);
  });
});
