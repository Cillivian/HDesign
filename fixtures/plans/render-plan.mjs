/* global Buffer */
/**
 * Dependency-free rasteriser for the synthetic fixture plans.
 *
 * It produces plain RGBA images (the same shape the recognition pipeline uses)
 * and can encode them to PNG/PDF in `fixtures/generate.mjs` via lazy imports.
 */
import { imageSize, mmToImage } from './plan-defs.mjs';

/* ------------------------------------------------------------------ */
/* A tiny 3x5 bitmap font (uppercase + digits)                        */
/* ------------------------------------------------------------------ */

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  x: ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
};
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_SPACING = 1;

const INK = [34, 36, 33, 255];
const PAPER = [250, 249, 245, 255];

/* ------------------------------------------------------------------ */
/* Low level drawing                                                  */
/* ------------------------------------------------------------------ */

function setPixel(raster, x, y, color = INK) {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
  const index = (Math.round(y) * raster.width + Math.round(x)) * 4;
  raster.data[index] = color[0];
  raster.data[index + 1] = color[1];
  raster.data[index + 2] = color[2];
  raster.data[index + 3] = 255;
}

function fillRect(raster, x, y, w, h, color = INK) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(raster.width - 1, Math.ceil(x + w));
  const y1 = Math.min(raster.height - 1, Math.ceil(y + h));
  for (let row = y0; row <= y1; row += 1) {
    for (let column = x0; column <= x1; column += 1) {
      const index = (row * raster.width + column) * 4;
      raster.data[index] = color[0];
      raster.data[index + 1] = color[1];
      raster.data[index + 2] = color[2];
      raster.data[index + 3] = 255;
    }
  }
}

function drawLine(raster, x0, y0, x1, y1, color = INK, thickness = 1) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (thickness <= 1) {
      setPixel(raster, x, y, color);
    } else {
      fillRect(raster, x - thickness / 2, y - thickness / 2, thickness, thickness, color);
    }
  }
}

