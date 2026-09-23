import { acceptedMimeTypes } from "../core/server/delivery-validation.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireUploadAccess } from "./_uploadGuard.js";
import { handleUpload } from "@vercel/blob/client";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const body = readJsonBody(req) as any;

  // Delivery reviews are a signed-in feature only, and these are presentation
  // videos — the largest uploads we accept. No guest or cohort tier here.
  if (!(await requireUploadAccess(req, body, ["user"]))) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: (req.raw ?? req) as any,
      onBeforeGenerateToken: async (pathname: string) => ({
        allowedContentTypes: [...acceptedMimeTypes],
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
