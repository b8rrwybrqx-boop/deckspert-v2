// Per-cohort program configuration.
//
// Deckspert's session tools are taught alongside a client's own workshop deck,
// and the words on the screen have to match the words on the slide. Rather than
// forking a page or a prompt per client, a program profile carries everything
// that varies: which tools appear, which worksheet boxes are scored, what each
// box is called, and any doctrine specific to that program.
//
// Profiles are resolved server-side from the cohort code (see
// api/_sessionGuard.ts). A client never chooses its own profile.

/** Stepper tools a program can switch on. */
export type SessionToolKey = "prep" | "storyboard" | "presentation" | "deck" | "drill";

/**
 * One scored box on a worksheet.
 *
 * `criteria` is prompt text: it is interpolated into the evaluator instructions
 * as the definition of what that box must do, so it should read as guidance to
 * a coach, not as UI copy.
 */
export type SectionDefinition = {
  key: string;
  label: string;
  criteria: string;
  /**
   * False for checkbox-style fields that are present or absent rather than good
   * or bad (Behavioral Style is the only one today). A false here makes `score`
   * null for that section, which the result UI already renders as "n/a".
   */
  scored: boolean;
};

export type EvaluatorProfile = {
  sections: SectionDefinition[];
  /** Tells the model what this stage is NOT, so it stops penalizing absent later-stage work. */
  scopeNote: string;
  /** Thresholds for strong / mixed / needs work, named in terms of this program's own sections. */
  overallReadCalibration: string;
  /**
   * Cross-section checks reported but never scored. Todd's EPS rubric calls
   * these "the four connections"; they are where most of the useful coaching
   * lands, and scoring them would double-count the sections they span.
   */
  connections?: string[];
};

export type ProgramProfile = {
  id: string;
  /** Shown to attendees, so it should be the client's own name for the program. */
  label: string;
  tools: SessionToolKey[];
  /**
   * Shapes the Opening Gambit, the Recommendation and the Ask. "inform" means
   * reporting on work already done, where the yes being sought is adoption;
   * "persuasive" means asking for a decision that has not been made yet.
   */
  narrativeMode: "inform" | "persuasive";
  prep: EvaluatorProfile;
  storyboard: EvaluatorProfile;
  /** Named recommendation types, when the program teaches a fixed set. */
  recommendationTypes?: string[];
  /** Program-specific prompt text, appended after the shared writing doctrine. */
  doctrineAddendum?: string;
  /** Per-tool stepper copy; falls back to the default labels when absent. */
  steps?: Partial<Record<SessionToolKey, { label: string; blurb: string }>>;
};

/**
 * The subset safe to hand the browser. Deliberately excludes criteria,
 * calibration and doctrine: those are prompt text with no use client-side, and
 * shipping them would put the evaluator's grading rules in the page bundle.
 */
export type PublicProgramProfile = {
  id: string;
  label: string;
  tools: SessionToolKey[];
  narrativeMode: "inform" | "persuasive";
  steps?: ProgramProfile["steps"];
};

export function toPublicProfile(profile: ProgramProfile): PublicProgramProfile {
  return {
    id: profile.id,
    label: profile.label,
    tools: profile.tools,
    narrativeMode: profile.narrativeMode,
    steps: profile.steps
  };
}
