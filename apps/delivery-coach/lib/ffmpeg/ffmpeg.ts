import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { getEnv } from "../env";

const execFileAsync = promisify(execFile);

export type MediaMetadata = {
  durationSec: number;
  width: number | null;
  height: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
};

export type AudioChunk = {
  filePath: string;
  startSec: number;
  endSec: number;
};

export type SampledFrame = {
  filePath: string;
  timestampSec: number;
};

async function runBinary(binary: string, args: string[]) {
  const { stdout } = await execFileAsync(binary, args, {
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

export async function ensureFfmpegAvailable() {
  const env = getEnv();
  await runBinary(env.FFMPEG_PATH, ["-version"]);
  await runBinary(env.FFPROBE_PATH, ["-version"]);
}

export async function readMediaMetadata(inputPath: string): Promise<MediaMetadata> {
  const env = getEnv();
  const output = await runBinary(env.FFPROBE_PATH, [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height",
    "-of",
    "json",
    inputPath
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  return {
    durationSec: Number(parsed.format?.duration ?? 0),
    width: video?.width ?? null,
    height: video?.height ?? null,
    audioCodec: audio?.codec_name ?? null,
    videoCodec: video?.codec_name ?? null
  };
}

export async function transcodeAnalysisVideo(inputPath: string, outputPath: string) {
  const env = getEnv();
  await runBinary(env.FFMPEG_PATH, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "27",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    outputPath
  ]);
}

export async function extractMonoAudio(inputPath: string, outputPath: string) {
  const env = getEnv();
  await runBinary(env.FFMPEG_PATH, [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    outputPath
  ]);
}

export async function chunkAudio(inputPath: string, segmentSeconds = 480): Promise<AudioChunk[]> {
  const env = getEnv();
  const dir = await mkdtemp(join(tmpdir(), "delivery-audio-"));
  const pattern = join(dir, "chunk-%03d.m4a");

  await runBinary(env.FFMPEG_PATH, [
    "-y",
    "-i",
    inputPath,
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-c",
    "copy",
    pattern
  ]);

  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".m4a"))
    .sort()
    .map((file) => join(dir, file));

  return files.map((filePath, index) => ({
    filePath,
    startSec: index * segmentSeconds,
    endSec: (index + 1) * segmentSeconds
  }));
}

export async function sampleFrames(inputPath: string, everySeconds = 10): Promise<SampledFrame[]> {
  const env = getEnv();
  const dir = await mkdtemp(join(tmpdir(), "delivery-frames-"));
  const pattern = join(dir, "frame-%05d.jpg");

  await runBinary(env.FFMPEG_PATH, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `fps=1/${everySeconds},scale='min(960,iw)':-2`,
    "-q:v",
    "4",
    pattern
  ]);

  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".jpg"))
    .sort()
    .map((file) => join(dir, file));

  return files.map((filePath, index) => ({
    filePath,
    timestampSec: index * everySeconds
  }));
}

export async function readBinaryFile(filePath: string) {
  return readFile(filePath);
}

export async function cleanupTempPath(pathToRemove: string) {
  await rm(pathToRemove, { recursive: true, force: true });
}

export function fileNameFromPath(pathToFile: string) {
  return basename(pathToFile);
}
