import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFloor,
  createFloorSheets,
  createReference,
  createWall,
  SCHEMA_VERSION,
  type Project,
} from './index';
import {
  activeFloor,
  collectReferenceAssetIds,
  defaultFloorName,
  floorEntities,
  floorStackHeight,
  isMultiFloor,
  nextFloorName,
  projectForFloor,
  pruneMissingReferences,
  recalculateElevations,
  syncProjectFloors,
} from './floors';
import { normalizeProject } from './migrations';

describe('schema v2 floor defaults', () => {
  it('starts with exactly one floor and points activeFloorId at it', () => {
    const project = createEmptyProject('复式');
    expect(SCHEMA_VERSION).toBe(2);
    expect(project.floors).toHaveLength(1);
    expect(project.activeFloorId).toBe(project.floors[0]!.id);
    expect(project.floors[0]!.name).toBe('1F');
    expect(project.floors[0]!.elevation).toBe(0);
    expect(project.level).toEqual({ name: '1F', height: 2800 });
    expect(project.sheets).toHaveLength(6);
    expect(project.sheets.every((sheet) => sheet.floorId === project.activeFloorId)).toBe(true);
  });

  it('generates unique sheet ids and floor-numbered sheet numbers per storey', () => {
    const first = createFloorSheets('复式', 'floor-a', 0);
    const second = createFloorSheets('复式', 'floor-b', 1);
    expect(new Set([...first, ...second].map((sheet) => sheet.id)).size).toBe(12);
    expect(first.map((sheet) => sheet.titleBlock.sheetNo)).toEqual([
      'A-01',
      'A-02',
      'A-03',
      'A-04',
      'A-05',
      'A-06',
    ]);
    expect(second[0]!.titleBlock.sheetNo).toBe('A-201');
  });
});

describe('ensureFloors / v1 migration', () => {
  it('upgrades a legacy flat document into a single storey', () => {
    const legacy: Record<string, unknown> = {
      id: 'prj-legacy',
      name: '老方案',
      schemaVersion: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      level: { name: '一层', height: 3000 },
      walls: [
        { id: 'w1', a: { x: 0, y: 0 }, b: { x: 3000, y: 0 } },
      ],
      openings: [],
      rooms: [],
      furniture: [],
      annotations: [],
      mep: { devices: [], circuits: [] },
    };
    const { project, warnings } = normalizeProject(legacy);
    expect(project.schemaVersion).toBe(2);
    expect(project.floors).toHaveLength(1);
    expect(project.floors[0]!.name).toBe('一层');
    expect(project.floors[0]!.height).toBe(3000);
    expect(project.floors[0]!.walls).toHaveLength(1);
    expect(project.activeFloorId).toBe(project.floors[0]!.id);
    expect(project.level).toEqual({ name: '一层', height: 3000 });
    expect(warnings.some((warning) => warning.includes('多楼层'))).toBe(true);
  });

  it('heals a hand-built project whose flat arrays were edited directly', () => {
    const project = createEmptyProject('样板');
    project.walls.push(createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }));
    // Simulate a seed/fixture that forgot to sync the floor snapshot.
    project.floors[0]!.walls = [];
    syncProjectFloors(project);
    expect(project.floors[0]!.walls).toHaveLength(1);
    expect(project.walls).toHaveLength(1);
    // The two are deep-copied, never aliased.
    expect(project.floors[0]!.walls[0]).not.toBe(project.walls[0]);
  });
});

describe('multi-floor scoping', () => {
  function twoFloorProject(): Project {
    const project = createEmptyProject('复式');
    const first = project.floors[0]!;
    const second = createFloor({ name: '2F' });
    project.walls.push(createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }));
    project.floors = [first, second];
    second.walls.push(createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }));
    syncProjectFloors(project);
    return project;
  }

  it('recalculates elevations from storey heights', () => {
    const floors = [
      createFloor({ name: '1F', height: 2800 }),
      createFloor({ name: '2F', height: 3200 }),
      createFloor({ name: '3F', height: 2600 }),
    ];
    recalculateElevations(floors);
    expect(floors.map((floor) => floor.elevation)).toEqual([0, 2800, 6000]);
    expect(floorStackHeight(floors)).toBe(8600);
  });

  it('scopes projectForFloor to the requested storey', () => {
    const project = twoFloorProject();
    const firstId = project.floors[0]!.id;
    const secondId = project.floors[1]!.id;
    expect(projectForFloor(project, firstId).walls).toHaveLength(1);
    expect(projectForFloor(project, secondId).walls).toHaveLength(1);
    expect(projectForFloor(project, secondId).walls[0]!.b.x).toBe(5000);
    expect(projectForFloor(project, secondId).level.name).toBe('2F');
    // Global sheet list stays visible for the title block.
    expect(projectForFloor(project, secondId).sheets).toBe(project.sheets);
    expect(projectForFloor(project, 'missing').walls).toBe(project.walls);
  });

  it('floorEntities uses the flat projection only for the active storey', () => {
    const project = twoFloorProject();
    const first = project.floors[0]!;
    const second = project.floors[1]!;
    expect(floorEntities(project, first).walls[0]!.b.x).toBe(3000);
    expect(floorEntities(project, second).walls[0]!.b.x).toBe(5000);
    project.activeFloorId = second.id;
    expect(floorEntities(project, second).walls).toBe(project.walls);
  });

  it('reports multi-storey state and the next unused label', () => {
    const project = twoFloorProject();
    expect(isMultiFloor(project)).toBe(true);
    expect(activeFloor(project)?.name).toBe('1F');
    expect(nextFloorName(project.floors)).toBe('3F');
    expect(defaultFloorName(2)).toBe('3F');
  });

  it('collects underlay assets from every storey and prunes missing ones', () => {
    const project = twoFloorProject();
    project.reference = createReference({ assetId: 'underlay-1', widthPx: 1200, heightPx: 900 });
    project.floors[1]!.reference = createReference({
      assetId: 'underlay-2',
      widthPx: 1200,
      heightPx: 900,
    });
    syncProjectFloors(project);
    const ids = collectReferenceAssetIds(project);
    expect(ids).toContain('underlay-1');
    expect(ids).toContain('underlay-2');
    pruneMissingReferences(project, new Set(['underlay-2']));
    expect(project.floors[0]!.reference).toBeUndefined();
    expect(project.floors[1]!.reference?.assetId).toBe('underlay-2');
  });
});
