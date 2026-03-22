-- CreateTable
CREATE TABLE "SkillTaxonomyRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserCompetencyProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "competenciesHard" JSONB NOT NULL,
    "competenciesSoft" JSONB NOT NULL,
    "areas" JSONB NOT NULL,
    "leadershipScore" INTEGER NOT NULL,
    "leadershipProfile" TEXT NOT NULL,
    "feedbackOverallAvg" REAL,
    "feedbackCount" INTEGER NOT NULL DEFAULT 0,
    "sourceProjectsCount" INTEGER NOT NULL DEFAULT 0,
    "sourceFeedbackCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCompetencyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserCompetencyProfileSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "competenciesHard" JSONB NOT NULL,
    "competenciesSoft" JSONB NOT NULL,
    "areas" JSONB NOT NULL,
    "leadershipScore" INTEGER NOT NULL,
    "leadershipProfile" TEXT NOT NULL,
    "feedbackOverallAvg" REAL,
    "feedbackCount" INTEGER NOT NULL DEFAULT 0,
    "sourceProjectsCount" INTEGER NOT NULL DEFAULT 0,
    "sourceFeedbackCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCompetencyProfileSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SkillTaxonomyRule_category_active_idx" ON "SkillTaxonomyRule"("category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SkillTaxonomyRule_category_label_key" ON "SkillTaxonomyRule"("category", "label");

-- CreateIndex
CREATE INDEX "UserCompetencyProfileSnapshot_userId_computedAt_idx" ON "UserCompetencyProfileSnapshot"("userId", "computedAt");
