import { pointInPolygon, simplifyPolyline, type Point } from '@hdesign/domain';
import type {
  BinaryImage,
  OcrToken,
  RoomCandidate,
  WallExtraction,
} from './types';
import { labelComponents } from './raster';
import { angleToAxis } from './hough';
import { parseDimensionText } from './dimensions';

/* ------------------------------------------------------------------ */
/* Wall rasterisation                                                 */
/* ------------------------------------------------------------------ */

function fillPolygon(mask: BinaryImage, polygon: Point[]): void {
  const { width, height, data } = mask;
  if (polygon.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(height - 1, Math.ceil(maxY));
  const intersections: number[] = [];
  for (let y = yStart; y <= yEnd; y += 1) {
    intersections.length = 0;
    const sampleY = y + 0.5;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      if (a.y <= sampleY && b.y > sampleY) {
        intersections.push(a.x + ((sampleY - a.y) / (b.y - a.y)) * (b.x - a.x));
      } else if (b.y <= sampleY && a.y > sampleY) {
        intersections.push(a.x + ((sampleY - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const from = Math.max(0, Math.ceil(intersections[index]! - 0.5));
      const to = Math.min(width - 1, Math.floor(intersections[index + 1]! - 0.5));
      const row = y * width;
      for (let x = from; x <= to; x += 1) data[row + x] = 1;
    }
  }
}

/** Rasterises the recognised wall model (with thickness) as a barrier mask. */
export function buildWallMask(
  extraction: WallExtraction,
  width: number,
  height: number,
): BinaryImage {
  const mask: BinaryImage = { width, height, data: new Uint8Array(width * height) };
  for (const wall of extraction.walls) {
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (length < 1) continue;
    const ux = (wall.b.x - wall.a.x) / length;
    const uy = (wall.b.y - wall.a.y) / length;
    const half = Math.max(1.5, wall.thicknessPx / 2);
    const ex = ux * half;
    const ey = uy * half;
    const nx = -uy * half;
    const ny = ux * half;
    const polygon: Point[] = [
      { x: wall.a.x + ex + nx, y: wall.a.y + ey + ny },
      { x: wall.b.x + ex + nx, y: wall.b.y + ey + ny },
      { x: wall.b.x + ex - nx, y: wall.b.y + ey - ny },
      { x: wall.a.x + ex - nx, y: wall.a.y + ey - ny },
    ];
    fillPolygon(mask, polygon);
    // Extend the cap on the start side as well (square join at corners).
    const startPolygon: Point[] = [
      { x: wall.a.x - ex + nx, y: wall.a.y - ey + ny },
      { x: wall.a.x + ex + nx, y: wall.a.y + ey + ny },
      { x: wall.a.x + ex - nx, y: wall.a.y + ey - ny },
      { x: wall.a.x - ex - nx, y: wall.a.y - ey - ny },
    ];
    fillPolygon(mask, startPolygon);
  }
  return mask;
}

/* ------------------------------------------------------------------ */
/* Boundary tracing                                                   */
/* ------------------------------------------------------------------ */

const NEIGHBOURS: Array<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
];

/** Moore-neighbour boundary tracing of one labelled component. Outer boundary only. */
export function traceComponentBoundary(
  labeling: { labels: Int32Array; stats: Array<{ minX: number; minY: number }> },
  component: number,
  width: number,
  height: number,
): Point[] {
  const { labels } = labeling;
  let start = -1;
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === component) {
      start = index;
      break;
    }
  }
  if (start < 0) return [];
  const startX = start % width;
  const startY = (start - startX) / width;
  const boundary: Point[] = [{ x: startX, y: startY }];
  let currentX = startX;
  let currentY = startY;
  let backtrack = { x: startX - 1, y: startY };
  const maxSteps = width * height;
  for (let step = 0; step < maxSteps; step += 1) {
    const backtrackDx = backtrack.x - currentX;
    const backtrackDy = backtrack.y - currentY;
    let startDirection = 0;
    for (let direction = 0; direction < 8; direction += 1) {
      if (NEIGHBOURS[direction]!.dx === backtrackDx && NEIGHBOURS[direction]!.dy === backtrackDy) {
        startDirection = direction;
        break;
      }
    }
    let found = false;
    for (let offset = 1; offset <= 8; offset += 1) {
      const direction = (startDirection + offset) % 8;
      const stepDirection = NEIGHBOURS[direction]!;
      const nx = currentX + stepDirection.dx;
      const ny = currentY + stepDirection.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (labels[ny * width + nx] !== component) continue;
      backtrack = { x: currentX + NEIGHBOURS[(direction + 7) % 8]!.dx, y: currentY + NEIGHBOURS[(direction + 7) % 8]!.dy };
      if (nx === startX && ny === startY && boundary.length > 2) return boundary;
      currentX = nx;
      currentY = ny;
      boundary.push({ x: nx, y: ny });
      found = true;
      break;
    }
    if (!found) break;
  }
  return boundary;
}

/* ------------------------------------------------------------------ */
/* Polygon cleanup                                                    */
/* ------------------------------------------------------------------ */

function dedupePoints(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) result.push(point);
  }
  if (result.length > 1) {
    const first = result[0]!;
    const last = result[result.length - 1]!;
    if (first.x === last.x && first.y === last.y) result.pop();
  }
  return result;
}

