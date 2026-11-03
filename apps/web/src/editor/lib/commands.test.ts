import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFurnitureItem,
  createOpening,
  createWall,
  detectRoomFaces,
  polygonArea,
  type Project,
} from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import {
  createRoomsFromFaces,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  toggleSelectionLock,
} from './commands';

function reset(project?: Project): void {
  useDocStore.getState().resetDoc(project ?? createEmptyProject('命令测试'));
  useUiStore.getState().clearSelection();
  useUiStore.getState().setTool('select');
}

function addSofa(x = 0, y = 0): string {
  const item = createFurnitureItem({ skuId: 'sofa-3', name: '三人沙发', x, y, w: 2000, d: 900 });
  useDocStore.getState().addFurniture(item);
  return item.id;
}

describe('gesture history batching', () => {
  it('collapses a continuous drag into a single undo step', () => {
    reset();
    const id = addSofa(100, 100);
    const startX = useDocStore.getState().doc.furniture[0]!.x;
    const pastBefore = useDocStore.getState().past.length;

    useDocStore.getState().beginGesture();
    for (let step = 1; step <= 6; step += 1) {
      useDocStore.getState().commit((draft) => {
        const item = draft.furniture.find((entry) => entry.id === id);
        if (item) item.x = startX + step * 20;
      });
    }
    useDocStore.getState().endGesture();

    expect(useDocStore.getState().past.length).toBe(pastBefore + 1);
    expect(useDocStore.getState().doc.furniture[0]!.x).toBe(startX + 120);

    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.furniture[0]!.x).toBe(startX);
  });

  it('cancelGesture restores the document without touching history', () => {
    reset();
    const id = addSofa(0, 0);
    const pastBefore = useDocStore.getState().past.length;
    useDocStore.getState().beginGesture();
    useDocStore.getState().commit((draft) => {
      const item = draft.furniture.find((entry) => entry.id === id);
      if (item) item.x = 9999;
    });
    useDocStore.getState().cancelGesture();
    expect(useDocStore.getState().doc.furniture[0]!.x).toBe(0);
    expect(useDocStore.getState().past.length).toBe(pastBefore);
  });
});

