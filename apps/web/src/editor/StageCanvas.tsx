import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bboxFromPoints,
  polygonAreaSqm,
  polygonCentroid,
  wallLength,
  type Opening,
  type Point,
  type Wall,
} from '@hdesign/domain';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { readCanvasColors, type CanvasColors } from '../design-system/theme';
import { cn } from '../design-system/primitives';

/**
 * M0 lightweight SVG preview so the shell is usable before the Konva editor lands.
 * Workstream A replaces this file with the real interactive editor.
 */

function wallPoint(wall: Wall, t: number): Point {
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

function openingGeometry(wall: Wall, opening: Opening) {
  const len = wallLength(wall) || 1;
  const start = Math.max(0, opening.offset / len);
  const end = Math.min(1, (opening.offset + opening.width) / len);
  return { a: wallPoint(wall, start), b: wallPoint(wall, end), t: (start + end) / 2 };
}

function DoorSymbol({ wall, opening, colors }: { wall: Wall; opening: Opening; colors: CanvasColors }) {
  if (opening.kind === 'window') {
    const { a, b } = openingGeometry(wall, opening);
    return (
      <g stroke={colors.water} strokeWidth={18} opacity={0.9}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          strokeWidth={6}
          strokeDasharray="60 40"
          transform={`translate(${(wall.a.y - wall.b.y) / wallLength(wall) * 20}, ${(wall.b.x - wall.a.x) / wallLength(wall) * 20})`}
        />
      </g>
    );
  }
  const { a, b } = openingGeometry(wall, opening);
  const hinge = opening.swing.hinge === 'start' ? a : b;
  const end = opening.swing.hinge === 'start' ? b : a;
  const dir = Math.atan2(end.y - hinge.y, end.x - hinge.x);
  const radius = Math.hypot(end.x - hinge.x, end.y - hinge.y);
  const sign = opening.swing.open === 'in' ? 1 : -1;
  const swingEnd = {
    x: hinge.x + Math.cos(dir + (sign * Math.PI) / 2) * radius,
    y: hinge.y + Math.sin(dir + (sign * Math.PI) / 2) * radius,
  };
  return (
    <g>
      <line x1={hinge.x} y1={hinge.y} x2={end.x} y2={end.y} stroke={colors.bg} strokeWidth={wall.thickness + 30} />
      <line x1={hinge.x} y1={hinge.y} x2={swingEnd.x} y2={swingEnd.y} stroke={colors.subtle} strokeWidth={12} />
      <path
        d={`M ${end.x} ${end.y} A ${radius} ${radius} 0 0 ${sign > 0 ? 1 : 0} ${swingEnd.x} ${swingEnd.y}`}
        fill="none"
        stroke={colors.subtle}
        strokeWidth={10}
        strokeDasharray="40 30"
      />
    </g>
  );
}

export function StageCanvas() {
  const doc = useDocStore((state) => state.doc);
  const theme = useUiStore((state) => state.theme);
  const canvasStyle = useUiStore((state) => state.canvasStyle);
  // readCanvasColors depends on CSS variables, so recompute when theme/canvas change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readCanvasColors(), [theme, canvasStyle]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const bbox = useMemo(() => {
    const points: Point[] = [];
    for (const wall of doc.walls) points.push(wall.a, wall.b);
    for (const room of doc.rooms) points.push(...room.polygon);
    for (const item of doc.furniture) {
      points.push({ x: item.x - item.w / 2, y: item.y - item.d / 2 });
      points.push({ x: item.x + item.w / 2, y: item.y + item.d / 2 });
    }
    if (points.length === 0) return { x: 0, y: 0, w: 10000, h: 7000 };
    const box = bboxFromPoints(points);
    const pad = 900;
    return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  }, [doc]);

  const wallById = useMemo(() => new Map(doc.walls.map((wall) => [wall.id, wall])), [doc.walls]);
  const visibleLayers = useMemo(
    () => new Set(doc.layers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [doc.layers],
  );

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[var(--canvas-backdrop)]">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5">
        <span className="rounded-[2px] border border-line bg-surface/95 px-1.5 py-0.5 text-[10px] text-muted shadow-sm">
          2D 预览
        </span>
        <span className="rounded-[2px] border border-line bg-surface/95 px-1.5 py-0.5 text-[10px] text-faint shadow-sm">
          交互编辑器接入中
        </span>
      </div>
      <svg
        width="100%"
        height="100%"
        viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="户型平面预览"
        style={{ background: colors.bg }}
      >
        <defs>
          <pattern id="grid" width={100} height={100} patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke={colors.grid} strokeWidth={6} />
          </pattern>
          <pattern id="grid-major" width={1000} height={1000} patternUnits="userSpaceOnUse">
            <rect width={1000} height={1000} fill="url(#grid)" />
            <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke={colors.major} strokeWidth={12} />
          </pattern>
        </defs>
        <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h} fill="url(#grid-major)" opacity={0.7} />

        {doc.rooms.map((room) => {
          if (!visibleLayers.has(room.layerId)) return null;
          const centroid = polygonCentroid(room.polygon);
          const area = polygonAreaSqm(room.polygon);
          return (
            <g key={room.id}>
              <polygon
                points={room.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                fill={colors.ink}
                fillOpacity={0.035}
                stroke={colors.major}
                strokeWidth={18}
                strokeDasharray="120 80"
              />
              <text
                x={centroid.x}
                y={centroid.y - 120}
                textAnchor="middle"
                fontSize={240}
                fill={colors.ink}
                opacity={0.75}
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                {room.name}
              </text>
              <text
                x={centroid.x}
                y={centroid.y + 180}
                textAnchor="middle"
                fontSize={190}
                fill={colors.subtle}
                className="num"
              >
                {area.toFixed(1)} ㎡
              </text>
            </g>
          );
        })}

        {doc.furniture.map((item) => {
          if (!visibleLayers.has(item.layerId)) return null;
          return (
            <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
              <rect
                x={-item.w / 2}
                y={-item.d / 2}
                width={item.w}
                height={item.d}
                fill={item.color}
                fillOpacity={0.32}
                stroke={colors.furniture}
                strokeWidth={12}
                rx={40}
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(200, Math.max(120, Math.min(item.w, item.d) * 0.22))}
                fill={colors.subtle}
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                {item.name}
              </text>
            </g>
          );
        })}

        {doc.walls.map((wall) => {
          if (!visibleLayers.has(wall.layerId)) return null;
          return (
            <line
              key={wall.id}
              x1={wall.a.x}
              y1={wall.a.y}
              x2={wall.b.x}
              y2={wall.b.y}
              stroke={colors.wall}
              strokeWidth={wall.thickness}
              strokeLinecap="square"
              opacity={wall.kind === 'low-wall' ? 0.5 : 1}
            />
          );
        })}

        {doc.openings.map((opening) => {
          const wall = wallById.get(opening.wallId);
          if (!wall || !visibleLayers.has(opening.layerId)) return null;
          return <DoorSymbol key={opening.id} wall={wall} opening={opening} colors={colors} />;
        })}

        {doc.mep.devices.map((device) => {
          if (!visibleLayers.has(device.layerId)) return null;
          const isWater = device.layerId === 'layer-mep-water';
          const color = isWater ? colors.water : colors.electric;
          return (
            <g key={device.id} transform={`translate(${device.x} ${device.y})`}>
              <circle r={90} fill={colors.bg} stroke={color} strokeWidth={22} />
              <path d="M -45 0 L 45 0 M 0 -45 L 0 45" stroke={color} strokeWidth={18} />
            </g>
          );
        })}
      </svg>

      {doc.walls.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[320px] rounded-[4px] border border-line bg-surface p-5 text-center shadow-[var(--shadow-pop)]">
            <p className="text-[13px] font-medium text-ink">从一张空图纸开始</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              导入户型图识别，或用墙体工具绘制。也可以从示例项目复制一套方案。
            </p>
            <div className="mt-3 flex justify-center gap-1.5">
              <button
                type="button"
                onClick={() => useUiStore.getState().setLeftPanel('import')}
                className="h-7 rounded-[2px] bg-[var(--ink)] px-2.5 text-[11px] text-[var(--bg-surface)]"
              >
                导入图纸
              </button>
              <button
                type="button"
                onClick={() => useUiStore.getState().setTool('wall')}
                className="h-7 rounded-[2px] border border-line bg-surface px-2.5 text-[11px] text-ink hover:bg-subtle"
              >
                绘制墙体
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn('pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 text-[9px] text-[var(--canvas-subtle)]')}>
        <span className="inline-block h-[2px] w-[60px] bg-[var(--canvas-subtle)]" />
        <span className="num">1 m</span>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 text-[9px] text-[var(--canvas-subtle)]">
        {size.width > 0 ? `${Math.round(doc.walls.length)} 段墙 · ${doc.furniture.length} 件家具` : ''}
      </div>
    </div>
  );
}
