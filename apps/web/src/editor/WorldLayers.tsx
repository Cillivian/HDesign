import { memo, useMemo } from 'react';
import { Group, Layer, Line, Rect, Shape, Text } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import {
  MEP_META,
  add,
  angleOf,
  bboxFromPoints,
  distance,
  formatSqm,
  polygonAreaSqm,
  roomLabelPoint,
  scale,
  sub,
  type Annotation,
  type FurnitureItem,
  type Layer as DocumentLayer,
  type MepDevice,
  type Opening,
  type Point,
  type Project,
  type Room,
  type Wall,
} from '@hdesign/domain';
import type { CanvasColors } from '../design-system/theme';
import type { Viewport } from '../store/ui-store';
import type { StageSize } from './hooks/useStageSize';
import { footprintCorners } from './lib/collision';
import {
  adaptiveGridStep,
  ANNOTATION_FONT_SCALE,
  CANVAS_FONT,
  CANVAS_FONT_MONO,
  flattenPoints,
  formatLength,
  withAlpha,
} from './lib/draw';
import {
  openingSpan,
  parallelOffsetSegments,
  pointAlongWall,
  swingGeometry,
  wallSegmentsWithGaps,
} from './lib/openings';
import { annotationBBox, visibleWorldRect } from './lib/transform';

export interface WorldLayersProps {
  doc: Project;
  /** Layers sorted bottom -> top. */
  orderedLayers: DocumentLayer[];
  colors: CanvasColors;
  viewport: Viewport;
  size: StageSize;
  showGrid: boolean;
  showDimensions: boolean;
  underlayImage: HTMLImageElement | null;
}

/* ------------------------------------------------------------------ */
/* Background grid                                                     */
/* ------------------------------------------------------------------ */

