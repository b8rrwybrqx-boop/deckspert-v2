const frameworks = [
  { label: "Proper Prep", desc: "Know your audience & what's important to them." },
  { label: "Storyline", desc: "Build the structure that earns a yes." },
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
          Talk through a TPG framework, pressure-test an idea, or learn how to apply the methodology
          with an interactive TPG expert. Begin with your goal or question—you can speak or type.
        </p>
        {/* Ask the Expert explains the methodology; StoryCoach works on the
            user's own material. Users otherwise treat them as interchangeable. */}
        <p className="helper-copy">
          Working on a specific deck or section? StoryCoach responds to your own material.
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
            To speak with the expert, allow microphone access when your browser prompts you. You can
            type instead at any time.
          </p>
          <details className="coach-mic-help">
            <summary>Having trouble with your microphone?</summary>
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
