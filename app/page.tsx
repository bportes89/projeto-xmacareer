import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/app/lib/auth";

export default async function Home() {
  const user = await getAuthUser();
  if (user) {
    redirect(user.role === "SCHOOL" ? "/admin/people-analytics" : "/student/projects");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-brand-blue via-brand-blue to-brand-blue-hover px-4 py-12">
      <main className="w-full max-w-3xl rounded-3xl border border-slate-300/60 bg-white p-6 shadow-xl sm:p-10">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold tracking-wide text-brand-blue">XMA Career</div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
            Experiências em STAR + D, portfólio e People Analytics
          </h1>
          <p className="mt-2 text-base leading-7 text-slate-600">
            Cadastre experiências com apoio por IA, extraia competências e gere um portfólio customizado com diagnóstico
            de perfil. A escola acompanha talentos com ranking, filtros e exportação.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth/register"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue"
          >
            Criar conta
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-brand-blue/30 bg-white/60 px-5 text-sm font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-white/80 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Entrar
          </Link>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-300/60 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-950">Aluno</div>
            <div className="mt-1 text-sm text-slate-700">
              Rascunho automático no celular, finalize no desktop e gere portfólio com diagnóstico de perfil.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-300/60 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-950">Gestão</div>
            <div className="mt-1 text-sm text-slate-700">
              People Analytics inicial com ranking, filtros por competências e export de talentos.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
