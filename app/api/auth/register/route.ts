import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { hashPassword, setAuthCookie, signAuthToken } from "@/app/lib/auth";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(200),
  role: z.enum(["STUDENT", "SCHOOL"]).optional(),
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
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, name, password, role } = parsed.data;
  const requestedRole = role ?? "STUDENT";

  if (requestedRole === "SCHOOL") {
    try {
      const existingSchoolUsers = await prisma.user.count({ where: { role: "SCHOOL" } });
      if (existingSchoolUsers > 0) {
        return NextResponse.json({ error: "Cadastro de escola indisponível" }, { status: 403 });
      }
    } catch (err) {
      const envResp = envErrorToResponse(err);
      if (envResp) return envResp;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
        return NextResponse.json({ error: "Banco não inicializado. Execute o setup do banco e tente novamente." }, { status: 500 });
      }
      if (err instanceof Prisma.PrismaClientInitializationError) {
        return NextResponse.json({ error: "Sem conexão com o banco. Verifique DATABASE_URL." }, { status: 500 });
      }
      return NextResponse.json({ error: "Erro ao cadastrar. Verifique o banco e tente novamente." }, { status: 500 });
    }
  }

  const passwordHash = await hashPassword(password);

  let user: { id: string; email: string; name: string; role: "STUDENT" | "SCHOOL" } | null = null;
  try {
    user = await prisma.user.create({
      data: { email: email.toLowerCase(), name, passwordHash, role: requestedRole },
      select: { id: true, email: true, name: true, role: true },
    });
  } catch (err) {
    const envResp = envErrorToResponse(err);
    if (envResp) return envResp;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      return NextResponse.json({ error: "Banco não inicializado. Execute o setup do banco e tente novamente." }, { status: 500 });
    }
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Sem conexão com o banco. Verifique DATABASE_URL." }, { status: 500 });
    }
    return NextResponse.json({ error: "Erro ao cadastrar. Verifique o banco e tente novamente." }, { status: 500 });
  }

  try {
    const token = await signAuthToken(user);
    await setAuthCookie(token);
  } catch (err) {
    const envResp = envErrorToResponse(err);
    if (envResp) return envResp;
    return NextResponse.json({ error: "Erro ao cadastrar. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ user }, { status: 201 });
}
