# Page copy

Approved copy per page. Every capability claim here has been checked against
the code. Where the approved language conflicts with real behavior, the
correction is marked **Reality**.

## Navigation

Primary nav order — already correct, leave it:
`Home · Ask the Expert · StoryLab · Own the Room`

StoryLab secondary nav — rename to:
`StoryBuild · StoryCheck · StoryCoach`

Inside any StoryLab tool, keep StoryLab active in primary nav and mark the
current tool active in secondary nav.

Keep account, support, settings, and sign out in one account menu. Sign out
should not visually compete with work actions.

---

## Home

Home answers **What do I need to do next?** It is not a product tour.

Hierarchy: welcome → three destination cards → Continue Working → Start
something new.

**Kicker:** `Welcome back, [First name]`
**Heading:** `What are you working on today?`
**Sub:** `Choose a tool based on where you are in the presentation process.`

### Cards

**Ask the Expert** — label `Understand the method`
`Talk through a TPG framework, pressure-test your thinking, or learn how to apply the methodology.`
Button: `Ask the Expert`

**StoryLab** — label `Apply the method`
`Use StoryBuild to create the structure, StoryCheck to assess the work, or StoryCoach to solve a specific challenge using your material.`
Button: `Open StoryLab`

**Own the Room** — label `Amplify your delivery`
`Upload a recorded run-through and get timestamped coaching on voice, pacing, presence, body language, confidence, and audience connection.`
Button: `Analyze a run-through`

### Continue Working

Rename `Your Recent Work` → `Continue Working`.

Per item, where supported: title, work type, last updated, status, action.

Actions — use the specific label, not `Open`:
`Continue` · `View report` · `Resume conversation` · `View delivery review`

**Reality:** these labels are safe as of the Recent Work routing fix
(`fix/recent-work-routing`). Before it, three of four links were dead and a
specific label would have been a false promise. If that work is reverted,
revert these labels too.

**Reality:** all four StoryCheck types now persist and reopen. Proper Prep and
Storyline results are stored as structured data rather than markdown, and the
check type is stored on the record rather than inferred.

Empty state:
`You haven't saved any work yet. Start with StoryBuild, StoryCheck, StoryCoach, or a recorded delivery review.`

### Start something new

Keep the section. Update the three shortcuts to the new names — the current
`Start a storyboard` in particular conflicts with the storyboard/storyline
distinction and should become `Start a StoryBuild project`.

---

## StoryLab landing

**Heading:** `StoryLab`
**Intro:** `Build, check, and strengthen your presentation story using the TPG methodology.`
**Decision helper:** `Use StoryBuild to create the structure, StoryCheck to assess the work, and StoryCoach to solve a specific challenge.`

**StoryBuild** — `Build the story`
`Turn notes, source documents, or an early draft into a structured presentation storyline and slide outline.`
Button: `Start StoryBuild`

**StoryCheck** — `Assess the work`
`Check a plan, storyline, or deck against the TPG methodology and identify the most important improvements.`
Button: `Start StoryCheck`

**StoryCoach** — `Strengthen a challenge`
`Ask a focused question about your audience, message, slide, or story and get specific recommendations.`
Button: `Start StoryCoach`

Optional helper:
`Not sure where to begin? Start with StoryBuild when you need structure. Use StoryCheck when you have a draft. Choose StoryCoach when you already know what you want help with.`

---

## StoryBuild

**Kicker:** `StoryLab · StoryBuild`
**Heading:** `Build your presentation storyline`
**Intro:** `Add your notes or source material. StoryBuild will identify the key planning inputs, help you complete any gaps, and create an editable storyline and slide outline.`

Do not call this `Create from scratch` — users often arrive with material.

Workflow: Add source material → Review your plan → Shape the storyline →
Create the slide outline.

### Add source material

**Heading:** `Add your source material`
`Start with whatever you have—rough notes, a planning document, an existing presentation, or another source.`

**Question:** `What are you starting with?`
Options: Notes or rough ideas · Proper Prep worksheet · Storyboard or outline ·
Existing presentation · Executive summary · Strategy or planning document ·
Other source material

