import Link from "next/link";
import Image from "next/image";

import RegisterForm from "./ui/RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string | string[] }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const roleRaw = Array.isArray(sp?.role) ? sp?.role[0] : sp?.role;
  const selectedRole = (roleRaw || "").toUpperCase() === "SCHOOL" ? "SCHOOL" : "STUDENT";
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-brand-blue via-brand-blue to-brand-blue-hover px-4 py-12">
      <main className="w-full max-w-md rounded-3xl border border-slate-300/60 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <Image src="/xma-career-logo.svg" alt="XMA Career" width={64} height={64} priority />
          <div className="text-sm font-semibold tracking-wide text-brand-blue">XMA Career</div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Criar conta</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Comece a registrar suas experiências e gerar portfólio e diagnóstico.
        </p>

        <div className="mt-6">
          <RegisterForm defaultRole={selectedRole} />
        </div>

        <div className="mt-6 text-sm text-slate-600">
          Já tem conta?{" "}
          <Link href="/auth/login" className="font-semibold text-brand-blue hover:underline">
            Entrar
          </Link>
        </div>
      </main>
    </div>
  );
}
