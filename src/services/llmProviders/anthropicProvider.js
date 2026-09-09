import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/env.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

// Every provider module exports the same shape: an async complete(system, user)
// that returns raw text. aiPlannerService.js never imports @anthropic-ai/sdk
// (or any other provider SDK) directly -- see llmProviders/index.js.
export async function complete(systemPrompt, userPrompt) {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
