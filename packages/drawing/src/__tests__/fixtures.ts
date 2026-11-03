import {
  createDefaultCircuits,
  createDefaultSheets,
  createEmptyProject,
  createFurnitureItem,
  createMepDevice,
  createOpening,
  createRoom,
  createWall,
  type Project,
} from '@hdesign/domain';

/**
 * Deterministic fixture shared by the drawing tests.
 *
 * Plan (mm): outer box 8000×4000, two rooms with clean 12㎡ / 9㎡ polygons,
 * one door + one window, furniture and MEP points. The expected BOM numbers in
 * the tests are derived from these exact dimensions.
 */
export function fixtureProject(): Project {
  const project = createEmptyProject('测试户型');
  project.id = 'prj-test';
  project.createdAt = '2026-01-01T00:00:00.000Z';
  project.updatedAt = '2026-01-02T00:00:00.000Z';
  project.level = { name: '1F', height: 2800 };
  project.aiMeta = {};

  const top = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 }, { id: 'wall-top', thickness: 240, isLoadBearing: true });
  const right = createWall({ x: 8000, y: 0 }, { x: 8000, y: 4000 }, { id: 'wall-right', thickness: 240, isLoadBearing: true });
  const bottom = createWall({ x: 8000, y: 4000 }, { x: 0, y: 4000 }, { id: 'wall-bottom', thickness: 240, isLoadBearing: true });
  const left = createWall({ x: 0, y: 4000 }, { x: 0, y: 0 }, { id: 'wall-left', thickness: 240, isLoadBearing: true });
  const divider = createWall({ x: 4000, y: 0 }, { x: 4000, y: 4000 }, { id: 'wall-divider', thickness: 120 });
  project.walls = [top, right, bottom, left, divider];

  project.openings = [
    createOpening(bottom, 'door', 1000, 900, { id: 'opening-door', height: 2100 }),
    createOpening(top, 'window', 2000, 1500, { id: 'opening-window', height: 1500, sill: 900 }),
  ];

  project.rooms = [
    createRoom(
      [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      {
        id: 'room-living',
        name: '客厅',
        type: 'living',
        floorMaterialId: 'floor-oak',
        wallMaterialId: 'wall-latex-warm',
        ceiling: { type: 'flat', height: 2800 },
      },
    ),
    createRoom(
      [
        { x: 4000, y: 0 },
        { x: 7000, y: 0 },
        { x: 7000, y: 3000 },
        { x: 4000, y: 3000 },
      ],
      {
        id: 'room-kitchen',
        name: '厨房',
        type: 'kitchen',
        floorMaterialId: 'floor-tile-600',
        wallMaterialId: 'wall-latex-warm',
        ceiling: { type: 'flat', height: 2800 },
      },
    ),
  ];

  const circuits = createDefaultCircuits();
  project.mep = {
    circuits,
    devices: [
      createMepDevice({ kind: 'socket', x: 1000, y: 500, roomId: 'room-living', circuitId: 'circuit-general' }),
      createMepDevice({ kind: 'socket', x: 1200, y: 500, roomId: 'room-living', circuitId: 'circuit-general' }),
      createMepDevice({ kind: 'light', x: 2000, y: 1500, roomId: 'room-living', circuitId: 'circuit-lighting' }),
      createMepDevice({ kind: 'water-cold', x: 5500, y: 400, roomId: 'room-kitchen' }),
    ],
  };

  project.furniture = [
    createFurnitureItem({
      skuId: 'sofa-3',
      name: '三人沙发',
      x: 1200,
      y: 2000,
      w: 2200,
      d: 900,
      color: '#A9A294',
      roomId: 'room-living',
    }),
    createFurnitureItem({
      skuId: 'dining-chair',
      name: '餐椅',
      x: 3000,
      y: 2400,
      w: 450,
      d: 480,
      roomId: 'room-living',
    }),
    createFurnitureItem({
      skuId: 'dining-chair',
      name: '餐椅',
      x: 3400,
      y: 2400,
      w: 450,
      d: 480,
      roomId: 'room-living',
    }),
  ];

  project.sheets = createDefaultSheets('测试户型');
  for (const sheet of project.sheets) {
    sheet.titleBlock = {
      ...sheet.titleBlock,
      projectName: '测试户型',
      designer: '李工',
      date: '2026-01-02',
      notes: '',
    };
  }
  return project;
}

export function fixtureSheet(project: Project, kind: Project['sheets'][number]['kind']) {
  const sheet = project.sheets.find((item) => item.kind === kind);
  if (!sheet) throw new Error(`missing sheet ${kind}`);
  return sheet;
}
