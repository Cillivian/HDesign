import type { BinaryImage, GrayImage, RasterImage } from './types';

/* ------------------------------------------------------------------ */
/* Construction / conversion                                          */
/* ------------------------------------------------------------------ */

export function createRaster(width: number, height: number): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneRaster(image: RasterImage): RasterImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

/** Rec. 709 luminance with alpha composited over white (scanned plans are light). */
export function toGrayscale(image: RasterImage): GrayImage {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3]! / 255;
    const luma = 0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!;
    out[index] = luma * alpha + 255 * (1 - alpha);
  }
  return { width, height, data: out };
}

export function grayToRaster(gray: GrayImage): RasterImage {
  const out = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let index = 0; index < gray.width * gray.height; index += 1) {
    const value = gray.data[index]!;
    out[index * 4] = value;
    out[index * 4 + 1] = value;
    out[index * 4 + 2] = value;
    out[index * 4 + 3] = 255;
  }
  return { width: gray.width, height: gray.height, data: out };
}

/* ------------------------------------------------------------------ */
/* Thresholding                                                       */
/* ------------------------------------------------------------------ */

/** Otsu's method over a grayscale histogram. Returns a threshold in 0..255. */
export function otsuThreshold(gray: GrayImage): number {
  const histogram = new Float64Array(256);
  const total = gray.width * gray.height;
  for (let index = 0; index < total; index += 1) histogram[gray.data[index]!] += 1;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * histogram[level]!;
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level += 1) {
    weightBackground += histogram[level]!;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += level * histogram[level]!;
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}

/**
 * Detects dark-background artwork (blueprints, night renders). Looks at a border ring:
 * when most of the frame edge is dark the image is treated as inverted.
 */
export function detectInverted(gray: GrayImage, threshold: number): boolean {
  const { width, height } = gray;
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  let dark = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    const inVerticalRing = y < ring || y >= height - ring;
    for (let x = 0; x < width; x += 1) {
      if (!inVerticalRing && x >= ring && x < width - ring) {
        x = width - ring - 1;
        continue;
      }
      count += 1;
      if (gray.data[y * width + x]! < threshold) dark += 1;
    }
  }
  return count > 0 && dark / count > 0.55;
}

/** Binarizes a grayscale image. Returns ink=1 mask. */
export function binarize(gray: GrayImage, threshold: number, inverted: boolean): BinaryImage {
  const total = gray.width * gray.height;
  const data = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const value = gray.data[index]!;
    // `<=` keeps the darker Otsu bin when a crisp two-tone scan makes Otsu return
    // the ink level itself (common for vector-exported plans).
    const isInk = inverted ? value > threshold : value <= threshold;
    data[index] = isInk ? 1 : 0;
  }
  return { width: gray.width, height: gray.height, data };
}

/* ------------------------------------------------------------------ */
/* Run-length helpers (wall thickness / length filters)               */
/* ------------------------------------------------------------------ */

/** For every ink pixel: length of the contiguous ink run through it along x. */
export function horizontalRuns(mask: BinaryImage): Int32Array {
  const { width, height, data } = mask;
  const runs = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let x = 0;
    while (x < width) {
      if (!data[row + x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < width && data[row + end]) end += 1;
      const length = end - x;
      for (let index = x; index < end; index += 1) runs[row + index] = length;
      x = end;
    }
  }
  return runs;
}

/** For every ink pixel: length of the contiguous ink run through it along y. */
export function verticalRuns(mask: BinaryImage): Int32Array {
  const { width, height, data } = mask;
  const runs = new Int32Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      if (!data[y * width + x]) {
        y += 1;
        continue;
      }
      let end = y;
      while (end < height && data[end * width + x]) end += 1;
      const length = end - y;
      for (let index = y; index < end; index += 1) runs[index * width + x] = length;
      y = end;
    }
  }
  return runs;
}

/* ------------------------------------------------------------------ */
/* Morphology / cleanup                                               */
/* ------------------------------------------------------------------ */

export function dilate(mask: BinaryImage, radius = 1): BinaryImage {
  if (radius <= 0) return mask;
  const { width, height, data } = mask;
  // Separable square dilation (two passes) keeps this O(n·r).
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let lastInk = -Infinity;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x]) lastInk = x;
      if (lastInk >= x - radius) horizontal[row + x] = 1;
    }
    let nextInk = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (data[row + x]) nextInk = x;
      if (nextInk <= x + radius) horizontal[row + x] = 1;
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let lastInk = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (horizontal[y * width + x]) lastInk = y;
      if (lastInk >= y - radius) out[y * width + x] = 1;
    }
    let nextInk = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (horizontal[y * width + x]) nextInk = y;
      if (nextInk <= y + radius) out[y * width + x] = 1;
    }
  }
  return { width, height, data: out };
}

export function erode(mask: BinaryImage, radius = 1): BinaryImage {
  if (radius <= 0) return mask;
  const inverted = new Uint8Array(mask.data.length);
  for (let index = 0; index < mask.data.length; index += 1) inverted[index] = mask.data[index] ? 0 : 1;
  const grown = dilate({ width: mask.width, height: mask.height, data: inverted }, radius);
  const out = new Uint8Array(mask.data.length);
  for (let index = 0; index < out.length; index += 1) out[index] = grown.data[index] ? 0 : 1;
  return { width: mask.width, height: mask.height, data: out };
}

