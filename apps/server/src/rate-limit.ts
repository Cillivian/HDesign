import type { MiddlewareHandler } from 'hono';
import { config } from './config';
import { AiError } from './ai/errors';

const hits = new Map<string, number[]>();

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'local';
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (hits.get(ip) ?? []).filter((time) => time > windowStart);
  if (timestamps.length >= config.rateLimitPerMin) {
    throw new AiError(
      'RATE_LIMITED',
      'AI 请求过于频繁',
      429,
      `每分钟最多 ${config.rateLimitPerMin} 次，请稍后重试`,
    );
  }
  timestamps.push(now);
  hits.set(ip, timestamps);
  if (hits.size > 2000) {
    for (const [key, value] of hits) {
      if (value.every((time) => time <= windowStart)) hits.delete(key);
    }
  }
  await next();
};
