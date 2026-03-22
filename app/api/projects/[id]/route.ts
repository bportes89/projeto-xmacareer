import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { publishProjectUpdated } from "@/app/lib/realtime";

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  headline: z.string().max(240).nullable().optional(),
  experienceDescription: z.string().max(2000).nullable().optional(),
  experienceType: z.enum(["ACADEMIC", "INTERNSHIP", "WORK", "VOLUNTEER", "PERSONAL", "EVENT", "OTHER"]).nullable().optional(),
  organization: z.string().max(120).nullable().optional(),
  roleTitle: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  projectUrl: z.string().url().max(500).nullable().optional(),
  repoUrl: z.string().url().max(500).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  confirmedCompetencies: z
    .object({
      hard: z.array(z.string().min(1).max(80)).max(30),
      soft: z.array(z.string().min(1).max(80)).max(30),
      areas: z.array(z.string().min(1).max(80)).max(30),
    })
    .optional(),
  situation: z.string().max(4000).optional(),
  task: z.string().max(4000).optional(),
  action: z.string().max(4000).optional(),
  result: z.string().max(4000).optional(),
  development: z.string().max(4000).optional(),
  evidences: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        url: z.string().url().max(500),
      }),
    )
    .max(20)
    .optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: {
      userId: true,
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
      status: true,
      updatedAt: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE projectId = ${id} AND userId = ${user.id} AND status = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json(
    {
      title: project.title,
      headline: project.headline,
      experienceDescription: project.experienceDescription,
      experienceType: project.experienceType,
      organization: project.organization,
      roleTitle: project.roleTitle,
      location: project.location,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
      projectUrl: project.projectUrl,
      repoUrl: project.repoUrl,
      tags: project.tags,
      confirmedCompetencies: project.confirmedCompetencies,
      situation: project.situation,
      task: project.task,
      action: project.action,
      result: project.result,
      development: project.development,
      evidences: project.evidences,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
    },
    { status: 200 },
  );
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const existing = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (existing.status === "SUBMITTED") {
    return NextResponse.json({ error: "Experiência já enviada" }, { status: 409 });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: parsed.data,
    select: { updatedAt: true },
  });

  publishProjectUpdated(id, updated.updatedAt.toISOString());

  return NextResponse.json({ updatedAt: updated.updatedAt.toISOString() }, { status: 200 });
}
