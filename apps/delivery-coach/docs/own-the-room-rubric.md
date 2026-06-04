# Own the Room — Delivery Assessment Rubric (DRAFT)

> **Status:** Draft for review. This documents the *intended* scoring model and
> proposes the bands/thresholds. It is **not yet wired into code** — today the
> criteria live scattered across `lib/coaching/prompt.ts`, `lib/coaching/report.ts`
> (three functions), and `lib/validation/delivery.ts`. The goal of this doc is to
> become the single source of truth that both the prompt and the scoring import
> from, so the number and the coaching can't drift apart.
>
> Anywhere a threshold is marked **(unvalidated)**, it is a current code value or a
> proposed starting point that has *not* been anchored to TPG's canonical Dynamic
> Delivery framework. Those are the ones to pressure-test.

---

## 1. What we score

Own the Room produces **one Overall Delivery Score (1–10)** and **four dimension
scores (1–10 each)**, plus a coaching narrative (executive summary, top strengths,
priority fixes, timestamped coaching moments, practice plan).

| Dimension | One-line definition |
|---|---|
| **Voice & Pacing** | Is the speaker easy to listen to — controlled pace, clean of filler? |
| **Presence & Confidence** | Does the speaker sound in command and credible? |
| **Body Language** | Does what the audience *sees* support credibility — face, eye line, hands, framing? |
| **Audience Engagement** | Is the delivery directed outward and structured so a listener stays with it? |

**Overall = average of the four dimensions**, rounded and clamped to 1–10.
(Open question in §6: whether equal weighting is right.)

---

## 2. The 1–10 scale (shared band language)

Every dimension uses the same band meaning, so a "7" means the same thing across cards.

| Band | Label | What it means |
|---|---|---|
| **9–10** | Boardroom-ready | A strength. An executive audience would notice it positively. |
| **7–8** | Solid | Works well; minor polish would elevate it. |
| **5–6** | Mixed | Competent but inconsistent; a clear opportunity area. |
| **3–4** | Distracting | Actively undermines the message; should be a priority fix. |
| **1–2** | Blocking | Gets in the way of the audience receiving the message at all. |

---

## 3. Dimension definitions

Each dimension lists: **what it measures**, the **observable signals** behind it,
**how it's scored today**, and **band descriptors**.

### 3.1 Voice & Pacing
- **Measures:** speaking rate and freedom from filler — the two most quantifiable
  voice qualities.
- **Observable signals:** words per minute (WPM); filler rate per minute
  (`um, uh, like, you know, sort of, kind of`).
- **Current scoring:** `9 − pacePenalty − fillerPenalty`
  - Pace penalty **(unvalidated):** WPM > 175 → −3; > 165 → −2; < 105 (and > 0) → −1.5.
  - Filler penalty **(unvalidated):** >10/min → −4; >6 → −3; >3 → −2; >1 → −1.
- **Band descriptors:**
  - 9–10: ~120–150 WPM, < 1 filler/min, deliberate variation.
  - 5–6: noticeably rushed or slow, or 3–6 fillers/min.
  - 1–2: pace makes content hard to follow, or filler in nearly every sentence.
- **Known gap:** WPM and filler are proxies; they don't capture vocal *variety*
  (pitch, emphasis, volume), which TPG treats as central to voice quality.

### 3.2 Presence & Confidence
- **Measures:** whether the speaker projects command and certainty.
- **Observable signals (today):** filler rate, count of long pauses (gap ≥ 1.5s),
  and whether any visual coverage exists.
- **Current scoring:** `8 − fillerPenalty − pausePenalty − visualPenalty`
  - Pause penalty **(unvalidated):** ≥8 long pauses → −2; ≥4 → −1.
  - Visual penalty: −1 if no frames were analyzed.
- **Band descriptors:**
  - 9–10: steady cadence, pauses read as deliberate, no hedging patterns.
  - 5–6: some hesitation/dead air; authority wavers.
  - 1–2: persistent uncertainty cues; sounds like searching, not asserting.