function fillPolygon(raster, points, color = INK) {
  if (points.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(raster.height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y += 1) {
    const sampleY = y + 0.5;
    const crossings = [];
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (a.y <= sampleY && b.y > sampleY) {
        crossings.push(a.x + ((sampleY - a.y) / (b.y - a.y)) * (b.x - a.x));
      } else if (b.y <= sampleY && a.y > sampleY) {
        crossings.push(a.x + ((sampleY - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = Math.max(0, Math.ceil(crossings[index] - 0.5));
      const to = Math.min(raster.width - 1, Math.floor(crossings[index + 1] - 0.5));
      for (let x = from; x <= to; x += 1) setPixel(raster, x, y, color);
    }
  }
}

function alphabetWidth(text) {
  return text.length * (GLYPH_WIDTH + GLYPH_SPACING) - GLYPH_SPACING;
}

function drawText(raster, text, centerX, centerY, options = {}) {
  const scale = options.scale ?? 3;
  const color = options.color ?? INK;
  const characters = text.toUpperCase().split('');
  const width = alphabetWidth(text) * scale;
  const height = GLYPH_HEIGHT * scale;
  const startX = Math.round(centerX - width / 2);
  const startY = Math.round(centerY - height / 2);
  characters.forEach((character, characterIndex) => {
    const glyph = GLYPHS[character] ?? GLYPHS[' '];
    const glyphX = startX + characterIndex * (GLYPH_WIDTH + GLYPH_SPACING) * scale;
    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      const line = glyph[row];
      for (let column = 0; column < GLYPH_WIDTH; column += 1) {
        if (line[column] !== '1') continue;
        fillRect(raster, glyphX + column * scale, startY + row * scale, scale, scale, color);
      }
    }
  });
}

function drawTicks(raster, x0, y0, x1, y1, color = INK) {
  const length = 7;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const norm = Math.hypot(dx, dy) || 1;
  const nx = -dy / norm;
  const ny = dx / norm;
  drawLine(raster, x0 - nx * length, y0 - ny * length, x0 + nx * length, y0 + ny * length, color);
  drawLine(raster, x1 - nx * length, y1 - ny * length, x1 + nx * length, y1 + ny * length, color);
}

/* ------------------------------------------------------------------ */
/* Plan drawing                                                       */
/* ------------------------------------------------------------------ */

function wallPoint(plan, wall, alongMm, normalOffsetMm) {
  const dx = wall.bMm[0] - wall.aMm[0];
  const dy = wall.bMm[1] - wall.aMm[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  return mmToImage(plan, [
    wall.aMm[0] + ux * alongMm + nx * normalOffsetMm,
    wall.aMm[1] + uy * alongMm + ny * normalOffsetMm,
  ]);
}

function drawWallPieces(raster, plan, wall) {
  const dx = wall.bMm[0] - wall.aMm[0];
  const dy = wall.bMm[1] - wall.aMm[1];
  const length = Math.hypot(dx, dy) || 1;
  const half = wall.thicknessMm / 2;
  const openings = [...(wall.openings ?? [])].sort((left, right) => left.startMm - right.startMm);
  const pieces = [];
  let cursor = 0;
  for (const opening of openings) {
    if (opening.startMm > cursor) pieces.push([cursor, opening.startMm]);
    cursor = Math.max(cursor, opening.startMm + opening.widthMm);
  }
  if (cursor < length) pieces.push([cursor, length]);
  for (const [from, to] of pieces) {
    const polygon = [
      wallPoint(plan, wall, from, -half),
      wallPoint(plan, wall, to, -half),
      wallPoint(plan, wall, to, half),
      wallPoint(plan, wall, from, half),
    ];
    fillPolygon(raster, polygon, INK);
  }
  for (const opening of openings) {
    drawOpening(raster, plan, wall, opening);
  }
}

function drawOpening(raster, plan, wall, opening) {
  const dx = wall.bMm[0] - wall.aMm[0];
  const dy = wall.bMm[1] - wall.aMm[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const thicknessPx = wall.thicknessMm / plan.mmPerPx;

  if (opening.kind === 'window') {
    const offset = Math.max(2, thicknessPx / 2 - 2);
    for (const sign of [-1, 1]) {
      const a = wallPoint(plan, wall, opening.startMm, sign * offset * plan.mmPerPx);
      const b = wallPoint(plan, wall, opening.startMm + opening.widthMm, sign * offset * plan.mmPerPx);
      drawLine(raster, a.x, a.y, b.x, b.y, INK, 1);
    }
    // Jamb ticks at both ends.
    for (const along of [opening.startMm, opening.startMm + opening.widthMm]) {
      const a = wallPoint(plan, wall, along, -thicknessPx / 2);
      const b = wallPoint(plan, wall, along, thicknessPx / 2);
      drawLine(raster, a.x, a.y, b.x, b.y, INK, 1);
    }
    return;
  }

  if (opening.kind === 'sliding') {
    const offset = Math.max(2, thicknessPx / 2 - 2);
    const a = wallPoint(plan, wall, opening.startMm, offset * plan.mmPerPx);
    const b = wallPoint(plan, wall, opening.startMm + opening.widthMm, offset * plan.mmPerPx);
    drawLine(raster, a.x, a.y, b.x, b.y, INK, 2);
    return;
  }

  // Door: hinge at the start of the gap, leaf perpendicular, swing arc to the gap end.
  const side = wall.id.includes('bottom') || wall.id.includes('right') ? -1 : 1;
  const hinge = wallPoint(plan, wall, opening.startMm, 0);
  const end = wallPoint(plan, wall, opening.startMm + opening.widthMm, 0);
  const leafEnd = {
    x: hinge.x + nx * opening.widthMm / plan.mmPerPx * side,
    y: hinge.y + ny * opening.widthMm / plan.mmPerPx * side,
  };
  drawLine(raster, hinge.x, hinge.y, leafEnd.x, leafEnd.y, INK, 1);
  const steps = 28;
  let previous = end;
  for (let step = 1; step <= steps; step += 1) {
    const angle = (Math.PI / 2) * (step / steps);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotate (end - hinge) around the hinge towards the leaf direction.
    const relX = end.x - hinge.x;
    const relY = end.y - hinge.y;
    const rotatedX = relX * cos - relY * sin * side;
    const rotatedY = relX * sin * side + relY * cos;
    const point = { x: hinge.x + rotatedX, y: hinge.y + rotatedY };
    drawLine(raster, previous.x, previous.y, point.x, point.y, INK, 1);
    previous = point;
  }
}

const DIMENSION_TEXT_SCALE = 4;

function drawDimensions(raster, plan) {
  for (const dimension of plan.dimensions) {
    const at = mmToImage(plan, dimension.atMm);
    const text = String(dimension.valueMm);
    drawText(raster, text, at.x, at.y, { scale: DIMENSION_TEXT_SCALE });
    const halfWidth = (alphabetWidth(text) * DIMENSION_TEXT_SCALE) / 2 + 10;
    if (dimension.axis === 'h') {
      const y = at.y + DIMENSION_TEXT_SCALE * 5;
      drawLine(raster, at.x - halfWidth, y, at.x + halfWidth, y, INK, 1);
      drawTicks(raster, at.x - halfWidth, y, at.x + halfWidth, y, INK);
    } else {
      const x = at.x - halfWidth;
      const halfHeight = DIMENSION_TEXT_SCALE * 6;
      drawLine(raster, x, at.y - halfHeight, x, at.y + halfHeight, INK, 1);
      drawTicks(raster, x, at.y - halfHeight, x, at.y + halfHeight, INK);
    }
  }
}

function drawRoomLabels(raster, plan) {
  for (const room of plan.rooms) {
    const at = mmToImage(plan, room.labelAtMm);
    drawText(raster, room.label, at.x, at.y, { scale: 3 });
  }
}

/** Bilinear rotation about the image centre (white outside). */
function rotateRaster(raster, deg) {
  if (!deg) return raster;
  const radians = (deg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const { width, height } = raster;
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
        out[target] = PAPER[0];
        out[target + 1] = PAPER[1];
        out[target + 2] = PAPER[2];
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
          raster.data[(y0 * width + x0) * 4 + channel] * (1 - fx) +
          raster.data[(y0 * width + x1) * 4 + channel] * fx;
        const bottom =
          raster.data[(y1 * width + x0) * 4 + channel] * (1 - fx) +
          raster.data[(y1 * width + x1) * 4 + channel] * fx;
        out[target + channel] = top * (1 - fy) + bottom * fy;
      }
      out[target + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Renders a fixture plan to an RGBA raster. */
export function buildPlanRaster(plan) {
  const { width, height } = imageSize(plan);
  const raster = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (let index = 0; index < width * height; index += 1) {
    raster.data[index * 4] = PAPER[0];
    raster.data[index * 4 + 1] = PAPER[1];
    raster.data[index * 4 + 2] = PAPER[2];
    raster.data[index * 4 + 3] = 255;
  }
  for (const wall of plan.walls) drawWallPieces(raster, plan, wall);
  drawDimensions(raster, plan);
  drawRoomLabels(raster, plan);
  drawText(raster, `${plan.glyph} / ${plan.rooms.length} ROOMS`, 90, height - 30, { scale: 3 });
  return rotateRaster(raster, plan.rotationDeg);
}

/* ------------------------------------------------------------------ */
/* Encoding (lazy dependencies)                                       */
/* ------------------------------------------------------------------ */

export async function encodePng(raster) {
  const { PNG } = await import('pngjs');
  const png = new PNG({ width: raster.width, height: raster.height });
  png.data = Buffer.from(raster.data);
  return PNG.sync.write(png);
}

export async function buildPdf(raster, pngBuffer, title) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('HDesign fixtures');
  pdf.setProducer('HDesign fixtures');
  pdf.setAuthor('HDesign');
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const image = await pdf.embedPng(pngBuffer);
  const pageWidth = raster.width * 0.55;
  const pageHeight = raster.height * 0.55;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  return pdf.save();
}
