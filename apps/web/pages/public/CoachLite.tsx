import { useState } from "react";
import { Link } from "react-router-dom";

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

// Example Q&A clips from the video coach avatar, shown on the free page in place
// of the live avatar (which is now the paid offering).
const exampleVideos = [
  { id: "story-arc", label: "Story Arc Question", src: "/videos/story-arc-question.mp4" },
  { id: "price-objection", label: "Known Price Objection", src: "/videos/known-price-objection.mp4" },
  { id: "buyer-knowledge", label: "Buyer Knowledge Question", src: "/videos/buyer-knowledge-question.mp4" }
];

const frameworks = [
  { label: "Proper Prep", desc: "Know your audience & what's important to them." },
  { label: "Storyboard", desc: "Build the structure that earns a yes." },
  { label: "Story Arcs", desc: "Create tension. Earn the resolution." },
  { label: "Compelling Content", desc: "Slides that communicate not confuse." },
  { label: "Dynamic Delivery", desc: "Voice and presence that hold the room." }
];

export default function CoachLitePage() {
  const [selectedId, setSelectedId] = useState(exampleVideos[0].id);
  const selected = exampleVideos.find((video) => video.id === selectedId) ?? exampleVideos[0];

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">Ask the Expert</p>
          <h1>The expert who never leaves the building.</h1>
          <p className="public-hero-copy">
            On-demand expertise on all TPG content & frameworks. Not a generic chatbot. An expert that knows the methodology cold.
          </p>
        </div>
      </section>

      {/* ── Framework coverage strip ───────────────────────────────── */}
      <section className="public-section public-section-light coach-frameworks-section">
        <div className="public-section-inner">
          <div className="coach-framework-strip">
            {frameworks.map((f) => (
              <div className="coach-framework-item" key={f.label}>
                <strong>{f.label}</strong>
                <span>{f.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Two-card layout: free lite | full access ───────────────── */}
      <section className="public-section coach-embed-section">
        <div className="public-section-inner">
          <div className="coach-tier-grid">

            {/* Free card */}
            <div className="coach-tier-card">
              <div className="coach-tier-card-header">
                <span className="tool-badge tool-badge-free">Free</span>
                <h2>See the expert in action. Free.</h2>
                <p className="coach-tier-meta">Real questions, real answers from the AI story expert</p>
              </div>
              <div className="coach-avatar-shell">
                <div className="coach-avatar-frame">
                  <video
                    key={selected.src}
                    className="coach-example-video"
                    src={selected.src}
                    poster="/coach-avatar.jpg"
                    controls
                    playsInline
                    autoPlay
                  />
                </div>
                <div className="coach-example-list">
                  {exampleVideos.map((video) => {
                    const active = video.id === selected.id;
                    return (
                      <button
                        key={video.id}
                        type="button"
                        className={`coach-example-item${active ? " active" : ""}`}
                        aria-pressed={active}
                        onClick={() => setSelectedId(video.id)}
                      >
                        <span className="coach-example-q">{video.label}</span>
                        <span className="coach-example-cta">{active ? "Now playing" : "Watch →"}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="coach-embed-hint">
                  Want to ask your own questions? <Link to="/pricing">Unlock the live expert</Link> for 15-minute on-demand sessions.
                </p>
              </div>
            </div>

            {/* Full access card */}
            <div className="coach-tier-card coach-tier-card-paid">
              <div className="coach-tier-card-header">
                <span className="tool-badge tool-badge-paid">Full access</span>
                <h2>Get full expert access.</h2>
                <p className="coach-tier-meta">15 minutes per session · Live avatar</p>
              </div>
              <p className="coach-tier-body">
                The full Expert provides 24/7 access to insights and persuasive storytelling expertise.
              </p>
              <ul className="public-panel-list coach-tier-list">
                <li>Live Avatar expert</li>
                <li>Full access to TPG Persuasive Story Telling Content</li>
                <li>All five TPG frameworks</li>
                <li>15-minute expert sessions</li>
              </ul>
              <div className="public-action-row" style={{ marginTop: "24px" }}>
                <Link className="public-primary-button" to="/pricing">
                  Unlock full access
                </Link>
                <a
                  className="public-text-link-dark"
                  href={CALENDLY}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a call with Todd
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
