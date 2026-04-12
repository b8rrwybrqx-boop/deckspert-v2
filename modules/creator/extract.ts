import { processArtifacts, flattenArtifactText } from "../../core/artifacts/extract.js";
import { createArtifacts } from "../../core/artifacts/upload.js";
import { callLLM } from "../../core/llm/client.js";
import {
  creatorExtractResponseSchema,
  extractedInputsSchema,
  type ExtractedInputs
} from "../../core/schemas/story.js";
import { buildSectionMap } from "../../core/story/sectionMap.js";
import { buildCreatorExtractPrompt } from "./prompts.js";

type CreatorExtractInput = {
  notes?: string;
  inputType?: string;
  meetingLengthMinutes?: number;
  minutesPerSlide?: number;
  artifacts?: unknown[];
};

function inferList(text: string, fallback: string[], maxItems = 4): string[] {
  const parts = text
    .split(/\n|\||;|\./)
    .map((item) => cleanExtractedToken(item))
    .filter((item) => item.length > 0);
  return parts.length > 0 ? parts.slice(0, maxItems) : fallback;
}

function firstSentence(text: string): string | null {
  const sentence = text
    .split(/[.!?]\s/)
    .map((part) => part.trim())
    .find((part) => part.length > 20);
  return sentence ?? null;
}

function extractMeaningfulLines(text: string): string[] {
  return normalizeSourceText(text)
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 15);
}

function inferBehavioralStyle(text: string): ExtractedInputs["audience"]["behavioralStyle"] {
  const lower = text.toLowerCase();
  if (/(vp|cfo|coo|director|executive|decision)/.test(lower)) {
    return "director";
  }
  if (/(analysis|data|proof|roi|evidence|finance)/.test(lower)) {
    return "thinker";
  }
  if (/(stakeholder|team|alignment|partner|collaboration)/.test(lower)) {
    return "relater";
  }
  if (/(vision|opportunity|innovation|future|growth story)/.test(lower)) {
    return "socializer";
  }
  return "unknown";
}

function inferRoleLevel(text: string): string | null {
  const lower = text.toLowerCase();
  if (/(ceo|president|c-suite|svp|evp)/.test(lower)) {
    return "C-suite or senior executive audience";
  }
  if (/(vp|vice president|director|executive team)/.test(lower)) {
    return "Senior leaders or business decision-makers";
  }
  if (/(manager|cross-functional|team leads)/.test(lower)) {
    return "Manager and cross-functional stakeholder audience";
  }
  return null;
}

function inferComplexity(text: string): ExtractedInputs["storyComplexity"] {
  const lower = text.toLowerCase();
  if (/(300 locations|multiple stakeholders|several markets|complex|cross-functional)/.test(lower)) {
    return "high";
  }
  if (/(simple|quick update|short discussion)/.test(lower)) {
    return "low";
  }
  return "medium";
}

function normalizeSourceText(text: string): string {
  return text.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
}

const properPrepLabels = [
  "Audience",
  "Behavioral Style",
  "Position",
  "Type of Need",
  "Specific Need",
  "Addressed by Desired Outcome? (Y or N)",
  "Core(Dept/Category) Needs",
  "Core (Dept/Category) Needs",
  "Core Needs",
  "Business Needs",
  "Personal Needs",
  "Desired Outcome",
  "Desired Outcome?",
  "Reasons to Say Yes",
  "Reasons to Say Yes (specific need(s) it addresses)",
  "Reasons to Say No",
  "Reasons to Say No (objections)",
  "Likely Objections"
];

function normalizeProperPrepDelimiters(text: string): string {
  let normalized = normalizeSourceText(text);
  const labelsByLength = [...properPrepLabels].sort((left, right) => right.length - left.length);
  for (const label of labelsByLength) {
    const escaped = escapeRegex(label);
    normalized = normalized.replace(new RegExp(`(?<![|\\n])\\s*${escaped}`, "gi"), (match) => ` | ${match.trim()}`);
  }
  return normalized.replace(/\s*\|\s*/g, " | ").trim();
}

