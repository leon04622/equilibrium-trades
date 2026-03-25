import OpenAI from "openai";

let cached: OpenAI | null = null;

function resolveApiKey(): string | undefined {
  const k =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  return k || undefined;
}

/** Safe at import time — returns null if no key configured. */
export function getOpenAIOrNull(): OpenAI | null {
  const apiKey = resolveApiKey();
  if (!apiKey) return null;
  if (!cached) {
    cached = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return cached;
}

export function requireOpenAI(): OpenAI {
  const c = getOpenAIOrNull();
  if (!c) {
    throw new Error(
      "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY in .env"
    );
  }
  return c;
}
