import { useEffect, useState } from "react";

// Something worth reading while an evaluation or a deck build runs. These calls
// take one to two minutes, long enough that a static "Working…" reads as a hang.
//
// Copy is TPG's, supplied 2026-09-30. Keep each line short enough to take in at
// a glance: a fact that needs more than the rotation interval to read is one
// the attendee never finishes.

export type WaitingFact = { header: string; body: string };

export const WAITING_FACTS: readonly WaitingFact[] = [
  { header: "Did you know?", body: "Stories can activate 7 brain regions. Facts & figures? Just 2." },
  { header: "Executive rule", body: "Lead with the answer. Everything after that is proof." },
  { header: "30-second test", body: "If it isn’t clear in 30 seconds, your thinking isn’t finished." },
  { header: "Power move", body: "Build 3 versions: Full. 2 minutes. 30 seconds." },
  { header: "Remember this", body: "Executives don’t need more data. They need you to make a stand." },
  { header: "Watch your words", body: "“I think.” “Probably.” “Sort of.” Hedging weakens your recommendation." },
  { header: "Fun fact", body: "We make decisions with emotion—then justify them with logic." },
  { header: "Executive presence", body: "It’s not charisma. It’s clear thinking made visible." },
  { header: "Quick tip", body: "Your slide title should say what the slide SAYS, not what it IS." },
  { header: "The clock is ticking", body: "By slide 8, your executive may already be checking email." },
  { header: "Less is more", body: "More words don’t equal more confidence. Usually, the opposite." },
  { header: "Make them feel", body: "Trust. Confidence. FOMO. Emotion helps move an audience to action." },
  { header: "Slide speed", body: "Great slides communicate their core message fast." },
  { header: "Don’t do this", body: "“Today I’m going to walk you through…” Get to the point." },
  { header: "Pressure test", body: "You don’t rise to the occasion. You fall to your level of preparation." },
  { header: "Your body talks", body: "Posture is a powerful cue for signaling confidence." },
  { header: "Don’t read it", body: "Turn to read your slide and you can lose the room." },
  { header: "The 10–20–30 rule", body: "10 slides. 20 minutes. 30-point font." },
  { header: "The 1–6–6 rule", body: "1 idea. 6 bullets. 6 words per bullet." },
  { header: "Don’t data-dump", body: "Explore the data yourself. Explain the insight to your audience." },
  { header: "Executive mindset", body: "Your goal isn’t to share information. It’s to drive a decision." },
  { header: "Good nerves?", body: "Nerves don’t disappear with seniority. Repetition changes the response." },
  { header: "Own the room", body: "Stop apologizing for taking their time. You belong there." },
  { header: "One is enough", body: "In a 60-second story: one proof, not three." },
  { header: "Finish strong", body: "Make the ask. Stop hedging. Then stop talking." }
];

const ROTATE_MS = 10_000;

/**
 * A fresh order per wait, so someone running prep, then storyboard, then the
 * deck does not see the same opening fact three times in a row.
 */
function shuffledOrder(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Rotates a fact every ten seconds for as long as it is mounted. Mount it only
 * while the work is running; unmounting stops the timers.
 *
 * `expectedSeconds` sets the attendee's expectation up front ("usually about
 * 1:05"), which does more for a long wait than any spinner.
 */
export function WaitingFacts({ expectedSeconds }: { expectedSeconds?: number }) {
  const [order] = useState(() => shuffledOrder(WAITING_FACTS.length));
  const [position, setPosition] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const rotate = window.setInterval(() => setPosition((p) => (p + 1) % WAITING_FACTS.length), ROTATE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(rotate);
    };
  }, []);

  const fact = WAITING_FACTS[order[position]];

  return (
    <div className="waiting-facts">
      <div className="waiting-facts-fact" key={position} aria-live="polite">
        <p className="waiting-facts-header">{fact.header}</p>
        <p className="waiting-facts-body">{fact.body}</p>
      </div>
      <p className="waiting-facts-timer">
        {formatDuration(elapsed)}
        {expectedSeconds ? ` · usually about ${formatDuration(expectedSeconds)}` : null}
      </p>
    </div>
  );
}
