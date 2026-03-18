import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../src/auth/useAuth";

type RouterState = {
  from?: string;
};

function normalizeAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unable to sign in right now.";
  }

  const message = error.message.toLowerCase();
  if (message.includes("rate limit")) {
    return "Too many sign-in emails were requested recently. Please wait a few minutes, then try again.";
  }

  if (message.includes("invalid email")) {
    return "Enter a valid work email to continue.";
  }

  return error.message;
}

export default function LoginPage() {
  const { user, isConfigured, authMode, signInDemo, signInWithEmailLink } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const routerState = (location.state ?? {}) as RouterState;
  const nextPath = routerState.from || "/";

  if (user) {
    return <Navigate to={nextPath} replace />;
  }

  async function handleSubmit() {
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      if (isConfigured) {
        await signInWithEmailLink(email);
        setMessage(`A secure sign-in link was sent to ${email.trim().toLowerCase()}. Use the newest email if you requested more than one.`);
      } else {
        await signInDemo(email);
      }
    } catch (submitError) {
      setError(normalizeAuthError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="card surface-card auth-card">
        <p className="section-kicker">Deckspert</p>
        <h1 className="page-title">Sign in to your storytelling workspace</h1>
        <p className="page-subtitle">
          {isConfigured
            ? "Use your work email to receive a secure sign-in link and continue into Deckspert."
            : "Use local demo sign-in in this environment while we finish the hosted authentication setup."}
        </p>

        <label className="field auth-field">
          <span className="metric-label">Work email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <button className="primary-pill-button auth-submit" onClick={() => void handleSubmit()} disabled={isSubmitting || !email.trim()}>
          {isSubmitting
            ? "Signing in..."
            : authMode === "supabase"
              ? "Email me a sign-in link"
              : "Continue in local demo mode"}
        </button>

        {message ? <p className="auth-success">{message}</p> : null}
        {error ? <p className="delivery-error-text">{error}</p> : null}

        <p className="auth-support-copy">
          {isConfigured
            ? "If you do not see the email right away, check spam or wait a moment before requesting another link."
            : "Demo mode is intended for local development only. Supabase-backed sign-in will be used for staging and pilot access."}
        </p>
      </div>
    </section>
  );
}
