import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { signToken, validateCode } from "./_sessionGuard.js";
import { getProgramProfile, toPublicProfile } from "../core/programs/index.js";

// Unlock endpoint for the gated /session-material training tools.
// POST { code } → { ok: true, token, profile } when the cohort code is valid
// and not expired. The token is then attached to every evaluator call.
//
// `profile` is the client-safe view of the cohort's program: enough for the
// page to render the right stepper and labels, and nothing else. The server
// re-derives the full profile from the token on every request rather than
// trusting this copy, so a tampered one changes what the attendee sees and
// nothing about how their work is evaluated.
//
// The page also re-posts its token here on mount to recover `profile` after a
// reload; see SessionGate.

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = readJsonBody<{ code?: string }>(req);
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!code) {
      res.status(400).json({ error: "Enter the session code from your facilitator." });
      return;
    }

    const cohort = validateCode(code);
    if (!cohort) {
      res.status(401).json({ error: "That session code isn't valid or has expired. Check with your facilitator." });
      return;
    }

    res.status(200).json({
      ok: true,
      token: signToken(cohort.code),
      profile: toPublicProfile(getProgramProfile(cohort.code))
    });
  } catch {
    res.status(400).json({ error: "Could not validate the session code. Please try again." });
  }
}
