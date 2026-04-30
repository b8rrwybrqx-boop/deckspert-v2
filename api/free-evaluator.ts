import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { runFreeEvaluator } from "../modules/evaluator/freeEvaluator.js";
import type { FreeEvaluatorResponse } from "../core/schemas/freeEvaluator.js";

const BCC_EMAIL = "tbradley@tpg-mail.com";
const FROM_EMAIL = "Deckspert <notifications@deckspert-tpg.com>";

function statusColor(status: string): string {
  const map: Record<string, string> = {
    present: "#1b6f3c",
    weak: "#b45309",
    missing: "#991b1b",
    unclear: "#4b5563"
  };
  return map[status] ?? "#4b5563";
}

function statusBg(status: string): string {
  const map: Record<string, string> = {
    present: "#d1fae5",
    weak: "#fef3c7",
    missing: "#fee2e2",
    unclear: "#f3f4f6"
  };
  return map[status] ?? "#f3f4f6";
}

function buildResultEmail(result: FreeEvaluatorResponse): string {
  const overallColors: Record<FreeEvaluatorResponse["overallRead"], string> = {
    strong: "#1b6f3c",
    mixed: "#b45309",
    "needs work": "#991b1b"
  };
  const overallBg: Record<FreeEvaluatorResponse["overallRead"], string> = {
    strong: "#d1fae5",
    mixed: "#fef3c7",
    "needs work": "#fee2e2"
  };

  const sectionRows = result.sectionFeedback
    .map(
      (s) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#04164c;">${s.label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="display:inline-block;background:${statusBg(s.status)};color:${statusColor(s.status)};padding:2px 10px;border-radius:4px;font-size:12px;font-weight:700;">${s.status}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:#04164c;">${s.score}/5</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#4d4e4f;font-size:14px;">${s.feedback}</td>
    </tr>`
    )
    .join("");

  const insightItems = result.overallInsights
    .map((i) => `<li style="margin-bottom:8px;color:#4d4e4f;">${i}</li>`)
    .join("");

  const deckLine = result.deckName
    ? `<p style="margin:0 0 6px;color:#686869;font-size:14px;">Deck: <strong>${result.deckName}</strong>${result.slideCount ? ` &bull; ${result.slideCount} slides` : ""}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:'Open Sans',Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #e5e7eb;">

    <!-- Header -->
    <div style="background:#04164c;padding:28px 32px;">
      <p style="margin:0 0 4px;color:#fbc312;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Deckspert by TPG</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your Free Story Evaluation</h1>
    </div>

    <!-- Overall read -->
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      ${deckLine}
      <div style="display:inline-block;background:${overallBg[result.overallRead]};color:${overallColors[result.overallRead]};padding:4px 14px;border-radius:4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">${result.overallRead}</div>
      <p style="margin:0;color:#4d4e4f;font-size:15px;line-height:1.7;">${result.executiveSummary}</p>
    </div>

    <!-- Section feedback -->
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 16px;color:#04164c;font-size:16px;font-weight:700;">Section Feedback</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 12px;text-align:left;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Section</th>
            <th style="padding:10px 12px;text-align:center;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Status</th>
            <th style="padding:10px 12px;text-align:center;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Score</th>
            <th style="padding:10px 12px;text-align:left;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Feedback</th>
          </tr>
        </thead>
        <tbody>${sectionRows}</tbody>
      </table>
    </div>

    <!-- Insights -->
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 14px;color:#04164c;font-size:16px;font-weight:700;">Overall Insights</h2>
      <ul style="margin:0;padding-left:20px;">${insightItems}</ul>
    </div>

    <!-- CTA -->
    <div style="padding:28px 32px;background:#f8f8f8;">
      <h2 style="margin:0 0 10px;color:#04164c;font-size:16px;font-weight:700;">Want to fix it?</h2>
      <p style="margin:0 0 20px;color:#4d4e4f;font-size:14px;line-height:1.6;">${result.professionalTeaser}</p>
      <a href="https://deckspert-tpg.com/pricing" style="display:inline-block;background:#fbc312;color:#04164c;font-weight:700;font-size:14px;padding:12px 24px;border-radius:4px;text-decoration:none;margin-right:12px;">Unlock full access</a>
      <a href="https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation" style="display:inline-block;color:#04164c;font-size:14px;font-weight:700;text-decoration:underline;">Book a conversation with Todd</a>
    </div>

    <!-- Footer -->
    <div style="padding:18px 32px;background:#04164c;text-align:center;">
      <p style="margin:0;color:rgba(255,255,255,0.52);font-size:12px;">Deckspert by TPG &bull; <a href="https://deckspert-tpg.com" style="color:rgba(255,255,255,0.52);">deckspert-tpg.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

async function sendResultEmail(email: string, result: FreeEvaluatorResponse): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const deckLabel = result.deckName ? ` — ${result.deckName}` : "";
  const subject = `Your Deckspert story evaluation${deckLabel}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      bcc: BCC_EMAIL,
      subject,
      html: buildResultEmail(result)
    })
  });
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function logUsage(email: string | null, artifact: { filename?: string; kind?: string } | undefined) {
  // E5/E6 — structured usage log for cost tracking and per-email run monitoring
  console.log(
    JSON.stringify({
      event: "free_evaluation",
      email: email ?? "anonymous",
      filename: artifact?.filename ?? null,
      fileKind: artifact?.kind ?? null,
      ts: new Date().toISOString()
    })
  );
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!ensureMethod(req, res, "POST")) {
    return;
  }

  try {
    const payload = readJsonBody<{ email?: string; artifacts?: Array<{ filename?: string; kind?: string; fileSize?: number }> }>(req);
    const email = typeof payload.email === "string" && payload.email.includes("@") ? payload.email : null;

    // E3 — Server-side file size guard (client also checks, but enforce here too)
    const artifact = payload.artifacts?.[0];
    if (artifact?.fileSize != null && artifact.fileSize > MAX_FILE_BYTES) {
      res.status(400).json({ error: "This file is over the 10 MB limit. Compress your images or export a flatter PDF and try again." });
      return;
    }

    // E5/E6 — Log usage before processing
    logUsage(email, artifact);

    const result = await runFreeEvaluator(payload);

    // Send email BEFORE responding — Vercel terminates the function immediately after res.json()
    if (email) {
      try {
        await sendResultEmail(email, result);
      } catch (err) {
        console.warn("[Deckspert][FreeEvaluator] Email send failed", err instanceof Error ? err.message : err);
      }
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Free evaluation failed."
    });
  }
}
