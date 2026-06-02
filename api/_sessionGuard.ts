import { createHmac } from "node:crypto";
import { readHeader, type ApiRequest } from "./_utils.js";

// Shared access control for the gated /session-material training tools.
//
// Cohort codes live in the SESSION_ACCESS_CODES env var as comma-separated
// `CODE:YYYY-MM-DD` pairs (the date is the last day the code works, inclusive),
// e.g. "PERSUADE-JUN:2026-06-30,LEADERSHIP-Q3:2026-09-15".
//
// On a successful unlock the client receives a token of the form
// `CODE.<hmac>` (HMAC-SHA256 of the code, keyed by SESSION_TOKEN_SECRET) and
// sends it back on every evaluator call as the `x-session-token` header. The
// token can't be forged without the secret, and the code's expiry is
// re-checked server-side on every request so an unlocked tab stops working
// once the cohort window closes.

export const SESSION_TOKEN_HEADER = "x-session-token";

type CohortCode = { code: string; expiry: string };

function parseCodes(): CohortCode[] {
  const raw = process.env.SESSION_ACCESS_CODES;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(":");
      if (idx === -1) return { code: stripQuotes(entry), expiry: "" };
      return { code: stripQuotes(entry.slice(0, idx).trim()), expiry: entry.slice(idx + 1).trim() };
    })
    .filter((c) => c.code.length > 0);
}

// Tolerate values pasted with surrounding quotes, e.g. "PERSUASIVE1:2026-06-30".
function stripQuotes(value: string): string {
  return value.replace(/^["']+|["']+$/g, "").trim();
}

function isExpired(expiry: string): boolean {
  if (!expiry) return false; // no expiry configured → code never expires
  // Compare calendar dates in UTC; the code is valid through the end of `expiry`.
  const cutoff = new Date(`${expiry}T23:59:59.999Z`).getTime();
  if (Number.isNaN(cutoff)) return false;
  return Date.now() > cutoff;
}

/**
 * Returns the matching cohort if the code exists and is not expired.
 * Matching is case-insensitive and whitespace/quote-tolerant so a room full of
 * attendees typing the code can't be tripped up by capitalization.
 */
export function validateCode(code: string): CohortCode | null {
  const entered = stripQuotes(code.trim()).toLowerCase();
  if (!entered) return null;
  const match = parseCodes().find((c) => c.code.toLowerCase() === entered);
  if (!match) return null;
  if (isExpired(match.expiry)) return null;
  return match;
}

function secret(): string {
  // Falls back to a constant in local dev so the gate works without extra env
  // setup; production must set SESSION_TOKEN_SECRET to a real secret.
  return process.env.SESSION_TOKEN_SECRET ?? "deckspert-dev-session-secret";
}

function sign(code: string): string {
  return createHmac("sha256", secret()).update(code).digest("hex");
}

/** Mints the opaque token handed to the client after a successful unlock. */
export function signToken(code: string): string {
  return `${code}.${sign(code)}`;
}

// Constant-time comparison of two equal-length hex strings — avoids leaking
// signature bytes through early-exit timing.
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Recovers the code from a token if (and only if) the signature is valid. */
function verifyToken(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const code = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  if (!code || !signature) return null;
  return safeEqualHex(signature, sign(code)) ? code : null;
}

/**
 * Gate for evaluator handlers. Verifies the token signature AND that the
 * underlying cohort code is still valid (not expired, still configured).
 */
export function requireSessionAccess(req: ApiRequest): boolean {
  const token = readHeader(req, SESSION_TOKEN_HEADER);
  if (!token) return false;
  const code = verifyToken(token);
  if (!code) return false;
  return validateCode(code) !== null;
}
