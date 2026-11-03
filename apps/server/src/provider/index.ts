import type { ServerConfig } from '../config';
import { OpenAiCompatProvider } from './openai-compat';
import { MockProvider } from './mock';
import type { AiProvider } from './types';

export function createProvider(cfg: ServerConfig): AiProvider {
  return cfg.mock ? new MockProvider() : new OpenAiCompatProvider(cfg);
}

export { OpenAiCompatProvider, MockProvider };
export type { AiProvider };
