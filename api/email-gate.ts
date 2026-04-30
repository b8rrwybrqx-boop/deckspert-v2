import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  try {
    const body = readJsonBody<{ email?: string; source?: string }>(req);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const source = typeof body.source === "string" ? body.source : "unknown";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

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
          subject: `New lead — ${source}`,
          html: `<p><strong>Email:</strong> ${email}</p><p><strong>Source:</strong> ${source}</p><p><strong>Time:</strong> ${new Date().toISOString()}</p>`
        })
      });
    }

    res.status(200).json({ ok: true });
  } catch {
    // always succeed — never block a visitor over a notification failure
    res.status(200).json({ ok: true });
  }
}
