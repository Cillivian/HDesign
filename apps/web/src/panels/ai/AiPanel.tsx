/* M0 placeholder — owned by workstream F (AI design copilot). */
import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { Badge, Button, Callout, Section, TextField } from '../../design-system/primitives';
import { useUiStore } from '../../store/ui-store';

const EXAMPLES = [
  '89㎡两居，奶油风，预算 15 万，有猫，客厅要投影',
  '把沙发换成浅灰布艺，电视柜加长到 2.4 米',
  '主卧要大衣柜，卫生间干湿分离，厨房开放',
];

export function AiPanel() {
  const [value, setValue] = useState('');
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent" />
          <h3 className="text-[12px] font-semibold text-ink">AI 设计助手</h3>
          <Badge tone="accent" className="ml-auto">DeepSeek</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          用一句话描述需求，生成风格、家具、材质与水电方案，并一键套用到当前草图。
        </p>
      </div>
      <div className="p-3">
        <Callout tone="neutral" title="AI 能力接入中">
          方案卡、一键上图与自然语言微调将在 AI 工作流完成后启用。当前可先完成户型与风格手调。
        </Callout>
        <div className="mt-3">
          <TextField
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="例如：三居，日式原木，预算 25 万，有孩子"
            aria-label="AI 需求描述"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                pushToast('AI 设计工作流接入中', 'info');
              }
            }}
          />
          <Button
            block
            variant="primary"
            size="sm"
            className="mt-1.5"
            onClick={() => pushToast('AI 设计工作流接入中', 'info')}
          >
            <Wand2 size={14} /> 生成设计方案
          </Button>
        </div>
        <Section title="示例指令" dense className="mt-1 px-0">
          <div className="space-y-1">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setValue(example)}
                className="w-full rounded-[2px] border border-line bg-raised px-2 py-1.5 text-left text-[11px] leading-snug text-muted hover:border-accent/40 hover:text-ink"
              >
                {example}
              </button>
            ))}
          </div>
        </Section>
      </div>
      <div className="mt-auto border-t border-line px-3 py-2 text-[10px] leading-relaxed text-faint">
        AI 结果需人工确认后写入方案；图纸与项目默认不会上传。
      </div>
    </div>
  );
}
