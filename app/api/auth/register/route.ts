import { NextResponse } from "next/server";
import { z } from "zod";
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
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), name, passwordHash, role: role ?? "STUDENT" },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = await signAuthToken(user);
    await setAuthCookie(token);

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
  }
}
