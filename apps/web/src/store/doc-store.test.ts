import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, createWall } from '@hdesign/domain';
import { useDocStore } from './doc-store';

const store = () => useDocStore.getState();

describe('doc-store history', () => {
  beforeEach(() => {
    useDocStore.getState().loadProject(createEmptyProject('测试方案'));
  });

  it('pushes one history entry per commit and undoes it', () => {
    expect(store().past.length).toBe(0);
    store().addWall(createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }));
    expect(store().doc.walls.length).toBe(1);
    expect(store().past.length).toBe(1);
    store().undo();
    expect(store().doc.walls.length).toBe(0);
    store().redo();
    expect(store().doc.walls.length).toBe(1);
  });

  it('does not record a gesture that changes nothing', () => {
    store().beginGesture();
    store().endGesture();
    expect(store().past.length).toBe(0);
  });

  it('records one history entry for a whole drag gesture', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    store().addWall(wall);
    const historyAfterAdd = store().past.length;
    store().beginGesture();
    store().updateWall(wall.id, { a: { x: 100, y: 100 } });
    store().updateWall(wall.id, { a: { x: 200, y: 200 } });
    store().endGesture();
    expect(store().past.length).toBe(historyAfterAdd + 1);
    store().undo();
    expect(store().doc.walls[0]!.a).toEqual({ x: 0, y: 0 });
  });

  it('cancels a gesture back to the snapshot without history', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    store().addWall(wall);
    const historyAfterAdd = store().past.length;
    store().beginGesture();
    store().updateWall(wall.id, { a: { x: 500, y: 500 } });
    store().cancelGesture();
    expect(store().doc.walls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(store().past.length).toBe(historyAfterAdd);
  });

  it('caps history at 100 entries', () => {
    for (let index = 0; index < 120; index += 1) {
      store().updateProjectName(`方案 ${index}`);
    }
    expect(store().past.length).toBe(100);
  });
});
