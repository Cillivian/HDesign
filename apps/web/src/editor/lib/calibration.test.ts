import { describe, expect, it } from 'vitest';
import { computeCalibration, worldToReferencePixel } from './calibration';

describe('computeCalibration', () => {
  const reference = { mmPerPx: 10, offset: { x: 0, y: 0 } };

  it('derives mmPerPx from a known length', () => {
    // Two world points 1000 mm apart => 100 px at the old 10 mm/px scale.
    const result = computeCalibration({
      reference,
      a: { x: 0, y: 0 },
      b: { x: 1000, y: 0 },
      knownMm: 2000,
    });
    expect(result).not.toBeNull();
    expect(result!.pixelDistance).toBeCloseTo(100, 6);
    expect(result!.mmPerPx).toBeCloseTo(20, 6);
  });

  it('keeps the first clicked point anchored in pixel space', () => {
    const a = { x: 400, y: 300 };
    const b = { x: 1400, y: 300 };
    const result = computeCalibration({ reference, a, b, knownMm: 1500 })!;
    const pixel = worldToReferencePixel(a, result);
    const originalPixel = worldToReferencePixel(a, reference);
    expect(pixel.x).toBeCloseTo(originalPixel.x, 5);
    expect(pixel.y).toBeCloseTo(originalPixel.y, 5);
  });

  it('scales other points around the anchor', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    const result = computeCalibration({ reference, a, b, knownMm: 2000 })!;
    const pixel = worldToReferencePixel({ x: 1000, y: 0 }, theReference(result));
    expect(pixel.x).toBeCloseTo(50, 5);
  });

  it('rejects invalid input', () => {
    expect(
      computeCalibration({ reference, a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, knownMm: 0 }),
    ).toBeNull();
    expect(
      computeCalibration({ reference, a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, knownMm: 1000 }),
    ).toBeNull();
    expect(
      computeCalibration({
        reference: { mmPerPx: 0, offset: { x: 0, y: 0 } },
        a: { x: 0, y: 0 },
        b: { x: 1000, y: 0 },
        knownMm: 1000,
      }),
    ).toBeNull();
  });

  it('clamps absurd scales into a usable range', () => {
    const result = computeCalibration({
      reference,
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      knownMm: 1_000_000_000,
    });
    expect(result!.mmPerPx).toBeLessThanOrEqual(1000);
  });
});

function theReference(result: { mmPerPx: number; offset: { x: number; y: number } }) {
  return { mmPerPx: result.mmPerPx, offset: result.offset };
}
