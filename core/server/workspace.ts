import prismaClientPkg, { type Prisma as PrismaTypes } from "@prisma/client";

import { prisma } from "./prisma.js";

const { Prisma } = prismaClientPkg;

export type WorkspaceUserIdentity = {
  id: string;
  email: string;
  displayName: string;
};

export async function upsertUserProfile(user: WorkspaceUserIdentity) {
  const existingProfile = await prisma.userProfile.findFirst({
    where: {
      OR: [{ id: user.id }, { email: user.email }]
    }
  });

  if (existingProfile) {
    return prisma.userProfile.update({
      where: { id: existingProfile.id },
      data: {
        email: user.email,
        displayName: user.displayName
      }
    });
  }

  return prisma.userProfile.create({
    data: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    }
  });
}

export async function upsertCreatorProjectForUser(input: {
  user: WorkspaceUserIdentity;
  projectId: string;
  title: string;
  inputType: string;
  sourceNotes: string;
  extractedInputsJson?: unknown;
  sectionMapJson?: unknown;
  storyboardJson?: unknown;
  status: string;
}) {
  const profile = await upsertUserProfile(input.user);

  return prisma.creatorProject.upsert({
    where: { id: input.projectId },
    update: {
      title: input.title,
      inputType: input.inputType,
      sourceNotes: input.sourceNotes,
      extractedInputsJson:
        input.extractedInputsJson === undefined ? undefined : input.extractedInputsJson ?? Prisma.JsonNull,
      sectionMapJson: input.sectionMapJson === undefined ? undefined : input.sectionMapJson ?? Prisma.JsonNull,
      storyboardJson: input.storyboardJson === undefined ? undefined : input.storyboardJson ?? Prisma.JsonNull,
      status: input.status
    },
    create: {
      id: input.projectId,
      userId: profile.id,
      title: input.title,
      inputType: input.inputType,
      sourceNotes: input.sourceNotes,
      extractedInputsJson: input.extractedInputsJson ?? Prisma.JsonNull,
      sectionMapJson: input.sectionMapJson ?? Prisma.JsonNull,
      storyboardJson: input.storyboardJson ?? Prisma.JsonNull,
      status: input.status
    }
  });
}

// A user can end up with more than one profile row when their auth id changes
// but their email stays the same. listRecentWorkspaceItems has always unioned
// across both, so every getter must too, otherwise an item is listed on Home
// and then 404s when it is opened.
async function resolveUserIds(user: Pick<WorkspaceUserIdentity, "id" | "email">) {
  const matchingProfiles = await prisma.userProfile.findMany({
    where: {
      OR: [{ id: user.id }, { email: user.email }]
    },
    select: { id: true }
  });

  return Array.from(new Set([user.id, ...matchingProfiles.map((profile) => profile.id)]));
}

export async function getCreatorProjectForUser(user: Pick<WorkspaceUserIdentity, "id" | "email">, projectId: string) {
  const userIds = await resolveUserIds(user);

  return prisma.creatorProject.findFirst({
    where: {
      id: projectId,
      userId: { in: userIds }
    }
  });
}

export async function getEvaluatorReportForUser(
  user: Pick<WorkspaceUserIdentity, "id" | "email">,
  reportId: string
) {
  const userIds = await resolveUserIds(user);

  return prisma.evaluatorReport.findFirst({
    where: {
      id: reportId,
      userId: { in: userIds }
    }
  });
}

export async function upsertCoachThreadForUser(input: {
  user: WorkspaceUserIdentity;
  threadId: string;
  title: string;
  messages: Array<{
    role: string;
    text: string;
    diagnosisJson?: unknown;
    reframesJson?: unknown;
    doctrineHighlightsJson?: unknown;
    suggestionsJson?: unknown;
    nextStep?: string | null;
  }>;
}) {
  const profile = await upsertUserProfile(input.user);

  return prisma.$transaction(async (tx) => {
    const thread = await tx.coachThread.upsert({
      where: { id: input.threadId },
      update: {
        title: input.title
      },
      create: {
        id: input.threadId,
        userId: profile.id,
        title: input.title
      }
    });

    await tx.coachMessage.deleteMany({
      where: { threadId: input.threadId }
    });

    if (input.messages.length) {
      await tx.coachMessage.createMany({
        data: input.messages.map((message) => ({
          threadId: input.threadId,
          role: message.role,
          text: message.text,
          diagnosisJson: message.diagnosisJson ?? Prisma.JsonNull,
          reframesJson: message.reframesJson ?? Prisma.JsonNull,
          doctrineHighlightsJson: message.doctrineHighlightsJson ?? Prisma.JsonNull,
          suggestionsJson: message.suggestionsJson ?? Prisma.JsonNull,
          nextStep: message.nextStep ?? null
        }))
      });
    }

    return thread;
  });
}

