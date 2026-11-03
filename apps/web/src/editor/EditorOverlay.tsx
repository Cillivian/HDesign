import { memo } from 'react';
import { Group, Layer, Line, Rect, Circle, Text } from 'react-konva';
import {
  angleOf,
  bboxFromPoints,
  distance,
  polygonAreaSqm,
  type FurnitureItem,
  type Opening,
  type Point,
  type Project,
  type Room,
  type Wall,
} from '@hdesign/domain';
import type { CanvasColors } from '../design-system/theme';
import type { Selection, Viewport } from '../store/ui-store';
import { footprintCorners } from './lib/collision';
import {
  CANVAS_FONT,
  CANVAS_FONT_MONO,
  flattenPoints,
  formatAngle,
  formatLength,
  withAlpha,
} from './lib/draw';
import {
  rotateHandlePoint,
  selectionBBox,
  type HitResult,
  type SelectionHandle,
} from './lib/hit-test';
import { openingSpan } from './lib/openings';
import type { SnapGuide } from './lib/snapping';

export interface DraftPointPreview {
  points: Point[];
  preview: Point | null;
}

export interface OpeningPreview {
  wall: Wall;
  opening: Opening;
}

export const OPENING_KIND_LABELS: Record<Opening['kind'], string> = {
  door: '门',
  window: '窗',
  sliding: '推拉门',
  arch: '拱门',
};

export interface EditorOverlayProps {
  doc: Project;
  colors: CanvasColors;
  viewport: Viewport;
  zoom: number;
  selection: Selection;
  handles: SelectionHandle[];
  hover: HitResult | null;
  wallDraft: DraftPointPreview | null;
  roomDraft: Point[];
  roomPreview: Point | null;
  measureDraft: { start: Point | null; current: Point | null } | null;
  calibrationDraft: { a: Point | null; b: Point | null } | null;
  marquee: { from: Point; to: Point } | null;
  guides: SnapGuide[];
  snapMarker: Point | null;
  openingPreview: OpeningPreview | null;
  collisionItems: FurnitureItem[];
}

const px = (value: number, zoom: number) => value / Math.max(zoom, 0.001);