function cleanExtractedToken(text: string): string {
  return text
    .replace(/^[-*]\s*/, "")
    .replace(/^\|+\s*/, "")
    .replace(/\s*\|+$/, "")
    .replace(/^©\d{4}.*$/i, "")
    .replace(/^proper preparation planning worksheet$/i, "")
    .replace(/^type of need$/i, "")
    .replace(/^specific need$/i, "")
    .replace(/^addressed by desired outcome\??\s*\(y\s*or\s*n\)$/i, "")
    .replace(/^behavioral style$/i, "")
    .replace(/^position$/i, "")
    .replace(/^audience$/i, "")
    .replace(/^reasons to say yes.*$/i, "")
    .replace(/^reasons to say no.*$/i, "")
    .replace(/^desired outcome.*$/i, "")
    .replace(/^\(specific need\(s\) it addresses\)\s*/i, "")
    .replace(/^\(objections\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[YN]$/i, "")
    .replace(/\s*\|\s*$/g, "");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDelimitedField(text: string, labels: string[], stopLabels: string[]): string | null {
  const normalized = normalizeProperPrepDelimiters(text);
  const labelPattern = [...labels].sort((left, right) => right.length - left.length).map(escapeRegex).join("|");
  const stopPattern = [...stopLabels].sort((left, right) => right.length - left.length).map(escapeRegex).join("|");
  const regex = new RegExp(
    `(?:^|\\|)\\s*(?:${labelPattern})\\s*:?\\s*(.*?)\\s*(?=(?:\\|\\s*(?:${stopPattern})\\s*:?)|$)`,
    "i"
  );
  const match = normalized.match(regex);
  const value = cleanExtractedToken(match?.[1] ?? "");
  return value ? value : null;
}

function findFieldValue(text: string, labels: string[]): string | null {
  const lines = normalizeSourceText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const label of labels) {
      const matcher = new RegExp(`^${label}\\s*:?\\s*(.*)$`, "i");
      const match = line.match(matcher);
      if (!match) {
        continue;
      }

      const inlineValue = match[1]?.trim();
      if (inlineValue) {
        return inlineValue;
      }

      const nextLine = lines[index + 1]?.trim();
      if (nextLine && !labels.some((candidate) => new RegExp(`^${candidate}\\s*:`, "i").test(nextLine))) {
        return nextLine;
      }
    }
  }
  return null;
}

function extractSectionItems(text: string, sectionHeaders: string[], stopHeaders: string[]): string[] {
  const lines = normalizeSourceText(text).split("\n");
  const startIndex = lines.findIndex((line) =>
    sectionHeaders.some((header) => line.toLowerCase().includes(header.toLowerCase()))
  );

  if (startIndex === -1) {
    return [];
  }

  const items: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    if (stopHeaders.some((header) => line.toLowerCase().includes(header.toLowerCase()))) {
      break;
    }

    const cleaned = line
      .replace(/^[•\-\d.)]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned && !/^yes$|^no$/i.test(cleaned)) {
      items.push(cleaned);
    }
  }

  return items;
}

