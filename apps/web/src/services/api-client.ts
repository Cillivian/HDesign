import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;
  readonly details?: string[];

  constructor(message: string, status: number, code = 'API_ERROR', hint?: string, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

interface Envelope {
  error?: { code?: string; message?: string; hint?: string; details?: string[] };
}

async function readError(response: Response): Promise<ApiError> {
  const envelope = (await response.json().catch(() => null)) as Envelope | null;
  const error = envelope?.error;
  return new ApiError(
    error?.message ?? `请求失败（HTTP ${response.status}）`,
    response.status,
    error?.code ?? `HTTP_${response.status}`,
    error?.hint,
    error?.details,
  );
}

export async function postJson<T>(
  path: string,
  body: unknown,
  options: { schema?: z.ZodType<T>; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) throw await readError(response);
  const data = (await response.json()) as unknown;
  if (options.schema) {
    const parsed = options.schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(
        'AI 返回的数据格式不正确',
        response.status,
        'INVALID_RESPONSE',
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
    }
    return parsed.data;
  }
  return data as T;
}

export interface HealthInfo {
  status: string;
  version: string;
  ai: {
    configured: boolean;
    provider: string;
    model: string;
    visionModel?: string;
    mock: boolean;
  };
}

export async function fetchHealth(): Promise<HealthInfo> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new ApiError('API 服务不可用', response.status, 'HEALTH_FAILED');
  }
  return (await response.json()) as HealthInfo;
}

/**
 * Minimal SSE reader for text deltas. The server emits `data: {"delta":"..."}` events.
 * Returns the full text; throws ApiError on HTTP failures.
 */
export async function streamChat(
  path: string,
  body: unknown,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await readError(response);
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('AI 流式响应为空', 502, 'EMPTY_STREAM');
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload) as { delta?: string; error?: { message?: string } };
            if (event.error?.message) throw new ApiError(event.error.message, 502, 'AI_STREAM_ERROR');
            if (event.delta) {
              text += event.delta;
              onDelta(event.delta);
            }
          } catch (error) {
            if (error instanceof ApiError) throw error;
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
