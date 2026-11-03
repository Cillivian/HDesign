import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { LAYER_KIND_LABELS, createLayer, type Layer } from '@hdesign/domain';
import {
  Badge,
  Button,
  Callout,
  Field,
  IconButton,
  TextField,
  Tip,
  cn,
} from '../../design-system/primitives';
import { readCanvasColors } from '../../design-system/theme';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { layerCountLabel, layerEntityCounts, maxLayerOrder } from '../../editor/lib/layers';

/**
 * Layer manager: visibility / lock / opacity / colour, inline rename, CRUD and
 * drag-reorder. Deleting a non-empty layer is blocked with an explanation
 * instead of silently orphaning geometry.
 */

const KIND_TINT: Record<Layer['kind'], string> = {
  structure: 'bg-ink/10',
  furniture: 'bg-accent-soft',
  'mep-water': 'bg-water-soft',
  'mep-electric': 'bg-electric-soft',
  annotation: 'bg-subtle',
  dimension: 'bg-subtle',
  reference: 'bg-subtle',
  custom: 'bg-subtle',
};

interface BlockedDeletion {
  layerId: string;
  message: string;
}

function SortableLayerRow({
  layer,
  counts,
  blocked,
  onRename,
  onDelete,
  defaultColor,
}: {
  layer: Layer;
  counts: ReturnType<typeof layerEntityCounts>;
  blocked: BlockedDeletion | null;
  onRename: (layer: Layer) => void;
  onDelete: (layer: Layer) => void;
  defaultColor: string;
}) {
  const updateLayer = useDocStore((state) => state.updateLayer);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: layer.id,
  });
  const countLabel = layerCountLabel(counts);
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 2 : undefined,
  } as const;

  return (
    <li ref={setNodeRef} style={style} className="relative">
      <div
        className={cn(
          'rounded-[3px] border bg-surface',
          isDragging ? 'border-accent shadow-[var(--shadow-pop)]' : 'border-line',
        )}
      >
        <div className="flex items-center gap-1 px-1.5 py-1">
          <button
            type="button"
            aria-label={`拖动排序：${layer.name}`}
            title="拖动排序"
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-faint hover:text-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={12} />
          </button>
          <input
            type="color"
            aria-label={`${layer.name} 颜色`}
            title="图层颜色"
            value={layer.color ?? defaultColor}
            onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-[1px] border border-line bg-transparent p-0"
          />
          <button
            type="button"
            onClick={() => onRename(layer)}
            onDoubleClick={() => onRename(layer)}
            title="双击重命名"
            className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-ink hover:text-accent"
          >
            {layer.name}
          </button>
          <span
            className={cn(
              'inline-flex h-[17px] shrink-0 items-center rounded-[2px] px-1 text-[9px] leading-none',
              KIND_TINT[layer.kind],
              layer.kind === 'mep-water'
                ? 'text-water'
                : layer.kind === 'mep-electric'
                  ? 'text-electric'
                  : 'text-muted',
            )}
          >
            {LAYER_KIND_LABELS[layer.kind]}
          </span>
          <IconButton
            label={layer.visible ? `隐藏图层 ${layer.name}` : `显示图层 ${layer.name}`}
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6"
            aria-pressed={layer.visible}
            onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
          >
            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-faint" />}
          </IconButton>
          <IconButton
            label={layer.locked ? `解锁图层 ${layer.name}` : `锁定图层 ${layer.name}`}
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6"
            aria-pressed={layer.locked}
            onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
          >
            {layer.locked ? (
              <Lock size={13} className="text-electric" />
            ) : (
              <LockOpen size={13} className="text-faint" />
            )}
          </IconButton>
          <IconButton
            label={`重命名图层 ${layer.name}`}
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onRename(layer)}
          >
            <Pencil size={12} />
          </IconButton>
          <IconButton
            label={`删除图层 ${layer.name}`}
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6 hover:text-danger"
            onClick={() => onDelete(layer)}
          >
            <Trash2 size={12} />
          </IconButton>
        </div>
        <div className="flex items-center gap-2 border-t border-line/70 px-2 py-1">
          <label htmlFor={`layer-opacity-${layer.id}`} className="shrink-0 text-[9px] text-faint">
            不透明度
          </label>
          <input
            id={`layer-opacity-${layer.id}`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(layer.opacity * 100)}
            onChange={(event) =>
              updateLayer(layer.id, { opacity: Number(event.target.value) / 100 })
            }
            aria-label={`${layer.name} 不透明度`}
            className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="num w-7 shrink-0 text-right text-[9px] text-faint">
            {Math.round(layer.opacity * 100)}%
          </span>
          <span
            className="min-w-0 flex-1 truncate text-right text-[9px] text-faint"
            title={countLabel}
          >
            {countLabel}
          </span>
        </div>
        {blocked ? (
          <div className="px-1.5 pb-1.5">
            <Callout tone="warning" title="无法删除该图层">
              {blocked.message}
            </Callout>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function LayersPanel() {
  const doc = useDocStore((state) => state.doc);
  const addLayer = useDocStore((state) => state.addLayer);
  const updateLayer = useDocStore((state) => state.updateLayer);
  const removeLayer = useDocStore((state) => state.removeLayer);
  const reorderLayers = useDocStore((state) => state.reorderLayers);
  const pushToast = useUiStore((state) => state.pushToast);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [blocked, setBlocked] = useState<BlockedDeletion | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visualLayers = useMemo(
    () => [...doc.layers].sort((first, second) => second.order - first.order),
    [doc.layers],
  );

  const countsByLayer = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layerEntityCounts>>();
    for (const layer of doc.layers) map.set(layer.id, layerEntityCounts(doc, layer.id));
    return map;
  }, [doc]);

  const totalEntities = useMemo(
    () => [...countsByLayer.values()].reduce((sum, counts) => sum + counts.total, 0),
    [countsByLayer],
  );

  const defaultColor = useMemo(() => readCanvasColors().ink, []);

  useEffect(() => {
    setBlocked(null);
  }, [doc.layers]);

  const startRename = (layer: Layer) => {
    setRenamingId(layer.id);
    setRenameDraft(layer.name);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const next = renameDraft.trim();
    if (next) updateLayer(renamingId, { name: next });
    setRenamingId(null);
  };

  const handleDelete = (layer: Layer) => {
    const counts = countsByLayer.get(layer.id) ?? layerEntityCounts(doc, layer.id);
    const reasons: string[] = [];
    if (counts.total > 0) {
      reasons.push(`图层内还有 ${counts.total} 个对象（${layerCountLabel(counts)}）`);
    }
    if (layer.kind === 'reference' && doc.reference) {
      reasons.push('底图仍在使用该图层');
    }
    if (layer.id === 'layer-structure' && (doc.walls.length > 0 || doc.rooms.length > 0)) {
      reasons.push('结构层承载墙体与房间');
    }
    if (reasons.length > 0) {
      const message = `${reasons.join('；')}。请先删除或移动这些对象，再删除图层。`;
      setBlocked({ layerId: layer.id, message });
      pushToast('无法删除非空图层', 'warning', message);
      return;
    }
    const removed = removeLayer(layer.id);
    if (removed) {
      pushToast(`已删除图层「${layer.name}」`, 'success');
    } else {
      setBlocked({ layerId: layer.id, message: '该图层仍被文档引用，无法删除。' });
    }
  };

  const handleAdd = () => {
    const order = maxLayerOrder(doc) + 1;
    let index = 1;
    let name = `新图层 ${index}`;
    const existing = new Set(doc.layers.map((layer) => layer.name));
    while (existing.has(name)) {
      index += 1;
      name = `新图层 ${index}`;
    }
    const layer = createLayer('custom', { name, order, visible: true, locked: false, opacity: 1 });
    addLayer(layer);
    setRenamingId(layer.id);
    setRenameDraft(name);
    pushToast(`已新建图层「${name}」`, 'success');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visualLayers.map((layer) => layer.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextVisual = arrayMove(ids, oldIndex, newIndex);
    // doc order is bottom -> top, the list is rendered top -> bottom.
    reorderLayers([...nextVisual].reverse());
  };

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] text-faint">拖动排序 · 双击重命名</span>
        <Badge tone="outline">
          {doc.layers.length} 层 · {totalEntities} 对象
        </Badge>
      </div>

      {visualLayers.length === 0 ? (
        <div className="rounded-[3px] border border-dashed border-line px-3 py-6 text-center">
          <Layers size={18} className="mx-auto mb-2 text-faint" />
          <p className="text-[11px] text-muted">还没有图层</p>
          <p className="mt-0.5 text-[10px] text-faint">新建图层后即可分组管理几何对象。</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={visualLayers.map((layer) => layer.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1" aria-label="图层列表">
              {visualLayers.map((layer) => {
                const isRenaming = renamingId === layer.id;
                const counts = countsByLayer.get(layer.id) ?? layerEntityCounts(doc, layer.id);
                if (isRenaming) {
                  return (
                    <li key={layer.id}>
                      <div className="rounded-[3px] border border-accent/50 bg-surface p-1.5">
                        <Field label="图层名称" htmlFor={`layer-rename-${layer.id}`}>
                          <TextField
                            id={`layer-rename-${layer.id}`}
                            autoFocus
                            value={renameDraft}
                            maxLength={60}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitRename();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setRenamingId(null);
                              }
                            }}
                          />
                        </Field>
                        <div className="mt-1.5 flex justify-end gap-1">
                          <Button size="xs" variant="ghost" onClick={() => setRenamingId(null)}>
                            取消
                          </Button>
                          <Button size="xs" variant="accent" onClick={commitRename}>
                            保存
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                }
                return (
                  <SortableLayerRow
                    key={layer.id}
                    layer={layer}
                    counts={counts}
                    blocked={blocked?.layerId === layer.id ? blocked : null}
                    onRename={startRename}
                    onDelete={handleDelete}
                    defaultColor={defaultColor}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Button
        block
        variant="outline"
        size="sm"
        className="mt-2 border-dashed text-muted"
        onClick={handleAdd}
      >
        <Plus size={13} /> 新建图层
      </Button>

      <div className="mt-2">
        <Tip label="隐藏图层后其对象不再渲染，也不会被点选或吸附">
          <p className="px-1 text-[9px] leading-relaxed text-faint">
            提示：隐藏图层不再渲染与吸附；锁定图层仍显示但不可编辑。
          </p>
        </Tip>
      </div>
    </div>
  );
}
