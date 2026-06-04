import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import EvaluatePage from "../pages/evaluate";
import CreatorPage from "../pages/creator";
import CoachPage from "../pages/coach";
import ExpertPage from "../pages/expert";
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

type PillarCard = {
  kind: "evaluate" | "creator" | "coach";
  title: string;
  valueProp: string;
  description: string;
  cta: string;
  route: string;
  featured?: boolean;
};

type Pillar = {
  id: "understand" | "apply" | "amplify";
  kicker: string;
  title: string;
  icon: "evaluate" | "creator" | "coach";
  blurb: string;
  intro: string;
  cards: PillarCard[];
};

const PILLARS: Pillar[] = [
  {
    id: "understand",
    kicker: "Understand",
    title: "Ask the Expert",
    icon: "coach",
    blurb: "Learn the method from a live coach who knows every TPG framework.",
    intro: "Learn the method. A live coach who knows every TPG framework cold.",
    cards: [
      {
        kind: "coach",
        title: "Ask the Expert",
        valueProp: "Your live storytelling coach",
        description:
          "Talk through any framework, pressure-test an idea, or get unstuck — methodology coaching, on demand.",
        cta: "Start a session",
        route: "/platform/expert",
        featured: true
      }
    ]
  },
  {
    id: "apply",
    kicker: "Apply",
    title: "Story Lab",
    icon: "creator",
    blurb: "Evaluate a deck, build one from scratch, or get hands-on coaching.",
    intro:
      "Build your story. Evaluate what you have, create what you need, and get hands-on help along the way.",
    cards: [
      {
        kind: "evaluate",
        title: "Evaluate",
        valueProp: "Score an existing deck",
        description:
          "Upload a deck for a full scored evaluation across all five TPG frameworks, Proper Prep through Dynamic Delivery.",
        cta: "Evaluate a deck",
        route: "/platform/evaluator"
      },
      {
        kind: "creator",
        title: "Create from scratch",
        valueProp: "Build a storyline from zero",
        description:
          "Turn your audience, objectives, and context into a structured storyline ready to become slides.",
        cta: "Open the builder",
        route: "/platform/storylab"
      },
      {
        kind: "coach",
        title: "Coaching Companion",
        valueProp: "Context-specific help",
        description:
          "Share a deck or screenshot and get targeted guidance on framing, WIIFM, opening gambits, and the close.",
        cta: "Get coaching",
        route: "/platform/coach"
      }
    ]
  },
  {
    id: "amplify",
    kicker: "Amplify",
    title: "Own the Room",
    icon: "evaluate",
    blurb: "Rehearse your delivery and see yourself the way your audience does.",
    intro:
      "Sharpen delivery. Put the skills into practice and see yourself the way your audience does.",
    cards: [
      {
        kind: "evaluate",
        title: "Own the Room",
        valueProp: "Coaching on your delivery",
        description:
          "Upload a run-through and get timestamped feedback on voice, pace, presence, and audience connection.",
        cta: "Analyze a run-through",
        route: "/platform/dynamic-delivery"
      }
    ]
  }
];

function PlatformHome() {
  const navigate = useNavigate();
  const { user, getRequestHeaders } = useAuth();
  const recentWork = useRecentWork(user?.id, getRequestHeaders);
  const [selectedId, setSelectedId] = React.useState<Pillar["id"]>("apply");

  const selectedIndex = Math.max(0, PILLARS.findIndex((pillar) => pillar.id === selectedId));
  const selected = PILLARS[selectedIndex];
  const caretX = `${((selectedIndex + 0.5) / PILLARS.length) * 100}%`;

  return (
    <>
      <section className="app-hero">
        <p className="section-kicker">Welcome, {user?.displayName ?? "Account"}</p>
        <h1 className="app-title">One method, three ways to win.</h1>
        <p className="app-subtitle">
          Start by choosing where you want to work: understand the method, apply it to your next deck, or amplify your delivery.
        </p>
      </section>

      <section className="platform-bucket-row" aria-label="Choose a bucket">
        {PILLARS.map((pillar) => {
          const active = pillar.id === selectedId;
          return (
            <button
              key={pillar.id}
              type="button"
              className={`platform-bucket-card${active ? " platform-bucket-card-active" : ""}`}
              aria-pressed={active}
              onClick={() => setSelectedId(pillar.id)}
            >
              <ToolIcon kind={pillar.icon} />
              <span className="section-kicker platform-bucket-kicker">{pillar.kicker}</span>
              <h2 className="platform-bucket-title">{pillar.title}</h2>
              <p className="platform-bucket-blurb">{pillar.blurb}</p>
              <span className="platform-bucket-select">{active ? "Selected" : "Select →"}</span>
            </button>
          );
        })}
      </section>

      <section
        className="platform-pillar platform-pillar-detail"
        key={selected.id}
        style={{ ["--caret-x" as string]: caretX } as React.CSSProperties}
      >
        <div className="platform-pillar-head">
          <p className="section-kicker platform-pillar-kicker">{selected.kicker}</p>
          <h2 className="platform-pillar-title">{selected.title}</h2>
          <p className="platform-pillar-intro">{selected.intro}</p>
        </div>
        <div className={`platform-card-grid platform-card-grid-${selected.cards.length}`}>
          {selected.cards.map((card) => (
            <article
              key={card.title}
              className={`platform-tool-card${card.featured ? " platform-tool-card-featured" : ""}`}
            >
              <ToolIcon kind={card.kind} />
              <h3 className="platform-tool-card-title">{card.title}</h3>
              <strong className="platform-tool-card-value">{card.valueProp}</strong>
              <p className="platform-tool-card-desc">{card.description}</p>
              <button className="platform-tool-card-cta" onClick={() => navigate(card.route)}>
                {card.cta} →
              </button>
            </article>
          ))}
        </div>
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
            <p className="helper-copy">Your recent Story Lab projects, coaching threads, and Own the Room reports will show up here once you start working.</p>
          )}
        </div>

        <div className="card dashed-card">
          <h3 className="card-title">Start Something New</h3>
          <div className="recent-work-list">
            <button className="recent-work-item" onClick={() => navigate("/platform/dynamic-delivery")}>
              <strong className="recent-work-title">Upload a run-through</strong>
              <span className="recent-work-summary">Start a new Own the Room delivery analysis.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/platform/storylab")}>
              <strong className="recent-work-title">Start a storyboard</strong>
              <span className="recent-work-summary">Open Story Lab and shape a storyline from notes or Proper Prep.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/platform/coach")}>
              <strong className="recent-work-title">Open the Coaching Companion</strong>
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
    { label: "Ask the Expert", to: "/coach" },
    { label: "Story Lab", to: "/storylab" },
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
    { label: "Home", to: "/platform" },
    { label: "Ask the Expert", to: "/platform/expert" },
    { label: "Evaluate", to: "/platform/evaluator" },
    { label: "Create", to: "/platform/storylab" },
    { label: "Coaching Companion", to: "/platform/coach" },
    { label: "Own the Room", to: "/platform/dynamic-delivery" }
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
            <Route path="expert" element={<ExpertPage />} />
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
