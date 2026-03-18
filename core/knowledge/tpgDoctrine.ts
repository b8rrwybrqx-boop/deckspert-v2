type DoctrineRule = {
  id: string;
  domain: "story_structure" | "audience" | "creation" | "compelling_content" | "delivery";
  title: string;
  rule: string;
  tags: string[];
};

type BehavioralStyleRule = {
  style: "Director" | "Thinker" | "Relater" | "Socializer";
  description: string;
  communication_rules: string[];
  what_they_need: string[];
};

type Explanation = {
  topic: string;
  guidance: string;
};

const doctrineRules: DoctrineRule[] = [
  {
    id: "story.desired_outcome.definition",
    domain: "story_structure",
    title: "Desired Outcome definition",
    rule: "The Desired Outcome is a clear statement of what you want the audience to agree to, approve, or say yes to.",
    tags: ["desired_outcome", "decision", "ask"]
  },
  {
    id: "story.root_cause.definition",
    domain: "story_structure",
    title: "Root Cause definition",
    rule: "The Root Cause explains why the situation exists and identifies the underlying barrier, tension, or driver that must be addressed.",
    tags: ["root_cause", "why", "tension"]
  },
  {
    id: "story.big_idea.definition",
    domain: "story_structure",
    title: "Big Idea definition",
    rule: "A Big Idea is the belief or strategic concept the audience must accept before they will support the plan.",
    tags: ["big_idea", "belief_shift"]
  },
  {
    id: "story.big_idea.bridge",
    domain: "story_structure",
    title: "Big Idea as bridge",
    rule: "The Big Idea is the bridge between the What and the Now What; it connects insight to action.",
    tags: ["big_idea", "bridge", "so_what"]
  },
  {
    id: "story.big_idea.not_tactic",
    domain: "story_structure",
    title: "Big Idea is not a tactic",
    rule: "A Big Idea is not the initiative, not the action list, not a KPI, and not an isolated observation.",
    tags: ["big_idea", "watchout"]
  },
  {
    id: "story.big_idea.actionable_belief",
    domain: "story_structure",
    title: "Actionable belief",
    rule: "A strong Big Idea is belief-based, declarative, and high-level enough to enable action without collapsing into tactics.",
    tags: ["big_idea", "belief", "actionable"]
  },
  {
    id: "story.big_idea.patterns",
    domain: "story_structure",
    title: "Big Idea phrasing patterns",
    rule: "Big Ideas often work well in patterns such as 'To achieve X, we must Y' or 'If we want X, then we need Y.'",
    tags: ["big_idea", "patterns", "language"]
  },
  {
    id: "story.how_it_works.definition",
    domain: "story_structure",
    title: "How It Works definition",
    rule: "How It Works is the high-level strategic plan that explains how the Big Idea and root cause will be addressed.",
    tags: ["how_it_works", "plan", "mechanism"]
  },
  {
    id: "story.wiifm.definition",
    domain: "story_structure",
    title: "WIIFM definition",
    rule: "WIIFM explains what the audience gains from agreeing to the recommendation, not what the presenting team gains.",
    tags: ["wiifm", "audience", "benefits"]
  },
  {
    id: "story.wiifm.business_value",
    domain: "story_structure",
    title: "WIIFM must translate value",
    rule: "Strong WIIFM expresses business, customer, financial, efficiency, growth, or risk-reduction value in audience terms.",
    tags: ["wiifm", "value", "business_impact"]
  },
  {
    id: "story.close.safe_yes",
    domain: "story_structure",
    title: "Make yes feel safe",
    rule: "The close should make agreement feel simple, important, and actionable by clearly linking the ask to the pain point, benefit, and next step.",
    tags: ["close", "yes", "decision"]
  },
  {
    id: "story.failure_pattern.all_data_no_story",
    domain: "story_structure",
    title: "Failure pattern: all data no story",
    rule: "If the material is mostly data with no Big Idea, WIIFM, or Close, the story becomes informative but unpersuasive.",
    tags: ["failure_pattern", "big_idea", "wiifm"]
  },
  {
    id: "story.failure_pattern.tactics_without_strategy",
    domain: "story_structure",
    title: "Failure pattern: tactics without strategy",
    rule: "When How It Works appears without a Big Idea, the audience sees activity but not belief or rationale.",
    tags: ["failure_pattern", "how_it_works", "big_idea"]
  },
  {
    id: "story.failure_pattern.missing_ask",
    domain: "story_structure",
    title: "Failure pattern: missing ask",
    rule: "If the Desired Outcome or Close is unclear, the audience does not know what decision is required.",
    tags: ["failure_pattern", "desired_outcome", "close"]
  },
  {
    id: "story.failure_pattern.no_wiifm",
    domain: "story_structure",
    title: "Failure pattern: no WIIFM",
    rule: "When value is not translated into audience benefit, the story may be logically correct but still fail to persuade.",
    tags: ["failure_pattern", "wiifm"]
  },
  {
    id: "audience.needs.layers",
    domain: "audience",
    title: "Three layers of audience needs",
    rule: "Audience needs should be considered at three levels: core needs, business needs, and personal needs.",
    tags: ["audience", "needs"]
  },
  {
    id: "audience.reasons_to_yes",
    domain: "audience",
    title: "Reasons to say yes",
    rule: "Strong stories make the decision feel low risk, high return, aligned to scorecard goals, easy to execute, logical, and personally valuable.",
    tags: ["audience", "buy_in", "wiifm"]
  },
  {
    id: "audience.reasons_to_no",
    domain: "audience",
    title: "Reasons to say no",
    rule: "Stories should anticipate barriers such as resource constraints, operational complexity, weak ROI, perceived risk, misalignment, or timeline concerns.",
    tags: ["audience", "objections"]
  },
  {
    id: "audience.director_style",
    domain: "audience",
    title: "Director style",
    rule: "Director audiences want concise recommendations, strong business impact, and a clear ask without wandering detail.",
    tags: ["audience", "director"]
  },
  {
    id: "audience.thinker_style",
    domain: "audience",
    title: "Thinker style",
    rule: "Thinker audiences want logic, structure, explanation, and evidence that builds credibility.",
    tags: ["audience", "thinker"]
  },
  {
    id: "audience.relater_style",
    domain: "audience",
    title: "Relater style",
    rule: "Relater audiences respond to empathy, stakeholder consideration, and confidence that the organization can execute.",
    tags: ["audience", "relater"]
  },
  {
    id: "audience.socializer_style",
    domain: "audience",
    title: "Socializer style",
    rule: "Socializer audiences respond to stories, memorable framing, vision, energy, and clear upside.",
    tags: ["audience", "socializer"]
  },
  {
    id: "content.takeaway_titles",
    domain: "compelling_content",
    title: "Takeaway headlines",
    rule: "Slide titles should communicate what the slide says, not merely what the slide is about.",
    tags: ["slides", "titles", "takeaway"]
  },
  {
    id: "content.one_message_per_slide",
    domain: "compelling_content",
    title: "One clear message per slide",
    rule: "Each slide should communicate one clear message that can be understood quickly.",
    tags: ["slides", "simplicity"]
  },
  {
    id: "content.data_without_point",
    domain: "compelling_content",
    title: "Data without a point",
    rule: "Data should support an explicit message; charts and tables without clear meaning weaken understanding.",
    tags: ["slides", "data", "clarity"]
  },
  {
    id: "content.make_memorable",
    domain: "compelling_content",
    title: "Make it memorable",
    rule: "Memorability improves when content uses surprise, novelty, strong comparisons, visuals, metaphor, and sensory language.",
    tags: ["slides", "memorability"]
  },
  {
    id: "delivery.pause_power",
    domain: "delivery",
    title: "Power of pause",
    rule: "Logical pauses, impact pauses, and think pauses help audiences process key ideas and increase authority.",
    tags: ["delivery", "pauses", "pacing"]
  },
  {
    id: "delivery.transitions_matter",
    domain: "delivery",
    title: "Transitions are essential",
    rule: "Even strong content makes little sense if transitions are not clearly delivered between ideas and slides.",
    tags: ["delivery", "transitions", "clarity"]
  },
  {
    id: "delivery.filler_words",
    domain: "delivery",
    title: "Filler words kill credibility",
    rule: "Filler words such as um, uh, and like reduce credibility and should be replaced with deliberate pauses.",
    tags: ["delivery", "filler_words", "credibility"]
  }
];

