import { clamp, distance, type Point, type Reference } from '@hdesign/domain';

/**
 * Underlay calibration maths.
 *
 * A reference image is drawn at offset with `mmPerPx` millimetres per source
 * pixel. The user clicks two points whose true distance is known; the new scale
 * is derived from the pixel distance between the clicks, and the offset is
 * adjusted so the first clicked point stays anchored under the cursor.
 */

export interface CalibrationInput {
  reference: Pick<Reference, 'mmPerPx' | 'offset'>;
  a: Point;
  b: Point;
  knownMm: number;
}

export interface CalibrationResult {
  mmPerPx: number;
  offset: Point;
  /** Pixel distance between the two clicked points at the old scale. */
  pixelDistance: number;
  /** World distance between the clicked points. */
  worldDistance: number;
}

export const MIN_MM_PER_PX = 0.05;
export const MAX_MM_PER_PX = 1000;

export function computeCalibration(input: CalibrationInput): CalibrationResult | null {
  const { reference, a, b, knownMm } = input;
  if (!Number.isFinite(knownMm) || knownMm <= 0) return null;
  if (!Number.isFinite(reference.mmPerPx) || reference.mmPerPx <= 0) return null;
  const worldDistance = distance(a, b);
  if (worldDistance < 1) return null;
  const pixelDistance = worldDistance / reference.mmPerPx;
  if (pixelDistance < 0.5) return null;
  const mmPerPx = clamp(knownMm / pixelDistance, MIN_MM_PER_PX, MAX_MM_PER_PX);
  const ratio = mmPerPx / reference.mmPerPx;
  const offset = {
    x: a.x - ratio * (a.x - reference.offset.x),
    y: a.y - ratio * (a.y - reference.offset.y),
  };
  return { mmPerPx, offset, pixelDistance, worldDistance };
}

/** World-to-source-pixel mapping for a calibrated reference (used by tests/tools). */
export function worldToReferencePixel(
  point: Point,
  reference: Pick<Reference, 'mmPerPx' | 'offset'>,
): Point {
  return {
    x: (point.x - reference.offset.x) / reference.mmPerPx,
    y: (point.y - reference.offset.y) / reference.mmPerPx,
  };
}
