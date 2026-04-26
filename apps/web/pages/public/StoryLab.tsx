import { Link } from "react-router-dom";

const entries = [
  {
    label: "Evaluate and Refine",
    audience: "For an existing deck",
    action: "Upload a presentation and get a quick story read.",
    badge: "Free entry",
    tone: "free",
    to: "/free-evaluator"
  },
  {
    label: "Fix a Section",
    audience: "For a known weak spot",
    action: "Select a section and get targeted rebuild guidance.",
    badge: "Paid",
    tone: "paid",
    to: "/pricing"
  },
  {
    label: "Build a First Draft",
    audience: "For starting from scratch",
    action: "Input Proper Prep details and shape a complete storyboard.",
    badge: "Paid",
    tone: "paid",
    to: "/pricing"
  }
];

export default function StoryLabPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">StoryLab</p>
          <h1>Build and evaluate your story.</h1>
          <p className="public-hero-copy">
            Start with a free evaluation, then go deeper with paid tools for fixing sections and building storyboards.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker public-kicker-blue">Choose your entry point</p>
          <h2>Three ways to work on a better presentation.</h2>
          <div className="tool-card-grid">
            {entries.map((entry) => (
              <article className="tool-card" key={entry.label}>
                <span className={`tool-badge tool-badge-${entry.tone}`}>{entry.badge}</span>
                <h3>{entry.label}</h3>
                <strong>{entry.audience}</strong>
                <p>{entry.action}</p>
                <Link to={entry.to}>{entry.tone === "free" ? "Start free" : "View access options"}</Link>
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
              Upload a PDF or PowerPoint and get a high-level read on story structure, section presence, and overall
              deck insight.
            </p>
            <div className="public-action-row">
              <Link className="public-primary-button" to="/free-evaluator">
                Try the Free Evaluator
              </Link>
            </div>
          </div>
          <div className="public-module-card">
            <p className="public-card-tag">Full access</p>
            <h3>Go deeper when the stakes are higher.</h3>
            <p>
              Deckspert Professional adds full scoring, slide-by-slide guidance, Fix a Section, Build a Draft, and
              team workflows.
            </p>
            <Link className="public-resource-link public-resource-link-light" to="/pricing">
              Explore pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