function Chip({
  x,
  y,
  text,
  colors,
  zoom,
  tone = 'neutral',
  mono = true,
}: {
  x: number;
  y: number;
  text: string;
  colors: CanvasColors;
  zoom: number;
  tone?: 'neutral' | 'accent' | 'warning';
  mono?: boolean;
}) {
  const fontSize = px(11, zoom);
  const paddingX = px(5, zoom);
  const paddingY = px(3, zoom);
  const width = Math.max(fontSize * 2, text.length * fontSize * 0.72) + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const stroke =
    tone === 'accent' ? colors.select : tone === 'warning' ? colors.electric : colors.major;
  const fill = tone === 'neutral' ? colors.bg : colors.bg;
  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={withAlpha(fill, 0.94)}
        stroke={stroke}
        strokeWidth={px(1, zoom)}
        cornerRadius={px(2, zoom)}
        perfectDrawEnabled={false}
      />
      <Text
        x={-width / 2}
        y={-fontSize / 2 - px(1, zoom)}
        width={width}
        align="center"
        text={text}
        fontSize={fontSize}
        fontFamily={mono ? CANVAS_FONT_MONO : CANVAS_FONT}
        fill={
          tone === 'accent' ? colors.select : tone === 'warning' ? colors.electric : colors.subtle
        }
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

function WallHighlight({
  wall,
  colors,
  zoom,
  dashed = false,
}: {
  wall: Wall;
  colors: CanvasColors;
  zoom: number;
  dashed?: boolean;
}) {
  return (
    <Group listening={false}>
      <Line
        points={flattenPoints([wall.a, wall.b])}
        stroke={colors.select}
        strokeWidth={wall.thickness + px(6, zoom)}
        opacity={0.22}
        lineCap="butt"
        perfectDrawEnabled={false}
      />
      <Line
        points={flattenPoints([wall.a, wall.b])}
        stroke={colors.select}
        strokeWidth={px(1.5, zoom)}
        dash={dashed ? [px(6, zoom), px(4, zoom)] : undefined}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

function FurnitureHighlight({
  item,
  colors,
  zoom,
  dashed = true,
  warning = false,
}: {
  item: FurnitureItem;
  colors: CanvasColors;
  zoom: number;
  dashed?: boolean;
  warning?: boolean;
}) {
  const corners = footprintCorners(item);
  return (
    <Line
      points={flattenPoints(corners)}
      closed
      stroke={warning ? colors.electric : colors.select}
      strokeWidth={px(1.5, zoom)}
      dash={dashed ? [px(6, zoom), px(4, zoom)] : undefined}
      perfectDrawEnabled={false}
    />
  );
}

function Handle({
  point,
  type,
  colors,
  zoom,
}: {
  point: Point;
  type: SelectionHandle['type'];
  colors: CanvasColors;
  zoom: number;
}) {
  const size = px(type === 'rotate' ? 10 : 8, zoom);
  return (
    <Circle
      x={point.x}
      y={point.y}
      radius={size / 2}
      fill={colors.bg}
      stroke={type === 'rotate' ? colors.electric : colors.select}
      strokeWidth={px(1.5, zoom)}
      perfectDrawEnabled={false}
    />
  );
}

function SelectedEntityOverlays({
  doc,
  selection,
  colors,
  zoom,
  handles,
}: {
  doc: Project;
  selection: Selection;
  colors: CanvasColors;
  zoom: number;
  handles: SelectionHandle[];
}) {
  const ids = new Set(selection.ids);
  switch (selection.kind) {
    case 'wall':
      return (
        <Group listening={false}>
          {doc.walls
            .filter((wall) => ids.has(wall.id))
            .map((wall) => (
              <WallHighlight key={wall.id} wall={wall} colors={colors} zoom={zoom} />
            ))}
          {handles.map((handle, index) =>
            handle.type === 'vertex' ? (
              <Handle key={index} point={handle.point} type="vertex" colors={colors} zoom={zoom} />
            ) : null,
          )}
        </Group>
      );
    case 'opening':
      return (
        <Group listening={false}>
          {doc.openings
            .filter((opening) => ids.has(opening.id))
            .map((opening) => {
              const wall = doc.walls.find((entry) => entry.id === opening.wallId);
              if (!wall) return null;
              const span = openingSpan(wall, opening);
              return (
                <Group key={opening.id} listening={false}>
                  <Line
                    points={flattenPoints([span.start, span.end])}
                    stroke={colors.select}
                    strokeWidth={wall.thickness}
                    opacity={0.3}
                    perfectDrawEnabled={false}
                  />
                  <Line
                    points={flattenPoints([span.start, span.end])}
                    stroke={colors.select}
                    strokeWidth={px(1.5, zoom)}
                    perfectDrawEnabled={false}
                  />
                </Group>
              );
            })}
        </Group>
      );
    case 'room':
      return (
        <Group listening={false}>
          {doc.rooms
            .filter((room) => ids.has(room.id))
            .map((room) => (
              <RoomOutline key={room.id} room={room} colors={colors} zoom={zoom} selected />
            ))}
        </Group>
      );
    case 'furniture':
      return (
        <Group listening={false}>
          {doc.furniture
            .filter((item) => ids.has(item.id))
            .map((item) => (
              <FurnitureHighlight key={item.id} item={item} colors={colors} zoom={zoom} />
            ))}
          {selection.ids.length === 1
            ? handles.map((handle, index) => {
                if (handle.type === 'rotate') {
                  const item = doc.furniture.find((entry) => entry.id === selection.ids[0]);
                  if (!item) return null;
                  const top = rotateHandlePoint(item, 0);
                  return (
                    <Group key={`rotate-${index}`} listening={false}>
                      <Line
                        points={flattenPoints([top, handle.point])}
                        stroke={colors.electric}
                        strokeWidth={px(1.2, zoom)}
                        dash={[px(4, zoom), px(3, zoom)]}
                        perfectDrawEnabled={false}
                      />
                      <Handle point={handle.point} type="rotate" colors={colors} zoom={zoom} />
                    </Group>
                  );
                }
                return (
                  <Handle
                    key={index}
                    point={handle.point}
                    type={handle.type}
                    colors={colors}
                    zoom={zoom}
                  />
                );
              })
            : null}
        </Group>
      );
    case 'mep':
      return (
        <Group listening={false}>
          {doc.mep.devices
            .filter((device) => ids.has(device.id))
            .map((device) => (
              <Circle
                key={device.id}
                x={device.x}
                y={device.y}
                radius={px(15, zoom)}
                stroke={colors.select}
                strokeWidth={px(1.5, zoom)}
                perfectDrawEnabled={false}
              />
            ))}
        </Group>
      );
    case 'annotation':
      return (
        <Group listening={false}>
          {doc.annotations
            .filter((annotation) => ids.has(annotation.id))
            .map((annotation) => {
              const box = bboxFromPoints(annotation.points);
              return (
                <Rect
                  key={annotation.id}
                  x={box.x - px(6, zoom)}
                  y={box.y - px(6, zoom)}
                  width={box.w + px(12, zoom)}
                  height={box.h + px(12, zoom)}
                  stroke={colors.select}
                  strokeWidth={px(1.5, zoom)}
                  dash={[px(5, zoom), px(4, zoom)]}
                  perfectDrawEnabled={false}
                />
              );
            })}
        </Group>
      );
    default:
      return null;
  }
}

function RoomOutline({
  room,
  colors,
  zoom,
  selected = false,
}: {
  room: Room;
  colors: CanvasColors;
  zoom: number;
  selected?: boolean;
}) {
  return (
    <Group listening={false}>
      {selected ? (
        <Line
          points={flattenPoints(room.polygon)}
          closed
          fill={withAlpha(colors.select, 0.06)}
          perfectDrawEnabled={false}
        />
      ) : null}
      <Line
        points={flattenPoints(room.polygon)}
        closed
        stroke={colors.select}
        strokeWidth={px(1.5, zoom)}
        dash={[px(6, zoom), px(4, zoom)]}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

function HoverHighlight({
  doc,
  hover,
  colors,
  zoom,
}: {
  doc: Project;
  hover: HitResult;
  colors: CanvasColors;
  zoom: number;
}) {
  switch (hover.kind) {
    case 'wall': {
      const wall = doc.walls.find((entry) => entry.id === hover.id);
      if (!wall) return null;
      return <WallHighlight wall={wall} colors={colors} zoom={zoom} dashed />;
    }
    case 'opening': {
      const opening = doc.openings.find((entry) => entry.id === hover.id);
      const wall = opening ? doc.walls.find((entry) => entry.id === opening.wallId) : undefined;
      if (!opening || !wall) return null;
      const span = openingSpan(wall, opening);
      return (
        <Line
          points={flattenPoints([span.start, span.end])}
          stroke={colors.water}
          strokeWidth={px(2, zoom)}
          dash={[px(4, zoom), px(3, zoom)]}
          perfectDrawEnabled={false}
        />
      );
    }
    case 'room': {
      const room = doc.rooms.find((entry) => entry.id === hover.id);
      if (!room) return null;
      return <RoomOutline room={room} colors={colors} zoom={zoom} />;
    }
    case 'furniture': {
      const item = doc.furniture.find((entry) => entry.id === hover.id);
      if (!item) return null;
      return <FurnitureHighlight item={item} colors={colors} zoom={zoom} />;
    }
    case 'mep': {
      const device = doc.mep.devices.find((entry) => entry.id === hover.id);
      if (!device) return null;
      return (
        <Circle
          x={device.x}
          y={device.y}
          radius={px(13, zoom)}
          stroke={colors.select}
          strokeWidth={px(1.5, zoom)}
          perfectDrawEnabled={false}
        />
      );
    }
    case 'annotation': {
      const annotation = doc.annotations.find((entry) => entry.id === hover.id);
      if (!annotation) return null;
      const box = bboxFromPoints(annotation.points);
      return (
        <Rect
          x={box.x - px(5, zoom)}
          y={box.y - px(5, zoom)}
          width={box.w + px(10, zoom)}
          height={box.h + px(10, zoom)}
          stroke={colors.select}
          strokeWidth={px(1, zoom)}
          perfectDrawEnabled={false}
        />
      );
    }
    default:
      return null;
  }
}

export const EditorOverlay = memo(function EditorOverlay({
  doc,
  colors,
  viewport,
  zoom,
  selection,
  handles,
  hover,
  wallDraft,
  roomDraft,
  roomPreview,
  measureDraft,
  calibrationDraft,
  marquee,
  guides,
  snapMarker,
  openingPreview,
  collisionItems,
}: EditorOverlayProps) {
  const selectionBox = selectionBBox(doc, selection);
  return (
    <Layer listening={false} perfectDrawEnabled={false}>
      <Group
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        listening={false}
      >
        {guides.map((guide, index) => (
          <Line
            key={`guide-${index}`}
            points={
              guide.orientation === 'vertical'
                ? [guide.at, guide.from, guide.at, guide.to]
                : [guide.from, guide.at, guide.to, guide.at]
            }
            stroke={colors.select}
            strokeWidth={px(1, zoom)}
            dash={[px(5, zoom), px(5, zoom)]}
            opacity={0.8}
            perfectDrawEnabled={false}
          />
        ))}

        {hover && !wallDraft && !marquee ? (
          <HoverHighlight doc={doc} hover={hover} colors={colors} zoom={zoom} />
        ) : null}

        {collisionItems.map((item) => (
          <Group key={`collision-${item.id}`} listening={false}>
            <FurnitureHighlight item={item} colors={colors} zoom={zoom} warning />
            <Chip
              x={item.x}
              y={item.y - item.d / 2 - px(16, zoom)}
              text="重叠"
              colors={colors}
              zoom={zoom}
              tone="warning"
              mono={false}
            />
          </Group>
        ))}

        <SelectedEntityOverlays
          doc={doc}
          selection={selection}
          colors={colors}
          zoom={zoom}
          handles={handles}
        />

        {selectionBox && selection.ids.length > 1 ? (
          <Rect
            x={selectionBox.x - px(6, zoom)}
            y={selectionBox.y - px(6, zoom)}
            width={selectionBox.w + px(12, zoom)}
            height={selectionBox.h + px(12, zoom)}
            stroke={colors.select}
            strokeWidth={px(1, zoom)}
            dash={[px(5, zoom), px(4, zoom)]}
            perfectDrawEnabled={false}
          />
        ) : null}

        {wallDraft ? (
          <Group listening={false}>
            {wallDraft.points.length > 0 ? (
              <Line
                points={flattenPoints(wallDraft.points)}
                stroke={colors.select}
                strokeWidth={px(2, zoom)}
                perfectDrawEnabled={false}
              />
            ) : null}
            {wallDraft.points.length > 0 && wallDraft.preview ? (
              <Line
                points={flattenPoints([
                  wallDraft.points[wallDraft.points.length - 1]!,
                  wallDraft.preview,
                ])}
                stroke={colors.select}
                strokeWidth={px(1.5, zoom)}
                dash={[px(7, zoom), px(4, zoom)]}
                perfectDrawEnabled={false}
              />
            ) : null}
            {wallDraft.points.map((point, index) => (
              <Circle
                key={`wall-draft-${index}`}
                x={point.x}
                y={point.y}
                radius={px(4, zoom)}
                fill={colors.select}
                perfectDrawEnabled={false}
              />
            ))}
            {wallDraft.points.length > 0 && wallDraft.preview ? (
              <Chip
                x={wallDraft.preview.x + px(28, zoom)}
                y={wallDraft.preview.y - px(22, zoom)}
                text={`${formatLength(
                  distance(wallDraft.points[wallDraft.points.length - 1]!, wallDraft.preview),
                )} · ${formatAngle(
                  angleOf(wallDraft.points[wallDraft.points.length - 1]!, wallDraft.preview),
                )}`}
                colors={colors}
                zoom={zoom}
                tone="accent"
              />
            ) : null}
          </Group>
        ) : null}

        {roomDraft.length > 0 ? (
          <Group listening={false}>
            <Line
              points={flattenPoints(roomPreview ? [...roomDraft, roomPreview] : roomDraft)}
              stroke={colors.select}
              strokeWidth={px(1.5, zoom)}
              dash={[px(7, zoom), px(4, zoom)]}
              closed={roomDraft.length > 2}
              fill={withAlpha(colors.select, 0.05)}
              perfectDrawEnabled={false}
            />
            {roomDraft.map((point, index) => (
              <Circle
                key={`room-draft-${index}`}
                x={point.x}
                y={point.y}
                radius={px(4, zoom)}
                fill={colors.select}
                perfectDrawEnabled={false}
              />
            ))}
            {roomDraft.length >= 3 ? (
              <Chip
                x={roomDraft[0]!.x}
                y={roomDraft[0]!.y - px(20, zoom)}
                text={`闭合 · ${polygonAreaSqm(roomDraft).toFixed(1)} ㎡`}
                colors={colors}
                zoom={zoom}
                tone="accent"
              />
            ) : null}
          </Group>
        ) : null}

        {measureDraft && measureDraft.start ? (
          <Group listening={false}>
            {measureDraft.current ? (
              <>
                <Line
                  points={flattenPoints([measureDraft.start, measureDraft.current])}
                  stroke={colors.water}
                  strokeWidth={px(1.5, zoom)}
                  dash={[px(5, zoom), px(4, zoom)]}
                  perfectDrawEnabled={false}
                />
                <Circle
                  x={measureDraft.start.x}
                  y={measureDraft.start.y}
                  radius={px(4, zoom)}
                  fill={colors.water}
                  perfectDrawEnabled={false}
                />
                <Chip
                  x={(measureDraft.start.x + measureDraft.current.x) / 2}
                  y={(measureDraft.start.y + measureDraft.current.y) / 2 - px(18, zoom)}
                  text={`${formatLength(distance(measureDraft.start, measureDraft.current))} mm`}
                  colors={colors}
                  zoom={zoom}
                  tone="accent"
                />
              </>
            ) : null}
          </Group>
        ) : null}

        {calibrationDraft && (calibrationDraft.a || calibrationDraft.b) ? (
          <Group listening={false}>
            {calibrationDraft.a ? (
              <Circle
                x={calibrationDraft.a.x}
                y={calibrationDraft.a.y}
                radius={px(5, zoom)}
                stroke={colors.electric}
                strokeWidth={px(1.5, zoom)}
                perfectDrawEnabled={false}
              />
            ) : null}
            {calibrationDraft.a && calibrationDraft.b ? (
              <>
                <Line
                  points={flattenPoints([calibrationDraft.a, calibrationDraft.b])}
                  stroke={colors.electric}
                  strokeWidth={px(2, zoom)}
                  dash={[px(6, zoom), px(4, zoom)]}
                  perfectDrawEnabled={false}
                />
                <Circle
                  x={calibrationDraft.b.x}
                  y={calibrationDraft.b.y}
                  radius={px(5, zoom)}
                  stroke={colors.electric}
                  strokeWidth={px(1.5, zoom)}
                  perfectDrawEnabled={false}
                />
              </>
            ) : null}
          </Group>
        ) : null}

        {openingPreview ? (
          <Group listening={false}>
            {(() => {
              const span = openingSpan(openingPreview.wall, openingPreview.opening);
              return (
                <>
                  <Line
                    points={flattenPoints([span.start, span.end])}
                    stroke={colors.select}
                    strokeWidth={openingPreview.wall.thickness * 0.5}
                    opacity={0.45}
                    perfectDrawEnabled={false}
                  />
                  <Chip
                    x={span.center.x}
                    y={span.center.y - openingPreview.wall.thickness / 2 - px(16, zoom)}
                    text={`${OPENING_KIND_LABELS[openingPreview.opening.kind]} ${Math.round(
                      openingPreview.opening.width,
                    )}`}
                    colors={colors}
                    zoom={zoom}
                    tone="accent"
                    mono={false}
                  />
                </>
              );
            })()}
          </Group>
        ) : null}

        {marquee ? (
          <Rect
            x={Math.min(marquee.from.x, marquee.to.x)}
            y={Math.min(marquee.from.y, marquee.to.y)}
            width={Math.abs(marquee.to.x - marquee.from.x)}
            height={Math.abs(marquee.to.y - marquee.from.y)}
            fill={withAlpha(colors.select, 0.07)}
            stroke={colors.select}
            strokeWidth={px(1, zoom)}
            dash={[px(5, zoom), px(4, zoom)]}
            perfectDrawEnabled={false}
          />
        ) : null}

        {snapMarker ? (
          <Circle
            x={snapMarker.x}
            y={snapMarker.y}
            radius={px(5, zoom)}
            stroke={colors.select}
            strokeWidth={px(1.5, zoom)}
            perfectDrawEnabled={false}
          />
        ) : null}
      </Group>
    </Layer>
  );
});
