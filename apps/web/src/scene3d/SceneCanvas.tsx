/* M0 placeholder — owned by workstream D (3D scene). */
import { Box, Rotate3d } from 'lucide-react';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { useProjectStats } from '../store/selectors';

export function SceneCanvas() {
  const stats = useProjectStats();
  const setView = useUiStore((state) => state.setView);
  const roomCount = useDocStore((state) => state.doc.rooms.length);

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--canvas-backdrop)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
        <span className="flex items-center gap-1 text-[11px] font-medium text-ink">
          <Box size={14} /> 3D 场景
        </span>
        <span className="text-[10px] text-faint">透视 · 预计 {roomCount} 个空间</span>
        <button
          type="button"
          onClick={() => setView('2d')}
          className="ml-auto rounded-[2px] border border-line bg-surface px-2 py-0.5 text-[10px] text-muted hover:text-ink"
        >
          返回 2D
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(60deg, var(--canvas-grid) 1px, transparent 1px), linear-gradient(-60deg, var(--canvas-grid) 1px, transparent 1px)',
            backgroundSize: '48px 84px',
          }}
        />
        <div className="relative z-10 w-[380px] rounded-[4px] border border-line bg-surface p-6 text-center shadow-[var(--shadow-pop)]">
          <Rotate3d size={24} className="mx-auto mb-3 text-accent" />
          <h2 className="font-serif text-[18px] font-semibold text-ink">三维视图接入中</h2>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            墙体挤出、门窗洞口、家具参数化模型与第一人称漫游将在 3D 工作流完成后启用。
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-1.5 text-left">
            {[
              ['面积', `${stats.areaSqm.toFixed(1)} ㎡`],
              ['房间', `${stats.roomCount}`],
              ['家具', `${stats.furnitureCount}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
                <dt className="text-[9px] text-faint">{label}</dt>
                <dd className="num text-[12px] font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
