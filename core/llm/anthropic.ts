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

  // Models sometimes prepend a sentence ("Here's the JSON:") or append commentary
  // around the JSON block. Pull out the first balanced top-level {...} object.
  const candidate = extractFirstJsonObject(stripped) ?? stripped;

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return options.schema.parse(parsed);
  } catch (parseError) {
    const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
    // Single-line log: Vercel MCP only surfaces the first console.warn per
    // invocation (see commit b7a7ad30). Pack the raw response excerpt and
    // error into one line so the full context survives. Tight prefix so the
    // important bits stay within Vercel's truncation window.
    const rawExcerpt = candidate.replace(/\s+/g, " ").slice(0, 500);
    const errExcerpt = errMsg.replace(/\s+/g, " ").slice(0, 300);
    console.warn(`[LLM-FAIL] raw=${rawExcerpt} :: err=${errExcerpt}`);
    return options.schema.parse(options.fallback());
  }
}

// Extract the first balanced JSON object from a string. Handles leading/trailing
// commentary. Skips braces that appear inside string literals. Returns null if
// no balanced object is found.
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
