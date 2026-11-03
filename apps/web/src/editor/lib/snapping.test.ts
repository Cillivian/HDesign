import { describe, expect, it } from 'vitest';
import {
  bboxFromPoints,
  createEmptyProject,
  createFurnitureItem,
  createWall,
  type Project,
} from '@hdesign/domain';
import {
  collectSnapTargets,
  snapDragBounds,
  snapDrawingPoint,
  snapPoint,
  snapPointToAngle,
  snapToGrid,
  worldTolerance,
  type SnapContext,
} from './snapping';

function projectWithWall(): Project {
  const project = createEmptyProject('snap-test');
  project.walls = [createWall({ x: 0, y: 0 }, { x: 4000, y: 0 })];
  return project;
}

function context(doc: Project, overrides: Partial<SnapContext['settings']> = {}): SnapContext {
  return {
    doc,
    settings: { enabled: true, gridSize: 100, tolerance: 50, ...overrides },
  };
}

describe('snapPoint', () => {
  it('prefers a wall vertex inside tolerance', () => {
    const result = snapPoint({ x: 12, y: -8 }, context(projectWithWall()));
    expect(result.kind).toBe('vertex');
    expect(result.point).toEqual({ x: 0, y: 0 });
  });

  it('snaps to wall midpoints', () => {
    const result = snapPoint({ x: 1990, y: 12 }, context(projectWithWall()));
    expect(result.kind).toBe('midpoint');
    expect(result.point).toEqual({ x: 2000, y: 0 });
  });

  it('projects onto a wall when no vertex is nearby', () => {
    const result = snapPoint({ x: 1234, y: 20 }, context(projectWithWall()));
    expect(result.kind).toBe('wall');
    expect(result.point.x).toBeCloseTo(1234, 5);
    expect(result.point.y).toBeCloseTo(0, 5);
  });

  it('falls back to the grid far from geometry', () => {
    const result = snapPoint({ x: 12357, y: 8934 }, context(projectWithWall()));
    expect(result.kind).toBe('grid');
    expect(result.point).toEqual({ x: 12400, y: 8900 });
  });

  it('returns the raw point when snapping is disabled', () => {
    const point = { x: 1234.4, y: 567.8 };
    const result = snapPoint(point, context(projectWithWall(), { enabled: false }));
    expect(result.kind).toBeNull();
    expect(result.point).toEqual(point);
  });

  it('collects vertices, midpoints, furniture and mep targets', () => {
    const doc = projectWithWall();
    doc.furniture = [
      createFurnitureItem({ skuId: 'sofa-3', name: '三人沙发', x: 1000, y: 1000, w: 2000, d: 900 }),
    ];
    const targets = collectSnapTargets({
      doc,
      settings: { enabled: true, gridSize: 100, tolerance: 50 },
    });
    expect(targets.filter((target) => target.kind === 'vertex')).toHaveLength(2);
    expect(targets.filter((target) => target.kind === 'midpoint')).toHaveLength(1);
    expect(targets.some((target) => target.kind === 'furniture')).toBe(true);
  });

  it('ignores geometry on hidden layers', () => {
    const doc = projectWithWall();
    doc.walls[0]!.layerId = 'layer-hidden';
    doc.layers.push({
      id: 'layer-hidden',
      name: '隐藏',
      kind: 'custom',
      order: 10,
      visible: false,
      locked: false,
      opacity: 1,
    });
    const result = snapPoint(
      { x: 12, y: -8 },
      {
        doc,
        settings: { enabled: true, gridSize: 100, tolerance: 50 },
        visibleLayerIds: new Set(['layer-structure']),
      },
    );
    expect(result.kind).toBe('grid');
  });

  it('clamps grid snapping to the given step', () => {
    expect(snapToGrid({ x: 149, y: 151 }, 100)).toEqual({ x: 100, y: 200 });
    expect(snapToGrid({ x: 149, y: 151 }, 0)).toEqual({ x: 149, y: 151 });
  });
});

