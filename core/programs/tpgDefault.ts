import type { ProgramProfile } from "./types.js";

// The standard TPG Persuasive Storytelling program, and the fallback for any
// cohort code with no profile mapped to it.
//
// The criteria and calibration strings below are lifted VERBATIM from the
// prompts that were hardcoded in modules/evaluator/prepEvaluator.ts and
// storyboardEvaluator.ts. They are not a paraphrase and should not be
// "improved" here: this profile exists so that making prompts profile-driven
// changes nothing for the cohorts and paying customers already running on them.
// Rendering this profile must produce the same prompt text as before.

export const TPG_DEFAULT: ProgramProfile = {
  id: "tpg-default",
  label: "TPG Persuasive Storytelling",
  tools: ["prep", "storyboard", "deck", "presentation"],
  narrativeMode: "persuasive",

  prep: {
    scopeNote:
      'This is the PRE-WORK planning worksheet, not a storyboard or finished presentation. Evaluate ONLY the worksheet fields listed below. Do NOT look for or penalize the absence of storyboard or slide elements such as Situation, Root Cause, Big Idea, Opening Gambit, WIIFM, How It Works, Close, or Proof Points. Those come later in the method and are evaluated by a separate tool. If you mention them at all, mention them only as "what comes next," never as a gap in this worksheet.',
    sections: [
      { key: "audience", label: "Audience", scored: true,
        criteria: "Is the target audience or account clearly and specifically identified (who they are, what segment or business), not generic?" },
      { key: "behavioralStyle", label: "Behavioral Style & Position", scored: false,
        criteria: 'Is a behavioral style identified (Thinker, Director, Socializer, or Relater) and the position or role filled in? This is a checkbox selection, so judge it as PRESENT vs NOT PRESENT only, NOT on a 1-5 quality scale. Set "score" to null. Set "status" to "present" if a style is selected and a position is given, otherwise "missing". In the feedback, name the selected style and one sentence on what it implies for tailoring (Thinkers want logic and detail, Directors want bottom-line and options, Socializers want vision and energy, Relaters want trust and low risk).' },
      { key: "coreNeeds", label: "Core Needs", scored: true,
        criteria: "Are the core, department, or category needs specific and real (the functional things this audience must solve), not vague? Each need should connect to the Desired Outcome." },
      { key: "businessNeeds", label: "Business Needs", scored: true,
        criteria: "Are the audience's business needs (commercial pressures, growth, risk, cost) specific and relevant?" },
      { key: "personalNeeds", label: "Personal Needs", scored: true,
        criteria: "Are the decision-maker's personal needs identified (what they personally gain, fear, or are measured on), not just business needs restated?" },
      { key: "desiredOutcome", label: "Desired Outcome", scored: true,
        criteria: "Is there a clear, specific outcome, meaning what the attendee wants the audience to decide, approve, or do? Vague aspirations score low." },
      { key: "reasonsToSayYes", label: "Reasons to Say Yes", scored: true,
        criteria: "Are the reasons compelling and tied to the stated needs (each reason should map to a real need), not generic selling points?" },
      { key: "reasonsToSayNo", label: "Reasons to Say No", scored: true,
        criteria: "Are the real objections and reasons to say no surfaced honestly, so they can be pre-empted? Honest, specific objections score high; a blank or token list scores low." }
    ],
    overallReadCalibration: [
      '- "needs work": 3 or more fields score 1, OR Audience and Desired Outcome are both weak or absent',
      '- "mixed": some real strengths but 1 to 2 critical gaps',
      '- "strong": no field below 3, and Audience, the three Needs layers, and Desired Outcome are all specific and aligned'
    ].join("\n"),
    connections: [
      "Also consider alignment: the worksheet asks whether each need is addressed by the Desired Outcome. Reward prep where the needs, Desired Outcome, and Reasons to Say Yes clearly line up, and flag where they do not."
    ]
  },

  storyboard: {
    scopeNote:
      "They have moved past prep and drafted the narrative structure of their presentation. They want specific, actionable feedback before building full slides.",
    sections: [
      { key: "openingGambit", label: "Opening Gambit", scored: true,
        criteria: "emotional hook that creates tension, not data." },
      { key: "desiredOutcome", label: "Desired Outcome", scored: true,
        criteria: "explicit ask, stated early." },
      { key: "situationRootCause", label: "Situation / Root Cause", scored: true,
        criteria: "real complication plus named root cause, not just context." },
      { key: "bigIdea", label: "Big Idea", scored: true,
        criteria: "a belief the audience must accept; reframes the issue; not a tactic." },
      { key: "howItWorks", label: "How It Works", scored: true,
        criteria: "actions that clearly address the root cause." },
      { key: "wiifm", label: "WIIFM", scored: true,
        criteria: "addresses core, business, and personal needs; not a restatement of the plan." },
      { key: "close", label: "Close", scored: true,
        criteria: "restates the recommendation, reinforces WIIFM, makes an explicit ask." },
      { key: "actionsNextSteps", label: "Actions & Next Steps", scored: true,
        criteria: "owners, timing, commitments." }
    ],
    overallReadCalibration: [
      '- "needs work": 3 or more sections score 1, OR Big Idea, Desired Outcome, and Close are all absent',
      '- "mixed": real strengths with 1 to 2 critical gaps or flow problems',
      '- "strong": no section below 3, key sections (Opening Gambit, Desired Outcome, Big Idea, Close) score 4 or higher, and flow builds cleanly'
    ].join("\n"),
    connections: [
      "Does the sequence build tension, then reframe, then resolution, or does it sag?",
      "Is section discipline respected (roughly: Opening Gambit 1, Desired Outcome 1, Root Cause 1, Big Idea 1, How It Works 2 to 4, WIIFM and Close tight)? Flag bloat or missing beats.",
      "Does each beat earn its place, or are there detours that belong in an appendix?"
    ]
  }
};
