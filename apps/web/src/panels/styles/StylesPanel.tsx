/* M0 placeholder — owned by workstream B (style engine). */
import { Badge, Button, Section } from '../../design-system/primitives';
import { useUiStore } from '../../store/ui-store';

const STYLES = [
  { id: 'modern-minimal', name: '现代简约', swatches: ['#F2EFE8', '#D8D2C6', '#2F3330', '#B08A5E'] },
  { id: 'cream', name: '奶油', swatches: ['#F7EFE3', '#EAD9C3', '#C9AE8C', '#8A6F52'] },
  { id: 'nordic', name: '北欧', swatches: ['#F4F5F2', '#DCE2DA', '#A9B5A5', '#5C665B'] },
  { id: 'japandi', name: '日式原木', swatches: ['#F3EEE5', '#E2D3BF', '#B08D63', '#5A5145'] },
  { id: 'new-chinese', name: '新中式', swatches: ['#EFE8DD', '#C9B79C', '#7A5A3C', '#3A332C'] },
  { id: 'light-luxury', name: '轻奢法式', swatches: ['#F6F1EA', '#E4D6C3', '#B99B6B', '#4A4036'] },
  { id: 'loft', name: '工业 Loft', swatches: ['#DAD8D2', '#9A9891', '#4C4A45', '#8A5A3B'] },
  { id: 'mid-century', name: '中古', swatches: ['#F1E7D6', '#D8B98C', '#9A6B45', '#3E4A3D'] },
  { id: 'wabi-sabi', name: '侘寂', swatches: ['#EFE9DF', '#D9CDBB', '#A8977F', '#5D564B'] },
  { id: 'american-retro', name: '美式复古', swatches: ['#F2E9DA', '#C9A46C', '#6E4B34', '#2F3A33'] },
  { id: 'dopamine', name: '多巴胺', swatches: ['#FBEFE6', '#F2B661', '#E2725B', '#5F7E8C'] },
  { id: 'mono', name: '极简黑白', swatches: ['#F7F7F5', '#DDDDD9', '#8C8C88', '#1E1E1C'] },
];

export function StylesPanel() {
  const pushToast = useUiStore((state) => state.pushToast);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[10px] text-faint">12 套内置预设</span>
        <Badge tone="outline">风格引擎接入中</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-3">
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => pushToast('一键风格将在风格引擎完成后启用', 'info', style.name)}
            className="group rounded-[3px] border border-line bg-surface p-1.5 text-left hover:border-accent/50"
          >
            <div className="flex h-10 overflow-hidden rounded-[2px]">
              {style.swatches.map((color) => (
                <span key={color} className="flex-1" style={{ background: color }} />
              ))}
            </div>
            <p className="mt-1 text-[11px] font-medium text-ink">{style.name}</p>
            <p className="text-[9px] text-faint">{style.swatches.length} 色 · 材质联动</p>
          </button>
        ))}
      </div>
      <Section title="从参考图生成风格">
        <Button block variant="outline" size="sm" onClick={() => pushToast('参考图取色将在风格引擎中提供', 'info')}>
          上传参考图提取配色
        </Button>
      </Section>
    </div>
  );
}
