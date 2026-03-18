import { acceptedMimeTypes } from "../apps/delivery-coach/lib/validation/delivery";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils";
import { handleUpload } from "@vercel/blob/client";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const body = readJsonBody(req) as any;

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
