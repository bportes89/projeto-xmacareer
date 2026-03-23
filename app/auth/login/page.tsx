import Link from "next/link";
import Image from "next/image";

import LoginForm from "./ui/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string | string[] }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const roleRaw = Array.isArray(sp?.role) ? sp?.role[0] : sp?.role;
  const roleParam = (roleRaw || "").toUpperCase();
  const selectedRole = roleParam === "SCHOOL" ? "SCHOOL" : roleParam === "STUDENT" ? "STUDENT" : undefined;
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-brand-blue via-brand-blue to-brand-blue-hover px-4 py-12">
      <main className="w-full max-w-md rounded-3xl border border-slate-300/60 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <Image src="/xma-career-logo.svg" alt="XMA Career" width={64} height={64} priority />
          <div className="text-sm font-semibold tracking-wide text-brand-blue">XMA Career</div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Entrar</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Acesse para continuar suas experiências em STAR + D.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link
            href="/auth/login?role=STUDENT"
            className={
              selectedRole === "STUDENT"
                ? "rounded-lg border border-brand-blue bg-brand-blue/10 px-3 py-2 text-center text-sm font-semibold text-brand-blue"
                : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            Entrar como Aluno
          </Link>
          <Link
            href="/auth/login?role=SCHOOL"
            className={
              selectedRole === "SCHOOL"
                ? "rounded-lg border border-brand-blue bg-brand-blue/10 px-3 py-2 text-center text-sm font-semibold text-brand-blue"
                : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            Entrar como Escola
          </Link>
        </div>

        <div className="mt-2 text-xs text-slate-600">
          Não tem acesso?{" "}
          <Link href={selectedRole === "SCHOOL" ? "/auth/register?role=SCHOOL" : "/auth/register?role=STUDENT"} className="font-semibold text-brand-blue hover:underline">
            Criar conta {selectedRole === "SCHOOL" ? "de Escola" : "de Aluno"}
          </Link>
        </div>

        <div className="mt-6">
          <LoginForm targetRole={selectedRole} />
        </div>

        <div className="mt-6 text-sm text-slate-600">
          Ainda não tem conta?{" "}
          <Link href="/auth/register" className="font-semibold text-brand-blue hover:underline">
            Criar conta
          </Link>
        </div>
      </main>
    </div>
  );
}