describe('angle snapping', () => {
  it('constrains a drawing direction to 15 degree steps', () => {
    const snapped = snapPointToAngle({ x: 0, y: 0 }, { x: 1000, y: 120 }, 15);
    expect(snapped.y).toBeCloseTo(0, 6);
    expect(snapped.x).toBeCloseTo(Math.hypot(1000, 120), 6);
  });

  it('keeps the segment length while rotating to the nearest step', () => {
    const origin = { x: 500, y: 500 };
    const point = { x: 1500, y: 1450 };
    const snapped = snapPointToAngle(origin, point, 45);
    expect(Math.hypot(snapped.x - origin.x, snapped.y - origin.y)).toBeCloseTo(
      Math.hypot(point.x - origin.x, point.y - origin.y),
      6,
    );
    expect(snapped.x - origin.x).toBeCloseTo(snapped.y - origin.y, 6);
  });

  it('snaps drawing endpoints to existing geometry before angle constraints', () => {
    const result = snapDrawingPoint(
      { x: 0, y: 0 },
      { x: 3996, y: 6 },
      context(projectWithWall(), { tolerance: 40 }),
      15,
    );
    expect(result.kind).toBe('vertex');
    expect(result.point).toEqual({ x: 4000, y: 0 });
  });

  it('falls back to the constrained direction when no geometry is near', () => {
    const result = snapDrawingPoint(
      { x: 0, y: 0 },
      { x: 1000, y: 120 },
      context(projectWithWall(), { tolerance: 30 }),
      15,
    );
    expect(result.point.y).toBeCloseTo(0, 6);
    expect(result.kind).not.toBe('vertex');
  });

  it('reports axis alignment guides from the chain origin', () => {
    const result = snapDrawingPoint(
      { x: 0, y: 0 },
      { x: 3000, y: 4 },
      context(projectWithWall(), { tolerance: 30 }),
      15,
    );
    expect(result.guides.length).toBeGreaterThan(0);
    expect(result.guides[0]!.orientation).toBe('horizontal');
  });
});

describe('snapDragBounds', () => {
  it('aligns a dragged box edge to a nearby edge', () => {
    const moving = bboxFromPoints([
      { x: 195, y: 0 },
      { x: 295, y: 100 },
    ]);
    const other = bboxFromPoints([
      { x: 300, y: 0 },
      { x: 400, y: 100 },
    ]);
    const result = snapDragBounds(moving, [other], { enabled: true, gridSize: 100, tolerance: 20 });
    expect(result.snappedX).toBe(true);
    expect(result.dx).toBeCloseTo(5, 5);
    expect(result.guides.some((guide) => guide.orientation === 'vertical')).toBe(true);
  });

  it('aligns centres vertically as well', () => {
    const moving = bboxFromPoints([
      { x: 0, y: 195 },
      { x: 100, y: 295 },
    ]);
    const other = bboxFromPoints([
      { x: 0, y: 300 },
      { x: 100, y: 400 },
    ]);
    const result = snapDragBounds(moving, [other], { enabled: true, gridSize: 100, tolerance: 20 });
    expect(result.snappedY).toBe(true);
    expect(result.dy).toBeCloseTo(5, 5);
  });

  it('does nothing when snapping is disabled or there are no neighbours', () => {
    const moving = bboxFromPoints([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(snapDragBounds(moving, [], { enabled: true, gridSize: 100, tolerance: 20 }).dx).toBe(0);
    expect(
      snapDragBounds(moving, [moving], { enabled: false, gridSize: 100, tolerance: 20 }).dx,
    ).toBe(0);
  });
});

describe('worldTolerance', () => {
  it('scales with zoom and clamps to sane world bounds', () => {
    expect(worldTolerance({ x: 0, y: 0, scale: 1 }, 10)).toBeCloseTo(10, 5);
    expect(worldTolerance({ x: 0, y: 0, scale: 100 }, 10)).toBeCloseTo(2, 5);
    expect(worldTolerance({ x: 0, y: 0, scale: 0.001 }, 10)).toBeCloseTo(400, 5);
  });
});