function inferProperPrepStructure(text: string) {
  const source = normalizeProperPrepDelimiters(text);
  const lower = source.toLowerCase();
  const looksLikeProperPrep =
    lower.includes("proper preparation") ||
    lower.includes("planning worksheet") ||
    (lower.includes("desired outcome") && lower.includes("reasons to say yes") && lower.includes("reasons to say no"));

  if (!looksLikeProperPrep) {
    return null;
  }

  const audience =
    findDelimitedField(source, ["Audience", "Position"], ["Behavioral Style", "Type of Need", "Specific Need", "Core(Dept/Category) Needs", "Core Needs"]) ??
    findFieldValue(source, ["audience", "position"]);
  const roleLevel = audience ?? inferRoleLevel(source);
  const style =
    (["director", "thinker", "relater", "socializer"].find((candidate) => lower.includes(candidate)) as
      | ExtractedInputs["audience"]["behavioralStyle"]
      | undefined) ?? inferBehavioralStyle(source);

  const coreNeedsDelimited = findDelimitedField(
    source,
    ["Core(Dept/Category) Needs", "Core (Dept/Category) Needs", "Core Needs"],
    ["Business Needs", "Personal Needs", "Desired Outcome", "Desired Outcome?", "Reasons to Say Yes", "Reasons to Say Yes (specific need(s) it addresses)", "Reasons to Say No", "Reasons to Say No (objections)"]
  );
  const businessNeedsDelimited = findDelimitedField(
    source,
    ["Business Needs"],
    ["Personal Needs", "Desired Outcome", "Desired Outcome?", "Reasons to Say Yes", "Reasons to Say Yes (specific need(s) it addresses)", "Reasons to Say No", "Reasons to Say No (objections)"]
  );
  const personalNeedsDelimited = findDelimitedField(
    source,
    ["Personal Needs"],
    ["Desired Outcome", "Desired Outcome?", "Reasons to Say Yes", "Reasons to Say Yes (specific need(s) it addresses)", "Reasons to Say No", "Reasons to Say No (objections)"]
  );
  const desiredOutcomeDelimited = findDelimitedField(
    source,
    ["Desired Outcome", "Desired Outcome?"],
    ["Reasons to Say Yes", "Reasons to Say Yes (specific need(s) it addresses)", "Reasons to Say No", "Reasons to Say No (objections)", "Core(Dept/Category) Needs", "Business Needs", "Personal Needs"]
  );
  const reasonsYesDelimited = findDelimitedField(
    source,
    ["Reasons to Say Yes", "Reasons to Say Yes (specific need(s) it addresses)"],
    ["Reasons to Say No", "Reasons to Say No (objections)", "Desired Outcome", "Core(Dept/Category) Needs", "Business Needs", "Personal Needs"]
  );
  const reasonsNoDelimited = findDelimitedField(
    source,
    ["Reasons to Say No", "Reasons to Say No (objections)", "Likely Objections"],
    ["Desired Outcome", "Reasons to Say Yes", "Reasons to Say Yes (specific need(s) it addresses)", "Core(Dept/Category) Needs", "Business Needs", "Personal Needs"]
  );

  const coreNeeds =
    (coreNeedsDelimited ? inferList(coreNeedsDelimited, [], 4) : []).length > 0
      ? inferList(coreNeedsDelimited ?? "", [], 4)
      : extractSectionItems(
          source,
          ["core (dept/category) needs", "core needs"],
          ["business needs", "personal needs", "desired outcome"]
        );
  const businessNeeds =
    (businessNeedsDelimited ? inferList(businessNeedsDelimited, [], 4) : []).length > 0
      ? inferList(businessNeedsDelimited ?? "", [], 4)
      : extractSectionItems(
          source,
          ["business needs"],
          ["personal needs", "desired outcome", "reasons to say yes"]
        );
  const personalNeeds =
    (personalNeedsDelimited ? inferList(personalNeedsDelimited, [], 4) : []).length > 0
      ? inferList(personalNeedsDelimited ?? "", [], 4)
      : extractSectionItems(
          source,
          ["personal needs"],
          ["desired outcome", "reasons to say yes", "reasons to say no"]
        );
  const desiredOutcome =
    desiredOutcomeDelimited ??
    extractSectionItems(source, ["desired outcome"], ["reasons to say yes", "reasons to say no"]).join(" ");
  const reasonsYes =
    (reasonsYesDelimited ? inferList(reasonsYesDelimited, [], 4) : []).length > 0
      ? inferList(reasonsYesDelimited ?? "", [], 4)
      : extractSectionItems(source, ["reasons to say yes"], ["reasons to say no"]);
  const reasonsNo =
    (reasonsNoDelimited ? inferList(reasonsNoDelimited, [], 4) : []).length > 0
      ? inferList(reasonsNoDelimited ?? "", [], 4)
      : extractSectionItems(source, ["reasons to say no"], []);

  return {
    audience: {
      roleLevel,
      behavioralStyle: style,
      behavioralStyleRationale: "Mapped from the Proper Preparation worksheet fields and checked behavioral style.",
      assumptions: ["Proper Preparation worksheet was used as the primary planning source."]
    },
    needs: {
      core: coreNeeds,
      business: businessNeeds,
      personal: personalNeeds
    },
    desiredOutcome: desiredOutcome || null,
    reasonsYes,
    reasonsNo
  };
}

