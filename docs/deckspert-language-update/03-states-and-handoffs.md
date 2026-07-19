# Saved work, states, errors, and handoffs

Shared patterns. These cut across every page, so they are the cheapest place to
get consistency and the easiest place to leave it broken.

## Principle

Every system message describes what Deckspert is doing **in terms of the user's
task**, never its implementation.

## Saved-work labels

StoryBuild project · StoryCheck report · StoryCoach conversation ·
Delivery review

Default titles:
- `Untitled StoryBuild project`, or a generated topic-based suggestion
- `StoryCheck: [uploaded filename]`
- `Untitled StoryCoach conversation`
- `Delivery review: [recording filename]`

**Reality:** only four things persist — StoryBuild projects, Presentation and
Compelling Content StoryCheck reports, StoryCoach conversations, and delivery
jobs. Proper Prep and Storyline checks are not saved and cannot be reopened.

**Reality:** there is no retention policy of any kind — no cron, no TTL, no
cleanup, and no user-facing delete. History accumulates indefinitely; Continue
Working simply caps the display at five per type and eight in total. If copy
ever implies work is temporary or is cleaned up, it is wrong.

## Statuses

Use: `Draft` · `In progress` · `Ready to review` · `Complete` ·
`Needs attention` · `Analyzing` (only while work is actively underway)

Never surface: queued, processing, generated, asset ready, partial extraction,
job failed, compressing, extracting audio, sampling frames.

**Reality:** `DeliveryJobStatus` is a real Prisma enum with nine values and
`CreatorProject.status` is a loose string currently written as `complete` and
`in_progress`. Map both to the labels above at the presentation layer. Do not
migrate the enum.

## Upload states

- `Uploading [filename]…`
- `[filename] added`
- `We added the file but could not read all of its content. Add another version or paste the most important sections.`

Avoid: processed, extracted successfully, queued, ingestion complete,
attachment converted.

## Error formula

Every error answers four questions:

1. What happened?
2. Was the user's work preserved?
3. What should they do?
4. Is there another way to continue?

### Approved errors

**File upload**
`We couldn't add that file. Try again, or paste the relevant content into the text field.`

**Unreadable file**
`We added the file but could not read all of its content. Add another version or paste the most important sections.`

**StoryBuild**
`StoryBuild couldn't create the storyline. Your source material and planning inputs are still here. Try again.`

**StoryCheck**
`StoryCheck couldn't complete this review. Your file is still available. Try the review again.`

**StoryCoach**
`StoryCoach couldn't respond to that request. Your message and attachments are still here—try again in a moment.`

**Delivery analysis**
`We uploaded your recording but couldn't complete the review. Try again.`

**Unsupported video type**
`Upload an MP4 or MOV file. Other video formats are not supported yet.`

**File too large**
`This file is larger than the 600 MB upload limit. Shorten the recording or export a smaller version and try again.`

**Report won't load**
`We couldn't load this report. Refresh the page or open it again from Continue Working.`

**Saved work missing**
`We couldn't find that item. It may have been removed.`

Only claim work was preserved when it actually was. Check the failure path
before writing "your inputs are still here."

### Never shown to users

Server errors, OpenAI or Anthropic configuration, Supabase, DATABASE_URL, job
IDs, internal exceptions, JSON, model names, token limits, stack traces.

## Empty states

State what is absent, say why the area matters, give one clear action. No dead
ends, no internal state.

## Contextual handoffs

Show the handoff that fits the user's current state. Do not put every handoff
everywhere.

**After StoryBuild**
- `Ready to test the work? Start StoryCheck.`
- `Need help refining one section? Open StoryCoach.`

**After StoryCheck**
- `Need help acting on a finding? Open StoryCoach.`
- `Does the story need a structural rethink? Return to StoryBuild.`

**From StoryCoach**
- For a broader rebuild: `This challenge may be easier to solve in StoryBuild, where you can revise the complete storyline.`
- For validation: `When the revision is ready, use StoryCheck for a structured review.`

**After Own the Room**
- `Use StoryCoach to strengthen the language, transition, or close connected to a coaching moment.`

### The functional safeguard

**No cross-tool context transfer exists anywhere in the product.** Not
partially — at all. A user moving between tools must re-upload or re-paste
their material.

So every handoff above is a **navigation link with explanatory text**, and the
copy must not imply otherwise. Specifically, never write "with this report as
context," "apply this in," "send to," or "continue where you left off" across a
tool boundary.

If context transfer is built later, this constraint lifts and the richer
phrasing from the original package becomes available. Until then it is a
promise the product cannot keep.
