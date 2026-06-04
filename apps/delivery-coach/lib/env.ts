import { z } from "zod";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const defaultFfmpegPath = ffmpegStatic ?? "ffmpeg";
const defaultFfprobePath =
  typeof ffprobeStatic === "string" ? ffprobeStatic : ffprobeStatic?.path ?? "ffprobe";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  JOB_RUNNER_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url().optional(),
  FFMPEG_PATH: z.string().default(defaultFfmpegPath),
  FFPROBE_PATH: z.string().default(defaultFfprobePath),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_COACHING_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_VISION_MODEL: z.string().default("gpt-4o-mini"),
  // One frame is sampled every N seconds across the full video.
  DELIVERY_FRAME_INTERVAL_SEC: z.coerce.number().int().positive().default(7),
  // Safety ceiling so a very long upload cannot produce an unbounded number of frames.
  DELIVERY_FRAME_MAX_COUNT: z.coerce.number().int().positive().default(200),
  // Number of frames sent to the vision model per request.
  DELIVERY_VISION_BATCH_SIZE: z.coerce.number().int().positive().default(6)
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}
