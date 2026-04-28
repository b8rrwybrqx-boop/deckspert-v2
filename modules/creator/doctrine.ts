/**
 * Creator Style & Substance Doctrine
 *
 * Draws from: TPG Story Architecture, Minto/Pyramid Principle,
 * Tufte data visualization, Nancy Duarte, Cole Nussbaumer Knaflic,
 * and McKinsey-style executive communication.
 *
 * Injected into storyline and outline prompts to raise output quality
 * from "structured story" to "client-ready argument."
 */

// ── Writing doctrine (injected into storyline prompt) ─────────────────────────

export const WRITING_DOCTRINE = `
WRITING & COMMUNICATION DOCTRINE — apply throughout every section:

LEAD WITH THE ANSWER (Minto/Pyramid Principle)
- State the conclusion first, then support it. Never make the audience wait for the point.
- Weak: "We reviewed household penetration, promotional performance, and brand interaction."
- Better: "Armstrong is creating more private-label risk than incremental category value."
- Structure every argument: Answer → 2–4 grouped supporting reasons → Evidence → Implication.
- If there are more than four supporting points, consolidate into themes.

CREATE TENSION BEFORE RESOLUTION (SCR/SCQA)
- Every story must have a Complication, not just a Situation. Smooth decks that explain but do not create urgency do not move audiences.
- Situation: What is true today?
- Complication: Why is that a problem or missed opportunity right now?
- Implication: What happens if the audience does nothing?
- Resolution: What must they believe and do?
- Weak: "Walmart has an opportunity to optimize assortment."
- Better: "Walmart's cheese category is growing, but Great Value is absorbing pressure from national brands that are not clearly differentiated — and the window to fix the architecture is closing."

DUARTE CONTRAST: WHAT IS VS. WHAT COULD BE
- Strong business stories show a gap between the current reality and the better future the recommendation creates.
- Use this contrast especially in Opening Gambit, Big Idea, WIIFM, and Close.
- Examples: today's shelf role vs. future shelf role, current shopper confusion vs. clearer shopper choice, current risk vs. protected value architecture.

BIG IDEA MUST BE A BELIEF, NOT A TACTIC
- The Big Idea is the single belief the audience must accept before they will support the plan.
- It reframes the issue. It does NOT describe the action.
- Weak: "Remove Armstrong and support Black Diamond."
- Better: "To grow the category without weakening Great Value, each national brand must play a distinct and incremental shopper role."
- Self-test before finalizing: Is this a belief? Does it reframe the issue? Would the audience need to agree with it before saying yes?

EXECUTIVE COMMUNICATION STANDARD
- Assume the audience gives each slide 10 seconds before deciding whether it matters.
- Start with the point. Reduce setup. Avoid process narration ("we looked at...", "this slide shows...").
- Remove generic business language: "leverage", "optimize", "synergy", "holistic approach".
- Use commercial nouns and verbs tied to real outcomes: sales, margin, penetration, traffic, conversion, share, risk, execution.
- Takeaway title standard: 8–14 words. A title is a sentence that states the implication — never a topic label.
  - Weak title: "Block Cheese Share Trends"
  - Better title: "Great Value is losing share where national brands promote most aggressively"

A NUMBER WITHOUT A COMPARISON IS NOT AN INSIGHT (Tufte)
- Every metric should answer: Compared to what? Is this good or bad? Is the trend accelerating or decelerating?
- Push data toward: current vs. prior period, brand A vs. brand B, promoted vs. non-promoted, high region vs. low region, option 1 vs. option 2.
- Benchmarks make implications obvious. Isolated numbers rarely change decisions.

PYRAMID DISCIPLINE
- Max 2–4 supporting points per section. Group more than 4 into themes.
- Each theme needs a clear label, not a generic header.
- Detail that does not move the argument belongs in an appendix, not on the main deck.
`;

// ── Visual doctrine (injected into outline prompt) ────────────────────────────

export const VISUAL_DOCTRINE = `
VISUAL & SLIDE CRAFT DOCTRINE — apply to every slide:

ONE SLIDE, ONE JOB (Cognitive Load Principle)
- Each slide has a single primary purpose: set context, prove tension, explain root cause, reframe the issue, show the plan, quantify value, or ask for action.
- If a slide has two jobs, make one dominant or split the slide.
- Test: What does this slide want the audience to KNOW? BELIEVE? DO? If there is more than one answer, the slide is overloaded.

ACTION TITLES OVER TOPIC LABELS (Knaflic)
- The title must state the implication, not describe the metric.
- The audience should understand the point before the presenter opens their mouth.
- Weak: "Share of Wallet by Brand"
- Better: "Armstrong overlaps with Great Value more than any other national brand"
- Place one short annotation directly on the visual to explain why the data matters, not just what it shows.

VISUAL RECOMMENDATION ENGINE — match the visual to the message type:
- Trend over time → Line chart (annotate the inflection point)
- Brand / retailer comparison → Horizontal bar chart, sorted by value
- Ranking → Sorted bar, largest to smallest
- Before / after → Two-column contrast layout
- Segment comparison → Small multiples (same scale, different panels)
- Shopper journey or process → Flow diagram
- Strategic model → 2×2, flywheel, or pillar model
- Financial upside → Waterfall or bridge chart
- Decision path → Staged roadmap
- Risk / trade-off → Heat map or trade-off matrix
- Single most important number → Large-type stat callout
- When uncertain → Default to the simplest chart that proves the point

TUFTE SIGNAL PRINCIPLES — remove noise, maximize signal:
- Remove decorative chart borders, shadows, 3D effects, heavy gridlines, and unnecessary icons.
- Use color to direct attention, not decorate. One accent color per chart.
- Prefer direct data labels over legends where possible.
- Avoid pie charts with more than 3 slices; use sorted bars instead.
- No dual-axis charts unless the relationship between the two series is the message.
- Never use 3D effects. They distort the data-to-ink relationship.
- Gridlines: use sparingly or remove entirely; let the data carry the message.

CHART INTEGRITY — flag these issues in visualSuggestion if they apply to the data described:
- No benchmark provided (suggest: add industry average, prior year, or competitor line)
- No time period or base stated (suggest: add axis label or note)
- Data is isolated, not compared (suggest: add a reference line or comparison series)
- Chart type mismatches message (suggest: switch to the recommended type above)

WRITING STANDARD FOR SLIDES:
- Headline: 8–14 words, takeaway statement, never a topic label
- Bullets: maximum 3 per slide; one line each where possible
- No paragraph walls on slides — dense text belongs in speaker notes
- Speaker notes: 2–4 crisp sentences of delivery guidance, conversational tone
- Use commercial language tied to outcomes: sales, share, margin, penetration, risk
`;

// ── Silent style-pass self-check (injected at end of both prompts) ────────────

export const STYLE_PASS_CHECK = `
SILENT STYLE PASS — run this check before returning output. Never show scores or rubric references to the user. Revise silently if a check fails.

□ Every title is a takeaway statement (not a topic label or section header)
□ The Big Idea is a belief the audience must accept — not a tactic, KPI, or list of actions
□ The Situation includes a Complication or tension — not just neutral context
□ WIIFM addresses all three need layers (core, business, personal) and is not a restatement of the plan
□ The Close restates the recommendation, reinforces WIIFM, and makes an explicit ask
□ No section uses generic business language ("leverage", "synergy", "holistic", "optimize")
□ Every recommended visual matches the message type (comparison → bar/line; trend → line; etc.)
□ Data is shown in comparison context where possible, not as isolated numbers
□ No slide carries more than one primary job
□ The recommendation is stated early and the ask is easy to find
`;
