// Anchor words for a scored box, per Todd: 5 Strong, 4 Sufficient,
// 3 Needs improvement, 2 Weak, 1 Missing (or Weak, if something is there).
// The model's status lumps 4-5 as "present" and 2-3 as "weak", so a scored box
// takes its word from the score. Shared by the results page and the result
// email so both say the same thing.

export type SectionStatus = "present" | "weak" | "missing" | "unclear" | "notYet" | "toComplete";

const SCORE_WORDS: Record<number, string> = {
  5: "Strong",
  4: "Sufficient",
  3: "Needs improvement",
  2: "Weak"
};

const STATUS_WORDS: Record<SectionStatus, string> = {
  present: "Present",
  weak: "Weak",
  missing: "Missing",
  unclear: "Unclear",
  notYet: "Not yet",
  toComplete: "To be completed"
};

export function statusLabel({ status, score }: { status: SectionStatus; score: number | null | undefined }): string {
  if (status === "unclear" || status === "notYet" || status === "toComplete" || score == null) return STATUS_WORDS[status];
  if (score === 1) return status === "missing" ? "Missing" : "Weak";
  return SCORE_WORDS[score] ?? STATUS_WORDS[status];
}
