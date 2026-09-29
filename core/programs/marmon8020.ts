import type { ProgramProfile } from "./types.js";

// Executive Presentation Skills, for Marmon's 80/20 Champions (October 2026).
//
// The section list, anchors and connections below come from Todd Bradley's
// final rubric (Deckspert-Storyboard-Rubric-EPS-FINAL.docx) and follow the EPS
// Planning Worksheet box for box. Where this profile differs from tpg-default,
// the worksheet is the reason:
//
//   - "Recommendation / Executive Takeaway" is a real box here. tpg-default has
//     no slot for it, which meant an attendee filling the worksheet as taught
//     was graded against a framework that did not include the one beat the
//     whole workshop is built around.
//   - "Desired Outcome" is a PREP field in this program, not a storyboard beat,
//     so it does not appear below.
//   - "Anticipated Questions & Pushback" is the bonus "What" from the deck's
//     audience section, and it is the natural input to the interruption drill.

export const MARMON_8020: ProgramProfile = {
  id: "marmon-8020",
  label: "Executive Presentation Skills · 80/20 Champions",
  tools: ["prep", "storyboard", "deck"],
  // Slide 72: "For you, the ask isn't approval, it's adoption."
  narrativeMode: "inform",
  recommendationTypes: ["Sustain", "Scale", "Replicate", "Avoid"],

  steps: {
    prep: { label: "1 \u00b7 Proper Prep", blurb: "Pressure-test your prep before you build anything." },
    storyboard: { label: "2 \u00b7 Storyboard", blurb: "Check your story against the EPS Planning Worksheet, box by box." },
    deck: { label: "3 \u00b7 Starter Deck", blurb: "Turn your storyboard into slides you can build on." }
  },

  prep: {
    scopeNote:
      'This is the PRE-WORK planning worksheet, not a storyboard or finished presentation. Evaluate ONLY the worksheet fields listed below. Do NOT look for or penalize the absence of storyboard elements such as Situation, Root Cause, Big Idea, Opening Gambit, WIIFM or Close. Those come later in the method and are evaluated by a separate tool. If you mention them at all, mention them only as "what comes next," never as a gap in this worksheet.',
    sections: [
      { key: "audience", label: "Audience", scored: true,
        criteria: "Is the audience clearly and specifically identified (who is in the room, what they own), not generic?" },
      { key: "behavioralStyle", label: "Behavioral Style & Position", scored: false,
        criteria: 'Is a behavioral style identified (Thinker, Director, Socializer, or Relater) and the position or role filled in? This is a checkbox selection, so judge it as PRESENT vs NOT PRESENT only, NOT on a 1-5 quality scale. Set "score" to null. Set "status" to "present" if a style is selected and a position is given, otherwise "missing". In the feedback, name the selected style and one sentence on what it implies for tailoring (Thinkers want logic and detail, Directors want bottom-line and options, Socializers want vision and energy, Relaters want trust and low risk).' },
      { key: "coreNeeds", label: "Core Needs", scored: true,
        criteria: "Are the functional needs this audience must solve specific and real, not vague?" },
      { key: "businessNeeds", label: "Business Needs", scored: true,
        criteria: "Are the audience's commercial pressures (growth, cost, risk, capacity) specific and relevant?" },
      { key: "personalNeeds", label: "Personal Needs", scored: true,
        criteria: "Are the decision-maker's personal needs identified (what they gain, fear, or are measured on), not business needs restated?" },
      { key: "desiredOutcome", label: "Desired Outcome", scored: true,
        criteria: "Is there a clear, specific outcome: what the attendee wants senior leaders to decide, adopt, or do? Vague aspirations score low." },
      { key: "reasonsToSayYes", label: "Reasons to Say Yes", scored: true,
        criteria: "Are the reasons compelling and tied to the stated needs, not generic selling points?" },
      { key: "reasonsToSayNo", label: "Reasons to Say No", scored: true,
        criteria: "Are the real objections surfaced honestly, so they can be pre-empted? Honest, specific objections score high; a blank or token list scores low." },
      { key: "anticipatedPushback", label: "Questions & Pushback", scored: true,
        criteria: "Has the attendee anticipated the hard questions this room will actually ask, in the room's own words? Generic worries score low. Specific, uncomfortable questions they would rather not be asked score high. This is the bonus \"What\": the questions and pushback they should be ready for." }
    ],
    overallReadCalibration: [
      '- "needs work": 3 or more fields score 1, OR Audience and Desired Outcome are both weak or absent',
      '- "mixed": some real strengths but 1 to 2 critical gaps',
      '- "strong": no field below 3, and Audience, the three Needs layers, and Desired Outcome are all specific and aligned'
    ].join("\n")
  },

  storyboard: {
    scopeNote:
      "They have completed an 80/20 project and are building the executive presentation that reports it. Evaluate the eight boxes of the EPS Planning Worksheet, in worksheet order, using the worksheet's own names.",
    sections: [
      { key: "openingGambit", label: "Opening Gambit", scored: true,
        criteria: "Two jobs, in this order: hook the room and grab attention, then share the key headline of why they are there. STRONG (5): both jobs done in two or three sentences; the hook starts in the audience's world with something specific, relevant and attention-getting (a question, fact, anecdote, quotation or analogy), and the headline follows immediately. WEAK (3): one job done and the other missing or weak, a hook with no headline or a headline buried under setup, or an opening too generic to create real attention. MISSING (1): no hook and no headline; opens with the agenda, credentials or background." },
      { key: "situationRootCause", label: "What is the Situation", scored: true,
        criteria: "Ground the audience in the data that defined the project: what the numbers were, what the root cause was, and why this was the most important problem to solve. STRONG (5): all three are there, including one real root cause (why it happened, not just what happened). WEAK (3): numbers without a root cause, or a \"root cause\" that restates a symptom (\"too many manual steps\" rather than why the steps exist), or a data dump with no interpretation. MISSING (1): background only, no numbers and no root cause." },
      { key: "bigIdea", label: "So What is the Big Idea", scored: true,
        criteria: "The single insight that drove the approach or was discovered along the way; what they had to believe that made the difference. A belief, not an action. STRONG (5): one clear, memorable insight that reframes or resolves the Situation and gives the audience a belief to carry forward, not a task list. WEAK (3): written as an initiative or action plan, so broad nobody could disagree, or several ideas competing for the box. MISSING (1): absent, or indistinguishable from the actions in Now What You Did." },
      { key: "howItWorks", label: "Now What You Did", scored: true,
        criteria: "The approach in concrete steps. Not everything they did, just what mattered most. STRONG (5): two to four sequenced steps that follow from the Big Idea and address the issue in the Situation; a future team could replicate the approach from this box alone. WEAK (3): steps present but exhaustive (every task performed) or vague (verbs with no object), with the link to Situation and Big Idea unclear. MISSING (1): an activity list with no structure, or absent." },
      { key: "wiifm", label: "WIIFM", scored: true,
        criteria: "The impact: what changed as a result of the project, leading with the financial metric. STRONG (5): leads with a hard financial number, then two or three supporting results (on-time delivery, capacity, simplification), stated specifically. WEAK (3): results are real but vague (\"improved efficiency\", \"strong ROI\"), there is no financial number, or it restates the activities instead of their impact. MISSING (1): absent, or no measurable change named." },
      { key: "recommendation", label: "Your Recommendation / Executive Takeaway", scored: true,
        criteria: "Based on what the team learned, what should the organization do next, and what should a future project team sustain, scale, replicate or avoid? STRONG (5): one clear, unhedged sentence; it is obvious which of sustain, scale, replicate or avoid is being made; it follows from the Big Idea, says where to apply it next where relevant, and matches the headline in the Opening Gambit. WEAK (3): a recommendation exists but the type is ambiguous, it hedges (\"we could consider...\"), or it does not match the Opening Gambit headline. MISSING (1): no recommendation; the story ends with results and gives leaders no direction." },
      { key: "close", label: "Summarize & Gain Commitment | Close", scored: true,
        criteria: "Come back to the Big Idea, restate what changed and why it matters, end strong. STRONG (5): reconnects explicitly to the Big Idea, restates what changed using the headline result where appropriate, says why it matters, and ends on a strong final line. In a Persuasive story it also names the tradeoff and asks for the decision. WEAK (3): summarizes accurately but re-presents the whole case, never reconnects to the Big Idea, or ends on a thank-you. MISSING (1): trails off, or absent." },
      { key: "actionsNextSteps", label: "Actions & Next Steps", scored: true,
        criteria: "What specific actions should the room leave with? Name them, own them, give them a timeline. STRONG (5): a short set of concrete next steps, each with an owner and a timeline, following from the recommendation rather than repeating Now What You Did. WEAK (3): actions listed but with no owners or dates, or restating work already completed. MISSING (1): absent, or a vague intention to continue." }
    ],
    overallReadCalibration: [
      '- "needs work": 3 or more boxes score 1, OR the Big Idea, the Recommendation and the Close are all absent',
      '- "mixed": real strengths with 1 to 2 critical gaps or broken connections',
      '- "strong": no box below 3, the Opening Gambit, Big Idea, Recommendation and Close all score 4 or higher, and the four connections hold'
    ].join("\n"),
    connections: [
      "Headline and takeaway: the Opening Gambit headline and the Recommendation point to the same conclusion or direction. If they do not, the story may have changed direction in the middle.",
      "Root cause and Big Idea: the Big Idea reframes or answers the root cause in the Situation. Use the bridge sentence as a diagnostic for the connection, not as a standalone scoring requirement.",
      "Close and Big Idea: the Close clearly reconnects to the Big Idea without introducing a new idea.",
      "Actions and recommendation: the Actions follow from the Recommendation; next steps, not a replay of Now What You Did.",
      "Discipline: keep the Opening Gambit, Situation and Big Idea to one essential beat each, use a concise set of steps in Now What You Did, and keep WIIFM and the Close tight. Detail that does not advance the executive story belongs in an appendix."
    ]
  },

  doctrineAddendum: `PROGRAM CONTEXT: 80/20 Champions reporting a completed improvement project to senior leaders. This is an INFORM story: the "yes" being sought is adoption of what the project proved, not approval of a new plan.

DIAGNOSTIC VOCABULARY. When something is weak, name which of these five failure modes it is, in these words:
- Too Much Detail: showing everything they know instead of what executives need.
- Buried Reco: the point of view is buried under context and data.
- Weak Decision Framing: the ask, tradeoffs and timing are not explicit.
- Crowded Slides: dense visuals make leaders work hard to find the message.
- Pressure Breaks Structure: one tough question pulls the presenter off message.

RECOMMENDATION TYPES: a recommendation here is one of Sustain, Scale, Replicate or Avoid. For this cohort it will almost always be Scale or Replicate. Name which one it is; if it is ambiguous, say so.

QUICK TESTS (COACHING ONLY, NEVER SCORING). Two diagnostics may be offered in feedback, but must NOT reduce a score on their own:
- The Swap Test, on the Opening Gambit: could this exact opening start someone else's presentation? If yes it may be too generic. Raise it as coaching; do not cap the score for it.
- The bridge sentence, on the Big Idea: "Because [root cause], we believe [Big Idea], so we [the steps]." If it does not read cleanly, examine the connection between those three boxes. Do NOT automatically downgrade an otherwise strong Big Idea.

WORKED CALIBRATION. The Trilogy example's Actions box reads: select the next segment for review; formalize the red rule / green rule framework; document the Trilogy playbook; share the case with the next cohort. Those are strong actions, but with no owners and no dates they score a 3, not a 5. A name and a date on each makes it a 5. Apply the same standard.`
};
