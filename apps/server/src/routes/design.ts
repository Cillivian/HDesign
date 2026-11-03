import { Hono } from 'hono';
import { z } from 'zod';
import {
  aiBriefRequestSchema,
  aiBriefResponseSchema,
  aiPatchRequestSchema,
  aiPatchResponseSchema,
  aiStyleRequestSchema,
  aiStyleResponseSchema,
  designBriefSchema,
  designPatchSchema,
  styleTokensSchema,
} from '@hdesign/domain';
import { config } from '../config';
import { createProvider } from '../provider';
import { completeValidated } from '../ai/validate';
import { AiError } from '../ai/errors';
import { issues } from '../http';
import { buildDesignBriefPrompt } from '../prompts/design-brief';
import { buildDesignPatchPrompt } from '../prompts/design-patch';
import { buildStyleFromImagePrompt } from '../prompts/style-from-image';

/**
 * Workstream F: natural-language design endpoints.
 * Contracts are fixed by packages/domain/src/ai.ts; prompts live in ../prompts.
 */
const router = new Hono();

const provider = createProvider(config);

/** Wrapper so one call can return 1–3 brief variants (contract caps at 3). */
const briefsEnvelopeSchema = z.object({
  briefs: z.array(designBriefSchema).min(1).max(3),
});

const styleEnvelopeSchema = z.object({
  name: z.string().max(40),
  tokens: styleTokensSchema,
  materials: z.array(z.string()).default([]),
  mood: z.string().max(300).default(''),
  rationale: z.string().max(1200).default(''),
});

function requireConfigured(): void {
  if (!config.configured) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      '尚未配置 AI 服务',
      503,
      '在仓库根目录 .env 中设置 AI_API_KEY（默认 DeepSeek），重启后生效；也可设置 AI_MOCK=1 用演示数据体验流程',
    );
  }
}

/** Model output sometimes reuses ids; keep response schema-valid and deterministic. */
function normalizeBriefIds<T extends { id: string }>(briefs: T[]): T[] {
  const seen = new Set<string>();
  return briefs.map((brief, index) => {
    const raw = brief.id.trim();
    let id = raw || `brief-${index + 1}`;
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return { ...brief, id };
  });
}

router.post('/brief', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiBriefRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '设计方案请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  const request = parsed.data;
  const prompt = buildDesignBriefPrompt(request);

  const result = await completeValidated({
    provider,
    request: {
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      images: request.referenceImage ? [request.referenceImage] : undefined,
      json: true,
      thinking: 'off',
      task: 'brief',
      temperature: 0.8,
      maxTokens: 8000,
    },
    schema: briefsEnvelopeSchema,
    signal: c.req.raw.signal,
  });

  const briefs = normalizeBriefIds(result.data.briefs).slice(0, request.variantCount);
  return c.json(
    aiBriefResponseSchema.parse({
      briefs,
      model: result.model,
      usage: result.usage,
      mock: result.mock,
    }),
  );
});

router.post('/patch', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiPatchRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '设计修改请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  const request = parsed.data;
  const prompt = buildDesignPatchPrompt(request);

  const result = await completeValidated({
    provider,
    request: {
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      json: true,
      thinking: 'off',
      task: 'patch',
      temperature: 0.3,
      maxTokens: 4000,
    },
    schema: designPatchSchema,
    signal: c.req.raw.signal,
  });

  return c.json(
    aiPatchResponseSchema.parse({
      patch: result.data,
      model: result.model,
      usage: result.usage,
      mock: result.mock,
    }),
  );
});

router.post('/style-from-image', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = aiStyleRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AiError('INVALID_REQUEST', '参考图请求不合法', 400, undefined, issues(parsed.error));
  }
  requireConfigured();
  const request = parsed.data;
  const prompt = buildStyleFromImagePrompt(request);

  const result = await completeValidated({
    provider,
    request: {
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      images: [request.image],
      json: true,
      thinking: 'off',
      task: 'style',
      temperature: 0.4,
      maxTokens: 2000,
      model: config.visionModel,
    },
    schema: styleEnvelopeSchema,
    signal: c.req.raw.signal,
  });

  return c.json(
    aiStyleResponseSchema.parse({
      style: result.data,
      model: result.model,
      usage: result.usage,
      mock: result.mock,
    }),
  );
});

export default router;
