import { useMemo } from 'react';
import { bboxFromPoints, polygonAreaSqm, type Point, type Project } from '@hdesign/domain';
import { cn } from '../design-system/primitives';

const PAPER = {
  bg: '#FBFAF6',
  grid: '#ECEEE7',
  wall: '#2B2F29',
  room: '#E9ECE3',
  roomStroke: '#D5D9CE',
  furniture: '#B9AE9C',
  window: '#8FB4C4',
  ink: '#5B635C',
};

export function MiniPlan({
  project,
  showLabels = false,
  className,
}: {
  project: Project;
  showLabels?: boolean;
  className?: string;
}) {
  const geometry = useMemo(() => {
    const points: Point[] = [];
    for (const wall of project.walls) points.push(wall.a, wall.b);
    for (const room of project.rooms) points.push(...room.polygon);
    for (const item of project.furniture) {
      points.push({ x: item.x - item.w / 2, y: item.y - item.d / 2 });
      points.push({ x: item.x + item.w / 2, y: item.y + item.d / 2 });
    }
    if (points.length === 0) return null;
    const box = bboxFromPoints(points);
    const pad = 600;
    return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  }, [project]);

  const area = project.rooms.reduce((sum, room) => sum + polygonAreaSqm(room.polygon), 0);
  const wallById = useMemo(() => new Map(project.walls.map((wall) => [wall.id, wall])), [project.walls]);

  if (!geometry) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-[#FBFAF6] text-[10px] text-[#9AA098]',
          className,
        )}
      >
        {project.walls.length === 0 && project.rooms.length === 0
          ? '空白图纸'
          : `${area.toFixed(1)} ㎡`}
      </div>
    );
  }

  return (
    <svg
      viewBox={`${geometry.x} ${geometry.y} ${geometry.w} ${geometry.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('block', className)}
      role="img"
      aria-label={`${project.name} 平面预览`}
      style={{ background: PAPER.bg }}
    >
      <defs>
        <pattern id={`mp-grid-${project.id}`} width={500} height={500} patternUnits="userSpaceOnUse">
          <path d="M 500 0 L 0 0 0 500" fill="none" stroke={PAPER.grid} strokeWidth={10} />
        </pattern>
      </defs>
      <rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.w}
        height={geometry.h}
        fill={`url(#mp-grid-${project.id})`}
      />
      {project.rooms.map((room) => (
        <polygon
          key={room.id}
          points={room.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
          fill={PAPER.room}
          stroke={PAPER.roomStroke}
          strokeWidth={12}
        />
      ))}
      {project.furniture.map((item) => (
        <rect
          key={item.id}
          x={-item.w / 2}
          y={-item.d / 2}
          width={item.w}
          height={item.d}
          rx={30}
          fill={PAPER.furniture}
          opacity={0.55}
          transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
        />
      ))}
      {project.walls.map((wall) => {
        const windowOpenings = project.openings.filter(
          (opening) => opening.wallId === wall.id && opening.kind === 'window',
        );
        return (
          <g key={wall.id}>
            <line
              x1={wall.a.x}
              y1={wall.a.y}
              x2={wall.b.x}
              y2={wall.b.y}
              stroke={PAPER.wall}
              strokeWidth={wall.thickness}
              strokeLinecap="square"
            />
            {windowOpenings.map((opening) => {
              const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
              const t = (opening.offset + opening.width / 2) / len;
              const x = wall.a.x + (wall.b.x - wall.a.x) * t;
              const y = wall.a.y + (wall.b.y - wall.a.y) * t;
              const angle = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
              return (
                <g key={opening.id} transform={`translate(${x} ${y}) rotate(${angle})`}>
                  <rect
                    x={-opening.width / 2}
                    y={-wall.thickness / 2 - 10}
                    width={opening.width}
                    height={wall.thickness + 20}
                    fill={PAPER.bg}
                  />
                  <line
                    x1={-opening.width / 2}
                    y1={-wall.thickness / 2}
                    x2={opening.width / 2}
                    y2={-wall.thickness / 2}
                    stroke={PAPER.window}
                    strokeWidth={20}
                  />
                  <line
                    x1={-opening.width / 2}
                    y1={wall.thickness / 2}
                    x2={opening.width / 2}
                    y2={wall.thickness / 2}
                    stroke={PAPER.window}
                    strokeWidth={20}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
      {project.openings
        .filter((opening) => opening.kind === 'door' && wallById.has(opening.wallId))
        .map((opening) => {
          const wall = wallById.get(opening.wallId)!;
          const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
          const t = (opening.offset + opening.width / 2) / len;
          const x = wall.a.x + (wall.b.x - wall.a.x) * t;
          const y = wall.a.y + (wall.b.y - wall.a.y) * t;
          const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
          const w = opening.width;
          return (
            <g key={opening.id} transform={`translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`}>
              <rect x={-w / 2} y={-wall.thickness / 2 - 20} width={w} height={wall.thickness + 40} fill={PAPER.bg} />
              <path d={`M ${-w / 2} 0 A ${w} ${w} 0 0 1 ${w / 2} ${-w}`} fill="none" stroke={PAPER.wall} strokeWidth={14} opacity={0.45} />
            </g>
          );
        })}
      {showLabels
        ? project.rooms.map((room) => {
            const centroid = room.polygon.reduce(
              (acc, point) => ({ x: acc.x + point.x / room.polygon.length, y: acc.y + point.y / room.polygon.length }),
              { x: 0, y: 0 },
            );
            return (
              <text
                key={room.id}
                x={centroid.x}
                y={centroid.y}
                textAnchor="middle"
                fontSize={Math.max(180, geometry.w / 26)}
                fill={PAPER.ink}
              >
                {room.name}
              </text>
            );
          })
        : null}
    </svg>
  );
}
