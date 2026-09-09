import { GoogleGenAI } from '@google/genai';

import { config } from '../../config/env.js';

const client = new GoogleGenAI({
  apiKey: config.gemini.apiKey,
});

// Every provider exports the same shape:
// complete(systemPrompt, userPrompt) -> Promise<string>

export async function complete(systemPrompt, userPrompt) {
  const response = await client.models.generateContent({
    model: config.gemini.model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 1000,
    },
  });

  return response.text || '';
}