/* M0 placeholder — owned by workstream A (layer manager). */
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { Badge, IconButton } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useSortedLayers } from '../../store/selectors';
import { LAYER_KIND_LABELS } from '@hdesign/domain';
import { useUiStore } from '../../store/ui-store';

export function LayersPanel() {
  const layers = useSortedLayers();
  const updateLayer = useDocStore((state) => state.updateLayer);
  const walls = useDocStore((state) => state.doc.walls);
  const furniture = useDocStore((state) => state.doc.furniture);
  const devices = useDocStore((state) => state.doc.mep.devices);
  const pushToast = useUiStore((state) => state.pushToast);

  const countFor = (layerId: string) =>
    walls.filter((wall) => wall.layerId === layerId).length +
    furniture.filter((item) => item.layerId === layerId).length +
    devices.filter((device) => device.layerId === layerId).length;

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] text-faint">按图层控制显示与锁定</span>
        <Badge tone="outline">{layers.length} 层</Badge>
      </div>
      <ul className="space-y-1">
        {[...layers].reverse().map((layer) => {
          const count = countFor(layer.id);
          return (
            <li
              key={layer.id}
              className="flex items-center gap-1.5 rounded-[3px] border border-line bg-surface px-1.5 py-1.5"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-[1px] border border-line"
                style={{ background: layer.color ?? 'var(--bg-subtle)' }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-ink">{layer.name}</p>
                <p className="text-[9px] text-faint">
                  {LAYER_KIND_LABELS[layer.kind]} · {count}
                </p>
              </div>
              <IconButton
                label={layer.visible ? '隐藏图层' : '显示图层'}
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6"
                onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-faint" />}
              </IconButton>
              <IconButton
                label={layer.locked ? '解锁图层' : '锁定图层'}
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6"
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
              >
                {layer.locked ? <Lock size={13} className="text-electric" /> : <Unlock size={13} />}
              </IconButton>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => pushToast('图层增删、排序与透明度将在图层面板中启用', 'info')}
        className="mt-2 w-full rounded-[2px] border border-dashed border-line px-2 py-2 text-[10px] text-faint hover:border-accent/40 hover:text-muted"
      >
        + 新建图层
      </button>
    </div>
  );
}
