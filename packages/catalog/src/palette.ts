import type { MaterialScope, StylePreset, StyleTokens } from './types';
import { MATERIALS } from './materials';
import { getStylePreset } from './styles';

/**
 * Local palette extraction + custom style construction.
 * Pure TypeScript, no DOM and no AI: the panel reads image pixels once and hands
 * the RGBA buffer to `extractPalette`.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  hex: string;
  rgb: Rgb;
  /** Share of sampled pixels covered by this cluster (0..1). */
  ratio: number;
}

export interface ExtractPaletteOptions {
  /** Number of clusters (default 6, clamped 3..10). */
  k?: number;
  /** Sample every Nth pixel (default 7). */
  sampleStep?: number;
  /** Hard cap on samples (default 6000). */
  maxSamples?: number;
  /** Alpha threshold; more transparent pixels are skipped (default 128). */
  alphaThreshold?: number;
}

export interface CustomStyleOptions {
  baseId?: string;
  materials?: Partial<Record<MaterialScope, string>>;
  lighting?: { temperature: number; intensity: number };
  moodKeywords?: string[];
  description?: string;
}

/* ------------------------------------------------------------------ */
/* Colour utilities                                                   */
/* ------------------------------------------------------------------ */

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function hexToRgb(hex: string): Rgb {
  let value = hex.trim().replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  if (!Number.isFinite(int)) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex(rgb: Rgb): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const hex = (value: number) => clamp(value).toString(16).padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`.toUpperCase();
}

/** Relative luminance 0..1 (sRGB, used for ordering). */
export function luminance(rgb: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function saturation(rgb: Rgb): number {
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  const delta = max - min;
  if (delta === 0) return 0;
  const lightness = (max + min) / 2;
  return delta / (1 - Math.abs(2 * lightness - 1));
}

/** Hue in degrees 0..360. */
export function hue(rgb: Rgb): number {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const ratio = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * ratio,
    g: ca.g + (cb.g - ca.g) * ratio,
    b: ca.b + (cb.b - ca.b) * ratio,
  });
}

export function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#FFFFFF', amount);
}

export function darken(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function perceiveLuminance(hex: string): number {
  return luminance(hexToRgb(hex));
}

/* ------------------------------------------------------------------ */
/* K-means palette extraction                                         */
/* ------------------------------------------------------------------ */

interface Cluster {
  rgb: Rgb;
  count: number;
}

/**
 * Deterministic k-means over an RGBA pixel buffer.
 * Centroids are initialised from luminance quantiles of the sampled pixels, so
 * the same image always yields the same palette.
 */
export function extractPalette(
  pixels: ArrayLike<number>,
  options: ExtractPaletteOptions = {},
): PaletteColor[] {
  const k = Math.max(3, Math.min(10, Math.round(options.k ?? 6)));
  const sampleStep = Math.max(1, Math.round(options.sampleStep ?? 7));
  const maxSamples = Math.max(64, Math.round(options.maxSamples ?? 6000));
  const alphaThreshold = options.alphaThreshold ?? 128;

  const samples: Rgb[] = [];
  const pixelCount = Math.floor(pixels.length / 4);
  for (let index = 0; index < pixelCount; index += sampleStep) {
    const offset = index * 4;
    const alpha = pixels[offset + 3] ?? 255;
    if (alpha < alphaThreshold) continue;
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    samples.push({ r, g, b });
    if (samples.length >= maxSamples) break;
  }

  if (samples.length === 0) {
    return [
      { hex: '#F2EFE8', rgb: hexToRgb('#F2EFE8'), ratio: 1 },
      { hex: '#C9B79B', rgb: hexToRgb('#C9B79B'), ratio: 0 },
      { hex: '#5B635C', rgb: hexToRgb('#5B635C'), ratio: 0 },
    ];
  }

  const ordered = [...samples].sort((a, b) => luminance(a) - luminance(b));
  const clusters: Cluster[] = [];
  for (let index = 0; index < k; index += 1) {
    const position = Math.min(
      ordered.length - 1,
      Math.floor(((index + 0.5) / k) * ordered.length),
    );
    const seed = ordered[position] ?? ordered[0]!;
    clusters.push({ rgb: { ...seed }, count: 0 });
  }

  const assignments = new Array<number>(samples.length).fill(0);
  for (let iteration = 0; iteration < 14; iteration += 1) {
    let moved = false;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]!;
      let best = 0;
      let bestDistance = Infinity;
      for (let cluster = 0; cluster < clusters.length; cluster += 1) {
        const distance = colorDistance(sample, clusters[cluster]!.rgb);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = cluster;
        }
      }
      if (assignments[index] !== best) {
        assignments[index] = best;
        moved = true;
      }
    }
    const sums = clusters.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]!;
      const target = sums[assignments[index]!]!;
      target.r += sample.r;
      target.g += sample.g;
      target.b += sample.b;
      target.count += 1;
    }
    for (let cluster = 0; cluster < clusters.length; cluster += 1) {
      const sum = sums[cluster]!;
      if (sum.count > 0) {
        clusters[cluster]!.rgb = {
          r: sum.r / sum.count,
          g: sum.g / sum.count,
          b: sum.b / sum.count,
        };
      }
      clusters[cluster]!.count = sum.count;
    }
    if (!moved) break;
  }

  const total = samples.length;
  const palette = clusters
    .filter((cluster) => cluster.count > 0)
    .map((cluster) => ({
      hex: rgbToHex(cluster.rgb),
      rgb: {
        r: Math.round(cluster.rgb.r),
        g: Math.round(cluster.rgb.g),
        b: Math.round(cluster.rgb.b),
      },
      ratio: cluster.count / total,
    }))
    .sort((a, b) => b.ratio - a.ratio || perceiveLuminance(a.hex) - perceiveLuminance(b.hex));

  // Merge near-identical clusters so the palette stays legible.
  const merged: PaletteColor[] = [];
  for (const color of palette) {
    const twin = merged.find((existing) => colorDistance(existing.rgb, color.rgb) < 14);
    if (twin) {
      const weight = twin.ratio + color.ratio;
      twin.ratio = weight;
      twin.rgb = {
        r: Math.round((twin.rgb.r * (twin.ratio - color.ratio) + color.rgb.r * color.ratio) / weight),
        g: Math.round((twin.rgb.g * (twin.ratio - color.ratio) + color.rgb.g * color.ratio) / weight),
        b: Math.round((twin.rgb.b * (twin.ratio - color.ratio) + color.rgb.b * color.ratio) / weight),
      };
      twin.hex = rgbToHex(twin.rgb);
    } else {
      merged.push({ ...color, rgb: { ...color.rgb } });
    }
  }
  return merged.slice(0, k).sort((a, b) => b.ratio - a.ratio);
}

/* ------------------------------------------------------------------ */
/* Palette -> style tokens                                            */
/* ------------------------------------------------------------------ */

function pick(
  candidates: PaletteColor[],
  predicate: (color: PaletteColor) => boolean,
): PaletteColor | undefined {
  return candidates.find(predicate);
}

function mostSaturated(colors: PaletteColor[]): PaletteColor | undefined {
  return [...colors].sort((a, b) => saturation(b.rgb) - saturation(a.rgb))[0];
}

function neutral(colors: PaletteColor[]): PaletteColor | undefined {
  return [...colors].sort((a, b) => saturation(a.rgb) - saturation(b.rgb))[0];
}

/**
 * Maps an extracted palette to the 10 style tokens using hue/luminance heuristics:
 * lightest -> ceiling/wall, warm mid -> floor/joinery, dark neutral -> metal,
 * green -> plant. Always returns valid hex values.
 */
export function styleTokensFromPalette(palette: PaletteColor[]): StyleTokens {
  const colors = palette.filter((color) => color.ratio >= 0 && isHexColor(color.hex));
  const safe = colors.length > 0 ? colors : [{ hex: '#F2EFE8', rgb: hexToRgb('#F2EFE8'), ratio: 1 }];
  const byLight = [...safe].sort((a, b) => perceiveLuminance(a.hex) - perceiveLuminance(b.hex));
  const darkest = byLight[0]!;
  const lightest = byLight[byLight.length - 1]!;
  const secondLight = byLight[Math.max(0, byLight.length - 2)]!;
  const mid = byLight[Math.floor(byLight.length / 2)]!;

  const warm = safe.filter((color) => {
    const h = hue(color.rgb);
    return h >= 15 && h <= 60 && saturation(color.rgb) > 0.1;
  });
  const warmMid = pick(warm, (color) => {
    const l = perceiveLuminance(color.hex);
    return l > 0.18 && l < 0.75;
  });
  const greens = safe.filter((color) => {
    const h = hue(color.rgb);
    return h >= 65 && h <= 175 && saturation(color.rgb) > 0.12;
  });
  const green = mostSaturated(greens);
  const saturated = mostSaturated(safe);

  const wall = perceiveLuminance(lightest.hex) > 0.86 ? lightest.hex : lighten(secondLight.hex, 0.45);
  const ceiling = lighten(wall, 0.55);
  const floor = (warmMid ?? mid).hex;
  const joinery = warmMid ? darken(warmMid.hex, 0.12) : lighten(floor, 0.2);
  const metal = saturation(darkest.rgb) < 0.2 ? darkest.hex : darken(neutral(safe)?.hex ?? darkest.hex, 0.25);
  const fabric = (saturated ?? mid).hex;
  const leather = darken(warmMid?.hex ?? floor, 0.18);
  const stone = saturation(secondLight.rgb) < 0.18 ? secondLight.hex : mixHex(secondLight.hex, '#FFFFFF', 0.4);
  const plant = green?.hex ?? mixHex('#5F7A55', wall, 0.15);

  return {
    wall: rgbToHex(hexToRgb(wall)),
    wallAccent: rgbToHex(hexToRgb(mid.hex)),
    ceiling: rgbToHex(hexToRgb(ceiling)),
    floor: rgbToHex(hexToRgb(floor)),
    joinery: rgbToHex(hexToRgb(joinery)),
    metal: rgbToHex(hexToRgb(metal)),
    fabric: rgbToHex(hexToRgb(fabric)),
    leather: rgbToHex(hexToRgb(leather)),
    stone: rgbToHex(hexToRgb(stone)),
    plant: rgbToHex(hexToRgb(plant)),
  };
}

/* ------------------------------------------------------------------ */
/* Custom style                                                       */
/* ------------------------------------------------------------------ */

function closestMaterial(scope: MaterialScope, hex: string): string | undefined {
  const target = hexToRgb(hex);
  let best: { id: string; distance: number } | undefined;
  for (const material of MATERIALS) {
    if (material.scope !== scope || !isHexColor(material.color)) continue;
    const distance = colorDistance(target, hexToRgb(material.color));
    if (!best || distance < best.distance) best = { id: material.id, distance };
  }
  return best?.id;
}

export function slugifyStyleName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'custom';
}

/**
 * Builds a custom StylePreset from extracted tokens.
 * Materials are matched by closest reference colour per scope, furniture
 * preference inherits from the base preset (default modern-minimal).
 */
export function buildCustomStyle(
  name: string,
  tokens: StyleTokens,
  options: CustomStyleOptions = {},
): StylePreset {
  const base = getStylePreset(options.baseId ?? 'modern-minimal');
  const materials: StylePreset['materials'] = {
    floor: options.materials?.floor ?? closestMaterial('floor', tokens.floor),
    wall: options.materials?.wall ?? closestMaterial('wall', tokens.wall),
    ceiling: options.materials?.ceiling ?? closestMaterial('ceiling', tokens.ceiling),
    joinery: options.materials?.joinery ?? closestMaterial('joinery', tokens.joinery),
    countertop: options.materials?.countertop ?? closestMaterial('countertop', tokens.stone),
    metal: options.materials?.metal ?? closestMaterial('metal', tokens.metal),
    fabric: options.materials?.fabric ?? closestMaterial('fabric', tokens.fabric),
  };
  return {
    id: `custom-${slugifyStyleName(name)}`,
    name: name.trim() || '自定义风格',
    description:
      options.description ?? `${name.trim() || '自定义'}：从参考图提取配色生成的自定义风格（本地取色，无需联网）。`,
    tokens: { ...tokens },
    materials,
    lighting: options.lighting ?? { temperature: 3500, intensity: 0.9 },
    furniturePreference: { ...(base?.furniturePreference ?? {}) },
    moodKeywords: options.moodKeywords ?? ['自定义', '取色', '参考图'],
  };
}
