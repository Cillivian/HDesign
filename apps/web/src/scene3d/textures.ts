import * as THREE from 'three';
import { floorMaterialKind } from './floor-geometry';
import { lookupMaterialColor } from './catalog-bridge';
import type { ScenePalette } from './palette';

/**
 * Procedural, asset-free textures. Everything is drawn on a 2D canvas so the
 * app ships no external images / fonts / CDNs.
 */

const FLOOR_TONES: Record<string, string> = {
  'floor-oak': '#C9A97E',
  'floor-oak-walnut': '#9C7450',
  'floor-tile-600': '#D8D4C9',
  'floor-tile-anti-slip': '#BFBCB4',
  'floor-marble': '#DDDAD2',
  'floor-carpet': '#B9B2A4',
};

export function floorBaseColor(materialId: string): string {
  return lookupMaterialColor(materialId) ?? FLOOR_TONES[materialId] ?? '#C8B9A3';
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  const int = Number.parseInt(expanded, 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function makeContext(size: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas.getContext('2d');
}

const floorTextureCache = new Map<string, THREE.Texture>();
const floorMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function drawWood(context: CanvasRenderingContext2D, size: number, base: string): void {
  const random = seededRandom(7);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  const planks = 4;
  const plankHeight = size / planks;
  for (let index = 0; index < planks; index += 1) {
    const y = index * plankHeight;
    context.fillStyle = withAlpha(index % 2 === 0 ? '#FFFFFF' : '#000000', index % 2 === 0 ? 0.05 : 0.04);
    context.fillRect(0, y, size, plankHeight);
    context.strokeStyle = withAlpha('#3B2C1E', 0.35);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(size, y + 0.5);
    context.stroke();
    // grain
    for (let line = 0; line < 14; line += 1) {
      const ly = y + random() * plankHeight;
      context.strokeStyle = withAlpha('#3B2C1E', 0.08 + random() * 0.08);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(random() * size, ly);
      context.bezierCurveTo(
        size * 0.3,
        ly + (random() - 0.5) * 6,
        size * 0.7,
        ly + (random() - 0.5) * 6,
        size,
        ly + (random() - 0.5) * 4,
      );
      context.stroke();
    }
  }
}

function drawTile(context: CanvasRenderingContext2D, size: number, base: string, cells: number): void {
  const random = seededRandom(13);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  const cell = size / cells;
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      context.fillStyle = withAlpha(random() > 0.5 ? '#FFFFFF' : '#000000', random() * 0.05);
      context.fillRect(column * cell, row * cell, cell, cell);
    }
  }
  context.strokeStyle = withAlpha('#5B564C', 0.28);
  context.lineWidth = 3;
  for (let index = 0; index <= cells; index += 1) {
    context.beginPath();
    context.moveTo(index * cell, 0);
    context.lineTo(index * cell, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, index * cell);
    context.lineTo(size, index * cell);
    context.stroke();
  }
}

function drawStone(context: CanvasRenderingContext2D, size: number, base: string): void {
  const random = seededRandom(29);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let vein = 0; vein < 18; vein += 1) {
    context.strokeStyle = withAlpha('#6C675E', 0.06 + random() * 0.12);
    context.lineWidth = 1 + random() * 2;
    context.beginPath();
    let x = random() * size;
    let y = 0;
    context.moveTo(x, y);
    while (y < size) {
      x += (random() - 0.5) * 40;
      y += 18 + random() * 26;
      context.lineTo(x, y);
    }
    context.stroke();
  }
}

function drawCarpet(context: CanvasRenderingContext2D, size: number, base: string): void {
  const random = seededRandom(41);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let dot = 0; dot < 1600; dot += 1) {
    context.fillStyle = withAlpha(random() > 0.5 ? '#FFFFFF' : '#000000', 0.05 + random() * 0.08);
    context.fillRect(random() * size, random() * size, 2, 2);
  }
}

function drawPlain(context: CanvasRenderingContext2D, size: number, base: string): void {
  const random = seededRandom(53);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let dot = 0; dot < 500; dot += 1) {
    context.fillStyle = withAlpha(random() > 0.5 ? '#FFFFFF' : '#000000', random() * 0.04);
    context.fillRect(random() * size, random() * size, 3, 3);
  }
}