const behavioralStyles: BehavioralStyleRule[] = [
  {
    style: "Director",
    description: "Decision-oriented leaders focused on results and efficiency.",
    communication_rules: ["Lead with the recommendation", "Be concise", "Focus on outcomes and speed", "Avoid unnecessary detail"],
    what_they_need: ["confidence in the recommendation", "clear decision path", "evidence the idea will work"]
  },
  {
    style: "Thinker",
    description: "Analytical decision-makers who prioritize logic and proof.",
    communication_rules: ["Explain reasoning clearly", "Provide structured logic", "Support conclusions with evidence", "Avoid oversimplification"],
    what_they_need: ["data credibility", "logical structure", "clear explanation of cause and effect"]
  },
  {
    style: "Relater",
    description: "Relationship-focused leaders who value collaboration and alignment.",
    communication_rules: ["Highlight team impact", "Show practical feasibility", "Demonstrate alignment with stakeholders"],
    what_they_need: ["confidence that the organization can execute", "clear collaboration path", "low organizational friction"]
  },
  {
    style: "Socializer",
    description: "Vision-oriented leaders energized by ideas and possibilities.",
    communication_rules: ["Frame ideas with energy and vision", "Use memorable language", "Highlight opportunity and upside"],
    what_they_need: ["big-picture potential", "inspiration", "strategic upside"]
  }
];

