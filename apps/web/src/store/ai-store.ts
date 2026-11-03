import { create } from 'zustand';
import type { AiConfig, AiUsage, DesignBrief, DesignPatch } from '@hdesign/domain';
import { useDocStore } from './doc-store';
import { useUiStore } from './ui-store';
import { db } from './persistence';
import {
  fetchAiConfig,
  prepareReferenceImage,
  requestDesignBrief,
  requestDesignPatch,
  requestStyleFromImage,
  streamAiChat,
  type ReferenceImageData,
} from '../services/ai-design';
import {
  applyBriefToDoc,
  applyPatchToDoc,
  executeDesignBrief,
  executeDesignPatch,
  undoAppliedAiChange,
  type BriefApplyMode,
  type PatchExecutionResult,
} from '../services/patch-executor';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type AiTab = 'brief' | 'chat' | 'bom';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  streaming?: boolean;
  error?: boolean;
}

export interface AiErrorInfo {
  code: string;
  message: string;
  hint?: string;
  retry?: 'brief' | 'patch' | 'chat' | 'style' | null;
}

export interface AiStageState {
  stage: 'idle' | 'context' | 'requesting' | 'validating' | 'done' | 'error';
  label: string;
}

export interface AiStyleCandidate {
  name: string;
  tokens: Record<string, string>;
  materials: string[];
  mood: string;
  rationale: string;
}

interface AiState {
  config: AiConfig | null;
  configLoading: boolean;
  configError: string | null;

  tab: AiTab;
  prompt: string;
  quickEdit: string;
  chatInput: string;
  reference: ReferenceImageData | null;

  busy: boolean;
  stage: AiStageState;
  error: AiErrorInfo | null;

  candidates: DesignBrief[];
  selectedBriefId: string | null;
  briefMode: BriefApplyMode;
  briefPreview: PatchExecutionResult | null;
  briefApplyResult: PatchExecutionResult | null;

  lastPatch: DesignPatch | null;
  patchResult: PatchExecutionResult | null;
  patchApplied: boolean;

  styleCandidate: AiStyleCandidate | null;

  messages: AiChatMessage[];
  streamingMessageId: string | null;

  usage: Required<AiUsage>;

  setTab: (tab: AiTab) => void;
  setPrompt: (prompt: string) => void;
  setQuickEdit: (value: string) => void;
  setChatInput: (value: string) => void;
  setBriefMode: (mode: BriefApplyMode) => void;
  selectBrief: (id: string) => void;
  clearError: () => void;
  cancel: () => void;
  reset: () => void;

  loadConfig: () => Promise<void>;
  loadChatHistory: (projectId: string) => Promise<void>;
  setReference: (file: File) => Promise<void>;
  clearReference: () => void;
  refreshBriefPreview: () => void;

  generateBrief: (options?: { prompt?: string; variantCount?: number }) => Promise<void>;
  extractStyle: (hint?: string) => Promise<void>;
  generateQuickEdit: (options?: { prompt?: string }) => Promise<void>;
  applyPatchPreview: () => void;
  applyBriefCandidate: (brief?: DesignBrief, mode?: BriefApplyMode) => void;
  discardBriefCandidate: () => void;
  undoLastAiChange: () => boolean;

  sendChat: (text?: string) => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Runtime (non-serialisable) handles                                 */
/* ------------------------------------------------------------------ */

let controller: AbortController | null = null;
let stageTimer: ReturnType<typeof setInterval> | null = null;
let messageSeq = 0;

function nextMessageId(): string {
  messageSeq += 1;
  return `ai-msg-${Date.now().toString(36)}-${messageSeq}`;
}

function stopStageTimer(): void {
  if (stageTimer) {
    clearInterval(stageTimer);
    stageTimer = null;
  }
}

function startStageTimer(set: (partial: Partial<AiState>) => void, labels: string[]): void {
  stopStageTimer();
  let index = 0;
  stageTimer = setInterval(() => {
    index = Math.min(index + 1, labels.length - 1);
    set({ stage: { stage: 'requesting', label: labels[index] ?? '' } });
  }, 1100);
}

function addUsage(current: Required<AiUsage>, usage: AiUsage | undefined): Required<AiUsage> {
  return {
    inputTokens: current.inputTokens + (usage?.inputTokens ?? 0),
    outputTokens: current.outputTokens + (usage?.outputTokens ?? 0),
    totalTokens: current.totalTokens + (usage?.totalTokens ?? 0),
  };
}

function errorInfo(error: unknown, retry: AiErrorInfo['retry']): AiErrorInfo {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'ABORTED', message: '已取消请求', retry: null };
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const typed = error as { code: string; message: string; hint?: string };
    return { code: typed.code, message: typed.message, hint: typed.hint, retry };
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
    retry,
  };
}

