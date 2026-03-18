import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  JOB_RUNNER_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url().optional(),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_COACHING_MODEL: z.string().default("gpt-5-mini")
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}
