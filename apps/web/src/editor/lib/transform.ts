import {
  bboxFromPoints,
  bboxUnion,
  expandBBox,
  rotatePoint,
  type Annotation,
  type BBox,
  type Point,
  type Project,
} from '@hdesign/domain';
import type { Viewport } from '../../store/ui-store';

/** Pure viewport maths for the 2D editor: world is millimetres, screen is CSS px. */

export interface StageSize {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 8;
export const FIT_PADDING_PX = 72;

/** World point -> screen point. */
export function worldToScreen(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.scale + viewport.x, y: point.y * viewport.scale + viewport.y };
}

/** Screen point -> world point. */
export function screenToWorld(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Zoom while keeping the world point under the screen anchor fixed. */
export function zoomViewportAt(
  viewport: Viewport,
  anchorScreen: Point,
  nextScale: number,
): Viewport {
  const scale = clampScale(nextScale);
  const world = screenToWorld(anchorScreen, viewport);
  return {
    scale,
    x: anchorScreen.x - world.x * scale,
    y: anchorScreen.y - world.y * scale,
  };
}

/** Fallback plan area used when the document has no geometry yet (10 m x 8 m). */
export const EMPTY_PLAN_BBOX: BBox = { x: -5000, y: -4000, w: 10000, h: 8000 };

export function referenceBBox(reference: Project['reference']): BBox | null {
  if (!reference) return null;
  const width = reference.widthPx * reference.mmPerPx;
  const height = reference.heightPx * reference.mmPerPx;
  const corners: Point[] = [
    { x: reference.offset.x, y: reference.offset.y },
    { x: reference.offset.x + width, y: reference.offset.y },
    { x: reference.offset.x + width, y: reference.offset.y + height },
    { x: reference.offset.x, y: reference.offset.y + height },
  ].map((corner) => rotatePoint(corner, reference.offset, reference.rotationDeg));
  return bboxFromPoints(corners);
}

export function annotationBBox(annotation: Annotation): BBox {
  const box = bboxFromPoints(annotation.points);
  if (annotation.kind === 'text') {
    const approximate = Math.max(annotation.text.length, 1) * annotation.fontSize * 0.62;
    return {
      x: box.x,
      y: box.y - annotation.fontSize,
      w: Math.max(approximate, annotation.fontSize),
      h: annotation.fontSize * 2.4,
    };
  }
  return expandBBox(box, Math.max(annotation.fontSize, 40));
}

/** Bounding box of every visible drawing entity, or null for an empty plan. */
export function documentBBox(doc: Project): BBox | null {
  let box: BBox | null = null;
  for (const wall of doc.walls) {
    box = bboxUnion(box, bboxFromPoints([wall.a, wall.b]));
  }
  for (const room of doc.rooms) {
    box = bboxUnion(box, bboxFromPoints(room.polygon));
  }
  for (const item of doc.furniture) {
    const half = Math.hypot(item.w, item.d) / 2;
    box = bboxUnion(
      box,
      bboxFromPoints([
        { x: item.x - half, y: item.y - half },
        { x: item.x + half, y: item.y + half },
      ]),
    );
  }
  for (const device of doc.mep.devices) {
    box = bboxUnion(
      box,
      bboxFromPoints([
        { x: device.x - 120, y: device.y - 120 },
        { x: device.x + 120, y: device.y + 120 },
      ]),
    );
  }
  for (const annotation of doc.annotations) {
    box = bboxUnion(box, annotationBBox(annotation));
  }
  const reference = doc.reference;
  if (reference && reference.visible) {
    const referenceBox = referenceBBox(reference);
    if (referenceBox) box = bboxUnion(box, referenceBox);
  }
  return box;
}

/** Fit a world bbox into the stage with padding, never zooming past 100%. */
export function fitViewportToBox(
  box: BBox | null,
  size: StageSize,
  padding = FIT_PADDING_PX,
): Viewport {
  const content = box ?? EMPTY_PLAN_BBOX;
  const width = Math.max(1, size.width - padding * 2);
  const height = Math.max(1, size.height - padding * 2);
  const rawScale = Math.min(width / Math.max(content.w, 1), height / Math.max(content.h, 1));
  const scale = clampScale(Math.min(rawScale, 1));
  return {
    scale,
    x: size.width / 2 - (content.x + content.w / 2) * scale,
    y: size.height / 2 - (content.y + content.h / 2) * scale,
  };
}

/** World rectangle currently visible on stage (inclusive of a small margin). */
export function visibleWorldRect(viewport: Viewport, size: StageSize, marginPx = 48): BBox {
  const topLeft = screenToWorld({ x: -marginPx, y: -marginPx }, viewport);
  const bottomRight = screenToWorld(
    { x: size.width + marginPx, y: size.height + marginPx },
    viewport,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: Math.max(1, bottomRight.x - topLeft.x),
    h: Math.max(1, bottomRight.y - topLeft.y),
  };
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/** Screen distance converted to world units at the current zoom. */
export function screenToWorldDistance(px: number, viewport: Viewport): number {
  return px / viewport.scale;
}
