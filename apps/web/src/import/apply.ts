import {
  DEFAULT_LAYER_IDS,
  createOpening,
  createReference,
  createReferenceLayer,
  createRoom,
  createWall,
  distanceToSegment,
  polygonAreaSqm,
  projectPointOnSegment,
  WALL_MIN_LENGTH,
  type Opening,
  type OpeningKind,
  type Point,
  type Reference,
  type Room,
  type Wall,
} from '@hdesign/domain';
import type { ParseDraft, RasterImage } from '@hdesign/plan-recognition';
import { putAsset } from '../store/persistence';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { rasterToUnderlayBlob } from './raster';
import { inferRoomType, roomDisplayName } from './room-mapping';
import { guessSourceName, wallLengthPx, type EditableWall, type ScaleState } from './types';

export type UnderlayCalibrationSource = Reference['calibrationSource'];

export interface ApplyImportInput {
  raster: RasterImage;
  draft: ParseDraft;
  walls: EditableWall[];
  scale: ScaleState;
  /** When true, existing walls/openings/rooms are replaced in the same undo step. */
  replaceExisting: boolean;
  projectNameHint: string;
}

export interface ApplyImportResult {
  assetId: string;
  wallCount: number;
  openingCount: number;
  roomCount: number;
  skippedWalls: number;
}

const MIN_OPENING_WIDTH_MM = 300;
const MAX_OPENING_WIDTH_MM = 6000;

