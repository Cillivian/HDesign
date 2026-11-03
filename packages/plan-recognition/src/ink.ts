import type { BinaryImage, GrayImage } from './types';

/**
 * Local-mean adaptive threshold. Compensates for uneven scan lighting.
 * Uses an integral image so cost is O(width*height) regardless of window size.
 */
export function adaptiveThreshold(gray: GrayImage, inverted: boolean): BinaryImage {
  const { width, height, data } = gray;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += data[y * width + x]!;
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)]! + rowSum;
    }
  }
  const window = Math.max(7, Math.round(Math.min(width, height) * 0.03) | 1);
  const radius = Math.floor(window / 2);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)]! -
        integral[y0 * (width + 1) + (x1 + 1)]! -
        integral[(y1 + 1) * (width + 1) + x0]! +
        integral[y0 * (width + 1) + x0]!;
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const mean = sum / count;
      const value = data[y * width + x]!;
      const isInk = inverted ? value > mean + 6 : value < mean - 6;
      out[y * width + x] = isInk ? 1 : 0;
    }
  }
  return { width, height, data: out };
}

/** True when the ink stroke through a pixel is thin in at least one direction (<= 3 px). */
export function isThinPixel(mask: BinaryImage, index: number): boolean {
  const { width, height, data } = mask;
  const x = index % width;
  const y = (index - x) / width;
  let horizontal = 1;
  for (let step = 1; step < 8 && x - step >= 0 && data[index - step]; step += 1) horizontal += 1;
  for (let step = 1; step < 8 && x + step < width && data[index + step]; step += 1) horizontal += 1;
  let vertical = 1;
  for (let step = 1; step < 8 && y - step >= 0 && data[index - step * width]; step += 1) vertical += 1;
  for (let step = 1; step < 8 && y + step < height && data[index + step * width]; step += 1) vertical += 1;
  return Math.min(horizontal, vertical) <= 3;
}
