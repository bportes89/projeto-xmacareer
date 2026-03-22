import { NextResponse } from "next/server";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function contentDisposition(filename: string) {
  const safe = filename.replace(/[\r\n"]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { fileId } = await ctx.params;
  const file = await prisma.projectEvidenceFile.findFirst({
    where: { id: fileId },
    select: { id: true, name: true, mime: true, data: true, project: { select: { id: true, userId: true } } },
  });
  if (!file) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (file.project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE "projectId" = ${file.project.id} AND "userId" = ${user.id} AND "status" = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return new NextResponse(file.data, {
    status: 200,
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "content-disposition": contentDisposition(file.name || "evidencia"),
      "cache-control": "private, max-age=0",
    },
  });
}
