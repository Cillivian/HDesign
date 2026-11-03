import { Hono } from 'hono';
import { config } from '../config';
import { aiConfigSchema } from '@hdesign/domain';
import parseRoutes from './parse';
import designRoutes from './design';
import chatRoutes from './chat';

const router = new Hono();

router.get('/config', (c) =>
  c.json(
    aiConfigSchema.parse({
      configured: config.configured,
      provider: config.provider,
      model: config.model,
      reasoningModel: config.reasoningModel,
      visionModel: config.visionModel,
      mock: config.mock,
      limits: { maxImages: config.maxImages, timeoutMs: config.timeoutMs },
    }),
  ),
);

router.route('/', parseRoutes);
router.route('/', designRoutes);
router.route('/', chatRoutes);

export default router;
