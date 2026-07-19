# Implementation order and verification

## Before starting

There is **no test safety net for copy**. The repo has three logic tests in
`apps/delivery-coach`, run via `tsx --test`; the root `package.json` has no
`test` script, there is no React testing library, and nothing asserts on any UI
string. Every change here is verified by hand.

Available checks: `npm run typecheck` (expect ~20 pre-existing errors in
`apps/delivery-coach`, whose deps are not installed at root) and
`npm run build`.

**Local dev cannot reach the database.** `DATABASE_URL` is absent from local env
files, so anything touching Prisma — Continue Working, saved reports, projects,
conversations, delivery jobs — returns 500 locally. Those paths can only be
verified on a deploy. To see the authenticated UI locally at all, use demo
mode: comment out `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **both**
`.env` and `.env.local`, restart, then "Continue in local demo mode". Restore
both files afterward — they hold live secrets and `.env` is git-tracked.

## Batch order

Work in this sequence. Each batch is independently shippable.

**Batch 1 — Naming.** StoryLab secondary nav, page headings and kickers,
browser titles, breadcrumbs, card copy, empty states, saved-work type labels,
`Your Recent Work` → `Continue Working`, `TPG Deckspert` → `Deckspert by TPG`,
and the storyboard/storyline split. Highest value, lowest risk.

**Batch 2 — Technical language.** Delivery status labels, `Creating Job…`,
`Refresh Status`, `Start Delivery Analysis`, progress copy, and every error
message rewritten to the formula in `03`.

**Batch 3 — Differentiation.** The StoryLab decision helper, the
StoryCheck↔StoryCoach boundary helpers on both pages, the Ask the
Expert↔StoryCoach distinction, and removing any implication that StoryCheck
assesses delivery.

**Batch 4 — Editorial pass.** Sentence case, score-format consistency within
each scale, methodology terms explained at first use.

### Deliberately out of scope

These require new capability, not new copy. Do not implement copy that assumes
them:

- Report download or export
- Cross-tool context transfer
- Recording comparison
- The six-value StoryCheck status scale (a prompt and rendering change)
- Persistence for Proper Prep and Storyline checks

## Manual QA

### Routes to walk

Authenticated, desktop, signed in:

- `/platform` — Home
- `/platform/expert` — Ask the Expert
- `/platform/storylab` — StoryLab landing
- `/platform/creator` — StoryBuild
- `/platform/evaluator` — StoryCheck (all four types)
- `/platform/coach` — StoryCoach
- `/platform/dynamic-delivery` — Own the Room

Legacy redirects, which must preserve their query strings:
- `/evaluate?jobId=…` → `/platform/dynamic-delivery?jobId=…`
- `/creator?projectId=…` → `/platform/creator?projectId=…`

### Per-route checks

**Navigation** — correct order; StoryLab stays active inside all three tools;
the right secondary tool is marked active; back/forward and direct URLs keep
the active state correct.

**Home** — three cards in Understand → Apply → Amplify order; Continue Working
items show correct type labels and specific actions; each action actually
opens its item; empty state points somewhere valid.

**StoryBuild** — no `Create from scratch`, Creator, or Builder language; the
generated result is called a storyline, never a storyboard; the four workflow
steps use approved terms; a failed generation preserves what it claims to.

**StoryCheck** — all four types present and consistently described; paste-only
types do not mention uploading; the StoryCoach boundary helper appears; no
delivery claims anywhere in a static report; score format unchanged.

**StoryCoach** — positioned around the user's own material; StoryCheck boundary
helper present; no implication of a human or assigned coach; attachments and
paste-to-attach work.

**Ask the Expert** — framed as methodology understanding; no Story-prefixed
name; no unverified privacy claims; typing offered as an alternative.

**Own the Room** — no job, queue, or asset language in upload or processing;
nine backend statuses map cleanly onto four user-facing stages; report
hierarchy and timestamp format consistent; failure path offers recovery.

### Regression checks

- Existing routes still resolve; saved work created **before** the change still
  opens and renders with the new labels.
- No internal identifier appears in the UI.
- No rename touched a route, Prisma enum value, analytics key, or API contract.
- Upload paths: success, partial read, unsupported type, too large, failure.
- Browser titles and breadcrumbs updated.

### Final sweep

Grep for the legacy feature names in `01`, confirm each remaining hit is
internal-only, and confirm no copy added during implementation claims a
capability from the out-of-scope list.
