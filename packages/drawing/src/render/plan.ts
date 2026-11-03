import {
  angleOf,
  bboxFromPoints,
  expandBBox,
  formatSqm,
  lengthOf,
  MEP_META,
  polygonAreaSqm,
  roomLabelPoint,
  wallRectPolygon,
  type BBox,
  type FurnitureItem,
  type MepDevice,
  type MepGroup,
  type Opening,
  type Point,
  type Project,
  type Room,
  type SheetKind,
  type Wall,
} from '@hdesign/domain';
import { materialInfo } from '../catalog-adapter';
import { resolveFurnitureSymbol, resolveMepSymbol, type SymbolDef } from '../symbols';
import {
  attr,
  createIdFactory,
  defs,
  escapeXml,
  group,
  line,
  num,
  paperText,
  path,
  polygon,
  rect,
  text,
} from '../svg';
import type { PointMm, RectMm } from '../types';

/* ------------------------------------------------------------------ */
/* Plan coordinate system                                             */
/* ------------------------------------------------------------------ */

export interface PlanTransform {
  /** Paper millimetres per model millimetre. */
  k: number;
  scaleDenominator: number;
  modelBox: BBox;
  translateX: number;
  translateY: number;
  toPaper: (point: Point) => PointMm;
}

export function collectModelPoints(project: Project): Point[] {
  const points: Point[] = [];
  for (const wall of project.walls) points.push(wall.a, wall.b);
  for (const room of project.rooms) points.push(...room.polygon);
  for (const item of project.furniture) {
    points.push({ x: item.x - item.w / 2, y: item.y - item.d / 2 });
    points.push({ x: item.x + item.w / 2, y: item.y + item.d / 2 });
  }
  for (const device of project.mep.devices) points.push({ x: device.x, y: device.y });
  return points;
}

export function modelBounds(project: Project, scaleDenominator: number, includeDimensions: boolean): BBox {
  const points = collectModelPoints(project);
  if (points.length === 0) return { x: 0, y: 0, w: 8000, h: 6000 };
  const pad = includeDimensions ? Math.max(900, scaleDenominator * 9) : 500;
  return expandBBox(bboxFromPoints(points), pad);
}

export function buildPlanTransform(
  project: Project,
  planRect: RectMm,
  scaleDenominator: number,
  includeDimensions: boolean,
): PlanTransform {
  const modelBox = modelBounds(project, scaleDenominator, includeDimensions);
  const k = 1 / Math.max(1, scaleDenominator);
  const paperWidth = modelBox.w * k;
  const paperHeight = modelBox.h * k;
  const translateX = planRect.x + (planRect.w - paperWidth) / 2 - modelBox.x * k;
  const translateY = planRect.y + (planRect.h - paperHeight) / 2 - modelBox.y * k;
  return {
    k,
    scaleDenominator,
    modelBox,
    translateX,
    translateY,
    toPaper: (point) => ({
      x: translateX + point.x * k,
      y: translateY + point.y * k,
    }),
  };
}

export function planGroupTransform(transform: PlanTransform): string {
  return `translate(${num(transform.translateX)} ${num(transform.translateY)}) scale(${num(transform.k, 5)})`;
}

/** Paper stroke width expressed in model units. */
function modelStroke(transform: PlanTransform, paperMm: number): number {
  return paperMm / transform.k;
}

/* ------------------------------------------------------------------ */
/* Context                                                           */
/* ------------------------------------------------------------------ */

export interface PlanContext {
  project: Project;
  transform: PlanTransform;
  idPrefix: string;
  ids: (suffix: string) => string;
  warnings: string[];
  /** Layers included by the sheet (before per-layer visibility). */
  layerIds: Set<string>;
  /** Effective visibility: included by the sheet AND visible in the project. */
  isVisible: (layerId: string) => boolean;
  kind: SheetKind;
}

