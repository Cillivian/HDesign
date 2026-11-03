import { Hono } from 'hono';
import { aiParseRequestSchema } from '@hdesign/domain';
import { config } from '../config';
import { AiError } from '../ai/errors';
import { issues } from '../http';

/**
 * Workstream C owns this route. Contract is fixed by aiParseRequestSchema / aiParseResponseSchema.
 * The stub keeps the error envelope stable while the CV + vision pipeline is being built.
 */
const router = new Hono();

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
      '在 .env 中设置 AI_API_KEY 后重启；本地 CV 识别与手工描图仍可使用',
    );
  }
  throw new AiError(
    'AI_NOT_IMPLEMENTED',
    '视觉识别接口正在接入',
    501,
    '本地识别结果可先通过 /api/ai/parse-plan 的同一契约返回',
  );
});

export default router;
