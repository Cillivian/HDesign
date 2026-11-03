import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AiError } from '../ai/errors';
import type {
  AiProvider,
  CompleteRequest,
  CompleteResult,
  Usage,
} from './types';

const FIXTURES_DIR = fileURLToPath(new URL('../../../../fixtures/ai/', import.meta.url));

/**
 * Deterministic provider for e2e tests and offline demos.
 * It never pretends to be a real model: responses carry mock=true.
 */
export class MockProvider implements AiProvider {
  readonly name = 'Mock（演示数据）';
  readonly model = 'deepseek-mock';
  readonly visionModel = 'deepseek-mock';
  readonly configured = true;
  readonly mock = true;

  private async fixture(request: CompleteRequest): Promise<{ content: string; usage: Usage }> {
    const task = request.task ?? 'chat';
    const file = join(FIXTURES_DIR, `${task}.json`);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      throw new AiError(
        'AI_MOCK_FIXTURE_MISSING',
        `演示数据缺失：${task}.json`,
        503,
        'AI_MOCK=1 时需要 fixtures/ai 下的对应响应文件',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AiError('AI_MOCK_INVALID', `演示数据无效：${task}.json`, 500);
    }
    const container =
      parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)
        ? (parsed as { data: unknown }).data
        : parsed;
    const content = typeof container === 'string' ? container : JSON.stringify(container);
    return {
      content,
      usage: {
        inputTokens: request.system.length,
        outputTokens: content.length,
        totalTokens: request.system.length + content.length,
      },
    };
  }

  async complete(request: CompleteRequest): Promise<CompleteResult> {
    const { content, usage } = await this.fixture(request);
    return { content, usage, model: this.model, mock: true };
  }

  async stream(
    request: CompleteRequest,
    onDelta: (delta: string) => void,
  ): Promise<CompleteResult> {
    const { content, usage } = await this.fixture(request);
    const size = 24;
    for (let index = 0; index < content.length; index += size) {
      onDelta(content.slice(index, index + size));
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    return { content, usage, model: this.model, mock: true };
  }
}
