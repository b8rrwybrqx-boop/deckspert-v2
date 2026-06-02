// Shared branded result email + usage logging for the live-session training
// tools. Mirrors the look of api/free-evaluator.ts and reuses the same Resend
// setup; results are BCC'd to the facilitator so the room becomes a warm list.

const BCC_EMAIL = "tbradley@tpg-mail.com";
const FROM_EMAIL = "AI Coach <aicoach@deckspert-tpg.com>";
const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

export type SessionEmailRow = {
  label: string;
  status: string;
  score?: number;
};

type OverallRead = "strong" | "mixed" | "needs work";

type SessionEmailInput = {
  email: string;
  toolName: string;
  title: string | null;
  overallRead: OverallRead;
  summary: string;
  rows?: SessionEmailRow[];
  takeaways?: string[];
};

function statusColors(status: string): { fg: string; bg: string } {
  const key = status.toLowerCase();
  const map: Record<string, { fg: string; bg: string }> = {
    present: { fg: "#1b6f3c", bg: "#d1fae5" },
    strong: { fg: "#1b6f3c", bg: "#d1fae5" },
    weak: { fg: "#b45309", bg: "#fef3c7" },
    mixed: { fg: "#b45309", bg: "#fef3c7" },
    missing: { fg: "#991b1b", bg: "#fee2e2" },
    "needs work": { fg: "#991b1b", bg: "#fee2e2" },
    unclear: { fg: "#4b5563", bg: "#f3f4f6" }
  };
  return map[key] ?? { fg: "#4b5563", bg: "#f3f4f6" };
}

function buildHtml(input: SessionEmailInput): string {
  const overall = statusColors(input.overallRead);
  const titleLine = input.title
    ? `<p style="margin:0 0 6px;color:#686869;font-size:14px;">${input.toolName}: <strong>${input.title}</strong></p>`
    : `<p style="margin:0 0 6px;color:#686869;font-size:14px;">${input.toolName}</p>`;

  const rowsHtml = (input.rows ?? [])
    .map((r) => {
      const c = statusColors(r.status);
      return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#04164c;">${r.label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="display:inline-block;background:${c.bg};color:${c.fg};padding:2px 10px;border-radius:4px;font-size:12px;font-weight:700;">${r.status}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700;color:#04164c;">${r.score != null ? `${r.score}/5` : "&mdash;"}</td>
    </tr>`;
    })
    .join("");

  const rowsBlock = rowsHtml
    ? `<div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 16px;color:#04164c;font-size:16px;font-weight:700;">Element Scores</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:10px 12px;text-align:left;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Element</th>
          <th style="padding:10px 12px;text-align:center;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Status</th>
          <th style="padding:10px 12px;text-align:center;color:#04164c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Score</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`
    : "";

  const takeawaysHtml = (input.takeaways ?? [])
    .map((t) => `<li style="margin-bottom:8px;color:#4d4e4f;">${t}</li>`)
    .join("");
  const takeawaysBlock = takeawaysHtml
    ? `<div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 14px;color:#04164c;font-size:16px;font-weight:700;">Top Fixes</h2>
      <ul style="margin:0;padding-left:20px;">${takeawaysHtml}</ul>
    </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:'Open Sans',Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#04164c;padding:28px 32px;">
      <p style="margin:0 0 4px;color:#fbc312;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Deckspert by TPG · Live Session</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your ${input.toolName} Feedback</h1>
    </div>
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      ${titleLine}
      <div style="display:inline-block;background:${overall.bg};color:${overall.fg};padding:4px 14px;border-radius:4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">${input.overallRead}</div>
      <p style="margin:0;color:#4d4e4f;font-size:15px;line-height:1.7;">${input.summary}</p>
    </div>
    ${rowsBlock}
    ${takeawaysBlock}
    <div style="padding:28px 32px;background:#f8f8f8;">
      <h2 style="margin:0 0 10px;color:#04164c;font-size:16px;font-weight:700;">Keep going after today</h2>
      <p style="margin:0 0 20px;color:#4d4e4f;font-size:14px;line-height:1.6;">Your session access expires after the workshop. Get your own Deckspert account to keep evaluating, building, and coaching your stories.</p>
      <a href="https://deckspert-tpg.com/pricing" style="display:inline-block;background:#fbc312;color:#04164c;font-weight:700;font-size:14px;padding:12px 24px;border-radius:4px;text-decoration:none;margin-right:12px;">Get full access</a>
      <a href="${CALENDLY}" style="display:inline-block;color:#04164c;font-size:14px;font-weight:700;text-decoration:underline;">Book a conversation with Todd</a>
    </div>
    <div style="padding:18px 32px;background:#04164c;text-align:center;">
      <p style="margin:0;color:rgba(255,255,255,0.52);font-size:12px;">Deckspert by TPG &bull; <a href="https://deckspert-tpg.com" style="color:rgba(255,255,255,0.52);">deckspert-tpg.com</a></p>
    </div>
  </div>
</body></html>`;
}

export async function sendSessionResultEmail(input: SessionEmailInput): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const titleLabel = input.title ? `, ${input.title}` : "";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: input.email,
      bcc: BCC_EMAIL,
      subject: `Your Deckspert ${input.toolName} feedback${titleLabel}`,
      html: buildHtml(input)
    })
  });
}

export function logSessionUsage(tool: string, email: string | null, meta: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event: "session_material_run",
      tool,
      email: email ?? "anonymous",
      ...meta,
      ts: new Date().toISOString()
    })
  );
}
