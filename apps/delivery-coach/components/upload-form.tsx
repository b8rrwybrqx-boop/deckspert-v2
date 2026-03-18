"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { uploadVideoDirect } from "@/lib/blob/client";
import { validateUploadFile } from "@/lib/validation/delivery";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "uploaded" | "error">("idle");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => uploadState === "uploaded" && !isSubmitting, [uploadState, isSubmitting]);

  async function handleFileChange(nextFile: File | null) {
    setError("");
    setUploadProgress(0);
    setUploadState("idle");
    setFile(nextFile);

    if (!nextFile) {
      return;
    }

    try {
      validateUploadFile(nextFile);
      setUploadState("uploading");
      const blob = await uploadVideoDirect(nextFile, setUploadProgress);
      setFile(
        new File([nextFile], nextFile.name, {
          type: blob.contentType
        })
      );
      setUploadState("uploaded");
      sessionStorage.setItem(
        "delivery-upload",
        JSON.stringify({
          originalFilename: nextFile.name,
          originalBlobUrl: blob.url,
          fileSize: nextFile.size,
          mimeType: nextFile.type
        })
      );
    } catch (uploadError) {
      setUploadState("error");
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }
  }

  async function handleSubmit() {
    const savedUpload = sessionStorage.getItem("delivery-upload");
    if (!savedUpload) {
      setError("Upload must complete before the job can be created.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload = JSON.parse(savedUpload) as {
        originalFilename: string;
        originalBlobUrl: string;
        fileSize: number;
        mimeType: "video/mp4" | "video/quicktime";
      };

      const createResponse = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          userContext: context.trim() || null
        })
      });

      if (!createResponse.ok) {
        throw new Error(await createResponse.text());
      }

      const created = (await createResponse.json()) as { id: string };

      const startResponse = await fetch(`/api/jobs/${created.id}/start`, {
        method: "POST"
      });

      if (!startResponse.ok) {
        throw new Error(await startResponse.text());
      }

      router.push(`/jobs/${created.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Job creation failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel p-8">
      <div className="space-y-3">
        <p className="eyebrow">Upload</p>
        <h2 className="text-4xl font-light tracking-tight text-ink">Upload one presentation video and get focused delivery coaching.</h2>
        <p className="max-w-3xl text-lg leading-8 text-slate">
          Dynamic Delivery Coach evaluates voice and pacing, pauses and emphasis, filler words, confidence, presence, and lightweight body-language
          signals. The report is structured for executive presenters, not generic AI commentary.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-dashed border-line bg-cloud/50 p-6">
          <label className="block">
            <span className="mb-3 block text-sm font-semibold text-ink">Presentation video</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                void handleFileChange(nextFile);
              }}
              className="block w-full cursor-pointer rounded-2xl border border-line bg-white px-4 py-4 text-sm text-slate"
            />
          </label>
          <p className="mt-3 text-sm text-slate">Accepted types: MP4 and MOV. MVP target supports videos up to roughly 500 MB in practice.</p>

          {uploadState !== "idle" ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm text-ink">
                <span>{uploadState === "uploaded" ? "Upload complete" : "Upload progress"}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-3 rounded-full bg-line">
                <div className="h-3 rounded-full bg-ink transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-3 block text-sm font-semibold text-ink">Context / what kind of feedback do you want?</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Example: This is a 12-minute executive update. I want blunt feedback on pacing, filler words, and confidence."
              className="h-48 w-full rounded-2xl border border-line bg-white px-4 py-4 text-sm text-ink outline-none ring-0 placeholder:text-slate/70"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/35"
          >
            {isSubmitting ? "Creating job..." : "Start delivery analysis"}
          </button>

          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
