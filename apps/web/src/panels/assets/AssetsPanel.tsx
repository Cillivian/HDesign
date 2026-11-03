/* M0 placeholder — owned by workstream B (catalog + assets panel). */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, Button, EmptyState, TextField } from '../../design-system/primitives';
import { useUiStore } from '../../store/ui-store';
import { useDocStore } from '../../store/doc-store';

const PREVIEW = [
  { name: '三人沙发', cat: '客厅', size: '2200×900' },
  { name: '双人床', cat: '卧室', size: '1500×2000' },
  { name: '餐桌', cat: '餐厅', size: '1400×800' },
  { name: '衣柜', cat: '卧室', size: '1800×600' },
  { name: '厨房地柜', cat: '厨房', size: '2400×600' },
  { name: '马桶', cat: '卫浴', size: '400×650' },
  { name: '落地灯', cat: '灯具', size: '400×400' },
  { name: '绿植', cat: '软装', size: '500×500' },
];

const CATS = ['全部', '客厅', '卧室', '餐厅', '厨房', '卫浴', '灯具', '软装'];

export function AssetsPanel() {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('全部');
  const pushToast = useUiStore((state) => state.pushToast);
  const setTool = useUiStore((state) => state.setTool);
  const furnitureCount = useDocStore((state) => state.doc.furniture.length);

  const items = useMemo(
    () =>
      PREVIEW.filter(
        (item) =>
          (cat === '全部' || item.cat === cat) &&
          (!query || item.name.includes(query) || item.cat.includes(query)),
      ),
    [cat, query],
  );

  return (
    <div>
      <div className="border-b border-line p-2.5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索家具、软装"
            aria-label="搜索家具"
            className="pl-7"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCat(item)}
              aria-pressed={cat === item}
              className={
                cat === item
                  ? 'rounded-[2px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent'
                  : 'rounded-[2px] px-1.5 py-0.5 text-[10px] text-muted hover:bg-subtle'
              }
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[10px] text-faint">
        <span>{items.length} 类预览 · 当前方案 {furnitureCount} 件</span>
        <Badge tone="outline">目录接入中</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-3 pb-4">
        {items.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => {
              setTool('furniture');
              pushToast('素材库完整目录与拖放将在下一步启用', 'info', item.name);
            }}
            className="group rounded-[3px] border border-line bg-raised p-2 text-left hover:border-accent/50 hover:bg-surface"
          >
            <div className="mb-1.5 flex h-12 items-center justify-center rounded-[2px] bg-subtle text-[10px] text-faint">
              {item.cat}
            </div>
            <p className="truncate text-[11px] font-medium text-ink">{item.name}</p>
            <p className="num mt-0.5 text-[9px] text-faint">{item.size} mm</p>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState title="没有找到素材" description="换个关键词，或切换分类。" />
      ) : (
        <div className="px-3 pb-4">
          <Button block variant="outline" size="sm" onClick={() => pushToast('素材目录正在构建中', 'info')}>
            打开完整素材库
          </Button>
        </div>
      )}
    </div>
  );
}
