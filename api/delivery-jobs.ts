import { createDeliveryJob } from "../apps/delivery-coach/lib/db/jobs.js";
import { createJobRequestSchema } from "../apps/delivery-coach/lib/validation/delivery.js";
import { requireAuthenticatedUser } from "./auth.js";
import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) {
    return;
  }

  try {
    const payload = readJsonBody<ReturnType<typeof createJobRequestSchema.parse> & {
    }>(req);
    const parsed = createJobRequestSchema.parse(payload);
    const job = await createDeliveryJob({
      ...parsed,
      user
    });
    res.status(200).json({ id: job.id, status: job.status });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Job creation failed."
    });
  }
}