function snapEdgesToAxes(points: Point[], toleranceDeg = 10): Point[] {
  if (points.length < 3) return points;
  const result = points.map((point) => ({ ...point }));
  for (let iteration = 0; iteration < 2; iteration += 1) {
    for (let index = 0; index < result.length; index += 1) {
      const a = result[index]!;
      const b = result[(index + 1) % result.length]!;
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (Math.abs(angleToAxis(angle)) > toleranceDeg) continue;
      if (Math.abs(Math.abs(angleToAxis(angle)) - 0) <= Math.abs(Math.abs(angleToAxis(angle)) - 90)) {
        if (Math.abs(angleToAxis(angle)) > toleranceDeg) continue;
      }
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      if (horizontal) {
        const y = Math.round((a.y + b.y) / 2);
        a.y = y;
        b.y = y;
      } else {
        const x = Math.round((a.x + b.x) / 2);
        a.x = x;
        b.x = x;
      }
    }
  }
  return dedupePoints(result);
}

/** Removes sub-pixel spikes / duplicate corners left by raster tracing. */
function cleanPolygonPoints(points: Point[], minEdge: number): Point[] {
  let current = dedupePoints(points.map((point) => ({ x: point.x, y: point.y })));
  for (let pass = 0; pass < 4; pass += 1) {
    const next: Point[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const previous = current[(index - 1 + current.length) % current.length]!;
      const point = current[index]!;
      const following = current[(index + 1) % current.length]!;
      const previousDistance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const nextDistance = Math.hypot(following.x - point.x, following.y - point.y);
      if (previousDistance < minEdge && nextDistance < minEdge) continue;
      next.push(point);
    }
    if (next.length < 3) return current;
    current = next;
  }
  return current;
}

export function simplifyRoomPolygon(
  boundary: Point[],
  diagonal: number,
): Point[] {
  const deduped = dedupePoints(boundary);
  if (deduped.length < 3) return [];
  const tolerance = Math.max(1.5, diagonal * 0.004);
  const simplified = simplifyPolyline(deduped, tolerance);
  const snapped = snapEdgesToAxes(simplified, 12);
  return cleanPolygonPoints(snapped, Math.max(1.5, diagonal * 0.002));
}

/* ------------------------------------------------------------------ */
/* Room segmentation                                                  */
/* ------------------------------------------------------------------ */

export interface RoomSegmentationOptions {
  minAreaPx?: number;
  maxRooms?: number;
}