- **Known gap (important):** today this is driven by the *same* filler/pause
  signals as Voice & Pacing, so it partly re-scores the same thing. Needs a
  signal of its own (e.g. opening strength, hedging-phrase detection, vocal
  steadiness) to be a real, independent dimension. See §6.

### 3.3 Body Language
- **Measures:** whether the visible delivery supports credibility.
- **Observable signals (now real, via vision analysis of sampled frames):**
  face present / facing camera, hand visibility, framing consistency across frames.
  *Motion is estimated across frames and is directional only.*
- **Current scoring:** `4 + 3·faceVisibleRatio + 1.5·framingConsistentRatio + 1.5·handVisibleRatio`
  (falls back to a neutral 5 when no frames could be analyzed).
- **Band descriptors:**
  - 9–10: face consistently to camera, stable framing, hands visible and purposeful.
  - 5–6: intermittent eye line / framing drift / hands often out of frame.
  - 1–2: speaker mostly off-camera or framing so unstable it can't be read.
- **Known gaps:** stills can't see gesture *quality* or movement; "low detail"
  image setting limits nuance; a confident off-camera presenter is penalized for
  setup, not delivery. Confidence here should stay labeled **directional**.

### 3.4 Audience Engagement
- **Measures:** whether delivery is outward-directed and structured for a listener.
- **Observable signals (today):** average transcript-segment length, long-pause
  count, very fast pace.
- **Current scoring:** `8 − segmentLengthPenalty − pausePenalty − (WPM > 175 ? 1 : 0)`
  - Segment penalty **(unvalidated):** avg segment > 8s → −1.5; > 6s → −1.
- **Band descriptors:**
  - 9–10: clear signposting, contrast, listener-directed phrasing.
  - 5–6: stretches feel internal or monotone; structure is implicit.
  - 1–2: rambling, no transitions, no sense of an audience.
- **Known gap (important):** there is no actual engagement signal here — it's
  inferred from segment length and pacing, which overlaps Voice & Pacing again.
  This is the weakest-grounded dimension. See §6.

---

## 4. Coaching narrative (qualitative layer)

Separate from the scores, the model writes coaching tagged into **9 categories**.
Four are always present; the rest appear when relevant.

| Always present | Conditional |
|---|---|
| delivery, clarity, confidence, pacing | fillerWords, pausing, structure, bodyLanguage, audienceEngagement |

Each coaching moment carries: timestamp, observation, why it matters, a specific
tip, and a severity (low / medium / high). These should be **consistent with the
dimension scores** — see §6.

---

## 5. Confidence & honesty rules

- Voice/transcript signals are **higher confidence** than visual signals.
- Visual findings are **directional** (sampled stills, not continuous tracking).
- When frame coverage is missing or truncated (long video past the frame ceiling),
  say so rather than scoring blind.
- Never present a proxy as a measurement (e.g. don't claim "engagement" is measured
  when it's inferred from segment length).

---

## 6. Open decisions (the reason a rubric is worth doing)

These are the choices that turn this from "scattered code" into a defensible rubric.
Flagged for discussion — **not** decided here.

1. **Score ownership: formula vs. AI.** Today the model is asked for scores but they
   are *discarded* and replaced by the deterministic formulas. So the number and the
   coaching text come from different sources and can disagree. Decide per dimension:
   formula-owned, AI-owned, or a defined blend — and make the narrative defer to it.
2. **Fix the two overlapping dimensions.** "Presence & Confidence" and "Audience
   Engagement" are largely re-derived from filler/pause/pace. Either give each a
   distinct signal or collapse the model to dimensions we can actually measure.
3. **Anchor thresholds to TPG.** Every **(unvalidated)** number above is a guess.
   Replace with TPG's canonical Dynamic Delivery criteria (WPM targets, filler
   tolerance, pause taxonomy: logical / impact / think).
4. **Weighting.** Equal-weight average, or should Voice/Body Language count more?
5. **Single source of truth.** Promote this doc into a `rubric.ts` that both
   `prompt.ts` and `report.ts` import, so criteria, thresholds, and band language
   can never drift apart again.

---

*Draft prepared for review. Pair it with TPG's official Dynamic Delivery framework
to finalize §3 thresholds and resolve §6.*
