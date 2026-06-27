const storyPrinciples = [
  {
    title: "Audience first",
    copy: "Start with what the audience needs to understand, believe, and do, not with the slides you already have."
  },
  {
    title: "Structure before polish",
    copy: "Clarify situation, root cause, Big Idea, WIIFM, and close before investing energy in formatting."
  },
  {
    title: "Practice in the workflow",
    copy: "Make the method available while teams are writing, reviewing, revising, and rehearsing real presentations."
  }
];

const platformRoles = [
  {
    label: "StoryLab",
    copy: "Evaluate, fix, or build the story — a consistent read on structure, clarity, and audience logic, plus the tools to improve it before the deck is locked."
  },
  {
    label: "Ask the Expert",
    copy: "On-demand expert guidance on specific storytelling questions, from Proper Prep to Story Arcs."
  },
  {
    label: "Own the Room",
    copy: "Turns rehearsal video into practical coaching on pace, presence, and delivery habits."
  }
];

export default function AboutPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner public-hero-grid">
          <div>
            <p className="public-kicker">About Deckspert</p>
            <h1>Built to make TPG storytelling easier to apply after training.</h1>
            <p className="public-hero-copy">
              Deckspert helps teams keep using the method when the workshop is over and the real work begins.
            </p>
          </div>
          <div className="public-hero-panel">
            <p className="public-panel-label">Why it exists</p>
            <p className="public-panel-copy">
              Storytelling capability only sticks when people can apply it in the moments that matter: preparing,
              reviewing, revising, and rehearsing important work.
            </p>
          </div>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker">The problem</p>
            <h2>Training creates the language. Daily work determines whether it lasts.</h2>
          </div>
          <div className="public-text-stack">
            <p>
              TPG storytelling training gives teams a shared way to think about persuasion: what the audience needs,
              why the current situation matters, what is really causing the problem, and what action the story should
              move.
            </p>
            <p>
              Deckspert turns that shared language into an operating rhythm. It gives teams a place to pressure-test
              structure, sharpen message logic, ask focused questions, and practice delivery while the work is still
              being shaped.
            </p>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker">Methodology</p>
          <h2>Designed around the habits behind persuasive commercial stories.</h2>
          <p className="public-intro">
            Deckspert reinforces the discipline behind clear audience need, useful situation framing, root cause,
            compelling Big Idea, WIIFM, and a close that moves action forward.
          </p>
          <div className="public-card-grid public-card-grid-three">
            {storyPrinciples.map((principle) => (
              <article className="public-module-card" key={principle.title}>
                <p className="public-card-tag">Principle</p>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-dark">
        <div className="public-section-inner">
          <p className="public-kicker">Platform role</p>
          <h2>One platform, three distinct jobs.</h2>
          <p className="public-intro">
            The paid platform separates story development, expert guidance, and delivery so each tool can do its job
            cleanly.
          </p>
          <div className="public-dark-card-grid">
            {platformRoles.map((role) => (
              <article className="public-dark-card" key={role.label}>
                <h3>{role.label}</h3>
                <p>{role.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker">Public and paid</p>
            <h2>A useful free starting point, then a deeper team platform.</h2>
          </div>
          <div className="public-compare">
            <div>
              <h3>Public layer</h3>
              <p>Home, About, Resources, Connect with us, Log in, and a free Evaluator for a quick story read.</p>
            </div>
            <div>
              <h3>Paid layer</h3>
              <p>StoryLab, Ask the Expert, and Own the Room for trained teams applying the full workflow.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
