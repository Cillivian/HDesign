import { describe, expect, it } from 'vitest';
import { createRoom, pointInPolygon, polygonAreaSqm } from '@hdesign/domain';
import {
  floorMaterialKind,
  roomCeilingHeightM,
  roomFloorOutline,
  roomLabelText,
  roomLabelWorld,
} from './floor-geometry';

const rectRoom = () =>
  createRoom(
    [
      { x: 1000, y: 2000 },
      { x: 5000, y: 2000 },
      { x: 5000, y: 5000 },
      { x: 1000, y: 5000 },
    ],
    { id: 'room-a', name: '客厅', type: 'living' },
  );

const lShapeRoom = () =>
  createRoom(
    [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 3000 },
      { x: 3000, y: 3000 },
      { x: 3000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    { id: 'room-l', name: 'LDK', type: 'living' },
  );

describe('roomFloorOutline', () => {
  it('maps plan mm onto Shape space (x scaled, y negated)', () => {
    const outline = roomFloorOutline(rectRoom());
    expect(outline.points).toHaveLength(4);
    expect(outline.points[0]).toEqual({ x: 1, y: -2 });
    expect(outline.points[2]).toEqual({ x: 5, y: -5 });
  });

  it('keeps the polygon area consistent with the domain helper', () => {
    const room = rectRoom();
    expect(roomFloorOutline(room).areaSqm).toBeCloseTo(polygonAreaSqm(room.polygon), 6);
    expect(roomFloorOutline(room).areaSqm).toBeCloseTo(12, 6);
  });

  it('places the label anchor inside concave rooms', () => {
    const room = lShapeRoom();
    const outline = roomFloorOutline(room);
    expect(pointInPolygon(outline.label, room.polygon)).toBe(true);
    const world = roomLabelWorld(room);
    expect(world[0]).toBeCloseTo(outline.label.x * 0.001, 6);
    expect(world[2]).toBeCloseTo(outline.label.y * 0.001, 6);
    expect(world[1]).toBeGreaterThan(0);
  });

  it('formats name + area text and reads ceiling height in metres', () => {
    const room = createRoom(
      [
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
        { x: 3000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      { name: '主卧', ceiling: { type: 'flat', height: 2700 } },
    );
    const text = roomLabelText(room);
    expect(text.title).toBe('主卧');
    expect(text.subtitle).toBe('9.0 ㎡');
    expect(roomCeilingHeightM(room)).toBeCloseTo(2.7, 6);
  });
});

describe('floorMaterialKind', () => {
  it('classifies catalog floor ids into texture families', () => {
    expect(floorMaterialKind('floor-oak')).toBe('wood');
    expect(floorMaterialKind('floor-oak-walnut')).toBe('wood');
    expect(floorMaterialKind('floor-tile-600')).toBe('tile');
    expect(floorMaterialKind('floor-tile-anti-slip')).toBe('tile');
    expect(floorMaterialKind('floor-marble-white')).toBe('stone');
    expect(floorMaterialKind('floor-carpet-grey')).toBe('carpet');
    expect(floorMaterialKind('unknown')).toBe('plain');
  });
});