export function segmentRooms(
  wallMask: BinaryImage,
  options: RoomSegmentationOptions = {},
): { rooms: RoomCandidate[]; freeSpace: BinaryImage } {
  const { width, height } = wallMask;
  const freeSpace: BinaryImage = {
    width,
    height,
    data: new Uint8Array(width * height),
  };
  for (let index = 0; index < wallMask.data.length; index += 1) {
    freeSpace.data[index] = wallMask.data[index] ? 0 : 1;
  }

  // Flood the border-connected free space: that is "outside".
  const labeling = labelComponents(freeSpace, 4);
  const borderLabels = new Set<number>();
  for (let x = 0; x < width; x += 1) {
    borderLabels.add(labeling.labels[x]!);
    borderLabels.add(labeling.labels[(height - 1) * width + x]!);
  }
  for (let y = 0; y < height; y += 1) {
    borderLabels.add(labeling.labels[y * width]!);
    borderLabels.add(labeling.labels[y * width + width - 1]!);
  }

  const imageArea = width * height;
  const minArea = options.minAreaPx ?? Math.max(400, Math.round(imageArea * 0.0009));
  const maxArea = Math.round(imageArea * 0.6);
  const diagonal = Math.hypot(width, height);
  const rooms: RoomCandidate[] = [];

  for (let label = 1; label < labeling.stats.length; label += 1) {
    if (borderLabels.has(label)) continue;
    const stat = labeling.stats[label]!;
    if (stat.area < minArea || stat.area > maxArea) continue;
    const boundary = traceComponentBoundary(labeling, label, width, height);
    if (boundary.length < 8) continue;
    const polygon = simplifyRoomPolygon(boundary, diagonal);
    if (polygon.length < 3) continue;
    let area = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      area += a.x * b.y - b.x * a.y;
    }
    const areaPx = Math.abs(area / 2);
    if (areaPx < minArea) continue;
    let regularEdges = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (Math.abs(angleToAxis(angle)) <= 6) regularEdges += 1;
    }
    const regularity = regularEdges / polygon.length;
    const sizeScore = Math.min(1, Math.sqrt(areaPx / (minArea * 12)));
    const confidence = Math.min(
      0.95,
      0.32 + 0.35 * regularity + 0.2 * sizeScore + (polygon.length <= 8 ? 0.1 : 0),
    );
    rooms.push({
      polygon,
      confidence: Number(confidence.toFixed(3)),
      areaPx: Math.round(areaPx),
    });
  }
  rooms.sort((left, right) => right.areaPx - left.areaPx);
  if (options.maxRooms && rooms.length > options.maxRooms) rooms.length = options.maxRooms;
  return { rooms, freeSpace };
}

/* ------------------------------------------------------------------ */
/* OCR label / dimension mapping                                      */
/* ------------------------------------------------------------------ */

const ROOM_NAME_HINTS = [
  '客厅',
  '餐厅',
  '主卧',
  '次卧',
  '儿童房',
  '卧室',
  '厨房',
  '卫生间',
  '卫浴',
  '主卫',
  '客卫',
  '阳台',
  '玄关',
  '书房',
  '衣帽间',
  '走廊',
  '过道',
  '储物间',
  'LIVING',
  'BEDROOM',
  'BED',
  'KITCHEN',
  'BATH',
  'TOILET',
  'DINING',
  'STUDY',
  'BALCONY',
  'ENTRY',
  'HALL',
];

export function looksLikeRoomName(text: string): boolean {
  const upper = text.trim().toUpperCase();
  if (!upper) return false;
  if (parseDimensionText(text).items.length > 0) return false;
  if (ROOM_NAME_HINTS.some((hint) => upper.includes(hint))) return true;
  return /^[\u4e00-\u9fa5]{2,6}$/.test(text.trim());
}

/** Maps OCR tokens (room names) onto room polygons using point-in-polygon. */
export function assignRoomLabels(
  rooms: RoomCandidate[],
  tokens: OcrToken[],
): RoomCandidate[] {
  const result = rooms.map((room) => ({ ...room }));
  for (const token of tokens) {
    if (!looksLikeRoomName(token.text)) continue;
    const center = { x: token.x, y: token.y };
    let best: RoomCandidate | undefined;
    let bestDistance = Infinity;
    for (const room of result) {
      if (pointInPolygon(center, room.polygon)) {
        best = room;
        break;
      }
      const distance = Math.hypot(
        center.x - room.polygon[0]!.x,
        center.y - room.polygon[0]!.y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = room;
      }
    }
    if (best && pointInPolygon(center, best.polygon)) {
      best.label = token.text.trim();
      best.confidence = Math.min(0.95, best.confidence + 0.05);
    }
  }
  return result;
}
