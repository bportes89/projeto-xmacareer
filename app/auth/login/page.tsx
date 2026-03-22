import Link from "next/link";

import LoginForm from "./ui/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-brand-blue via-brand-blue to-brand-blue-hover px-4 py-12">
      <main className="w-full max-w-md rounded-3xl border border-slate-300/60 bg-white p-6 shadow-xl sm:p-8">
        <div className="text-sm font-semibold tracking-wide text-brand-blue">XMA Career</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Entrar</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Acesse para continuar suas experiências em STAR + D.
        </p>

        <div className="mt-6">
          <LoginForm />
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