/** Remove ink components smaller than minPixels. Cleans text glyphs and specks. */
export function removeSmallComponents(mask: BinaryImage, minPixels: number): BinaryImage {
  if (minPixels <= 1) return mask;
  const { width, height, data } = mask;
  const visited = new Uint8Array(width * height);
  const out = new Uint8Array(data);
  const stack: number[] = [];
  for (let start = 0; start < data.length; start += 1) {
    if (!data[start] || visited[start]) continue;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    const component: number[] = [];
    let touchesBorder = false;
    while (stack.length > 0) {
      const index = stack.pop()!;
      component.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (data[next] && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (component.length < minPixels && !touchesBorder) {
      for (const index of component) out[index] = 0;
    }
  }
  return { width, height, data: out };
}

/* ------------------------------------------------------------------ */
/* Connected components                                               */
/* ------------------------------------------------------------------ */

export interface ComponentStats {
  label: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ComponentLabeling {
  labels: Int32Array;
  stats: ComponentStats[];
}

/** 4- or 8-connected component labeling of foreground (1) pixels. Labels start at 1. */
export function labelComponents(mask: BinaryImage, connectivity: 4 | 8 = 8): ComponentLabeling {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const stats: ComponentStats[] = [{ label: 0, area: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 }];
  const stack: number[] = [];
  let nextLabel = 0;
  for (let start = 0; start < data.length; start += 1) {
    if (!data[start] || labels[start]) continue;
    nextLabel += 1;
    const stat: ComponentStats = {
      label: nextLabel,
      area: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
    };
    stats.push(stat);
    labels[start] = nextLabel;
    stack.length = 0;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      stat.area += 1;
      if (x < stat.minX) stat.minX = x;
      if (y < stat.minY) stat.minY = y;
      if (x > stat.maxX) stat.maxX = x;
      if (y > stat.maxY) stat.maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (connectivity === 4 && dx !== 0 && dy !== 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (data[next] && !labels[next]) {
            labels[next] = nextLabel;
            stack.push(next);
          }
        }
      }
    }
  }
  return { labels, stats };
}

/* ------------------------------------------------------------------ */
/* Rotation (deskew)                                                  */
/* ------------------------------------------------------------------ */

/**
 * Rotates a grayscale image by `deg` degrees around its center using bilinear sampling.
 * Positive angles rotate the image content counter-clockwise in screen coordinates
 * (y down), which cancels a clockwise skew reported by the estimator.
 */
export function rotateGray(image: GrayImage, deg: number): GrayImage {
  if (Math.abs(deg) < 0.05) return { ...image, data: new Uint8ClampedArray(image.data) };
  const { width, height } = image;
  const radians = (deg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    const dy = y - cy;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
        out[y * width + x] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const top = image.data[y0 * width + x0]! * (1 - fx) + image.data[y0 * width + x1]! * fx;
      const bottom = image.data[y1 * width + x0]! * (1 - fx) + image.data[y1 * width + x1]! * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { width, height, data: out };
}

/** Rotates an RGBA image by `deg` degrees with bilinear sampling; outside is white. */
export function rotateRaster(image: RasterImage, deg: number): RasterImage {
  if (Math.abs(deg) < 0.05) {
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  }
  const { width, height } = image;
  const radians = (deg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const dy = y - cy;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      const target = (y * width + x) * 4;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
        out[target] = 255;
        out[target + 1] = 255;
        out[target + 2] = 255;
        out[target + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let channel = 0; channel < 3; channel += 1) {
        const top =
          image.data[(y0 * width + x0) * 4 + channel]! * (1 - fx) +
          image.data[(y0 * width + x1) * 4 + channel]! * fx;
        const bottom =
          image.data[(y1 * width + x0) * 4 + channel]! * (1 - fx) +
          image.data[(y1 * width + x1) * 4 + channel]! * fx;
        out[target + channel] = top * (1 - fy) + bottom * fy;
      }
      out[target + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                       */
/* ------------------------------------------------------------------ */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! * (upper - position) + sorted[upper]! * (position - lower);
}

/** Median absolute deviation based outlier rejection. Keeps at least one value. */
export function rejectOutliers(values: number[], tolerance = 3): number[] {
  if (values.length < 3) return [...values];
  const center = median(values);
  const deviation = median(values.map((value) => Math.abs(value - center)));
  if (deviation < 1e-6) return [...values];
  const kept = values.filter((value) => Math.abs(value - center) <= tolerance * deviation);
  return kept.length > 0 ? kept : [...values];
}

export function downsampleGray(image: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return image;
  const width = Math.max(1, Math.floor(image.width / factor));
  const height = Math.max(1, Math.floor(image.height / factor));
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const sy = y * factor + dy;
        if (sy >= image.height) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const sx = x * factor + dx;
          if (sx >= image.width) break;
          sum += image.data[sy * image.width + sx]!;
          count += 1;
        }
      }
      out[y * width + x] = count > 0 ? sum / count : 255;
    }
  }
  return { width, height, data: out };
}

export function cropGray(image: GrayImage, x: number, y: number, w: number, h: number): GrayImage {
  const width = Math.max(1, Math.min(w, image.width - x));
  const height = Math.max(1, Math.min(h, image.height - y));
  const out = new Uint8ClampedArray(width * height);
  for (let row = 0; row < height; row += 1) {
    const source = (y + row) * image.width + x;
    out.set(image.data.subarray(source, source + width), row * width);
  }
  return { width, height, data: out };
}
