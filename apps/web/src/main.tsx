import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import EvaluatePage from "../pages/evaluate";
import CreatorPage from "../pages/creator";
import CoachPage from "../pages/coach";
import PlatformEvaluatorPage from "../pages/platform-evaluator";
import SessionMaterialPage from "../pages/session-material";
import LoginPage from "../pages/login";
import AboutPage from "../pages/public/About";
import ConnectPage from "../pages/public/Connect";
import FreeEvaluatorPage from "../pages/public/FreeEvaluator";
import PublicHomePage from "../pages/public/Home";
import CoachLitePage from "../pages/public/CoachLite";
import DeliveryPage from "../pages/public/Delivery";
import PricingPage from "../pages/public/Pricing";
import ResourcesPage from "../pages/public/Resources";
import StoryLabPage from "../pages/public/StoryLab";
import logoAsset from "./assets/logo.svg";
import evaluateAsset from "./assets/evaluate.svg";
import generateAsset from "./assets/generate.svg";
import coachAsset from "./assets/coach.svg";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { SessionGate } from "./session/SessionGate";
import { useAuth } from "./auth/useAuth";
import { useRecentWork } from "./home/useRecentWork";
import "./styles.css";

function ToolIcon({ kind }: { kind: "evaluate" | "creator" | "coach" }) {
  const asset = kind === "evaluate" ? evaluateAsset : kind === "creator" ? generateAsset : coachAsset;
  return <img className="tool-icon-image" src={asset} alt="" aria-hidden="true" />;
}

function PlatformHome() {
  const navigate = useNavigate();
  const { user, getRequestHeaders } = useAuth();
  const recentWork = useRecentWork(user?.id, getRequestHeaders);
  const tiles = [
    {
      kind: "evaluate" as const,
      title: "Evaluator",
      description: "Upload a deck for a full scored evaluation across all five TPG frameworks — Proper Prep through Dynamic Delivery.",
      route: "/platform/evaluator"
    },
    {
      kind: "creator" as const,
      title: "StoryLab",
      description: "Turn your audience, objectives, and context into a structured storyline ready for slides.",
      route: "/platform/storylab"
    },
    {
      kind: "coach" as const,
      title: "Coach",
      description: "Ask targeted questions about story structure, framing, WIIFM, opening gambits, close, or delivery.",
      route: "/platform/coach"
    },
    {
      kind: "evaluate" as const,
      title: "Dynamic Delivery",
      description: "Upload a presentation video and receive focused coaching on voice, pace, presence, and audience connection.",
      route: "/platform/dynamic-delivery"
    }
  ];

  return (
    <>
      <section className="app-hero">
        <h1 className="app-title">Welcome, {user?.displayName ?? "Account"}</h1>
        <p className="app-subtitle">
          Choose how you want to work today: evaluate a story, build in StoryLab, get targeted coaching, or refine delivery.
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
            <p className="helper-copy">Your recent StoryLab projects, Coach threads, and Delivery reports will show up here once you start working.</p>
          )}
        </div>

        <div className="card dashed-card">
          <h3 className="card-title">Start Something New</h3>
          <div className="recent-work-list">
            <button className="recent-work-item" onClick={() => navigate("/platform/dynamic-delivery")}>
              <strong className="recent-work-title">Upload a rehearsal video</strong>
              <span className="recent-work-summary">Start a new Dynamic Delivery analysis.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/platform/storylab")}>
              <strong className="recent-work-title">Start a storyboard</strong>
              <span className="recent-work-summary">Open StoryLab and shape a storyline from notes or Proper Prep.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/platform/coach")}>
              <strong className="recent-work-title">Ask Story Coach</strong>
              <span className="recent-work-summary">Get focused help on Big Idea, framing, WIIFM, and story flow.</span>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const methodologyUrl = "https://tpgpersuasivestorytelling.com/";
  const publicNavItems = [
    { label: "StoryLab", to: "/storylab" },
    { label: "Ask the Coach", to: "/coach" },
    { label: "Own the Room", to: "/delivery" },
    { label: "Pricing", to: "/pricing" }
  ];

  return (
    <div className="public-shell">
      <header className="public-header">
        <Link to="/" className="public-brand">
          <img src={logoAsset} alt="TPG" className="public-brand-logo" />
          <div className="public-brand-text">
            <span>Deckspert</span>
            <strong>by TPG</strong>
          </div>
        </Link>
        <nav className="public-nav" aria-label="Public navigation">
          {publicNavItems.map((item) => (
            <Link key={item.to} to={item.to} className={location.pathname === item.to ? "active" : ""}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="public-header-actions">
          <a className="public-methodology-link" href={methodologyUrl}>
            TPG Persuasive Storytelling
          </a>
          <Link className="public-login-link" to="/platform">
            Log in
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="public-footer">
        <div className="public-section-inner public-footer-grid">
          <div>
            <a className="public-footer-emphasis" href="https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation">
              Book a Call
            </a>
            <Link to="/platform">Log In</Link>
          </div>
          <div>
            <a href="https://www.linkedin.com/in/todd-bradley-57621b2/">LinkedIn: Todd Bradley</a>
            <a href="mailto:tbradley@tpg-mail.com">Email: tbradley@tpg-mail.com</a>
          </div>
          <div>
            <a href={methodologyUrl}>TPG Persuasive Storytelling</a>
            <Link to="/">Deckspert: deckspert-tpg.com</Link>
          </div>
        </div>
        <div className="public-section-inner public-footer-bottom">
          Deckspert / TPG / The Partnering Group. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function PlatformShell() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const navItems = [
    { label: "Platform", to: "/platform" },
    { label: "Evaluator", to: "/platform/evaluator" },
    { label: "StoryLab", to: "/platform/storylab" },
    { label: "Coach", to: "/platform/coach" },
    { label: "Dynamic Delivery", to: "/platform/dynamic-delivery" }
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/platform" className="app-header-title">TPG Deckspert</Link>
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
            <Route index element={<PlatformHome />} />
            <Route path="evaluator" element={<PlatformEvaluatorPage />} />
            <Route path="storylab" element={<CreatorPage />} />
            <Route path="coach" element={<CoachPage />} />
            <Route path="dynamic-delivery" element={<EvaluatePage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicShell><PublicHomePage /></PublicShell>} />
      <Route path="/about" element={<PublicShell><AboutPage /></PublicShell>} />
      <Route path="/resources" element={<PublicShell><ResourcesPage /></PublicShell>} />
      <Route path="/connect" element={<PublicShell><ConnectPage /></PublicShell>} />
      <Route path="/storylab" element={<PublicShell><StoryLabPage /></PublicShell>} />
      <Route path="/pricing" element={<PublicShell><PricingPage /></PublicShell>} />
      <Route path="/delivery" element={<PublicShell><DeliveryPage /></PublicShell>} />
      <Route path="/coach" element={<PublicShell><CoachLitePage /></PublicShell>} />
      <Route path="/free-evaluator" element={<PublicShell><FreeEvaluatorPage /></PublicShell>} />
      <Route path="/login" element={<PublicShell><LoginPage /></PublicShell>} />
      <Route
        path="/session-material"
        element={
          <SessionGate>
            <SessionMaterialPage />
          </SessionGate>
        }
      />
      <Route
        path="/platform/*"
        element={
          <ProtectedRoute>
            <PlatformShell />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppShell() {
  return (
    <AppRoutes />
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
