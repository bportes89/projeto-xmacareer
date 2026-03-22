import Link from "next/link";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { recomputeUserCompetencyProfile } from "@/app/lib/profile";

function toArray(value: unknown): Array<{ name: string; score: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const name = (x as { name?: unknown }).name;
      const score = (x as { score?: unknown }).score;
      return { name: typeof name === "string" ? name : "N/A", score: typeof score === "number" ? score : 0 };
    })
    .filter((x) => x.name !== "N/A");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export default async function PeopleAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; competency?: string }>;
}) {
  const user = await requireAuthUser();
  if (user.role !== "SCHOOL") return null;

  const { area, competency } = await searchParams;
  const areaFilter = area?.trim() || "";
  const competencyFilter = competency?.trim() || "";

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      competencyProfile: {
        select: {
          updatedAt: true,
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
          leadershipProfile: true,
          leadershipScore: true,
          sourceProjectsCount: true,
        },
      },
    },
  });

  const enriched = await Promise.all(
    students.map(async (s) => {
      const profile = s.competencyProfile ?? (await recomputeUserCompetencyProfile(prisma, s.id));
      const hard = toArray(profile.competenciesHard).slice(0, 5);
      const soft = toArray(profile.competenciesSoft).slice(0, 5);
      const areasAgg = toArray(profile.areas).slice(0, 5);
      return {
        ...s,
        profile,
        hard,
        soft,
        areasAgg,
      };
    }),
  );

  const filtered = enriched.filter((s) => {
    if (areaFilter) {
      const has = s.areasAgg.some((a) => a.name.toLowerCase() === areaFilter.toLowerCase());
      if (!has) return false;
    }
    if (competencyFilter) {
      const key = competencyFilter.toLowerCase();
      const has = [...s.hard, ...s.soft].some((c) => c.name.toLowerCase() === key);
      if (!has) return false;
    }
    return true;
  });

  const ranked = filtered.sort((a, b) => {
    if (b.profile.leadershipScore !== a.profile.leadershipScore) return b.profile.leadershipScore - a.profile.leadershipScore;
    if (b.profile.sourceProjectsCount !== a.profile.sourceProjectsCount) return b.profile.sourceProjectsCount - a.profile.sourceProjectsCount;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">People Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ranking inicial por experiências enviadas e sinais de liderança/competências.
          </p>
        </div>
        <a
          href={`/api/admin/people-analytics/csv${areaFilter || competencyFilter ? `?area=${encodeURIComponent(areaFilter)}&competency=${encodeURIComponent(competencyFilter)}` : ""}`}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-orange bg-white/70 px-4 text-sm font-semibold text-brand-blue shadow-sm backdrop-blur transition hover:-translate-y-px hover:bg-white active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Exportar para planilha
        </a>
      </div>

      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/admin/people-analytics" method="get">
          <div className="flex flex-1 flex-col gap-1">
            <div className="text-sm font-semibold text-slate-900">Filtro por área</div>
            <div className="text-xs text-slate-500">Ex: Dados/Analytics, Marketing, Operações</div>
            <input
              name="area"
              defaultValue={areaFilter}
              className="h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
              placeholder="Dados/Analytics"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <div className="text-sm font-semibold text-slate-900">Filtro por competência</div>
            <div className="text-xs text-slate-500">Ex: SQL, Excel, Comunicação</div>
            <input
              name="competency"
              defaultValue={competencyFilter}
              className="h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
              placeholder="SQL"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Filtrar
            </button>
            <Link
              href="/admin/people-analytics"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-blue/40 bg-white/70 px-4 text-sm font-semibold text-brand-blue shadow-sm backdrop-blur transition hover:-translate-y-px hover:bg-white active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Limpar
            </Link>
          </div>
        </form>
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/60 bg-white/75 p-6 text-sm text-slate-700 shadow-sm backdrop-blur">
          Nenhum talento encontrado com os filtros atuais.
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-300/70 bg-white shadow-sm">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-200/60 bg-white/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur">
            <div className="col-span-5">Talento</div>
            <div className="col-span-2 text-right">Experiências</div>
            <div className="col-span-2 text-right">Liderança</div>
            <div className="col-span-3">Top sinais</div>
          </div>
          {ranked.map((s, idx) => (
            <div
              key={s.id}
              className="grid grid-cols-12 gap-2 border-b border-slate-200/40 px-4 py-4 text-sm text-slate-800 transition hover:bg-white/60 last:border-b-0"
            >
              <div className="col-span-12 sm:col-span-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">{s.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {s.email} •{" "}
                      {s.profile.updatedAt ? `última atividade: ${formatDate(s.profile.updatedAt)}` : "sem experiências enviadas"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-span-4 sm:col-span-2 text-right">
                <div className="font-semibold text-slate-950">{s.profile.sourceProjectsCount}</div>
              </div>
              <div className="col-span-4 sm:col-span-2 text-right">
                <div className="font-semibold text-slate-950">{s.profile.leadershipScore}/100</div>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  {[...s.areasAgg.slice(0, 1), ...s.hard.slice(0, 1), ...s.soft.slice(0, 1)].map((x) => (
                    <div
                      key={x.name}
                      className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
                      title={`${x.score}`}
                    >
                      {x.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
