import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AiConfig } from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useAiStore } from '../../store/ai-store';
import { Badge, Button, Callout, Spinner } from '../../design-system/primitives';

/* ------------------------------------------------------------------ */
/* Palette                                                            */
/* ------------------------------------------------------------------ */

export function AiPalette({ tokens, size = 18 }: { tokens: Record<string, string> | undefined; size?: number }) {
  const colors = Object.values(tokens ?? {})
    .filter((value) => typeof value === 'string' && value.startsWith('#'))
    .slice(0, 8);
  if (colors.length === 0) return null;
  return (
    <div className="flex overflow-hidden rounded-[2px] border border-line" aria-hidden="true">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          style={{ background: color, height: size, width: size + 4 }}
          title={color}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Project context chips                                              */
/* ------------------------------------------------------------------ */

export function ProjectContextChips() {
  const doc = useDocStore((state) => state.doc);
  const roomCount = doc.rooms.length;
  const furnitureCount = doc.furniture.length;
  const deviceCount = doc.mep.devices.length;
  const area = doc.rooms.reduce((sum, room) => {
    const points = room.polygon;
    let twice = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      twice += current.x * next.y - next.x * current.y;
    }
    return sum + Math.abs(twice / 2) / 1_000_000;
  }, 0);
  return (
    <div className="flex flex-wrap gap-1" aria-label="当前项目上下文">
      <Badge tone="outline">{area.toFixed(0)}㎡</Badge>
      <Badge tone="outline">{roomCount} 间房</Badge>
      <Badge tone="outline">{furnitureCount} 件家具</Badge>
      <Badge tone="outline">{deviceCount} 个点位</Badge>
      <Badge tone="outline">{doc.style.id}</Badge>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error banner                                                       */
/* ------------------------------------------------------------------ */

export function AiErrorBanner() {
  const error = useAiStore((state) => state.error);
  const clearError = useAiStore((state) => state.clearError);
  const generateBrief = useAiStore((state) => state.generateBrief);
  const generateQuickEdit = useAiStore((state) => state.generateQuickEdit);
  const extractStyle = useAiStore((state) => state.extractStyle);
  const sendChat = useAiStore((state) => state.sendChat);
  const messages = useAiStore((state) => state.messages);

  if (!error) return null;

  const retry = () => {
    clearError();
    if (error.retry === 'brief') void generateBrief();
    if (error.retry === 'patch') void generateQuickEdit();
    if (error.retry === 'style') void extractStyle();
    if (error.retry === 'chat') {
      const lastUser = [...messages].reverse().find((message) => message.role === 'user');
      if (lastUser) void sendChat(lastUser.content);
    }
  };

  return (
    <Callout
      tone="danger"
      title={error.message}
      action={
        error.retry ? (
          <Button size="xs" variant="outline" onClick={retry} aria-label="重试">
            <RefreshCw size={12} /> 重试
          </Button>
        ) : (
          <Button size="xs" variant="ghost" onClick={clearError} aria-label="关闭错误">
            关闭
          </Button>
        )
      }
    >
      {error.hint ? <p className="text-[10px] leading-relaxed text-muted">{error.hint}</p> : null}
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Config / setup guidance                                            */
/* ------------------------------------------------------------------ */

export function AiConfigCallout({ config, configError }: { config: AiConfig | null; configError: string | null }) {
  const configLoading = useAiStore((state) => state.configLoading);
  const loadConfig = useAiStore((state) => state.loadConfig);

  if (configLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted" role="status">
        <Spinner className="h-3 w-3" /> 正在检查 AI 配置…
      </div>
    );
  }
  if (configError) {
    return (
      <Callout
        tone="warning"
        title="无法连接本地 AI 服务"
        action={
          <Button size="xs" variant="outline" onClick={() => void loadConfig()}>
            重试
          </Button>
        }
      >
        <p className="text-[10px] leading-relaxed">{configError}</p>
        <p className="mt-1 text-[10px] leading-relaxed">物料清单、施工算量与本地编辑不受影响，可继续使用。</p>
      </Callout>
    );
  }
  if (config && !config.configured) {
    return (
      <Callout tone="neutral" title="AI 尚未配置" action={<Badge tone="outline">本地可用</Badge>}>
        <p className="text-[10px] leading-relaxed">
          在仓库根目录 <code className="rounded bg-subtle px-1">.env</code> 中设置{' '}
          <code className="rounded bg-subtle px-1">AI_API_KEY</code>（默认 DeepSeek）后重启服务即可生成方案与对话。
        </p>
        <p className="mt-1 text-[10px] leading-relaxed">
          没有 Key 时，可设置 <code className="rounded bg-subtle px-1">AI_MOCK=1</code> 用内置演示数据走通完整流程；
          “清单”页的物料与算量始终可用。
        </p>
      </Callout>
    );
  }
  if (config?.mock) {
    return (
      <Callout tone="accent" title="演示数据模式">
        <p className="text-[10px] leading-relaxed">
          AI_MOCK=1：方案与对话来自 <code className="rounded bg-subtle px-1">fixtures/ai</code> 的固定数据，不会消耗额度。
        </p>
      </Callout>
    );
  }
  return null;
}

export function AiPrivacyNotice() {
  return (
    <div className="flex items-start gap-1.5 border-t border-line px-3 py-2 text-[10px] leading-relaxed text-faint">
      <ShieldCheck size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        仅在点击生成/发送时，把当前项目摘要、目录候选与提示词发送到 AI 服务；参考图只在你主动上传并提取风格时上传。本机数据不会自动同步。
      </span>
    </div>
  );
}

export function AiUsageFooter() {
  const usage = useAiStore((state) => state.usage);
  const config = useAiStore((state) => state.config);
  if (usage.totalTokens <= 0) {
    return (
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[10px] text-faint">
        <span>{config?.mock ? '演示模式' : config?.model ? `模型 ${config.model}` : 'AI 未连接'}</span>
        <span>尚未产生 token</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[10px] text-faint">
      <span>{config?.mock ? '演示模式' : config?.model ? `模型 ${config.model}` : 'AI 未连接'}</span>
      <span className="num">
        tokens {usage.inputTokens} 入 / {usage.outputTokens} 出 · 合计 {usage.totalTokens}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

export function UnconfiguredHint() {
  return (
    <div className="flex items-start gap-1.5 rounded-[2px] border border-line bg-raised px-2 py-1.5 text-[10px] leading-relaxed text-muted">
      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-electric" aria-hidden="true" />
      <span>AI 未配置：配置 AI_API_KEY 或设置 AI_MOCK=1 后即可生成；素材、编辑与物料清单仍可正常使用。</span>
    </div>
  );
}
