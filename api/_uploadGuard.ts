import { createHmac } from "node:crypto";

import { getAuthenticatedUser } from "./auth.js";
import { requireSessionAccess, safeEqualHex } from "./_sessionGuard.js";
import { readHeader, type ApiRequest } from "./_utils.js";

// Shared access control for the client-upload token endpoints.
//
// A client token minted by `handleUpload` lets the holder write arbitrary
// bytes into the Vercel Blob store under our own domain, so minting one has to
// cost a credential. The upload endpoints serve three tiers of caller, and any
// one of them is sufficient:
//
//   1. A signed-in platform user (Creator, Coach, delivery review, platform
//      evaluator) — a Supabase bearer token.
//   2. An unlocked training-session attendee (/session-material) — the cohort
//      token verified by _sessionGuard.
//   3. A visitor on the public free evaluator — a short-lived ticket issued by
//      /api/email-gate once they've handed over an email address.
//
// Tier 3 exists because the free evaluator is deliberately open to the public;
// the ticket doesn't identify anyone, it just means the mint came from someone
// who walked through our funnel minutes ago rather than from a script hitting
// the endpoint directly.

export const UPLOAD_TICKET_HEADER = "x-deckspert-upload-ticket";

// Long enough to pick a file and upload it, short enough that a ticket
// scraped out of a response body is worthless by the time it's reused.
const TICKET_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  // Mirrors _sessionGuard: a constant in local dev so the gate works without
  // extra env setup; production must set SESSION_TOKEN_SECRET to a real value.
  return process.env.SESSION_TOKEN_SECRET ?? "deckspert-dev-session-secret";
}

// The `upload-ticket:` prefix domain-separates this signature from the cohort
// token signed by _sessionGuard with the same secret, so neither can be
// replayed as the other.
function sign(expiresAt: string): string {
  return createHmac("sha256", secret()).update(`upload-ticket:${expiresAt}`).digest("hex");
}

/** Mints the short-lived upload ticket handed to free-evaluator visitors. */
export function signUploadTicket(): string {
  const expiresAt = String(Date.now() + TICKET_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function verifyUploadTicket(ticket: string): boolean {
  const idx = ticket.lastIndexOf(".");
  if (idx === -1) {
    return false;
  }

  const expiresAt = ticket.slice(0, idx);
  const signature = ticket.slice(idx + 1);
  if (!expiresAt || !signature) {
    return false;
  }

  if (!safeEqualHex(signature, sign(expiresAt))) {
    return false;
  }

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

/** Which callers an endpoint is willing to mint a token for. */
export type UploadTier = "user" | "session" | "guest";

/**
 * True when the caller holds one of the accepted credentials. Ordered cheapest
 * first: both token checks are local HMAC work, while the user lookup costs a
 * Supabase round trip and a Prisma query.
 */
async function hasUploadAccess(req: ApiRequest, tiers: readonly UploadTier[]): Promise<boolean> {
  if (tiers.includes("guest")) {
    const ticket = readHeader(req, UPLOAD_TICKET_HEADER);
    if (ticket && verifyUploadTicket(ticket)) {
      return true;
    }
  }

  if (tiers.includes("session") && requireSessionAccess(req)) {
    return true;
  }

  return tiers.includes("user") && (await getAuthenticatedUser(req)) !== null;
}

/**
 * `handleUpload` serves two different request shapes on the same URL: the
 * browser asking for a token, and Vercel Blob calling back once the upload
 * finishes. Only the first comes from a caller of ours — the callback is
 * server-to-server and is authenticated by `handleUpload` itself against the
 * store's signature. Anything that isn't that callback needs a credential.
 *
 * `tiers` is per-endpoint rather than global so a free-evaluator guest ticket
 * can't be replayed against an endpoint meant for signed-in users only.
 */
export async function requireUploadAccess(
  req: ApiRequest,
  body: unknown,
  tiers: readonly UploadTier[]
): Promise<boolean> {
  const type = (body as { type?: unknown } | null)?.type;
  if (type === "blob.upload-completed") {
    return true;
  }

  return hasUploadAccess(req, tiers);
}