export interface PlanContextInput {
  project: Project;
  planRect: RectMm;
  scaleDenominator: number;
  includeDimensions: boolean;
  layerIds: string[];
  idPrefix: string;
  kind: SheetKind;
}

export function createPlanContext(input: PlanContextInput): PlanContext {
  const included = new Set(input.layerIds);
  const layerVisibility = new Map(input.project.layers.map((layer) => [layer.id, layer.visible !== false]));
  const ids = createIdFactory(`${input.idPrefix}-${input.kind}`);
  return {
    project: input.project,
    transform: buildPlanTransform(input.project, input.planRect, input.scaleDenominator, input.includeDimensions),
    idPrefix: input.idPrefix,
    ids,
    warnings: [],
    layerIds: included,
    isVisible: (layerId) => {
      if (!included.has(layerId)) return false;
      return layerVisibility.get(layerId) !== false;
    },
    kind: input.kind,
  };
}

function visibleRooms(context: PlanContext): Room[] {
  return context.project.rooms.filter((room) => context.isVisible(room.layerId));
}

function visibleOpenings(context: PlanContext, walls: Wall[]): Opening[] {
  const wallIds = new Set(walls.map((wall) => wall.id));
  return context.project.openings.filter((opening) => wallIds.has(opening.wallId) && context.isVisible(opening.layerId));
}

function visibleFurniture(context: PlanContext): FurnitureItem[] {
  return context.project.furniture.filter((item) => context.isVisible(item.layerId));
}

function visibleDevices(context: PlanContext, group?: MepGroup): MepDevice[] {
  return context.project.mep.devices.filter((device) => {
    if (group && MEP_META[device.kind].group !== group) return false;
    return context.isVisible(device.layerId);
  });
}

/* ------------------------------------------------------------------ */
/* Hatching                                                           */
/* ------------------------------------------------------------------ */

const HATCH_STROKE = '#4A5049';

function patternId(ids: (suffix: string) => string, materialId: string): string {
  return ids(`hatch-${materialId}`);
}

export interface HatchResult {
  defsContent: string;
  fillFor: (materialId: string) => string;
  /** Base room fill (behind the hatch). */
  baseFor: (materialId: string) => string;
}

/** Builds deterministic SVG patterns for floor materials used by the project. */
export function buildFloorHatches(context: PlanContext, materialIds: string[]): HatchResult {
  const unique = [...new Set(materialIds.filter(Boolean))];
  const patterns: string[] = [];
  const fills = new Map<string, string>();
  const bases = new Map<string, string>();
  for (const materialId of unique) {
    const info = materialInfo(materialId);
    const id = patternId(context.ids, materialId);
    fills.set(materialId, `url(#${id})`);
    bases.set(materialId, info.color);
    const type = `${info.type} ${materialId}`.toLowerCase();
    let content: string;
    if (/wood|oak|walnut|木/.test(type)) {
      content = [
        rect(0, 0, 900, 180, { fill: info.color, opacity: 0.3 }),
        line(0, 90, 900, 90, { stroke: HATCH_STROKE, strokeWidth: 18, opacity: 0.34 }),
        line(0, 180, 900, 180, { stroke: HATCH_STROKE, strokeWidth: 18, opacity: 0.34 }),
        line(450, 0, 450, 90, { stroke: HATCH_STROKE, strokeWidth: 13, opacity: 0.28 }),
      ].join('');
    } else if (/tile|瓷砖|tile-600/.test(type)) {
      content = [
        rect(0, 0, 600, 600, { fill: info.color, opacity: 0.34 }),
        line(0, 0, 600, 0, { stroke: HATCH_STROKE, strokeWidth: 20, opacity: 0.42 }),
        line(0, 0, 0, 600, { stroke: HATCH_STROKE, strokeWidth: 20, opacity: 0.42 }),
      ].join('');
    } else if (/stone|marble|terrazzo|石/.test(type)) {
      content = [
        rect(0, 0, 800, 800, { fill: info.color, opacity: 0.32 }),
        line(0, 0, 800, 800, { stroke: HATCH_STROKE, strokeWidth: 14, opacity: 0.3 }),
        line(200, 0, 800, 600, { stroke: HATCH_STROKE, strokeWidth: 14, opacity: 0.26 }),
      ].join('');
    } else if (/carpet|地毯/.test(type)) {
      content = [
        rect(0, 0, 260, 260, { fill: info.color, opacity: 0.34 }),
        rect(60, 60, 46, 46, { fill: HATCH_STROKE, opacity: 0.28 }),
        rect(170, 170, 46, 46, { fill: HATCH_STROKE, opacity: 0.28 }),
      ].join('');
    } else {
      content = rect(0, 0, 500, 500, { fill: info.color, opacity: 0.3 });
    }
    const dimension = /wood|oak|walnut/.test(type) ? '900' : /tile/.test(type) ? '600' : '800';
    patterns.push(
      `<pattern id="${attr(id)}" width="${dimension}" height="${dimension}" patternUnits="userSpaceOnUse">${content}</pattern>`,
    );
  }
  return {
    defsContent: patterns.length ? defs(patterns.join('')) : '',
    fillFor: (materialId: string) => fills.get(materialId) ?? '#F2F1EC',
    baseFor: (materialId: string) => bases.get(materialId) ?? '#F2F1EC',
  };
}