function inferArtifactsUsed(
  artifacts: Awaited<ReturnType<typeof processArtifacts>>
): Array<{
  artifactId?: string;
  label: string;
  kind: "image" | "pdf" | "pptx" | "doc" | "text" | "video";
  sourceType?: "extractedText" | "visionSummary";
  notes?: string;
}> {
  return artifacts
    .filter((artifact) => artifact.extractedText || artifact.visionSummary)
    .map((artifact) => ({
      artifactId: artifact.id,
      label: artifact.label,
      kind: artifact.kind,
      sourceType: artifact.extractedText ? "extractedText" : "visionSummary",
      notes: artifact.extractedText
        ? `Used extracted text from ${artifact.label}.`
        : `Used visual summary from ${artifact.label}.`
    }));
}

function heuristicExtraction(
  fullText: string,
  meetingLengthMinutes: number,
  minutesPerSlide: number
): ExtractedInputs {
  const properPrep = inferProperPrepStructure(fullText);
  const behavioralStyle = inferBehavioralStyle(fullText);
  const roleLevel = inferRoleLevel(fullText);
  const lines = extractMeaningfulLines(fullText);
  const firstLine = lines[0];
  const secondLine = lines[1];
  const commercialImplicationLine = lines.find((line) => /commercial implication|positions the company|opens the door/i.test(line));
  const currentStateLine = lines.find((line) => /current|today|fragmented|cluttered|limits|shopper/i.test(line));
  const actionLines = lines.filter((line) => /^(reframe|fix|leverage|use|build|organize|shift|turn|position)/i.test(line));
  const businessSignals = lines.filter((line) => /growth|basket|traffic|category|platform|spend|trip|partner|omnichannel/i.test(line));
  const desiredOutcomeLine = lines.find((line) => /opportunity is|commercial implication|positions the company|unlock|increase|expand|grow/i.test(line));
  const objectionLines = lines.filter((line) => /risk|limits|cluttered|fragmented|checklist-driven|barrier|prevent|not /i.test(line));
  const audienceSignals = lines.filter((line) => /walmart|newell|merchant|buyer|category manager|shopper/i.test(line));
  const roleSignal = audienceSignals[0] ?? roleLevel;
  const rootCauseLine = lines.find((line) =>
    /because|limits|fragmented|cluttered|checklist-driven|barrier|prevent|current merchandising/i.test(line)
  );
  const firstInsight = firstLine ?? firstSentence(fullText);
  const firstAction = actionLines[0] ?? firstInsight;
  const reasonsYes = properPrep?.reasonsYes.length
    ? properPrep.reasonsYes
    : businessSignals.length
      ? businessSignals.slice(0, 4)
      : [
          "The strategy expands the category into higher-frequency shopper missions.",
          "The approach can increase basket size and cross-category attachment.",
          "The recommendation positions the partner as a broader category leader."
        ];
  const reasonsNo = properPrep?.reasonsNo.length
    ? properPrep.reasonsNo
    : objectionLines.length
      ? objectionLines.slice(0, 4)
      : ["Execution complexity", "Insufficient proof or quantification", "Competing priorities"];

  return extractedInputsSchema.parse({
    audience:
      properPrep?.audience ?? {
        roleLevel: roleSignal || roleLevel,
        behavioralStyle,
        behavioralStyleRationale:
          behavioralStyle === "unknown"
            ? "The source material does not make the decision style explicit yet."
            : "Inferred from the audience language, decision stakes, and proof burden in the source material.",
        assumptions: inferList(fullText, ["Primary audience needs a commercially persuasive, low-risk recommendation."], 3)
      },
    needs:
      properPrep?.needs ?? {
        core: businessSignals.length ? businessSignals.slice(0, 3) : inferList(fullText, ["Clarity on the decision", "Confidence in the story logic"], 3),
        business: businessSignals.length ? businessSignals.slice(0, 3) : inferList(fullText, ["Growth impact", "Confidence that the plan will work"], 3),
        personal: ["Reduce decision risk", "Make the recommendation easy to support"]
      },
    desiredOutcome:
      properPrep?.desiredOutcome ??
      desiredOutcomeLine ??
      commercialImplicationLine ??
      (firstAction
        ? `Gain alignment behind this direction: ${firstAction}`
        : "Secure alignment on the recommended direction and next step."),
    reasonsYes,
    reasonsNo,
    situation:
      currentStateLine ??
      secondLine ??
      firstInsight ??
      (fullText.slice(0, 320) || "The current situation is not yet clearly framed."),
    rootCause:
      rootCauseLine ??
      "The underlying barrier has not yet been translated into a clean belief shift and action path.",
    draftBigIdea:
      firstAction ??
      "To unlock the opportunity, the audience must accept a clear belief about what needs to change and why it will work.",
    proofPoints: businessSignals.length ? businessSignals.slice(0, 5) : inferList(fullText, ["Evidence point to validate", "Operational proof point", "Business impact proof point"], 5),
    actions: actionLines.length ? actionLines.slice(0, 4) : ["Confirm the decision", "Align on the recommendation", "Define the next step and owner"],
    constraints: ["Keep the story executive-ready", "Make the recommendation feel low-risk"],
    metrics: inferList(fullText, ["Growth", "Conversion", "Profitability"], 4),
    meetingLengthMinutes,
    minutesPerSlide,
    storyComplexity: inferComplexity(fullText)
  });
}

