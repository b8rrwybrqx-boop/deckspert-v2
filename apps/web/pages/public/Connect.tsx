import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const accessItems = [
  "Access is team-based and configured at the client level",
  "Pricing is based on user count and enabled modules",
  "Capabilities can be scoped to match rollout goals and use cases",
  "Typically deployed as part of a broader storytelling capability build",
  "We help determine the right setup based on team size, priority modules, and timeline"
];

const paidModules = [
  {
    name: "StoryLab",
    copy: "Evaluate a deck, fix a weak section, or build a story from scratch — full structured evaluation and development across every section."
  },
  {
    name: "Own the Room",
    copy: "Video-based delivery coaching with timestamped feedback and practical rehearsal guidance."
  },
  {
    name: "Ask the Expert",
    copy: "On-demand expert guidance on specific story questions, from Proper Prep to Story Arcs, for teams who need help in the moment."
  }
];

const fitSignals = [
  "You have completed or are planning TPG storytelling training",
  "Your teams prepare high-stakes sales, category, marketing, or leadership presentations",
  "You want a shared platform to reinforce the method after workshops",
  "You need access configured for a client team, business unit, or rollout group"
];

/**
 * Anchor for deep links that should land on the form rather than the top of the
 * page. The in-session results CTA points here, so an attendee who clicks
 * through mid-workshop sees the contact form immediately.
 */
const FORM_ANCHOR = "get-started";

export default function ConnectPage() {
  const { hash } = useLocation();

  // The section only exists once React has rendered, so the browser's own
  // fragment scroll fires too early on a cold load. Scrolling once is not enough
  // either: styles and fonts land after first paint and resize the page under
  // us, which leaves a single early scroll thousands of pixels off target. Hold
  // the form aligned for a beat while the layout settles, and yield immediately
  // if the visitor starts scrolling themselves.
  useEffect(() => {
    if (hash.replace("#", "") !== FORM_ANCHOR) return;

    const SETTLE_MS = 1200;
    const startedAt = Date.now();
    let frame = 0;

    const align = () => {
      const target = document.getElementById(FORM_ANCHOR);
      const offset = target?.getBoundingClientRect().top ?? 0;
      if (target && Math.abs(offset) > 4) target.scrollIntoView({ block: "start" });
      if (Date.now() - startedAt < SETTLE_MS) frame = requestAnimationFrame(align);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    frame = requestAnimationFrame(align);
    const handOff: Array<keyof WindowEventMap> = ["wheel", "touchstart", "keydown", "pointerdown"];
    handOff.forEach((event) => window.addEventListener(event, stop, { passive: true, once: true }));

    return () => {
      stop();
      handOff.forEach((event) => window.removeEventListener(event, stop));
    };
  }, [hash]);

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
              StoryLab, Own the Room, and Ask the Expert for teams applying TPG storytelling in live commercial
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

      <section className="public-section" id={FORM_ANCHOR}>
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
                {/* Mirrors the pricing tiers on the investment slide, so the
                    band an attendee picks maps to a quoted price. */}
                <option>Up to 50 users</option>
                <option>Up to 100 users</option>
                <option>Up to 200 users</option>
                <option>400+ users</option>
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
