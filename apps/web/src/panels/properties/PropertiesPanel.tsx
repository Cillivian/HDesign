import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Copy, Eye, EyeOff, Lock, MousePointer2, Sparkles, Trash2, Unlock } from 'lucide-react';
import {
  LAYER_KIND_LABELS,
  MEP_KINDS,
  MEP_META,
  ROOM_TYPE_LABELS,
  WALL_KINDS,
  defaultOpeningHeight,
  detectRoomFaces,
  formatSqm,
  isMepKind,
  isRoomType,
  polygonAreaSqm,
  wallLength,
  type Annotation,
  type FurnitureItem,
  type MepDevice,
  type Opening,
  type Project,
  type Room,
  type Wall,
} from '@hdesign/domain';
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Field,
  IconButton,
  NumberField,
  Section,
  Segmented,
  Separator,
  TextField,
  Tip,
  cn,
  inputClass,
} from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore, type Selection } from '../../store/ui-store';
import { useProjectStats, useSelectedEntities } from '../../store/selectors';
import {
  createRoomsFromFaces,
  deleteSelection,
  duplicateSelection,
  selectionLayers,
  selectionLockedLayerNames,
  selectionHasLockedLayer,
  toggleSelectionLock,
} from '../../editor/lib/commands';
import { findFurnitureCollisions } from '../../editor/lib/collision';

/* ------------------------------------------------------------------ */
/* Small commit-on-blur input helpers                                  */
/* ------------------------------------------------------------------ */

