import type { ProgramProfile } from "./types.js";

// Executive Presentation Skills, for Marmon's 80/20 Champions (October 2026).
//
// The section lists, anchors and connections below come from Todd Bradley's
// two final rubrics, and follow the EPS worksheets box for box:
//
//   - Storyboard: docs/storyboard-rubric-exec-storytelling.md (revised
//     2026-09-30, superseding Deckspert-Storyboard-Rubric-EPS-FINAL.docx), on
//     the EPS Planning Worksheet (eight boxes).
//   - Proper Prep: docs/prep-rubric-exec-storytelling.md, on the abbreviated
//     "Planning Worksheet | Proper Preparation – 80/20 Project" (deck slide
//     30), with the filled Trilogy example (slide 32) as the benchmark.
//
// Where this profile differs from tpg-default, the worksheet is the reason:
//
//   - The 80/20 prep sheet has no Core Needs, Desired Outcome or Reasons to
//     Say Yes/No. Its bottom row is the Recommendation, WIIFM and Questions, so
//     those are what prep scores here. Todd scores Recommendation and WIIFM in
//     both tools on purpose: prep judges the direction and the number, the
//     storyboard judges how they land in the story.
//   - "Recommendation / Executive Takeaway" is a storyboard box too. tpg-default
//     has no slot for it, which meant an attendee filling the worksheet as
//     taught was graded against a framework missing the one beat the whole
//     workshop is built around.
//   - Recommendation types are all six as taught (sustain, scale, replicate,
//     adjust, avoid, monitor), in both tools, even though the worksheet prompt
//     lists four.

