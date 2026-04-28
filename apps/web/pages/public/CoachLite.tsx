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
          <div className="coach-avatar-shell">
            <div className="coach-avatar-frame">
              <iframe
                src="https://embed.liveavatar.com/v1/0a5211c5-fe1a-4f60-b76b-72e0a8bd7df1?orientation=horizontal"
                allow="microphone; camera; autoplay; fullscreen"
                allowFullScreen
                title="Deckspert AI Story Coach"
              />
            </div>
          </div>
          <p className="coach-embed-hint">
            Allow microphone access when prompted to speak with your coach. You can also type your questions.
          </p>
          <details className="coach-mic-help">
            <summary>Microphone not working?</summary>
            <ul>
              <li><strong>Safari:</strong> Safari › Settings › Websites › Microphone › set Deckspert to Allow</li>
              <li><strong>Chrome:</strong> Click the lock icon beside the URL › Site settings › Microphone › Allow</li>
              <li><strong>macOS:</strong> System Settings › Privacy &amp; Security › Microphone › enable your browser</li>
              <li>Refresh the page after changing any permission setting.</li>
            </ul>
          </details>
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
