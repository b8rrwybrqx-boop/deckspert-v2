import { handleUpload } from "@vercel/blob/client";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireUploadAccess } from "./_uploadGuard.js";

const allowedContentTypes = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json"
];

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const body = readJsonBody(req) as any;

  // Documents arrive from signed-in tools, unlocked training sessions, and the
  // public free evaluator, so all three tiers mint here.
  if (!(await requireUploadAccess(req, body, ["user", "session", "guest"]))) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: (req.raw ?? req) as any,
      onBeforeGenerateToken: async (pathname: string) => ({
        allowedContentTypes,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ pathname })
      }),
      onUploadCompleted: async () => {}
    });

    res.status(200).json(jsonResponse);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Upload token generation failed."
    });
  }
}
