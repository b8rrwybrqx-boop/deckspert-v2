import { NextResponse } from "next/server";

import { createDeliveryJob } from "@/lib/db/jobs";
import { createJobRequestSchema } from "@/lib/validation/delivery";

export async function POST(request: Request) {
  try {
    const payload = createJobRequestSchema.parse(await request.json());
    const job = await createDeliveryJob(payload);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job creation failed." },
      { status: 400 }
    );
  }
}
