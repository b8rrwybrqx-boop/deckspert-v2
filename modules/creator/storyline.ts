import { callAnthropicLLM } from "../../core/llm/anthropic.js";
import {
  creatorStorylineResponseSchema,
  type CreatorStorylineResponse,
  type StorylineSection
} from "../../core/schemas/story.js";
import type { ExtractedInputs } from "../../core/schemas/story.js";

const STORYLINE_KEYS = [
  "openingGambit",
  "desiredOutcome",
  "situation",
  "bigIdea",
  "howItWorks",
  "wiifm",
  "close"
] as const;

const STORYLINE_LABELS: Record<string, string> = {
  openingGambit: "Opening Gambit",
  desiredOutcome: "Desired Outcome",
  situation: "Summary of the Situation",
  bigIdea: "Big Idea (So What)",
  howItWorks: "How This Works (Now What)",
  wiifm: "WIIFM",
  close: "Make the Ask / Close"
};

function styleTone(style: string): string {
  switch (style) {
    case "thinker":
      return "logical, structured, evidence-based. Include clear rationales and cause-effect reasoning. Avoid vague assertions.";
    case "director":
      return "concise, results-first, no waffle. Lead with the bottom line. Make Desired Outcome and Close especially sharp.";
    case "relater":
      return "empathetic, collaborative, low-risk framing. Emphasise ease of execution and shared goals. Avoid cold or overly technical tone.";
    case "socializer":
      return "energetic, inspirational, metaphor-driven. Use stories and big-picture framing. Ensure narrative has momentum and emotional pull.";
    default:
      return "clear, professional, and audience-centered.";
  }
}

