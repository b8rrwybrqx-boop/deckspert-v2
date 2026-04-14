import { ZodSchema } from "zod";
import "dotenv/config";
import { createHash } from "node:crypto";

type CallLLMOptions<T> = {
  schema: ZodSchema<T>;
  system?: string;
  temperature?: number;
  model?: string;
  fallback: () => T;
};

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TEMPERATURE = 0.3;
const MAX_RETRIES = 2;

function fingerprintApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  const prefix = trimmed.slice(0, 7);
  const suffix = trimmed.slice(-4);
  const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
  return `${prefix}…${suffix} len=${trimmed.length} sha256=${hash}`;
}

function extractMessageContent(message: unknown): string | null {
  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    const pieces = message
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.text === "string") {
            return record.text;
          }
          if (record.text && typeof record.text === "object") {
            const textRecord = record.text as Record<string, unknown>;
            if (typeof textRecord.value === "string") {
              return textRecord.value;
            }
          }
          if (typeof record.value === "string") {
            return record.value;
          }
        }

        return "";
      })
      .filter(Boolean)
      .join("");

    return pieces || null;
  }

  if (message && typeof message === "object") {
    const record = message as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (record.text && typeof record.text === "object") {
      const textRecord = record.text as Record<string, unknown>;
      if (typeof textRecord.value === "string") {
        return textRecord.value;
      }
    }
    if (typeof record.value === "string") {
      return record.value;
    }
  }

  return null;
}

async function fetchStructuredCompletion(prompt: string, options: Required<Pick<CallLLMOptions<unknown>, "system" | "temperature" | "model">>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${options.system}\nReturn valid JSON only.`
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const requestId = response.headers.get("x-request-id");
    const openaiProcessingMs = response.headers.get("openai-processing-ms");
    throw new Error(
      `LLM request failed with ${response.status} (request_id=${requestId ?? "unknown"}, model=${options.model}, base_url=${baseUrl}, processing_ms=${openaiProcessingMs ?? "unknown"}): ${errorText}`
    );
  }

  const json = await response.json();
  const requestId = response.headers.get("x-request-id");
  const content = extractMessageContent(json.choices?.[0]?.message?.content);
  if (typeof content !== "string") {
    throw new Error(`LLM response did not include message content (request_id=${requestId ?? "unknown"})`);
  }

  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `LLM response was not valid JSON (request_id=${requestId ?? "unknown"}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function callLLM<T>(prompt: string, options: CallLLMOptions<T>): Promise<T> {
  const model = options.model ?? DEFAULT_MODEL;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const system = options.system ?? "You are Deckspert, a structured business storytelling assistant.";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.info("[Deckspert][LLM] OPENAI_API_KEY missing, using local fallback output");
    return options.schema.parse(options.fallback());
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const startedAt = Date.now();
      const raw = await fetchStructuredCompletion(prompt, { model, temperature, system });
      const parsed = options.schema.parse(raw);
      console.info("[Deckspert][LLM]", { model, temperature, durationMs: Date.now() - startedAt, attempt });
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn("[Deckspert][LLM] request failed", {
        attempt,
        model,
        temperature,
        baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKeyFingerprint: fingerprintApiKey(apiKey),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `OpenAI request failed after retries: ${lastError.message}`
      : "OpenAI request failed after retries"
  );
}
