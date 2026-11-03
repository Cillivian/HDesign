import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge, Segmented } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { aiReady, useAiStore, type AiTab } from '../../store/ai-store';
import { AiErrorBanner, AiPrivacyNotice, AiUsageFooter } from './AiShared';
import { BriefTab } from './BriefTab';
import { ChatTab } from './ChatTab';
import { BomTab } from './BomTab';

const TABS: Array<{ value: AiTab; label: string }> = [
  { value: 'brief', label: '方案' },
  { value: 'chat', label: '对话' },
  { value: 'bom', label: '清单' },
];

export function AiPanel() {
  const projectId = useDocStore((state) => state.doc.id);
  const config = useAiStore((state) => state.config);
  const configError = useAiStore((state) => state.configError);
  const tab = useAiStore((state) => state.tab);
  const setTab = useAiStore((state) => state.setTab);
  const loadConfig = useAiStore((state) => state.loadConfig);
  const loadChatHistory = useAiStore((state) => state.loadChatHistory);
  const ready = aiReady({ config, configError });

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!projectId) return;
    void loadChatHistory(projectId);
  }, [projectId, loadChatHistory]);

  // EditorPage / gallery "一句话开始" dispatches this event with the prompt.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== 'string' || detail.trim().length < 2) return;
      const state = useAiStore.getState();
      state.setPrompt(detail);
      state.setTab('brief');
      if (state.busy) return;
      if (state.config?.configured) {
        void state.generateBrief({ prompt: detail });
        return;
      }
      if (!state.config && !state.configLoading) {
        void state.loadConfig().then(() => {
          const next = useAiStore.getState();
          if (next.config?.configured && !next.busy) void next.generateBrief({ prompt: detail });
        });
      }
    };
    window.addEventListener('hdesign:ai-prompt', handler as EventListener);
    return () => window.removeEventListener('hdesign:ai-prompt', handler as EventListener);
  }, []);

  const modelLabel = config?.mock
    ? '演示数据'
    : config?.configured
      ? config.model
      : configError
        ? '服务未连接'
        : '未配置';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent" aria-hidden="true" />
          <h3 className="text-[12px] font-semibold text-ink">AI 设计助手</h3>
          <Badge
            tone={config?.mock ? 'accent' : config?.configured ? 'ok' : 'outline'}
            className="ml-auto max-w-[130px] truncate"
          >
            {modelLabel}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          一句话生成风格、家具、材质与水电方案，预览差异后一键上图；也可对话与导出物料清单。
        </p>
        <Segmented
          value={tab}
          options={TABS.map((item) => ({ value: item.value, label: item.label }))}
          onChange={setTab}
          ariaLabel="AI 功能页"
          className="mt-2 flex w-full [&>button]:flex-1"
        />
      </div>

      <div className="empty:hidden shrink-0 px-3 pt-2">
        <AiErrorBanner />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'chat' ? (
          <ChatTab config={config} ready={ready} />
        ) : (
          <div className="hd-scroll h-full overflow-y-auto">
            {tab === 'brief' ? <BriefTab config={config} ready={ready} /> : <BomTab />}
          </div>
        )}
      </div>

      <AiUsageFooter />
      <AiPrivacyNotice />
    </div>
  );
}
