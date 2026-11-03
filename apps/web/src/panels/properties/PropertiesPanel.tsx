/* M0 placeholder — owned by workstream A (property inspector). */
import { MousePointer2 } from 'lucide-react';
import { Badge, Button, EmptyState, Section } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { useProjectStats, useSelectedEntities } from '../../store/selectors';
import { MEP_META, ROOM_TYPE_LABELS } from '@hdesign/domain';

export function PropertiesPanel() {
  const selection = useSelectedEntities();
  const stats = useProjectStats();
  const rooms = useDocStore((state) => state.doc.rooms);
  const setSelection = useUiStore((state) => state.setSelection);
  const pushToast = useUiStore((state) => state.pushToast);

  if (selection.total === 0) {
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
              ['图层', `${useDocStore.getState().doc.layers.length}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
                <dt className="text-[10px] text-faint">{label}</dt>
                <dd className="num mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section title="房间" dense>
          <div className="space-y-0.5">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelection('room', [room.id])}
                className="flex w-full items-center justify-between rounded-[2px] px-2 py-1 text-left text-[11px] text-muted hover:bg-subtle hover:text-ink"
              >
                <span className="truncate">{room.name}</span>
                <span className="text-[10px] text-faint">{ROOM_TYPE_LABELS[room.type]}</span>
              </button>
            ))}
          </div>
        </Section>
        <div className="px-3 pb-4">
          <EmptyState
            icon={<MousePointer2 size={20} />}
            title="选择一个对象"
            description="选择墙体、房间、门窗或家具后，这里会显示可调节的尺寸、材质与样式。"
          />
          <Button block variant="outline" size="sm" onClick={() => pushToast('属性编辑器正在接入', 'info')}>
            查看完整属性面板
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-ink">选中对象</h3>
        <Badge tone="accent">{selection.total}</Badge>
      </div>
      {selection.furniture.map((item) => (
        <div key={item.id} className="rounded-[3px] border border-line bg-raised p-2">
          <p className="text-[12px] font-medium text-ink">{item.name}</p>
          <p className="num mt-0.5 text-[10px] text-faint">
            {Math.round(item.w)} × {Math.round(item.d)} × {Math.round(item.h)} mm
          </p>
        </div>
      ))}
      {selection.rooms.map((room) => (
        <div key={room.id} className="rounded-[3px] border border-line bg-raised p-2">
          <p className="text-[12px] font-medium text-ink">{room.name}</p>
          <p className="mt-0.5 text-[10px] text-faint">{ROOM_TYPE_LABELS[room.type]} · 可改类型与材质</p>
        </div>
      ))}
      {selection.mep.map((device) => (
        <div key={device.id} className="rounded-[3px] border border-line bg-raised p-2">
          <p className="text-[12px] font-medium text-ink">{MEP_META[device.kind].label}</p>
          <p className="num mt-0.5 text-[10px] text-faint">安装高度 {device.height} mm</p>
        </div>
      ))}
      <p className="rounded-[2px] border border-dashed border-line px-2 py-3 text-center text-[10px] text-faint">
        完整尺寸/材质/颜色编辑器正在接入，数据已就绪。
      </p>
    </div>
  );
}
