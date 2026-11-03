/* M0 placeholder — owned by workstream B (MEP rules + panel). */
import { Zap } from 'lucide-react';
import { Badge, Button, Section } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { MEP_META } from '@hdesign/domain';

export function MepPanel() {
  const devices = useDocStore((state) => state.doc.mep.devices);
  const circuits = useDocStore((state) => state.doc.mep.circuits);
  const pushToast = useUiStore((state) => state.pushToast);
  const electric = devices.filter((device) => MEP_META[device.kind].group === 'electric').length;
  const water = devices.length - electric;

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-[3px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[10px] text-faint">电位点位</p>
          <p className="num text-[18px] font-medium text-electric">{electric}</p>
        </div>
        <div className="rounded-[3px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[10px] text-faint">水位点位</p>
          <p className="num text-[18px] font-medium text-water">{water}</p>
        </div>
      </div>
      <Button block variant="primary" size="sm" onClick={() => pushToast('水电自动布点将在规则引擎完成后启用', 'info')}>
        <Zap size={14} /> 按房间一键生成点位
      </Button>
      <div className="flex items-center justify-between text-[10px] text-faint">
        <span>回路 {circuits.length} 条</span>
        <Badge tone="outline">规则引擎接入中</Badge>
      </div>
      <Section title="点位清单">
        {devices.length === 0 ? (
          <p className="rounded-[2px] border border-dashed border-line px-2 py-4 text-center text-[11px] text-faint">
            还没有点位。生成后会按水位 / 电位分图层显示。
          </p>
        ) : (
          <ul className="space-y-1">
            {devices.slice(0, 20).map((device) => (
              <li key={device.id} className="flex items-center justify-between text-[11px]">
                <span>{MEP_META[device.kind].label}</span>
                <span className="num text-[10px] text-faint">h={device.height}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
