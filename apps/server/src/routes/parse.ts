import { Hono } from 'hono';
import { aiParseRequestSchema, aiParseResponseSchema, parseDraftSchema } from '@hdesign/domain';
import { config } from '../config';
import { AiError } from '../ai/errors';
import { issues } from '../http';
import { createProvider } from '../provider';
import { completeValidated } from '../ai/validate';
import { buildParsePlanPrompt } from '../prompts/parse-plan';

/**
 * Workstream C: `/api/ai/parse-plan`.
 *
 * Vision is optional: when AI_API_KEY is missing this returns 503 AI_NOT_CONFIGURED
 * and the client keeps using local CV + manual tracing. Never returns fake results.
 * Contract: aiParseRequestSchema -> aiParseResponseSchema (packages/domain/src/ai.ts).
 */
const router = new Hono();

const provider = createProvider(config);

router.post('/parse-plan', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiParseRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '图纸识别请求不合法', 400, undefined, issues(parsed.error));
  }
  if (!config.configured) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      '视觉识别需要配置 DeepSeek API',
      503,
      '在仓库根目录 .env 中设置 AI_API_KEY 后重启；本地 CV 识别与手工描图不受影响',
    );
  }

  const request = parsed.data;
  if (request.images.length > config.maxImages) {
    throw new AiError(
      'INVALID_REQUEST',
      `一次最多提交 ${config.maxImages} 张图片`,
      400,
      '请减少局部放大图数量后重试',
    );
  }
  const prompt = buildParsePlanPrompt(request);

  const result = await completeValidated({
    provider,
    request: {
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      // Vision inputs are only allowed in the user message; the provider adapter
      // attaches them to the last user turn.
      images: request.images.map((image) => image.dataUrl),
      json: true,
      thinking: 'off',
      task: 'parse',
      temperature: 0.2,
      maxTokens: 6000,
      model: config.visionModel,
    },
    schema: parseDraftSchema,
    signal: c.req.raw.signal,
  });

  return c.json(
    aiParseResponseSchema.parse({
      draft: result.data,
      model: result.model,
      usage: result.usage,
      mock: result.mock,
    }),
  );
});

export default router;
