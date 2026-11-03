import { Hono } from 'hono';
import { config } from '../config';

const router = new Hono();

router.get('/health', (c) =>
  c.json({
    status: 'ok',
    version: '0.1.0',
    ai: {
      configured: config.configured,
      provider: config.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI 兼容端点',
      model: config.model,
      visionModel: config.visionModel,
      mock: config.mock,
    },
  }),
);

export default router;
