import { execFileSync } from "node:child_process";
import { Buffer as NodeBuffer } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Artifact } from "../schemas/artifact.js";

const require = createRequire(import.meta.url);
type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type PdfPageData = {
  getTextContent: (options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
};

type PdfParseOptions = {
  pagerender?: (pageData: PdfPageData) => Promise<string>;
  max?: number;
  version?: string;
};

const pdfParse = require("pdf-parse") as (
  buffer: Uint8Array,
  options?: PdfParseOptions
) => Promise<{ text?: string; numpages?: number; numrender?: number }>;

function summarizeImageContent(content?: string): string {
  if (!content) {
    return "";
  }

  return `Visual summary inferred from uploaded image context: ${content.slice(0, 240)}`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r");
}

function extractTaggedText(xml: string, tagPattern: RegExp): string[] {
  const matches = Array.from(xml.matchAll(tagPattern))
    .map((match) => decodeXmlEntities(match[1] ?? "").trim())
    .filter(Boolean);
  return matches;
}

function withTempFile<T>(artifact: Artifact, fn: (path: string, tempDirectory: string) => T): T {
  const tempDirectory = mkdtempSync(join(tmpdir(), "deckspert-"));
  const filename = artifact.filename ?? `${artifact.label}.${artifact.kind}`;
  const filePath = join(tempDirectory, filename);

  try {
    writeFileSync(filePath, Buffer.from(artifact.fileDataBase64 ?? "", "base64"));
    return fn(filePath, tempDirectory);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function withTempBufferFile<T>(artifact: Artifact, buffer: Uint8Array, fn: (path: string, tempDirectory: string) => T): T {
  const tempDirectory = mkdtempSync(join(tmpdir(), "deckspert-"));
  const filename = artifact.filename ?? `${artifact.label}.${artifact.kind}`;
  const filePath = join(tempDirectory, filename);

  try {
    writeFileSync(filePath, buffer);
    return fn(filePath, tempDirectory);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function getArtifactBuffer(artifact: Artifact): Promise<Uint8Array | undefined> {
  if (artifact.fileDataBase64) {
    return NodeBuffer.from(String(artifact.fileDataBase64), "base64") as unknown as Uint8Array;
  }

  if (!artifact.sourceUrl) {
    return undefined;
  }

  const response = await fetch(artifact.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch artifact source (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function listZipEntries(path: string): string[] {
  const listing = execFileSync("unzip", ["-Z1", path], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readZipEntry(path: string, entry: string): string {
  return execFileSync("unzip", ["-p", path, entry], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
}

function compareSlideEntries(left: string, right: string): number {
  const leftNumber = Number(left.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const rightNumber = Number(right.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return leftNumber - rightNumber;
}

function hasExtension(filename: string | undefined, extension: string): boolean {
  return filename?.toLowerCase().endsWith(extension) ?? false;
}

function normalizeSlideLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizePdfPageText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeSlideLine(line))
    .filter(Boolean)
    .join(" | ")
    .trim();
}

async function renderPdfPageText(pageData: PdfPageData, slideNumber: number): Promise<string> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false
  });

  let lastY: number | null = null;
  let text = "";

  for (const item of textContent.items) {
    const value = normalizeSlideLine(item.str ?? "");
    if (!value) {
      continue;
    }

    const y = Array.isArray(item.transform)
      ? Math.round(Number(item.transform[5] ?? 0))
      : null;
    const sameLine = lastY === null || y === null || Math.abs(y - lastY) <= 2;
    text += sameLine
      ? `${text && !/\s$/.test(text) ? " " : ""}${value}`
      : `\n${value}`;

    if (y !== null) {
      lastY = y;
    }
  }

  const normalized = normalizePdfPageText(text);
  return normalized ? `Slide ${slideNumber}: ${normalized}` : `Slide ${slideNumber}: [No extractable text]`;
}

function extractPptxText(artifact: Artifact): string | undefined {
  if (!artifact.fileDataBase64) {
    return artifact.content || artifact.extractedText;
  }

  return withTempFile(artifact, (path) => {
    const entries = listZipEntries(path)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
      .sort(compareSlideEntries);

    if (!entries.length) {
      return undefined;
    }

    const slides = entries.map((entry, index) => {
      const xml = readZipEntry(path, entry);
      const text = extractTaggedText(xml, /<a:t>([\s\S]*?)<\/a:t>/g).join(" ");
      return text ? `Slide ${index + 1}: ${text}` : "";
    }).filter(Boolean);

    return slides.length ? slides.join("\n\n") : undefined;
  });
}

async function extractPptxTextFromSource(artifact: Artifact): Promise<string | undefined> {
  const buffer = await getArtifactBuffer(artifact);
  if (!buffer) {
    return artifact.content || artifact.extractedText;
  }

  return withTempBufferFile(artifact, buffer, (path) => {
    const entries = listZipEntries(path)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
      .sort(compareSlideEntries);

    if (!entries.length) {
      return undefined;
    }

    const slides = entries.map((entry, index) => {
      const xml = readZipEntry(path, entry);
      const text = extractTaggedText(xml, /<a:t>([\s\S]*?)<\/a:t>/g).join(" ");
      return text ? `Slide ${index + 1}: ${text}` : "";
    }).filter(Boolean);

    return slides.length ? slides.join("\n\n") : undefined;
  });
}

function extractDocxText(artifact: Artifact): string | undefined {
  if (!hasExtension(artifact.filename, ".docx")) {
    return artifact.content || artifact.extractedText;
  }

  if (!artifact.fileDataBase64) {
    return artifact.content || artifact.extractedText;
  }

  return withTempFile(artifact, (path) => {
    const entries = listZipEntries(path).filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry));
    if (!entries.length) {
      return undefined;
    }

    const sections = entries.map((entry) => {
      const xml = readZipEntry(path, entry);
      return extractTaggedText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(" ");
    }).filter(Boolean);

    return sections.length ? sections.join("\n\n") : undefined;
  });
}

async function extractDocxTextFromSource(artifact: Artifact): Promise<string | undefined> {
  if (!hasExtension(artifact.filename, ".docx")) {
    return artifact.content || artifact.extractedText;
  }

  const buffer = await getArtifactBuffer(artifact);
  if (!buffer) {
    return artifact.content || artifact.extractedText;
  }

  return withTempBufferFile(artifact, buffer, (path) => {
    const entries = listZipEntries(path).filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry));
    if (!entries.length) {
      return undefined;
    }

    const sections = entries.map((entry) => {
      const xml = readZipEntry(path, entry);
      return extractTaggedText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(" ");
    }).filter(Boolean);

    return sections.length ? sections.join("\n\n") : undefined;
  });
}

async function extractPdfText(artifact: Artifact): Promise<string | undefined> {
  const pdfBuffer = await getArtifactBuffer(artifact);
  if (!pdfBuffer) {
    return artifact.content || artifact.extractedText;
  }
  let slideNumber = 0;
  const result = await pdfParse(pdfBuffer, {
    pagerender: async (pageData) => {
      slideNumber += 1;
      return renderPdfPageText(pageData, slideNumber);
    }
  });

  const slides = (result.text ?? "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const match = block.match(/^Slide\s+(\d+):?\s*([\s\S]*)$/i);
      if (!match) {
        return normalizePdfPageText(block);
      }

      const label = `Slide ${match[1]}`;
      const body = normalizePdfPageText(match[2] ?? "");
      return body ? `${label}: ${body}` : `${label}: [No extractable text]`;
    })
    .filter(Boolean);

  return slides.length ? slides.join("\n\n") : undefined;
}

async function extractDocumentText(artifact: Artifact): Promise<string | undefined> {
  if (artifact.extractedText) {
    return artifact.extractedText;
  }

  if (artifact.content) {
    return artifact.content;
  }

  if (artifact.kind === "pptx") {
    if (artifact.fileDataBase64) {
      return extractPptxText(artifact);
    }
    return extractPptxTextFromSource(artifact);
  }

  if (artifact.kind === "doc") {
    if (artifact.fileDataBase64) {
      return extractDocxText(artifact);
    }
    return extractDocxTextFromSource(artifact);
  }

  if (artifact.kind === "pdf") {
    return extractPdfText(artifact);
  }

  return undefined;
}

async function analyzeImageFromUrl(sourceUrl: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "Image attached — vision analysis unavailable (no API key).";
  }

  try {
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) {
      return `Image attached — could not fetch for analysis (${imageResponse.status}).`;
    }
    const rawBuffer = await imageResponse.arrayBuffer();
    // Encode to base64 without Buffer (avoids @types/node resolution issues in this tsconfig)
    const bytes = new Uint8Array(rawBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 8192) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
    }
    const base64 = btoa(binary);
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const mediaType = (contentType.split(";")[0] ?? "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";

    const visionResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 }
              },
              {
                type: "text",
                text: "Describe this image concisely for business presentation context. Focus on any key data, messages, charts, strategic content, or planning material visible. Under 200 words."
              }
            ]
          }
        ]
      })
    });

    if (!visionResponse.ok) {
      return "Image attached — vision analysis failed.";
    }

    const json = (await visionResponse.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return json.content.find((b) => b.type === "text")?.text ?? "Image analyzed but no description returned.";
  } catch {
    return "Image attached — vision analysis encountered an error.";
  }
}

