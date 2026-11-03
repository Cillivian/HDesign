import type { ZodType } from 'zod';
import type { AiProvider, CompleteRequest, Usage } from '../provider/types';
import { AiError } from './errors';
import { extractJson } from './json';

export interface ValidatedResult<T> {
  data: T;
  usage?: Usage;
  model: string;
  mock: boolean;
  attempts: number;
}

/**
 * Calls the model in JSON mode, validates against a zod schema, and retries once
 * with the validation errors fed back to the model. Upstream errors are preserved.
 */
export async function completeValidated<T>(options: {
  provider: AiProvider;
  request: CompleteRequest;
  schema: ZodType<T>;
  signal?: AbortSignal;
}): Promise<ValidatedResult<T>> {
  const { provider, schema, signal } = options;
  const request: CompleteRequest = {
    ...options.request,
    json: true,
    system: /json/i.test(options.request.system)
      ? options.request.system
      : `${options.request.system}\n请只输出 json。`,
  };
  let messages = [...request.messages];
  let lastIssue = '未知校验错误';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let result;
    try {
      result = await provider.complete({ ...request, messages }, signal);
    } catch (error) {
      if (
        error instanceof AiError &&
        error.code === 'AI_EMPTY_RESPONSE' &&
        attempt === 0
      ) {
        continue;
      }
      throw error;
    }

    try {
      const parsedJson = extractJson(result.content);
      const parsed = schema.safeParse(parsedJson);
      if (parsed.success) {
        return {
          data: parsed.data,
          usage: result.usage,
          model: result.model,
          mock: Boolean(result.mock),
          attempts: attempt + 1,
        };
      }
      lastIssue = parsed.error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : String(error);
    }

    if (attempt >= 1) break;
    messages = [
      ...messages,
      { role: 'assistant', content: result.content.slice(0, 4000) },
      {
        role: 'user',
        content: `上一次输出未通过结构校验：${lastIssue}。请只输出符合给定 JSON schema 的 json，不要包含解释、Markdown 或代码块。`,
      },
    ];
  }

  throw new AiError(
    'AI_INVALID_OUTPUT',
    'AI 输出未通过结构校验',
    502,
    '可以重试，或在设置中换用推理能力更强的模型',
    [lastIssue],
  );
}
