import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { validateRealEmail } from "./_emailValidation.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  const body = readJsonBody<{ email?: string; source?: string; strict?: boolean }>(req);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const source = typeof body.source === "string" ? body.source : "unknown";
  const strict = body.strict === true;

  // Validation runs outside the catch below so a rejection is never swallowed
  // into a 200. Strict mode (e.g. the free Coach) blocks disposable and
  // unverifiable domains; non-strict keeps the lightweight format check.
  if (strict) {
    const validation = await validateRealEmail(email);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason ?? "A valid email address is required." });
      return;
    }
  } else if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "AI Coach <aicoach@deckspert-tpg.com>",
          to: "tbradley@tpg-mail.com",
          subject: `New lead, ${source}`,
          html: `<p><strong>Email:</strong> ${email}</p><p><strong>Source:</strong> ${source}</p><p><strong>Time:</strong> ${new Date().toISOString()}</p>`
        })
      });
    }

    res.status(200).json({ ok: true });
  } catch {
    // always succeed, never block a visitor over a notification failure
    res.status(200).json({ ok: true });
  }
}
