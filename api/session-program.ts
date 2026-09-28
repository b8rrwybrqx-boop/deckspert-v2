import { ensureMethod, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireSessionAccess, getSessionProgram } from "./_sessionGuard.js";
import { toPublicProfile } from "../core/programs/index.js";

// Re-resolves the caller's program profile from their session token.
//
// SessionGate seeds its unlocked state straight from sessionStorage and returns
// its children without calling /api/session-access again, so a profile that
// existed only in the unlock response is gone the moment anyone reloads the tab
// or opens the tools in a second one. That attendee would then hold a valid
// cohort token, see the DEFAULT stepper and labels, and have their work
// evaluated against their real program: a silent mismatch, mid-workshop, with
// nothing on screen to suggest anything is wrong.
//
// The page calls this on mount to recover the profile. The server derives it
// from the token rather than accepting one from the client, so this is a
// recovery path, not a place to choose a program.

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  if (!requireSessionAccess(req)) {
    res.status(401).json({ error: "Your session access has expired. Re-enter your session code." });
    return;
  }

  res.status(200).json({ ok: true, profile: toPublicProfile(getSessionProgram(req)) });
}
