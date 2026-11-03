import { describe, expect, it } from 'vitest';
import { estimateScaleFromDimensions, parseDimensionText } from '../src/index';

describe('dimension text parsing', () => {
  it('parses millimetre annotations', () => {
    expect(parseDimensionText('3600').items[0]?.valueMm).toBe(3600);
    expect(parseDimensionText('3600mm').items[0]?.valueMm).toBe(3600);
    expect(parseDimensionText('3600 MM').items[0]?.valueMm).toBe(3600);
  });

  it('parses metre annotations', () => {
    expect(parseDimensionText('3.6m').items[0]?.valueMm).toBe(3600);
    expect(parseDimensionText('3.6').items[0]?.valueMm).toBe(3600);
    expect(parseDimensionText('0.9m').items[0]?.valueMm).toBe(900);
  });

  it('parses width x height pairs', () => {
    const parsed = parseDimensionText('3600x2800').items[0]!;
    expect(parsed.kind).toBe('pair');
    expect(parsed.valuesMm).toEqual([3600, 2800]);
  });

  it('parses dimension chains as a sum', () => {
    const parsed = parseDimensionText('3600+1800+900').items[0]!;
    expect(parsed.kind).toBe('chain');
    expect(parsed.valueMm).toBe(6300);
  });

  it('normalises full-width characters', () => {
    expect(parseDimensionText('３６００').items[0]?.valueMm).toBe(3600);
    expect(parseDimensionText('3600×2800').items[0]?.kind).toBe('pair');
  });

  it('ignores room names', () => {
    expect(parseDimensionText('客厅').items).toHaveLength(0);
    expect(parseDimensionText('LIVING').items).toHaveLength(0);
  });
});

describe('scale estimation', () => {
  const walls = [
    { a: { x: 76, y: 76 }, b: { x: 1116, y: 76 }, thicknessPx: 24, confidence: 0.9, parts: 1 },
    { a: { x: 76, y: 76 }, b: { x: 76, y: 936 }, thicknessPx: 24, confidence: 0.9, parts: 1 },
  ];

  it('derives mmPerPx from dimension tokens next to walls', () => {
    const tokens = [
      { text: '10400', x: 596, y: 60, confidence: 0.9 },
      { text: '8600', x: 60, y: 506, confidence: 0.9 },
      { text: '10400', x: 596, y: 950, confidence: 0.9 },
      { text: '8600', x: 1130, y: 506, confidence: 0.9 },
    ];
    const scale = estimateScaleFromDimensions(walls, tokens, 1192, 1012);
    expect(scale.source).toBe('ocr');
    expect(scale.mmPerPx).toBeCloseTo(10, 1);
    expect(scale.confidence).toBeGreaterThan(0.6);
    expect(scale.samples.length).toBeGreaterThanOrEqual(2);
  });

  it('honours a known calibration', () => {
    const scale = estimateScaleFromDimensions(walls, [], 1192, 1012, {
      known: { mmPerPx: 12.5, source: 'calibration' },
    });
    expect(scale).toMatchObject({ mmPerPx: 12.5, source: 'calibration', confidence: 1 });
  });

  it('falls back to the assumed scale without evidence', () => {
    const scale = estimateScaleFromDimensions(walls, [], 1192, 1012, { assumedMmPerPx: 8 });
    expect(scale.source).toBe('assumed');
    expect(scale.mmPerPx).toBe(8);
  });
});
