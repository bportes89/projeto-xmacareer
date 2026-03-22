import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const schema = z.object({
  token: z.string().min(10).max(400),
});

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const token = parsed.data.token.trim();
  const tokenHash = sha256Hex(token);

  const invite = await prisma.projectInvite.findUnique({
    where: { tokenHash },
    select: { id: true, projectId: true, email: true, role: true, expiresAt: true },
  });
  if (!invite) return NextResponse.json({ error: "Convite inválido" }, { status: 404 });
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Convite expirado" }, { status: 410 });
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Este convite é para outro email" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: invite.projectId },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Experiência não encontrada" }, { status: 404 });
  if (project.userId === user.id) {
    await prisma.projectInvite.delete({ where: { id: invite.id } }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  await prisma.projectParticipant.upsert({
    where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
    create: {
      projectId: invite.projectId,
      userId: user.id,
      role: invite.role,
      status: "ACTIVE",
    },
    update: { role: invite.role, status: "ACTIVE" },
    select: { id: true },
  });

  await prisma.projectInvite.delete({ where: { id: invite.id } }).catch(() => null);

  return NextResponse.json({ ok: true, projectId: invite.projectId }, { status: 200 });
}
