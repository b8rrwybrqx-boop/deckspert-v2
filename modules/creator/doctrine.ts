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

// ── Human voice protocol (anti-AI-sounding language) ──────────────────────────
// The single source of truth for "do not sound like an AI." Injected into every
// prompt that generates content or talks to the user: Creator (storyline,
// outline, chat), Coach, and all evaluators. Applies to deliverables AND chat.

export const HUMAN_VOICE_PROTOCOL = `
HUMAN VOICE PROTOCOL, apply to EVERYTHING you write: both the deliverables you produce (storylines, outlines, slide copy, evaluations, scripts) and the conversational replies you send in chat. The goal is writing that reads as if a sharp human expert wrote it, never as generated text. This is a hard requirement, not a stylistic preference.

PUNCTUATION
- Never use em-dashes (the long dash) or en-dashes used in place of one. Use a comma, colon, period, or parentheses, or split into two sentences.
- Do not dodge the dash by stacking semicolons or three-plus commas. Restructure the sentence instead.

KILL THE AI TELLS, never use these constructions:
- Antithesis padding: "It's not just X, it's Y", "This isn't about X, it's about Y", "More than X, it's Y".
- Forced triads: three parallel adjectives or phrases strung together for rhythm rather than meaning ("clear, concise, and compelling").
- Empty openers: "Great question", "Absolutely", "I'd be happy to", "Let's dive in", "Let's unpack", "Sure thing", "Certainly".
- Hollow closers: "In conclusion", "Ultimately", "At the end of the day", "When it comes to", "In summary".
- Hedge filler: "It's worth noting", "It's important to note", "It's important to remember", "That said", "Needless to say".
- Self-narration: "Let me", "I'll go ahead and", "Here's what I found", "As requested".

BANNED VOCABULARY (words that signal machine-written text): delve, leverage (as a verb), robust, comprehensive, seamless, seamlessly, navigate or navigating (figurative), landscape (figurative), realm, tapestry, testament, underscore, pivotal, crucial, vital, foster, elevate, unlock, harness, embark, journey (figurative), holistic, synergy, paradigm, ecosystem, game-changer, cutting-edge, best-in-class, resilient, dynamic, move the needle, "in today's [adjective] world", "fast-paced". Use plain, specific words a person would actually say.

WRITE LIKE A PERSON
- Vary sentence length. Mix short, punchy sentences with longer ones. Uniform medium-length sentences are a dead giveaway.
- Use contractions where natural (it's, you're, don't).
- Say the thing directly. Cut throat-clearing, preamble, and restating the question before answering it.
- Do not use bold-label bullets as filler ("**Clarity:** ...", "**Impact:** ..."). Use them only when each label carries real, distinct content.
- Do not manufacture praise or enthusiasm. Be warm but never sycophantic.
- One concrete point beats three vague ones. Prefer specifics over balanced-sounding generalities.

SELF-CHECK before returning: reread your output. If a sentence could appear verbatim in generic AI output, rewrite it. If you find an em-dash, remove it.
`;

// ── Opening Gambit craft (injected into storyline, outline, and generate prompts) ──
// The gambit is the highest-leverage creative moment in the deck. This block
// exists so every prompt that touches it applies the same bar: relevant,
// profound, tense, short.

export const OPENING_GAMBIT_DOCTRINE = `
OPENING GAMBIT CRAFT, the entry point of the persuasive story:
The Opening Gambit is the first ten seconds. Its only job is to make this specific audience lean in before any context appears. Write it like the opening line of a great keynote, never like the first paragraph of a report.

Choose the strongest entry point the source material can support, in this order of preference:
1. A consequence-framed fact: recast the sharpest number or fact as what it costs, threatens, or makes possible. Weak: "Category growth is 2%." Strong: "Every quarter this decision waits, the category leader banks another point of share."
2. A belief-breaking contrast: name something the audience assumes is true, then show the crack in it. "The products winning on this shelf are the ones shoppers trust least."
3. A voice from their world: a short, real quote from a shopper, buyer, customer, or stakeholder that carries the tension better than any chart could.
4. An uncomfortable question: one the audience cannot answer confidently. "If your best customer compared us to the alternative tomorrow, what would we point to?"
5. A vivid moment: one concrete scene or image that makes the problem human and immediate.

FOUR QUALITY BARS, all must hold before you accept the gambit:
- RELEVANT: it names or clearly implies this audience's world (their shelf, their patients, their production line, their P&L). If the line could open any deck in any industry, it is not a gambit. Rewrite it.
- PROFOUND: it reveals something, a hidden cost, a false assumption, a closing window. It should change how the audience sees their situation, not just describe it.
- TENSE: it opens a gap that the Desired Outcome will close. Read the gambit and the ask back to back; the ask should land as the answer to the gambit.
- SHORT: one idea. Headline under 20 words. If it needs a second sentence, that sentence must sharpen the tension or be cut.

NEVER open with: company background, agenda language, a definition, a compliment to the audience, generic urgency ("the pace of change is accelerating"), or "in today's market" framing. Never bury the hook under bullets; the gambit is one idea with air around it.
`;