/* ------------------------------------------------------------------ */
/* Rooms                                                              */
/* ------------------------------------------------------------------ */

export function drawRooms(
  context: PlanContext,
  mode: 'furniture' | 'floor' | 'ceiling',
  hatches?: HatchResult,
  ceilingPatternId?: string,
): string {
  const content: string[] = [];
  for (const room of visibleRooms(context)) {
    const points = room.polygon.map((point) => `${num(point.x)},${num(point.y)}`).join(' ');
    let fill: string;
    let opacity = 1;
    if (mode === 'floor' && hatches) {
      fill = hatches.fillFor(room.floorMaterialId);
    } else if (mode === 'ceiling') {
      fill = room.ceiling.type === 'none' ? '#FFFFFF' : ceilingPatternId ? `url(#${ceilingPatternId})` : '#F7F6F1';
    } else {
      fill = '#EFEEE8';
      opacity = 0.9;
    }
    content.push(
      `<polygon points="${points}" fill="${attr(fill)}" opacity="${num(opacity, 2)}" stroke="#D4D7CE" stroke-width="${num(modelStroke(context.transform, 0.12), 2)}"/>`,
    );
    if (mode === 'floor' && hatches) {
      // Keep the base colour visible under translucent hatch lines.
      content.push(`<polygon points="${points}" fill="${attr(hatches.baseFor(room.floorMaterialId))}" opacity="0.12"/>`);
    }
    if (mode === 'ceiling' && room.ceiling.type === 'coffered') {
      const label = roomLabelPoint(room);
      content.push(
        rect(label.x - 700, label.y + 220, 1400, 500, {
          fill: 'none',
          stroke: '#8A928A',
          strokeWidth: modelStroke(context.transform, 0.12),
          dash: `${num(modelStroke(context.transform, 0.6), 1)} ${num(modelStroke(context.transform, 0.6), 1)}`,
        }),
      );
    }
  }
  return content.join('');
}

/** Ceiling grid pattern used by the ceiling plan. */
export function buildCeilingPattern(context: PlanContext): { defsContent: string; id: string } {
  const id = context.ids('ceiling-grid');
  const step = 600;
  const content = `<pattern id="${attr(id)}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${rect(0, 0, step, step, {
    fill: '#F7F6F1',
  })}${line(0, 0, step, 0, { stroke: '#C9CCC3', strokeWidth: 4, dash: '16 12' })}${line(0, 0, 0, step, {
    stroke: '#C9CCC3',
    strokeWidth: 4,
    dash: '16 12',
  })}</pattern>`;
  return { defsContent: defs(content), id };
}

