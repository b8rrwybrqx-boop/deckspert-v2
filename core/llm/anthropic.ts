import { ZodSchema } from "zod";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
// Sonnet 5 for quality, overridable via CREATOR_MODEL env var
const DEFAULT_CREATOR_MODEL = "claude-sonnet-5";

const DEFAULT_MAX_TOKENS = 8192;
// Ceiling for the escalated retry after a max_tokens truncation. Kept modest so
// a rejected value can only ever cost one attempt, never the whole call.
const ESCALATED_MAX_TOKENS_CAP = 16384;
const MAX_ATTEMPTS = 3;
// vercel.json allows these functions 300s. A large outline generation runs
// 60-90s, so three unconditional attempts could blow the ceiling and turn a
// recoverable failure into a 504. Only start another attempt when enough of the
// window remains for it to plausibly finish.
const TOTAL_TIME_BUDGET_MS = 240_000;
const ASSUMED_ATTEMPT_MS = 90_000;

// Transient upstream conditions. 529 is Anthropic's "overloaded"; under
// concurrency it surfaced as a user-facing 400 because the old code threw on
// the first non-ok response with no retry.
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

type CallAnthropicOptions<T> = {
  schema: ZodSchema<T>;
  system?: string;
  model?: string;
  maxTokens?: number;
  fallback: () => T;
};

