import { useState } from "react";

const SESSION_KEY = "deckspert-email";

type Props = {
  headline: string;
  subCopy: string;
  submitLabel: string;
  source: string;
  onSuccess: (email: string) => void;
};

export function EmailGate({ headline, subCopy, submitLabel, source, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await fetch("/api/email-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source })
      });
    } catch {
      // best-effort — don't block on network failure
    }

    try {
      sessionStorage.setItem(SESSION_KEY, trimmed);
    } catch {
      // sessionStorage unavailable in some contexts
    }

    setIsSubmitting(false);
    onSuccess(trimmed);
  }

  return (
    <div className="email-gate-card">
      <h3 className="email-gate-headline">{headline}</h3>
      <p className="email-gate-sub">{subCopy}</p>
      <form className="email-gate-form" onSubmit={(e) => void handleSubmit(e)}>
        <input
          type="email"
          className="email-gate-input"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          autoFocus
        />
        <button type="submit" className="public-primary-button email-gate-submit" disabled={isSubmitting}>
          {isSubmitting ? "One moment..." : submitLabel}
        </button>
      </form>
      {error ? <p className="email-gate-error">{error}</p> : null}
      <p className="email-gate-note">We respect your inbox. You will only hear from us when it matters.</p>
    </div>
  );
}

export function getStoredEmail(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}
