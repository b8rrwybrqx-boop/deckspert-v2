import { Link } from "react-router-dom";

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

const freeIncludes = ["StoryLab Evaluator", "Ask the Expert previews (example videos)"];
const freeExcludes = ["Full scoring", "Fix + Build", "Own the Room", "More expert time"];

const individualIncludes = [
  "StoryLab full, Evaluate, Fix, Build",
  "Ask the Expert, 10 mins per session",
  "Own the Room delivery analysis",
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

          {/* ── Two equal-weight cards ─────────────────────────────── */}
          <div className="pricing-grid pricing-grid-two">

            <article className="pricing-card">
              <h2>Try it. See the gap.</h2>
              <p className="pricing-card-sub">No account required.</p>
              <ul className="pricing-list">
                {freeIncludes.map((item) => (
                  <li key={item} className="pricing-list-yes">{item}</li>
                ))}
                {freeExcludes.map((item) => (
                  <li key={item} className="pricing-list-no">{item}</li>
                ))}
              </ul>
              <Link className="public-outline-button" to="/storylab">
                Start free
              </Link>
            </article>

            <article className="pricing-card pricing-card-featured">
              <p className="pricing-badge-new">New</p>
              <h2>Every tool. For the person who wants to win.</h2>
              <p className="pricing-card-sub">StoryLab, Ask the Expert, and Own the Room, all three, fully unlocked. Your story gets better before every meeting.</p>
              <ul className="pricing-list">
                {individualIncludes.map((item) => (
                  <li key={item} className="pricing-list-yes">{item}</li>
                ))}
              </ul>
              <Link className="public-primary-button" to="/connect">
                Sign up and start today
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
