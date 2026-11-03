import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatProvider } from '../src/provider/openai-compat';
import type { ServerConfig } from '../src/config';
import { AiError } from '../src/ai/errors';

const baseConfig: ServerConfig = {
  port: 8791,
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  model: 'deepseek-flash',
  reasoningModel: 'deepseek-v4-pro',
  visionModel: 'deepseek-flash',
  thinking: 'off',
  timeoutMs: 10_000,
  maxImages: 6,
  mock: false,
  allowedOrigin: 'http://localhost:5173',
  rateLimitPerMin: 20,
  isProduction: false,
  configured: true,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAiCompatProvider', () => {
  it('sends DeepSeek-compatible JSON mode, thinking=off and images in the user message', async () => {
    const fetchMock = vi.fn(async () => response({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatProvider(baseConfig);
    const result = await provider.complete({
      system: 'output json',
      messages: [{ role: 'user', content: '读取图纸' }],
      images: ['data:image/png;base64,AAAA'],
      json: true,
      temperature: 0.1,
      thinking: 'off',
    });

    expect(result.content).toBe('{"ok":true}');
    expect(result.usage?.totalTokens).toBe(14);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(init.body)) as {
      model: string;
      response_format: { type: string };
      thinking: { type: string };
      temperature: number;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe('deepseek-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.temperature).toBe(0.1);
    const userMessage = body.messages.find((message) => message.role === 'user')!;
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(JSON.stringify(userMessage.content)).toContain('image_url');
  });

  it('does not send response_format for plain text completions', async () => {
    const fetchMock = vi.fn(async () => response({ choices: [{ message: { content: 'hello' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiCompatProvider(baseConfig);
    await provider.complete({ system: 'be helpful', messages: [{ role: 'user', content: 'hi' }] });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(body.response_format).toBeUndefined();
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('maps upstream HTTP errors to typed errors with hints', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));
    const provider = new OpenAiCompatProvider(baseConfig);
    await expect(
      provider.complete({ system: 'json', messages: [{ role: 'user', content: 'hi' }], json: true }),
    ).rejects.toMatchObject({ code: 'AI_HTTP_401', status: 502 });
  });

  it('rejects an unconfigured provider without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiCompatProvider({ ...baseConfig, apiKey: '', configured: false });
    await expect(provider.complete({ system: 'x', messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams SSE deltas and captures usage', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"好"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })),
    );
    const provider = new OpenAiCompatProvider(baseConfig);
    const deltas: string[] = [];
    const result = await provider.stream(
      { system: 'chat', messages: [{ role: 'user', content: 'hi' }], thinking: 'off' },
      (delta) => deltas.push(delta),
    );
    expect(deltas.join('')).toBe('你好');
    expect(result.content).toBe('你好');
    expect(result.usage?.totalTokens).toBe(4);
  });
});
