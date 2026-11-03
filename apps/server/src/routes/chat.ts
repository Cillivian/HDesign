import { Hono } from 'hono';
import { aiChatRequestSchema } from '@hdesign/domain';
import { config } from '../config';
import { AiError } from '../ai/errors';
import { issues } from '../http';

/** Workstream F owns this SSE chat route. */
const router = new Hono();

router.post('/chat', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiChatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '对话请求不合法', 400, undefined, issues(parsed.error));
  }
  if (!config.configured) {
    throw new AiError('AI_NOT_CONFIGURED', '尚未配置 AI 服务', 503, '设置 AI_API_KEY 后可用对话');
  }
  throw new AiError('AI_NOT_IMPLEMENTED', '设计助手对话正在接入', 501);
});

export default router;