function round(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapCalibrationSource(source: ScaleState['source']): UnderlayCalibrationSource {
  switch (source) {
    case 'ocr':
      return 'ocr';
    case 'calibration':
      return 'manual';
    case 'ai':
      return 'ai';
    default:
      return 'assumed';
  }
}

async function storeUnderlay(raster: RasterImage): Promise<string> {
  const assetId = `underlay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const blob = await rasterToUnderlayBlob(raster);
  await putAsset(assetId, blob, 'image/jpeg');
  return assetId;
}

function toMmPolygon(points: Point[], mmPerPx: number): Point[] {
  return points.map((point) => ({ x: round(point.x * mmPerPx), y: round(point.y * mmPerPx) }));
}

/**
 * Converts the reviewed recognition draft into editable project data:
 * walls/openings/rooms on the structure layer, plus a locked reference underlay
 * (blob stored via putAsset) so the source drawing stays visible underneath.
 */
export async function applyRecognizedPlan(input: ApplyImportInput): Promise<ApplyImportResult> {
  const { raster, draft, walls, scale, replaceExisting, projectNameHint } = input;
  const mmPerPx = scale.mmPerPx;
  const assetId = await storeUnderlay(raster);
  const calibrationSource = mapCalibrationSource(scale.source);

  const builtWalls: Wall[] = [];
  let skippedWalls = 0;
  for (const editable of walls) {
    const a = { x: round(editable.a.x * mmPerPx), y: round(editable.a.y * mmPerPx) };
    const b = { x: round(editable.b.x * mmPerPx), y: round(editable.b.y * mmPerPx) };
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < WALL_MIN_LENGTH) {
      skippedWalls += 1;
      continue;
    }
    const thickness = clamp(Math.round(editable.thicknessPx * mmPerPx), 50, 400);
    builtWalls.push(
      createWall(a, b, {
        thickness,
        kind: thickness >= 150 ? 'wall' : 'partition',
        meta: { source: 'import', confidence: editable.confidence },
      }),
    );
  }

  // Map openings onto the nearest built wall. The draft stores pixel centres, while
  // walls above are already in millimetres, so convert before projecting.
  const builtOpenings: Opening[] = [];
  for (const opening of draft.openings) {
    const centerMm = {
      x: opening.center.x * mmPerPx,
      y: opening.center.y * mmPerPx,
    };
    let best: { wall: Wall; distance: number; t: number } | null = null;
    for (const wall of builtWalls) {
      const distancePx = distanceToSegment(centerMm, wall.a, wall.b);
      if (!best || distancePx < best.distance) {
        const projection = projectPointOnSegment(centerMm, wall.a, wall.b);
        best = { wall, distance: distancePx, t: projection.t };
      }
    }
    if (!best) continue;
    const wallLength = Math.hypot(best.wall.b.x - best.wall.a.x, best.wall.b.y - best.wall.a.y);
    if (wallLength <= 0) continue;
    const widthMm = clamp(Math.round(opening.widthPx * mmPerPx), MIN_OPENING_WIDTH_MM, MAX_OPENING_WIDTH_MM);
    if (widthMm >= wallLength) continue;
    const centerOffset = best.t * wallLength;
    const offset = clamp(centerOffset - widthMm / 2, 0, Math.max(0, wallLength - widthMm));
    const kind: OpeningKind = ['door', 'window', 'sliding', 'arch'].includes(opening.kind)
      ? (opening.kind as OpeningKind)
      : 'door';
    builtOpenings.push(
      createOpening(best.wall, kind, offset, widthMm, {
        meta: { source: 'import', confidence: opening.confidence },
      }),
    );
  }

  const builtRooms: Room[] = [];
  draft.rooms.forEach((room, index) => {
    const polygon = toMmPolygon(room.polygon, mmPerPx);
    if (polygon.length < 3) return;
    if (polygonAreaSqm(polygon) < 0.5) return;
    const type = inferRoomType(room.label);
    builtRooms.push(
      createRoom(polygon, {
        name: roomDisplayName(room.label, index),
        type,
        meta: { source: 'import', confidence: room.confidence },
      }),
    );
  });

  const reference = createReference({
    assetId,
    widthPx: raster.width,
    heightPx: raster.height,
    mmPerPx,
    offset: { x: 0, y: 0 },
    locked: true,
    calibrated: scale.source !== 'assumed',
    calibrationSource,
  });

  useDocStore.getState().commit((project) => {
    if (replaceExisting) {
      project.walls = [];
      project.openings = [];
      project.rooms = [];
    }
    if (!project.layers.some((layer) => layer.id === DEFAULT_LAYER_IDS.reference)) {
      const referenceLayer = createReferenceLayer({ order: 0 });
      project.layers = [referenceLayer, ...project.layers.map((layer) => ({ ...layer, order: layer.order + 1 }))];
    }
    project.reference = reference;
    project.walls.push(...builtWalls);
    project.openings.push(...builtOpenings);
    project.rooms.push(...builtRooms);
    if (['未命名方案', '导入图纸方案', ''].includes(project.name.trim())) {
      project.name = guessSourceName(projectNameHint);
    }
  });

  useUiStore.getState().clearSelection();
  window.dispatchEvent(new CustomEvent('hdesign:fit'));
  return {
    assetId,
    wallCount: builtWalls.length,
    openingCount: builtOpenings.length,
    roomCount: builtRooms.length,
    skippedWalls,
  };
}

export interface TraceOnlyInput {
  raster: RasterImage;
  scale: ScaleState;
  projectNameHint: string;
}

export interface TraceOnlyResult {
  assetId: string;
}

/**
 * “手工描图” fallback: only store the locked underlay and switch to the wall tool.
 * Works without AI and without any recognition result.
 */
export async function applyTraceOnly(input: TraceOnlyInput): Promise<TraceOnlyResult> {
  const { raster, scale, projectNameHint } = input;
  const assetId = await storeUnderlay(raster);
  const reference = createReference({
    assetId,
    widthPx: raster.width,
    heightPx: raster.height,
    mmPerPx: scale.mmPerPx,
    offset: { x: 0, y: 0 },
    locked: true,
    calibrated: scale.source !== 'assumed',
    calibrationSource: mapCalibrationSource(scale.source),
  });
  useDocStore.getState().commit((project) => {
    if (!project.layers.some((layer) => layer.id === DEFAULT_LAYER_IDS.reference)) {
      const referenceLayer = createReferenceLayer({ order: 0 });
      project.layers = [referenceLayer, ...project.layers.map((layer) => ({ ...layer, order: layer.order + 1 }))];
    }
    project.reference = reference;
    if (['未命名方案', '导入图纸方案', ''].includes(project.name.trim())) {
      project.name = guessSourceName(projectNameHint);
    }
  });
  useUiStore.getState().setTool('wall');
  useUiStore.getState().clearSelection();
  window.dispatchEvent(new CustomEvent('hdesign:fit'));
  return { assetId };
}

/** Estimated wall length for the review list, in millimetres. */
export function wallLengthMillimetres(wall: EditableWall, mmPerPx: number): number {
  return Math.round(wallLengthPx(wall) * mmPerPx);
}
