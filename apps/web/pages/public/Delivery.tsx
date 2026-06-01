import { Link } from "react-router-dom";

export default function DeliveryPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">Own the Room</p>
          <h1>See yourself the way your audience sees you.</h1>
          <p className="public-hero-copy">
            Record a presentation run-through. Get timestamped coaching on pace, presence, and body language.
          </p>
          <div className="public-action-row">
            <Link className="public-primary-button" to="/platform/dynamic-delivery">
              Start your delivery analysis
            </Link>
            <Link className="public-outline-button public-outline-button-dark" to="/pricing">
              Explore access
            </Link>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker public-kicker-blue">Dynamic Delivery</p>
            <h2>The one tool no generic AI can replicate. Because it watches you present.</h2>
            <p className="public-intro">
              Record a run-through before the meeting. Get timestamped coaching on pace, presence, and body language
              scored against the TPG Dynamic Delivery framework. Walk in knowing exactly what to fix.
            </p>
          </div>
          <ul className="public-access-list">
            <li>Timestamped feedback on pace, presence, and body language</li>
            <li>Named actions tied to Dynamic Delivery criteria</li>
            <li>A clear practice plan before the next meeting.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
