import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

const schema = z.object({
  projectId: z.string().min(1),
});

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, userId: user.id },
    select: {
      id: true,
      title: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const taxonomy = await getTaxonomyBundle(prisma);
  const analysis = analyzeProjectText(project, taxonomy);

  const saved = await prisma.projectAnalysis.upsert({
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
    select: {
      competenciesHard: true,
      competenciesSoft: true,
      areas: true,
      leadershipProfile: true,
      leadershipScore: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { ...saved, updatedAt: saved.updatedAt.toISOString() },
    { status: 200 },
  );
}
