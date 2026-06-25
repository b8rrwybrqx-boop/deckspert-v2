import { Link } from "react-router-dom";

const entries = [
  {
    label: "Evaluate",
    audience: "For an existing deck",
    action: "Upload your deck. Find out which sections are holding and which are losing the room.",
    tone: "free",
    to: "/free-evaluator"
  },
  {
    label: "Fix a Section",
    audience: "For a known weak spot",
    action: "Know which section is weak? Get targeted, specific guidance on that section only.",
    tone: "paid",
    to: "/pricing"
  },
  {
    label: "Build from Scratch",
    audience: "For starting from zero",
    action: "Start from Proper Prep inputs. Build a complete story structure, ready to turn into a PowerPoint.",
    tone: "paid",
    to: "/pricing"
  },
  {
    label: "Refine",
    audience: "For iterating a section",
    action: "Your story is close. Work section by section until every part earns its place.",
    tone: "paid",
    to: "/pricing"
  }
];

const freeIncludes = [
  "High-level story read",
  "Section scores + gap summary",
  "Strengths and weaknesses identified",
  "Limited recommendations"
];

const freeExcludes = [
  "Full scoring",
  "Fix + Build",
  "Own the Room",
  "More coaching time"
];

const paidIncludes = [
  "Full scoring, every section",
  "Slide-by-slide guidance",
  "Missing section identification",
  "Fix and Build entry points",
  "Personal practice roadmap"
];

export default function StoryLabPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">StoryLab</p>
          <h1>Your story has gaps. StoryLab finds them. And fixes them.</h1>
          <p className="public-hero-copy">
            Upload your deck. Get a scored read against the TPG framework. No vague feedback. Named sections. Specific actions.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker public-kicker-blue">Choose your entry point</p>
          <h2>Pick where you need the most help.</h2>
          <div className="tool-card-grid tool-card-grid-4">
            {entries.map((entry) => (
              <article className="tool-card" key={entry.label}>
                <h3>{entry.label}</h3>
                <strong>{entry.audience}</strong>
                <p>{entry.action}</p>
                <Link
                  className={`tool-card-cta ${entry.tone === "free" ? "public-primary-button" : "public-outline-button"}`}
                  to={entry.to}
                >
                  {entry.tone === "free" ? "Try the Free Evaluator" : "View access options"}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker public-kicker-blue">Free evaluator</p>
            <h2>Try it. See the gap.</h2>
            <p className="public-intro">
              Upload your deck. Get a high-level read on story structure, section presence, and where the story falls short.
            </p>
            <ul className="public-feature-list">
              {freeIncludes.map((item) => (
                <li key={item} className="public-feature-list-item public-feature-list-item-yes">{item}</li>
              ))}
              {freeExcludes.map((item) => (
                <li key={item} className="public-feature-list-item public-feature-list-item-no">{item}</li>
              ))}
            </ul>
            <div className="public-action-row" style={{ marginTop: "20px" }}>
              <Link className="public-primary-button" to="/free-evaluator">
                Try the Free Evaluator
              </Link>
            </div>
          </div>
          <div className="public-module-card">
            <p className="public-card-tag">Full access</p>
            <h3>An everyday partner for every presentation.</h3>
            <p>
              Full scoring. Slide-by-slide guidance. Fix what is weak or build from scratch. Plus a personal practice plan that follows your progress.
            </p>
            <ul className="public-feature-list" style={{ marginTop: "16px" }}>
              {paidIncludes.map((item) => (
                <li key={item} className="public-feature-list-item public-feature-list-item-yes">{item}</li>
              ))}
            </ul>
            <Link className="public-resource-link public-resource-link-light" to="/pricing" style={{ display: "inline-block", marginTop: "16px" }}>
              Explore pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ── Creator showcase (placeholder screenshots, to be captured) ── */}
      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker public-kicker-blue">Build from scratch</p>
          <h2>The Story Lab Creator, step by step.</h2>
          <p className="public-intro">
            Start from context, shape your Proper Prep, build the Story Board, and export the full story, with a coach beside you the whole way.
          </p>
          <div className="public-screenshot-gallery">
            {["Context", "Proper Prep", "Story Board", "Full Story"].map((label, i) => (
              <figure className="public-screenshot-figure" key={label}>
                <div className="public-screenshot-placeholder">Story Lab Creator: {label} (screenshot coming soon)</div>
                <figcaption>
                  <span className="public-screenshot-step">{i + 1}</span>
                  {label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
