import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { requireSessionAccess, getSessionProgram } from "./_sessionGuard.js";
import { logSessionUsage } from "./_sessionEmail.js";
import { runStarterDeck } from "../modules/deck/starterDeck.js";

// Builds a low-fidelity starter deck from an attendee's storyboard.
//
// The .pptx comes back base64 in JSON rather than as a binary body so the
// render warnings travel with it. Those warnings say which titles and bullets
// were trimmed to fit, which is worth seeing BEFORE walking into a room, and a
// binary response would have to smuggle them through a header.
//
// Size is not a concern at this fidelity: a text-only deck is well under a
// megabyte even after base64, against the 4.5MB serverless body limit. If
// images are ever added, move this to Vercel Blob and return a URL instead.

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
    const payload = readJsonBody<{ title?: string; notes?: string; artifacts?: unknown[] }>(req);
    const profile = getSessionProgram(req);

    logSessionUsage("starter-deck", null, { title: payload.title ?? null, program: profile.id });

    const deck = await runStarterDeck(payload, profile);

    res.status(200).json({
      ok: true,
      filename: deck.filename,
      slideCount: deck.slideCount,
      warnings: deck.warnings,
      deckTitle: deck.deckTitle,
      pptxBase64: deck.bytes.toString("base64")
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not build the starter deck." });
  }
}
