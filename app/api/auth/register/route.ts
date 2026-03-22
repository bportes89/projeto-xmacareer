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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, name, password, role } = parsed.data;
  const requestedRole = role ?? "STUDENT";

  if (requestedRole === "SCHOOL") {
    const existingSchoolUsers = await prisma.user.count({ where: { role: "SCHOOL" } }).catch(() => 0);
    if (existingSchoolUsers > 0) {
      return NextResponse.json({ error: "Cadastro de escola indisponível" }, { status: 403 });
    }
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), name, passwordHash, role: requestedRole },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = await signAuthToken(user);
    await setAuthCookie(token);

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao cadastrar. Verifique o banco e tente novamente." }, { status: 500 });
  }
}
