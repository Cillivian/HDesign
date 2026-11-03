import type { ServerConfig } from '../config';
import { AiError } from '../ai/errors';
import {
  classifyAbort,
  mergeSignals,
  type AiProvider,
  type CompleteRequest,
  type CompleteResult,
  type Usage,
} from './types';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'original' } };

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

function toUsage(raw: unknown): Usage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const value = (key: string) => (typeof record[key] === 'number' ? (record[key] as number) : undefined);
  return {
    inputTokens: value('prompt_tokens'),
    outputTokens: value('completion_tokens'),
    totalTokens: value('total_tokens'),
  };
}

function buildMessages(request: CompleteRequest): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: 'system', content: request.system }];
  const images = request.images ?? [];
  const lastUserIndex = [...request.messages].reverse().findIndex((message) => message.role === 'user');
  const resolvedLastUser = lastUserIndex === -1 ? -1 : request.messages.length - 1 - lastUserIndex;

  request.messages.forEach((message, index) => {
    if (images.length > 0 && index === resolvedLastUser) {
      messages.push({
        role: message.role,
        content: [
          { type: 'text', text: message.content },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url, detail: 'original' as const } })),
        ],
      });
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  });

  if (images.length > 0 && resolvedLastUser === -1) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: '请分析随附图纸。' },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url, detail: 'original' as const } })),
      ],
    });
  }
  return messages;
}

export class OpenAiCompatProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  readonly visionModel: string;
  readonly mock = false;

  constructor(private readonly cfg: ServerConfig) {
    this.name = cfg.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI 兼容端点';
    this.model = cfg.model;
    this.visionModel = cfg.visionModel;
  }

  get configured(): boolean {
    return this.cfg.apiKey.length > 0;
  }

  private endpoint(): string {
    return `${this.cfg.baseUrl}/chat/completions`;
  }

  private buildBody(request: CompleteRequest, stream: boolean): Record<string, unknown> {
    const thinkingEnabled =
      this.cfg.provider === 'deepseek' && (request.thinking ?? this.cfg.thinking) !== 'off';
    const model = request.model ?? (request.images?.length ? this.visionModel : this.model);
    const body: Record<string, unknown> = {
      model,
      messages: buildMessages(request),
      max_tokens: request.maxTokens ?? 8000,
      stream,
    };
    if (request.json) body.response_format = { type: 'json_object' };
    if (this.cfg.provider === 'deepseek') {
      body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
      if (thinkingEnabled) body.reasoning_effort = 'high';
    }
    if (!thinkingEnabled) body.temperature = request.temperature ?? 0.4;
    return body;
  }

  private async request(
    request: CompleteRequest,
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    if (!this.configured) {
      throw new AiError(
        'AI_NOT_CONFIGURED',
        '尚未配置 AI 服务',
        503,
        '在仓库根目录 .env 中设置 AI_API_KEY（默认 DeepSeek），重启服务后生效',
      );
    }
    const response = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(this.buildBody(request, stream)),
      signal: mergeSignals(signal, this.cfg.timeoutMs),
    }).catch((error: unknown) => {
      throw classifyAbort(error);
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const hint =
        response.status === 401
          ? '检查 AI_API_KEY 是否正确'
          : response.status === 402
            ? '账户余额不足'
            : response.status === 429
              ? '请求过于频繁或额度受限，请稍后重试'
              : response.status === 400
                ? '请求参数被上游拒绝（可能是模型名或图片格式不支持）'
                : undefined;
      throw new AiError(
        `AI_HTTP_${response.status}`,
        `AI 服务返回 ${response.status}`,
        502,
        hint,
        [text.slice(0, 600)],
      );
    }
    return response;
  }

  async complete(request: CompleteRequest, signal?: AbortSignal): Promise<CompleteResult> {
    const response = await this.request(request, false, signal);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
      throw new AiError(
        'AI_EMPTY_RESPONSE',
        'AI 返回了空内容',
        502,
        'JSON 模式下偶发空响应，请重试；若持续出现，请调整提示词或模型',
      );
    }
    return {
      content,
      usage: toUsage(data.usage),
      model: data.model ?? request.model ?? this.model,
    };
  }

  async stream(
    request: CompleteRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<CompleteResult> {
    const response = await this.request(request, true, signal);
    const body = response.body;
    if (!body) throw new AiError('AI_EMPTY_STREAM', 'AI 流式响应为空', 502);
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let usage: Usage | undefined;
    let model = request.model ?? this.model;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of rawEvent.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const event = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
                usage?: unknown;
                model?: string;
              };
              const delta = event.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                content += delta;
                onDelta(delta);
              }
              if (event.usage) usage = toUsage(event.usage);
              if (event.model) model = event.model;
            } catch {
              /* ignore malformed keep-alive chunks */
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      throw classifyAbort(error);
    } finally {
      reader.releaseLock();
    }

    if (!content.trim()) {
      throw new AiError('AI_EMPTY_RESPONSE', 'AI 流式回答为空', 502, '请重试一次');
    }
    return { content, usage, model };
  }
}
