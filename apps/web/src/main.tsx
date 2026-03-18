import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import EvaluatePage from "../pages/evaluate";
import CreatorPage from "../pages/creator";
import CoachPage from "../pages/coach";
import LoginPage from "../pages/login";
import logoAsset from "./assets/logo.svg";
import evaluateAsset from "./assets/evaluate.svg";
import generateAsset from "./assets/generate.svg";
import coachAsset from "./assets/coach.svg";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/useAuth";
import { useRecentWork } from "./home/useRecentWork";
import "./styles.css";

function ToolIcon({ kind }: { kind: "evaluate" | "creator" | "coach" }) {
  const asset = kind === "evaluate" ? evaluateAsset : kind === "creator" ? generateAsset : coachAsset;
  return <img className="tool-icon-image" src={asset} alt="" aria-hidden="true" />;
}

function Home() {
  const navigate = useNavigate();
  const { user, getRequestHeaders } = useAuth();
  const recentWork = useRecentWork(user?.id, getRequestHeaders);
  const tiles = [
    {
      kind: "evaluate" as const,
      title: "Dynamic Delivery Coach",
      description: "Upload a presentation video and receive focused coaching on voice, pace, presence, and audience connection.",
      route: "/evaluate"
    },
    {
      kind: "creator" as const,
      title: "Creator",
      description: "Turn your audience, objectives, and context into a structured storyline ready for slides.",
      route: "/creator"
    },
    {
      kind: "coach" as const,
      title: "Coach",
      description: "Ask for help on Proper Prep, Story Structure, Compelling Content, or Dynamic Delivery and get on-demand expert guidance.",
      route: "/coach"
    }
  ];

  return (
    <>
      <section className="app-hero">
        <h1 className="app-title">Welcome, {user?.displayName ?? "Account"}</h1>
        <p className="app-subtitle">
          Choose how you want to work today: refine delivery, build a structured storyline, or get targeted storytelling guidance.
        </p>
      </section>

      <section className="app-tiles-row">
        {tiles.map((tile) => (
          <button key={tile.title} className={`tile tile-${tile.kind}`} onClick={() => navigate(tile.route)}>
            <ToolIcon kind={tile.kind} />
            <h3 className="tile-title">{tile.title}</h3>
            <p className="tile-description">{tile.description}</p>
          </button>
        ))}
      </section>

      <section className="app-cards-column">
        <div className="card dashed-card">
          <h3 className="card-title">Your Recent Work</h3>
          {recentWork.length ? (
            <div className="recent-work-list">
              {recentWork.map((item) => (
                <button
                  key={`${item.pillar}-${item.id}`}
                  className="recent-work-item"
                  onClick={() => navigate(item.route)}
                >
                  <div className="recent-work-meta">
                    <span className={`recent-work-pill recent-work-pill-${item.pillar}`}>{item.pillar}</span>
                    <span className="recent-work-date">{new Date(item.updatedAt).toLocaleString()}</span>
                  </div>
                  <strong className="recent-work-title">{item.title}</strong>
                  <span className="recent-work-summary">{item.summary}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="helper-copy">Your recent Creator projects, Coach threads, and Delivery reports will show up here once you start working.</p>
          )}
        </div>

        <div className="card dashed-card">
          <h3 className="card-title">Start Something New</h3>
          <div className="recent-work-list">
            <button className="recent-work-item" onClick={() => navigate("/evaluate")}>
              <strong className="recent-work-title">Upload a rehearsal video</strong>
              <span className="recent-work-summary">Start a new Dynamic Delivery Coach analysis.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/creator")}>
              <strong className="recent-work-title">Start a storyboard</strong>
              <span className="recent-work-summary">Open Creator and shape a storyline from notes or Proper Prep.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/coach")}>
              <strong className="recent-work-title">Ask Story Coach</strong>
              <span className="recent-work-summary">Get focused help on Big Idea, framing, WIIFM, and story flow.</span>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function AppShell() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const navItems = [
    { label: "Overview", to: "/" },
    { label: "Dynamic Delivery Coach", to: "/evaluate" },
    { label: "Story Creator", to: "/creator" },
    { label: "Story Coach", to: "/coach" }
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-header-title">TPG Deckspert</Link>
        <div className="app-header-right">
          <div className="app-account-group">
            <span className="app-account-label">{user?.displayName ?? "Account"}</span>
            <button className="app-header-logout" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
          <img className="brand-mark" src={logoAsset} alt="TPG logo" />
        </div>
      </header>
      <div className="app-body">
        <nav className="mobile-nav">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={location.pathname === item.to ? "active" : ""}>
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="app-main">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/evaluate"
              element={
                <ProtectedRoute>
                  <EvaluatePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/creator"
              element={
                <ProtectedRoute>
                  <CreatorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coach"
              element={
                <ProtectedRoute>
                  <CoachPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
