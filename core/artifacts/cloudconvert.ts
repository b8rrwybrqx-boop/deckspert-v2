/**
 * CloudConvert integration for PPTX → per-slide JPEG conversion.
 *
 * Uses a three-step flow to avoid large JSON payloads:
 *   1. POST /jobs — creates the job with import/upload (no file content)
 *   2. POST to the import task's pre-signed upload URL — streams the file as multipart
 *   3. GET /jobs/{id}?wait=true — waits synchronously for all tasks to finish
 *
 * This avoids both problems we saw with other approaches:
 *   - import/url → DOWNLOAD_404 (CloudConvert can't reach Vercel Blob CDN)
 *   - import/base64 → payload too large (file embedded in JSON body)
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

interface UploadForm {
  url: string;
  parameters: Record<string, string>;
}

interface CloudConvertTask {
  id: string;
  name: string;
  operation: string;
  status: string;
  result?: { files?: CloudConvertFile[]; form?: UploadForm };
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

  const safeFilename = filename.endsWith(".pptx") ? filename : `${filename}.pptx`;

  // ── Step 1: Fetch the PPTX server-side ────────────────────────────────────
  // Our Vercel function can access Vercel Blob CDN fine; CloudConvert cannot.
  const fileRes = await fetch(pptxUrl);
  if (!fileRes.ok) {
    throw new Error(`CloudConvert: failed to fetch PPTX from blob storage (${fileRes.status})`);
  }
  const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
  const fileSizeKb = Math.round(fileBytes.byteLength / 1024);

  // ── Step 2: Create the job (no file content — just task definitions) ──────
  const jobPayload = {
    tasks: {
      "import-pptx": {
        operation: "import/upload",
        filename: safeFilename
      },
      "convert-slides": {
        operation: "convert",
        input: "import-pptx",
        input_format: "pptx",
        output_format: "jpg"
      },
      "export-slides": {
        operation: "export/url",
        input: "convert-slides"
      }
    }
  };

  let createRes: Response;
  try {
    createRes = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(jobPayload)
    });
  } catch (netErr) {
    throw new Error(`CC2-net: ${String(netErr).slice(0, 150)}`);
  }

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`CC2-${createRes.status}: ${text.slice(0, 200)}`);
  }

  const jobData = (await createRes.json()) as CloudConvertJobResponse;
  const jobId = jobData.data.id;
  const importTask = jobData.data.tasks.find(t => t.name === "import-pptx");

  if (!importTask?.result?.form) {
    throw new Error(`[CC2-form ${fileSizeKb}kb] no upload form. task status: ${importTask?.status}`);
  }

  const uploadForm = importTask.result.form;

  // ── Step 3: Upload the file via multipart form POST ───────────────────────
  const formData = new FormData();
  for (const [key, value] of Object.entries(uploadForm.parameters)) {
    formData.append(key, value);
  }
  formData.append(
    "file",
    new Blob([fileBytes], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    }),
    safeFilename
  );

  const uploadRes = await fetch(uploadForm.url, {
    method: "POST",
    body: formData
  });

  // S3-backed upload endpoints return 204; some return 201 or 200
  if (uploadRes.status !== 201 && uploadRes.status !== 200 && uploadRes.status !== 204) {
    const text = await uploadRes.text();
    throw new Error(`[CC3-upload] status=${uploadRes.status} ${text.slice(0, 200)}`);
  }

  // ── Step 4: Wait for job completion ───────────────────────────────────────
  let waitRes: Response;
  try {
    waitRes = await fetch(`${base}/jobs/${jobId}?wait=true`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  } catch (netErr) {
    throw new Error(`[CC4-net] ${String(netErr).slice(0, 150)}`);
  }

  if (!waitRes.ok) {
    const text = await waitRes.text();
    throw new Error(`[CC4-http] status=${waitRes.status} ${text.slice(0, 200)}`);
  }

  const job = (await waitRes.json()) as CloudConvertJobResponse;

  if (job.data.status !== "finished") {
    const taskSummary = job.data.tasks
      .map(t => `${t.name}:${t.status}`)
      .join(", ");
    throw new Error(`[CC4-status] ${job.data.status} | ${taskSummary}`);
  }

  const exportTask = job.data.tasks.find(t => t.name === "export-slides");
  const files = exportTask?.result?.files;
  if (!files?.length) {
    throw new Error("[CC4-nofiles] export task returned no files");
  }

  // Sort files by the numeric slide index in the filename (slide-1.jpg, slide-2.jpg, …)
  const sorted = [...files].sort((a, b) => {
    const numA = extractSlideNumber(a.filename);
    const numB = extractSlideNumber(b.filename);
    return numA - numB;
  });

  // ── Step 5: Download all images in parallel and base64-encode them ────────
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

  console.log("[CC-OK]", slides.length, "slides converted");
  return slides;
}

/** Extract the 1-based slide number from a CloudConvert output filename like "slide-3.jpg" */
function extractSlideNumber(filename: string): number {
  const match = /(\d+)(?:\.\w+)?$/.exec(filename);
  return match ? parseInt(match[1], 10) : 0;
}
