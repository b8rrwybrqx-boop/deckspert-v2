/**
 * Temporary diagnostic endpoint — remove after CloudConvert is confirmed working.
 * GET /api/test-cloudconvert
 * Returns the raw CloudConvert API response or error so we can debug the key.
 */
import type { ApiRequest, ApiResponse } from "./_utils.js";

export const maxDuration = 30;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "CLOUDCONVERT_API_KEY not set", keyPresent: false });
    return;
  }

  // Just ping the /users/me endpoint to verify auth — no conversion needed
  const response = await fetch("https://api.cloudconvert.com/v2/users/me", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });

  const body = await response.text();

  res.status(200).json({
    keyPresent: true,
    keyLength: apiKey.length,
    keyPrefix: apiKey.slice(0, 8),
    cloudConvertStatus: response.status,
    cloudConvertBody: body.slice(0, 500)
  });
}
