import prismaClientPkg from "@prisma/client";

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

export async function getCreatorProjectForUser(userId: string, projectId: string) {
  return prisma.creatorProject.findFirst({
    where: {
      id: projectId,
      userId
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

export async function getCoachThreadForUser(userId: string, threadId: string) {
  return prisma.coachThread.findFirst({
    where: {
      id: threadId,
      userId
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function listRecentWorkspaceItems(user: Pick<WorkspaceUserIdentity, "id" | "email">) {
  const matchingProfiles = await prisma.userProfile.findMany({
    where: {
      OR: [{ id: user.id }, { email: user.email }]
    },
    select: {
      id: true
    }
  });

  const userIds = Array.from(new Set([user.id, ...matchingProfiles.map((profile) => profile.id)]));

  const [creatorProjects, coachThreads, deliveryJobs] = await Promise.all([
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
    })
  ]);

  const items = [
    ...creatorProjects.map((project) => ({
      id: project.id,
      pillar: "creator" as const,
      title: project.title,
      summary:
        project.status === "generated"
          ? "Storyboard ready to reopen."
          : project.status === "extracting"
            ? "Inputs saved and ready for confirmation."
            : "Creator draft saved.",
      route: `/creator?projectId=${project.id}`,
      updatedAt: project.updatedAt.toISOString()
    })),
    ...coachThreads.map((thread) => ({
      id: thread.id,
      pillar: "coach" as const,
      title: thread.title,
      summary: thread.messages[0]?.text.slice(0, 120) ?? "Story coaching thread saved.",
      route: `/coach?threadId=${thread.id}`,
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
      route: `/evaluate?jobId=${job.id}`,
      updatedAt: job.updatedAt.toISOString()
    }))
  ];

  return items
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 8);
}
