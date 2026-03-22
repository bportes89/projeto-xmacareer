import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const deleteSchema = z.object({
  fileId: z.string().min(1),
});

const MAX_BYTES = 10 * 1024 * 1024;

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
      WHERE projectId = ${project.id} AND userId = ${user.id} AND status = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const files = await prisma.projectEvidenceFile.findMany({
    where: { projectId: project.id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      mime: true,
      size: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(
    {
      canEdit: project.userId === user.id,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        mime: f.mime,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
        uploadedBy: f.uploadedBy,
        downloadUrl: `/api/evidence-files/${f.id}`,
      })),
    },
    { status: 200 },
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const file = form.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo muito grande" }, { status: 413 });

  const name = (file.name || "evidencia").slice(0, 200);
  const mime = (file.type || "application/octet-stream").slice(0, 100);

  const bytes = Buffer.from(await file.arrayBuffer());
  const created = await prisma.projectEvidenceFile.create({
    data: {
      projectId: project.id,
      uploadedByUserId: user.id,
      name,
      mime,
      size: file.size,
      data: bytes,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(
    {
      ok: true,
      file: {
        id: created.id,
        name,
        mime,
        size: file.size,
        createdAt: created.createdAt.toISOString(),
        downloadUrl: `/api/evidence-files/${created.id}`,
      },
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

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.userId !== user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.projectEvidenceFile.deleteMany({
    where: { id: parsed.data.fileId, projectId: project.id },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
