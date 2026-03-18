import test from "node:test";
import assert from "node:assert/strict";

import { mergeTranscriptSegments } from "@/lib/transcription/merge";

test("mergeTranscriptSegments combines adjacent same-speaker segments", () => {
  const merged = mergeTranscriptSegments([
    { startSec: 0, endSec: 1.2, text: "Hello", speaker: null, confidence: 0.9 },
    { startSec: 1.3, endSec: 2.4, text: "there", speaker: null, confidence: 0.8 },
    { startSec: 4, endSec: 5, text: "Next point", speaker: null, confidence: 0.85 }
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, "Hello there");
});
