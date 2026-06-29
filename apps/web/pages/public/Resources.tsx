import { Link } from "react-router-dom";

const featuredResources = [
  {
    type: "Tool",
    title: "Free Evaluator",
    copy:
      "Upload a presentation and get a quick read on story sections, overall section feedback, and deck-level insights.",
    action: "Open tool",
    href: "/free-evaluator",
    internal: true
  },
  {
    type: "Checklist",
    title: "Free Compelling Content Checklist",
    copy: "Download TPG's checklist for improving the clarity, simplicity, and persuasiveness of presentation content.",
    action: "Get checklist",
    href: "https://www.thepartneringgroup.com/download-from-persuasive-storytelling-page/"
  },
  {
    type: "Overview",
    title: "TPG Persuasive Storytelling",
    copy: "Learn more about TPG's approach to helping teams get more yeses, more often.",
    action: "View resource",
    href: "https://tpgpersuasivestorytelling.com/"
  }
];

function ResourceLink({
  resource
}: {
  resource: {
    type?: string;
    title: string;
    copy: string;
    action: string;
    href?: string;
    internal?: boolean;
  };
}) {
  const content = (
    <>
      {resource.type ? <span className="resource-directory-type">{resource.type}</span> : null}
      <strong>{resource.title}</strong>
      <p>{resource.copy}</p>
      <span className="resource-directory-action">{resource.action}</span>
    </>
  );

  if (!resource.href) {
    return <div className="resource-directory-item resource-directory-item-disabled">{content}</div>;
  }

  if (resource.internal) {
    return (
      <Link className="resource-directory-item" to={resource.href}>
        {content}
      </Link>
    );
  }

  return (
    <a className="resource-directory-item" href={resource.href} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
}

export default function ResourcesPage() {
  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <div className="public-section-inner">
          <p className="public-kicker">Resources</p>
          <h1>Free tools and resources.</h1>
          <p className="public-hero-copy">
            Start with the free Evaluator, then use TPG resources to sharpen your next story.
          </p>
        </div>
      </section>

      <section className="public-section public-section-light">
        <div className="public-section-inner resource-directory">
          <div>
            <p className="public-kicker">Start here</p>
            <h2>Featured resources</h2>
          </div>
          <div className="resource-directory-list">
            {featuredResources.map((resource) => (
              <ResourceLink key={resource.title} resource={resource} />
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-dark">
        <div className="public-section-inner public-split-section">
          <div>
            <p className="public-kicker">Full access</p>
            <h2>For even more robust insight on your story, unlock full access.</h2>
          </div>
          <div className="public-text-stack public-text-stack-dark">
            <p>
              Full access adds StoryLab, Own the Room, and Ask the Expert — the complete platform for trained client
              teams.
            </p>
            <Link className="public-primary-button" to="/connect">
              Connect with us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