const explanations: Explanation[] = [
  {
    topic: "What makes a great business story",
    guidance: "A great business story clearly explains what is happening, why it is happening, what we should believe, and what we should do."
  },
  {
    topic: "Why the Big Idea matters",
    guidance: "The Big Idea is the belief that connects insight to action. Without it, a presentation becomes a collection of facts rather than a persuasive narrative."
  },
  {
    topic: "Why Desired Outcome is critical",
    guidance: "Presentations should be designed around a decision. The Desired Outcome clarifies the commitment the audience is being asked to make."
  },
  {
    topic: "Why story structure matters",
    guidance: "Structure allows audiences to process complex ideas. A well-structured story guides listeners logically from context to insight to action."
  }
];

const keywordMap: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /\bbig idea\b|\bbelief\b|\breframe\b/i, tags: ["big_idea", "belief_shift", "bridge"] },
  { pattern: /\bwiifm\b|\bbenefit\b|\bvalue\b/i, tags: ["wiifm", "value", "buy_in"] },
  { pattern: /\bclose\b|\bask\b|\bdecision\b|\byes\b/i, tags: ["close", "ask", "decision", "desired_outcome"] },
  { pattern: /\bsituation\b|\bcontext\b/i, tags: ["situation"] },
  { pattern: /\broot cause\b|\bwhy\b|\bbarrier\b|\bfriction\b/i, tags: ["root_cause", "why", "tension"] },
  { pattern: /\bdirector\b|\bops\b|\bmerchant\b|\bmerchandising\b/i, tags: ["director", "audience"] },
  { pattern: /\bthinker\b|\banalytical\b|\bproof\b|\bevidence\b/i, tags: ["thinker", "audience"] },
  { pattern: /\brelater\b|\bstakeholder\b|\balignment\b/i, tags: ["relater", "audience"] },
  { pattern: /\bsocializer\b|\bvision\b|\bupside\b/i, tags: ["socializer", "audience"] },
  { pattern: /\bslide\b|\bheadline\b|\btitle\b/i, tags: ["slides", "titles", "takeaway"] },
  { pattern: /\bdelivery\b|\bpause\b|\bfiller\b|\btransition\b/i, tags: ["delivery", "pauses", "transitions", "filler_words"] }
];

function collectTags(input: string): string[] {
  const tags = new Set<string>();
  keywordMap.forEach(({ pattern, tags: mappedTags }) => {
    if (pattern.test(input)) {
      mappedTags.forEach((tag) => tags.add(tag));
    }
  });
  return [...tags];
}

export function getRelevantDoctrine(input: string, maxItems = 6) {
  const tags = collectTags(input);
  const ranked = doctrineRules
    .map((rule) => {
      const score = rule.tags.reduce((sum, tag) => sum + (tags.includes(tag) ? 2 : 0), 0);
      return { rule, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((entry) => entry.rule);

  if (ranked.length > 0) {
    return ranked;
  }

  return doctrineRules.slice(0, Math.min(maxItems, doctrineRules.length));
}

export function getBehavioralStyleGuidance(input: string) {
  const lowered = input.toLowerCase();
  const exactMatch =
    behavioralStyles.find((style) => lowered.includes(style.style.toLowerCase())) ??
    (/\bops\b|\bmerchant\b|\bmerchandising\b/.test(lowered)
      ? behavioralStyles.find((style) => style.style === "Director")
      : undefined);

  return exactMatch ?? null;
}

export function getExplanationHighlights(input: string, maxItems = 2) {
  const lowered = input.toLowerCase();
  const matching = explanations.filter((explanation) =>
    explanation.topic.toLowerCase().split(" ").some((word) => lowered.includes(word))
  );

  return (matching.length > 0 ? matching : explanations).slice(0, maxItems);
}

export function buildDoctrineContext(input: string) {
  const relevantRules = getRelevantDoctrine(input);
  const behaviorStyle = getBehavioralStyleGuidance(input);
  const explanationHighlights = getExplanationHighlights(input);

  return {
    relevantRules,
    behaviorStyle,
    explanationHighlights
  };
}
