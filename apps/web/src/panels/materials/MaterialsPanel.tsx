/* M0 placeholder — owned by workstream B (materials). */
import { Badge } from '../../design-system/primitives';
import { useUiStore } from '../../store/ui-store';

const FLOORS = [
  { name: '橡木地板', color: '#C9A97D' },
  { name: '胡桃木地板', color: '#8A6242' },
  { name: '奶油木地板', color: '#DCC7A8' },
  { name: '800 地砖', color: '#DCDAD3' },
  { name: '600 地砖', color: '#C7C4BC' },
  { name: '大理石', color: '#E7E4DC' },
  { name: '水磨石', color: '#B9B6AC' },
  { name: '防滑地砖', color: '#B6B2A8' },
  { name: '满铺地毯', color: '#BFAE98' },
];

const WALLS = [
  { name: '暖白乳胶漆', color: '#F3EEE4' },
  { name: '奶咖乳胶漆', color: '#D9C7B0' },
  { name: '微水泥', color: '#B9B3A6' },
  { name: '木饰面', color: '#A9825C' },
  { name: '哑光瓷砖', color: '#D6D3CA' },
];

export function MaterialsPanel() {
  const pushToast = useUiStore((state) => state.pushToast);
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-faint">点击材质查看铺装预览</span>
        <Badge tone="outline">材质库接入中</Badge>
      </div>
      <section>
        <h3 className="mb-1.5 text-[11px] font-semibold text-muted">地面</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {FLOORS.map((material) => (
            <button
              key={material.name}
              type="button"
              onClick={() => pushToast('材质替换将在材质库完成后启用', 'info', material.name)}
              className="rounded-[2px] border border-line p-1 text-left hover:border-accent/50"
            >
              <span className="block h-9 w-full rounded-[1px]" style={{ background: material.color }} />
              <span className="mt-1 block truncate text-[10px] text-ink">{material.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-1.5 text-[11px] font-semibold text-muted">墙面</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {WALLS.map((material) => (
            <button
              key={material.name}
              type="button"
              onClick={() => pushToast('墙面材质将在材质库完成后启用', 'info', material.name)}
              className="rounded-[2px] border border-line p-1 text-left hover:border-accent/50"
            >
              <span className="block h-9 w-full rounded-[1px]" style={{ background: material.color }} />
              <span className="mt-1 block truncate text-[10px] text-ink">{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
