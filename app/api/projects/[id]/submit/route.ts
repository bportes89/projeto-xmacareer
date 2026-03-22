import { NextResponse } from "next/server";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { recomputeUserCompetencyProfile } from "@/app/lib/profile";
import { publishProjectUpdated } from "@/app/lib/realtime";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

function isValidForSubmit(project: {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  development: string;
}) {
  return (
    project.title.trim().length >= 3 &&
    project.situation.trim().length >= 20 &&
    project.task.trim().length >= 20 &&
    project.action.trim().length >= 20 &&
    project.result.trim().length >= 20 &&
    project.development.trim().length >= 20
  );
}

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await ctx.params;

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      title: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
    },
  });

  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.status === "SUBMITTED") {
    return NextResponse.json({ error: "Experiência já enviada" }, { status: 409 });
  }
  if (!isValidForSubmit(project)) {
    return NextResponse.json({ error: "Preenchimento incompleto" }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { status: "SUBMITTED" },
    select: { status: true, updatedAt: true },
  });

  const taxonomy = await getTaxonomyBundle(prisma);
  const analysis = analyzeProjectText({
    title: project.title,
    situation: project.situation,
    task: project.task,
    action: project.action,
    result: project.result,
    development: project.development,
  }, taxonomy);

  await prisma.projectAnalysis.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
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
  });

  await recomputeUserCompetencyProfile(prisma, user.id);
  publishProjectUpdated(project.id, updated.updatedAt.toISOString());

  return NextResponse.json(
    { status: updated.status, updatedAt: updated.updatedAt.toISOString() },
    { status: 200 },
  );
}
