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

const properPrepBoilerplatePattern =
  /^(©\d{4}\s+the partnering group, inc\.?|[12]\.\s+(proper preparation|structured storyboard) planning worksheet|audience:?|behavioral style:?|position:?|type of need(?:specific need)?|addressed by desired outcome\? \(?y or n\)?|desired outcome(?:reasons to say yes.*)?|reasons to say yes.*|reasons to say no.*)$/i;

function isBoilerplateText(value: string | null | undefined): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return (
    !normalized ||
    properPrepBoilerplatePattern.test(normalized) ||
    /^(yes|no|y|n)$/i.test(normalized) ||
    /^audience:\s*$/i.test(normalized)
  );
}

function sanitizeItems(items: string[], maxItems = items.length): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  items.forEach((item) => {
    const normalized = item.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (!normalized || isBoilerplateText(normalized) || seen.has(key)) {
      return;
    }
    seen.add(key);
    cleaned.push(normalized);
  });

  return cleaned.slice(0, maxItems);
}

function toSentenceFragment(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
}

function buildProperPrepSituation(properPrep: NonNullable<ReturnType<typeof inferProperPrepStructure>>): string | null {
  const needs = sanitizeItems([
    ...properPrep.needs.core.slice(0, 1),
    ...properPrep.needs.business.slice(0, 1),
    ...properPrep.needs.personal.slice(0, 1)
  ]);

  if (!needs.length) {
    return null;
  }

  return `The audience is weighing how to ${needs.map((item) => toSentenceFragment(item).toLowerCase()).join(", while also ")}.`;
}

function buildProperPrepRootCause(properPrep: NonNullable<ReturnType<typeof inferProperPrepStructure>>): string | null {
  const objections = sanitizeItems(properPrep.reasonsNo, 2);
  if (!objections.length) {
    return null;
  }

  return `Approval may stall unless the story addresses why ${objections
    .map((item) => toSentenceFragment(item).toLowerCase())
    .join(" and ")}`;
}

function buildProperPrepBigIdea(properPrep: NonNullable<ReturnType<typeof inferProperPrepStructure>>): string | null {
  const desiredOutcome = properPrep.desiredOutcome ? toSentenceFragment(properPrep.desiredOutcome) : null;
  const support = sanitizeItems(
    [...properPrep.reasonsYes.slice(0, 1), ...properPrep.needs.core.slice(0, 1), ...properPrep.needs.business.slice(0, 1)],
    2
  );

  if (!desiredOutcome && !support.length) {
    return null;
  }

  if (!desiredOutcome) {
    return `The strongest case is that ${support.map((item) => toSentenceFragment(item).toLowerCase()).join(" while ")}`;
  }

  if (!support.length) {
    return `To achieve ${desiredOutcome.toLowerCase()}, the audience must believe this direction is practical and worth approving.`;
  }

  return `To achieve ${desiredOutcome.toLowerCase()}, we need to show that ${support
    .map((item) => toSentenceFragment(item).toLowerCase())
    .join(" and ")}`;
}

function buildProperPrepWiifm(properPrep: NonNullable<ReturnType<typeof inferProperPrepStructure>>): string | null {
  const value = sanitizeItems([
    ...properPrep.reasonsYes.slice(0, 2),
    ...properPrep.needs.business.slice(0, 1),
    ...properPrep.needs.personal.slice(0, 1)
  ]);

  if (!value.length) {
    return null;
  }

  return `Saying yes creates ${value.map((item) => toSentenceFragment(item).toLowerCase()).join(" and ")}.`;
}