function formatNumber(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

function NumberCommit({
  label,
  hint,
  value,
  min,
  max,
  onCommit,
  unit = 'mm',
  disabled,
  id,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  unit?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(formatNumber(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <Field label={label} hint={hint ?? unit} htmlFor={id}>
      <NumberField
        id={id}
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(formatNumber(value));
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

function TextCommit({
  label,
  hint,
  value,
  onCommit,
  maxLength = 80,
  placeholder,
  id,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim() || value;
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <TextField
        id={id}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-[2px] border border-line bg-raised px-2 py-1.5">
      <span className="min-w-0">
        <span className="block text-[11px] text-ink">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[10px] leading-snug text-faint">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="num mt-0.5 text-[12px] font-medium text-ink">{value}</p>
    </div>
  );
}

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  id?: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(inputClass, 'pr-1')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded-[2px] border border-line bg-surface p-0.5"
        />
        <span className="num text-[10px] text-faint">{value.toUpperCase()}</span>
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Shared editors                                                      */
/* ------------------------------------------------------------------ */

function useExitSelection() {
  const pushToast = useUiStore((state) => state.pushToast);
  return {
    remove: () => {
      const result = deleteSelection();
      if (result.message) pushToast(result.message, 'warning');
    },
    duplicate: () => {
      const result = duplicateSelection();
      if (result.blocked > 0) pushToast('图层已锁定，无法复制', 'warning');
    },
    toggleLock: () => {
      const result = toggleSelectionLock();
      if (result.message) pushToast(result.message, 'info');
    },
  };
}

function LayerActions({ doc }: { doc: Project }) {
  const selection = useUiStore((state) => state.selection);
  const setRightPanel = useUiStore((state) => state.setRightPanel);
  const updateLayer = useDocStore((state) => state.updateLayer);
  const layers = useMemo(() => selectionLayers(doc, selection), [doc, selection]);

  return (
    <Section title="所属图层" dense>
      <div className="space-y-1">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className="flex items-center gap-1.5 rounded-[2px] border border-line bg-raised px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-ink">{layer.name}</p>
              <p className="text-[10px] text-faint">
                {LAYER_KIND_LABELS[layer.kind]} · {layer.visible ? '显示中' : '已隐藏'} ·{' '}
                {layer.locked ? '已锁定' : '可编辑'}
              </p>
            </div>
            <Tip label={layer.visible ? '隐藏图层' : '显示图层'}>
              <IconButton
                label={layer.visible ? `隐藏图层 ${layer.name}` : `显示图层 ${layer.name}`}
                size="icon-sm"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-faint" />}
              </IconButton>
            </Tip>
            <Tip label={layer.locked ? '解锁图层' : '锁定图层'}>
              <IconButton
                label={layer.locked ? `解锁图层 ${layer.name}` : `锁定图层 ${layer.name}`}
                size="icon-sm"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
              >
                {layer.locked ? (
                  <Lock size={13} className="text-electric" />
                ) : (
                  <Unlock size={13} className="text-faint" />
                )}
              </IconButton>
            </Tip>
          </div>
        ))}
      </div>
      <Button
        block
        size="xs"
        variant="outline"
        className="mt-1.5"
        onClick={() => setRightPanel('layers')}
      >
        在图层面板中管理
      </Button>
    </Section>
  );
}

function SelectionHeader({ selection, doc }: { selection: Selection; doc: Project }) {
  const { remove, duplicate } = useExitSelection();
  const lockedNames = selectionHasLockedLayer(doc, selection)
    ? selectionLockedLayerNames(doc, selection)
    : [];
  const labels: Record<string, string> = {
    wall: '墙体',
    opening: '门窗',
    room: '房间',
    furniture: '家具',
    mep: '水电点位',
    annotation: '标注',
  };
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur-[2px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-[12px] font-semibold text-ink">
            {labels[selection.kind] ?? '选中对象'}
          </h3>
          <Badge tone="accent">{selection.ids.length}</Badge>
          {selection.ids.length > 1 ? <span className="text-[10px] text-faint">多选</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tip label="复制所选 ⌘D">
            <IconButton label="复制所选" size="icon-sm" variant="ghost" onClick={duplicate}>
              <Copy size={13} />
            </IconButton>
          </Tip>
          <Tip label="删除所选 Del">
            <IconButton
              label="删除所选"
              size="icon-sm"
              variant="ghost"
              className="hover:text-danger"
              onClick={remove}
            >
              <Trash2 size={13} />
            </IconButton>
          </Tip>
        </div>
      </div>
      {lockedNames.length > 0 ? (
        <div className="mt-1.5">
          <Callout tone="warning" title="当前对象所在图层已锁定">
            图层「{lockedNames.join('、')}」已锁定，编辑无效。可在图层面板解锁后继续调整。
          </Callout>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Wall editor                                                         */
/* ------------------------------------------------------------------ */

function WallEditor({ wall }: { wall: Wall }) {
  const updateWall = useDocStore((state) => state.updateWall);
  const length = Math.round(wallLength(wall));
  const angle = Math.round((Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI);
  return (
    <Section title="墙体参数" subtitle="修改厚度与高度会立即更新图纸">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="长度" value={`${length} mm`} />
        <Stat label="角度" value={`${angle}°`} />
        <NumberCommit
          label="厚度"
          value={wall.thickness}
          min={50}
          max={400}
          onCommit={(value) => updateWall(wall.id, { thickness: value })}
        />
        <NumberCommit
          label="高度"
          value={wall.height}
          min={1000}
          max={6000}
          unit="mm"
          onCommit={(value) => updateWall(wall.id, { height: value })}
        />
      </div>
      <Field label="墙体类型" className="mt-2">
        <Segmented
          ariaLabel="墙体类型"
          value={wall.kind}
          onChange={(value) => updateWall(wall.id, { kind: value })}
          options={WALL_KINDS.map((kind) => ({
            value: kind,
            label: kind === 'wall' ? '砌体墙' : kind === 'partition' ? '轻隔墙' : '矮墙',
          }))}
        />
      </Field>
      <div className="mt-2">
        <SwitchRow
          label="承重墙"
          checked={wall.isLoadBearing}
          hint="承重墙在图纸与 BOM 中会单独标注，改造时需谨慎。"
          onChange={(checked) => updateWall(wall.id, { isLoadBearing: checked })}
        />
      </div>
    </Section>
  );
}

function WallsBatchEditor({ walls }: { walls: Wall[] }) {
  const commit = useDocStore((state) => state.commit);
  const ids = new Set(walls.map((wall) => wall.id));
  const first = walls[0]!;
  return (
    <Section title="批量墙体" subtitle={`已选 ${walls.length} 段墙体`}>
      <div className="grid grid-cols-2 gap-2">
        <NumberCommit
          label="厚度"
          value={first.thickness}
          min={50}
          max={400}
          onCommit={(value) =>
            commit((draft) => {
              for (const wall of draft.walls) if (ids.has(wall.id)) wall.thickness = value;
            })
          }
        />
        <NumberCommit
          label="高度"
          value={first.height}
          min={1000}
          max={6000}
          unit="mm"
          onCommit={(value) =>
            commit((draft) => {
              for (const wall of draft.walls) if (ids.has(wall.id)) wall.height = value;
            })
          }
        />
      </div>
      <div className="mt-2">
        <SwitchRow
          label="批量设为承重墙"
          checked={first.isLoadBearing}
          onChange={(checked) =>
            commit((draft) => {
              for (const wall of draft.walls) if (ids.has(wall.id)) wall.isLoadBearing = checked;
            })
          }
        />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Opening editor                                                      */
/* ------------------------------------------------------------------ */

function OpeningEditor({ opening, doc }: { opening: Opening; doc: Project }) {
  const updateOpening = useDocStore((state) => state.updateOpening);
  const wall = doc.walls.find((entry) => entry.id === opening.wallId);
  const maxWidth = wall ? Math.max(300, wallLength(wall) - opening.offset) : 6000;
  const maxOffset = wall ? Math.max(0, wallLength(wall) - opening.width) : 0;

  return (
    <Section title="门窗参数" subtitle="参数化开洞：沿墙体位置、宽度、高度与窗台">
      <Field label="开口类型">
        <Segmented
          ariaLabel="开口类型"
          value={opening.kind}
          onChange={(kind) => {
            const defaults = defaultOpeningHeight(kind);
            updateOpening(opening.id, { kind, height: defaults.height, sill: defaults.sill });
          }}
          options={[
            { value: 'door', label: '门' },
            { value: 'window', label: '窗' },
            { value: 'sliding', label: '推拉门' },
            { value: 'arch', label: '拱门' },
          ]}
        />
      </Field>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberCommit
          label="宽度"
          value={opening.width}
          min={300}
          max={maxWidth}
          onCommit={(value) => updateOpening(opening.id, { width: value })}
        />
        <NumberCommit
          label="洞高"
          value={opening.height}
          min={300}
          max={4000}
          onCommit={(value) => updateOpening(opening.id, { height: value })}
        />
        <NumberCommit
          label="窗台高"
          value={opening.sill}
          min={0}
          max={3000}
          onCommit={(value) => updateOpening(opening.id, { sill: value })}
        />
        <NumberCommit
          label="墙体位置"
          value={opening.offset}
          min={0}
          max={maxOffset}
          onCommit={(value) => updateOpening(opening.id, { offset: value })}
        />
      </div>
      {opening.kind === 'door' || opening.kind === 'sliding' ? (
        <div className="mt-2 space-y-1.5">
          <Field label="合页方向">
            <Segmented
              ariaLabel="合页方向"
              size="xs"
              value={opening.swing.hinge}
              onChange={(hinge) =>
                updateOpening(opening.id, { swing: { ...opening.swing, hinge } })
              }
              options={[
                { value: 'start', label: '起点侧' },
                { value: 'end', label: '终点侧' },
              ]}
            />
          </Field>
          <Field label="开启方向">
            <Segmented
              ariaLabel="开启方向"
              size="xs"
              value={opening.swing.open}
              onChange={(open) => updateOpening(opening.id, { swing: { ...opening.swing, open } })}
              options={[
                { value: 'in', label: '内开' },
                { value: 'out', label: '外开' },
              ]}
            />
          </Field>
        </div>
      ) : null}
      {wall ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="宿主墙体" value={`${Math.round(wallLength(wall))} mm`} />
          <Stat label="厚度" value={`${Math.round(wall.thickness)} mm`} />
        </div>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Room editor                                                         */
/* ------------------------------------------------------------------ */

function RoomEditor({ room, doc }: { room: Room; doc: Project }) {
  const updateRoom = useDocStore((state) => state.updateRoom);
  const commit = useDocStore((state) => state.commit);
  const area = polygonAreaSqm(room.polygon);
  const roomCount = room.polygon.length;

  const commitMaterial = (scope: 'floor' | 'wall', materialId: string) => {
    commit((draft) => {
      const target = draft.rooms.find((entry) => entry.id === room.id);
      if (!target) return;
      if (scope === 'floor') target.floorMaterialId = materialId;
      else target.wallMaterialId = materialId;
      const id = `mat-${room.id}-${scope}`;
      const existing = draft.materials.find((material) => material.id === id);
      if (existing) existing.materialId = materialId;
      else draft.materials.push({ id, roomId: room.id, scope, materialId });
    });
  };

  return (
    <Section title="房间参数" subtitle="名称会显示在平面图中央，面积自动计算">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="面积" value={formatSqm(area)} />
        <Stat label="轮廓点" value={`${roomCount} 个`} />
      </div>
      <TextCommit
        label="房间名称"
        value={room.name}
        maxLength={60}
        onCommit={(name) => updateRoom(room.id, { name })}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SelectRow
          label="房间类型"
          value={room.type}
          options={Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => ({
            value: value as Room['type'],
            label,
          }))}
          onChange={(type) => {
            if (!isRoomType(type)) return;
            updateRoom(room.id, { type, name: room.name || ROOM_TYPE_LABELS[type] });
          }}
        />
        <NumberCommit
          label="吊顶高度"
          value={room.ceiling.height}
          min={2000}
          max={6000}
          onCommit={(height) => updateRoom(room.id, { ceiling: { ...room.ceiling, height } })}
        />
      </div>
      <div className="mt-2 space-y-2">
        <TextCommit
          label="地面材质 ID"
          hint="如 floor-oak"
          value={room.floorMaterialId}
          maxLength={60}
          onCommit={(materialId) => commitMaterial('floor', materialId)}
        />
        <TextCommit
          label="墙面材质 ID"
          hint="如 wall-latex-warm"
          value={room.wallMaterialId}
          maxLength={60}
          onCommit={(materialId) => commitMaterial('wall', materialId)}
        />
      </div>
      <div className="mt-2">
        <Button
          block
          size="xs"
          variant="outline"
          onClick={() => useUiStore.getState().selectOne('room', room.id)}
          disabled={doc.rooms.length < 1}
        >
          定位到房间中心
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Furniture editor                                                    */
/* ------------------------------------------------------------------ */

function FurnitureEditor({ item, doc }: { item: FurnitureItem; doc: Project }) {
  const updateFurniture = useDocStore((state) => state.updateFurniture);
  const collisions = useMemo(
    () =>
      findFurnitureCollisions(doc.furniture).filter(
        (pair) => pair.a.id === item.id || pair.b.id === item.id,
      ),
    [doc.furniture, item.id],
  );

  return (
    <Section title="家具参数" subtitle="尺寸、位置与旋转实时生效">
      <TextCommit
        label="名称"
        value={item.name}
        maxLength={80}
        onCommit={(name) => updateFurniture(item.id, { name })}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberCommit
          label="宽 w"
          value={item.w}
          min={50}
          max={8000}
          onCommit={(w) => updateFurniture(item.id, { w })}
        />
        <NumberCommit
          label="进深 d"
          value={item.d}
          min={50}
          max={8000}
          onCommit={(d) => updateFurniture(item.id, { d })}
        />
        <NumberCommit
          label="高 h"
          value={item.h}
          min={10}
          max={4000}
          onCommit={(h) => updateFurniture(item.id, { h })}
        />
        <NumberCommit
          label="旋转"
          value={item.rotation}
          min={-360}
          max={360}
          unit="°"
          onCommit={(rotation) => updateFurniture(item.id, { rotation })}
        />
        <NumberCommit
          label="X 坐标"
          value={item.x}
          min={-1_000_000}
          max={1_000_000}
          onCommit={(x) => updateFurniture(item.id, { x })}
        />
        <NumberCommit
          label="Y 坐标"
          value={item.y}
          min={-1_000_000}
          max={1_000_000}
          onCommit={(y) => updateFurniture(item.id, { y })}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <ColorRow
          label="颜色"
          value={item.color}
          onChange={(color) => updateFurniture(item.id, { color })}
        />
        <TextCommit
          label="材质 ID"
          hint="可选"
          value={item.materialId ?? ''}
          maxLength={60}
          onCommit={(materialId) =>
            updateFurniture(item.id, { materialId: materialId || undefined })
          }
        />
      </div>
      <div className="mt-2 space-y-1.5">
        <SwitchRow
          label="锁定此家具"
          checked={item.locked}
          hint="锁定后仍可选择查看，但不会随拖动移动。"
          onChange={(locked) => updateFurniture(item.id, { locked })}
        />
        <SwitchRow
          label="水平镜像"
          checked={item.flipX}
          onChange={(flipX) => updateFurniture(item.id, { flipX })}
        />
      </div>
      {collisions.length > 0 ? (
        <div className="mt-2">
          <Callout tone="warning" title={`与 ${collisions.length} 件家具重叠`}>
            {collisions
              .map((pair) => (pair.a.id === item.id ? pair.b.name : pair.a.name))
              .slice(0, 3)
              .join('、')}
            {collisions.length > 3 ? ' 等' : ''}
            。重叠仅作提醒，可继续摆放。
          </Callout>
        </div>
      ) : null}
    </Section>
  );
}

function FurnitureBatchEditor({ items }: { items: FurnitureItem[] }) {
  const commit = useDocStore((state) => state.commit);
  const ids = new Set(items.map((item) => item.id));
  return (
    <Section title="批量家具" subtitle={`已选 ${items.length} 件家具`}>
      <NumberCommit
        label="统一旋转角度"
        value={items[0]!.rotation}
        min={-360}
        max={360}
        unit="°"
        onCommit={(rotation) =>
          commit((draft) => {
            for (const item of draft.furniture) if (ids.has(item.id)) item.rotation = rotation;
          })
        }
      />
      <div className="mt-2">
        <SwitchRow
          label="批量锁定家具"
          checked={items.every((item) => item.locked)}
          onChange={(locked) =>
            commit((draft) => {
              for (const item of draft.furniture) if (ids.has(item.id)) item.locked = locked;
            })
          }
        />
      </div>
      <div className="mt-2 space-y-1">
        {items.slice(0, 6).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-[2px] border border-line bg-raised px-2 py-1"
          >
            <span className="truncate text-[11px] text-ink">{item.name}</span>
            <span className="num text-[10px] text-faint">
              {Math.round(item.w)}×{Math.round(item.d)}
            </span>
          </div>
        ))}
        {items.length > 6 ? (
          <p className="px-1 text-[10px] text-faint">另有 {items.length - 6} 件…</p>
        ) : null}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* MEP editor                                                          */
/* ------------------------------------------------------------------ */

function MepEditor({ device, doc }: { device: MepDevice; doc: Project }) {
  const updateMepDevice = useDocStore((state) => state.updateMepDevice);
  const room = doc.rooms.find((entry) => entry.id === device.roomId);
  const wall = doc.walls.find((entry) => entry.id === device.wallId);
  const meta = MEP_META[device.kind];

  return (
    <Section title="水电点位" subtitle="点位会写入对应水位/电位图层">
      <SelectRow
        label="点位类型"
        value={device.kind}
        options={MEP_KINDS.map((kind) => ({
          value: kind,
          label: `${MEP_META[kind].label}（${MEP_META[kind].group === 'water' ? '水' : '电'}）`,
        }))}
        onChange={(kind) => {
          if (!isMepKind(kind)) return;
          updateMepDevice(device.id, {
            kind,
            height: MEP_META[kind].defaultHeight,
            waterproof: MEP_META[kind].waterproof,
            layerId: MEP_META[kind].group === 'water' ? 'layer-mep-water' : 'layer-mep-electric',
          });
        }}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberCommit
          label="安装高度"
          value={device.height}
          min={0}
          max={4000}
          onCommit={(height) => updateMepDevice(device.id, { height })}
        />
        <NumberCommit
          label="X 坐标"
          value={device.x}
          min={-1_000_000}
          max={1_000_000}
          onCommit={(x) => updateMepDevice(device.id, { x })}
        />
        <NumberCommit
          label="Y 坐标"
          value={device.y}
          min={-1_000_000}
          max={1_000_000}
          onCommit={(y) => updateMepDevice(device.id, { y })}
        />
        <Stat label="分组" value={meta.group === 'water' ? '水位图' : '电位图'} />
      </div>
      <div className="mt-2">
        <Field label="所属回路" htmlFor={`mep-circuit-${device.id}`}>
          <select
            id={`mep-circuit-${device.id}`}
            value={device.circuitId ?? ''}
            aria-label="所属回路"
            onChange={(event) =>
              updateMepDevice(device.id, { circuitId: event.target.value || undefined })
            }
            className={cn(inputClass, 'pr-1')}
          >
            <option value="">未分配回路</option>
            {doc.mep.circuits.map((circuit) => (
              <option key={circuit.id} value={circuit.id}>
                {circuit.name}（{circuit.wire} mm² / {circuit.amp}A）
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-2">
        <SwitchRow
          label="防水点位"
          checked={device.waterproof}
          onChange={(waterproof) => updateMepDevice(device.id, { waterproof })}
        />
      </div>
      <div className="mt-2">
        <TextCommit
          label="备注"
          value={device.note}
          maxLength={300}
          placeholder="如：床头左侧，距地 300"
          onCommit={(note) => updateMepDevice(device.id, { note })}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat label="所属房间" value={room?.name ?? '未关联'} />
        <Stat label="关联墙体" value={wall ? '已关联' : '未关联'} />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Annotation editor                                                   */
/* ------------------------------------------------------------------ */

function AnnotationEditor({ annotation }: { annotation: Annotation }) {
  const updateAnnotation = useDocStore((state) => state.updateAnnotation);
  return (
    <Section title="标注参数">
      <TextCommit
        label="文字内容"
        value={annotation.text}
        maxLength={400}
        onCommit={(text) => updateAnnotation(annotation.id, { text })}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberCommit
          label="字号"
          value={annotation.fontSize}
          min={8}
          max={96}
          unit="pt"
          onCommit={(fontSize) => updateAnnotation(annotation.id, { fontSize })}
        />
        <ColorRow
          label="颜色"
          value={annotation.color}
          onChange={(color) => updateAnnotation(annotation.id, { color })}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat
          label="类型"
          value={
            annotation.kind === 'text' ? '文字' : annotation.kind === 'dimension' ? '尺寸' : '引线'
          }
        />
        <Stat label="锚点" value={`${annotation.points.length} 个`} />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* No-selection overview                                               */
/* ------------------------------------------------------------------ */

function ReferenceSection({ doc }: { doc: Project }) {
  const updateReference = useDocStore((state) => state.updateReference);
  const setReference = useDocStore((state) => state.setReference);
  const pushToast = useUiStore((state) => state.pushToast);
  const setLeftPanel = useUiStore((state) => state.setLeftPanel);
  const setTool = useUiStore((state) => state.setTool);
  const reference = doc.reference;

  if (!reference) {
    return (
      <Section title="底图与校准" dense>
        <p className="rounded-[2px] border border-dashed border-line px-2 py-2 text-[10px] leading-relaxed text-faint">
          尚未导入底图。导入户型图后可叠加显示，并用「校准」工具按已知尺寸校正比例。
        </p>
        <Button
          block
          size="xs"
          variant="outline"
          className="mt-1.5"
          onClick={() => setLeftPanel('import')}
        >
          导入底图
        </Button>
      </Section>
    );
  }

  return (
    <Section title="底图与校准" dense>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="比例" value={`1 px = ${reference.mmPerPx.toFixed(2)} mm`} />
        <Stat label="状态" value={reference.calibrated ? '已校准' : '未校准'} />
      </div>
      <div className="mt-2 space-y-1.5">
        <SwitchRow
          label="显示底图"
          checked={reference.visible}
          onChange={(visible) => updateReference({ visible })}
        />
        <SwitchRow
          label="锁定底图"
          checked={reference.locked}
          onChange={(locked) => updateReference({ locked })}
        />
        <label className="flex items-center gap-2 rounded-[2px] border border-line bg-raised px-2 py-1.5">
          <span className="w-14 shrink-0 text-[11px] text-ink">不透明度</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(reference.opacity * 100)}
            aria-label="底图不透明度"
            onChange={(event) => updateReference({ opacity: Number(event.target.value) / 100 })}
            className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="num w-8 text-right text-[10px] text-faint">
            {Math.round(reference.opacity * 100)}%
          </span>
        </label>
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button block size="xs" variant="accent" onClick={() => setTool('calibrate')}>
          校准比例
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setReference(undefined);
            pushToast('已移除底图', 'info');
          }}
        >
          移除
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-faint">
        校准来源：
        {reference.calibrationSource === 'manual'
          ? '手动'
          : reference.calibrationSource === 'ocr'
            ? 'OCR'
            : reference.calibrationSource === 'ai'
              ? 'AI'
              : '默认假设'}
      </p>
    </Section>
  );
}

function NoSelectionPanel({
  doc,
  stats,
}: {
  doc: Project;
  stats: ReturnType<typeof useProjectStats>;
}) {
  const setRightPanel = useUiStore((state) => state.setRightPanel);
  const setSelection = useUiStore((state) => state.setSelection);
  const setTool = useUiStore((state) => state.setTool);
  const setLeftPanel = useUiStore((state) => state.setLeftPanel);
  const pushToast = useUiStore((state) => state.pushToast);

  const autoRooms = () => {
    if (doc.walls.length === 0) {
      pushToast('还没有墙体，先绘制闭合轮廓', 'warning');
      return;
    }
    const result = createRoomsFromFaces(detectRoomFaces(doc.walls));
    if (result.created > 0) pushToast(`已生成 ${result.created} 个房间`, 'success');
    else if (result.skipped > 0) pushToast('闭合区域都已生成房间', 'info');
    else pushToast('没有找到闭合的房间轮廓', 'warning');
  };

  return (
    <div>
      <Section title="方案概览" dense>
        <dl className="grid grid-cols-2 gap-1.5">
          {[
            ['房间', `${stats.roomCount}`],
            ['套内面积', `${stats.areaSqm.toFixed(1)} ㎡`],
            ['墙体', `${stats.wallCount}`],
            ['家具', `${stats.furnitureCount}`],
            ['水电点位', `${stats.deviceCount}`],
            ['图层', `${doc.layers.length}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
              <dt className="text-[10px] text-faint">{label}</dt>
              <dd className="num mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="快捷操作" dense>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="xs" variant="outline" disabled={doc.walls.length === 0} onClick={autoRooms}>
            <Sparkles size={12} /> 识别房间
          </Button>
          <Button size="xs" variant="outline" onClick={() => setTool('wall')}>
            绘制墙体
          </Button>
          <Button size="xs" variant="outline" onClick={() => setRightPanel('layers')}>
            图层管理
          </Button>
          <Button size="xs" variant="outline" onClick={() => setLeftPanel('assets')}>
            家具素材
          </Button>
        </div>
      </Section>

      <ReferenceSection doc={doc} />

      <Section title="房间" dense>
        {doc.rooms.length === 0 ? (
          <p className="rounded-[2px] border border-dashed border-line px-2 py-2 text-[10px] leading-relaxed text-faint">
            还没有房间。绘制闭合墙体后点击「识别房间」，即可自动铺满房间面积。
          </p>
        ) : (
          <div className="space-y-0.5">
            {doc.rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelection('room', [room.id])}
                className="flex w-full items-center justify-between gap-2 rounded-[2px] px-2 py-1 text-left text-[11px] text-muted hover:bg-subtle hover:text-ink"
              >
                <span className="truncate">{room.name}</span>
                <span className="shrink-0 text-[10px] text-faint">
                  {ROOM_TYPE_LABELS[room.type]} · {formatSqm(polygonAreaSqm(room.polygon))}
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <div className="px-3 pb-4">
        <EmptyState
          icon={<MousePointer2 size={20} />}
          title="选择一个对象"
          description="选择墙体、房间、门窗或家具后，这里会显示可调节的尺寸、材质与样式。"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function PropertiesPanel() {
  const doc = useDocStore((state) => state.doc);
  const selectionState = useUiStore((state) => state.selection);
  const selection = useSelectedEntities();
  const stats = useProjectStats();

  if (selection.total === 0) {
    return (
      <div className="pb-6">
        <NoSelectionPanel doc={doc} stats={stats} />
      </div>
    );
  }

  return (
    <div className="pb-6">
      <SelectionHeader selection={selectionState} doc={doc} />
      {selection.walls.length > 0 ? (
        selection.walls.length === 1 ? (
          <WallEditor wall={selection.walls[0]!} />
        ) : (
          <WallsBatchEditor walls={selection.walls} />
        )
      ) : null}
      {selection.openings.length > 0 ? (
        selection.openings.length === 1 ? (
          <OpeningEditor opening={selection.openings[0]!} doc={doc} />
        ) : (
          <Section title="门窗" subtitle={`已选 ${selection.openings.length} 个开口`}>
            <p className="text-[10px] text-faint">多选门窗请逐个调整参数。</p>
          </Section>
        )
      ) : null}
      {selection.rooms.length > 0 ? (
        selection.rooms.length === 1 ? (
          <RoomEditor room={selection.rooms[0]!} doc={doc} />
        ) : (
          <Section title="房间" subtitle={`已选 ${selection.rooms.length} 个房间`}>
            <p className="text-[10px] text-faint">多选房间请逐个调整名称与材质。</p>
          </Section>
        )
      ) : null}
      {selection.furniture.length > 0 ? (
        selection.furniture.length === 1 ? (
          <FurnitureEditor item={selection.furniture[0]!} doc={doc} />
        ) : (
          <FurnitureBatchEditor items={selection.furniture} />
        )
      ) : null}
      {selection.mep.length > 0 ? (
        selection.mep.length === 1 ? (
          <MepEditor device={selection.mep[0]!} doc={doc} />
        ) : (
          <Section title="水电点位" subtitle={`已选 ${selection.mep.length} 个点位`}>
            <p className="text-[10px] text-faint">多选点位请逐个调整类型与高度。</p>
          </Section>
        )
      ) : null}
      {selection.annotations.length > 0 ? (
        selection.annotations.length === 1 ? (
          <AnnotationEditor annotation={selection.annotations[0]!} />
        ) : (
          <Section title="标注" subtitle={`已选 ${selection.annotations.length} 个标注`}>
            <p className="text-[10px] text-faint">多选标注请逐个调整文字与字号。</p>
          </Section>
        )
      ) : null}

      <Separator />

      <LayerActions doc={doc} />
    </div>
  );
}