export async function processArtifact(artifact: Artifact): Promise<Artifact> {
  if (artifact.kind === "image") {
    // If we already have a summary, keep it. If we have a URL, fetch and analyze.
    // If we only have inline content (legacy), wrap it.
    const visionSummary =
      artifact.visionSummary ??
      (artifact.sourceUrl
        ? await analyzeImageFromUrl(artifact.sourceUrl)
        : summarizeImageContent(artifact.content));
    return { ...artifact, visionSummary };
  }

  if (artifact.kind === "video") {
    return {
      ...artifact,
      extractedText: artifact.extractedText ?? artifact.content
    };
  }

  return {
    ...artifact,
    extractedText: await extractDocumentText(artifact)
  };
}

export async function processArtifacts(artifacts: Artifact[]): Promise<Artifact[]> {
  return Promise.all(
    artifacts.map(async (artifact) => {
      try {
        return await processArtifact(artifact);
      } catch (error) {
        console.warn("[Deckspert][Artifacts] processing failed", {
          label: artifact.label,
          kind: artifact.kind,
          error: error instanceof Error ? error.message : error
        });
        return artifact;
      }
    })
  );
}

export function flattenArtifactText(artifacts: Artifact[]): string {
  return artifacts
    .map((artifact) => artifact.extractedText ?? artifact.visionSummary ?? "")
    .filter(Boolean)
    .join("\n\n");
}
