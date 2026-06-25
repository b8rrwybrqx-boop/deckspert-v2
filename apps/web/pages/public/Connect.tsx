const accessItems = [
  "Access is team-based and configured at the client level",
  "Pricing is based on user count and enabled modules",
  "Capabilities can be scoped to match rollout goals and use cases",
  "Typically deployed as part of a broader storytelling capability build",
  "We help determine the right setup based on team size, priority modules, and timeline"
];

const paidModules = [
  {
    name: "Evaluator",
    copy: "Full structured storytelling evaluation across every required section, with rationale and improvement guidance."
  },
  {
    name: "StoryLab",
    copy: "Story development workspace for shaping audience logic, narrative flow, section structure, and messaging."
  },
  {
    name: "Coach",
    copy: "Issue-level and section-level guidance for teams who need help with a specific story question."
  },
  {
    name: "Dynamic Delivery",
    copy: "Video-based delivery coaching with timestamped feedback and practical rehearsal guidance."
  }
];

const fitSignals = [
  "You have completed or are planning TPG storytelling training",
  "Your teams prepare high-stakes sales, category, marketing, or leadership presentations",
  "You want a shared platform to reinforce the method after workshops",
  "You need access configured for a client team, business unit, or rollout group"
];

export default function ConnectPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner public-hero-grid">
          <div>
            <p className="public-kicker">Connect with us</p>
            <h1>Bring Deckspert to your team.</h1>
            <p className="public-hero-copy">
              Paid access is configured for existing and trained client teams. We will scope the right model with you
              based on team size, user count, enabled modules, and rollout goals.
            </p>
          </div>
          <div className="public-hero-panel">
            <p className="public-panel-label">Paid platform</p>
            <p className="public-panel-copy">
              Evaluator, StoryLab, Coach, and Dynamic Delivery for teams applying TPG storytelling in live commercial
              work.
            </p>
          </div>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker">How access works</p>
            <h2>Configured for your team, not generic self-serve.</h2>
            <p className="public-intro">
              Most teams deploy Deckspert as part of a broader storytelling capability build. The right access model
              depends on how the platform will support your people and the work they need to improve.
            </p>
          </div>
          <ul className="public-access-list">
            {accessItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker">Paid platform modules</p>
          <h2>Access can be shaped around the capabilities your team needs.</h2>
          <p className="public-intro">
            Some teams start with evaluation and coaching. Others need the full platform across story development and
            delivery practice.
          </p>
          <div className="public-card-grid">
            {paidModules.map((module) => (
              <article className="public-module-card" key={module.name}>
                <p className="public-card-tag">{module.name}</p>
                <h3>{module.name}</h3>
                <p>{module.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-dark">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker">Who should connect</p>
            <h2>Best fit for teams building storytelling as a capability.</h2>
            <p className="public-intro">
              Deckspert is strongest when it reinforces a shared methodology across people who build important stories
              repeatedly.
            </p>
          </div>
          <ul className="public-dark-list">
            {fitSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-inner">
          <p className="public-kicker">Get started</p>
          <h2>Let's talk about the right access model.</h2>
          <p className="public-intro">
            Share a little about your team and the work you want Deckspert to support. This form is a front-end draft
            for now; submission wiring will come with the contact workflow.
          </p>
          <form className="public-form">
            <label>
              <span>Name</span>
              <input type="text" placeholder="Your name" />
            </label>
            <label>
              <span>Company</span>
              <input type="text" placeholder="Organization" />
            </label>
            <label>
              <span>Email</span>
              <input type="email" placeholder="Work email" />
            </label>
            <label>
              <span>Team size</span>
              <select defaultValue="">
                <option value="" disabled>
                  Select approximate user count
                </option>
                <option>Up to 100 users</option>
                <option>100-250 users</option>
                <option>250-500 users</option>
                <option>500+ users</option>
              </select>
            </label>
            <label className="public-form-wide">
              <span>Primary use case</span>
              <input type="text" placeholder="Post-training reinforcement, retailer pitch prep, L&D rollout..." />
            </label>
            <label className="public-form-wide">
              <span>Notes</span>
              <textarea placeholder="Anything useful about your team, timing, or goals" />
            </label>
            <button className="public-primary-button public-form-button" type="button">
              Connect with us
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
