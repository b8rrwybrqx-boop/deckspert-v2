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

  // Test task.read scope by listing tasks (the scope our conversion uses)
  const taskListRes = await fetch("https://api.cloudconvert.com/v2/tasks?per_page=1", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });
  const taskListBody = await taskListRes.text();

  // Test task.write scope by creating a minimal job (dry-run style — will fail on input but proves auth works)
  const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tasks: {
        "test-import": { operation: "import/url", url: "https://example.com/test.pptx", filename: "test.pptx" },
        "test-convert": { operation: "convert", input: "test-import", input_format: "pptx", output_format: "jpg" },
        "test-export": { operation: "export/url", input: "test-convert" }
      }
    })
  });
  const jobBody = await jobRes.text();

  res.status(200).json({
    keyPresent: true,
    keyLength: apiKey.length,
    keyPrefix: apiKey.slice(0, 8),
    taskList: { status: taskListRes.status, body: taskListBody.slice(0, 200) },
    jobCreate: { status: jobRes.status, body: jobBody.slice(0, 300) }
  });
}
