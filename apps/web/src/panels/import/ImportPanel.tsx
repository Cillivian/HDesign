/* M0 placeholder — owned by workstream C (import + recognition). */
import { useRef, useState } from 'react';
import { FileUp, Image as ImageIcon, ScanLine } from 'lucide-react';
import { Badge, Button, Callout, Section } from '../../design-system/primitives';
import { useUiStore } from '../../store/ui-store';

export function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-faint">图片或 PDF 户型图</span>
        <Badge tone="outline">识别接入中</Badge>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) setFileName(file.name);
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-[3px] border border-dashed border-line-strong bg-raised px-4 py-7 text-center hover:border-accent/60 hover:bg-surface"
      >
        <ImageIcon size={22} className="mb-2 text-faint" />
        <p className="text-[12px] font-medium text-ink">拖入户型图 / 点击选择</p>
        <p className="mt-1 text-[10px] text-muted">PNG · JPG · WebP · PDF（多页可选）</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setFileName(file.name);
          }}
        />
      </div>
      {fileName ? (
        <Callout tone="accent" title={fileName}>
          已选择文件。识别、比例校准与草图生成正在接入，完成后会在此逐步展示。
        </Callout>
      ) : null}
      <div className="grid gap-1.5">
        <Button block variant="outline" size="sm" onClick={() => pushToast('PDF 页面选择与栅格化接入中', 'info')}>
          <FileUp size={13} /> 选择 PDF 页面
        </Button>
        <Button
          block
          variant="outline"
          size="sm"
          onClick={() => pushToast('两点校准与透写将在识别流程中提供', 'info')}
        >
          <ScanLine size={13} /> 手工描图 + 两点校准
        </Button>
      </div>
      <Section title="识别能力" subtitle="本地 CV + OCR，配置 DeepSeek 后可用视觉模型增强。">
        <ul className="space-y-1 text-[11px] text-muted">
          <li>· 墙体与房间自动提取，识别尺寸文字校准比例</li>
          <li>· 门窗、房间名与尺寸链核对后生成可编辑草图</li>
          <li>· 无 AI 密钥也可使用本地识别与手工描图</li>
        </ul>
      </Section>
    </div>
  );
}
