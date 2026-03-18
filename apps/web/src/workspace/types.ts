export type WorkspacePillar = "delivery" | "creator" | "coach";

export type RecentWorkItem = {
  id: string;
  pillar: WorkspacePillar;
  title: string;
  summary: string;
  route: string;
  updatedAt: string;
};

export type PersistedCreatorProject = {
  id: string;
  title: string;
  updatedAt: string;
  step: "input" | "confirm" | "generate";
  notes: string;
  inputType: string;
  meetingLengthMinutes: number;
  minutesPerSlide: number;
  tone: string;
  documents: Array<{
    label: string;
    kind: "image" | "pdf" | "pptx" | "doc" | "text" | "video";
    content: string;
    filename?: string;
    contentType?: string;
    extractedText?: string;
    visionSummary?: string;
    notes?: string;
  }>;
  gapNotes: string;
  revisionText: string;
  revisionScope: "global" | "section" | "slide";
  revisionSection: string;
  revisionSlideIndex: number;
  extractResult: unknown | null;
  generateResult: unknown | null;
  lastChangeSummary: string[];
};

export type PersistedCoachThread = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Array<{
    role: "assistant" | "user";
    text: string;
    diagnosis?: unknown;
    reframes?: unknown[];
    doctrineHighlights?: unknown[];
    suggestions?: string[];
    nextStep?: string;
  }>;
};