Helper: `Choose the closest match. This helps StoryBuild interpret your material; it does not limit what you can add.`

Primary field: `Paste your notes or draft content`
Placeholder: `Include the key points, recommendation, decision, or information the presentation needs to cover.`

Secondary field: `Add audience and meeting context`
Placeholder: `Who is the audience? What do they already know? What decision or action do you need? Are there timing, organizational, or political considerations?`

Upload label: `Add source files`
Upload helper: `Upload PowerPoint, Word, PDF, text, or image files. StoryBuild will use their content to help shape the storyline.`

**Reality:** accepted types are `.txt .md .csv .json .tsv .pdf .doc .docx .ppt
.pptx .png .jpg .jpeg`. The helper above is accurate. Image handling requires
Vercel Blob and only works deployed.

Action: `Review my story inputs`
Progress: `Reviewing your material and identifying the key planning inputs…`

### Review your plan

**Heading:** `Review your plan` · methodology label `Proper Prep`
`Confirm the audience, desired outcome, audience needs, and likely objections before StoryBuild creates the storyline.`

Fields: Audience or stakeholder group · Primary decision-maker's role · Likely
communication style · Functional or departmental needs · Business needs ·
Personal or professional needs · Why the audience may say yes · Concerns or
objections they may raise

Communication-style helpers:
- **Thinker** — values evidence, logic, and detail
- **Director** — values speed, outcomes, and control
- **Relater** — values trust, stability, and inclusion
- **Socializer** — values energy, ideas, and possibility

Missing information: `A few details would strengthen the storyline`
`StoryBuild found enough information to continue, but the following details would make the recommendation more specific.`
Actions: `Update my plan` · `Continue with current information`

### Storyline

Action: `Generate my storyline`
Progress: `Building a storyline from your plan and source material…`

Columns: Story section · Key takeaway · Narrative purpose · Visual direction

Helper: `Edit any field directly. Each takeaway should state the conclusion the audience should reach—not simply name the topic.`

Assistant opening: `I can help you strengthen any part of this storyline. Ask me to revise the opening, sharpen the Big Idea, clarify audience value, improve the flow, or strengthen the close.`

### Slide outline

Modal: `Where will you build your slides?`
`We'll format the slide outline so it is easier to transfer into your preferred presentation tool.`
Action: `Create slide outline`

Fields: Slide · Takeaway title · Key content · Speaker notes · Suggested visual ·
Tips for [selected tool]

**Completion:** `Your slide outline is ready`
Actions: `Copy slide outline` · `Return to storyline` · `Start StoryCheck`

**Reality:** copy-to-clipboard works. PPTX export is labeled "coming soon" in
the UI and does not exist — do not add download or export language.

Handoff: `Built a first draft of the slides? Use StoryCheck to assess the presentation, or StoryCoach to improve a specific section.`

---

## StoryCheck

**Kicker:** `StoryLab · StoryCheck`
**Heading:** `Check your work against the TPG methodology`
**Intro:** `Choose what you want reviewed, then add your work. StoryCheck will identify what is working, what needs attention, and what to improve next.`

**Reality:** the original package said "then upload your file." Two of the four
check types are **paste-only** with no file input. "add your work" covers both.

Boundary helper: `StoryCheck provides a structured assessment of the complete work. For help with one specific question or section, use StoryCoach.`

### Check types

**Proper Prep Check** — label `Planning` — *paste only*
`Review your audience, desired outcome, audience needs, likely objections, and reasons to say yes before you build the story.`
Input: `Paste your Proper Prep worksheet.`
Action: `Check my Proper Prep`

**Storyline Check** — label `Structure` — *paste only*
`Check whether the story has a clear progression, earns the Big Idea, and leads the audience toward the desired action.`
Input: `Paste your storyboard, storyline, or presentation outline, section by section.`
Action: `Check my storyline`

**Presentation Check** — label `Full deck` — *file upload*
`Review the complete presentation against the TPG methodology, section by section.`
Upload helper: `Upload the full presentation. Accepted: PDF, PowerPoint (.pptx), plain text or markdown.`
Action: `Check my presentation`

