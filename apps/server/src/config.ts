import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

function loadDotEnv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const equals = trimmed.indexOf('=');
        if (equals <= 0) continue;
        const key = trimmed.slice(0, equals).trim();
        let value = trimmed.slice(equals + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
      return;
    } catch {
      /* ignore malformed env files */
    }
  }
}

loadDotEnv();

const booleanish = z
  .union([z.string(), z.boolean(), z.number()])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8791),
  AI_PROVIDER: z.enum(['deepseek', 'openai-compat']).default('deepseek'),
  AI_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('deepseek-flash'),
  AI_REASONING_MODEL: z.string().default('deepseek-v4-pro'),
  AI_VISION_MODEL: z.string().optional(),
  AI_THINKING: z.enum(['off', 'auto']).default('off'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  AI_MAX_IMAGES: z.coerce.number().int().min(1).max(6).default(6),
  AI_MOCK: booleanish.default(false),
  ALLOWED_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(240).default(20),
  NODE_ENV: z.string().default('development'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`服务端环境变量无效：\n${issues.join('\n')}`);
}

const env = parsed.data;

export interface ServerConfig {
  port: number;
  provider: 'deepseek' | 'openai-compat';
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningModel: string;
  visionModel: string;
  thinking: 'off' | 'auto';
  timeoutMs: number;
  maxImages: number;
  mock: boolean;
  allowedOrigin: string;
  rateLimitPerMin: number;
  isProduction: boolean;
  configured: boolean;
}

export const config: ServerConfig = {
  port: env.PORT,
  provider: env.AI_PROVIDER,
  baseUrl: env.AI_BASE_URL.replace(/\/+$/, ''),
  apiKey: env.AI_API_KEY,
  model: env.AI_MODEL,
  reasoningModel: env.AI_REASONING_MODEL,
  visionModel: env.AI_VISION_MODEL ?? env.AI_MODEL,
  thinking: env.AI_THINKING,
  timeoutMs: env.AI_TIMEOUT_MS,
  maxImages: env.AI_MAX_IMAGES,
  mock: env.AI_MOCK,
  allowedOrigin: env.ALLOWED_ORIGIN,
  rateLimitPerMin: env.RATE_LIMIT_PER_MIN,
  isProduction: env.NODE_ENV === 'production',
  configured: env.AI_MOCK || env.AI_API_KEY.length > 0,
};
