import type { ProgramProfile } from "./types.js";
import { TPG_DEFAULT } from "./tpgDefault.js";
import { MARMON_8020 } from "./marmon8020.js";

export * from "./types.js";
export { TPG_DEFAULT } from "./tpgDefault.js";
export { MARMON_8020 } from "./marmon8020.js";

const PROFILES: ProgramProfile[] = [TPG_DEFAULT, MARMON_8020];

const BY_ID = new Map(PROFILES.map((p) => [p.id.toLowerCase(), p]));

/**
 * Cohort code -> profile id, from SESSION_PROGRAM_PROFILES.
 *
 * Deliberately a separate variable from SESSION_ACCESS_CODES rather than a
 * third field on it. That parser splits on lastIndexOf(":"), so a
 * "CODE:DATE:PROFILE" entry would parse the code as "CODE:DATE" and the expiry
 * as "PROFILE"; the expiry would then fail Date parsing, and isExpired returns
 * false on NaN, so the cohort would never expire. Silent, and it defeats the
 * gate's only time limit. Keeping the mapping separate leaves that parser alone.
 *
 * Format: "CODE:profile-id,OTHER:profile-id". Codes are matched
 * case-insensitively and tolerate surrounding quotes, matching validateCode's
 * contract, because signToken signs the configured casing rather than whatever
 * the attendee typed.
 */
function parseMappings(): Map<string, string> {
  const raw = process.env.SESSION_PROGRAM_PROFILES;
  const map = new Map<string, string>();
  if (!raw) return map;

  for (const entry of raw.split(",")) {
    const cleaned = stripQuotes(entry.trim());
    if (!cleaned) continue;
    const idx = cleaned.lastIndexOf(":");
    if (idx === -1) continue;
    const code = stripQuotes(cleaned.slice(0, idx).trim()).toLowerCase();
    const profileId = stripQuotes(cleaned.slice(idx + 1).trim()).toLowerCase();
    if (code && profileId) map.set(code, profileId);
  }
  return map;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']+|["']+$/g, "").trim();
}

export function getProfileById(id: string): ProgramProfile | undefined {
  return BY_ID.get(id.trim().toLowerCase());
}

/**
 * The profile for a cohort code, defaulting to tpg-default.
 *
 * An unmapped code is the normal case, not an error. A code mapped to an id
 * that does not exist IS a mistake, but it is someone's typo in a Vercel
 * environment variable, and the moment it shows up is nine o'clock on training
 * day. Falling back to the standard program and logging keeps the room working;
 * throwing would take the session down over a misspelling.
 */
export function getProgramProfile(code: string | null | undefined): ProgramProfile {
  if (!code) return TPG_DEFAULT;
  const profileId = parseMappings().get(stripQuotes(code.trim()).toLowerCase());
  if (!profileId) return TPG_DEFAULT;

  const profile = BY_ID.get(profileId);
  if (!profile) {
    console.warn(
      `[Deckspert][Programs] SESSION_PROGRAM_PROFILES maps a cohort code to unknown profile "${profileId}". Falling back to ${TPG_DEFAULT.id}. Known profiles: ${[...BY_ID.keys()].join(", ")}`
    );
    return TPG_DEFAULT;
  }
  return profile;
}
