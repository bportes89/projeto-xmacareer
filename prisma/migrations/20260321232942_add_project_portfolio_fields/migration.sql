-- AlterTable
ALTER TABLE "Project" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "Project" ADD COLUMN "experienceType" TEXT;
ALTER TABLE "Project" ADD COLUMN "headline" TEXT;
ALTER TABLE "Project" ADD COLUMN "location" TEXT;
ALTER TABLE "Project" ADD COLUMN "organization" TEXT;
ALTER TABLE "Project" ADD COLUMN "projectUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "repoUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "roleTitle" TEXT;
ALTER TABLE "Project" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Project" ADD COLUMN "tags" JSONB;
