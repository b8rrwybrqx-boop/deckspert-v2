import { ZodSchema } from "zod";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
// Sonnet 5 for quality, overridable via CREATOR_MODEL env var
const DEFAULT_CREATOR_MODEL = "claude-sonnet-5";

const DEFAULT_MAX_TOKENS = 8192;
// Ceiling for the escalated retry after a max_tokens truncation. Kept modest so
// a rejected value can only ever cost one attempt, never the whole call.
const ESCALATED_MAX_TOKENS_CAP = 64000;
const MAX_ATTEMPTS = 3;
// vercel.json allows these functions 300s. A large outline generation runs
// 60-90s, so three unconditional attempts could blow the ceiling and turn a
// recoverable failure into a 504. Only start another attempt when enough of the
// window remains for it to plausibly finish.
const TOTAL_TIME_BUDGET_MS = 240_000;
const ASSUMED_FIRST_ATTEMPT_MS = 90_000;
// Floor for a single attempt's abort timer, so a nearly-exhausted budget still
// gives the last attempt a fair chance rather than aborting it on arrival.
const MIN_ATTEMPT_TIMEOUT_MS = 30_000;

// On Sonnet 5 (and the rest of the 4.6+ family) adaptive thinking is ON when
// the thinking parameter is omitted, and thinking tokens are charged against
// max_tokens. A caller asking for 8192 was therefore getting far less than 8192
// for its JSON, and storyline generation truncated mid-string. The callers'
// maxTokens describes the answer they need, so the thinking allowance is added
// here rather than pushed back onto every call site.
//
// Deliberately far more than reasoning is expected to use. max_tokens is a
// ceiling the model stops well short of, not a target, so an oversized one is
// free on every call that behaves — and truncation is the failure mode being
// designed out. The storyline's 8192 becomes 32768 against roughly 8k of real
// usage, so thinking would have to quadruple before a caller sees a cut-off
// again.
const THINKING_HEADROOM_TOKENS = 24576;
// Thinking depth. Sonnet 5 defaults to "high", which is what exhausted the
// budget; medium is roughly Sonnet 4.6 at high and keeps latency inside the
// function's 300s ceiling.
const DEFAULT_EFFORT = "medium";

// Models that take `thinking: {type:"adaptive"}` and `output_config.effort`.
// Haiku 4.5 and the 4.5 family reject both with a 400, and chat.ts/artifact
// extraction run on Haiku, so the config has to be model-gated rather than sent
// unconditionally.
const ADAPTIVE_THINKING_MODELS = /^claude-(fable-5|mythos-5|opus-5|sonnet-5|opus-4-(6|7|8)|sonnet-4-6)/;

function supportsAdaptiveThinking(model: string): boolean {
  return ADAPTIVE_THINKING_MODELS.test(model);
}

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
  let sendThinkingConfig = supportsAdaptiveThinking(model);
  const baseMaxTokens =
    (options.maxTokens ?? DEFAULT_MAX_TOKENS) + (sendThinkingConfig ? THINKING_HEADROOM_TOKENS : 0);

  let maxTokens = baseMaxTokens;
  let lastFailure = "unknown";
  const startedAt = Date.now();
  // Budget the next attempt against the slowest one so far rather than a fixed
  // guess. A fixed 90s assumption blocked the escalated third attempt after two
  // slow ones, so the call gave up holding the retry that would have worked.
  let slowestAttemptMs = 0;
  const hasTimeForAnotherAttempt = () =>
    Date.now() - startedAt + Math.max(slowestAttemptMs, ASSUMED_FIRST_ATTEMPT_MS) <
    TOTAL_TIME_BUDGET_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStartedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          ...extraHeaders
        },
        // A generous max_tokens means a pathological generation could otherwise
        // outrun the function's 300s maxDuration and reach the user as a raw
        // 504 with no logging. Cap the attempt at whatever remains of the retry
        // budget so it fails inside this function, where it is logged and can
        // still be retried.
        signal: AbortSignal.timeout(
          Math.max(TOTAL_TIME_BUDGET_MS - (Date.now() - startedAt), MIN_ATTEMPT_TIMEOUT_MS)
        ),
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: messageContent }],
          // Sent explicitly so behaviour does not ride on a model's default:
          // omitting these on Sonnet 5 silently buys high-effort thinking.
          ...(sendThinkingConfig
            ? {
                thinking: { type: "adaptive" },
                output_config: { effort: process.env.CREATOR_EFFORT ?? DEFAULT_EFFORT }
              }
            : {})
        })
      });
    } catch (fetchError) {
      // Abort or network drop. Both are worth another attempt if the budget
      // allows; neither should surface as an unlogged 504.
      const reason = fetchError instanceof Error ? fetchError.name : "unknown";
      slowestAttemptMs = Math.max(slowestAttemptMs, Date.now() - attemptStartedAt);
      lastFailure = `fetch ${reason}`;
      if (attempt < MAX_ATTEMPTS && hasTimeForAnotherAttempt()) {
        console.warn(`[LLM-RETRY] ${label} attempt ${attempt} ${reason}, retrying`);
        continue;
      }
      break;
    }
    slowestAttemptMs = Math.max(slowestAttemptMs, Date.now() - attemptStartedAt);

    if (!response.ok) {
      const errorText = await response.text();
      lastFailure = `http ${response.status}`;
      // CREATOR_MODEL can point at a model the thinking/effort gate above
      // guessed wrong about. Drop the config and retry rather than failing the
      // whole call, so a model swap can never take generation down outright.
      if (sendThinkingConfig && response.status === 400 && /thinking|effort|output_config/i.test(errorText)) {
        console.warn(`[LLM-RETRY] ${label} ${model} rejected thinking config, retrying without it`);
        sendThinkingConfig = false;
        continue;
      }
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
      lastFailure = `empty response (${json.stop_reason ?? "unknown"})`;
      if (attempt < MAX_ATTEMPTS && hasTimeForAnotherAttempt()) {
        // An empty response with stop=max_tokens means thinking consumed the
        // whole budget before a text block was produced. Retrying at the same
        // ceiling reproduces it exactly, so escalate the way a truncated parse
        // does.
        if (json.stop_reason === "max_tokens") {
          maxTokens = Math.min(maxTokens * 2, ESCALATED_MAX_TOKENS_CAP);
          console.warn(
            `[LLM-RETRY] ${label} empty at max_tokens, retrying with max_tokens=${maxTokens}`
          );
        } else {
          console.warn(`[LLM-RETRY] ${label} attempt ${attempt} empty response, retrying`);
        }
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
