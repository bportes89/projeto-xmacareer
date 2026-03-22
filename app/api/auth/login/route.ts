import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { setAuthCookie, signAuthToken, verifyPassword } from "@/app/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function envErrorToResponse(err: unknown) {
  if (!(err instanceof Error)) return null;
  if (err.message.includes("AUTH_SECRET")) {
    return NextResponse.json({ error: "AUTH_SECRET não configurado no ambiente." }, { status: 500 });
  }
  if (err.message.includes("DATABASE_URL")) {
    return NextResponse.json({ error: "DATABASE_URL não configurado no ambiente." }, { status: 500 });
  }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  let user: { id: string; email: string; name: string; role: "STUDENT" | "SCHOOL"; passwordHash: string } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });
  } catch (err) {
    const envResp = envErrorToResponse(err);
    if (envResp) return envResp;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      return NextResponse.json({ error: "Banco não inicializado. Execute o setup do banco e tente novamente." }, { status: 500 });
    }
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Sem conexão com o banco. Verifique DATABASE_URL." }, { status: 500 });
    }
    return NextResponse.json({ error: "Erro ao entrar. Verifique o banco e tente novamente." }, { status: 500 });
  }

  if (!user) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  try {
    const token = await signAuthToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    await setAuthCookie(token);
  } catch (err) {
    const envResp = envErrorToResponse(err);
    if (envResp) return envResp;
    return NextResponse.json({ error: "Erro ao entrar. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    { status: 200 },
  );
}
