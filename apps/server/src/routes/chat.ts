import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { aiChatRequestSchema } from '@hdesign/domain';
import { config } from '../config';
import { createProvider } from '../provider';
import { classifyAbort } from '../provider/types';
import { AiError } from '../ai/errors';
import { issues } from '../http';
import { buildChatSystemPrompt } from '../prompts/chat-system';

/**
 * Workstream F: SSE design chat.
 *
 * Wire format (consumed by apps/web api-client.streamChat):
 *   data: {"delta":"..."}
 *   ...
 *   data: [DONE]
 * On failure after the stream started: data: {"error":{code,message,hint}}
 * Client disconnects abort the upstream call. Message content is never logged.
 */
const router = new Hono();

const provider = createProvider(config);

function requireConfigured(): void {
  if (!config.configured) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      '尚未配置 AI 服务',
      503,
      '在仓库根目录 .env 中设置 AI_API_KEY（默认 DeepSeek），重启后生效；也可设置 AI_MOCK=1 用演示数据体验对话',
    );
  }
}

router.post('/chat', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiChatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '对话请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  const request = parsed.data;
  const system = buildChatSystemPrompt(request.projectSummary);

  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('X-Accel-Buffering', 'no');
  c.header('Connection', 'keep-alive');

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    const onClientGone = () => abort.abort();
    c.req.raw.signal.addEventListener('abort', onClientGone);

    // Preserve delta ordering: writeSSE is async but onDelta is sync.
    let writes: Promise<void> = Promise.resolve();
    const writeEvent = (data: string) => {
      writes = writes.then(() => stream.writeSSE({ data })).catch(() => undefined);
    };

    try {
      await provider.stream(
        {
          system,
          messages: request.messages,
          task: 'chat',
          thinking: 'off',
          temperature: 0.7,
          maxTokens: 2000,
        },
        (delta) => {
          if (delta) writeEvent(JSON.stringify({ delta }));
        },
        abort.signal,
      );
      await writes;
      if (!abort.signal.aborted) {
        writeEvent('[DONE]');
        await writes;
      }
    } catch (error) {
      const aiError = classifyAbort(error);
      await writes;
      if (!abort.signal.aborted) {
        writeEvent(
          JSON.stringify({
            error: { code: aiError.code, message: aiError.message, hint: aiError.hint },
          }),
        );
        await writes;
      }
    } finally {
      c.req.raw.signal.removeEventListener('abort', onClientGone);
    }
  });
});

export default router;
