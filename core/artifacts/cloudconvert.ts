/**
 * CloudConvert integration for PPTX → per-slide JPEG conversion.
 *
 * Uses the CloudConvert v2 Jobs API with synchronous waiting (?wait=true).
 * Fetches the PPTX server-side from the Vercel Blob URL and sends it to
 * CloudConvert as a base64-encoded payload (import/base64) — this avoids
 * CloudConvert needing to reach the Vercel Blob URL directly (which returns
 * HTTP 404 from CloudConvert's servers).
 *
 * Environment variable required: CLOUDCONVERT_API_KEY
 * Sandbox key (free, watermarked): set CLOUDCONVERT_SANDBOX=true
 */

const API_BASE = "https://api.cloudconvert.com/v2";
const SANDBOX_BASE = "https://api.sandbox.cloudconvert.com/v2";

// 150 DPI is a good balance: sharp enough for Claude Vision, not oversized.
// Override via CLOUDCONVERT_DPI env var.
const DEFAULT_DPI = 150;

// Hard cap on slides converted per evaluation to control cost and latency.
// A 30-slide deck at 150 DPI produces ~30 images × ~150KB = ~4.5MB total.
const MAX_SLIDES = 40;

export interface SlideImage {
  /** 1-based slide number derived from the filename */
  slideNumber: number;
  /** JPEG image as base64 string (no data-URI prefix) */
  base64: string;
}

interface CloudConvertFile {
  url: string;
  filename: string;
  size: number;
}

interface CloudConvertTask {
  operation: string;
  status: string;
  result?: { files?: CloudConvertFile[] };
}

interface CloudConvertJobResponse {
  data: {
    id: string;
    status: string;
    tasks: CloudConvertTask[];
  };
}

/**
 * Convert a PPTX (referenced by URL) into per-slide JPEG images.
 *
 * Returns an array sorted by slide number. Throws if the API key is missing
 * or the job fails. Callers should wrap in try/catch and fall back to
 * text-only evaluation.
 */
export async function convertPptxToSlideImages(
  pptxUrl: string,
  filename: string,
  slideCount?: number
): Promise<SlideImage[]> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    throw new Error("CLOUDCONVERT_API_KEY is not configured");
  }

  const sandbox = process.env.CLOUDCONVERT_SANDBOX === "true";
  const base = sandbox ? SANDBOX_BASE : API_BASE;
  const dpi = Number(process.env.CLOUDCONVERT_DPI ?? DEFAULT_DPI);

  // Build the page range: only convert up to MAX_SLIDES slides
  const pageRange = slideCount
    ? `1-${Math.min(slideCount, MAX_SLIDES)}`
    : `1-${MAX_SLIDES}`;

  // Fetch the PPTX server-side from Vercel Blob and base64-encode it.
  // We use import/base64 instead of import/url because CloudConvert's servers
  // receive HTTP 404 when attempting to download from Vercel Blob CDN URLs.
  const fileRes = await fetch(pptxUrl);
  if (!fileRes.ok) {
    throw new Error(`CloudConvert: failed to fetch PPTX from blob storage (${fileRes.status})`);
  }
  const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
  let fileBinary = "";
  for (let i = 0; i < fileBytes.byteLength; i += 8192) {
    fileBinary += String.fromCharCode(...Array.from(fileBytes.subarray(i, i + 8192)));
  }
  const fileBase64 = btoa(fileBinary);

  const safeFilename = filename.endsWith(".pptx") ? filename : `${filename}.pptx`;

  // Single synchronous job: import base64 → convert → export URLs
  const jobPayload = {
    tasks: {
      "import-pptx": {
        operation: "import/base64",
        file: fileBase64,
        filename: safeFilename
      },
      "convert-slides": {
        operation: "convert",
        input: "import-pptx",
        input_format: "pptx",
        output_format: "jpg",
        pixel_density: dpi,
        // Produce one file per slide; CloudConvert names them slide-1.jpg, slide-2.jpg, etc.
        filename: "slide",
        pages: pageRange
      },
      "export-slides": {
        operation: "export/url",
        input: "convert-slides"
      }
    }
  };

  console.log("[CC1] submitting job, file size:", fileBytes.byteLength, "bytes");

  const jobRes = await fetch(`${base}/jobs?wait=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(jobPayload)
  });

  console.log("[CC2] job response status:", jobRes.status);

  if (!jobRes.ok) {
    const text = await jobRes.text();
    console.log("[CC2-ERR]", text.slice(0, 200));
    throw new Error(`CloudConvert job request failed (${jobRes.status}): ${text.slice(0, 300)}`);
  }

  const job = (await jobRes.json()) as CloudConvertJobResponse;
  console.log("[CC3] job status:", job.data.status);

  if (job.data.status !== "finished") {
    const taskSummary = job.data.tasks.map(t => `${t.operation}:${t.status}`).join(", ");
    console.log("[CC3-ERR] tasks:", taskSummary);
    throw new Error(`CloudConvert job did not finish — status: ${job.data.status} tasks: ${taskSummary}`);
  }

  const exportTask = job.data.tasks.find(t => t.operation === "export/url");
  const files = exportTask?.result?.files;
  if (!files?.length) {
    throw new Error("CloudConvert: export task returned no files");
  }

  // Sort files by the numeric slide index in the filename (slide-1.jpg, slide-2.jpg, …)
  const sorted = [...files].sort((a, b) => {
    const numA = extractSlideNumber(a.filename);
    const numB = extractSlideNumber(b.filename);
    return numA - numB;
  });

  // Download all images in parallel and base64-encode them
  const slides = await Promise.all(
    sorted.map(async (file): Promise<SlideImage> => {
      const res = await fetch(file.url);
      if (!res.ok) {
        throw new Error(`CloudConvert: failed to download ${file.filename} (${res.status})`);
      }
      const ab = await res.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += 8192) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
      }
      return {
        slideNumber: extractSlideNumber(file.filename),
        base64: btoa(binary)
      };
    })
  );

  return slides;
}

/** Extract the 1-based slide number from a CloudConvert output filename like "slide-3.jpg" */
function extractSlideNumber(filename: string): number {
  const match = /(\d+)(?:\.\w+)?$/.exec(filename);
  return match ? parseInt(match[1], 10) : 0;
}
