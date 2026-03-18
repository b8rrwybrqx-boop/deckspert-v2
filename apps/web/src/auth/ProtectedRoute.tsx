import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./useAuth";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <section className="auth-loading-shell">
        <div className="card surface-card auth-loading-card">
          <p className="section-kicker">Deckspert</p>
          <h1 className="page-title">Loading your workspace…</h1>
          <p className="page-subtitle">Checking your session and getting your storytelling tools ready.</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
