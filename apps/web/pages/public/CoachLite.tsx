import { useState } from "react";
import { Link } from "react-router-dom";
import { EmailGate, getStoredEmail } from "../../src/components/EmailGate";

const CALENDLY = "https://calendly.com/tbradley-tpg-mail/storytelling-30-min-conversation";

const frameworks = [
  { label: "Proper Prep", desc: "Know your audience & what's important to them." },
  { label: "Storyboard", desc: "Build the structure that earns a yes." },
  { label: "Story Arcs", desc: "Create tension. Earn the resolution." },
  { label: "Compelling Content", desc: "Slides that communicate not confuse." },
  { label: "Dynamic Delivery", desc: "Voice and presence that hold the room." }
];

export default function CoachLitePage() {
  const [emailGiven, setEmailGiven] = useState(() => !!getStoredEmail());

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">Ask the Coach</p>
          <h1>The coach who never leaves the building.</h1>
          <p className="public-hero-copy">
            AI coaching on all TPG content & frameworks. Not a generic chatbot. A coach that knows the methodology cold.
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
                <h2>Four minutes with the coach. Free.</h2>
                <p className="coach-tier-meta">4 minutes of coaching · Email required to start</p>
              </div>
              <div className="coach-avatar-shell">
                {emailGiven ? (
                  <>
                    <div className="coach-avatar-frame">
                      <iframe
                        src="https://embed.liveavatar.com/v1/0a5211c5-fe1a-4f60-b76b-72e0a8bd7df1?orientation=horizontal"
                        allow="microphone; camera; autoplay; fullscreen"
                        allowFullScreen
                        title="Deckspert AI Story Coach"
                      />
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
                  </>
                ) : (
                  <div className="coach-email-gate-wrap">
                    <div className="coach-gate-card">
                      <EmailGate
                        headline="Four minutes of coaching on anything and everything Storytelling. Enter your email to start."
                        subCopy="You know the frameworks. Let's make sure your next deck uses them."
                        submitLabel="Start coaching session"
                        source="coach-lite"
                        strictValidation
                        onSuccess={() => setEmailGiven(true)}
                      />
                    </div>
                    <div className="coach-avatar-frame coach-gate-frame">
                      <img
                        className="coach-gate-avatar-img"
                        src="/coach-avatar.jpg"
                        alt="Your AI storytelling coach"
                      />
                      <div className="coach-gate-overlay" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Full access card */}
            <div className="coach-tier-card coach-tier-card-paid">
              <div className="coach-tier-card-header">
                <span className="tool-badge tool-badge-paid">Full access</span>
                <h2>Get full coaching access.</h2>
                <p className="coach-tier-meta">15 minutes of coaching per session · Live avatar</p>
              </div>
              <p className="coach-tier-body">
                The full Coach provides 24/7 access to insights and persuasive storytelling expertise.
              </p>
              <ul className="public-panel-list coach-tier-list">
                <li>Coaching from Live Avatar</li>
                <li>Full access to TPG Persuasive Story Telling Content</li>
                <li>All five TPG frameworks</li>
                <li>15-minute coaching sessions</li>
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