export async function getCoachThreadForUser(user: Pick<WorkspaceUserIdentity, "id" | "email">, threadId: string) {
  const userIds = await resolveUserIds(user);

  return prisma.coachThread.findFirst({
    where: {
      id: threadId,
      userId: { in: userIds }
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function upsertEvaluatorReport(input: {
  user: WorkspaceUserIdentity;
  reportId: string;
  filename: string;
  mode?: string;
  phase1Markdown?: string;
  phase2Markdown?: string;
  resultJson?: unknown;
  summaryText?: string;
}) {
  const profile = await upsertUserProfile(input.user);

  return prisma.evaluatorReport.upsert({
    where: { id: input.reportId },
    update: {
      filename: input.filename,
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.phase1Markdown !== undefined && { phase1Markdown: input.phase1Markdown }),
      ...(input.phase2Markdown !== undefined && { phase2Markdown: input.phase2Markdown }),
      ...(input.resultJson !== undefined && { resultJson: input.resultJson as PrismaTypes.InputJsonValue }),
      ...(input.summaryText !== undefined && { summaryText: input.summaryText })
    },
    create: {
      id: input.reportId,
      userId: profile.id,
      filename: input.filename,
      mode: input.mode ?? null,
      phase1Markdown: input.phase1Markdown ?? "",
      phase2Markdown: input.phase2Markdown ?? null,
      resultJson: (input.resultJson ?? Prisma.JsonNull) as PrismaTypes.InputJsonValue,
      summaryText: input.summaryText ?? ""
    }
  });
}

// CreatorProject.status is a loose string, not an enum. The page writes
// "complete" / "in_progress"; the schema default is "draft". "generated" and
// "extracting" are legacy values kept here so older rows still read correctly.
function creatorSummaryFor(status: string) {
  switch (status) {
    case "complete":
      return "Slide outline ready to reopen.";
    case "in_progress":
      return "Draft in progress.";
    case "generated":
      return "Storyboard ready to reopen.";
    case "extracting":
      return "Inputs saved and ready for confirmation.";
    default:
      return "Draft saved.";
  }
}

export async function listRecentWorkspaceItems(user: Pick<WorkspaceUserIdentity, "id" | "email">) {
  const userIds = await resolveUserIds(user);

  const [creatorProjects, coachThreads, deliveryJobs, evaluatorReports] = await Promise.all([
    prisma.creatorProject.findMany({
      where: { userId: { in: userIds } },
      orderBy: { updatedAt: "desc" },
      take: 5
    }),
    prisma.coachThread.findMany({
      where: { userId: { in: userIds } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    }),
    prisma.deliveryJob.findMany({
      where: { userId: { in: userIds } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        report: true
      }
    }),
    prisma.evaluatorReport.findMany({
      where: { userId: { in: userIds } },
      orderBy: { updatedAt: "desc" },
      take: 5
    })
  ]);

  const items = [
    ...evaluatorReports.map((report) => ({
      id: report.id,
      pillar: "evaluator" as const,
      title: report.filename,
      summary: report.summaryText || "Evaluation report saved.",
      route: `/platform/evaluator?reportId=${report.id}`,
      updatedAt: report.updatedAt.toISOString()
    })),
    ...creatorProjects.map((project) => ({
      id: project.id,
      pillar: "creator" as const,
      title: project.title,
      summary: creatorSummaryFor(project.status),
      route: `/platform/creator?projectId=${project.id}`,
      updatedAt: project.updatedAt.toISOString()
    })),
    ...coachThreads.map((thread) => ({
      id: thread.id,
      pillar: "coach" as const,
      title: thread.title,
      summary: thread.messages[0]?.text.slice(0, 120) ?? "Story coaching thread saved.",
      route: `/platform/coach?threadId=${thread.id}`,
      updatedAt: thread.updatedAt.toISOString()
    })),
    ...deliveryJobs.map((job) => ({
      id: job.id,
      pillar: "delivery" as const,
      title: job.originalFilename,
      summary:
        job.status === "complete"
          ? job.report?.executiveSummary ?? "Delivery report ready to review."
          : job.status === "failed"
            ? job.errorMessage ?? "Delivery analysis failed. Review the log and retry."
            : `Delivery job is ${job.status.replace(/_/g, " ")}.`,
      route: `/platform/dynamic-delivery?jobId=${job.id}`,
      updatedAt: job.updatedAt.toISOString()
    }))
  ];

  return items
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 8);
}
