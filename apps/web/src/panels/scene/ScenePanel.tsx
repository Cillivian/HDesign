/* M0 placeholder — owned by workstream D (3D scene). */
import { Box, Camera, Sun } from 'lucide-react';
import { Badge, Button, Section } from '../../design-system/primitives';
import { useUiStore } from '../../store/ui-store';

export function ScenePanel() {
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-faint">3D 场景</span>
        <Badge tone="outline">渲染器接入中</Badge>
      </div>
      <Section title="视角" dense>
        <div className="grid grid-cols-2 gap-1.5">
          {['顶视', '鸟瞰', '四角', '漫游'].map((label) => (
            <Button key={label} variant="outline" size="sm" onClick={() => setView('3d')}>
              <Camera size={13} /> {label}
            </Button>
          ))}
        </div>
      </Section>
      <Section title="显示" dense>
        <div className="space-y-1.5 text-[11px] text-muted">
          <label className="flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Box size={13} /> 全高墙体</span>
            <input type="checkbox" defaultChecked disabled />
          </label>
          <label className="flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Sun size={13} /> 日光</span>
            <input type="checkbox" defaultChecked disabled />
          </label>
          <label className="flex items-center justify-between">
            <span>水电点位</span>
            <input type="checkbox" disabled />
          </label>
        </div>
      </Section>
      <Button block variant="primary" size="sm" onClick={() => setView(view === '2d' ? '3d' : '2d')}>
        {view === '2d' ? '进入 3D 场景' : '返回 2D 平面'}
      </Button>
    </div>
  );
}
