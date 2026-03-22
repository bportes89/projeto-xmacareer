import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { ensureUserCompetencyProfile } from "@/app/lib/profile";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });
  const taxonomy = await getTaxonomyBundle(prisma);
  const profile = await ensureUserCompetencyProfile(prisma, user.id);

  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      headline: true,
      experienceDescription: true,
      experienceType: true,
      organization: true,
      roleTitle: true,
      location: true,
      startDate: true,
      endDate: true,
      projectUrl: true,
      repoUrl: true,
      tags: true,
      confirmedCompetencies: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
      evidences: true,
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

  const payload = {
    user: { id: user.id, name: user.name, email: user.email },
    generatedAt: new Date().toISOString(),
    competencyProfile: profile,
    projects: hydrated,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="cv.json"',
    },
  });
}
