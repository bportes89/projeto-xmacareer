import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const inviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["MENTOR", "PEER", "MANAGER"]),
});

const deleteSchema = z.object({
  inviteId: z.string().min(1).optional(),
  participantId: z.string().min(1).optional(),
});

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true, user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE projectId = ${project.id} AND userId = ${user.id} AND status = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  const isOwner = project.userId === user.id;

  const [participants, invites] = await Promise.all([
    prisma.projectParticipant.findMany({
      where: { projectId: project.id, status: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
    isOwner
      ? prisma.projectInvite.findMany({
          where: { projectId: project.id },
          orderBy: [{ createdAt: "desc" }],
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json(
    {
      owner: project.user,
      participants: participants.map((p) => ({
        id: p.id,
        role: p.role,
        createdAt: p.createdAt.toISOString(),
        user: { id: p.user.id, name: p.user.name, email: p.user.email, role: p.user.role },
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const email = parsed.data.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const already = await prisma.projectParticipant.findFirst({
      where: { projectId: project.id, userId: existingUser.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (already) return NextResponse.json({ error: "Usuário já é participante" }, { status: 409 });
  }

  const alreadyInvited = await prisma.projectInvite.findFirst({
    where: { projectId: project.id, email, role: parsed.data.role },
    select: { id: true },
  });
  if (alreadyInvited) return NextResponse.json({ error: "Convite já existe" }, { status: 409 });

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  const created = await prisma.projectInvite.create({
    data: {
      projectId: project.id,
      email,
      role: parsed.data.role,
      tokenHash,
      expiresAt,
    },
    select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
  });

  const origin = new URL(req.url).origin;
  const inviteUrl = `${origin}/invites/${token}`;

  return NextResponse.json(
    {
      invite: {
        id: created.id,
        email: created.email,
        role: created.role,
        createdAt: created.createdAt.toISOString(),
        expiresAt: created.expiresAt.toISOString(),
      },
      inviteUrl,
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  if (!parsed.data.inviteId && !parsed.data.participantId) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  if (parsed.data.inviteId) {
    await prisma.projectInvite.deleteMany({ where: { id: parsed.data.inviteId, projectId: project.id } });
  }
  if (parsed.data.participantId) {
    await prisma.projectParticipant.deleteMany({
      where: { id: parsed.data.participantId, projectId: project.id },
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