**Compelling Content Check** — label `Slide by slide` — *file upload*
`Review each slide for clarity, simplicity, readability, visual communication, and takeaway-driven titles.`
Upload helper: `Upload the presentation you want reviewed slide by slide.`
Action: `Check my slide content`

**Reality:** Presentation and Compelling Content are not independent peers.
Presentation runs first and can then be extended slide-by-slide from within
its own report. Compelling Content runs the slide-by-slide pass alone. Present
them as four choices, but the follow-on action inside a Presentation report is
`Add a slide-by-slide review`, not a separate check.

Do not mix Review, Evaluator, Analysis, or legacy names into the type names.

### Progress

1. Uploading your file
2. Reading the presentation
3. Checking it against the methodology
4. Preparing your StoryCheck report

Compelling Content substitutes steps 2–3 with `Reading each slide` and
`Checking slide clarity and visual communication`.

### Report

Title: `StoryCheck report`, with the check type beneath it.

Hierarchy: Overall assessment → Top strengths → Highest-priority improvements →
Section-by-section findings → Recommended revision sequence → Next step

Finding fields: What is working · What needs attention · Recommendation

**Reality:** the report currently renders per-element status of
`present | weak | missing | unclear`, a `/5` score, and an overall read of
Strong / Mixed / Needs work. Renaming those values is a prompt-and-rendering
change, not a copy change — treat it as a separate piece of work and keep the
existing scale until then.

Completion actions: `Start a new StoryCheck` · `Return to StoryBuild`

**Cut:** `Download report` — no download capability exists anywhere in the
product. **Cut:** `Continue in StoryCoach with this report as context` — no
cross-tool context transfer exists. A plain link to StoryCoach is honest; the
"with this report as context" clause is not.

### Hard boundary

Never claim a static check evaluates voice, pacing, body language, confidence,
presence, or audience connection. Those belong to Own the Room.

---

## StoryCoach

**Kicker:** `StoryLab · StoryCoach`
**Heading:** `Get focused help with a presentation challenge`
**Intro:** `Ask a question or add a slide, passage, screenshot, or deck excerpt. StoryCoach will diagnose the issue, explain why it matters, and suggest specific ways to strengthen it.`

Boundary helper: `Looking for a structured review of an entire plan, storyline, or deck? Use StoryCheck.`

Opening: `What would you like to improve? Ask about your audience, opening, Big Idea, story flow, slide language, audience value, or close. You can also add a deck, document, or screenshot.`

Suggested prompts:
- Help me sharpen my Big Idea.
- Does this opening create enough tension?
- Is the audience value clear?
- Rewrite this slide title as a takeaway.
- What objections have I failed to address?
- Is my ask specific enough?
- Where does this story lose momentum?
- Help me adapt this for a Director audience.

Composer placeholder: `Ask a question or paste the content you want help with…`
Primary action: `Ask StoryCoach`
Attachment label: `Add a file or screenshot`
Helper: `Add a slide, deck, worksheet, document, or screenshot so StoryCoach can respond to your actual content.`

Response headings, as applicable: What I'm seeing · Why it may be happening ·
How to strengthen it · Rewrite options · Why these changes work · Recommended
next step

Prefer `What needs attention` over `What's weak`.

### Identity

`StoryCoach suggests…` / `StoryCoach can help…` / `Ask StoryCoach…`

Never imply a human relationship: no `your personal TPG coach`, `live human
coach`, or `assigned coach`.

Saved-work type: `StoryCoach conversation`. Default title:
`Untitled StoryCoach conversation`.

Actions: `Ask a follow-up question` · `Copy recommendation` ·
`Start a StoryCheck` · `Open StoryBuild`

**Reality:** `Apply this in StoryBuild` implies the recommendation carries over.
It does not. Use `Open StoryBuild` or explanatory text instead.

---

## Ask the Expert

**Kicker:** `Understand`
**Heading:** `Ask the Expert`
**Intro:** `Talk through a TPG framework, pressure-test an idea, or learn how to apply the methodology with an interactive TPG expert.`
**Start guidance:** `Begin with your goal or question. You can speak or type.`

