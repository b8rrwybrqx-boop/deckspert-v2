# Deckspert language update — architecture and naming

Start here. This is the source of truth for the authenticated desktop product.
Read this file, then the page copy in `02`, then the shared states in `03`.
`04` covers batch order and verification.

## Mission

Update customer-facing language in the authenticated product so it reflects the
approved architecture and voice. This is the workspace people use after
purchase, not a selling site. Optimize for clarity and task completion.

## Operating rules

1. Customer-facing language changes. Internal names may stay. Do not rename
   routes, database fields, Prisma enum values, API contracts, or analytics
   keys — map them at the presentation layer instead.
2. Never expose an internal identifier in the UI.
3. Never promise a capability that does not exist. Every claim in `02` and `03`
   has been checked against the code; if you add copy, check it too.
4. Preserve layouts and interaction patterns unless the copy requires a
   hierarchy change.
5. Report conflicts between this package and actual behavior rather than
   implementing around them.

## Approved architecture

- **Ask the Expert** — Understand the method
- **StoryLab** — Apply the method
  - **StoryBuild** — Build the story
  - **StoryCheck** — Assess the work
  - **StoryCoach** — Strengthen a specific challenge
- **Own the Room** — Amplify your delivery

`StoryBuild → StoryCheck → StoryCoach` communicates the system. It is not a
required workflow; users may enter any tool directly.

### Already in place

Primary navigation (`Home · Ask the Expert · StoryLab · Own the Room`) and the
Understand/Apply/Amplify pillar structure already exist in the `PILLARS` const
in `apps/web/src/main.tsx`. Do not rebuild them. What needs renaming is the
StoryLab **secondary** navigation, currently
`Create from scratch · Evaluate a deck · Coaching Companion`.

### Positioning boundaries

- **Ask the Expert vs. StoryCoach** — Ask the Expert explains the methodology
  broadly and needs no user material. StoryCoach works on the user's actual
  presentation content.
- **StoryCheck vs. StoryCoach** — StoryCheck is a structured assessment of
  complete work. StoryCoach solves one focused problem through conversation.
- **StoryCheck vs. Own the Room** — StoryCheck assesses planning, structure,
  and slide content from documents. Own the Room assesses delivery from a
  recording. Never imply StoryCheck can judge voice, body language, pacing,
  confidence, or presence from a static file.

## Exact names

Use these forms everywhere: Deckspert, Deckspert by TPG, Home, Ask the Expert,
StoryLab, StoryBuild, StoryCheck, StoryCoach, Own the Room.

Never: Story Build, Storybuild, Story Coach, StoryCheck Evaluation, StoryCoach
Companion. The platform header currently reads `TPG Deckspert` — change it to
`Deckspert by TPG` to match the public site.

### Object names

StoryBuild project · StoryCheck report · StoryCoach conversation ·
Delivery review · Storyline · Slide outline · Recorded run-through

**Storyboard** means only a source document the user uploads. Anything
Deckspert generates is a **storyline**. This distinction is the highest-value
item in the package: `storyboard` currently means three different things in the
codebase (a check type, a StoryBuild stage heading, and the `storyboardJson`
column).

## Replacement map

Conceptual replacements. Not instructions for a global find-and-replace.

| Find and audit | Approved customer-facing language |
|---|---|
| Create from scratch, Creator, Builder | StoryBuild |
| Evaluate as a feature name, Evaluator | StoryCheck |
| Coaching Companion, Coach as a feature name | StoryCoach |
| Coaching thread | StoryCoach conversation |
| storytelling tools | StoryLab, or the specific tool |
| delivery evaluator, Dynamic Delivery tool | Own the Room, or Delivery review |
| Creator project, storyboard job | StoryBuild project |
| evaluation job | StoryCheck report |
| delivery job | Delivery review |
| storyboard as a generated result | storyline |
| output, artifact | storyline, slide outline, report, recommendation |
| job, process | review, analysis |
| retry job | Try again |
| process, extract, ingest | review, read, build, check, analyze, prepare |

