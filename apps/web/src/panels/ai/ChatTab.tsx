import { useEffect, useMemo, useRef } from 'react';
import { MessageSquare, Send, Square, Trash2, Wand2 } from 'lucide-react';
import type { AiConfig } from '@hdesign/domain';
import { Button, EmptyState, Spinner, inputClass } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { useAiStore } from '../../store/ai-store';
import { PatchPreviewCard } from './PatchPreview';
import { AiConfigCallout, UnconfiguredHint } from './AiShared';

const SUGGESTIONS = ['这个户型的采光怎么改善？', '预算 15 万，钱该花在哪？', '有猫，选什么沙发和地毯？'];

export function ChatTab({ config, ready }: { config: AiConfig | null; ready: boolean }) {
  const pushToast = useUiStore((state) => state.pushToast);
  const configError = useAiStore((state) => state.configError);
  const messages = useAiStore((state) => state.messages);
  const streamingMessageId = useAiStore((state) => state.streamingMessageId);
  const chatInput = useAiStore((state) => state.chatInput);
  const setChatInput = useAiStore((state) => state.setChatInput);
  const busy = useAiStore((state) => state.busy);
  const sendChat = useAiStore((state) => state.sendChat);
  const cancel = useAiStore((state) => state.cancel);
  const generateQuickEdit = useAiStore((state) => state.generateQuickEdit);
  const patchResult = useAiStore((state) => state.patchResult);
  const patchApplied = useAiStore((state) => state.patchApplied);
  const lastPatch = useAiStore((state) => state.lastPatch);
  const applyPatchPreview = useAiStore((state) => state.applyPatchPreview);
  const undoLastAiChange = useAiStore((state) => state.undoLastAiChange);
  const canUndo = useDocStore((state) => state.past.length > 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastContent = messages[messages.length - 1]?.content?.length ?? 0;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, lastContent]);

  const lastAssistantIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') return index;
    }
    return -1;
  }, [messages]);

  const lastUserPrompt = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') return messages[index]?.content ?? '';
    }
    return '';
  }, [messages]);

  const submit = () => {
    if (!ready || busy) return;
    void sendChat();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-3 py-2">
        <AiConfigCallout config={config} configError={configError} />
      </div>

      <div ref={scrollRef} className="hd-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2" aria-live="polite">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={18} />}
            title="和设计助手聊聊"
            description="它可以结合当前户型给出采光、收纳、预算与选材建议；下方建议可直接点击发送。"
          />
        ) : (
          messages.map((message, index) => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[92%] rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-1.5 text-[11px] leading-relaxed text-ink'
                    : 'max-w-[96%] rounded-[3px] border border-line bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-ink'
                }
              >
                <p className="whitespace-pre-wrap break-words">
                  {message.content}
                  {message.streaming ? <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-accent align-middle" /> : null}
                </p>
                {message.role === 'assistant' && !message.streaming && index === lastAssistantIndex ? (
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!ready || busy || !lastUserPrompt}
                      title="把上一句需求转成可预览的修改"
                      onClick={() => {
                        void generateQuickEdit({ prompt: lastUserPrompt });
                      }}
                    >
                      <Wand2 size={11} /> 转为修改
                    </Button>
                    <span className="text-[9px] text-faint">先生成预览，确认后再应用</span>
                  </div>
                ) : null}
                {message.error ? <p className="mt-1 text-[10px] text-danger">回答失败，可重试或检查 AI 配置</p> : null}
              </div>
            </div>
          ))
        )}

        {messages.length === 0 && ready ? (
          <div className="flex flex-wrap gap-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void sendChat(suggestion)}
                className="rounded-[2px] border border-line bg-raised px-1.5 py-1 text-[10px] text-muted hover:border-accent/40 hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {streamingMessageId ? (
          <p className="flex items-center gap-1.5 text-[10px] text-accent" role="status">
            <Spinner className="h-3 w-3" /> 正在生成回答…
          </p>
        ) : null}

        {lastPatch && patchResult ? (
          <PatchPreviewCard
            result={patchResult}
            applied={patchApplied}
            busy={busy}
            onApply={() => {
              applyPatchPreview();
              pushToast('修改已应用', 'success', lastPatch.summary);
            }}
            onDiscard={() => useAiStore.setState({ lastPatch: null, patchResult: null, patchApplied: false })}
            onUndo={() => {
              if (undoLastAiChange()) {
                useAiStore.setState({ patchApplied: false });
                pushToast('已撤销修改', 'info');
              }
            }}
            canUndo={canUndo}
            title="对话产生的修改预览"
          />
        ) : null}
      </div>

      <div className="border-t border-line p-2">
        {!ready ? <UnconfiguredHint /> : null}
        <div className="mt-1.5 flex items-end gap-1.5">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={ready ? '问点什么…（Enter 发送，Shift+Enter 换行）' : 'AI 未配置，暂时无法对话'}
            aria-label="对话输入"
            rows={2}
            disabled={!ready || busy}
            maxLength={8000}
            className={`${inputClass} h-auto min-h-[38px] flex-1 resize-none py-1 leading-relaxed`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {busy && streamingMessageId ? (
            <Button size="icon-sm" variant="outline" aria-label="停止回答" onClick={cancel}>
              <Square size={13} />
            </Button>
          ) : (
            <Button size="icon-sm" variant="primary" aria-label="发送" disabled={!ready || busy} onClick={submit}>
              <Send size={13} />
            </Button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[9px] text-faint">回答仅为建议，不会自动改动方案</span>
          {messages.length > 0 ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                useAiStore.setState({ messages: [], streamingMessageId: null });
                pushToast('已清空本次对话（不影响方案）', 'info');
              }}
            >
              <Trash2 size={11} /> 清空
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
