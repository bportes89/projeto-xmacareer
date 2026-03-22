import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { recomputeUserCompetencyProfile } from "@/app/lib/profile";

const ratingSchema = z.object({
  execution: z.number().int().min(1).max(5),
  collaboration: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  leadership: z.number().int().min(1).max(5),
  ownership: z.number().int().min(1).max(5),
});

const postSchema = z.object({
  ratings: ratingSchema,
  comment: z.string().max(2000).optional(),
});

function toRoleLabel(role: string) {
  if (role === "SELF") return "Autoavaliação";
  if (role === "MENTOR") return "Mentor";
  if (role === "PEER") return "Par";
  if (role === "MANAGER") return "Gestor";
  return role;
}

function computeAggregate(items: Array<{ ratings: unknown }>) {
  const totals = { execution: 0, collaboration: 0, communication: 0, leadership: 0, ownership: 0 };
  let n = 0;
  for (const i of items) {
    const parsed = ratingSchema.safeParse(i.ratings);
    if (!parsed.success) continue;
    totals.execution += parsed.data.execution;
    totals.collaboration += parsed.data.collaboration;
    totals.communication += parsed.data.communication;
    totals.leadership += parsed.data.leadership;
    totals.ownership += parsed.data.ownership;
    n += 1;
  }
  if (n === 0) return null;
  const avg = {
    execution: totals.execution / n,
    collaboration: totals.collaboration / n,
    communication: totals.communication / n,
    leadership: totals.leadership / n,
    ownership: totals.ownership / n,
  };
  const overall = (avg.execution + avg.collaboration + avg.communication + avg.leadership + avg.ownership) / 5;
  return { n, avg, overall };
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE "projectId" = ${project.id} AND "userId" = ${user.id} AND "status" = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const isOwner = project.userId === user.id;

  const [myFeedback, allFeedbacks] = await Promise.all([
    prisma.projectFeedback.findFirst({
      where: { projectId: project.id, evaluatorUserId: user.id },
      select: { id: true, role: true, ratings: true, comment: true, updatedAt: true },
    }),
    isOwner
      ? prisma.projectFeedback.findMany({
          where: { projectId: project.id },
          orderBy: [{ updatedAt: "desc" }],
          select: {
            id: true,
            role: true,
            ratings: true,
            comment: true,
            updatedAt: true,
            evaluator: { select: { id: true, name: true, email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const aggregate = isOwner ? computeAggregate(allFeedbacks) : null;

  return NextResponse.json(
    {
      canEdit: isOwner,
      myFeedback: myFeedback
        ? { ...myFeedback, roleLabel: toRoleLabel(myFeedback.role), updatedAt: myFeedback.updatedAt.toISOString() }
        : null,
      aggregate,
      feedbacks: isOwner
        ? allFeedbacks.map((f) => ({
            id: f.id,
            role: f.role,
            roleLabel: toRoleLabel(f.role),
            ratings: f.ratings,
            comment: f.comment ?? "",
            updatedAt: f.updatedAt.toISOString(),
            evaluator: f.evaluator,
          }))
        : [],
    },
    { status: 200 },
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE "projectId" = ${project.id} AND "userId" = ${user.id} AND "status" = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  let role: "SELF" | "MENTOR" | "PEER" | "MANAGER" = "SELF";
  if (project.userId !== user.id) {
    const participant = await prisma.projectParticipant.findFirst({
      where: { projectId: project.id, userId: user.id, status: "ACTIVE" },
      select: { role: true },
    });
    if (!participant) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    role = participant.role as typeof role;
  }

  const saved = await prisma.projectFeedback.upsert({
    where: { projectId_evaluatorUserId: { projectId: project.id, evaluatorUserId: user.id } },
    create: {
      projectId: project.id,
      evaluatorUserId: user.id,
      role,
      ratings: parsed.data.ratings,
      comment: parsed.data.comment?.trim().length ? parsed.data.comment.trim() : null,
    },
    update: {
      role,
      ratings: parsed.data.ratings,
      comment: parsed.data.comment?.trim().length ? parsed.data.comment.trim() : null,
    },
    select: { id: true, updatedAt: true },
  });

  await recomputeUserCompetencyProfile(prisma, project.userId);

  return NextResponse.json({ ok: true, id: saved.id, updatedAt: saved.updatedAt.toISOString() }, { status: 200 });
}