type AnthropicResponse = {
  content: Array<{ type: string; text: string }>;
  stop_reason?: string;
  usage?: { output_tokens?: number; input_tokens?: number };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Shared request/parse/retry core.
 *
 * Previously a single attempt whose every failure mode ended in the caller's
 * fallback returned behind a 200, so a failed generation was indistinguishable
 * from a good one: StoryBuild rendered "[Bullet N, pending generation]" next to
 * real headlines copied from the storyline and looked like it had worked.
 *
 * Now failures retry, and an exhausted retry throws rather than quietly
 * returning placeholders. The routes already translate a thrown error into a
 * 400 the UI surfaces, so a broken generation reads as broken. The fallback is
 * reserved for the one genuinely-degraded-by-config case: no API key.
 */
async function callAnthropic<T>(
  messageContent: unknown,
  options: CallAnthropicOptions<T>,
  extraHeaders: Record<string, string>,
  label: string
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info("[Deckspert][Anthropic] ANTHROPIC_API_KEY missing, using local fallback");
    return options.schema.parse(options.fallback());
  }

  const model = options.model ?? process.env.CREATOR_MODEL ?? DEFAULT_CREATOR_MODEL;
  const system =
    options.system ??
    "You are Deckspert Creator, a structured business storytelling assistant. Return only valid JSON, no markdown, no code fences.";
  const baseMaxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  let maxTokens = baseMaxTokens;
  let lastFailure = "unknown";
  const startedAt = Date.now();
  const hasTimeForAnotherAttempt = () =>
    Date.now() - startedAt + ASSUMED_ATTEMPT_MS < TOTAL_TIME_BUDGET_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: messageContent }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastFailure = `http ${response.status}`;
      // An escalated max_tokens the model rejects must not burn the remaining
      // attempts, so drop back to the value already known to work.
      if (maxTokens !== baseMaxTokens && response.status === 400) {
        console.warn(`[LLM-RETRY] ${label} escalated max_tokens rejected, reverting to ${baseMaxTokens}`);
        maxTokens = baseMaxTokens;
        continue;
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS && hasTimeForAnotherAttempt()) {
        console.warn(`[LLM-RETRY] ${label} attempt ${attempt} http ${response.status}, retrying`);
        await sleep(500 * attempt);
        continue;
      }
      throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as AnthropicResponse;
    const raw = json.content.find((block) => block.type === "text")?.text ?? "";

    if (!raw.trim()) {
      lastFailure = "empty response";
      if (attempt < MAX_ATTEMPTS && hasTimeForAnotherAttempt()) {
        console.warn(`[LLM-RETRY] ${label} attempt ${attempt} empty response, retrying`);
        continue;
      }
      throw new Error("Anthropic returned an empty response");
    }

    // Strip markdown code fences if the model wrapped the JSON
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    // Models sometimes prepend a sentence ("Here's the JSON:") or append commentary
    // around the JSON block. Pull out the first balanced top-level {...} object.
    const candidate = extractFirstJsonObject(stripped) ?? stripped;

    try {
      return options.schema.parse(JSON.parse(candidate) as unknown);
    } catch (parseError) {
      const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
      lastFailure = `parse (${json.stop_reason ?? "unknown"})`;

      // Single-line log: Vercel MCP only surfaces the first console.warn per
      // invocation (see commit b7a7ad30). Pack the context into one line, with
      // the diagnostic fields ahead of the raw excerpt so they survive Vercel's
      // truncation.
      //
      // stop/out/blocks/len/tail identify the failure mode: stop=max_tokens with
      // the error position at len means the response was truncated; a "thinking"
      // block with out near the ceiling means reasoning consumed the budget;
      // stop=end_turn with the error well inside len means a raw control
      // character inside a string value.
      const blocks = json.content.map((b) => b.type).join("+");
      console.warn(
        `[LLM-FAIL] ${label} attempt=${attempt} stop=${json.stop_reason ?? "unknown"} out=${json.usage?.output_tokens ?? "?"} blocks=${blocks} len=${candidate.length} err=${errMsg.replace(/\s+/g, " ").slice(0, 300)} tail=${candidate.replace(/\s+/g, " ").slice(-120)} :: raw=${candidate.replace(/\s+/g, " ").slice(0, 500)}`
      );

      if (attempt < MAX_ATTEMPTS && hasTimeForAnotherAttempt()) {
        // A truncated answer will truncate again at the same ceiling, so give
        // the retry more room. Any other parse failure is treated as a one-off
        // and simply retried.
        if (json.stop_reason === "max_tokens") {
          maxTokens = Math.min(maxTokens * 2, ESCALATED_MAX_TOKENS_CAP);
          console.warn(`[LLM-RETRY] ${label} truncated at max_tokens, retrying with max_tokens=${maxTokens}`);
        }
        continue;
      }
      // Out of attempts, or too little of the function's time window left to
      // start another. Stop here rather than falling through into an attempt
      // the guard just ruled out.
      break;
    }
  }

  // Every attempt failed. Throwing keeps a broken generation visible instead of
  // handing back placeholder text behind a 200.
  //
  // The routes surface this message verbatim in the UI's error banner, so it
  // carries no attempt counts or stop reasons: this codebase strips internal
  // identifiers out of customer-facing copy, and the diagnostic detail is
  // already in the log line above. Copy follows the house formula — what
  // happened, whether the work survived, what to do next.
  console.warn(`[LLM-GIVEUP] ${label} exhausted ${MAX_ATTEMPTS} attempts, last failure: ${lastFailure}`);
  throw new Error("Deckspert couldn't finish generating this. Your work is saved. Please try again.");
}

export async function callAnthropicLLM<T>(prompt: string, options: CallAnthropicOptions<T>): Promise<T> {
  return callAnthropic(prompt, options, {}, "text");
}

type CallAnthropicContentOptions<T> = CallAnthropicOptions<T>;

/**
 * Like callAnthropicLLM, but accepts multimodal content blocks (text + PDF
 * document + slide images) instead of a plain string prompt. Used by the
 * session evaluators so a PPTX/PDF upload is read with full fidelity (the same
 * way the platform evaluator reads decks) rather than as flattened text.
 */
export async function callAnthropicLLMWithContent<T>(
  content: unknown[],
  options: CallAnthropicContentOptions<T>
): Promise<T> {
  return callAnthropic(
    content,
    {
      ...options,
      system:
        options.system ??
        "You are Deckspert, a structured business storytelling assistant. Return only valid JSON, no markdown, no code fences."
    },
    // Enables native PDF document blocks (matches platform evaluator).
    { "anthropic-beta": "pdfs-2024-09-25" },
    "content"
  );
}