/* ------------------------------------------------------------------ */
/* Walls                                                              */
/* ------------------------------------------------------------------ */

export function drawWalls(context: PlanContext, walls: Wall[], style: 'dark' | 'light'): string {
  const content: string[] = [];
  for (const wall of walls) {
    const points = wallRectPolygon(wall).map((point) => ({ x: point.x, y: point.y }));
    const loadBearing = wall.isLoadBearing;
    const fill =
      style === 'dark'
        ? loadBearing
          ? '#2B2F29'
          : wall.kind === 'low-wall'
            ? '#B7BDB1'
            : '#3A3F38'
        : loadBearing
          ? '#9AA198'
          : '#C4C9BE';
    const stroke = style === 'dark' ? '#23261F' : '#5C645B';
    content.push(
      polygon(points, {
        fill,
        stroke,
        strokeWidth: modelStroke(context.transform, style === 'dark' ? 0.18 : 0.12),
        dash: wall.kind === 'low-wall' ? `${num(modelStroke(context.transform, 1.2), 1)} ${num(modelStroke(context.transform, 0.8), 1)}` : undefined,
      }),
    );
  }
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* Openings                                                           */
/* ------------------------------------------------------------------ */

export function drawOpenings(context: PlanContext, walls: Wall[]): string {
  const content: string[] = [];
  const ink = '#23261F';
  const glass = '#2E6FA3';
  for (const opening of visibleOpenings(context, walls)) {
    const wall = walls.find((item) => item.id === opening.wallId);
    if (!wall) continue;
    const wallLength = lengthOf(wall.a, wall.b) || 1;
    if (wallLength < 1) continue;
    const angle = angleOf(wall.a, wall.b);
    const thickness = wall.thickness;
    const gap = Math.max(1, Math.min(opening.offset, wallLength));
    const width = Math.min(opening.width, Math.max(1, wallLength - gap));
    const strokePaper = 0.16;
    const local: string[] = [];
    // Solid gap: erase the wall poché across the opening.
    local.push(rect(gap, -thickness / 2 - 1, width, thickness + 2, { fill: '#FFFFFF' }));
    const jambStroke = modelStroke(context.transform, 0.2);
    switch (opening.kind) {
      case 'door':
      case 'arch': {
        local.push(
          line(gap, -thickness / 2, gap, thickness / 2, { stroke: ink, strokeWidth: jambStroke }),
          line(gap + width, -thickness / 2, gap + width, thickness / 2, { stroke: ink, strokeWidth: jambStroke }),
        );
        if (opening.kind === 'door') {
          const hingeAtStart = opening.swing.hinge !== 'end';
          const hinge = hingeAtStart ? gap : gap + width;
          const other = hingeAtStart ? gap + width : gap;
          const direction = opening.swing.open === 'out' ? -1 : 1;
          const leafX = hinge;
          const leafY = direction * width;
          const startAngle = Math.atan2(0, other - hinge);
          const endAngle = Math.atan2(leafY, 0);
          let delta = endAngle - startAngle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const sweep = delta > 0 ? 1 : 0;
          local.push(
            line(hinge, 0, leafX, leafY, { stroke: ink, strokeWidth: modelStroke(context.transform, 0.22) }),
            path(`M ${num(other)} 0 A ${num(width)} ${num(width)} 0 0 ${sweep} ${num(leafX)} ${num(leafY)}`, {
              stroke: ink,
              strokeWidth: modelStroke(context.transform, 0.13),
              dash: `${num(modelStroke(context.transform, 1.1), 1)} ${num(modelStroke(context.transform, 0.7), 1)}`,
            }),
          );
        } else {
          local.push(
            path(`M ${num(gap)} 0 Q ${num(gap + width / 2)} ${num(-width * 0.45)} ${num(gap + width)} 0`, {
              stroke: ink,
              strokeWidth: modelStroke(context.transform, 0.13),
              dash: `${num(modelStroke(context.transform, 1), 1)} ${num(modelStroke(context.transform, 0.7), 1)}`,
            }),
          );
        }
        break;
      }
      case 'sliding': {
        const inset = thickness * 0.22;
        local.push(
          rect(gap, -thickness / 2, width, thickness, { stroke: ink, strokeWidth: jambStroke }),
          line(gap, -inset, gap + width * 0.58, -inset, { stroke: ink, strokeWidth: modelStroke(context.transform, 0.24) }),
          line(gap + width * 0.42, inset, gap + width, inset, { stroke: ink, strokeWidth: modelStroke(context.transform, 0.24) }),
          line(gap, -thickness / 2, gap, thickness / 2, { stroke: ink, strokeWidth: jambStroke }),
          line(gap + width, -thickness / 2, gap + width, thickness / 2, { stroke: ink, strokeWidth: jambStroke }),
        );
        break;
      }
      case 'window':
      default: {
        local.push(
          rect(gap, -thickness / 2, width, thickness, { stroke: ink, strokeWidth: jambStroke }),
          line(gap, -thickness / 2, gap + width, -thickness / 2, { stroke: ink, strokeWidth: jambStroke }),
          line(gap, thickness / 2, gap + width, thickness / 2, { stroke: ink, strokeWidth: jambStroke }),
          line(gap, -thickness * 0.12, gap + width, -thickness * 0.12, { stroke: glass, strokeWidth: modelStroke(context.transform, strokePaper) }),
          line(gap, thickness * 0.12, gap + width, thickness * 0.12, { stroke: glass, strokeWidth: modelStroke(context.transform, strokePaper) }),
        );
        break;
      }
    }
    content.push(
      group(
        local.join(''),
        `translate(${num(wall.a.x)} ${num(wall.a.y)}) rotate(${num(angle)})`,
      ),
    );
  }
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* Furniture                                                          */
/* ------------------------------------------------------------------ */

function symbolPathMarkup(symbol: SymbolDef, fill: string, stroke: string, strokeWidth: number, opacity = 1): string {
  const out: string[] = [];
  for (const item of symbol.paths) {
    const resolvedFill =
      item.fill === 'body' ? fill : item.fill && item.fill !== 'none' ? item.fill : 'none';
    const resolvedStroke =
      item.stroke === 'outline' || item.stroke === undefined
        ? stroke
        : item.stroke === 'none'
          ? undefined
          : item.stroke;
    out.push(
      path(item.d, {
        fill: resolvedFill,
        stroke: resolvedStroke,
        strokeWidth: item.strokeWidth ?? strokeWidth,
        opacity: item.opacity ?? opacity,
        linejoin: 'round',
      }),
    );
  }
  return out.join('');
}

export function drawFurniture(context: PlanContext): string {
  const content: string[] = [];
  const strokeColor = '#23261F';
  for (const item of visibleFurniture(context)) {
    const symbol = resolveFurnitureSymbol(item);
    const sx = item.w / symbol.w;
    const sy = item.d / symbol.d;
    const averageScale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
    const strokeWidth = Math.max(0.35, modelStroke(context.transform, 0.18) / averageScale);
    const transform = [
      `translate(${num(item.x)} ${num(item.y)})`,
      `rotate(${num(item.rotation)})`,
      item.flipX ? 'scale(-1 1)' : '',
      `scale(${num(sx, 4)} ${num(sy, 4)})`,
      `translate(${num(-symbol.w / 2)} ${num(-symbol.d / 2)})`,
    ]
      .filter(Boolean)
      .join(' ');
    // Shared symbols already carry their own fill opacity; local ones need a tint.
    const groupOpacity = symbol.origin === 'shared' ? 1 : 0.62;
    content.push(
      group(symbolPathMarkup(symbol, item.color, strokeColor, strokeWidth, groupOpacity), transform),
    );
  }
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* MEP points                                                         */
/* ------------------------------------------------------------------ */

const MEP_GLYPH_MM = 4.4;

export function drawMep(context: PlanContext, groupName: MepGroup): string {
  const content: string[] = [];
  const devices = visibleDevices(context, groupName);
  const circuitColor = new Map(context.project.mep.circuits.map((circuit) => [circuit.id, circuit.color]));
  const baseColor = groupName === 'water' ? '#2E6FA3' : '#A96F0B';
  for (const device of devices) {
    const symbol = resolveMepSymbol(device.kind);
    const paperPoint = context.transform.toPaper(device);
    const size = MEP_GLYPH_MM;
    const sx = size / symbol.w;
    const sy = size / symbol.d;
    const color = groupName === 'electric' ? (device.circuitId ? (circuitColor.get(device.circuitId) ?? baseColor) : baseColor) : baseColor;
    const transform = [
      `translate(${num(paperPoint.x)} ${num(paperPoint.y)})`,
      `scale(${num(sx, 4)} ${num(sy, 4)})`,
      `translate(${num(-symbol.w / 2)} ${num(-symbol.d / 2)})`,
    ].join(' ');
    // Keep MEP glyph strokes at a constant paper weight (0.24mm) regardless of
    // whether the symbol came from the shared library (normalised 0..100 box)
    // or the local fallback (24 box).
    const glyphStroke = 0.24 / (size / Math.max(1, symbol.w));
    const glyph = symbol.paths
      .map((item) =>
        path(item.d, {
          fill: item.fill === 'outline' || item.fill === 'body' ? color : item.fill && item.fill !== 'none' ? item.fill : 'none',
          stroke: item.stroke === 'outline' ? color : item.stroke && item.stroke !== 'none' ? item.stroke : undefined,
          strokeWidth: glyphStroke,
          opacity: item.opacity,
          linejoin: 'round',
        }),
      )
      .join('');
    const meta = MEP_META[device.kind];
    const label = `${meta.short}${device.height ? ` H=${Math.round(device.height)}` : ''}`;
    content.push(
      `<circle cx="${num(paperPoint.x)}" cy="${num(paperPoint.y)}" r="${num(size * 0.62, 2)}" fill="#FFFFFF" fill-opacity="0.88" stroke="${attr(color)}" stroke-opacity="0.28" stroke-width="0.12"/>`,
      group(glyph, transform),
      // MEP glyphs are drawn in paper space, so the label is plain paper-mm text.
      text(paperPoint.x + size * 0.62, paperPoint.y + 0.9, label, {
        fontSize: 1.9,
        fill: '#2B2F29',
      }),
    );
  }
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* Room labels                                                        */
/* ------------------------------------------------------------------ */

export function drawRoomLabels(
  context: PlanContext,
  options: { area?: boolean; ceiling?: boolean; material?: boolean; avoidPoints?: Point[] } = {},
): string {
  const content: string[] = [];
  for (const room of visibleRooms(context)) {
    const point = roomLabelPoint(room);
    const denom = context.transform.scaleDenominator;
    // Keep the room name clear of MEP glyphs (a light is usually at the centroid).
    const collision = options.avoidPoints?.some(
      (candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < denom * 18,
    );
    const labelOffset = collision ? -denom * 14 : 0;
    content.push(
      paperText(point.x, point.y - 1.1 + labelOffset, room.name, {
        scaleDenominator: denom,
        fontSize: 3.4,
        weight: 'bold',
        anchor: 'middle',
        fill: '#23261F',
      }),
    );
    if (options.area !== false) {
      content.push(
        paperText(point.x, point.y + 2.2 + labelOffset, formatSqm(polygonAreaSqm(room.polygon)), {
          scaleDenominator: denom,
          fontSize: 2.4,
          anchor: 'middle',
          fill: '#4A5049',
        }),
      );
    }
    if (options.ceiling) {
      const ceilingLabel =
        room.ceiling.type === 'none'
          ? '无吊顶'
          : room.ceiling.type === 'coffered'
            ? `造型吊顶 H=${Math.round(room.ceiling.height)}`
            : `平顶 H=${Math.round(room.ceiling.height)}`;
      content.push(
        paperText(point.x, point.y + 5.2, ceilingLabel, {
          scaleDenominator: denom,
          fontSize: 2,
          anchor: 'middle',
          fill: '#6B7168',
        }),
      );
    }
    if (options.material) {
      content.push(
        paperText(point.x, point.y + 5.2, materialInfo(room.floorMaterialId).name, {
          scaleDenominator: denom,
          fontSize: 2,
          anchor: 'middle',
          fill: '#6B7168',
        }),
      );
    }
  }
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* Dimension chains                                                   */
/* ------------------------------------------------------------------ */

function uniqueCoordinates(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(value - last) > tolerance) out.push(value);
  }
  return out;
}

export function drawDimensions(context: PlanContext, walls: Wall[]): string {
  if (walls.length === 0) return '';
  const { modelBox } = context.transform;
  const denom = context.transform.scaleDenominator;
  const tolerance = 60;
  const ticks = Math.max(0.9, 1.1) * denom;
  const offset = 6 * denom;
  const dimStroke = modelStroke(context.transform, 0.13);
  const content: string[] = [];

  const xs = uniqueCoordinates(walls.flatMap((wall) => [wall.a.x, wall.b.x]), tolerance).filter(
    (value) => value >= modelBox.x - offset && value <= modelBox.x + modelBox.w + offset,
  );
  const ys = uniqueCoordinates(walls.flatMap((wall) => [wall.a.y, wall.b.y]), tolerance).filter(
    (value) => value >= modelBox.y - offset && value <= modelBox.y + modelBox.h + offset,
  );
  const clampSegments = <T>(
    values: T[],
    count = 16,
  ): T[] => (values.length > count ? [values[0]!, values[values.length - 1]!] : values);

  const topY = modelBox.y + offset * 0.55;
  const topXs = clampSegments(xs);
  if (topXs.length >= 2) {
    content.push(
      line(topXs[0]!, topY, topXs[topXs.length - 1]!, topY, { stroke: '#4A5049', strokeWidth: dimStroke }),
    );
    for (let index = 0; index < topXs.length; index += 1) {
      const x = topXs[index]!;
      content.push(
        line(x - ticks / 2, topY + ticks / 2, x + ticks / 2, topY - ticks / 2, {
          stroke: '#4A5049',
          strokeWidth: dimStroke,
        }),
        line(x, topY, x, modelBox.y + offset * 0.1, { stroke: '#8A928A', strokeWidth: dimStroke, dash: `${num(denom * 0.7, 1)} ${num(denom * 0.7, 1)}` }),
      );
      if (index > 0) {
        const previous = topXs[index - 1]!;
        const mid = (previous + x) / 2;
        content.push(
          paperText(mid, topY - 1.6, `${Math.round(x - previous)}`, {
            scaleDenominator: denom,
            fontSize: 2.2,
            anchor: 'middle',
            fill: '#2B2F29',
          }),
        );
      }
    }
  }

  const leftX = modelBox.x + offset * 0.55;
  const leftYs = clampSegments(ys);
  if (leftYs.length >= 2) {
    content.push(
      line(leftX, leftYs[0]!, leftX, leftYs[leftYs.length - 1]!, { stroke: '#4A5049', strokeWidth: dimStroke }),
    );
    for (let index = 0; index < leftYs.length; index += 1) {
      const y = leftYs[index]!;
      content.push(
        line(leftX - ticks / 2, y + ticks / 2, leftX + ticks / 2, y - ticks / 2, {
          stroke: '#4A5049',
          strokeWidth: dimStroke,
        }),
        line(leftX, y, modelBox.x + offset * 0.1, y, { stroke: '#8A928A', strokeWidth: dimStroke, dash: `${num(denom * 0.7, 1)} ${num(denom * 0.7, 1)}` }),
      );
      if (index > 0) {
        const previous = leftYs[index - 1]!;
        const mid = (previous + y) / 2;
        content.push(
          paperText(leftX - 1.4, mid, `${Math.round(y - previous)}`, {
            scaleDenominator: denom,
            fontSize: 2.2,
            anchor: 'middle',
            rotate: -90,
            fill: '#2B2F29',
          }),
        );
      }
    }
  }

  return content.join('');
}

/* ------------------------------------------------------------------ */
/* North arrow / scale bar / sheet chrome                             */
/* ------------------------------------------------------------------ */

export function drawNorthArrow(x: number, y: number, radius = 7): string {
  const inner = radius * 0.36;
  const tip = radius * 0.92;
  return [
    `<circle cx="${num(x)}" cy="${num(y)}" r="${num(radius)}" fill="#FFFFFF" fill-opacity="0.92" stroke="#2B2F29" stroke-width="0.28"/>`,
    path(
      `M ${num(x)} ${num(y - tip)} L ${num(x + inner)} ${num(y + tip * 0.42)} L ${num(x)} ${num(y + tip * 0.12)} L ${num(x - inner)} ${num(y + tip * 0.42)} Z`,
      { fill: '#2B2F29', stroke: '#2B2F29', strokeWidth: 0.14 },
    ),
    text(x, y - radius - 1.4, 'N', { fontSize: 3.4, weight: 'bold', anchor: 'middle', fill: '#2B2F29' }),
  ].join('');
}

export function drawScaleBar(
  x: number,
  y: number,
  scaleDenominator: number,
  segmentModelLength: number,
  paperLength: number,
): string {
  const half = paperLength / 2;
  const height = 1.5;
  return [
    rect(x, y, half, height, { fill: '#2B2F29', stroke: '#2B2F29', strokeWidth: 0.16 }),
    rect(x + half, y, half, height, { fill: '#FFFFFF', stroke: '#2B2F29', strokeWidth: 0.16 }),
    text(x, y + height + 2.2, '0', { fontSize: 2, anchor: 'middle', fill: '#2B2F29' }),
    text(x + half, y + height + 2.2, `${Math.round(segmentModelLength / 2 / 100) / 10}m`, {
      fontSize: 2,
      anchor: 'middle',
      fill: '#2B2F29',
    }),
    text(x + paperLength, y + height + 2.2, `${Math.round(segmentModelLength / 100) / 10}m`, {
      fontSize: 2,
      anchor: 'middle',
      fill: '#2B2F29',
    }),
    text(x + paperLength + 3, y + height - 0.2, `1:${Math.round(scaleDenominator)}`, {
      fontSize: 2.4,
      weight: 'bold',
      fill: '#2B2F29',
    }),
  ].join('');
}

export function drawPlanEmptyState(planRect: RectMm, message: string): string {
  const cx = planRect.x + planRect.w / 2;
  const cy = planRect.y + planRect.h / 2;
  return [
    rect(planRect.x + 6, planRect.y + 6, planRect.w - 12, planRect.h - 12, {
      fill: 'none',
      stroke: '#C3C9BF',
      strokeWidth: 0.3,
      dash: '4 3',
    }),
    text(cx, cy - 2, message, { fontSize: 4, anchor: 'middle', fill: '#6B7168' }),
    text(cx, cy + 5, '请先在 2D 画布绘制墙体，或从项目列表导入户型图。', {
      fontSize: 2.6,
      anchor: 'middle',
      fill: '#8A928A',
    }),
  ].join('');
}

export function roomFloorMaterialIds(rooms: Room[]): string[] {
  return rooms.map((room) => room.floorMaterialId);
}

export function escapeForLabel(value: string): string {
  return escapeXml(value);
}
