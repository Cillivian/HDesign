import { beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFloor,
  createStairwell,
  createWall,
  type Floor,
} from '@hdesign/domain';
import { useDocStore } from './doc-store';

const store = () => useDocStore.getState();

describe('doc-store multi-storey floors', () => {
  beforeEach(() => {
    useDocStore.getState().loadProject(createEmptyProject());
  });

  it('addFloor stacks a new storey above the previous one and gives it its own sheets', () => {
    const firstId = store().doc.activeFloorId;
    const sheetsBefore = store().doc.sheets.length;
    store().addFloor({ name: '2F', height: 3200 });
    const doc = store().doc;
    expect(doc.floors).toHaveLength(2);
    expect(doc.floors[1]!.name).toBe('2F');
    expect(doc.floors[1]!.elevation).toBe(2800);
    expect(doc.floors[1]!.height).toBe(3200);
    expect(doc.activeFloorId).toBe(doc.floors[1]!.id);
    expect(doc.level).toEqual({ name: '2F', height: 3200 });
    expect(doc.sheets).toHaveLength(sheetsBefore + 6);
    expect(doc.sheets.filter((sheet) => sheet.floorId === doc.floors[1]!.id)).toHaveLength(6);
    expect(doc.floors[0]!.id).toBe(firstId);
  });

  it('keeps entities per storey when switching the active floor', () => {
    const firstId = store().doc.activeFloorId;
    const downstairs = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    store().addWall(downstairs);
    store().addFloor();
    const secondId = store().doc.activeFloorId;

    // A fresh storey starts empty.
    expect(store().doc.walls).toHaveLength(0);
    const upstairs = createWall({ x: 0, y: 0 }, { x: 2500, y: 0 });
    store().addWall(upstairs);
    expect(store().doc.walls.map((wall) => wall.id)).toEqual([upstairs.id]);

    store().switchFloor(firstId);
    expect(store().doc.walls.map((wall) => wall.id)).toEqual([downstairs.id]);
    expect(store().doc.floors.find((floor) => floor.id === secondId)!.walls).toHaveLength(1);
    store().switchFloor(secondId);
    expect(store().doc.walls.map((wall) => wall.id)).toEqual([upstairs.id]);
  });

  it('recalculates downstream elevations when a storey height changes', () => {
    store().addFloor({ height: 3000 });
    store().addFloor({ height: 2600 });
    expect(store().doc.floors.map((floor) => floor.elevation)).toEqual([0, 2800, 5800]);
    store().setFloorHeight(store().doc.floors[0]!.id, 3200);
    expect(store().doc.floors.map((floor) => floor.elevation)).toEqual([0, 3200, 6200]);
    expect(store().doc.level.height).toBe(2600); // active floor is the third storey
  });

  it('removes a storey together with its sheets and switches to a neighbour', () => {
    store().addFloor();
    const firstId = store().doc.floors[0]!.id;
    const secondId = store().doc.floors[1]!.id;
    expect(store().removeFloor(secondId)).toBe(true);
    expect(store().doc.floors).toHaveLength(1);
    expect(store().doc.activeFloorId).toBe(firstId);
    expect(store().doc.sheets.some((sheet) => sheet.floorId === secondId)).toBe(false);
    expect(store().removeFloor(firstId)).toBe(false);
    expect(store().doc.floors).toHaveLength(1);
  });

  it('replaceFloors rebuilds the stack in one undoable commit', () => {
    const initialSheets = store().doc.sheets.length;
    const historyBefore = store().past.length;
    const incoming: Floor[] = [
      createFloor({ name: '1F', walls: [createWall({ x: 0, y: 0 }, { x: 3000, y: 0 })] }),
      createFloor({ name: '2F', walls: [createWall({ x: 0, y: 0 }, { x: 5000, y: 0 })] }),
    ];
    store().replaceFloors(incoming, { mode: 'replace', projectNameHint: '复式图纸.hdz' });
    const doc = store().doc;
    expect(doc.floors).toHaveLength(2);
    expect(doc.floors.map((floor) => floor.elevation)).toEqual([0, 2800]);
    expect(doc.activeFloorId).toBe(doc.floors[0]!.id);
    expect(doc.walls).toHaveLength(1);
    expect(doc.walls[0]!.b.x).toBe(3000);
    expect(doc.sheets).toHaveLength(12);
    expect(doc.sheets.every((sheet) => sheet.floorId)).toBe(true);
    expect(doc.name).toBe('复式图纸.hdz');
    expect(store().past.length).toBe(historyBefore + 1);
    expect(initialSheets).toBe(6);
    store().undo();
    expect(store().doc.floors).toHaveLength(1);
  });

  it('append mode keeps existing storeys and de-duplicates floor names', () => {
    const firstId = store().doc.floors[0]!.id;
    store().replaceFloors([createFloor({ name: '1F' })], { mode: 'append' });
    expect(store().doc.floors).toHaveLength(2);
    expect(store().doc.floors[0]!.id).toBe(firstId);
    expect(store().doc.floors[1]!.name).toBe('2F');
  });

  it('persists stair / void markers into the active storey snapshot', () => {
    const marker = createStairwell({
      kind: 'void',
      a: { x: 1000, y: 1000 },
      b: { x: 3000, y: 3000 },
      label: '挑空',
    });
    store().addStairwell(marker);
    expect(store().doc.stairwells).toHaveLength(1);
    expect(store().doc.floors[0]!.stairwells).toHaveLength(1);
    store().updateStairwell(marker.id, { label: '中庭挑空' });
    expect(store().doc.floors[0]!.stairwells[0]!.label).toBe('中庭挑空');
    store().removeStairwell(marker.id);
    expect(store().doc.floors[0]!.stairwells).toHaveLength(0);
  });
});
