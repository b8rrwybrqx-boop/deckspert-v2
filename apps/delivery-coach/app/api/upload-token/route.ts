import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { acceptedMimeTypes } from "@/lib/validation/delivery";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: [...acceptedMimeTypes],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ pathname })
        };
      },
      onUploadCompleted: async () => {
        // Upload completion is acknowledged on the client via the returned blob metadata.
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload token generation failed." },
      { status: 400 }
    );
  }
}
