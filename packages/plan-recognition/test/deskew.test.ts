import { describe, expect, it } from 'vitest';
import { buildPlanRaster, findPlan } from './helpers';
import { estimateSkewDeg, rotateGray, toGrayscale } from '../src/index';

function rotatedPlanRaster(deg: number) {
  const plan = { ...findPlan('plan-b'), rotationDeg: deg };
  return buildPlanRaster(plan);
}

describe('deskew', () => {
  it('estimates a clockwise skew within 0.4 degrees', () => {
    const raster = rotatedPlanRaster(2);
    const estimate = estimateSkewDeg(toGrayscale(raster), 5);
    expect(estimate).toBeGreaterThan(1.4);
    expect(estimate).toBeLessThan(2.6);
  });

  it('reports ~0 for an axis-aligned plan', () => {
    const raster = rotatedPlanRaster(0);
    expect(Math.abs(estimateSkewDeg(toGrayscale(raster), 5))).toBeLessThan(0.2);
  });

  it('rotateGray cancels the measured skew', () => {
    const raster = rotatedPlanRaster(1.8);
    const gray = toGrayscale(raster);
    const estimate = estimateSkewDeg(gray, 5);
    const corrected = rotateGray(gray, -estimate);
    expect(Math.abs(estimateSkewDeg(corrected, 3))).toBeLessThan(0.3);
  });
});
