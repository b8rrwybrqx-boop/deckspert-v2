import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireSessionAccess, getSessionProgram } from "./_sessionGuard.js";
import { logSessionUsage } from "./_sessionEmail.js";
import { runInterruptionDrill } from "../modules/drill/interruptionDrill.js";

// One round of the Module 4 interruption drill.
//
// Stateless: the client posts the whole transcript each turn, the same shape
// api/coach.ts uses, but gated on the cohort token rather than a signed-in
// user. A dropped connection therefore costs one round, not the drill.

export const maxDuration = 300;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  if (!requireSessionAccess(req)) {
    res.status(401).json({ error: "Your session access has expired. Re-enter your session code." });
    return;
  }

  try {
    const payload = readJsonBody<{ transcript?: unknown[] }>(req);
    const profile = getSessionProgram(req);

    logSessionUsage("interruption-drill", null, {
      round: Array.isArray(payload.transcript) ? payload.transcript.length + 1 : 1,
      program: profile.id
    });

    res.status(200).json(await runInterruptionDrill(payload, profile));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "The drill could not continue." });
  }
}
