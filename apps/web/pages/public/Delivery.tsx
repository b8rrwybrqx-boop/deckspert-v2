import { Link } from "react-router-dom";

const benefits = [
  {
    title: "Proprietary Video / Presentation Ingestion",
    copy: "Upload a real run-through. Deckspert ingests the actual video and slides and watches how you present, something no generic AI chatbot can do."
  },
  {
    title: "Clear, Rubric-Based Evaluation",
    copy: "Scored against the TPG Dynamic Delivery rubric across voice, pacing, body language, and confidence, with the reasons behind every score."
  },
  {
    title: "Connection to Training & Practice Plan",
    copy: "Every report ends in a personalized practice plan tied straight back to your TPG training, so you know exactly what to rehearse before the meeting."
  }
];

const screenshots = [
  { src: "/screenshots/own-the-room-report.jpg", caption: "Scored report with an executive summary and overall delivery score." },
  { src: "/screenshots/own-the-room-moments.jpg", caption: "Timestamped coaching moments: what happened, why it matters, and the fix." },
  { src: "/screenshots/own-the-room-plan.jpg", caption: "A recommended practice plan with drills, frequency, and goals." }
];

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
            <Link className="public-primary-button" to="/pricing">
              Explore access
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why Own the Room ─────────────────────────────────────────── */}
      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker public-kicker-blue">Why Own the Room</p>
          <h2>The one tool no generic AI can replicate. Because it watches you present.</h2>
          <div className="public-benefit-grid">
            {benefits.map((b) => (
              <div className="public-benefit-card" key={b.title}>
                <h3>{b.title}</h3>
                <p>{b.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── See it in action ─────────────────────────────────────────── */}
      <section className="public-section public-section-light">
        <div className="public-section-inner">
          <p className="public-kicker public-kicker-blue">See it in action</p>
          <h2>From run-through to a plan you can practice.</h2>
          <div className="public-screenshot-gallery">
            <figure className="public-screenshot-figure">
              <video
                src="/videos/own-the-room-example.mp4"
                poster="/videos/own-the-room-example-poster.jpg"
                controls
                playsInline
                preload="metadata"
              />
              <figcaption>Your recorded run-through, analyzed by Own the Room.</figcaption>
            </figure>
            {screenshots.map((shot, i) => (
              <figure className="public-screenshot-figure" key={shot.src}>
                <img src={shot.src} alt={shot.caption} loading="lazy" />
                <figcaption>
                  <span className="public-screenshot-step">{i + 1}</span>
                  {shot.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="public-section public-section-dark public-final-cta">
        <div className="public-section-inner public-centered-copy">
          <h2>Walk in knowing exactly what to fix.</h2>
          <p className="public-intro">
            Record a run-through before the meeting and get a scored, timestamped read against the TPG Dynamic Delivery framework.
          </p>
          <div className="public-action-row public-action-row-centered">
            <Link className="public-primary-button" to="/pricing">
              Explore access
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
