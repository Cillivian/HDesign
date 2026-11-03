import * as THREE from 'three';
import type { ScenePalette } from './palette';

/** Small shared primitive geometries keep the scene mesh count cheap. */
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
export const unitSphere = new THREE.SphereGeometry(0.5, 16, 12);
export const unitCone = new THREE.ConeGeometry(0.5, 1, 16);
export const unitDisc = new THREE.CircleGeometry(0.5, 20);

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  side?: THREE.Side;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function standardMaterial(color: string, options: MaterialOptions = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${options.roughness ?? ''}|${options.metalness ?? ''}|${options.transparent ?? ''}|${options.opacity ?? ''}|${options.emissive ?? ''}|${options.emissiveIntensity ?? ''}|${options.side ?? ''}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0.04,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
  });
  materialCache.set(key, material);
  return material;
}

/** Parse #rgb / #rrggbb into 0..255 channels. */
function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '').trim();
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  const int = Number.parseInt(expanded, 16);
  if (!Number.isFinite(int)) return [180, 172, 158];
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Lighten (positive percent) or darken (negative percent) a hex colour. */
export function shadeColor(hex: string, percent: number): string {
  const [r, g, b] = parseHex(hex);
  const factor = 1 + percent / 100;
  return toHex([r * factor, g * factor, b * factor]);
}

export function mixColor(first: string, second: string, amount: number): string {
  const [r1, g1, b1] = parseHex(first);
  const [r2, g2, b2] = parseHex(second);
  const t = Math.max(0, Math.min(1, amount));
  return toHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

export function wallMaterial(loadBearing: boolean, lowWall: boolean, selected: boolean, palette: ScenePalette) {
  const base = lowWall ? palette.wallLow : loadBearing ? palette.wallLoadBearing : palette.wallPaint;
  return standardMaterial(selected ? mixColor(base, palette.accent, 0.42) : base, {
    roughness: 0.92,
    metalness: 0,
  });
}

export function openingMaterial(
  role: 'frame' | 'leaf' | 'glass' | 'mullion',
  selected: boolean,
  palette: ScenePalette,
) {
  if (role === 'glass') {
    return standardMaterial(selected ? mixColor('#B7D2DC', palette.accent, 0.4) : '#B7D2DC', {
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
  }
  if (role === 'leaf') {
    return standardMaterial(selected ? mixColor('#A98B67', palette.accent, 0.45) : '#A98B67', {
      roughness: 0.65,
    });
  }
  if (role === 'mullion') {
    return standardMaterial('#6E7A72', { roughness: 0.55, metalness: 0.25 });
  }
  return standardMaterial('#F3EFE5', { roughness: 0.8 });
}

/** Material set for one furniture item, derived from its primary colour. */
export function furnitureMaterials(primary: string, palette: ScenePalette): Record<string, THREE.MeshStandardMaterial> {
  return {
    primary: standardMaterial(primary, { roughness: 0.78 }),
    primaryDark: standardMaterial(shadeColor(primary, -18), { roughness: 0.82 }),
    primaryLight: standardMaterial(shadeColor(primary, 14), { roughness: 0.76 }),
    secondary: standardMaterial(shadeColor(primary, -28), { roughness: 0.7 }),
    metal: standardMaterial('#9AA1A0', { roughness: 0.35, metalness: 0.6 }),
    glass: standardMaterial('#BAD2DA', {
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    }),
    fabric: standardMaterial(shadeColor(primary, -6), { roughness: 0.95 }),
    accent: standardMaterial(palette.accent, { roughness: 0.7 }),
    emissive: standardMaterial('#FFE2B0', {
      roughness: 0.4,
      emissive: '#FFD18A',
      emissiveIntensity: 1.1,
    }),
    foliage: standardMaterial('#5E7C55', { roughness: 0.9 }),
    white: standardMaterial('#EFECE4', { roughness: 0.8 }),
    dark: standardMaterial('#33383A', { roughness: 0.5 }),
    stone: standardMaterial('#CFC9BC', { roughness: 0.6 }),
  };
}
