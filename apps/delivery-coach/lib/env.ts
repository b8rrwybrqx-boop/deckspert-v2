import { z } from "zod";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const defaultFfmpegPath = ffmpegStatic ?? "ffmpeg";
const defaultFfprobePath =
  typeof ffprobeStatic === "string" ? ffprobeStatic : ffprobeStatic.path ?? "ffprobe";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  JOB_RUNNER_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url().optional(),
  FFMPEG_PATH: z.string().default(defaultFfmpegPath),
  FFPROBE_PATH: z.string().default(defaultFfprobePath),
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
