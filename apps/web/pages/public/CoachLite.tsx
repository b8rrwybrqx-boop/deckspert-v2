import { Link } from "react-router-dom";

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

export default function CoachLitePage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">Ask the Coach</p>
          <h1>Your AI storytelling coach.</h1>
          <p className="public-hero-copy">
            Get coaching on story structure, Proper Prep, opening gambits, WIIFM, and close. Powered by the TPG
            Persuasive Storytelling methodology.
          </p>
        </div>
      </section>

      <section className="public-section public-section-light coach-embed-section">
        <div className="public-section-inner">
          <div className="coach-embed-wrapper">
            <iframe
              src="https://blush-deanna-9.tiiny.site"
              width="500"
              height="500"
              allowFullScreen
              title="Deckspert AI Story Coach"
              className="coach-embed-iframe"
            />
          </div>
          <p className="coach-embed-hint">
            Type your questions below to get coaching on story structure, opening gambits, WIIFM, and more.
          </p>
        </div>
      </section>

      <section className="public-section public-section-dark">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker">Full access</p>
            <h2>Deeper coaching across the full TPG framework.</h2>
            <p className="public-intro" style={{ color: "rgba(255,255,255,0.76)" }}>
              The platform Coach covers all five TPG frameworks — Proper Prep, Structured Story, Story Arcs, Compelling
              Content, and Dynamic Delivery — with full context from your decks and prior sessions.
            </p>
            <div className="public-action-row">
              <Link className="public-primary-button" to="/pricing">
                Unlock full access
              </Link>
              <a
                className="public-outline-button public-outline-button-dark"
                href={CALENDLY}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a conversation with Todd
              </a>
            </div>
          </div>
          <div className="public-module-card" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" }}>
            <p className="public-card-tag">What full Coach adds</p>
            <ul className="public-panel-list">
              <li>All five TPG frameworks, not just Proper Prep and story arcs</li>
              <li>Context from your own decks and evaluations</li>
              <li>Saved session history and thread continuity</li>
              <li>Team coaching workflows</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
