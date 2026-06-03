import { ensureMethod, readJsonBody, type ApiRequest, type ApiResponse } from "./_utils.js";
import { runFreeEvaluator } from "../modules/evaluator/freeEvaluator.js";
import { generateFollowUpScript } from "../modules/evaluator/followUpScript.js";
import type { FreeEvaluatorResponse } from "../core/schemas/freeEvaluator.js";

const TODD_EMAIL = "tbradley@tpg-mail.com";
const FROM_EMAIL = "AI Coach <aicoach@deckspert-tpg.com>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function wrapEmail(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:'Open Sans',Arial,sans-serif;">
${inner}
</body>
</html>`;
}

function resultCardHtml(result: FreeEvaluatorResponse): string {
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

  return `
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
  </div>`;
}

function buildResultEmail(result: FreeEvaluatorResponse): string {
  return wrapEmail(resultCardHtml(result));
}

// Render Todd's spoken-word script (markdown **bold** + blank-line paragraphs) as email HTML.
function renderScriptHtml(script: string): string {
  return script
    .split(/\n\s*\n/)
    .map((para) => {
      const html = escapeHtml(para.trim())
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#04164c;">$1</strong>')
        .replace(/\n/g, "<br />");
      return `<p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.7;">${html}</p>`;
    })
    .join("");
}

// Internal email to Todd: the proposed follow-up script first, then a full copy
// of exactly what the prospect received.
function buildToddEmail(
  script: string | null,
  userEmail: string,
  result: FreeEvaluatorResponse
): string {
  const deckLine = result.deckName
    ? `<span style="color:#686869;"> &bull; ${escapeHtml(result.deckName)}${result.slideCount ? ` (${result.slideCount} slides)` : ""}</span>`
    : "";

  const scriptBody = script
    ? renderScriptHtml(script)
    : `<p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">Script generation was unavailable for this run. Use the evaluation below to draft a follow-up.</p>`;

  const scriptCard = `
  <div style="max-width:680px;margin:32px auto 0;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#04164c;padding:24px 32px;">
      <p style="margin:0 0 4px;color:#fbc312;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Deckspert &bull; Internal</p>
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Proposed follow-up script</h1>
    </div>
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 18px;color:#686869;font-size:14px;">For <strong style="color:#04164c;">${escapeHtml(userEmail)}</strong>${deckLine}</p>
      ${scriptBody}
    </div>
    <div style="padding:16px 32px;background:#f8f8f8;">
      <p style="margin:0;color:#686869;font-size:13px;line-height:1.6;">Record this as a 60 to 75 second video or send it as a follow-up email. Below is the exact evaluation <strong style="color:#04164c;">${escapeHtml(userEmail)}</strong> received.</p>
    </div>
  </div>`;

  return wrapEmail(scriptCard + resultCardHtml(result));
}

async function postResendEmail(body: Record<string, unknown>): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: FROM_EMAIL, ...body })
  });
}

async function sendUserEmail(email: string, result: FreeEvaluatorResponse): Promise<void> {
  const deckLabel = result.deckName ? `, ${result.deckName}` : "";
  await postResendEmail({
    to: email,
    subject: `Your Deckspert story evaluation${deckLabel}`,
    html: buildResultEmail(result)
  });
}

async function sendToddEmail(
  userEmail: string,
  result: FreeEvaluatorResponse,
  script: string | null
): Promise<void> {
  const deckLabel = result.deckName ? ` (${result.deckName})` : "";
  await postResendEmail({
    to: TODD_EMAIL,
    subject: `Follow-up script: ${userEmail}${deckLabel}`,
    html: buildToddEmail(script, userEmail, result)
  });
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function logUsage(email: string | null, artifact: { filename?: string; kind?: string } | undefined) {
  // E5/E6, structured usage log for cost tracking and per-email run monitoring
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

    // E3, Server-side file size guard (client also checks, but enforce here too)
    const artifact = payload.artifacts?.[0];
    if (artifact?.fileSize != null && artifact.fileSize > MAX_FILE_BYTES) {
      res.status(400).json({ error: "This file is over the 10 MB limit. Compress your images or export a flatter PDF and try again." });
      return;
    }

    // E5/E6, Log usage before processing
    logUsage(email, artifact);

    const result = await runFreeEvaluator(payload);

    // Send emails BEFORE responding, Vercel terminates the function immediately after res.json()
    if (email) {
      // Generate Todd's follow-up script (best-effort; never blocks delivery).
      let script: string | null = null;
      try {
        script = await generateFollowUpScript(result, result.deckName);
      } catch (err) {
        console.warn("[Deckspert][FreeEvaluator] Script generation failed", err instanceof Error ? err.message : err);
      }

      const sends = await Promise.allSettled([
        sendUserEmail(email, result),
        sendToddEmail(email, result, script)
      ]);
      sends.forEach((outcome, index) => {
        if (outcome.status === "rejected") {
          const which = index === 0 ? "user" : "Todd";
          console.warn(`[Deckspert][FreeEvaluator] ${which} email send failed`, outcome.reason);
        }
      });
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Free evaluation failed."
    });
  }
}
