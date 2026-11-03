import { useRef, type MouseEvent } from 'react';
import type { ParseDraft } from '@hdesign/plan-recognition';
import type { Point } from '@hdesign/domain';
import { cn } from '../design-system/primitives';
import { type EditableWall, type LayerToggles } from './types';

export interface RecognitionOverlayProps {
  dataUrl: string;
  width: number;
  height: number;
  walls: EditableWall[];
  draft: ParseDraft;
  layers: LayerToggles;
  calibrating: boolean;
  calibrationPoints: Point[];
  highlightWallId?: string | null;
  mmPerPx: number;
  onImageClick?: (point: Point) => void;
  className?: string;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.72) return 'var(--ok)';
  if (confidence >= 0.5) return 'var(--electric)';
  return 'var(--danger)';
}

/**
 * Source drawing + recognition overlay (walls/rooms/openings/labels).
 * Two-point calibration clicks are reported in source-raster pixel coordinates.
 */
export function RecognitionOverlay({
  dataUrl,
  width,
  height,
  walls,
  draft,
  layers,
  calibrating,
  calibrationPoints,
  highlightWallId,
  mmPerPx,
  onImageClick,
  className,
}: RecognitionOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!calibrating || !onImageClick) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
    onImageClick(point);
  };

  const fontSize = Math.max(15, Math.round(width / 55));
  const wallStroke = (wall: EditableWall) => Math.max(2, wall.thicknessPx);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="识别结果叠加预览"
      onClick={handleClick}
      className={cn(
        'relative w-full overflow-hidden rounded-[2px] border border-line bg-[#fbfaf6]',
        calibrating && 'cursor-crosshair ring-1 ring-accent/50',
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img
        src={dataUrl}
        alt=""
        className="absolute inset-0 h-full w-full select-none"
        draggable={false}
      />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {layers.rooms
          ? draft.rooms.map((room, index) => (
              <polygon
                key={`room-${index}`}
                points={room.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="var(--accent)"
                fillOpacity={0.07}
                stroke="var(--border-strong)"
                strokeWidth={Math.max(1, width / 500)}
                strokeDasharray={`${Math.max(4, width / 160)} ${Math.max(3, width / 240)}`}
              />
            ))
          : null}

        {layers.walls
          ? walls.map((wall) => {
              const highlighted = highlightWallId === wall.id;
              return (
                <line
                  key={wall.id}
                  x1={wall.a.x}
                  y1={wall.a.y}
                  x2={wall.b.x}
                  y2={wall.b.y}
                  stroke={highlighted ? 'var(--accent)' : confidenceColor(wall.confidence)}
                  strokeWidth={highlighted ? wallStroke(wall) + 3 : wallStroke(wall)}
                  strokeLinecap="square"
                  opacity={0.92}
                />
              );
            })
          : null}

        {layers.openings
          ? draft.openings.map((opening, index) => {
              const horizontalSize = Math.max(3, width / 200);
              return (
                <g key={`opening-${index}`}>
                  <circle
                    cx={opening.center.x}
                    cy={opening.center.y}
                    r={horizontalSize * 1.6}
                    fill={opening.kind === 'window' ? 'var(--water)' : 'var(--accent)'}
                    fillOpacity={0.85}
                    stroke="var(--bg-surface)"
                    strokeWidth={Math.max(1, width / 900)}
                  />
                </g>
              );
            })
          : null}

        {layers.labels
          ? draft.labels.map((label, index) => (
              <text
                key={`label-${index}`}
                x={label.at.x}
                y={label.at.y}
                fontSize={fontSize}
                textAnchor="middle"
                fill="var(--ink-muted)"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                {label.text}
              </text>
            ))
          : null}

        {calibrationPoints.length > 0 ? (
          <g>
            {calibrationPoints.length === 2 ? (
              <line
                x1={calibrationPoints[0]!.x}
                y1={calibrationPoints[0]!.y}
                x2={calibrationPoints[1]!.x}
                y2={calibrationPoints[1]!.y}
                stroke="var(--accent)"
                strokeWidth={Math.max(2, width / 400)}
                strokeDasharray={`${Math.max(6, width / 120)} ${Math.max(4, width / 200)}`}
              />
            ) : null}
            {calibrationPoints.map((point, index) => (
              <g key={`calibration-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={Math.max(4, width / 120)}
                  fill="var(--accent)"
                  stroke="var(--bg-surface)"
                  strokeWidth={Math.max(1, width / 600)}
                />
              </g>
            ))}
          </g>
        ) : null}
      </svg>

      {calibrating ? (
        <div className="pointer-events-none absolute left-1 top-1 rounded-[2px] bg-surface/95 px-1.5 py-0.5 text-[10px] text-accent shadow-sm">
          在图上点击两点（当前 {calibrationPoints.length}/2）
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-1 right-1 rounded-[2px] bg-surface/90 px-1.5 py-0.5 text-[9px] text-faint">
        <span className="num">{mmPerPx.toFixed(2)}</span> mm/px
      </div>
    </div>
  );
}