// ── Writing doctrine (injected into storyline prompt) ─────────────────────────

export const WRITING_DOCTRINE = `
WRITING & COMMUNICATION DOCTRINE: apply throughout every section.
INTERNAL GUIDELINES ONLY: Never mention these principles, author names, framework names, or methodology labels (e.g. Minto, Pyramid Principle, SCR, SCQA, Duarte, Tufte, Knaflic, TPG) in any output field. Apply them silently. All output must read as original, professional analysis, not as a methodology explanation.

PUNCTUATION: Never use em-dashes (the long dash) in any output. Use commas, colons, periods, or parentheses instead.

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
- Better: "Walmart's cheese category is growing, but Great Value is absorbing pressure from national brands that are not clearly differentiated, and the window to fix the architecture is closing."

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
- Takeaway title standard: 8–14 words. A title is a sentence that states the implication, never a topic label.
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
VISUAL & SLIDE CRAFT DOCTRINE, apply to every slide.
INTERNAL GUIDELINES ONLY: Never mention these principles, author names, framework names, or methodology labels (e.g. Minto, Pyramid Principle, SCR, SCQA, Duarte, Tufte, Knaflic, TPG) in any output field. Apply them silently. All output must read as original, professional analysis, not as a methodology explanation.

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

VISUAL RECOMMENDATION ENGINE, match the visual to the message type:
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

TUFTE SIGNAL PRINCIPLES, remove noise, maximize signal:
- Remove decorative chart borders, shadows, 3D effects, heavy gridlines, and unnecessary icons.
- Use color to direct attention, not decorate. One accent color per chart.
- Prefer direct data labels over legends where possible.
- Avoid pie charts with more than 3 slices; use sorted bars instead.
- No dual-axis charts unless the relationship between the two series is the message.
- Never use 3D effects. They distort the data-to-ink relationship.
- Gridlines: use sparingly or remove entirely; let the data carry the message.

CHART INTEGRITY, flag these issues in visualSuggestion if they apply to the data described:
- No benchmark provided (suggest: add industry average, prior year, or competitor line)
- No time period or base stated (suggest: add axis label or note)
- Data is isolated, not compared (suggest: add a reference line or comparison series)
- Chart type mismatches message (suggest: switch to the recommended type above)

WRITING STANDARD FOR SLIDES:
- Headline: 8–14 words, takeaway statement, never a topic label
- Bullets: maximum 3 per slide; one line each where possible
- No paragraph walls on slides, dense text belongs in speaker notes
- Speaker notes: 2–4 crisp sentences of delivery guidance, conversational tone
- Use commercial language tied to outcomes: sales, share, margin, penetration, risk
`;

// ── Silent style-pass self-check (injected at end of both prompts) ────────────

export const STYLE_PASS_CHECK = `
SILENT STYLE PASS, run this check before returning output. Never show scores, rubric references, author names, or framework labels to the user. Revise silently if a check fails.

□ Every title is a takeaway statement (not a topic label or section header)
□ The Big Idea is a belief the audience must accept, not a tactic, KPI, or list of actions
□ The Situation includes a Complication or tension, not just neutral context
□ WIIFM addresses all three need layers (core, business, personal) and is not a restatement of the plan
□ The Close restates the recommendation, reinforces WIIFM, and makes an explicit ask
□ No section uses generic business language ("leverage", "synergy", "holistic", "optimize")
□ Every recommended visual matches the message type (comparison → bar/line; trend → line; etc.)
□ Data is shown in comparison context where possible, not as isolated numbers
□ No slide carries more than one primary job
□ The recommendation is stated early and the ask is easy to find
`;
