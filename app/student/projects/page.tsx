import Link from "next/link";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default async function StudentProjectsPage() {
  const user = await requireAuthUser();

  const [projects, participatingRows] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        status: string;
        updatedAt: Date;
        createdAt: Date;
        ownerName: string | null;
        ownerEmail: string | null;
      }>
    >`
      SELECT p.id, p.title, p.status, p.updatedAt, p.createdAt, u.name AS ownerName, u.email AS ownerEmail
      FROM "ProjectParticipant" pp
      JOIN "Project" p ON p.id = pp.projectId
      JOIN "User" u ON u.id = p.userId
      WHERE pp.userId = ${user.id} AND pp.status = 'ACTIVE'
      ORDER BY p.updatedAt DESC
    `,
  ]);

  const participating = participatingRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as "DRAFT" | "SUBMITTED",
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    user: { name: r.ownerName ?? "", email: r.ownerEmail ?? "" },
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Experiências</h1>
          <p className="mt-1 text-sm text-slate-600">
            Comece no celular, finalize no desktop. Tudo salva automaticamente.
          </p>
        </div>
        <Link
          href="/student/projects/new"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Nova experiência
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border border-slate-300/70 bg-white p-6 text-sm text-slate-700 shadow-sm">
          Você ainda não cadastrou nenhuma experiência.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const title = p.title?.trim().length ? p.title : "Experiência sem título";
            return (
              <Link
                key={p.id}
                href={`/student/projects/${p.id}`}
                className="group rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-950">{title}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Atualizado em {formatDateTime(p.updatedAt)}
                    </div>
                  </div>
                  <div
                    className={
                      p.status === "SUBMITTED"
                        ? "rounded-full bg-brand-blue/15 px-3 py-1 text-xs font-semibold text-brand-blue"
                        : "rounded-full bg-brand-orange/15 px-3 py-1 text-xs font-semibold text-brand-orange"
                    }
                  >
                    {p.status === "SUBMITTED" ? "Enviado" : "Rascunho"}
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-500">
                  Criado em {formatDateTime(p.createdAt)}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {participating.length ? (
        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold text-slate-900">Experiências em que você participa</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {participating.map((p) => {
              const title = p.title?.trim().length ? p.title : "Experiência sem título";
              const owner = p.user?.name?.trim().length ? p.user.name : p.user?.email ?? "Autor";
              return (
                <Link
                  key={p.id}
                  href={`/student/projects/${p.id}`}
                  className="group rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-950">{title}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        Por {owner} • Atualizado em {formatDateTime(p.updatedAt)}
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700">
                      Participante
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-slate-500">Criado em {formatDateTime(p.createdAt)}</div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
