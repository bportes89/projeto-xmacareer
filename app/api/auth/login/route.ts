import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { setAuthCookie, signAuthToken, verifyPassword } from "@/app/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
  } catch {
    return NextResponse.json({ error: "Erro ao entrar. Verifique o banco e tente novamente." }, { status: 500 });
  }

  if (!user) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  const token = await signAuthToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await setAuthCookie(token);

  return NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    { status: 200 },
  );
}
