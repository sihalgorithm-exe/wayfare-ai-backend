import { config } from '../../config/env.js';
import * as anthropicProvider from './anthropicProvider.js';
import * as geminiProvider from './geminiProvider.js';

const providers = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

export function getProvider() {
  const provider = providers[config.llmProvider];

  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${config.llmProvider}". Available: ${Object.keys(providers).join(', ')}`
    );
  }

  return provider;
}