/** Tiling floor texture scaled to roughly one tile pattern per 2 m. */
export function floorTexture(materialId: string, repeatX: number, repeatY: number): THREE.Texture | null {
  const repeat = {
    x: Math.max(0.5, Math.min(24, Math.round(repeatX * 2) / 2)),
    y: Math.max(0.5, Math.min(24, Math.round(repeatY * 2) / 2)),
  };
  const key = `${materialId}|${repeat.x}|${repeat.y}`;
  const cached = floorTextureCache.get(key);
  if (cached) return cached;
  const context = makeContext(256);
  if (!context) return null;
  const base = floorBaseColor(materialId);
  const kind = floorMaterialKind(materialId);
  if (kind === 'wood') drawWood(context, 256, base);
  else if (kind === 'tile') drawTile(context, 256, base, materialId.includes('anti-slip') ? 6 : 4);
  else if (kind === 'stone') drawStone(context, 256, base);
  else if (kind === 'carpet') drawCarpet(context, 256, base);
  else drawPlain(context, 256, base);

  const texture = new THREE.CanvasTexture(context.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  floorTextureCache.set(key, texture);
  return texture;
}

export function floorMaterialFor(
  materialId: string,
  repeatX: number,
  repeatY: number,
  selected: boolean,
  palette: ScenePalette,
): THREE.MeshStandardMaterial {
  const key = `${materialId}|${Math.round(repeatX * 2)}|${Math.round(repeatY * 2)}|${selected}|${palette.accent}`;
  const cached = floorMaterialCache.get(key);
  if (cached) return cached;
  const map = floorTexture(materialId, repeatX, repeatY);
  const material = new THREE.MeshStandardMaterial({
    color: selected ? palette.accent : '#FFFFFF',
    roughness: 0.72,
    metalness: 0.02,
    map: map ?? undefined,
  });
  if (selected) {
    material.emissive = new THREE.Color(palette.accent);
    material.emissiveIntensity = 0.12;
  }
  floorMaterialCache.set(key, material);
  return material;
}

const labelTextureCache = new Map<string, THREE.CanvasTexture>();

/** Room name + area label drawn onto a sprite texture. */
export function roomLabelTexture(title: string, subtitle: string, ink: string, background: string): THREE.CanvasTexture | null {
  const key = `${title}|${subtitle}|${ink}|${background}`;
  const cached = labelTextureCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const width = 512;
  const height = 200;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const radius = 22;
  context.beginPath();
  context.moveTo(radius, 10);
  context.lineTo(width - radius, 10);
  context.quadraticCurveTo(width - 10, 10, width - 10, radius + 10);
  context.lineTo(width - 10, height - radius - 10);
  context.quadraticCurveTo(width - 10, height - 10, width - radius, height - 10);
  context.lineTo(radius, height - 10);
  context.quadraticCurveTo(10, height - 10, 10, height - radius - 10);
  context.lineTo(10, radius + 10);
  context.quadraticCurveTo(10, 10, radius, 10);
  context.closePath();
  context.fillStyle = withAlpha(background, 0.84);
  context.fill();
  context.strokeStyle = withAlpha(ink, 0.16);
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 62px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  context.fillText(title, width / 2, 78);
  context.font = '500 38px "SF Mono", "JetBrains Mono", ui-monospace, monospace';
  context.fillStyle = withAlpha(ink, 0.72);
  context.fillText(subtitle, width / 2, 148);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  labelTextureCache.set(key, texture);
  return texture;
}

const mepIconCache = new Map<string, THREE.CanvasTexture>();

/** MEP point icon: water-blue / electric-amber disc with the short Chinese label. */
export function mepIconTexture(short: string, group: 'water' | 'electric', palette: ScenePalette): THREE.CanvasTexture | null {
  const color = group === 'water' ? palette.water : palette.electric;
  const key = `${short}|${group}|${color}`;
  const cached = mepIconCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = withAlpha(color, 0.95);
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.9)';
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = '#FFFFFF';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 44px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  context.fillText(short.slice(0, 2), size / 2, size / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  mepIconCache.set(key, texture);
  return texture;
}
