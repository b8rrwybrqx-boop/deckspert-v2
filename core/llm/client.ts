import { ZodSchema } from "zod";
import "dotenv/config";

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

  const response = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
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
    throw new Error(`LLM request failed with ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const content = extractMessageContent(json.choices?.[0]?.message?.content);
  if (typeof content !== "string") {
    throw new Error("LLM response did not include message content");
  }

  return JSON.parse(content) as unknown;
}

export async function callLLM<T>(prompt: string, options: CallLLMOptions<T>): Promise<T> {
  const model = options.model ?? DEFAULT_MODEL;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const system = options.system ?? "You are Deckspert, a structured business storytelling assistant.";
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

  if (!hasApiKey) {
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
      console.warn("[Deckspert][LLM] request failed", { attempt, error });
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `OpenAI request failed after retries: ${lastError.message}`
      : "OpenAI request failed after retries"
  );
}