function buildStorylinePrompt(inputs: ExtractedInputs): string {
  const style = inputs.audience.behavioralStyle;

  return `You are Deckspert Creator, a TPG storytelling specialist. Build a complete 7-section persuasive storyline from the confirmed Proper Prep inputs below.

CONFIRMED PROPER PREP:
Audience: ${inputs.audience.roleLevel ?? "Not specified"}
Behavioral Style: ${style} — apply this tone throughout: ${styleTone(style)}
Core Needs: ${inputs.needs.core.join("; ") || "Not specified"}
Business Needs: ${inputs.needs.business.join("; ") || "Not specified"}
Personal Needs: ${inputs.needs.personal.join("; ") || "Not specified"}
Desired Outcome: ${inputs.desiredOutcome ?? "Not specified"}
Reasons to Say YES: ${inputs.reasonsYes.join("; ") || "Not specified"}
Objections / Reasons to Say NO: ${inputs.reasonsNo.join("; ") || "Not specified"}
Situation context: ${inputs.situation ?? "Not specified"}
Root Cause: ${inputs.rootCause ?? "Not specified"}
${inputs.draftBigIdea ? `Draft Big Idea (for reference only): ${inputs.draftBigIdea}` : ""}

SEVEN-SECTION REQUIREMENTS — follow exactly:

1. openingGambit — OPENING GAMBIT
Emotional or conceptual hook that creates urgency BEFORE any data appears. Must answer "why pay attention right now?" for this specific audience. Must be provocative and tailored — not a generic industry observation. No heavy data. The tension it introduces must be answered by the Desired Outcome. One idea only.

2. desiredOutcome — DESIRED OUTCOME
One clear unambiguous statement of what the presenter needs the audience to say YES to. Must be a DECISION, not a list of goals or KPIs. Frame as a benefit to the audience, not a need of the presenter.

3. situation — SUMMARY OF THE SITUATION
Facts, context, and root cause grounded in the audience's world. Must explain WHAT is happening AND WHY. Root cause must be explicit or strongly implied. This is the KNOW layer.

4. bigIdea — BIG IDEA (SO WHAT)
The single standalone declarative belief the audience must hold before they will support the plan. One sentence. NOT a list of actions, KPIs, or data observations. Bridges Situation into plan. This is the BELIEVE layer.

5. howItWorks — HOW THIS WORKS (NOW WHAT)
2–4 strategic pillars or steps that directly address the root cause. Keep strategic, not executional. Must actively address or preempt these objections: ${inputs.reasonsNo.join(", ") || "none specified"}. This is the DO layer.

6. wiifm — WIIFM
Translate the plan into audience value across ALL THREE need layers — do not collapse into one generic statement:
- Core Needs (${inputs.needs.core.join(", ") || "not specified"})
- Business Needs (${inputs.needs.business.join(", ") || "not specified"})
- Personal Needs (${inputs.needs.personal.join(", ") || "not specified"})
Must answer "what does this mean for ME specifically?" — never restate the plan.

7. close — MAKE THE ASK / CLOSE
Confident, persuasive restatement of the Desired Outcome with WIIFM reinforcement. Drives momentum toward a clear decision. Not a data summary or generic thank-you. Reinforce what is at stake and why NOW is the right moment.

CONTENT STANDARDS (apply to every section):
- One idea per section only
- takeawayHeadline must be a TAKEAWAY STATEMENT, never a topic label (no "Market Trends", "Our Plan", "Introduction")
- narrative: 3–5 concise sentences that explain WHY this matters, not just what it is
- visualMetaphor: one specific visual or metaphor suggestion tied to the section's story function
- wiifm: translate this section's value into audience benefit (1–2 sentences)
- behavioralNote: 1 sentence explaining how the tone choice reflects ${style} style
- No jargon, no filler, no presenter-centric language ("we need", "our goal is")

PERSUASION ARC: Know (situation) → Believe (bigIdea) → Do (howItWorks + close). Each section must create conditions for the next. If Big Idea does not logically follow from Situation, revise. If How It Works does not follow from Big Idea, revise.

SILENT QUALITY CHECK (never show to user): Before returning, verify each section meets its standard. Revise once if needed.
- Opening Gambit: specific, creates genuine tension, not generic
- Desired Outcome: one clear decision, audience-relevant
- Situation: grounded in audience's world, root cause present
- Big Idea: standalone declarative belief, not blended with actions
- How This Works: strategic, addresses root cause, preempts objections
- WIIFM: covers all three need layers, not a restatement of the plan
- Close: confident ask, reinforces Desired Outcome and WIIFM, drives momentum

Return ONLY this JSON — no markdown, no code fences, no extra keys:
{
  "creatorVersion": "v2",
  "storyline": [
    {
      "key": "openingGambit",
      "label": "Opening Gambit",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    },
    {
      "key": "desiredOutcome",
      "label": "Desired Outcome",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    },
    {
      "key": "situation",
      "label": "Summary of the Situation",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    },
    {
      "key": "bigIdea",
      "label": "Big Idea (So What)",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    },
    {
      "key": "howItWorks",
      "label": "How This Works (Now What)",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    },
    {
      "key": "wiifm",
      "label": "WIIFM",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    },
    {
      "key": "close",
      "label": "Make the Ask / Close",
      "takeawayHeadline": "...",
      "narrative": "...",
      "visualMetaphor": "...",
      "wiifm": "...",
      "behavioralNote": "..."
    }
  ]
}`;
}

function fallbackStoryline(inputs: ExtractedInputs): CreatorStorylineResponse {
  const audience = inputs.audience.roleLevel ?? "the audience";
  const outcome = inputs.desiredOutcome ?? "Approve our recommended approach";

  const sections: StorylineSection[] = STORYLINE_KEYS.map((key) => ({
    key,
    label: STORYLINE_LABELS[key],
    takeawayHeadline: key === "desiredOutcome" ? outcome : `[${STORYLINE_LABELS[key]} headline — needs generation]`,
    narrative: `[${STORYLINE_LABELS[key]} narrative for ${audience} — will be generated when API is available]`,
    visualMetaphor: "[Visual suggestion — pending generation]",
    wiifm: "[Audience benefit — pending generation]",
    behavioralNote: `[Behavioral note for ${inputs.audience.behavioralStyle} style]`
  }));

  return { creatorVersion: "v2", storyline: sections };
}

export async function runCreatorStoryline(inputs: ExtractedInputs): Promise<CreatorStorylineResponse> {
  const prompt = buildStorylinePrompt(inputs);

  return callAnthropicLLM(prompt, {
    schema: creatorStorylineResponseSchema,
    system: "You are Deckspert Creator, a TPG persuasive storytelling specialist. Return only valid JSON — no markdown, no code fences.",
    maxTokens: 8192,
    fallback: () => fallbackStoryline(inputs)
  });
}
