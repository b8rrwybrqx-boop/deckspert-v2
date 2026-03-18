import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Artifact } from "../schemas/artifact";

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

function extractPdfText(artifact: Artifact): string | undefined {
  if (!artifact.fileDataBase64) {
    return artifact.content || artifact.extractedText;
  }

  return withTempFile(artifact, (path, tempDirectory) => {
    const script = `
import Foundation
import PDFKit

let path = CommandLine.arguments[1]
guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else {
  exit(0)
}

var pages: [String] = []
for index in 0..<document.pageCount {
  guard let text = document.page(at: index)?.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
    continue
  }

  let normalized = text
    .replacingOccurrences(of: "\\r", with: "\\n")
    .split(separator: "\\n")
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
    .joined(separator: " | ")

  if !normalized.isEmpty {
    pages.append("Page \\(index + 1): \\(normalized)")
  }
}

print(pages.joined(separator: "\\n\\n"))
`;

    const env = {
      ...(typeof process !== "undefined" ? process.env : {}),
      CLANG_MODULE_CACHE_PATH: tempDirectory
    };

    const output = execFileSync("swift", ["-", path], {
      input: script,
      encoding: "utf8",
      env,
      maxBuffer: 10 * 1024 * 1024
    }).trim();

    return output || undefined;
  });
}

function extractDocumentText(artifact: Artifact): string | undefined {
  if (artifact.extractedText) {
    return artifact.extractedText;
  }

  if (artifact.content) {
    return artifact.content;
  }

  if (artifact.kind === "pptx") {
    return extractPptxText(artifact);
  }

  if (artifact.kind === "doc") {
    return extractDocxText(artifact);
  }

  if (artifact.kind === "pdf") {
    return extractPdfText(artifact);
  }

  return undefined;
}

export function processArtifact(artifact: Artifact): Artifact {
  if (artifact.kind === "image") {
    return {
      ...artifact,
      visionSummary: artifact.visionSummary ?? summarizeImageContent(artifact.content)
    };
  }

  if (artifact.kind === "video") {
    return {
      ...artifact,
      extractedText: artifact.extractedText ?? artifact.content
    };
  }

  return {
    ...artifact,
    extractedText: extractDocumentText(artifact)
  };
}

export function processArtifacts(artifacts: Artifact[]): Artifact[] {
  return artifacts.map((artifact) => {
    try {
      return processArtifact(artifact);
    } catch (error) {
      console.warn("[Deckspert][Artifacts] processing failed", {
        label: artifact.label,
        kind: artifact.kind,
        error: error instanceof Error ? error.message : error
      });
      return artifact;
    }
  });
}

export function flattenArtifactText(artifacts: Artifact[]): string {
  return artifacts
    .map((artifact) => artifact.extractedText ?? artifact.visionSummary ?? "")
    .filter(Boolean)
    .join("\n\n");
}