const GridShape = memo(function GridShape({
  rect,
  colors,
  baseStep,
  zoom,
}: {
  rect: { x: number; y: number; w: number; h: number };
  colors: CanvasColors;
  baseStep: number;
  zoom: number;
}) {
  const step = adaptiveGridStep(baseStep, zoom);
  const sceneFunc = (context: Konva.Context) => {
    const width = rect.w;
    const height = rect.h;
    const drawLines = (lineStep: number, color: string, strokeWidth: number) => {
      context.beginPath();
      const startX = Math.ceil(rect.x / lineStep) * lineStep - rect.x;
      for (let x = startX; x <= width; x += lineStep) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      const startY = Math.ceil(rect.y / lineStep) * lineStep - rect.y;
      for (let y = startY; y <= height; y += lineStep) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.setAttr('strokeStyle', color);
      context.setAttr('lineWidth', strokeWidth);
      context.stroke();
    };
    drawLines(step, colors.grid, 1 / zoom);
    const majorStep = step * Math.max(2, Math.round(1000 / step));
    drawLines(majorStep, colors.major, 1 / zoom);
  };
  return (
    <Shape
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      sceneFunc={sceneFunc}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
});

/* ------------------------------------------------------------------ */
/* Walls + openings                                                    */
/* ------------------------------------------------------------------ */

const WallShape = memo(function WallShape({
  wall,
  openings,
  colors,
}: {
  wall: Wall;
  openings: Opening[];
  colors: CanvasColors;
}) {
  const segments = wallSegmentsWithGaps(wall, openings);
  const half = wall.thickness / 2;
  const direction = {
    x: (wall.b.x - wall.a.x) / Math.max(distance(wall.a, wall.b), 1),
    y: (wall.b.y - wall.a.y) / Math.max(distance(wall.a, wall.b), 1),
  };
  const normal = { x: -direction.y, y: direction.x };
  const opacity = wall.kind === 'low-wall' ? 0.55 : 1;
  return (
    <Group listening={false} opacity={opacity}>
      {segments.map((segment, index) => (
        <Line
          key={`segment-${index}`}
          points={flattenPoints([segment.a, segment.b])}
          stroke={colors.wall}
          strokeWidth={wall.thickness}
          lineCap="butt"
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      ))}
      {openings.map((opening) => {
        const span = openingSpan(wall, opening);
        return (
          <Group key={`jamb-${opening.id}`}>
            <Line
              points={flattenPoints([
                add(span.start, scale(normal, -half)),
                add(span.start, scale(normal, half)),
              ])}
              stroke={colors.wall}
              strokeWidth={18}
              perfectDrawEnabled={false}
            />
            <Line
              points={flattenPoints([
                add(span.end, scale(normal, -half)),
                add(span.end, scale(normal, half)),
              ])}
              stroke={colors.wall}
              strokeWidth={18}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      })}
    </Group>
  );
});

function doorArcPoints(hinge: Point, radius: number, startAngle: number, sweep: number): number[] {
  const points: number[] = [];
  const steps = Math.max(8, Math.ceil(Math.abs(sweep) / 6));
  for (let index = 0; index <= steps; index += 1) {
    const angle = ((startAngle + (sweep * index) / steps) * Math.PI) / 180;
    points.push(hinge.x + Math.cos(angle) * radius, hinge.y + Math.sin(angle) * radius);
  }
  return points;
}

const OpeningShape = memo(function OpeningShape({
  wall,
  opening,
  colors,
}: {
  wall: Wall;
  opening: Opening;
  colors: CanvasColors;
}) {
  const span = openingSpan(wall, opening);
  const half = wall.thickness / 2;
  const strokeWidth = 22;

  if (opening.kind === 'door') {
    const swing = swingGeometry(wall, opening);
    let sweep = swing.endAngle - swing.startAngle;
    while (sweep > 180) sweep -= 360;
    while (sweep < -180) sweep += 360;
    return (
      <Group listening={false}>
        <Line
          points={doorArcPoints(swing.hinge, swing.radius, swing.startAngle, sweep)}
          stroke={colors.subtle}
          strokeWidth={14}
          dash={[70, 55]}
          perfectDrawEnabled={false}
        />
        <Line
          points={flattenPoints([swing.hinge, swing.openEnd])}
          stroke={colors.subtle}
          strokeWidth={strokeWidth}
          lineCap="round"
          perfectDrawEnabled={false}
        />
        <Line
          points={flattenPoints([add(swing.hinge, scale(span.normal, -half)), swing.hinge])}
          stroke={colors.subtle}
          strokeWidth={10}
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }

  if (opening.kind === 'window') {
    const bands = parallelOffsetSegments(span, [-(half - 30), half - 30]);
    return (
      <Group listening={false}>
        {bands.map((band, index) => (
          <Line
            key={index}
            points={flattenPoints([band.a, band.b])}
            stroke={colors.water}
            strokeWidth={16}
            perfectDrawEnabled={false}
          />
        ))}
        <Line
          points={flattenPoints([span.start, span.end])}
          stroke={colors.water}
          strokeWidth={10}
          dash={[60, 60]}
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }

  if (opening.kind === 'sliding') {
    const midA = pointAlongWall(wall, (span.tCenter + opening.offset / span.wallLength) / 2);
    const midB = pointAlongWall(
      wall,
      (span.tCenter + (opening.offset + opening.width) / span.wallLength) / 2,
    );
    return (
      <Group listening={false}>
        <Line
          points={flattenPoints([
            add(midA, scale(span.normal, -(half - 35))),
            add(midB, scale(span.normal, -(half - 35))),
          ])}
          stroke={colors.subtle}
          strokeWidth={20}
          perfectDrawEnabled={false}
        />
        <Line
          points={flattenPoints([
            add(midA, scale(span.normal, half - 35)),
            add(midB, scale(span.normal, half - 35)),
          ])}
          stroke={colors.subtle}
          strokeWidth={20}
          perfectDrawEnabled={false}
        />
        <Line
          points={flattenPoints([span.start, span.end])}
          stroke={colors.major}
          strokeWidth={8}
          dash={[50, 50]}
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }

  // Arch: dashed semi-circle springing from the jambs, above the wall.
  const radius = Math.max(span.length / 2, 1);
  const start = angleOf(span.center, span.start);
  const target = sub(span.center, scale(span.normal, radius));
  const targetAngle = angleOf(span.center, target);
  let sweep = targetAngle - start;
  while (sweep > 180) sweep -= 360;
  while (sweep < -180) sweep += 360;
  return (
    <Group listening={false}>
      <Line
        points={doorArcPoints(span.center, radius, start, sweep)}
        stroke={colors.subtle}
        strokeWidth={16}
        dash={[80, 50]}
        perfectDrawEnabled={false}
      />
      {[span.start, span.end].map((point, index) => (
        <Line
          key={index}
          points={flattenPoints([point, add(point, scale(span.normal, -radius))])}
          stroke={colors.major}
          strokeWidth={8}
          dash={[40, 40]}
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  );
});

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

const RoomShape = memo(function RoomShape({ room, colors }: { room: Room; colors: CanvasColors }) {
  return (
    <Line
      points={flattenPoints(room.polygon)}
      closed
      fill={withAlpha(colors.ink, 0.05)}
      stroke={colors.major}
      strokeWidth={18}
      dash={[140, 110]}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  );
});

/** Room names are hoisted above furniture so they stay legible while furnishing. */
const RoomLabel = memo(function RoomLabel({ room, colors }: { room: Room; colors: CanvasColors }) {
  const label = roomLabelPoint(room);
  const areaSqm = polygonAreaSqm(room.polygon);
  const fontSize = Math.max(150, Math.min(260, Math.sqrt(Math.max(areaSqm, 1)) * 62));
  const labelWidth = Math.max(fontSize * 2, room.name.length * fontSize * 0.8);
  return (
    <Group x={label.x} y={label.y} listening={false}>
      <Rect
        x={-labelWidth / 2 - fontSize * 0.25}
        y={-fontSize * 1.15}
        width={labelWidth + fontSize * 0.5}
        height={fontSize * 2.2}
        fill={withAlpha(colors.bg, 0.72)}
        cornerRadius={fontSize * 0.16}
        perfectDrawEnabled={false}
      />
      <Text
        x={-labelWidth / 2}
        y={-fontSize * 0.95}
        width={labelWidth}
        align="center"
        text={room.name}
        fontSize={fontSize}
        fontFamily={CANVAS_FONT}
        fill={colors.ink}
        opacity={0.88}
        perfectDrawEnabled={false}
      />
      <Text
        x={-labelWidth / 2}
        y={fontSize * 0.05}
        width={labelWidth}
        align="center"
        text={formatSqm(areaSqm)}
        fontSize={fontSize * 0.72}
        fontFamily={CANVAS_FONT_MONO}
        fill={colors.subtle}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

const FurnitureShape = memo(function FurnitureShape({
  item,
  colors,
}: {
  item: FurnitureItem;
  colors: CanvasColors;
}) {
  const labelSize = Math.max(85, Math.min(190, Math.min(item.w, item.d) * 0.2));
  return (
    <Group
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      scaleX={item.flipX ? -1 : 1}
      listening={false}
    >
      <Rect
        x={-item.w / 2}
        y={-item.d / 2}
        width={item.w}
        height={item.d}
        cornerRadius={Math.min(40, Math.min(item.w, item.d) * 0.08)}
        fill={withAlpha(item.color, 0.34)}
        stroke={colors.furniture}
        strokeWidth={12}
        perfectDrawEnabled={false}
      />
      <Text
        x={-item.w / 2}
        y={-labelSize * 0.6}
        width={item.w}
        align="center"
        text={item.name}
        fontSize={labelSize}
        fontFamily={CANVAS_FONT}
        fill={colors.subtle}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});

/* ------------------------------------------------------------------ */
/* MEP devices                                                         */
/* ------------------------------------------------------------------ */

const MepShape = memo(function MepShape({
  device,
  colors,
}: {
  device: MepDevice;
  colors: CanvasColors;
}) {
  const meta = MEP_META[device.kind];
  const isWater = meta.group === 'water';
  const color = isWater ? colors.water : colors.electric;
  const radius = 95;
  return (
    <Group x={device.x} y={device.y} listening={false}>
      <Rect
        x={-radius}
        y={-radius}
        width={radius * 2}
        height={radius * 2}
        fill={colors.bg}
        stroke={color}
        strokeWidth={20}
        cornerRadius={6}
        perfectDrawEnabled={false}
      />
      <Line
        points={[-radius * 0.45, 0, radius * 0.45, 0]}
        stroke={color}
        strokeWidth={16}
        perfectDrawEnabled={false}
      />
      <Line
        points={[0, -radius * 0.45, 0, radius * 0.45]}
        stroke={color}
        strokeWidth={16}
        perfectDrawEnabled={false}
      />
      <Text
        x={-radius * 1.6}
        y={radius + 30}
        width={radius * 3.2}
        align="center"
        text={meta.short}
        fontSize={95}
        fontFamily={CANVAS_FONT}
        fill={color}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});

/* ------------------------------------------------------------------ */
/* Annotations                                                         */
/* ------------------------------------------------------------------ */

const AnnotationShape = memo(function AnnotationShape({
  annotation,
  colors,
}: {
  annotation: Annotation;
  colors: CanvasColors;
}) {
  const { points } = annotation;
  const first = points[0]!;
  const fontSize = annotation.fontSize * ANNOTATION_FONT_SCALE;
  if (annotation.kind === 'text') {
    const estimatedWidth = Math.max(fontSize * 1.4, annotation.text.length * fontSize * 0.72);
    return (
      <Group listening={false}>
        <Rect
          x={first.x - fontSize * 0.5}
          y={first.y - fontSize * 1.1}
          width={estimatedWidth}
          height={fontSize * 2}
          fill={withAlpha(colors.bg, 0.88)}
          stroke={colors.major}
          strokeWidth={6}
          perfectDrawEnabled={false}
        />
        <Text
          x={first.x}
          y={first.y - fontSize * 0.8}
          text={annotation.text}
          fontSize={fontSize}
          fontFamily={CANVAS_FONT}
          fill={annotation.color || colors.ink}
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }
  if (annotation.kind === 'dimension') {
    const second = points[1] ?? points[0]!;
    const length = distance(first, second);
    const direction = {
      x: (second.x - first.x) / Math.max(length, 1),
      y: (second.y - first.y) / Math.max(length, 1),
    };
    const normal = { x: -direction.y, y: direction.x };
    const tick = 120;
    const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const labelPoint = add(middle, scale(normal, 190));
    const labelWidth = 560;
    const labelHeight = 190;
    const fontSize = 150;
    return (
      <Group listening={false}>
        <Line
          points={flattenPoints([first, second])}
          stroke={colors.subtle}
          strokeWidth={16}
          perfectDrawEnabled={false}
        />
        {[first, second].map((point, index) => (
          <Line
            key={index}
            points={flattenPoints([
              add(point, scale(normal, -tick)),
              add(point, scale(normal, tick)),
            ])}
            stroke={colors.subtle}
            strokeWidth={16}
            perfectDrawEnabled={false}
          />
        ))}
        <Line
          points={flattenPoints([middle, labelPoint])}
          stroke={colors.subtle}
          strokeWidth={8}
          dash={[50, 40]}
          perfectDrawEnabled={false}
        />
        <Rect
          x={labelPoint.x - labelWidth / 2}
          y={labelPoint.y - labelHeight / 2}
          width={labelWidth}
          height={labelHeight}
          fill={withAlpha(colors.bg, 0.9)}
          stroke={colors.major}
          strokeWidth={6}
          cornerRadius={8}
          perfectDrawEnabled={false}
        />
        <Text
          x={labelPoint.x - labelWidth / 2}
          y={labelPoint.y - fontSize * 0.62}
          width={labelWidth}
          align="center"
          text={annotation.text || `${formatLength(length)} mm`}
          fontSize={fontSize}
          fontFamily={CANVAS_FONT_MONO}
          fill={colors.ink}
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }
  const second = points[1] ?? points[0]!;
  return (
    <Group listening={false}>
      <Line
        points={flattenPoints([first, second])}
        stroke={colors.subtle}
        strokeWidth={10}
        perfectDrawEnabled={false}
      />
      <Text
        x={second.x + 40}
        y={second.y - 40}
        text={annotation.text}
        fontSize={fontSize}
        fontFamily={CANVAS_FONT}
        fill={annotation.color || colors.ink}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});

/* ------------------------------------------------------------------ */
/* World layer                                                         */
/* ------------------------------------------------------------------ */

function intersects(
  rect: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    box.x + box.w < rect.x ||
    rect.x + rect.w < box.x ||
    box.y + box.h < rect.y ||
    rect.y + rect.h < box.y
  );
}

export const WorldLayers = memo(function WorldLayers({
  doc,
  orderedLayers,
  colors,
  viewport,
  size,
  showGrid,
  showDimensions,
  underlayImage,
}: WorldLayersProps) {
  const visibleRect = useMemo(() => visibleWorldRect(viewport, size), [viewport, size]);

  const visibleLayerIds = useMemo(
    () => new Set(doc.layers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [doc.layers],
  );

  const openingsByWall = useMemo(() => {
    const map = new Map<string, Opening[]>();
    for (const opening of doc.openings) {
      const list = map.get(opening.wallId);
      if (list) list.push(opening);
      else map.set(opening.wallId, [opening]);
    }
    return map;
  }, [doc.openings]);

  const roomLabels = useMemo(() => {
    const labels: Room[] = [];
    for (const layer of orderedLayers) {
      if (!doc.layers.some((entry) => entry.id === layer.id && entry.visible)) continue;
      for (const room of doc.rooms) {
        if (room.layerId === layer.id) labels.push(room);
      }
    }
    return labels;
  }, [doc.layers, doc.rooms, orderedLayers]);

  const reference = doc.reference;
  const referenceLayer = doc.layers.find((layer) => layer.kind === 'reference');
  const underlayVisible =
    Boolean(reference) &&
    Boolean(underlayImage) &&
    (referenceLayer ? referenceLayer.visible : Boolean(reference?.visible)) &&
    Boolean(reference?.visible);

  return (
    <Layer listening={false} perfectDrawEnabled={false}>
      <Group
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        listening={false}
      >
        <Rect
          x={visibleRect.x}
          y={visibleRect.y}
          width={visibleRect.w}
          height={visibleRect.h}
          fill={colors.bg}
          listening={false}
          perfectDrawEnabled={false}
        />
        {showGrid ? (
          <GridShape
            rect={visibleRect}
            colors={colors}
            baseStep={doc.settings.gridSize}
            zoom={viewport.scale}
          />
        ) : null}

        {underlayVisible && reference && underlayImage ? (
          <KonvaImage
            image={underlayImage}
            x={reference.offset.x}
            y={reference.offset.y}
            width={reference.widthPx * reference.mmPerPx}
            height={reference.heightPx * reference.mmPerPx}
            rotation={reference.rotationDeg}
            opacity={reference.opacity}
            listening={false}
          />
        ) : null}

        {orderedLayers.map((layer) => {
          if (!visibleLayerIds.has(layer.id)) return null;
          const layerOpenings = doc.openings.filter(
            (opening) => opening.layerId === layer.id && isValidOpening(opening, doc.walls),
          );
          const layerWalls = doc.walls.filter(
            (wall) => wall.layerId === layer.id && intersects(visibleRect, wallBox(wall)),
          );
          const layerRooms = doc.rooms.filter(
            (room) =>
              room.layerId === layer.id && intersects(visibleRect, bboxFromPoints(room.polygon)),
          );
          const layerFurniture = doc.furniture.filter(
            (item) =>
              item.layerId === layer.id &&
              intersects(visibleRect, bboxFromPoints(footprintCorners(item))),
          );
          const layerMep = doc.mep.devices.filter(
            (device) =>
              device.layerId === layer.id &&
              intersects(visibleRect, {
                x: device.x - 140,
                y: device.y - 140,
                w: 280,
                h: 280,
              }),
          );
          const layerAnnotations = doc.annotations.filter(
            (annotation) =>
              annotation.layerId === layer.id &&
              (showDimensions || annotation.kind !== 'dimension') &&
              intersects(visibleRect, annotationBBox(annotation)),
          );
          const visibleWallIds = new Set(layerWalls.map((wall) => wall.id));

          return (
            <Group key={layer.id} opacity={layer.opacity} listening={false}>
              {layerRooms.map((room) => (
                <RoomShape key={room.id} room={room} colors={colors} />
              ))}
              {layerWalls.map((wall) => (
                <WallShape
                  key={wall.id}
                  wall={wall}
                  openings={(openingsByWall.get(wall.id) ?? []).filter(
                    (opening) => opening.layerId === layer.id,
                  )}
                  colors={colors}
                />
              ))}
              {layerOpenings
                .filter((opening) => visibleWallIds.has(opening.wallId))
                .map((opening) => {
                  const wall = doc.walls.find((entry) => entry.id === opening.wallId);
                  if (!wall) return null;
                  return (
                    <OpeningShape key={opening.id} wall={wall} opening={opening} colors={colors} />
                  );
                })}
              {layerFurniture.map((item) => (
                <FurnitureShape key={item.id} item={item} colors={colors} />
              ))}
              {layerMep.map((device) => (
                <MepShape key={device.id} device={device} colors={colors} />
              ))}
              {layerAnnotations.map((annotation) => (
                <AnnotationShape key={annotation.id} annotation={annotation} colors={colors} />
              ))}
            </Group>
          );
        })}

        {roomLabels.map((room) => (
          <RoomLabel key={`label-${room.id}`} room={room} colors={colors} />
        ))}
      </Group>
    </Layer>
  );
});

function isValidOpening(opening: Opening, walls: Wall[]): boolean {
  return walls.some((wall) => wall.id === opening.wallId);
}

function wallBox(wall: Wall) {
  const box = bboxFromPoints([wall.a, wall.b]);
  const half = wall.thickness / 2;
  return { x: box.x - half, y: box.y - half, w: box.w + half * 2, h: box.h + half * 2 };
}
