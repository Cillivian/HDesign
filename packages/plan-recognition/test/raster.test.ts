import { describe, expect, it } from 'vitest';
import {
  binarize,
  detectInverted,
  horizontalRuns,
  otsuThreshold,
  removeSmallComponents,
  rotateGray,
  toGrayscale,
  verticalRuns,
} from '../src/index';

function solidRaster(width: number, height: number, value: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('raster primitives', () => {
  it('computes an Otsu threshold between two peaks', () => {
    const raster = solidRaster(40, 40, 245);
    for (let y = 10; y < 30; y += 1) {
      for (let x = 10; x < 30; x += 1) {
        const index = (y * 40 + x) * 4;
        raster.data[index] = 30;
        raster.data[index + 1] = 30;
        raster.data[index + 2] = 30;
      }
    }
    const gray = toGrayscale(raster);
    const threshold = otsuThreshold(gray);
    // Otsu may return the darker level itself for a crisp two-tone scan.
    expect(threshold).toBeGreaterThanOrEqual(30);
    expect(threshold).toBeLessThan(245);
    const ink = binarize(gray, threshold, false);
    let count = 0;
    for (const value of ink.data) count += value;
    expect(count).toBe(400);
  });

  it('detects dark backgrounds (blueprint style)', () => {
    const dark = solidRaster(60, 60, 20);
    const gray = toGrayscale(dark);
    expect(detectInverted(gray, 128)).toBe(true);
    const light = solidRaster(60, 60, 240);
    expect(detectInverted(toGrayscale(light), 128)).toBe(false);
  });

  it('removes small ink components but keeps large ones', () => {
    const mask = { width: 30, height: 30, data: new Uint8Array(30 * 30) };
    mask.data[5 * 30 + 5] = 1; // single speck
    for (let index = 10; index < 25; index += 1) mask.data[15 * 30 + index] = 1; // 15px line
    const cleaned = removeSmallComponents(mask, 5);
    expect(cleaned.data[5 * 30 + 5]).toBe(0);
    expect(cleaned.data[15 * 30 + 10]).toBe(1);
  });

  it('computes run lengths in both directions', () => {
    const mask = { width: 12, height: 12, data: new Uint8Array(144) };
    for (let x = 2; x < 10; x += 1) mask.data[4 * 12 + x] = 1;
    for (let y = 2; y < 9; y += 1) mask.data[y * 12 + 6] = 1;
    const horizontal = horizontalRuns(mask);
    const vertical = verticalRuns(mask);
    expect(horizontal[4 * 12 + 6]).toBe(8);
    expect(vertical[4 * 12 + 6]).toBe(7);
  });

  it('keeps a raster identical at 0 degrees', () => {
    const raster = solidRaster(10, 10, 200);
    const gray = toGrayscale(raster);
    const rotated = rotateGray(gray, 0);
    expect(Array.from(rotated.data)).toEqual(Array.from(gray.data));
  });
});
