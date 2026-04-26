import { Link } from "react-router-dom";

export default function CoachLitePage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">Ask the Coach</p>
          <h1>Your AI storytelling coach.</h1>
          <p className="public-hero-copy">
            Start with Coach Lite for focused guidance on Proper Prep and story arcs. Full Coach access expands across
            the complete TPG methodology.
          </p>
          <div className="public-action-row">
            <Link className="public-primary-button" to="/pricing">
              View access options
            </Link>
            <a className="public-outline-button public-outline-button-dark" href="https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation">
              Book a conversation
            </a>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker public-kicker-blue">Lite version</p>
            <h2>Quick coaching for early story thinking.</h2>
            <p className="public-intro">
              Coach Lite will provide an email-gated coaching session for Proper Prep and Story Arcs. The full paid
              version covers all five TPG frameworks.
            </p>
          </div>
          <div className="public-module-card">
            <p className="public-card-tag">Full coach</p>
            <h3>Powered by the complete TPG methodology.</h3>
            <p>
              Paid access expands coaching across Proper Prep, Structured Story, Story Arcs, Compelling Content, and
              Dynamic Delivery.
            </p>
            <Link className="public-resource-link public-resource-link-light" to="/pricing">
              Explore full access
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
