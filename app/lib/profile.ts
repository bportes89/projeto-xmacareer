import type { PrismaClient } from "@prisma/client";

import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

function toArray(value: unknown): Array<{ name: string; score: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const name = (x as { name?: unknown }).name;
      const score = (x as { score?: unknown }).score;
      return { name: typeof name === "string" ? name : "N/A", score: typeof score === "number" ? score : 0 };
    })
    .filter((x) => x.name !== "N/A");
}

function aggregate(items: Array<Array<{ name: string; score: number }>>) {
  const m = new Map<string, number>();
  for (const arr of items) {
    for (const i of arr) m.set(i.name, (m.get(i.name) ?? 0) + i.score);
  }
  return Array.from(m.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
}

function normalizeConfirmedCompetencies(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as { hard?: unknown; soft?: unknown; areas?: unknown };
  const hard = Array.isArray(v.hard) ? v.hard.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const soft = Array.isArray(v.soft) ? v.soft.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const areas = Array.isArray(v.areas) ? v.areas.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  return {
    hard: Array.from(new Set(hard.map((x) => x.trim()))),
    soft: Array.from(new Set(soft.map((x) => x.trim()))),
    areas: Array.from(new Set(areas.map((x) => x.trim()))),
  };
}

function computeLeadershipProfile(leadershipScore: number) {
  if (leadershipScore >= 75) return "Liderança forte";
  if (leadershipScore >= 50) return "Influência em execução";
  if (leadershipScore >= 30) return "Colaboração consistente";
  return "Execução inicial";
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function computeFeedbackOverall(ratings: unknown) {
  if (!ratings || typeof ratings !== "object") return null;
  const r = ratings as Record<string, unknown>;
  const keys = ["execution", "collaboration", "communication", "leadership", "ownership"] as const;
  const values = keys.map((k) => toNumber(r[k])).filter((x): x is number => x !== null);
  if (values.length !== keys.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function recomputeUserCompetencyProfile(prisma: PrismaClient, userId: string) {
  const taxonomy = await getTaxonomyBundle(prisma);

  const projects = await prisma.project.findMany({
    where: { userId, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "asc" }],
    select: {
      id: true,
      title: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
      confirmedCompetencies: true,
      analysis: {
        select: {
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
          leadershipProfile: true,
          leadershipScore: true,
        },
      },
    },
  });

  const hydrated = await Promise.all(
    projects.map(async (p) => {
      if (p.analysis) return p;
      const analysis = analyzeProjectText(p, taxonomy);
      const saved = await prisma.projectAnalysis.upsert({
        where: { projectId: p.id },
        create: {
          projectId: p.id,
          competenciesHard: analysis.competenciesHard,
          competenciesSoft: analysis.competenciesSoft,
          areas: analysis.areas,
          leadershipProfile: analysis.leadershipProfile,
          leadershipScore: analysis.leadershipScore,
        },
        update: {
          competenciesHard: analysis.competenciesHard,
          competenciesSoft: analysis.competenciesSoft,
          areas: analysis.areas,
          leadershipProfile: analysis.leadershipProfile,
          leadershipScore: analysis.leadershipScore,
        },
        select: {
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
          leadershipProfile: true,
          leadershipScore: true,
        },
      });
      return { ...p, analysis: saved };
    }),
  );

  const hardAgg = aggregate(
    hydrated.map((p) => {
      const confirmed = normalizeConfirmedCompetencies((p as { confirmedCompetencies?: unknown }).confirmedCompetencies);
      if (confirmed && confirmed.hard.length) return confirmed.hard.map((name) => ({ name, score: 1 }));
      return toArray(p.analysis?.competenciesHard);
    }),
  ).slice(0, 50);
  const softAgg = aggregate(
    hydrated.map((p) => {
      const confirmed = normalizeConfirmedCompetencies((p as { confirmedCompetencies?: unknown }).confirmedCompetencies);
      if (confirmed && confirmed.soft.length) return confirmed.soft.map((name) => ({ name, score: 1 }));
      return toArray(p.analysis?.competenciesSoft);
    }),
  ).slice(0, 50);
  const areaAgg = aggregate(
    hydrated.map((p) => {
      const confirmed = normalizeConfirmedCompetencies((p as { confirmedCompetencies?: unknown }).confirmedCompetencies);
      if (confirmed && confirmed.areas.length) return confirmed.areas.map((name) => ({ name, score: 1 }));
      return toArray(p.analysis?.areas);
    }),
  ).slice(0, 50);

  const leadershipScores = hydrated.map((p) => p.analysis?.leadershipScore ?? 0);
  const leadershipScore = leadershipScores.length
    ? Math.round((leadershipScores.reduce((a, b) => a + b, 0) / leadershipScores.length) * 10) / 10
    : 0;
  const leadershipProfile = computeLeadershipProfile(leadershipScore);

  const feedbacks = await prisma.projectFeedback.findMany({
    where: { project: { userId } },
    select: { ratings: true },
  });

  const feedbackOverallValues = feedbacks.map((f) => computeFeedbackOverall(f.ratings)).filter((x): x is number => x !== null);
  const feedbackOverallAvg = feedbackOverallValues.length
    ? Math.round((feedbackOverallValues.reduce((a, b) => a + b, 0) / feedbackOverallValues.length) * 100) / 100
    : null;

  const profileData = {
    competenciesHard: hardAgg,
    competenciesSoft: softAgg,
    areas: areaAgg,
    leadershipScore: Math.round(leadershipScore),
    leadershipProfile,
    feedbackOverallAvg,
    feedbackCount: feedbackOverallValues.length,
    sourceProjectsCount: hydrated.length,
    sourceFeedbackCount: feedbacks.length,
  };

  const profileModel = (prisma as unknown as { userCompetencyProfile?: unknown }).userCompetencyProfile;
  const snapshotModel = (prisma as unknown as { userCompetencyProfileSnapshot?: unknown }).userCompetencyProfileSnapshot;
  if (!profileModel || !snapshotModel) {
    return {
      userId,
      ...profileData,
      updatedAt: new Date(),
    };
  }

  const current = await prisma.userCompetencyProfile.upsert({
    where: { userId },
    create: { userId, ...profileData },
    update: { ...profileData },
    select: {
      userId: true,
      competenciesHard: true,
      competenciesSoft: true,
      areas: true,
      leadershipScore: true,
      leadershipProfile: true,
      feedbackOverallAvg: true,
      feedbackCount: true,
      sourceProjectsCount: true,
      sourceFeedbackCount: true,
      updatedAt: true,
    },
  });

  await prisma.userCompetencyProfileSnapshot.create({
    data: { userId, ...profileData },
    select: { id: true },
  });

  return current;
}

export async function ensureUserCompetencyProfile(prisma: PrismaClient, userId: string) {
  const profileModel = (prisma as unknown as { userCompetencyProfile?: unknown }).userCompetencyProfile;
  if (!profileModel) {
    return recomputeUserCompetencyProfile(prisma, userId);
  }
  const existing = await prisma.userCompetencyProfile.findFirst({
    where: { userId },
    select: {
      userId: true,
      competenciesHard: true,
      competenciesSoft: true,
      areas: true,
      leadershipScore: true,
      leadershipProfile: true,
      feedbackOverallAvg: true,
      feedbackCount: true,
      sourceProjectsCount: true,
      sourceFeedbackCount: true,
      updatedAt: true,
    },
  });
  if (existing) return existing;
  return recomputeUserCompetencyProfile(prisma, userId);
}