function mergeExtractedInputs(primary: ExtractedInputs, fallback: ExtractedInputs): ExtractedInputs {
  return extractedInputsSchema.parse({
    audience: {
      roleLevel: fallback.audience.roleLevel || primary.audience.roleLevel,
      behavioralStyle:
        fallback.audience.behavioralStyle !== "unknown" ? fallback.audience.behavioralStyle : primary.audience.behavioralStyle,
      behavioralStyleRationale: fallback.audience.behavioralStyleRationale || primary.audience.behavioralStyleRationale,
      assumptions: fallback.audience.assumptions.length ? fallback.audience.assumptions : primary.audience.assumptions
    },
    needs: {
      core: fallback.needs.core.length ? fallback.needs.core : primary.needs.core,
      business: fallback.needs.business.length ? fallback.needs.business : primary.needs.business,
      personal: fallback.needs.personal.length ? fallback.needs.personal : primary.needs.personal
    },
    desiredOutcome: fallback.desiredOutcome || primary.desiredOutcome,
    reasonsYes: fallback.reasonsYes.length ? fallback.reasonsYes : primary.reasonsYes,
    reasonsNo: fallback.reasonsNo.length ? fallback.reasonsNo : primary.reasonsNo,
    situation: primary.situation || fallback.situation,
    rootCause: primary.rootCause || fallback.rootCause,
    draftBigIdea: primary.draftBigIdea || fallback.draftBigIdea,
    proofPoints: primary.proofPoints.length ? primary.proofPoints : fallback.proofPoints,
    actions: primary.actions.length ? primary.actions : fallback.actions,
    constraints: primary.constraints.length ? primary.constraints : fallback.constraints,
    metrics: primary.metrics.length ? primary.metrics : fallback.metrics,
    meetingLengthMinutes: primary.meetingLengthMinutes || fallback.meetingLengthMinutes,
    minutesPerSlide: primary.minutesPerSlide || fallback.minutesPerSlide,
    storyComplexity: primary.storyComplexity || fallback.storyComplexity
  });
}