export const MARMON_8020: ProgramProfile = {
  id: "marmon-8020",
  label: "Executive Presentation Skills · 80/20 Champions",
  tools: ["prep", "storyboard", "deck"],
  // Slide 72: "For you, the ask isn't approval, it's adoption."
  narrativeMode: "inform",
  recommendationTypes: ["Sustain", "Scale", "Replicate", "Adjust", "Avoid", "Monitor"],

  steps: {
    prep: { label: "1 \u00b7 Proper Prep", blurb: "Pressure-test your prep before you build anything.",
      placeholder: "Paste your Proper Preparation worksheet, box by box: audience and title/role, behavioral style, business needs and personal needs (with Y/N), your recommendation / executive takeaway, why it matters / WIIFM, and the questions or pushback you may face." },
    storyboard: { label: "2 \u00b7 Storyboard", blurb: "Check your story against the EPS Planning Worksheet, box by box.",
      placeholder: "Paste your storyboard, box by box: Opening Gambit, What is the Situation & Root Cause Why, So What is the Big Idea, Now What You Did, WIIFM, Your Recommendation / Executive Takeaway, Summarize & Gain Commitment, Actions & Next Steps." },
    deck: { label: "3 \u00b7 Starter Deck", blurb: "Turn your storyboard into slides you can build on." }
  },

  prep: {
    scopeNote:
      'This is the abbreviated Proper Preparation worksheet for an 80/20 project (Planning Worksheet | Proper Preparation, 80/20 Project): the PRE-WORK, not a storyboard or finished presentation. Evaluate ONLY its seven boxes, listed below, using the worksheet\'s own names. This worksheet has no Core Needs, Desired Outcome or Reasons to Say Yes/No boxes: never look for them or mark them absent. Do NOT look for or penalize the absence of storyboard elements such as the Opening Gambit, Situation, Root Cause, Big Idea, Now What You Did, Close or Actions. Those come later in the method and are evaluated by a separate tool; mention them only as "what comes next." Prep is where the audience, the recommendation and the pushback are decided; the storyboard is where they become a story.\n\nBREVITY IS NOT WEAKNESS: the worksheet is short phrases in table cells. Judge specificity, not length.\n\nCALIBRATION STANDARD: the Trilogy example worksheet (Audience "Project Sponsor" / "Key Decision Maker, Most Influence", Director; four business needs and two personal needs, all marked Y; the complexity-audit Recommendation; the "$200K" WIIFM; four questions) is the known-good worksheet. Run through this evaluation it must read "strong", with every scored box at 4 or 5. Hold other worksheets to that bar, no higher.\n\nTHE Y/N COLUMN ("Addressed by Desired Outcome?") is coaching only, never a deduction on its own. A need marked N prompts "address it or drop it." A need marked Y with nothing in the Recommendation or WIIFM behind it is flagged under the connections.',
    sections: [
      { key: "audience", label: "Audience/Who & Title/Role", scored: false,
        criteria: 'Say who the audience is and their title or role. Checked, NOT scored: judge it as PRESENT vs NOT PRESENT only. Set "score" to null. Set "status" to "present" if EITHER line is filled in (attendees often write names, group and role together on one line, e.g. "RF and Marmon Water Executive Leadership (Ankur, Leon, ...)"; that is complete). Only "missing" if both are blank. Never call this box incomplete because one of the two lines is empty, and do not mark it down for being brief or generic. If the role is not obvious, you may suggest naming who holds final authority as a tip, not a gap. Benchmark: "Project Sponsor" / "Key Decision Maker, Most Influence" is present.' },
      { key: "behavioralStyle", label: "Behavioral Style", scored: false,
        criteria: 'Tick one of Thinker, Director, Socializer or Relater. Checked, NOT scored: judge it as PRESENT vs NOT PRESENT only. Set "score" to null. Set "status" to "present" if at least one style is ticked; "missing" only if none is. Ticking two is fine and still present: never tell them to pick one. Thinker and Director are close enough for this training to be treated as one blend (evidence-backed, bottom line first); for other pairs, coach to the style of whoever holds final authority. In the feedback, name the style (or styles) and its move, from the Know Their Style slide: Director ("Show me the bottom line"): lead with the answer, be brief, skip the backstory. Thinker ("Show me the evidence"): lead with data, anticipate questions, be rigorous. Socializer ("Show me the vision"): lead with the story, connect to what excites them. Relater ("Show concern for me and my team"): lead with the impact on people, acknowledge the team.' },
      { key: "businessNeeds", label: "Business Needs (Help Me Win)", scored: true,
        criteria: 'The specific business needs this audience has, tied to their strategic priorities, not the project\'s, each marked Y or N for whether it is addressed. STRONG (5): two to four needs, each specific to this audience and connected to their strategic priorities (the return, the risk, the result they are accountable for); each is marked Y, and the Y is believable because the Recommendation and WIIFM actually address it. WEAK (3): needs are real but generic ("grow the business", "cut costs"), or they are the presenter\'s needs rather than the audience\'s (sign-off, resources), or the Y/N column is blank or marked Y where nothing below addresses it. MISSING (1): absent. Benchmark (5): proof the 80/20 investment is generating real ROI; a repeatable approach, not a one-off win; freed capacity to serve and grow the 80 customers; operational efficiency (OTD, overhead, margin), all Y.' },
      { key: "personalNeeds", label: "Personal Needs (Know Me)", scored: true,
        criteria: 'What the decision-maker needs personally, each marked Y or N. STRONG (5): one or two needs personal to this executive: what they are measured on, what they have staked their name on, what they want to be true; marked Y and believably addressed. WEAK (3): business needs restated in personal language ("they want the company to grow"), a generic trait ("wants results"), the Y/N column blank, or needs copied from the Know Me list ("Don\'t waste my time", "No surprises") that are true of every executive and say nothing about this one: score those as generic. MISSING (1): absent. Benchmark (5): validation that sponsoring this program was the right call; confidence the Champions are developing into stronger leaders. The mirror problem: if swapping "they" for "the company" still reads, it is a business need. Coaching only, never a scoring cap: what would they be praised or blamed for? What would make this person look smart to their boss?' },
      { key: "recommendation", label: "YOUR Recommendation / Executive Takeaway", scored: true,
        criteria: 'Based on what the team learned, what should the organization do next? The single conclusion senior leaders should leave with, and which of the six recommendation types it is: sustain, scale, replicate, adjust, avoid or monitor. STRONG (5): one or two unhedged sentences; it is obvious which of the six types it is; it says where to apply it next; it answers the needs marked Y above. WEAK (3): a recommendation exists but the type is unclear, it hedges ("we could consider..."), it offers a menu of options instead of one direction, or it summarizes results rather than giving a direction. MISSING (1): absent, or the box describes what the team did. Name the type in the feedback. Scale and Replicate sit close together: require the attendee to name one, and never mark them down for choosing its neighbor. Benchmark (5): "Apply the same complexity audit to the next customer or product segment before it reaches the same breaking point. The framework is proven and ready to scale." That is Scale. This becomes the storyboard\'s Opening Gambit headline and Recommendation box, and the two should say the same thing.' },
      { key: "wiifm", label: "WHY IT MATTERS / WIIFM", scored: true,
        criteria: 'How the organization benefits: the result, leading with the number, and why it matters beyond this one project. STRONG (5): leads with a hard result (ideally financial), then says why it matters beyond this one project; specific, and in terms this audience cares about. WEAK (3): the benefit is real but vague ("improved efficiency", "strong ROI"), there is no number, or it restates the activities instead of their impact. MISSING (1): absent, or no benefit named. Benchmark (5): "One project. $200K. If the same lens is applied across other relationships with similar complexity profiles, the cumulative impact is significant, and the next team doesn\'t have to start from scratch." Coaching, not a requirement for a 5: stronger still if it also says what it costs not to act, which becomes the tradeoff in the storyboard\'s Close.' },
      { key: "anticipatedPushback", label: "QUESTIONS or Pushback You May Face", scored: true, optionalInPrework: true,
        criteria: 'NOT PART OF THE PRE-WORK: attendees fill this box in during the session. If it is blank, set "score" to null and "status" to "notYet", and give one sentence on what to bring to the session (two or three questions this room will ask). A blank box is never a gap: do not count it toward overallRead, do not put it in topFixes, and do not cite it as evidence in any other box\'s feedback. If it IS filled in, score it as follows. The hard questions this room will actually ask, in the room\'s own words. STRONG (5): three or more specific questions, worded the way this executive would ask them, including at least one the presenter would rather not be asked. WEAK (3): generic worries ("they may ask about cost") or topics ("ROI") rather than questions, or only easy questions the presenter is comfortable answering. MISSING (1): absent. Benchmark (5): "Are these savings real and sustainable, or will Motorola push back?" "What\'s the risk of damaging the relationship?" "How do we identify which segment to go after next?" "Is the timeline realistic for other teams?" The first two are the uncomfortable ones. This is where Pressure Breaks Structure is prevented.' }
    ],
    overallReadCalibration: [
      '- "needs work": 3 or more scored boxes score 1, OR the Recommendation is missing',
      '- "mixed": some real strengths, but 1 to 2 critical gaps or broken connections',
      '- "strong": no scored box below 3, the Recommendation and WIIFM both score 4 or higher, and needs marked Y are actually addressed',
      "A blank Questions box (status \"notYet\") counts toward none of these."
    ].join("\n"),
    connections: [
      'Needs and answer: every need marked Y is addressed by the Recommendation or the WIIFM. Flag a Y with nothing behind it. (The worksheet column says "Addressed by Desired Outcome"; on this sheet the Recommendation is the desired outcome.)',
      "Recommendation and WIIFM: the WIIFM is the benefit of doing what the Recommendation says, not a separate list of results.",
      "Recommendation and pushback: the questions include the ones the Recommendation will provoke, not only questions about the past project.",
      "Style and approach: the ticked style shows up in the answer. A Director gets a bottom-line Recommendation with no backstory. A Thinker gets evidence in the WIIFM and the most thorough Questions or Pushback box, because anticipating questions is the Thinker move. A Socializer gets the story and the bigger picture. A Relater gets the impact on people and the team. (If the Questions box is blank, it was not pre-work: leave it out of this check.)",
      "These connections are reported, never scored."
    ]
  },

  storyboard: {
    scopeNote:
      "They have completed an 80/20 project and are building the executive presentation that reports it. Evaluate the eight boxes of the EPS Planning Worksheet, in worksheet order, using the worksheet's own names. Each box's criteria test what the worksheet prompt asks for, plus what EPS teaches for that box. Proper Prep decided the audience, the recommendation and the pushback; the storyboard turns them into a story.\n\nCALIBRATION: the Trilogy example storyboard is the benchmark. As written it scores 5 on most boxes but deliberately scores 3 on the Close (no tradeoff) and 3 on Actions & Next Steps (no owners or dates). Adding the tradeoff line and a name and date on each action makes both a 5. Apply the same standard to every storyboard.",
    sections: [
      { key: "openingGambit", label: "Opening Gambit", scored: true,
        criteria: "Two jobs, in this order: hook the room and grab attention, then share the key headline of why they are there (Inform: the single conclusion you want them to leave with; Persuasive: what you are asking them to say yes to). STRONG (5): both jobs done in two or three sentences; the hook starts in the audience's world with something true and surprising (a question, fact, anecdote, quotation or analogy); the headline follows immediately; it passes the Swap Test. WEAK (3): one job done and the other missing or weak (a hook with no headline, or a headline buried under setup), or it would work just as well for someone else's project. MISSING (1): no hook and no headline; opens with the agenda, credentials or background. THE SWAP TEST IS A SCORING RULE: if this exact opening could start someone else's presentation, it is generic and scores no higher than 3. Benchmark (5): \"You would expect your best customer to be one of your easiest customers to serve. Motorola represented 18% of Trilogy's revenue, but 70% of its transactions.\" Then the headline: \"Motorola was not the problem. Unmanaged complexity was.\"" },
      { key: "situationRootCause", label: "What is the Situation & Root Cause Why", scored: true,
        criteria: "Ground the audience in the data that defined the project: what the numbers were, what the root cause was, and why this was the most important problem to solve. STRONG (5): all three are there: the numbers that defined the problem, one real root cause (why it happened, not just what happened), and why this problem mattered more than others. WEAK (3): numbers without a root cause, or a \"root cause\" that restates a symptom (\"too many manual steps\" rather than why the steps exist), or a data dump with no interpretation. MISSING (1): background only, no numbers and no root cause. Benchmark (5): \"Exceptions had become the service model. Each special request became precedent for the next. With no guardrails, complexity compounded quietly until it was the ceiling on our growth.\"" },
      { key: "bigIdea", label: "So What is the Big Idea", scored: true,
        criteria: "The single insight that drove the approach or was discovered along the way; what they had to believe that made the difference. A belief, not an action, and the mirror of the root cause. What the room should remember when they walk out. STRONG (5): a memorable line, phrased as a belief, that visibly flips the root cause in the Situation, often followed by one sentence on what it means for the business, and the bridge sentence reads cleanly. WEAK (3): written as an initiative or action plan (if it starts with a verb you could drop into a project plan, it belongs in Now What You Did), so broad nobody could disagree, or several ideas competing for the box. MISSING (1): absent, or indistinguishable from the actions in Now What You Did. THE BRIDGE SENTENCE: \"Because [root cause], we believe [Big Idea], so we [the steps].\" If it does not read cleanly, one of the three boxes is weak: name which one, and score that box accordingly. Benchmark (5): \"Complexity is a tax on growth. To serve Motorola better and create capacity for new business, Trilogy has to stop absorbing exceptions and start eliminating them.\" The first line flips the root cause and is the one the room remembers; the second bridges into the actions." },
      { key: "howItWorks", label: "Now What You Did", scored: true,
        criteria: "The approach in concrete steps. Not everything they did, just what mattered most. Easy to follow, easy to replicate. STRONG (5): two to four sequenced steps, each visibly attacking the root cause; a future team could replicate the approach from this box alone. WEAK (3): steps present but exhaustive (every task performed) or vague (verbs with no object), or the link back to the root cause is implied rather than shown. MISSING (1): an activity list with no structure, or absent. Benchmark (5): a reframe (\"We stopped asking 'How do we manage all of this work?' and started asking 'Which of this work should exist at all?'\"), then three steps: expose the complexity, eliminate low-value activity, standardize the work with red rule / green rule guardrails, each tied straight back to the exceptions problem." },
      { key: "wiifm", label: "WIIFM", scored: true,
        criteria: "The impact: what changed as a result of the project. Lead with the financial metric, then add on-time delivery, capacity or simplification results where relevant. STRONG (5): leads with a hard financial number, then two or three supporting results (on-time delivery, capacity, simplification): results that happened, stated specifically. WEAK (3): results are real but vague (\"improved efficiency\", \"strong ROI\"), there is no financial number, or it restates the activities instead of their impact. MISSING (1): absent, or no measurable change named. Benchmark (5): \"$200K in annual savings\", then improved on-time delivery, less overhead, more capacity to scale, a repeatable playbook." },
      { key: "recommendation", label: "Your Recommendation / Executive Takeaway", scored: true,
        criteria: "Based on what the team learned, what should the organization do next? The single conclusion senior leaders should leave with, and which of the six recommendation types it is: sustain, scale, replicate, adjust, avoid or monitor. Persuasive: clearly restate what you want them to say yes to. STRONG (5): one clear, unhedged sentence, stated as a direction; obvious which of the six types it is; it follows from the Big Idea, says where to apply it next, and matches the headline in the Opening Gambit. WEAK (3): a recommendation exists but the type is unclear, it hedges (\"we could consider...\"), it offers a menu of options instead of one direction, or it does not match the Opening Gambit headline. MISSING (1): no recommendation; the story ends with results and gives leaders no direction. Name the type in the feedback. Scale and Replicate sit close together: require the team to name one, and never mark them down for choosing its neighbor. Benchmark (5): \"Apply the same complexity audit to the next customer or product segment showing high transaction volume, excessive exceptions, disproportionate overhead, and service that has become 'just the way we do it'.\" That is Scale." },
      { key: "close", label: "Summarize & Gain Commitment | Close", scored: true,
        criteria: "Come back to the Big Idea. Restate what changed and why it matters. Name the tradeoff: what it costs not to act. End strong; do not trail off. STRONG (5): reconnects explicitly to the Big Idea, restates what changed with the headline number, names what it costs not to act, and ends on a strong final line. Persuasive: ends on the decision being asked for. WEAK (3): summarizes accurately but re-presents the whole case, never reconnects to the Big Idea, skips the cost of not acting, or ends on a thank-you. MISSING (1): trails off, or absent. The tradeoff is required for a 5 in every 80/20 story, Inform or Persuasive. Benchmark: \"Motorola was not the problem. Unmanaged complexity was the problem. When we applied 80/20 to how we served the customer, not just which customers we served, we released $200K in savings and created a more scalable operating model.\" Strong on the Big Idea and the number, but no tradeoff: a 3 as written. Adding \"Complexity returns. The wins don't scale.\" makes it a 5." },
      { key: "actionsNextSteps", label: "Actions & Next Steps", scored: true,
        criteria: "What specific actions should the room leave with? Name them. Own them. Give them a timeline. STRONG (5): three to five concrete next steps, each with an owner and a timeline, that follow from the recommendation rather than repeating Now What You Did; the ask of the room is named, not implied. WEAK (3): actions listed but with no owners or dates, or restating work already completed. MISSING (1): absent, or a vague intention to continue. Owners and dates are required for a 5. Benchmark: select the next segment for review; formalize the red rule / green rule framework; document the Trilogy playbook; share the case with the next cohort of 80/20 Champions. Strong actions, but with no owners or dates this scores a 3 as written; a name and a date on each makes it a 5. As executives put it: \"Tell me who's accountable and by when.\"" }
    ],
    overallReadCalibration: [
      '- "needs work": 3 or more boxes score 1, OR the Big Idea, the Recommendation and the Close are all absent',
      '- "mixed": real strengths with 1 to 2 critical gaps or broken connections',
      '- "strong": no box below 3, the Opening Gambit, Big Idea, Recommendation and Close all score 4 or higher, and the connections hold'
    ].join("\n"),
    connections: [
      "Headline and takeaway: the Opening Gambit headline and the Recommendation say the same thing. If they do not, the story changed direction in the middle.",
      "Root cause and Big Idea: the Big Idea visibly flips the root cause in the Situation. The bridge sentence is the test.",
      "Close and Big Idea: the Close comes back to the Big Idea in the same words, not a new idea.",
      "Actions and recommendation: the Actions follow from the Recommendation; next steps, not a replay of Now What You Did.",
      "The adoption sequence: Module 2's four steps run through the conclusion: the Recommendation (stated upfront in the Opening Gambit), the rationale (WIIFM), the tradeoff (Close) and the ask (Actions & Next Steps). If one is missing, the ask will not land; name which.",
      "Discipline: one beat each for the Opening Gambit, Situation and Big Idea. Two to four steps in Now What You Did. WIIFM and the Close kept tight. Anything else belongs in an appendix.",
      "These connections are reported, never scored."
    ]
  },

  // Shared by the prep and storyboard evaluators, so it holds only what is true
  // of both. Box-specific scoring rules (the Swap Test cap, the bridge
  // sentence, the Trilogy calibration) live in each box's criteria instead.
  doctrineAddendum: `PROGRAM CONTEXT: 80/20 Champions reporting a completed improvement project to senior leaders. This is an INFORM story: the "yes" being sought is adoption of what the project proved, not approval of a new plan. The yes isn't "start this project," it's "don't stop here."

DIAGNOSTIC VOCABULARY. When something is weak, name which of these five failure modes it is, in these words:
- Too Much Detail: showing everything they know instead of what executives need.
- Buried Reco: the point of view is buried under context and data.
- Weak Decision Framing: the ask, tradeoffs and timing are not explicit.
- Crowded Slides: dense visuals make leaders work hard to find the message.
- Pressure Breaks Structure: one tough question pulls the presenter off message.

RECOMMENDATION TYPES: a recommendation here is one of the six taught types: Sustain, Scale, Replicate, Adjust, Avoid or Monitor. The worksheet prompt lists four; accept all six. For this cohort it will almost always be Scale or Replicate, and the line between them is thin: require the attendee to name one, and never mark them down for choosing its neighbor. Name which one it is; if it is unclear, say so. The Trilogy example (apply the complexity audit to the next customer or product segment) is Scale.`
};
