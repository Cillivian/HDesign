import { describe, expect, it } from 'vitest';
import { extractJson } from '../src/ai/json';
import { AiError } from '../src/ai/errors';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences and surrounding prose', () => {
    expect(extractJson('好的，结果如下：\n```json\n{"name":"客厅"}\n```')).toEqual({ name: '客厅' });
  });

  it('ignores braces inside strings', () => {
    expect(extractJson('{"note":"a } b","ok":true}')).toEqual({ note: 'a } b', ok: true });
  });

  it('parses arrays', () => {
    expect(extractJson('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('rejects truncated JSON with a typed error', () => {
    try {
      extractJson('{"a":1');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe('AI_INVALID_JSON');
    }
  });

  it('rejects output without JSON', () => {
    expect(() => extractJson('没有结构化数据')).toThrow(AiError);
  });
});
