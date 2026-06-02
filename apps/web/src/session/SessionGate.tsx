import { useState, type ReactElement } from "react";

const SESSION_TOKEN_KEY = "deckspert-session-token";

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

function storeToken(token: string) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable in some contexts — gate still works for this view
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
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };

      if (!response.ok || !data.token) {
        setError(data.error ?? "That session code isn't valid or has expired.");
        setIsSubmitting(false);
        return;
      }

      storeToken(data.token);
      setUnlocked(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (unlocked) {
    return children;
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