function isWeakExtraction(extractedInputs: ExtractedInputs): boolean {
  const populatedFields = [
    extractedInputs.audience.roleLevel,
    extractedInputs.desiredOutcome,
    extractedInputs.situation,
    extractedInputs.rootCause,
    extractedInputs.draftBigIdea
  ].filter((value) => value && value.trim().length > 0).length;

  const listSignal =
    extractedInputs.needs.core.length +
    extractedInputs.needs.business.length +
    extractedInputs.needs.personal.length +
    extractedInputs.reasonsYes.length +
    extractedInputs.actions.length;

  return populatedFields < 3 || listSignal < 4;
}

export async function runCreatorExtract(input: CreatorExtractInput) {
  const meetingLengthMinutes = Math.max(10, input.meetingLengthMinutes ?? 45);
  const minutesPerSlide = Math.max(2, input.minutesPerSlide ?? 4);
  const uploadedArtifacts = createArtifacts(input.artifacts ?? []);
  const artifacts = await processArtifacts(uploadedArtifacts);
  const fullText = [input.notes ?? "", flattenArtifactText(artifacts)].filter(Boolean).join("\n\n");
  const extractedInputs = heuristicExtraction(fullText, meetingLengthMinutes, minutesPerSlide);
  const sectionMapProposal = buildSectionMap(extractedInputs);
  const artifactsUsed = inferArtifactsUsed(artifacts);
  const properPrepDetected = Boolean(inferProperPrepStructure(fullText));
  const gaps = fullText
    ? [
        "Specific proof or data that quantifies the opportunity.",
        "Known audience objections or risks that may need to be neutralized.",
        "The clearest concrete next step after agreement.",
        ...(properPrepDetected ? [] : ["If you have a Proper Preparation worksheet, upload it or paste its contents to improve field-level extraction."])
      ]
    : ["Missing user notes or document text for richer extraction."];

  const prompt = buildCreatorExtractPrompt({
    notes: [input.inputType ? `Input type: ${input.inputType}` : "", fullText].filter(Boolean).join("\n"),
    artifacts,
    meetingLengthMinutes,
    minutesPerSlide
  });

  try {
    const llmResult = await callLLM(prompt, {
      schema: creatorExtractResponseSchema,
      fallback: () => ({
        creatorVersion: "v2" as const,
        extractedInputs,
        sectionMapProposal,
        gaps,
        artifactsUsed
      })
    });

    const normalizedLlmInputs = extractedInputsSchema.parse(llmResult.extractedInputs);
    const mergedInputs = mergeExtractedInputs(normalizedLlmInputs, extractedInputs);
    const mergedSectionMap = isWeakExtraction(normalizedLlmInputs)
      ? sectionMapProposal
      : llmResult.sectionMapProposal;

    return creatorExtractResponseSchema.parse({
      ...llmResult,
      extractedInputs: mergedInputs,
      sectionMapProposal: mergedSectionMap,
      gaps: llmResult.gaps.length ? llmResult.gaps : gaps,
      artifactsUsed: llmResult.artifactsUsed?.length ? llmResult.artifactsUsed : artifactsUsed
    });
  } catch (error) {
    console.warn("[Deckspert][Creator][Extract] Falling back to local extraction output", {
      error: error instanceof Error ? error.message : error
    });
    return creatorExtractResponseSchema.parse({
      creatorVersion: "v2",
      extractedInputs,
      sectionMapProposal,
      gaps,
      artifactsUsed
    });
  }
}
