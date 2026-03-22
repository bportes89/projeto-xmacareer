import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";

function contentDisposition(filename: string) {
  const safe = filename.replace(/[\r\n"]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_: Request, ctx: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await ctx.params;

  const share = await prisma.portfolioShare.findFirst({
    where: { token, enabled: true },
    select: { userId: true },
  });
  if (!share) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const file = await prisma.projectEvidenceFile.findFirst({
    where: { id: fileId, project: { userId: share.userId, status: "SUBMITTED" } },
    select: { name: true, mime: true, data: true },
  });
  if (!file) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return new NextResponse(file.data, {
    status: 200,
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "content-disposition": contentDisposition(file.name || "evidencia"),
      "cache-control": "public, max-age=0",
    },
  });
}

