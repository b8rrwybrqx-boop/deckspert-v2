import { createContext, useContext, useEffect, useState, type ReactElement } from "react";
import type { PublicProgramProfile } from "../../../../core/programs/types";

const SESSION_TOKEN_KEY = "deckspert-session-token";
const SESSION_PROFILE_KEY = "deckspert-session-profile";

/** Token minted by /api/session-access, attached to evaluator calls. */
export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Header bag to spread into evaluator fetches so the server can authorize them. */
export function sessionHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { "x-session-token": token } : {};
}

/**
 * The cohort's program profile, cached for rendering.
 *
 * This is a render-fast cache, never the authority: the server re-derives the
 * profile from the token on every request, so a tampered copy changes the
 * labels an attendee sees and nothing about how their work is evaluated.
 */
function getStoredProfile(): PublicProgramProfile | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as PublicProgramProfile) : null;
  } catch {
    return null;
  }
}

function storeProfile(profile: PublicProgramProfile | null) {
  try {
    if (profile) sessionStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile));
    else sessionStorage.removeItem(SESSION_PROFILE_KEY);
  } catch {
    // sessionStorage unavailable; the profile is re-fetched on mount instead.
  }
}

const ProgramContext = createContext<PublicProgramProfile | null>(null);

/**
 * The active program profile, or null until it resolves.
 *
 * Null is a real state, not just a loading flicker: sessionStorage can be
 * unavailable and the recovery call can fail, so callers must render something
 * sensible without it rather than assuming it arrives.
 */
export function useSessionProgram(): PublicProgramProfile | null {
  return useContext(ProgramContext);
}

function storeToken(token: string) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable in some contexts, gate still works for this view
  }
}

/**
 * Passcode gate for the live-session training tools. Mirrors ProtectedRoute's
 * shape but unlocks on a shared cohort code rather than an account. Once a valid
 * code is entered the token is kept in sessionStorage so the room can move
 * between the three tools without re-entering it.
 */
export function SessionGate({ children }: { children: ReactElement }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => Boolean(getSessionToken()));
  const [profile, setProfile] = useState<PublicProgramProfile | null>(() => getStoredProfile());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recover the profile for a tab that was already unlocked. Unlocking seeds it
  // from the /api/session-access response, but that response only exists in the
  // render that performed the unlock: reload the tab, or open the tools in a
  // second one, and the token survives in sessionStorage while the profile does
  // not. Without this the attendee would hold a valid cohort token and be shown
  // the default program's stepper while the server evaluated against theirs.
  useEffect(() => {
    if (!unlocked || profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/session-program", { method: "POST", headers: sessionHeaders() });
        if (!response.ok) return;
        const data = (await response.json()) as { profile?: PublicProgramProfile };
        if (cancelled || !data.profile) return;
        setProfile(data.profile);
        storeProfile(data.profile);
      } catch {
        // Leave the profile null; the page falls back to its default labels.
      }
    })();
    return () => { cancelled = true; };
  }, [unlocked, profile]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter the session code from your facilitator.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/session-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed })
      });
      const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string; profile?: PublicProgramProfile };

      if (!response.ok || !data.token) {
        setError(data.error ?? "That session code isn't valid or has expired.");
        setIsSubmitting(false);
        return;
      }

      storeToken(data.token);
      if (data.profile) {
        setProfile(data.profile);
        storeProfile(data.profile);
      }
      setUnlocked(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (unlocked) {
    return <ProgramContext.Provider value={profile}>{children}</ProgramContext.Provider>;
  }

  return (
    <section className="session-gate-shell">
      <div className="session-gate-card">
        <p className="section-kicker">Deckspert · Live Session</p>
        <h1 className="session-gate-title">Enter your session code</h1>
        <p className="session-gate-sub">
          These tools are open to attendees of this Persuasive Storytelling session. Enter the code your
          facilitator shared to get started.
        </p>
        <form className="session-gate-form" onSubmit={(e) => void handleSubmit(e)}>
          <input
            type="text"
            className="session-gate-input"
            placeholder="SESSION-CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={isSubmitting}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="submit" className="public-primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Checking…" : "Unlock tools"}
          </button>
        </form>
        {error ? <p className="session-gate-error">{error}</p> : null}
      </div>
    </section>
  );
}
