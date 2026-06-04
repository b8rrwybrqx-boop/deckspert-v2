const frameworks = [
  { label: "Proper Prep", desc: "Know your audience & what's important to them." },
  { label: "Storyboard", desc: "Build the structure that earns a yes." },
  { label: "Story Arcs", desc: "Create tension. Earn the resolution." },
  { label: "Compelling Content", desc: "Slides that communicate, not confuse." },
  { label: "Dynamic Delivery", desc: "Voice and presence that hold the room." }
];

// Paid "Ask the Expert" — the same LiveAvatar as the free coach, but rendered
// directly for authenticated users (no email gate) with a longer session.
// NOTE: the session time limit (15 min vs the free 4 min) is configured on the
// LiveAvatar embed itself, not here. Swap this src for the 15-min embed once it
// exists; today it points at the same avatar as the free CoachLite page.
const AVATAR_EMBED_SRC =
  "https://embed.liveavatar.com/v1/0a5211c5-fe1a-4f60-b76b-72e0a8bd7df1?orientation=horizontal";

export default function ExpertPage() {
  return (
    <div className="page page-expert">
      <section className="app-hero">
        <p className="section-kicker">Understand</p>
        <h1 className="page-title">Ask the Expert</h1>
        <p className="page-subtitle">
          A live coach who knows the TPG persuasive-storytelling methodology cold. Ask about any
          framework, work through a sticking point, or pressure-test your thinking before you build.
        </p>
      </section>

      <section className="coach-frameworks-section">
        <div className="coach-framework-strip">
          {frameworks.map((f) => (
            <div className="coach-framework-item" key={f.label}>
              <strong>{f.label}</strong>
              <span>{f.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="coach-embed-section">
        <div className="coach-avatar-shell">
          <div className="coach-avatar-frame">
            <iframe
              src={AVATAR_EMBED_SRC}
              allow="microphone; camera; autoplay; fullscreen"
              allowFullScreen
              title="Deckspert AI Story Expert"
            />
          </div>
          <p className="coach-embed-hint">
            Allow microphone access when prompted to speak with your coach. You can also type your
            questions.
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
    </div>
  );
}
