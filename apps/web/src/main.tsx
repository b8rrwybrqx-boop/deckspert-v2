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
  // Bucket-card action. Verb-plus-object per the language guide, so each pillar
  // says what it does rather than a shared "Open".
  cta: string;
  cards: PillarCard[];
  // When set, clicking the bucket card navigates straight here instead of
  // expanding the detail panel. Used for single-tool pillars (Ask the Expert,
  // Own the Room). StoryLab is left unset so it expands to its three tools.
  directRoute?: string;
};

const PILLARS: Pillar[] = [
  {
    id: "understand",
    kicker: "Understand the method",
    title: "Ask the Expert",
    icon: "coach",
    blurb:
      "Talk through a TPG framework, pressure-test your thinking, or learn how to apply the methodology.",
    intro:
      "Talk through a TPG framework, pressure-test an idea, or learn how to apply the methodology with an interactive TPG expert.",
    cta: "Ask the Expert",
    directRoute: "/platform/expert",
    cards: [
      {
        kind: "coach",
        title: "Ask the Expert",
        valueProp: "Understand the method",
        description:
          "Talk through any framework, pressure-test an idea, or get unstuck. Methodology guidance, on demand.",
        cta: "Ask the Expert",
        route: "/platform/expert",
        featured: true
      }
    ]
  },
  {
    id: "apply",
    kicker: "Apply the method",
    title: "StoryLab",
    icon: "creator",
    blurb:
      "Use StoryBuild to create the structure, StoryCheck to assess the work, or StoryCoach to solve a specific challenge using your material.",
    intro: "Build, check, and strengthen your presentation story using the TPG methodology.",
    cta: "Open StoryLab",
    // StoryLab holds three tools, so its bucket card navigates to a dedicated
    // hub page (StoryLabHome) that presents the three as cards, rather than
    // expanding inline. Keeps every bucket card behaving the same way: click → go.
    directRoute: "/platform/storylab",
    cards: [
      {
        kind: "creator",
        title: "StoryBuild",
        valueProp: "Build the story",
        description:
          "Turn notes, source documents, or an early draft into a structured presentation storyline and slide outline.",
        cta: "Start StoryBuild",
        route: "/platform/creator"
      },
      {
        kind: "evaluate",
        title: "StoryCheck",
        valueProp: "Assess the work",
        description:
          "Check a plan, storyline, or deck against the TPG methodology and identify the most important improvements.",
        cta: "Start StoryCheck",
        route: "/platform/evaluator"
      },
      {
        kind: "coach",
        title: "StoryCoach",
        valueProp: "Strengthen a challenge",
        description:
          "Ask a focused question about your audience, message, slide, or story and get specific recommendations.",
        cta: "Start StoryCoach",
        route: "/platform/coach"
      }
    ]
  },
  {
    id: "amplify",
    kicker: "Amplify your delivery",
    title: "Own the Room",
    icon: "evaluate",
    blurb:
      "Upload a recorded run-through and get timestamped coaching on voice, pacing, presence, body language, confidence, and audience connection.",
    intro: "Strengthen your presentation delivery.",
    cta: "Analyze a run-through",
    directRoute: "/platform/dynamic-delivery",
    cards: [
      {
        kind: "evaluate",
        title: "Own the Room",
        valueProp: "Amplify your delivery",
        description:
          "Upload a recorded run-through and get timestamped coaching on voice, pacing, presence, and audience connection.",
        cta: "Analyze my recording",
        route: "/platform/dynamic-delivery"
      }
    ]
  }
];

