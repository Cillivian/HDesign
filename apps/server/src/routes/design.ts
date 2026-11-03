import { Hono } from 'hono';
import {
  aiBriefRequestSchema,
  aiPatchRequestSchema,
  aiStyleRequestSchema,
} from '@hdesign/domain';
import { config } from '../config';
import { AiError } from '../ai/errors';
import { issues } from '../http';

/**
 * Workstream F owns these routes. Contracts are fixed by domain/ai.ts.
 * Stubs validate input and return explicit, non-fake errors until the prompts land.
 */
const router = new Hono();

function requireConfigured(): void {
  if (!config.configured) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      '尚未配置 AI 服务',
      503,
      '在仓库根目录 .env 中设置 AI_API_KEY（默认 DeepSeek），重启后生效；也可用演示数据体验流程',
    );
  }
}

router.post('/brief', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiBriefRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '设计方案请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  throw new AiError('AI_NOT_IMPLEMENTED', '自然语言方案接口正在接入', 501);
});

router.post('/patch', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiPatchRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '设计修改请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  throw new AiError('AI_NOT_IMPLEMENTED', '自然语言修改接口正在接入', 501);
});

router.post('/style-from-image', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiStyleRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '参考图请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  throw new AiError('AI_NOT_IMPLEMENTED', '参考图风格接口正在接入', 501);
});

export default router;
