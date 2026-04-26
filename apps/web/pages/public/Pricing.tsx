import { Link } from "react-router-dom";

const freeItems = ["StoryLab Evaluator", "Ask the Coach Lite", "Email-gated access"];
const paidItems = ["StoryLab full access", "Ask the Coach full", "Own the Room", "Usage dashboard", "Team activation session"];

export default function PricingPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner public-centered-copy">
          <p className="public-kicker">Pricing</p>
          <h1>Start free. Go deeper when you are ready.</h1>
          <p className="public-hero-copy">
            Paid Deckspert access is designed for client teams and varies by user count, enabled modules, and rollout
            needs.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner pricing-grid">
          <article className="pricing-card">
            <span className="tool-badge tool-badge-free">Free</span>
            <h2>Try it. See the gap.</h2>
            <ul className="pricing-list">
              {freeItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link className="public-outline-button" to="/storylab">
              Start free
            </Link>
          </article>

          <article className="pricing-card pricing-card-featured">
            <span className="tool-badge tool-badge-paid">Full access</span>
            <h2>Everything. For the whole team.</h2>
            <ul className="pricing-list">
              {paidItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a className="public-primary-button" href="https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation">
              Book a pricing conversation
            </a>
          </article>
        </div>
      </section>
    </div>
  );
}
