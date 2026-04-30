import { Buffer as NodeBuffer } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
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
  return Array.from(xml.matchAll(tagPattern))
    .map((m) => decodeXmlEntities(m[1] ?? "").trim())
    .filter(Boolean);
}

// ── Pure-JS ZIP reader (replaces unzip CLI) ───────────────────────────────────

interface ZipReader {
  list(): string[];
  has(entry: string): boolean;
  read(entry: string): string;  // returns "" if missing or binary
}

function openZipFromBuffer(buffer: Uint8Array): ZipReader {
  const files = unzipSync(buffer);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const cache = new Map<string, string>();

  return {
    list: () => Object.keys(files),
    has: (entry) => entry in files,
    read: (entry) => {
      if (cache.has(entry)) return cache.get(entry) ?? "";
      const data = files[entry];
      if (!data) return "";
      const text = decoder.decode(data);
      cache.set(entry, text);
      return text;
    }
  };
}

// ── Artifact buffer loading ───────────────────────────────────────────────────

async function getArtifactBuffer(artifact: Artifact): Promise<Uint8Array | undefined> {
  if (artifact.fileDataBase64) {
    return NodeBuffer.from(String(artifact.fileDataBase64), "base64") as unknown as Uint8Array;
  }
  if (!artifact.sourceUrl) return undefined;
  const response = await fetch(artifact.sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch artifact source (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

// ── DOCX: still uses temp file + execFileSync (not on the critical PPTX path) ─

function withTempFile<T>(artifact: Artifact, fn: (path: string) => T): T {
  const tempDirectory = mkdtempSync(join(tmpdir(), "deckspert-"));
  const filename = artifact.filename ?? `${artifact.label}.${artifact.kind}`;
  const filePath = join(tempDirectory, filename);
  try {
    writeFileSync(filePath, Buffer.from(artifact.fileDataBase64 ?? "", "base64"));
    return fn(filePath);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function withTempBufferFile<T>(artifact: Artifact, buffer: Uint8Array, fn: (path: string) => T): Promise<T> {
  const tempDirectory = mkdtempSync(join(tmpdir(), "deckspert-"));
  const filename = artifact.filename ?? `${artifact.label}.${artifact.kind}`;
  const filePath = join(tempDirectory, filename);
  try {
    writeFileSync(filePath, buffer);
    return fn(filePath);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasExtension(filename: string | undefined, extension: string): boolean {
  return filename?.toLowerCase().endsWith(extension) ?? false;
}

function compareSlideNames(a: string, b: string): number {
  const n = (s: string) => Number(s.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return n(a) - n(b);
}

function normalizeSlideLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizePdfPageText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => normalizeSlideLine(l))
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
    if (!value) continue;
    const y = Array.isArray(item.transform) ? Math.round(Number(item.transform[5] ?? 0)) : null;
    const sameLine = lastY === null || y === null || Math.abs(y - lastY) <= 2;
    text += sameLine ? `${text && !/\s$/.test(text) ? " " : ""}${value}` : `\n${value}`;
    if (y !== null) lastY = y;
  }

  const normalized = normalizePdfPageText(text);
  return normalized ? `Slide ${slideNumber}: ${normalized}` : `Slide ${slideNumber}: [No extractable text]`;
}

// ── Closing-slide / appendix detection ───────────────────────────────────────

const CLOSING_SLIDE_PATTERNS = [
  /^thank\s*you[.!]?$/i,
  /^thanks[.!]?$/i,
  /^thank\s+you\s+for\s+your/i,
  /^questions?\s*[&+]?\s*answers?$/i,
  /^q\s*[&+\/]\s*a$/i,
  /^any\s+questions/i,
  /^discussion[s]?[.!]?$/i,
  /^contact\s+us$/i,
  /^let'?s\s+connect$/i,
  /^get\s+in\s+touch$/i,
];

const APPENDIX_SECTION_PATTERNS = [
  /appendix/i,
  /backup\s+slides?/i,
  /reference\s+material/i,
  /archive/i,
  /supplemental/i,
  /additional\s+slides?/i,
];

function looksLikeClosingSlide(title: string | null): boolean {
  if (!title) return false;
  return CLOSING_SLIDE_PATTERNS.some((p) => p.test(title.trim()));
}

function looksLikeAppendixSection(name: string): boolean {
  return APPENDIX_SECTION_PATTERNS.some((p) => p.test(name.trim()));
}

// ── PPTX metadata helpers ─────────────────────────────────────────────────────

function extractFirstMatch(xml: string, pattern: RegExp): string | null {
  return pattern.exec(xml)?.[1]?.trim() ?? null;
}

interface PptxSection {
  name: string;
  slideIds: Set<string>;
}

function parsePresentationSections(xml: string): PptxSection[] {
  const lm = xml.match(/<p:sectionLst[^>]*>([\s\S]*?)<\/p:sectionLst>/);
  if (!lm?.[1]) return [];
  const sections: PptxSection[] = [];
  for (const m of lm[1].matchAll(/<p:section[^>]+name="([^"]*)"[^>]*>([\s\S]*?)<\/p:section>/g)) {
    const name = decodeXmlEntities(m[1] ?? "");
    const body = m[2] ?? "";
    const slideIds = new Set(Array.from(body.matchAll(/<p:sldId[^>]+id="(\d+)"/g)).map((s) => s[1] ?? ""));
    sections.push({ name, slideIds });
  }
  return sections;
}

function parsePresentationSlideIds(xml: string): string[] {
  const lm = xml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/);
  if (!lm?.[1]) return [];
  return Array.from(lm[1].matchAll(/<p:sldId[^>]+id="(\d+)"/g)).map((m) => m[1] ?? "");
}

// ── Per-slide shape parsing ───────────────────────────────────────────────────

interface SlideShape {
  role: "title" | "body" | "other";
  paragraphs: Array<{ level: number; text: string }>;
}

function getShapeRole(spXml: string): "title" | "body" | "other" {
  if (!/<p:ph/.test(spXml)) return "other";
  if (/<p:ph[^>]+type="(?:title|ctrTitle)"/.test(spXml)) return "title";
  if (/<p:ph[^>]+type="(?:dt|sldNum|ftr|hdr|pic)"/.test(spXml)) return "other";
  return "body";
}

function extractParagraphsFromShape(spXml: string): Array<{ level: number; text: string }> {
  const txBody = spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? "";
  if (!txBody) return [];
  const result: Array<{ level: number; text: string }> = [];
  for (const paraMatch of txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const para = paraMatch[1] ?? "";
    const lvlMatch = para.match(/<a:pPr[^>]+lvl="(\d+)"/);
    const level = lvlMatch ? parseInt(lvlMatch[1] ?? "0") : 0;
    const texts = Array.from(para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((m) => decodeXmlEntities(m[1] ?? "").trim())
      .filter(Boolean);
    const text = texts.join("").trim();
    if (text) result.push({ level, text });
  }
  return result;
}

function parseSlideShapes(slideXml: string): SlideShape[] {
  const shapes: SlideShape[] = [];
  for (const spMatch of slideXml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const spXml = spMatch[1] ?? "";
    const paragraphs = extractParagraphsFromShape(spXml);
    if (paragraphs.length > 0) shapes.push({ role: getShapeRole(spXml), paragraphs });
  }
  return shapes;
}

function getSlideTitle(shapes: SlideShape[]): string | null {
  const ts = shapes.find((s) => s.role === "title");
  return ts ? ts.paragraphs.map((p) => p.text).join(" ").trim() || null : null;
}

function extractBuildSummary(slideXml: string): string | null {
  if (!/<p:timing>/.test(slideXml)) return null;
  const clickEffects = (slideXml.match(/nodeType="clickEffect"/g) ?? []).length;
  if (clickEffects === 0) return null;
  const hasBulletBuilds = /<p:txEl>/.test(slideXml);
  return `${clickEffects} click-reveal${clickEffects !== 1 ? "s" : ""} (${hasBulletBuilds ? "progressive bullet build" : "shape animations"})`;
}

function extractNotesText(notesXml: string): string | null {
  const texts = Array.from(notesXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
    .map((m) => decodeXmlEntities(m[1] ?? "").trim())
    .filter(Boolean);
  return texts.join(" ").trim() || null;
}

function parseNotesPath(relsXml: string): string | null {
  const m = relsXml.match(/Type="[^"]*\/notesSlide"[^>]+Target="([^"]+)"/);
  if (!m?.[1]) return null;
  return m[1].replace(/^\.\.\//, "ppt/");
}

function formatSlideBlock(index: number, shapes: SlideShape[], buildSummary: string | null, notes: string | null): string {
  const lines: string[] = [`=== SLIDE ${index} ===`];

  const titleShape = shapes.find((s) => s.role === "title");
  if (titleShape) {
    const t = titleShape.paragraphs.map((p) => p.text).join(" ").trim();
    if (t) lines.push(`TITLE: "${t}"`);
  }

  const bodyShapes = shapes.filter((s) => s.role === "body");
  if (bodyShapes.length > 0) {
    lines.push("BODY:");
    for (const shape of bodyShapes) {
      for (const para of shape.paragraphs) {
        lines.push(`${"  ".repeat(para.level + 1)}${para.level > 0 ? "·" : "•"} ${para.text}`);
      }
    }
  }

  const otherText = shapes
    .filter((s) => s.role === "other")
    .flatMap((s) => s.paragraphs.map((p) => p.text))
    .join(" | ")
    .trim();
  if (otherText) lines.push(`OTHER: ${otherText}`);

  if (!titleShape && bodyShapes.length === 0 && !otherText) {
    lines.push("[No extractable text]");
  }

  if (buildSummary) lines.push(`BUILDS: ${buildSummary}`);
  if (notes?.trim()) lines.push(`NOTES: ${notes.trim()}`);

  return lines.join("\n");
}

// ── Main rich PPTX extraction (works from ZipReader, no temp files) ───────────

function doRichPptxExtraction(zip: ZipReader): string {
  const allEntries = zip.list();

  const safeRead = (entry: string): string => {
    if (!zip.has(entry)) return "";
    try { return zip.read(entry); } catch { return ""; }
  };

  // ── Metadata ──────────────────────────────────────────────────────────────
  const appXml = safeRead("docProps/app.xml");
  const coreXml = safeRead("docProps/core.xml");
  const presentationXml = safeRead("ppt/presentation.xml");

  const totalSlides = parseInt(extractFirstMatch(appXml, /<Slides>(\d+)<\/Slides>/) ?? "0") || 0;
  const hiddenCount = parseInt(extractFirstMatch(appXml, /<HiddenSlides>(\d+)<\/HiddenSlides>/) ?? "0") || 0;
  const notesCount = parseInt(extractFirstMatch(appXml, /<Notes>(\d+)<\/Notes>/) ?? "0") || 0;
  const editingMins = parseInt(extractFirstMatch(appXml, /<TotalTime>(\d+)<\/TotalTime>/) ?? "") || null;
  const presFormat = extractFirstMatch(appXml, /<PresentationFormat>([^<]+)<\/PresentationFormat>/);
  const revisions = parseInt(extractFirstMatch(coreXml, /<cp:revision>(\d+)<\/cp:revision>/) ?? "") || null;
  const author = extractFirstMatch(coreXml, /<dc:creator>([^<]+)<\/dc:creator>/);
  const lastModBy = extractFirstMatch(coreXml, /<cp:lastModifiedBy>([^<]+)<\/cp:lastModifiedBy>/);

  const metaLines: string[] = [];
  {
    const parts: string[] = [];
    if (presFormat) parts.push(`Format: ${presFormat}`);
    parts.push(`Slides: ${totalSlides}${hiddenCount > 0 ? ` (${hiddenCount} hidden — excluded)` : ""}`);
    if (notesCount > 0) parts.push(`Speaker notes on: ${notesCount} of ${totalSlides} slides`);
    if (parts.length) metaLines.push(parts.join(" | "));
  }
  {
    const parts: string[] = [];
    if (author) parts.push(`Author: ${author}`);
    if (lastModBy && lastModBy !== author) parts.push(`Last edited by: ${lastModBy}`);
    if (revisions !== null) parts.push(`Revision: ${revisions}`);
    if (editingMins !== null) parts.push(`Editing time: ~${Math.round(editingMins / 6) / 10}h`);
    if (parts.length) metaLines.push(parts.join(" | "));
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  const sections = parsePresentationSections(presentationXml);
  const appendixSlideIds = new Set<string>();
  for (const section of sections) {
    if (looksLikeAppendixSection(section.name)) {
      for (const id of section.slideIds) appendixSlideIds.add(id);
    }
  }
  const orderedSlideIds = parsePresentationSlideIds(presentationXml);

  // ── Per-slide extraction ──────────────────────────────────────────────────
  const slideEntries = allEntries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort(compareSlideNames);

  if (!slideEntries.length) return "";

  interface ProcessedSlide { index: number; isHidden: boolean; isAppendix: boolean; title: string | null; block: string; }
  const processed: ProcessedSlide[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i];
    if (!entry) continue;
    const slideIndex = i + 1;

    const slideXml = safeRead(entry);
    if (!slideXml) continue;

    const isHidden = /<p:sld[^>]*\sshow="0"/.test(slideXml);
    const presId = orderedSlideIds[i] ?? null;
    const isAppendix = presId !== null && appendixSlideIds.has(presId);

    const shapes = parseSlideShapes(slideXml);
    const title = getSlideTitle(shapes);
    const buildSummary = extractBuildSummary(slideXml);

    // Speaker notes via relationship file
    let notes: string | null = null;
    const slideNum = entry.match(/slide(\d+)\.xml$/)?.[1];
    if (slideNum) {
      const relsEntry = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      const relsXml = safeRead(relsEntry);
      if (relsXml) {
        const notesPath = parseNotesPath(relsXml);
        if (notesPath) {
          const notesXml = safeRead(notesPath);
          if (notesXml) notes = extractNotesText(notesXml);
        }
      }
    }

    processed.push({ index: slideIndex, isHidden, isAppendix, title, block: formatSlideBlock(slideIndex, shapes, buildSummary, notes) });
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  let closingIndex: number | null = null;
  for (const slide of processed) {
    if (!slide.isHidden && !slide.isAppendix && looksLikeClosingSlide(slide.title)) {
      closingIndex = slide.index;
      break;
    }
  }

  const evaluatable = processed.filter((s) => {
    if (s.isHidden || s.isAppendix) return false;
    if (closingIndex !== null && s.index > closingIndex) return false;
    return true;
  });

  const excludedHidden = processed.filter((s) => s.isHidden).length;
  const excludedAppendix = processed.filter((s) => !s.isHidden && s.isAppendix).length;
  const excludedPostClosing = closingIndex !== null
    ? processed.filter((s) => !s.isHidden && !s.isAppendix && s.index > closingIndex).length
    : 0;

  // ── Assemble output ───────────────────────────────────────────────────────
  const out: string[] = [];
  if (metaLines.length) { out.push("=== PRESENTATION METADATA ==="); out.push(...metaLines); out.push(""); }
  for (const slide of evaluatable) { out.push(slide.block); out.push(""); }
  const exclusions: string[] = [];
  if (excludedHidden > 0) exclusions.push(`${excludedHidden} hidden slide${excludedHidden > 1 ? "s" : ""} not evaluated`);
  if (excludedAppendix > 0) exclusions.push(`${excludedAppendix} appendix/backup slide${excludedAppendix > 1 ? "s" : ""} not evaluated`);
  if (excludedPostClosing > 0) exclusions.push(`${excludedPostClosing} slide${excludedPostClosing > 1 ? "s" : ""} after closing slide not evaluated`);
  if (exclusions.length) { out.push("=== EXCLUDED ==="); out.push(...exclusions); out.push(""); }

  return out.join("\n");
}

// ── Simple PPTX fallback (flat <a:t> extraction) ──────────────────────────────

function doSimplePptxExtraction(zip: ZipReader): string | undefined {
  const slideEntries = zip.list()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort(compareSlideNames);
  if (!slideEntries.length) return undefined;
  const slides = slideEntries
    .map((entry, index) => {
      const xml = zip.read(entry);
      const text = extractTaggedText(xml, /<a:t>([\s\S]*?)<\/a:t>/g).join(" ");
      return text ? `Slide ${index + 1}: ${text}` : "";
    })
    .filter(Boolean);
  return slides.length ? slides.join("\n\n") : undefined;
}

// ── PPTX extraction (async, pure-JS, no temp files) ───────────────────────────

async function extractPptxText(artifact: Artifact): Promise<string | undefined> {
  try {
    const buffer = await getArtifactBuffer(artifact);
    if (!buffer) return artifact.content ?? artifact.extractedText;

    const zip = openZipFromBuffer(buffer);

    try {
      const result = doRichPptxExtraction(zip);
      if (result) return result;
      console.warn("[Deckspert][PPTX] Rich extraction returned empty, falling back to simple");
    } catch (err) {
      console.warn("[Deckspert][PPTX] Rich extraction failed, falling back:", err instanceof Error ? err.message : err);
    }

    return doSimplePptxExtraction(zip);
  } catch (err) {
    console.warn("[Deckspert][PPTX] ZIP parse failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

// ── PDF closing-slide filter ──────────────────────────────────────────────────

function filterPdfSlides(slides: string[]): { filtered: string[]; excludedCount: number } {
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i] ?? "";
    const textContent = slide.replace(/^Slide\s+\d+:\s*/i, "").trim();
    const firstSegment = textContent.split("|")[0]?.trim() ?? "";
    if (CLOSING_SLIDE_PATTERNS.some((p) => p.test(firstSegment)) || APPENDIX_SECTION_PATTERNS.some((p) => p.test(firstSegment))) {
      return { filtered: slides.slice(0, i + 1), excludedCount: slides.length - i - 1 };
    }
  }
  return { filtered: slides, excludedCount: 0 };
}

// ── PDF extraction ────────────────────────────────────────────────────────────

async function extractPdfText(artifact: Artifact): Promise<string | undefined> {
  const pdfBuffer = await getArtifactBuffer(artifact);
  if (!pdfBuffer) return artifact.content ?? artifact.extractedText;

  let slideNumber = 0;
  const result = await pdfParse(pdfBuffer, {
    pagerender: async (pageData) => {
      slideNumber += 1;
      return renderPdfPageText(pageData, slideNumber);
    }
  });

  const allSlides = (result.text ?? "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const match = block.match(/^Slide\s+(\d+):?\s*([\s\S]*)$/i);
      if (!match) return normalizePdfPageText(block);
      const label = `Slide ${match[1]}`;
      const body = normalizePdfPageText(match[2] ?? "");
      return body ? `${label}: ${body}` : `${label}: [No extractable text]`;
    })
    .filter(Boolean);

  if (!allSlides.length) return undefined;

  const { filtered, excludedCount } = filterPdfSlides(allSlides);
  const parts = [...filtered];
  if (excludedCount > 0) {
    parts.push(`\n[Note: ${excludedCount} slide${excludedCount > 1 ? "s" : ""} after closing/appendix detected and excluded from evaluation]`);
  }
  return parts.join("\n\n") || undefined;
}

// ── DOCX extraction (still uses temp file path for execFileSync) ──────────────

import { execFileSync } from "node:child_process";

function listZipEntriesByPath(path: string): string[] {
  const listing = execFileSync("unzip", ["-Z1", path], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return listing.split("\n").map((l) => l.trim()).filter(Boolean);
}

function readZipEntryByPath(path: string, entry: string): string {
  return execFileSync("unzip", ["-p", path, entry], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function extractDocxText(artifact: Artifact): string | undefined {
  if (!hasExtension(artifact.filename, ".docx") || !artifact.fileDataBase64) {
    return artifact.content ?? artifact.extractedText;
  }
  return withTempFile(artifact, (path) => {
    const entries = listZipEntriesByPath(path).filter((e) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(e));
    if (!entries.length) return undefined;
    const sections = entries
      .map((e) => {
        const xml = readZipEntryByPath(path, e);
        return extractTaggedText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(" ");
      })
      .filter(Boolean);
    return sections.length ? sections.join("\n\n") : undefined;
  });
}

async function extractDocxTextFromSource(artifact: Artifact): Promise<string | undefined> {
  if (!hasExtension(artifact.filename, ".docx")) return artifact.content ?? artifact.extractedText;
  const buffer = await getArtifactBuffer(artifact);
  if (!buffer) return artifact.content ?? artifact.extractedText;
  return withTempBufferFile(artifact, buffer, (path) => {
    const entries = listZipEntriesByPath(path).filter((e) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(e));
    if (!entries.length) return undefined;
    const sections = entries
      .map((e) => {
        const xml = readZipEntryByPath(path, e);
        return extractTaggedText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(" ");
      })
      .filter(Boolean);
    return sections.length ? sections.join("\n\n") : undefined;
  });
}

// ── Document text routing ─────────────────────────────────────────────────────

async function extractDocumentText(artifact: Artifact): Promise<string | undefined> {
  if (artifact.extractedText) return artifact.extractedText;
  if (artifact.content) return artifact.content;

  if (artifact.kind === "pptx") return extractPptxText(artifact);

  if (artifact.kind === "doc") {
    if (artifact.fileDataBase64) return extractDocxText(artifact);
    return extractDocxTextFromSource(artifact);
  }

  if (artifact.kind === "pdf") return extractPdfText(artifact);

  return undefined;
}

// ── Image analysis ────────────────────────────────────────────────────────────

async function analyzeImageFromUrl(sourceUrl: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "Image attached — vision analysis unavailable (no API key).";

  try {
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) return `Image attached — could not fetch for analysis (${imageResponse.status}).`;
    const rawBuffer = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(rawBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 8192) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
    }
    const base64 = btoa(binary);
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const mediaType = (contentType.split(";")[0] ?? "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp";

    const visionResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Describe this image concisely for business presentation context. Focus on any key data, messages, charts, strategic content, or planning material visible. Under 200 words." }
          ]
        }]
      })
    });

    if (!visionResponse.ok) return "Image attached — vision analysis failed.";
    const json = (await visionResponse.json()) as { content: Array<{ type: string; text: string }> };
    return json.content.find((b) => b.type === "text")?.text ?? "Image analyzed but no description returned.";
  } catch {
    return "Image attached — vision analysis encountered an error.";
  }
}

// ── Public exports ────────────────────────────────────────────────────────────

export async function processArtifact(artifact: Artifact): Promise<Artifact> {
  if (artifact.kind === "image") {
    const visionSummary =
      artifact.visionSummary ??
      (artifact.sourceUrl ? await analyzeImageFromUrl(artifact.sourceUrl) : summarizeImageContent(artifact.content));
    return { ...artifact, visionSummary };
  }
  if (artifact.kind === "video") {
    return { ...artifact, extractedText: artifact.extractedText ?? artifact.content };
  }
  return { ...artifact, extractedText: await extractDocumentText(artifact) };
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
    .map((a) => a.extractedText ?? a.visionSummary ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Returns the full ZIP entry list for a PPTX artifact.
 * Used by the free evaluator to detect embedded video / Excel objects before processing.
 */
export async function listPptxZipEntries(artifact: Artifact): Promise<string[]> {
  if (artifact.kind !== "pptx") return [];
  try {
    const buffer = await getArtifactBuffer(artifact);
    if (!buffer) return [];
    return openZipFromBuffer(buffer).list();
  } catch {
    return [];
  }
}