describe('discrete commands', () => {
  it('nudges the selection as one history step', () => {
    reset();
    const id = addSofa(0, 0);
    useUiStore.getState().setSelection('furniture', [id]);
    const pastBefore = useDocStore.getState().past.length;

    nudgeSelection(10, 0);
    expect(useDocStore.getState().doc.furniture[0]!.x).toBe(10);
    expect(useDocStore.getState().past.length).toBe(pastBefore + 1);

    nudgeSelection(0, 100);
    useDocStore.getState().undo();
    expect(useDocStore.getState().doc.furniture[0]!.y).toBe(0);
  });

  it('nudges openings along their host wall', () => {
    reset();
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const opening = createOpening(wall, 'door', 1000, 900);
    useDocStore.getState().addWall(wall);
    useDocStore.getState().addOpening(opening);
    useUiStore.getState().setSelection('opening', [opening.id]);

    nudgeSelection(300, 0);
    expect(useDocStore.getState().doc.openings[0]!.offset).toBe(1300);
    nudgeSelection(0, 500);
    expect(useDocStore.getState().doc.openings[0]!.offset).toBe(1300);
  });

  it('deletes a wall together with its openings', () => {
    reset();
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const opening = createOpening(wall, 'door', 1000, 900);
    useDocStore.getState().addWall(wall);
    useDocStore.getState().addOpening(opening);
    useUiStore.getState().setSelection('wall', [wall.id]);

    const result = deleteSelection();
    expect(result.affected).toBe(1);
    expect(useDocStore.getState().doc.walls).toHaveLength(0);
    expect(useDocStore.getState().doc.openings).toHaveLength(0);
    expect(useUiStore.getState().selection.kind).toBe('none');
  });

  it('refuses to delete geometry on a locked layer', () => {
    reset();
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    useDocStore.getState().addWall(wall);
    useDocStore.getState().updateLayer('layer-structure', { locked: true });
    useUiStore.getState().setSelection('wall', [wall.id]);

    const result = deleteSelection();
    expect(result.blocked).toBe(1);
    expect(result.message).toContain('已锁定');
    expect(useDocStore.getState().doc.walls).toHaveLength(1);
  });

  it('duplicates furniture with new ids and selects the copies', () => {
    reset();
    const id = addSofa(0, 0);
    useUiStore.getState().setSelection('furniture', [id]);

    duplicateSelection(200);
    const furniture = useDocStore.getState().doc.furniture;
    expect(furniture).toHaveLength(2);
    expect(furniture[1]!.id).not.toBe(id);
    expect(furniture[1]!.x).toBe(200);
    expect(useUiStore.getState().selection.kind).toBe('furniture');
    expect(useUiStore.getState().selection.ids).toEqual([furniture[1]!.id]);
  });

  it('duplicates walls and remaps their openings', () => {
    reset();
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    useDocStore.getState().addWall(wall);
    const opening = createOpening(wall, 'door', 1000, 900);
    useDocStore.getState().addOpening(opening);
    useUiStore.getState().setSelection('wall', [wall.id]);

    duplicateSelection(500);
    const doc = useDocStore.getState().doc;
    expect(doc.walls).toHaveLength(2);
    expect(doc.openings).toHaveLength(2);
    const copiedOpening = doc.openings[1]!;
    expect(copiedOpening.wallId).toBe(doc.walls[1]!.id);
  });

  it('toggles furniture item locks', () => {
    reset();
    const id = addSofa();
    useUiStore.getState().setSelection('furniture', [id]);
    expect(toggleSelectionLock().locked).toBe(true);
    expect(useDocStore.getState().doc.furniture[0]!.locked).toBe(true);
    expect(toggleSelectionLock().locked).toBe(false);
    expect(useDocStore.getState().doc.furniture[0]!.locked).toBe(false);
  });
});

describe('createRoomsFromFaces', () => {
  function squareProject(): Project {
    const project = createEmptyProject('房间测试');
    project.walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ];
    return project;
  }

  it('creates a room from a detected closed face', () => {
    reset(squareProject());
    const faces = detectRoomFaces(useDocStore.getState().doc.walls);
    const result = createRoomsFromFaces(faces);
    expect(result.created).toBe(1);
    const rooms = useDocStore.getState().doc.rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.polygon).toHaveLength(4);
    expect(rooms[0]!.meta?.source).toBe('auto');
  });

  it('is idempotent', () => {
    reset(squareProject());
    const faces = detectRoomFaces(useDocStore.getState().doc.walls);
    createRoomsFromFaces(faces);
    const second = createRoomsFromFaces(faces);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(1);
    expect(useDocStore.getState().doc.rooms).toHaveLength(1);
  });

  it('splits an existing room when new walls partition it', () => {
    reset(squareProject());
    const first = createRoomsFromFaces(detectRoomFaces(useDocStore.getState().doc.walls));
    expect(first.created).toBe(1);

    const partition = createWall({ x: 2000, y: 0 }, { x: 2000, y: 3000 });
    useDocStore.getState().addWall(partition);
    const result = createRoomsFromFaces(detectRoomFaces(useDocStore.getState().doc.walls));
    expect(result.updated).toBe(1);
    expect(result.created).toBe(1);

    const rooms = useDocStore.getState().doc.rooms;
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((room) => Math.round(polygonArea(room.polygon) / 1_000_000));
    expect(areas.sort()).toEqual([6, 6]);
  });

  it('reports zero when the walls enclose nothing', () => {
    reset();
    expect(createRoomsFromFaces([])).toEqual({ created: 0, updated: 0, skipped: 0 });
  });
});
