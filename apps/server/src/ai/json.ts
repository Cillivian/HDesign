import { AiError } from './errors';

function stripFence(text: string): string {
  let value = text.trim();
  if (value.startsWith('```')) {
    value = value.replace(/^```(?:json|JSON)?\s*/, '');
    value = value.replace(/```\s*$/, '');
  }
  return value.trim();
}

/**
 * Extracts the first balanced JSON object/array from model output.
 * String-aware so braces inside quoted text do not confuse the scan.
 */
export function extractJson(text: string): unknown {
  const value = stripFence(text);
  const start = value.search(/[[{]/);
  if (start < 0) {
    throw new AiError('AI_NOT_JSON', 'AI 输出中没有 JSON', 502, undefined, [value.slice(0, 300)]);
  }
  const opening = value[start]!;
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        const candidate = value.slice(start, index + 1);
        try {
          return JSON.parse(candidate);
        } catch (error) {
          throw new AiError(
            'AI_INVALID_JSON',
            'AI 输出的 JSON 无法解析',
            502,
            undefined,
            [error instanceof Error ? error.message : String(error)],
          );
        }
      }
    }
  }
  throw new AiError('AI_INVALID_JSON', 'AI 输出的 JSON 不完整（可能被截断）', 502, '请减小输出或重试');
}