Never call it Story-anything, a live coach, a human coach, an avatar tool, or a
personal TPG coach.

Example prompts:
- Help me clarify my desired outcome.
- What makes a strong Opening Gambit?
- Does my Big Idea resolve the root cause?
- How should I adapt this story for a Director audience?
- What should the close ask the audience to do?
- How is WIIFM different from a general benefit?
- When should I use Know–Believe–Do?

Framework reminders:
- **Proper Prep** — `Clarify the audience, desired outcome, needs, motivations, and likely objections.`
- **Storyline** — `Build the logical progression from the audience's current situation to the recommended action.`
- **Compelling Content** — `Turn the story into clear, concise, visually effective slides.`

Microphone: `To speak with the expert, allow microphone access when your browser prompts you. You can type instead at any time.` Put detailed browser help behind
`Having trouble with your microphone?`

### Privacy

**Reality:** this page is a third-party LiveAvatar iframe. Deckspert does not
control whether audio or transcripts are stored, and sessions do not appear in
Continue Working. Do not write privacy copy from assumption — confirm the
vendor's actual behavior first, and say nothing rather than guess. State only
that typing is available as an alternative, which is verifiable.

---

## Own the Room

**Kicker:** `Amplify · Own the Room`
**Heading:** `Strengthen your presentation delivery`
**Intro:** `Upload a recorded run-through to get timestamped coaching on your voice, pacing, presence, body language, confidence, and audience connection.`

Upload heading: `Upload your recorded run-through`
Helper: `Accepted formats: MP4 or MOV, up to 600 MB. For the most useful feedback, use a recording with clear audio that shows your upper body.`

**Reality:** 600 MB and MP4/MOV are enforced both client- and server-side. The
older standalone delivery-coach app still says "roughly 500 MB" — fix or
delete that copy.

Context label: `What should the review focus on?`
Placeholder: `Example: This is a 12-minute executive update. Please focus on pacing, filler words, confidence, transitions, and whether the close feels decisive.`

Primary action: `Analyze my recording`

### Progress

`Uploading your recording… 62%` → `Upload complete. Your recording is ready to analyze.` → `Starting your delivery review…`

Processing heading: `Analyzing your run-through`
`Deckspert is reviewing your delivery and preparing timestamped coaching.`

Stages: Recording received → Reviewing voice and pacing → Reviewing presence
and body language → Preparing your coaching report

**Reality:** the backend has a nine-value status enum (`uploaded`, `queued`,
`compressing`, `extracting_audio`, `transcribing`, `sampling_frames`,
`generating_coaching`, `complete`, `failed`). Map those nine onto these four
labels in the presentation layer. Do not rename the enum.

The recording is polled by job id, and the page is refresh-safe, so
`You can leave this page and return to the review from Continue Working.` is
accurate — provided the Recent Work delivery link keeps its query string.

### Failure

`We couldn't complete this review`
`Your recording was uploaded, but the analysis did not finish. Try again. If the problem continues, upload a shorter MP4 or contact support.`
Action: `Try again`

### Report

Hierarchy: Overall assessment → Overall delivery score → Top strengths → Top
priorities → Coaching moments → Practice plan → Next step

Overall-score helper: `A combined score across voice, pacing, body language, and confidence.`

**Reality:** those are the four dimension labels the UI actually renders. The
original package described them as "voice and pacing, presence and confidence,
body language, and audience engagement" — the internal Prisma keys. Never use
those in the UI.

Scores render `out of 10`. See `01` — do not convert to `/5`.

Coaching moment fields: Timestamp · What happened · Why it matters · What to try
Priority labels: Fine-tune · Important · High priority
Timestamp ranges as `03:12–03:26`.

Practice plan fields: Practice focus · Exercise · Frequency · Duration ·
Success indicator

Completion actions: `Analyze another run-through`

**Cut:** `Download report` — does not exist. **Cut:** `Compare with a new
recording` — does not exist. **Cut:** `Continue in StoryCoach with this report
as context` — no context transfer exists.
