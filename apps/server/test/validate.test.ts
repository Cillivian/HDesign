import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completeValidated } from '../src/ai/validate';
import { AiError } from '../src/ai/errors';
import type { AiProvider, CompleteRequest, CompleteResult } from '../src/provider/types';

const schema = z.object({ value: z.number().int() });

class StubProvider implements AiProvider {
  readonly name = 'stub';
  readonly model = 'stub-model';
  readonly visionModel = 'stub-model';
  readonly configured = true;
  readonly mock = true;
  calls = 0;
  constructor(private readonly responses: Array<string | Error>) {}

  async complete(): Promise<CompleteResult> {
    const response = this.responses[Math.min(this.calls, this.responses.length - 1)];
    this.calls += 1;
    if (response instanceof Error) throw response;
    return { content: response!, model: this.model, mock: true };
  }

  async stream(_request: CompleteRequest, onDelta: (delta: string) => void): Promise<CompleteResult> {
    const result = await this.complete();
    onDelta(result.content);
    return result;
  }
}

const request: CompleteRequest = {
  system: '请输出 json',
  messages: [{ role: 'user', content: '返回 value' }],
};

describe('completeValidated', () => {
  it('returns validated data', async () => {
    const provider = new StubProvider(['{"value": 3}']);
    const result = await completeValidated({ provider, request, schema });
    expect(result.data.value).toBe(3);
    expect(result.attempts).toBe(1);
  });

  it('repairs an invalid response with a second call', async () => {
    const provider = new StubProvider(['{"value": "three"}', '{"value": 3}']);
    const result = await completeValidated({ provider, request, schema });
    expect(result.data.value).toBe(3);
    expect(result.attempts).toBe(2);
    expect(provider.calls).toBe(2);
  });

  it('retries once on an empty response', async () => {
    const provider = new StubProvider([
      new AiError('AI_EMPTY_RESPONSE', 'empty', 502),
      '{"value": 7}',
    ]);
    const result = await completeValidated({ provider, request, schema });
    expect(result.data.value).toBe(7);
    expect(provider.calls).toBe(2);
  });

  it('fails after two invalid outputs', async () => {
    const provider = new StubProvider(['nope', 'still not json']);
    await expect(completeValidated({ provider, request, schema })).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
    expect(provider.calls).toBe(2);
  });

  it('does not swallow upstream errors', async () => {
    const provider = new StubProvider([new AiError('AI_HTTP_429', 'rate limited', 502)]);
    await expect(completeValidated({ provider, request, schema })).rejects.toMatchObject({
      code: 'AI_HTTP_429',
    });
  });
});