async function persistChat(projectId: string, messages: AiChatMessage[]): Promise<void> {
  if (!projectId || messages.length === 0) return;
  try {
    const existing = await db.aiChats.where('projectId').equals(projectId).first();
    const now = new Date().toISOString();
    const payload = messages
      .filter((message) => !message.streaming && message.content.trim().length > 0)
      .slice(-40)
      .map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt }));
    if (existing?.id) {
      await db.aiChats.update(existing.id, { messages: payload, updatedAt: now });
    } else {
      await db.aiChats.add({ projectId, messages: payload, createdAt: now, updatedAt: now });
    }
  } catch {
    /* chat persistence is best-effort (Dexie may be unavailable in tests) */
  }
}

const initialStage: AiStageState = { stage: 'idle', label: '' };
const emptyUsage: Required<AiUsage> = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

export const useAiStore = create<AiState>()((set, get) => ({
  config: null,
  configLoading: false,
  configError: null,

  tab: 'brief',
  prompt: '',
  quickEdit: '',
  chatInput: '',
  reference: null,

  busy: false,
  stage: initialStage,
  error: null,

  candidates: [],
  selectedBriefId: null,
  briefMode: 'replace',
  briefPreview: null,
  briefApplyResult: null,

  lastPatch: null,
  patchResult: null,
  patchApplied: false,

  styleCandidate: null,

  messages: [],
  streamingMessageId: null,

  usage: { ...emptyUsage },

  setTab: (tab) => set({ tab }),
  setPrompt: (prompt) => set({ prompt }),
  setQuickEdit: (quickEdit) => set({ quickEdit }),
  setChatInput: (chatInput) => set({ chatInput }),
  setBriefMode: (briefMode) => {
    set({ briefMode });
    get().refreshBriefPreview();
  },
  selectBrief: (selectedBriefId) => {
    set({ selectedBriefId, briefApplyResult: null });
    get().refreshBriefPreview();
  },
  clearError: () => set({ error: null }),
  cancel: () => {
    controller?.abort();
    controller = null;
    stopStageTimer();
    set((state) => ({
      busy: false,
      stage: { stage: 'idle', label: '' },
      streamingMessageId: null,
      messages: state.messages.map((message) =>
        message.streaming ? { ...message, streaming: false, content: message.content || '（已取消）' } : message,
      ),
    }));
  },
  reset: () => {
    controller?.abort();
    controller = null;
    stopStageTimer();
    set({
      candidates: [],
      selectedBriefId: null,
      briefPreview: null,
      briefApplyResult: null,
      lastPatch: null,
      patchResult: null,
      patchApplied: false,
      styleCandidate: null,
      error: null,
      busy: false,
      stage: initialStage,
    });
  },

  loadConfig: async () => {
    if (get().configLoading) return;
    set({ configLoading: true, configError: null });
    try {
      const config = await fetchAiConfig();
      set({ config, configLoading: false });
    } catch (error) {
      set({
        configLoading: false,
        configError:
          error instanceof Error
            ? error.message
            : '无法连接本地 API 服务，请确认 pnpm dev 正在运行（端口 8791）',
      });
    }
  },

  loadChatHistory: async (projectId) => {
    try {
      const row = await db.aiChats.where('projectId').equals(projectId).first();
      const messages = Array.isArray(row?.messages) ? (row!.messages as AiChatMessage[]) : [];
      if (messages.length > 0 && get().messages.length === 0) {
        set({ messages: messages.filter((message) => message && message.role && message.content) });
      }
    } catch {
      /* chat persistence is best-effort */
    }
  },

  setReference: async (file) => {
    try {
      const reference = await prepareReferenceImage(file);
      set({ reference, error: null });
    } catch (error) {
      set({
        error: {
          code: 'REFERENCE_IMAGE',
          message: error instanceof Error ? error.message : '参考图处理失败',
        },
      });
    }
  },

  clearReference: () => set({ reference: null, styleCandidate: null }),

  refreshBriefPreview: () => {
    const { candidates, selectedBriefId, briefMode } = get();
    const brief = candidates.find((candidate) => candidate.id === selectedBriefId);
    if (!brief) {
      set({ briefPreview: null });
      return;
    }
    const project = useDocStore.getState().doc;
    set({ briefPreview: executeDesignBrief(project, brief, briefMode) });
  },

  generateBrief: async (options) => {
    if (get().busy) return;
    const project = useDocStore.getState().doc;
    const prompt = (options?.prompt ?? get().prompt).trim();
    if (prompt.length < 2) {
      set({ error: { code: 'EMPTY_PROMPT', message: '先用一句话描述你的需求', hint: '例如：89㎡两居，奶油风，预算 15 万，有猫' } });
      return;
    }
    if (project.rooms.length === 0) {
      set({
        error: {
          code: 'NO_ROOMS',
          message: '当前方案还没有房间',
          hint: '先导入户型图或在 2D 编辑器中画出房间，再让 AI 生成方案',
        },
      });
      return;
    }
    controller?.abort();
    controller = new AbortController();
    set({
      busy: true,
      error: null,
      tab: 'brief',
      stage: { stage: 'context', label: '整理项目上下文…' },
      briefApplyResult: null,
      candidates: [],
      selectedBriefId: null,
      briefPreview: null,
    });
    startStageTimer(set, ['整理项目上下文…', '匹配目录、风格与材质…', 'AI 正在构思方案…', '校验方案结构…']);
    try {
      const response = await requestDesignBrief({
        userPrompt: prompt,
        project,
        variantCount: options?.variantCount ?? 3,
        referenceImage: get().reference?.dataUrl,
        signal: controller.signal,
      });
      const candidates = response.briefs;
      set((state) => ({
        busy: false,
        candidates,
        selectedBriefId: candidates[0]?.id ?? null,
        usage: addUsage(state.usage, response.usage),
        stage: { stage: 'done', label: `已生成 ${candidates.length} 个方案` },
      }));
      get().refreshBriefPreview();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        set({ busy: false, stage: initialStage });
        return;
      }
      set({ busy: false, stage: { stage: 'error', label: '生成失败' }, error: errorInfo(error, 'brief') });
    } finally {
      stopStageTimer();
      controller = null;
    }
  },

  extractStyle: async (hint) => {
    const reference = get().reference;
    if (!reference) {
      set({ error: { code: 'NO_REFERENCE', message: '请先上传一张参考图' } });
      return;
    }
    if (get().busy) return;
    controller = new AbortController();
    set({ busy: true, error: null, stage: { stage: 'requesting', label: '分析参考图风格…' } });
    try {
      const response = await requestStyleFromImage({
        image: reference.dataUrl,
        hint: hint ?? get().prompt,
        signal: controller.signal,
      });
      set((state) => ({
        busy: false,
        styleCandidate: response.style,
        usage: addUsage(state.usage, response.usage),
        stage: { stage: 'done', label: '已提取风格配色' },
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        set({ busy: false, stage: initialStage });
        return;
      }
      set({ busy: false, stage: { stage: 'error', label: '风格提取失败' }, error: errorInfo(error, 'style') });
    } finally {
      controller = null;
    }
  },

  generateQuickEdit: async (options) => {
    if (get().busy) return;
    const project = useDocStore.getState().doc;
    const prompt = (options?.prompt ?? get().quickEdit).trim();
    if (prompt.length < 2) {
      set({ error: { code: 'EMPTY_PROMPT', message: '描述一下想怎么改，例如“把沙发换成浅灰布艺”' } });
      return;
    }
    const selection = useUiStore.getState().selection;
    controller = new AbortController();
    set({
      busy: true,
      error: null,
      stage: { stage: 'requesting', label: 'AI 正在生成修改…' },
      patchResult: null,
      patchApplied: false,
    });
    try {
      const response = await requestDesignPatch({
        userPrompt: prompt,
        project,
        selection: {
          roomId: selection.kind === 'room' ? selection.ids[0] : undefined,
          itemIds: selection.kind === 'furniture' ? selection.ids : [],
        },
        signal: controller.signal,
      });
      const preview = executeDesignPatch(project, response.patch);
      set((state) => ({
        busy: false,
        lastPatch: response.patch,
        patchResult: preview,
        quickEdit: prompt,
        usage: addUsage(state.usage, response.usage),
        stage: { stage: 'done', label: '修改预览已生成' },
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        set({ busy: false, stage: initialStage });
        return;
      }
      set({ busy: false, stage: { stage: 'error', label: '修改生成失败' }, error: errorInfo(error, 'patch') });
    } finally {
      controller = null;
    }
  },

  applyPatchPreview: () => {
    const { lastPatch } = get();
    if (!lastPatch) return;
    const result = applyPatchToDoc(lastPatch);
    set({ patchResult: result, patchApplied: true, tab: 'brief', briefApplyResult: null });
  },

  applyBriefCandidate: (brief, mode) => {
    const state = get();
    const candidate = brief ?? state.candidates.find((item) => item.id === state.selectedBriefId);
    if (!candidate) return;
    const applyMode = mode ?? state.briefMode;
    const result = applyBriefToDoc(candidate, applyMode);
    set({ briefApplyResult: result, patchApplied: false, briefPreview: result });
  },

  discardBriefCandidate: () => set({ briefPreview: null, briefApplyResult: null, selectedBriefId: null }),

  undoLastAiChange: () => {
    const undone = undoAppliedAiChange();
    if (undone) {
      set((state) => ({
        patchApplied: false,
        briefApplyResult: null,
        briefPreview: state.candidates.length > 0 && state.selectedBriefId ? null : state.briefPreview,
      }));
      get().refreshBriefPreview();
    }
    return undone;
  },

  sendChat: async (text) => {
    if (get().busy) return;
    const project = useDocStore.getState().doc;
    const content = (text ?? get().chatInput).trim();
    if (!content) return;
    const userMessage: AiChatMessage = {
      id: nextMessageId(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: AiChatMessage = {
      id: nextMessageId(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    const history = [...get().messages, userMessage];
    controller = new AbortController();
    set({
      busy: true,
      error: null,
      tab: 'chat',
      chatInput: '',
      messages: [...history, assistantMessage],
      streamingMessageId: assistantMessage.id,
      stage: { stage: 'requesting', label: 'AI 正在回答…' },
    });
    try {
      const result = await streamAiChat({
        messages: history
          .filter((message) => message.role === 'user' || !message.error)
          .map((message) => ({ role: message.role, content: message.content }))
          .slice(-20),
        project,
        onDelta: (delta) => {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === assistantMessage.id ? { ...message, content: message.content + delta } : message,
            ),
          }));
        },
        signal: controller.signal,
      });
      set((state) => ({
        busy: false,
        streamingMessageId: null,
        stage: { stage: 'done', label: '' },
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: message.content || result, streaming: false }
            : message,
        ),
      }));
      void persistChat(project.id, get().messages);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        set({ busy: false, streamingMessageId: null, stage: initialStage });
        return;
      }
      const info = errorInfo(error, 'chat');
      set((state) => ({
        busy: false,
        streamingMessageId: null,
        stage: { stage: 'error', label: '回答失败' },
        error: info,
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                streaming: false,
                error: true,
                content: message.content || `回答失败：${info.message}`,
              }
            : message,
        ),
      }));
    } finally {
      controller = null;
    }
  },
}));

/** Thrown-away helper used by panels to know whether AI calls are possible. */
export function aiReady(state: Pick<AiState, 'config' | 'configError'>): boolean {
  return Boolean(state.config?.configured) && !state.configError;
}
