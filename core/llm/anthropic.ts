import { ZodSchema } from "zod";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
// Sonnet for quality — overridable via CREATOR_MODEL env var
const DEFAULT_CREATOR_MODEL = "claude-sonnet-4-5";

type CallAnthropicOptions<T> = {
  schema: ZodSchema<T>;
  system?: string;
  model?: string;
  maxTokens?: number;
  fallback: () => T;
};

export async function callAnthropicLLM<T>(prompt: string, options: CallAnthropicOptions<T>): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info("[Deckspert][Anthropic] ANTHROPIC_API_KEY missing, using local fallback");
    return options.schema.parse(options.fallback());
  }

  const model = options.model ?? process.env.CREATOR_MODEL ?? DEFAULT_CREATOR_MODEL;
  const system =
    options.system ??
    "You are Deckspert Creator, a structured business storytelling assistant. Return only valid JSON — no markdown, no code fences.";
  const maxTokens = options.maxTokens ?? 8192;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const raw = json.content.find((block) => block.type === "text")?.text ?? "";

  if (!raw.trim()) {
    throw new Error("Anthropic returned an empty response");
  }

  // Strip markdown code fences if the model wrapped the JSON
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  try {
    const parsed = JSON.parse(stripped) as unknown;
    return options.schema.parse(parsed);
  } catch (parseError) {
    console.warn("[Deckspert][Anthropic] Response parse/schema failed, using fallback", {
      error: parseError instanceof Error ? parseError.message : parseError,
      raw: stripped.slice(0, 200)
    });
    return options.schema.parse(options.fallback());
  }
}
