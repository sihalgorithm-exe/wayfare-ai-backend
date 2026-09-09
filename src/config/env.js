import 'dotenv/config';

// Central place for reading environment configuration.
export const config = {
  port: Number(process.env.PORT || 4000),

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  llmProvider: process.env.LLM_PROVIDER || 'gemini',

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  },

  feasibilityEngineUrl: process.env.FEASIBILITY_ENGINE_URL || '',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
};

export function assertLLMConfigured() {
  if (config.llmProvider === 'anthropic' && !config.anthropic.apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env and fill it in.'
    );
  }

  if (config.llmProvider === 'gemini' && !config.gemini.apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add your Gemini API key to backend/.env.'
    );
  }
}