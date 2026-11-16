import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFloor,
  createFloorSheets,
  createFurnitureItem,
  createRoom,
  createWall,
  projectForFloor,
  syncProjectFloors,
  type Floor,
  type Point,
  type Project,
} from '@hdesign/domain';
import { bomForProject, renderSheetSvg, sheetFileName } from '../index';

/** Two-storey project whose floors carry deliberately different, greppable names. */
function twoFloorProject(): { project: Project; first: Floor; second: Floor } {
  const project = createEmptyProject('复式样板');

  const box = (prefix: string, w: number, h: number) =>
    [
      createWall({ x: 0, y: 0 }, { x: w, y: 0 }, { id: `${prefix}-top`, thickness: 240 }),
      createWall({ x: w, y: 0 }, { x: w, y: h }, { id: `${prefix}-right`, thickness: 240 }),
      createWall({ x: w, y: h }, { x: 0, y: h }, { id: `${prefix}-bottom`, thickness: 240 }),
      createWall({ x: 0, y: h }, { x: 0, y: 0 }, { id: `${prefix}-left`, thickness: 240 }),
    ];

  const rect = (w: number, h: number): Point[] => [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  // Active floor (1F) lives on the flat projection — the shape doc-store exposes.
  project.walls = box('f1', 8000, 4000);
  project.rooms = [createRoom(rect(4000, 3000), { id: 'r-1f', name: '一层客厅', type: 'living' })];
  project.furniture = [
    createFurnitureItem({
      skuId: 'sofa-f1',
      name: '一层沙发',
      x: 1000,
      y: 1000,
      w: 2000,
      d: 900,
      roomId: 'r-1f',
    }),
  ];
  syncProjectFloors(project);
  const first = project.floors[0];

  // Inactive floor (2F) keeps its own authoritative snapshot.
  const second = createFloor({
    name: '2F',
    elevation: 2800,
    height: 3200,
    walls: box('f2', 6000, 4000),
    rooms: [createRoom(rect(6000, 4000), { id: 'r-2f', name: '二层主卧', type: 'bedroom' })],
    furniture: [
      createFurnitureItem({
        skuId: 'bed-f2',
        name: '二层床',
        x: 1000,
        y: 1000,
        w: 1800,
        d: 2000,
        roomId: 'r-2f',
      }),
    ],
  });
  project.floors.push(second);
  project.sheets = [
    ...createFloorSheets('复式样板', first.id, 0),
    ...createFloorSheets('复式样板', second.id, 1),
  ];
  return { project, first, second };
}

function sheetFor(project: Project, floor: Floor, kind: Project['sheets'][number]['kind']) {
  const sheet = project.sheets.find((item) => item.floorId === floor.id && item.kind === kind);
  if (!sheet) throw new Error(`missing sheet ${kind} for ${floor.name}`);
  return sheet;
}

describe('multi-storey sheet rendering', () => {
  it('scopes a floor-bound sheet to that floor’s own entities', () => {
    const { project, first, second } = twoFloorProject();
    const firstSvg = renderSheetSvg(project, sheetFor(project, first, 'furniture-plan'));
    const secondSvg = renderSheetSvg(project, sheetFor(project, second, 'furniture-plan'));

    // Active floor reads the flat projection.
    expect(firstSvg).toContain('一层客厅');
    expect(firstSvg).toContain('一层沙发');
    expect(firstSvg).not.toContain('二层主卧');
    expect(firstSvg).not.toContain('二层床');

    // Inactive floor reads its snapshot, not the flat projection.
    expect(secondSvg).toContain('二层主卧');
    expect(secondSvg).toContain('二层床');
    expect(secondSvg).not.toContain('一层客厅');
    expect(secondSvg).not.toContain('一层沙发');
  });

  it('keeps legacy sheets without floorId bound to the active flat projection', () => {
    const { project, first, second } = twoFloorProject();
    const legacy = { ...sheetFor(project, first, 'furniture-plan'), floorId: undefined };
    const svg = renderSheetSvg(project, legacy);
    expect(svg).toContain('一层客厅');
    expect(svg).not.toContain('二层主卧');
    // Sanity: the 2F snapshot really is different.
    expect(renderSheetSvg(project, sheetFor(project, second, 'furniture-plan'))).toContain('二层主卧');
  });

  it('scopes the BOM sheet to its floor, including that floor’s storey height', () => {
    const { project, second } = twoFloorProject();
    const svg = renderSheetSvg(project, sheetFor(project, second, 'bom'));
    expect(svg).toContain('二层床');
    expect(svg).not.toContain('一层沙发');

    // 2F room is 6000×4000 = 24㎡ and its walls use height 3200mm.
    const bom = bomForProject(projectForFloor(project, second.id));
    expect(bom.areaSqm).toBe(24);
    expect(bom.roomCount).toBe(1);
    expect(bom.wallAreaSqm).toBeGreaterThan(0);
  });

  it('includes the storey name in floor-bound file names and never collides', () => {
    const { project, first, second } = twoFloorProject();
    const firstSheet = sheetFor(project, first, 'furniture-plan');
    const secondSheet = sheetFor(project, second, 'furniture-plan');

    const firstName = sheetFileName(project, 'furniture-plan', 'svg', firstSheet);
    const secondName = sheetFileName(project, 'furniture-plan', '.svg', secondSheet);
    expect(firstName).toContain('1F');
    expect(firstName).toContain('平面布置图');
    expect(secondName).toContain('2F');
    expect(secondName).toContain('平面布置图');
    expect(secondName.endsWith('.svg')).toBe(true);
    expect(firstName).not.toBe(secondName);

    // A sheet without floorId (or no sheet at all) keeps the legacy name.
    expect(sheetFileName(project, 'furniture-plan', 'svg')).not.toContain('1F');
    expect(sheetFileName(project, 'furniture-plan', 'svg', { ...firstSheet, floorId: undefined })).not.toContain('1F');
  });

  it('numbers a second-storey sheet set with the 2xx series', () => {
    const { project, second } = twoFloorProject();
    const sheets = project.sheets.filter((sheet) => sheet.floorId === second.id);
    expect(sheets).toHaveLength(6);
    expect(sheets.map((sheet) => sheet.titleBlock.sheetNo)).toEqual([
      'A-201',
      'A-202',
      'A-203',
      'A-204',
      'A-205',
      'A-206',
    ]);
  });
});