function inferList(text: string, fallback: string[], maxItems = 4): string[] {
  const parts = text
    .split(/\n|;|\./)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
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

function getNormalizedLines(text: string): string[] {
  return normalizeSourceText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

function inferExplicitBehavioralStyle(lines: string[]): ExtractedInputs["audience"]["behavioralStyle"] {
  const candidates: Array<{
    label: ExtractedInputs["audience"]["behavioralStyle"];
    pattern: RegExp;
  }> = [
    { label: "thinker", pattern: /(?:☒|☑|✅|✓|■)\s*thinker|thinker\s*(?:☒|☑|✅|✓|■)/i },
    { label: "director", pattern: /(?:☒|☑|✅|✓|■)\s*director|director\s*(?:☒|☑|✅|✓|■)/i },
    { label: "socializer", pattern: /(?:☒|☑|✅|✓|■)\s*socializer|socializer\s*(?:☒|☑|✅|✓|■)/i },
    { label: "relater", pattern: /(?:☒|☑|✅|✓|■)\s*relater|relater\s*(?:☒|☑|✅|✓|■)/i }
  ];

  const matched = candidates.find(({ pattern }) => lines.some((line) => pattern.test(line)));
  return matched?.label ?? "unknown";
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

function collectWrappedItems(lines: string[], startIndex: number, stopHeaders: RegExp[]): string[] {
  if (startIndex === -1) {
    return [];
  }

  const items: string[] = [];
  let current = "";

  const flush = () => {
    const cleaned = current.trim();
    if (cleaned) {
      items.push(cleaned);
    }
    current = "";
  };

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (stopHeaders.some((pattern) => pattern.test(line))) {
      flush();
      break;
    }

    if (/^[YN]$/i.test(line)) {
      flush();
      continue;
    }

    if (/^•/.test(line)) {
      flush();
      current = line.replace(/^•\s*/, "").trim();
      continue;
    }

    if (!current && line) {
      current = line;
      continue;
    }

    if (current) {
      current = `${current} ${line}`.trim();
    }
  }

  flush();
  return items;
}

function parseProperPrepNeeds(lines: string[]) {
  const coreStart = lines.findIndex((line) => /^core\s*(\(dept\/category\))?\s*needs$/i.test(line));
  const businessStart = lines.findIndex((line) => /^business needs$/i.test(line));
  const personalStart = lines.findIndex((line) => /^personal needs$/i.test(line));

  return {
    core: collectWrappedItems(lines, coreStart, [/^business needs$/i, /^personal needs$/i, /^desired outcome/i]),
    business: collectWrappedItems(lines, businessStart, [/^personal needs$/i, /^desired outcome/i]),
    personal: collectWrappedItems(lines, personalStart, [/^desired outcome/i])
  };
}

function parseProperPrepOutcome(lines: string[]) {
  const outcomeHeaderIndex = lines.findIndex((line) =>
    /^desired outcome.*reasons to say yes.*reasons to say no/i.test(line)
  );

  if (outcomeHeaderIndex === -1) {
    return {
      desiredOutcome: null as string | null,
      reasonsYes: [] as string[],
      reasonsNo: [] as string[]
    };
  }

  const bullets = collectWrappedItems(lines, outcomeHeaderIndex, []);
  const objectionStart = bullets.findIndex((item, index) =>
    index > 0 &&
    /(commoditized|may not|poor previous|extra time|human resources|reformulation|labels)/i.test(item)
  );
  const preObjectionBullets = objectionStart === -1 ? bullets : bullets.slice(0, objectionStart);
  const reasonsYesStart = preObjectionBullets.findIndex((item, index) =>
    index > 0 &&
    /(adds value|enables|broader access|resources|capabilities|benefit|benefits|supports|allows|improves|reduces)/i.test(
      item
    )
  );
  const outcomeEnd =
    reasonsYesStart !== -1 ? reasonsYesStart : preObjectionBullets.length > 3 ? 3 : preObjectionBullets.length;

  return {
    desiredOutcome: preObjectionBullets.slice(0, outcomeEnd).join(" "),
    reasonsYes: preObjectionBullets.slice(outcomeEnd),
    reasonsNo: objectionStart === -1 ? [] : bullets.slice(objectionStart)
  };
}

function inferProperPrepStructure(text: string) {
  const source = normalizeSourceText(text);
  const lower = source.toLowerCase();
  const lines = getNormalizedLines(text);
  const looksLikeProperPrep =
    lower.includes("proper preparation") ||
    lower.includes("planning worksheet") ||
    (lower.includes("desired outcome") && lower.includes("reasons to say yes") && lower.includes("reasons to say no"));

  if (!looksLikeProperPrep) {
    return null;
  }

  const roleLevel = findFieldValue(source, ["audience"]) ?? inferRoleLevel(source);
  const explicitStyle = inferExplicitBehavioralStyle(lines);
  const styleLabelsPresent = ["director", "thinker", "relater", "socializer"].filter((candidate) => lower.includes(candidate)).length;
  const style = explicitStyle !== "unknown" ? explicitStyle : styleLabelsPresent >= 3 ? "unknown" : inferBehavioralStyle(source);
  const needs = parseProperPrepNeeds(lines);
  const outcome = parseProperPrepOutcome(lines);

  const coreNeeds =
    needs.core.length > 0
      ? needs.core
      : extractSectionItems(
          source,
          ["core (dept/category) needs", "core needs"],
          ["business needs", "personal needs", "desired outcome"]
        );
  const businessNeeds =
    needs.business.length > 0
      ? needs.business
      : extractSectionItems(
          source,
          ["business needs"],
          ["personal needs", "desired outcome", "reasons to say yes"]
        );
  const personalNeeds =
    needs.personal.length > 0
      ? needs.personal
      : extractSectionItems(
          source,
          ["personal needs"],
          ["desired outcome", "reasons to say yes", "reasons to say no"]
        );
  const desiredOutcome =
    outcome.desiredOutcome ??
    extractSectionItems(source, ["desired outcome"], ["reasons to say yes", "reasons to say no"]).join(" ");
  const reasonsYes =
    outcome.reasonsYes.length > 0
      ? outcome.reasonsYes
      : extractSectionItems(source, ["reasons to say yes"], ["reasons to say no"]);
  const reasonsNo =
    outcome.reasonsNo.length > 0
      ? outcome.reasonsNo
      : extractSectionItems(source, ["reasons to say no"], []);

  return {
    audience: {
      roleLevel,
      behavioralStyle: style,
      behavioralStyleRationale:
        style === "unknown"
          ? "Proper Preparation worksheet detected, but the checked behavioral style was not reliably encoded in extracted text."
          : "Mapped from the Proper Preparation worksheet fields and checked behavioral style.",
      assumptions: ["Proper Preparation worksheet was used as the primary planning source."]
    },
    needs: {
      core: sanitizeItems(coreNeeds),
      business: sanitizeItems(businessNeeds),
      personal: sanitizeItems(personalNeeds)
    },
    desiredOutcome: desiredOutcome && !isBoilerplateText(desiredOutcome) ? desiredOutcome : null,
    reasonsYes: sanitizeItems(reasonsYes),
    reasonsNo: sanitizeItems(reasonsNo)
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
  if (properPrep) {
    return extractedInputsSchema.parse({
      audience: properPrep.audience,
      needs: properPrep.needs,
      desiredOutcome: properPrep.desiredOutcome,
      reasonsYes: properPrep.reasonsYes,
      reasonsNo: properPrep.reasonsNo,
      situation: buildProperPrepSituation(properPrep),
      rootCause: buildProperPrepRootCause(properPrep),
      draftBigIdea: buildProperPrepBigIdea(properPrep),
      draftOpeningGambit: null,
      wiifm: buildProperPrepWiifm(properPrep),
      proofPoints: sanitizeItems([...properPrep.reasonsYes, ...properPrep.needs.business, ...properPrep.needs.core], 5),
      actions: [],
      constraints: ["Keep the story executive-ready", "Make the recommendation feel low-risk"],
      metrics: [],
      meetingLengthMinutes,
      minutesPerSlide,
      storyComplexity: "medium",
      creatorMode: "generateFromPrep"
    });
  }

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
  const reasonsYes = businessSignals.length
      ? businessSignals.slice(0, 4)
      : [
          "The strategy expands the category into higher-frequency shopper missions.",
          "The approach can increase basket size and cross-category attachment.",
          "The recommendation positions the partner as a broader category leader."
        ];
  const reasonsNo = objectionLines.length
      ? objectionLines.slice(0, 4)
      : ["Execution complexity", "Insufficient proof or quantification", "Competing priorities"];

  return extractedInputsSchema.parse({
    audience: {
      roleLevel: roleSignal || roleLevel,
      behavioralStyle,
      behavioralStyleRationale:
        behavioralStyle === "unknown"
          ? "The source material does not make the decision style explicit yet."
          : "Inferred from the audience language, decision stakes, and proof burden in the source material.",
      assumptions: inferList(fullText, ["Primary audience needs a commercially persuasive, low-risk recommendation."], 3)
    },
    needs: {
      core: businessSignals.length ? businessSignals.slice(0, 3) : inferList(fullText, ["Clarity on the decision", "Confidence in the story logic"], 3),
      business: businessSignals.length ? businessSignals.slice(0, 3) : inferList(fullText, ["Growth impact", "Confidence that the plan will work"], 3),
      personal: ["Reduce decision risk", "Make the recommendation easy to support"]
    },
    desiredOutcome:
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
      roleLevel: primary.audience.roleLevel || fallback.audience.roleLevel,
      behavioralStyle:
        primary.audience.behavioralStyle !== "unknown" ? primary.audience.behavioralStyle : fallback.audience.behavioralStyle,
      behavioralStyleRationale: primary.audience.behavioralStyleRationale || fallback.audience.behavioralStyleRationale,
      assumptions: primary.audience.assumptions.length ? primary.audience.assumptions : fallback.audience.assumptions
    },
    needs: {
      core: primary.needs.core.length ? primary.needs.core : fallback.needs.core,
      business: primary.needs.business.length ? primary.needs.business : fallback.needs.business,
      personal: primary.needs.personal.length ? primary.needs.personal : fallback.needs.personal
    },
    desiredOutcome: primary.desiredOutcome || fallback.desiredOutcome,
    reasonsYes: primary.reasonsYes.length ? primary.reasonsYes : fallback.reasonsYes,
    reasonsNo: primary.reasonsNo.length ? primary.reasonsNo : fallback.reasonsNo,
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
