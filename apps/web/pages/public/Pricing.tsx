import { Link } from "react-router-dom";

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

const individualIncludes = [
  "StoryLab full, Evaluate, Fix, Build",
  "Own the Room delivery analysis",
  "Ask the Expert, 15 mins per session",
  "Personal practice dashboard"
];

export default function PricingPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner public-centered-copy">
          <p className="public-kicker">Pricing</p>
          <h1>Start free. Go deeper when you are ready.</h1>
          <p className="public-hero-copy">
            The free tools show you the gap. Full access closes it.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner">

          {/* ── Full access ────────────────────────────────────────── */}
          <div className="pricing-grid-single">
            <article className="pricing-card pricing-card-featured">
              <p className="pricing-badge-new">New</p>
              <h2>Every tool. For the person who wants to win.</h2>
              <p className="pricing-card-sub">StoryLab, Own the Room, and Ask the Expert, all three, fully unlocked. Your story gets better before every meeting.</p>
              <ul className="pricing-list">
                {individualIncludes.map((item) => (
                  <li key={item} className="pricing-list-yes">{item}</li>
                ))}
              </ul>
              <Link className="public-primary-button" to="/connect">
                Learn more about full access
              </Link>
            </article>
          </div>

          {/* ── North-star phrase ──────────────────────────────────── */}
          <p className="public-northstar pricing-northstar">More Yeses, More Often.</p>

          {/* ── Quiet team line ────────────────────────────────────── */}
          <p className="pricing-team-line">
            Looking for team or L&amp;D access?{" "}
            <a href={CALENDLY} target="_blank" rel="noopener noreferrer">
              Book a conversation with Todd →
            </a>
          </p>

        </div>
      </section>
    </div>
  );
}