// Renders a pillar's tool cards (title, value prop, CTA → route). Used both in
// the StoryLab hub page and anywhere a pillar's tools are shown as a grid.
// `standalone` drops the upward caret + top margin the inline detail panel uses.
function PillarDetail({ pillar, standalone }: { pillar: Pillar; standalone?: boolean }) {
  const navigate = useNavigate();
  return (
    <section
      className={`platform-pillar platform-pillar-detail${standalone ? " platform-pillar-detail-standalone" : ""}`}
    >
      {/* On the standalone hub the page hero already shows kicker/title/intro,
          so the band's own head would duplicate it. */}
      {!standalone ? (
        <div className="platform-pillar-head">
          <p className="section-kicker platform-pillar-kicker">{pillar.kicker}</p>
          <h2 className="platform-pillar-title">{pillar.title}</h2>
          <p className="platform-pillar-intro">{pillar.intro}</p>
        </div>
      ) : null}
      <div className={`platform-card-grid platform-card-grid-${pillar.cards.length}`}>
        {pillar.cards.map((card) => (
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
  );
}

// Dedicated StoryLab landing. The StoryLab bucket card navigates here rather
// than expanding inline, so all three home buckets behave identically.
function StoryLabHome() {
  const applyPillar = PILLARS.find((pillar) => pillar.id === "apply");
  if (!applyPillar) return null;
  return (
    <>
      <section className="app-hero">
        <p className="section-kicker">{applyPillar.kicker}</p>
        <h1 className="app-title">{applyPillar.title}</h1>
        <p className="app-subtitle">{applyPillar.intro}</p>
        {/* The three tools overlap enough that users stall on the choice.
            State the decision rule before showing the cards. */}
        <p className="helper-copy">
          Use StoryBuild to create the structure, StoryCheck to assess the work, and StoryCoach to
          solve a specific challenge.
        </p>
      </section>
      <PillarDetail pillar={applyPillar} standalone />
      <p className="helper-copy storylab-decision-helper">
        Not sure where to begin? Start with StoryBuild when you need structure. Use StoryCheck when
        you have a draft. Choose StoryCoach when you already know what you want help with.
      </p>
    </>
  );
}

// The `pillar` value on a recent-work item is an internal key ("creator",
// "evaluator"). It was being rendered straight into the pill, so map it to the
// approved object name and a matching action here.
const RECENT_WORK_LABELS: Record<string, { label: string; action: string }> = {
  creator: { label: "StoryBuild project", action: "Continue" },
  evaluator: { label: "StoryCheck report", action: "View report" },
  coach: { label: "StoryCoach conversation", action: "Resume conversation" },
  delivery: { label: "Delivery review", action: "View delivery review" }
};

function PlatformHome() {
  const navigate = useNavigate();
  const { user, getRequestHeaders } = useAuth();
  const recentWork = useRecentWork(user?.id, getRequestHeaders);

  return (
    <>
      <section className="app-hero">
        <p className="section-kicker">Welcome back, {user?.displayName ?? "Account"}</p>
        <h1 className="app-title">What are you working on today?</h1>
        <p className="app-subtitle">Choose a tool based on where you are in the presentation process.</p>
      </section>

      <section className="platform-bucket-row" aria-label="Choose a bucket">
        {PILLARS.map((pillar) => (
          <button
            key={pillar.id}
            type="button"
            className="platform-bucket-card"
            onClick={() => pillar.directRoute && navigate(pillar.directRoute)}
          >
            <ToolIcon kind={pillar.icon} />
            <span className="section-kicker platform-bucket-kicker">{pillar.kicker}</span>
            <h2 className="platform-bucket-title">{pillar.title}</h2>
            <p className="platform-bucket-blurb">{pillar.blurb}</p>
            <span className="platform-bucket-select">{pillar.cta} →</span>
          </button>
        ))}
      </section>

      <section className="app-cards-column">
        <div className="card dashed-card">
          <h3 className="card-title">Continue Working</h3>
          {recentWork.length ? (
            <div className="recent-work-list">
              {recentWork.map((item) => {
                const meta = RECENT_WORK_LABELS[item.pillar];
                return (
                  <button
                    key={`${item.pillar}-${item.id}`}
                    className="recent-work-item"
                    onClick={() => navigate(item.route)}
                  >
                    <div className="recent-work-meta">
                      <span className={`recent-work-pill recent-work-pill-${item.pillar}`}>
                        {meta?.label ?? "Saved work"}
                      </span>
                      <span className="recent-work-date">{new Date(item.updatedAt).toLocaleString()}</span>
                    </div>
                    <strong className="recent-work-title">{item.title}</strong>
                    <span className="recent-work-summary">{item.summary}</span>
                    <span className="recent-work-action">{meta?.action ?? "Continue"} →</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="helper-copy">You haven’t saved any work yet. Start with StoryBuild, StoryCheck, StoryCoach, or a recorded delivery review.</p>
          )}
        </div>

        <div className="card dashed-card">
          <h3 className="card-title">Start something new</h3>
          <div className="recent-work-list">
            <button className="recent-work-item" onClick={() => navigate("/platform/creator")}>
              <strong className="recent-work-title">Start a StoryBuild project</strong>
              <span className="recent-work-summary">Shape a storyline from notes, source material, or an early draft.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/platform/evaluator")}>
              <strong className="recent-work-title">Start a StoryCheck</strong>
              <span className="recent-work-summary">Check a plan, storyline, or deck against the TPG methodology.</span>
            </button>
            <button className="recent-work-item" onClick={() => navigate("/platform/dynamic-delivery")}>
              <strong className="recent-work-title">Analyze a run-through</strong>
              <span className="recent-work-summary">Get timestamped coaching on your recorded delivery.</span>
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
    { label: "Own the Room", to: "/delivery" },
    { label: "Ask the Expert", to: "/coach" }
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
          <Link className="public-methodology-link" to="/pricing">
            Learn more about full access
          </Link>
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
  // Three mains in the requested order. StoryLab spans its three tools
  // (StoryBuild, StoryCheck, StoryCoach), so it highlights on any of them.
  // Listing them here keeps the top nav at three mains while every tool stays
  // reachable via the sub-nav row below. Order matches the approved mental
  // model: build the story, check the work, coach the challenge.
  const storyLabTools = [
    { label: "StoryBuild", to: "/platform/creator" },
    { label: "StoryCheck", to: "/platform/evaluator" },
    { label: "StoryCoach", to: "/platform/coach" }
  ];
  // The StoryLab hub (/platform/storylab) plus its three tools all count as
  // "in StoryLab" for nav highlighting and showing the tool sub-nav.
  const storyLabPaths = ["/platform/storylab", ...storyLabTools.map((tool) => tool.to)];
  const inStoryLab = storyLabPaths.includes(location.pathname);

  const navItems: Array<{ label: string; to: string; match?: string[] }> = [
    { label: "Home", to: "/platform" },
    { label: "Ask the Expert", to: "/platform/expert" },
    { label: "StoryLab", to: "/platform/storylab", match: storyLabPaths },
    { label: "Own the Room", to: "/platform/dynamic-delivery" }
  ];

  return (
    <div className="app-shell">
      {/* Header + nav stay pinned to the top so you can always get back to Home,
          even on long pages like an Own the Room report. */}
      <div className="app-chrome">
        <header className="app-header">
          <Link to="/platform" className="app-header-title">Deckspert by TPG</Link>
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
        <nav className="mobile-nav">
          {navItems.map((item) => {
            const active = item.match ? item.match.includes(location.pathname) : location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to} className={active ? "active" : ""}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        {inStoryLab && (
          <nav className="mobile-subnav" aria-label="StoryLab tools">
            <span className="mobile-subnav-label">StoryLab:</span>
            {storyLabTools.map((tool) => (
              <Link key={tool.to} to={tool.to} className={location.pathname === tool.to ? "active" : ""}>
                {tool.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="app-body">
        <main className="app-main">
          <Routes>
            <Route index element={<PlatformHome />} />
            <Route path="expert" element={<ExpertPage />} />
            <Route path="evaluator" element={<PlatformEvaluatorPage />} />
            <Route path="storylab" element={<StoryLabHome />} />
            <Route path="creator" element={<CreatorPage />} />
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
      {/* Legacy shell-less routes. Redirect into the platform shell so the
          header and nav are always present (Own the Room reached via /evaluate
          previously rendered with no navigation). Query strings are preserved
          so deep links like /evaluate?jobId=... still resolve to the job. */}
      <Route path="/evaluate" element={<LegacyRedirect to="/platform/dynamic-delivery" />} />
      <Route path="/creator" element={<LegacyRedirect to="/platform/creator" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Navigate drops the query string when given a plain path, which silently broke
// deep links such as /evaluate?jobId=... Carry search and hash across instead.
function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} replace />;
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
