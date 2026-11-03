import { useEffect, useRef, type ReactNode } from 'react';
import {
  Armchair,
  ArrowDownToLine,
  ArrowUpToLine,
  Columns3,
  Copy,
  Crosshair,
  DoorOpen,
  Droplet,
  Hand,
  LayoutGrid,
  Lightbulb,
  Lock,
  MousePointer2,
  Pencil,
  Power,
  Ruler,
  Sparkles,
  Square,
  Trash2,
  Type,
  Unlock,
  Waves,
  Zap,
} from 'lucide-react';
import type { OpeningKind } from '@hdesign/domain';
import { useUiStore, type ToolId } from '../store/ui-store';
import {
  Button,
  Field,
  IconButton,
  Segmented,
  Tip,
  cn,
  inputClass,
} from '../design-system/primitives';
import { OPENING_KIND_LABELS } from './EditorOverlay';

/* ------------------------------------------------------------------ */
/* Tool bar                                                            */
/* ------------------------------------------------------------------ */

interface ToolDefinition {
  id: ToolId;
  label: string;
  shortcut?: string;
  icon: typeof MousePointer2;
}

const TOOL_GROUPS: ToolDefinition[][] = [
  [
    { id: 'select', label: '选择', shortcut: 'V', icon: MousePointer2 },
    { id: 'pan', label: '平移', shortcut: 'H', icon: Hand },
  ],
  [
    { id: 'wall', label: '墙体', shortcut: 'W', icon: Pencil },
    { id: 'door', label: '门', shortcut: 'D', icon: DoorOpen },
    { id: 'window', label: '窗', shortcut: 'N', icon: Square },
    { id: 'sliding', label: '推拉门', shortcut: 'S', icon: Columns3 },
  ],
  [
    { id: 'room', label: '房间', shortcut: 'R', icon: LayoutGrid },
    { id: 'furniture', label: '家具', shortcut: 'F', icon: Armchair },
    { id: 'measure', label: '测量', shortcut: 'M', icon: Ruler },
    { id: 'text', label: '文字', shortcut: 'T', icon: Type },
    { id: 'calibrate', label: '校准', shortcut: 'C', icon: Crosshair },
  ],
  [
    { id: 'mep-socket', label: '插座', icon: Zap },
    { id: 'mep-switch', label: '开关', icon: Power },
    { id: 'mep-light', label: '灯位', icon: Lightbulb },
    { id: 'mep-water', label: '给水', icon: Droplet },
    { id: 'mep-drain', label: '排水', icon: Waves },
  ],
];

