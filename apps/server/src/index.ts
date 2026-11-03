import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { config } from './config';
import healthRoutes from './routes/health';
import aiRoutes from './routes/ai';
import { AiError } from './ai/errors';
import { issues } from './http';
import { rateLimit } from './rate-limit';

const app = new Hono();

app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: config.allowedOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86_400,
  }),
);
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 12 * 1024 * 1024,
    onError: (c) =>
      c.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体超过 12MB 限制' } },
        413,
      ),
  }),
);
app.use('/api/ai/*', rateLimit);

app.route('/api', healthRoutes);
app.route('/api/ai', aiRoutes);
app.all('/api/*', (c) =>
  c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404),
);

app.onError((error, c) => {
  if (error instanceof AiError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        },
      },
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: '请求数据不合法',
          hint: issues(error).join('; '),
        },
      },
      400,
    );
  }
  console.error('[hdesign] unhandled error', error);
  return c.json({ error: { code: 'INTERNAL', message: '服务端内部错误' } }, 500);
});

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (config.isProduction && existsSync(webDist)) {
  app.use('*', serveStatic({ root: webDist }));
  const indexHtml = readFileSync(join(webDist, 'index.html'), 'utf8');
  app.get('*', (c) => c.html(indexHtml));
}

app.notFound((c) => c.text('Not Found', 404));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  const aiState = config.configured
    ? config.mock
      ? 'mock 演示'
      : `已连接 ${config.provider}/${config.model}`
    : '未配置（可继续使用 CAD 与本地功能）';
  console.log(`[hdesign] API http://localhost:${info.port} · AI ${aiState}`);
});
