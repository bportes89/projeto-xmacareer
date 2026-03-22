import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { rewriteStarFieldPluggable } from "@/app/lib/ai";

const schema = z.object({
  projectId: z.string().min(1),
  field: z.enum(["situation", "task", "action", "result", "development"]),
  text: z.string().max(4000),
  nonce: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, userId: user.id },
    select: { title: true, status: true },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (project.status === "SUBMITTED") {
    return NextResponse.json({ error: "Experiência já enviada" }, { status: 409 });
  }

  const rewritten = await rewriteStarFieldPluggable(parsed.data.field, parsed.data.text, project.title ?? "", {
    nonce: parsed.data.nonce,
  });
  return NextResponse.json(rewritten, { status: 200 });
}