export function EditorToolbar({
  tool,
  openingKind,
  roomMode,
  pendingFurnitureLabel,
  onClearPendingFurniture,
  onOpeningKindChange,
  onRoomModeChange,
  onAutoRooms,
  autoRoomsDisabled,
}: {
  tool: ToolId;
  openingKind: OpeningKind;
  roomMode: 'auto' | 'draw';
  pendingFurnitureLabel?: string | null;
  onClearPendingFurniture?: () => void;
  onOpeningKindChange: (kind: OpeningKind) => void;
  onRoomModeChange: (mode: 'auto' | 'draw') => void;
  onAutoRooms: () => void;
  autoRoomsDisabled: boolean;
}) {
  const setTool = useUiStore((state) => state.setTool);
  const showOpeningPicker = tool === 'door' || tool === 'window' || tool === 'sliding';

  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex flex-col items-start gap-1">
      <div
        role="toolbar"
        aria-label="绘图工具"
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
        className="pointer-events-auto flex max-w-[calc(100vw-88px)] items-center gap-0.5 overflow-x-auto rounded-[3px] border border-line bg-surface/95 p-1 shadow-sm backdrop-blur-[2px]"
      >
        {TOOL_GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} className="flex items-center">
            {groupIndex > 0 ? <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" /> : null}
            {group.map((definition) => {
              const Icon = definition.icon;
              const active = tool === definition.id;
              return (
                <Tip
                  key={definition.id}
                  label={
                    definition.shortcut
                      ? `${definition.label} (${definition.shortcut})`
                      : definition.label
                  }
                >
                  <IconButton
                    label={definition.label}
                    size="icon-sm"
                    variant={active ? 'soft' : 'ghost'}
                    active={active}
                    aria-pressed={active}
                    onClick={() => setTool(definition.id)}
                  >
                    <Icon size={15} />
                  </IconButton>
                </Tip>
              );
            })}
          </div>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <Tip label="从闭合墙体自动识别全部房间">
          <Button
            size="xs"
            variant="outline"
            className="h-7 gap-1 px-1.5"
            onClick={onAutoRooms}
            disabled={autoRoomsDisabled}
          >
            <Sparkles size={13} />
            识别房间
          </Button>
        </Tip>
      </div>

      {pendingFurnitureLabel ? (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-[3px] border border-accent/40 bg-accent-soft px-2 py-1 text-[10px] text-accent shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <Armchair size={12} />
          <span>待放置：{pendingFurnitureLabel}</span>
          <span className="text-accent/70">点击画布放置一件</span>
          <button
            type="button"
            aria-label="取消放置家具"
            className="ml-1 text-[10px] text-accent/80 hover:text-accent"
            onClick={onClearPendingFurniture}
          >
            取消
          </button>
        </div>
      ) : null}

      {showOpeningPicker ? (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-[3px] border border-line bg-surface/95 px-2 py-1 shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <span className="text-[10px] text-faint">开口类型</span>
          <Segmented<OpeningKind>
            ariaLabel="开口类型"
            size="xs"
            value={openingKind}
            onChange={onOpeningKindChange}
            options={[
              { value: 'door', label: OPENING_KIND_LABELS.door },
              { value: 'window', label: OPENING_KIND_LABELS.window },
              { value: 'sliding', label: OPENING_KIND_LABELS.sliding },
              { value: 'arch', label: OPENING_KIND_LABELS.arch },
            ]}
          />
          <span className="text-[10px] text-faint">点击墙体放置</span>
        </div>
      ) : null}

      {tool === 'room' ? (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-[3px] border border-line bg-surface/95 px-2 py-1 shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <span className="text-[10px] text-faint">房间生成</span>
          <Segmented<'auto' | 'draw'>
            ariaLabel="房间生成方式"
            size="xs"
            value={roomMode}
            onChange={onRoomModeChange}
            options={[
              { value: 'auto', label: '自动识别' },
              { value: 'draw', label: '手绘轮廓' },
            ]}
          />
          <span className="text-[10px] text-faint">
            {roomMode === 'auto' ? '点击闭合区域内部' : '逐点点击，点回起点闭合'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool hints / scale / collision                                      */
/* ------------------------------------------------------------------ */

const TOOL_HINTS: Record<ToolId, string> = {
  select: '点击选择 · Shift 多选 · 拖动移动 · 空格或中键平移 · 滚轮缩放 · 框选批量选择',
  pan: '拖动平移画布 · 滚轮缩放 · 双击适应窗口',
  wall: '点击起点并连续绘制 · 15° 正交吸附 · Enter/右键/双击结束 · 点回起点闭合',
  door: '移动到墙体上点击放置门 · 顶部可切换开口类型',
  window: '移动到墙体上点击放置窗 · 顶部可切换开口类型',
  sliding: '移动到墙体上点击放置推拉门 · 顶部可切换开口类型',
  room: '自动识别：点击闭合区域内部 · 手绘轮廓：逐点绘制后闭合',
  furniture: '点击放置家具 · 选中后拖动、旋转手柄或角点缩放 · 右侧可调整尺寸',
  measure: '点击两点测量距离，自动生成尺寸标注',
  text: '点击画布输入文字标注 · Enter 确认 · Esc 取消',
  calibrate: '在底图上点击两点已知长度的线段，再输入真实长度完成校准',
  'mep-socket': '点击放置插座 · 靠近墙体时自动吸附到墙上',
  'mep-switch': '点击放置开关 · 靠近墙体时自动吸附到墙上',
  'mep-light': '点击放置灯位',
  'mep-water': '点击放置给水点位',
  'mep-drain': '点击放置排水点位',
};

export function EditorHintBar({
  tool,
  cursor,
  zoom,
  layerCount,
}: {
  tool: ToolId;
  cursor: { x: number; y: number } | null;
  zoom: number;
  layerCount: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex items-end justify-between gap-3">
      <div className="max-w-[62%] rounded-[2px] border border-line bg-surface/90 px-2 py-1 text-[10px] leading-relaxed text-muted shadow-sm">
        {TOOL_HINTS[tool]}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="num rounded-[2px] border border-line bg-surface/90 px-1.5 py-0.5 text-[10px] text-faint shadow-sm">
          {cursor ? `X ${Math.round(cursor.x)} · Y ${Math.round(cursor.y)} mm` : '—'}
        </span>
        <span className="num rounded-[2px] border border-line bg-surface/90 px-1.5 py-0.5 text-[10px] text-faint shadow-sm">
          {Math.round(zoom * 100)}% · {layerCount} 层
        </span>
      </div>
    </div>
  );
}

export function ScaleBar({ zoom }: { zoom: number }) {
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000];
  const targetPx = 64;
  const meters = candidates.reduce(
    (best, candidate) =>
      Math.abs(candidate * zoom - targetPx) < Math.abs(best * zoom - targetPx) ? candidate : best,
    1000,
  );
  return (
    <div className="pointer-events-none absolute bottom-9 left-3 z-10 flex items-center gap-1.5 text-[9px] text-[var(--canvas-subtle)]">
      <span
        className="inline-block h-[3px] bg-[var(--canvas-subtle)]"
        style={{ width: Math.max(18, meters * zoom) }}
      />
      <span className="num">{meters >= 1000 ? `${meters / 1000} m` : `${meters} mm`}</span>
    </div>
  );
}

export function CollisionBar({ summary, onDismiss }: { summary: string; onDismiss: () => void }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-11 z-20 flex justify-center"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-[3px] border border-electric/40 bg-electric-soft px-2.5 py-1.5 text-[11px] text-electric shadow-sm">
        <Waves size={13} />
        <span>{summary}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="关闭重叠提醒"
          className="text-[10px] text-electric/80 hover:text-electric"
        >
          忽略
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty plan                                                          */
/* ------------------------------------------------------------------ */

export function EmptyPlanOverlay({
  onImport,
  onDrawWalls,
  onAutoRooms,
  hasWalls,
}: {
  onImport: () => void;
  onDrawWalls: () => void;
  onAutoRooms: () => void;
  hasWalls: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className="pointer-events-auto w-[320px] rounded-[4px] border border-line bg-surface p-5 text-center shadow-[var(--shadow-pop)]"
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <p className="text-[13px] font-medium text-ink">从一张空图纸开始</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          导入户型图并识别尺寸，或用墙体工具绘制闭合轮廓，再一键生成房间。
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <Button size="sm" variant="primary" onClick={onImport}>
            导入图纸
          </Button>
          <Button size="sm" variant="outline" onClick={onDrawWalls}>
            绘制墙体
          </Button>
          <Button size="sm" variant="outline" onClick={onAutoRooms} disabled={!hasWalls}>
            识别房间
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calibration card                                                    */
/* ------------------------------------------------------------------ */

export function CalibrationCard({
  defaultMm,
  pixelLength,
  onConfirm,
  onCancel,
}: {
  defaultMm: number;
  pixelLength: number;
  onConfirm: (knownMm: number) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const commit = () => {
    const value = Number(inputRef.current?.value);
    if (Number.isFinite(value) && value > 0) onConfirm(value);
  };
  return (
    <div
      className="pointer-events-auto absolute bottom-12 left-1/2 z-30 w-[280px] -translate-x-1/2 rounded-[4px] border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <p className="text-[12px] font-medium text-ink">校准底图比例</p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted">
        已选 {Math.round(pixelLength)} px 线段，请输入它的真实长度（毫米）。
      </p>
      <Field label="真实长度" hint="mm" className="mt-2">
        <input
          ref={inputRef}
          inputMode="decimal"
          defaultValue={Math.round(defaultMm)}
          aria-label="已知真实长度（毫米）"
          className={cn(inputClass, 'num text-right')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
        />
      </Field>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button size="xs" variant="accent" onClick={commit}>
          应用校准
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline text annotation input                                        */
/* ------------------------------------------------------------------ */

export function TextAnnotationInput({
  x,
  y,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div
      className="pointer-events-auto absolute z-30 w-[220px] rounded-[3px] border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
      style={{ left: Math.max(8, x), top: Math.max(8, y - 34) }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (value.trim()) onCommit();
          else onCancel();
        }}
        placeholder="输入文字标注，Enter 确认"
        aria-label="文字标注内容"
        className="h-7 w-full rounded-[2px] border border-line bg-surface px-2 text-xs text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Context menu                                                        */
/* ------------------------------------------------------------------ */

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export function EditorContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="画布操作"
      tabIndex={-1}
      className="absolute z-40 min-w-[164px] rounded-[3px] border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded-[2px] px-2 text-left text-[11px] disabled:pointer-events-none disabled:opacity-40',
            item.danger
              ? 'text-danger hover:bg-danger-soft'
              : 'text-muted hover:bg-subtle hover:text-ink',
          )}
        >
          <span className="flex h-3.5 w-3.5 items-center justify-center text-faint">
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {item.shortcut ? (
            <span className="num text-[9px] text-faint">{item.shortcut}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icon re-exports used by the editor orchestrator                     */
/* ------------------------------------------------------------------ */

export const CONTEXT_ICONS = { Copy, Trash2, Lock, Unlock, ArrowUpToLine, ArrowDownToLine };
