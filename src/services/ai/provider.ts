import type { ModelConfig } from '../../types/ai';
import { OpenAICompatibleProvider } from './openai-compatible';

export function createProvider(config: ModelConfig): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(config);
}