**Dynamic Delivery** stays. It is the name of the TPG framework, not a product
name, and it is used correctly today.

### Auditing, not searching

There is no content dictionary and no i18n layer — every string is inline JSX
or a module-scoped const. The nearest things to centralized copy are `PILLARS`
in `main.tsx`, `EVAL_OPTIONS` / `EVAL_TITLES` in
`apps/web/pages/platform-evaluator/index.tsx`, `statusLabels` in
`apps/web/pages/evaluate/index.tsx`, and `frameworks` in
`apps/web/pages/expert/index.tsx`. Start there.

Grep for the feature names above, but **trace each hit to the presentation
layer before changing it**. Do not bulk-search generic tokens like `model`,
`token`, `server`, `json`, or `job` — thousands of legitimate code hits, almost
no signal. Leave alone: builder patterns, backend job queues, internal model
names, database enum values, analytics keys, and logs.

## Voice

Clear, experienced, calm, practical, encouraging, candid. Intelligent without
being academic. Confident without being promotional.

Avoid: amazing, powerful AI, three ways to win, transform your presentation,
knows the methodology cold, start from zero.

Note that the current Home H1 — `One method, three ways to win.` — is an
example of what to remove.

## Editorial mechanics

- Product names take exact title capitalization. Everything else — page
  headings, report sections, field labels, buttons — is sentence case.
- Verb-plus-object action labels. Avoid bare `Open`, `Go`, `Send`, `Submit`,
  `Process`, `Retry Job`. (`Start StoryBuild` is fine; the rule is against
  contentless verbs, not the word "start".)
- En dash for ranges: `03:12–03:26`, `slides 4–7`.
- `run-through`, `slide-by-slide`, `section-by-section`, `decision-maker`.
- Ellipsis for active progress: `Reviewing your material…`
- No exclamation points in routine states. Praise only when earned — do not
  default success states to `Great!` or `You're all set!`.

### Scores

The product has **two scales**, and they must not be homogenized:

- **Own the Room** renders `out of 10` across four dimensions, labeled
  **Voice**, **Pacing**, **Body Language**, **Confidence**, plus an overall
  score. Use those four labels. Do not use the internal Prisma keys
  (`voicePacing`, `presenceConfidence`, `audienceEngagement`) in any UI text.
- **StoryCheck** renders `/5` per element, with a status pill and an overall
  read of Strong / Mixed / Needs work.

Within each, keep the format consistent. Do not mix `4.2 / 5` with
`4.2 out of 5` or `Score: 4.2`.

### Coaching language

Prefer: needs attention, unclear, underdeveloped, not yet supported, could be
more specific, the audience benefit is not yet explicit.

Avoid standalone judgments: bad, failed, poor, wrong, weak content.

Do not anthropomorphize the model or expose scoring mechanics. Not
`The AI determined that the WIIFM score is insufficient.`

## Methodology terms

Use TPG terms as-is. These are the working vocabulary of the audience:

- **WIIFM** — why this matters to the audience
- **Big Idea** — the central recommendation or resolution
- **Opening Gambit** — the opening that earns attention and frames the issue
- **Know–Believe–Do** — what the audience should understand, accept, act on
- **Proper Prep** — planning completed before building the story
- **Dynamic Delivery** — the TPG framework for presenting with impact

**Do not gloss these in the UI.** The definitions above are for whoever is
writing the copy, not for the screen. Everyone in the authenticated product has
been through TPG training, so inline definitions read as padding rather than
help. A glossary was added under the StoryCheck section table on this basis and
removed after review — do not reinstate it. If a term genuinely needs
explaining for a future non-trained audience, that is a scoped decision, not a
default.

## Technical language banned from the UI

job, queued, parsing, JSON, model, token, Supabase, server, extraction,
ingestion, configuration, asset created, compiling, document conversion,
internal exception, job ID.

Translate system activity into the user's task: reviewing, reading, checking,
building, analyzing, preparing.
