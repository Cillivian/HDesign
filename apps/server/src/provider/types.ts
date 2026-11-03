import { AiError } from '../ai/errors';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ThinkingMode = 'off' | 'on' | 'auto';

export interface CompleteRequest {
  /** System prompt. Must contain the word "json" when json=true (DeepSeek JSON mode requirement). */
  system: string;
  messages: ChatMessage[];
  images?: string[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  thinking?: ThinkingMode;
  /** Used by the mock provider to select a fixture. */
  task?: 'parse' | 'brief' | 'patch' | 'style' | 'chat';
  model?: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CompleteResult {
  content: string;
  usage?: Usage;
  model: string;
  mock?: boolean;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly visionModel: string;
  readonly configured: boolean;
  readonly mock: boolean;
  complete(request: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult>;
  stream(
    request: CompleteRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<CompleteResult>;
}

export function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function classifyAbort(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new AiError('AI_TIMEOUT', 'AI 请求超时，请稍后重试或换用更快的模型', 504);
  }
  return new AiError(
    'AI_UPSTREAM_ERROR',
    'AI 服务调用失败',
    502,
    error instanceof Error ? error.message : String(error),
  );
}
