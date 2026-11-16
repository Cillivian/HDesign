import { describe, expect, it } from 'vitest';
import {
  floorEntities,
  isMultiFloor,
  projectForFloor,
  syncProjectFloors,
  type Project,
} from '@hdesign/domain';
import { createDemoProjects } from './seed';

function duplexDemo(): Project {
  return createDemoProjects()[3]!;
}

describe('default demo projects', () => {
  it('ships four samples, with the classic single-storey plan first', () => {
    const projects = createDemoProjects();
    expect(projects).toHaveLength(4);
    expect(projects[0]!.name).toBe('两室两厅 · 样板 A');
    expect(isMultiFloor(projects[0]!)).toBe(false);
    expect(projects[3]!.name).toBe('复式跃层 · 样板 D');
    // Descending timestamps keep the gallery (and e2e "first project") stable.
    for (let index = 1; index < projects.length; index += 1) {
      expect(projects[index - 1]!.updatedAt > projects[index]!.updatedAt).toBe(true);
    }
  });

  it('builds a two-storey duplex with chained elevations and per-floor sheets', () => {
    const project = duplexDemo();
    expect(isMultiFloor(project)).toBe(true);
    expect(project.floors).toHaveLength(2);
    const [lower, upper] = project.floors as [Project['floors'][number], Project['floors'][number]];
    expect(lower.name).toBe('1F');
    expect(upper.name).toBe('2F');
    expect(lower.elevation).toBe(0);
    expect(upper.elevation).toBe(lower.height);
    expect(project.activeFloorId).toBe(lower.id);
    expect(project.level).toEqual({ name: '1F', height: lower.height });

    expect(project.sheets).toHaveLength(12);
    const lowerSheets = project.sheets.filter((sheet) => sheet.floorId === lower.id);
    const upperSheets = project.sheets.filter((sheet) => sheet.floorId === upper.id);
    expect(lowerSheets).toHaveLength(6);
    expect(upperSheets).toHaveLength(6);
    expect(new Set(project.sheets.map((sheet) => sheet.id)).size).toBe(12);
    expect(upperSheets[0]!.titleBlock.sheetNo).toBe('A-201');
  });

  it('keeps each storey independent and the flat projection on the active floor', () => {
    const project = duplexDemo();
    const [lower, upper] = project.floors as [Project['floors'][number], Project['floors'][number]];
    expect(lower.walls.length).toBeGreaterThan(5);
    expect(upper.walls.length).toBeGreaterThan(5);
    expect(lower.rooms.length).toBeGreaterThan(3);
    expect(upper.rooms.length).toBeGreaterThan(3);
    expect(lower.furniture.length).toBeGreaterThan(5);
    expect(upper.furniture.length).toBeGreaterThan(5);

    expect(project.walls.length).toBe(lower.walls.length);
    expect(project.rooms.length).toBe(lower.rooms.length);
    expect(lower.rooms.map((room) => room.id)).toContain('room-living-1f');
    expect(upper.rooms.map((room) => room.id)).toContain('room-master-2f');

    const upperScope = projectForFloor(project, upper.id);
    expect(upperScope.rooms.map((room) => room.id)).toContain('room-master-2f');
    expect(upperScope.rooms.map((room) => room.id)).not.toContain('room-living-1f');
    expect(upperScope.level).toEqual({ name: '2F', height: upper.height });
    expect(floorEntities(project, upper).rooms.map((room) => room.id)).toEqual(
      upper.rooms.map((room) => room.id),
    );
  });

  it('links editable stair and void markers across the two storeys', () => {
    const project = duplexDemo();
    const [lower, upper] = project.floors as [Project['floors'][number], Project['floors'][number]];
    expect(lower.stairwells.some((marker) => marker.kind === 'stair')).toBe(true);
    expect(upper.stairwells.some((marker) => marker.kind === 'stair')).toBe(true);
    expect(upper.stairwells.some((marker) => marker.kind === 'void')).toBe(true);
    expect(lower.stairwells.every((marker) => marker.linkedFloorId === upper.id)).toBe(true);
    expect(upper.stairwells.every((marker) => marker.linkedFloorId === lower.id)).toBe(true);
    expect(project.stairwells.length).toBe(lower.stairwells.length);
  });

  it('survives repeated floor synchronisation without duplicating entities', () => {
    const project = duplexDemo();
    const wallCount = project.floors[0]!.walls.length;
    const sheetCount = project.sheets.length;
    syncProjectFloors(project);
    syncProjectFloors(project);
    expect(project.floors[0]!.walls).toHaveLength(wallCount);
    expect(project.floors[1]!.walls).toHaveLength(7);
    expect(project.sheets).toHaveLength(sheetCount);
  });
});
