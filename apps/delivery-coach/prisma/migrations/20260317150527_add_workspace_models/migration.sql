-- AlterTable
ALTER TABLE "DeliveryJob" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "sourceNotes" TEXT NOT NULL DEFAULT '',
    "extractedInputsJson" JSONB,
    "sectionMapJson" JSONB,
    "storyboardJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "diagnosisJson" JSONB,
    "reframesJson" JSONB,
    "doctrineHighlightsJson" JSONB,
    "suggestionsJson" JSONB,
    "nextStep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE INDEX "CreatorProject_userId_updatedAt_idx" ON "CreatorProject"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CoachThread_userId_updatedAt_idx" ON "CoachThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CoachMessage_threadId_createdAt_idx" ON "CoachMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryJob_userId_updatedAt_idx" ON "DeliveryJob"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProject" ADD CONSTRAINT "CreatorProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachThread" ADD CONSTRAINT "CoachThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CoachThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
