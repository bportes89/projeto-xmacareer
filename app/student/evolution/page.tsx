import Link from "next/link";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

function toArray(value: unknown): Array<{ name: string; score: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const name = (x as { name?: unknown }).name;
      const score = (x as { score?: unknown }).score;
      return { name: typeof name === "string" ? name : "N/A", score: typeof score === "number" ? score : 0 };
    })
    .filter((x) => x.name !== "N/A")
    .slice(0, 50);
}

function aggregate(items: Array<Array<{ name: string; score: number }>>) {
  const m = new Map<string, number>();
  for (const arr of items) {
    for (const i of arr) m.set(i.name, (m.get(i.name) ?? 0) + i.score);
  }
  return Array.from(m.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function EvolutionPage() {
  const user = await requireAuthUser();
  const taxonomy = await getTaxonomyBundle(prisma);

  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "asc" }],
    select: {
      id: true,
      title: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
      updatedAt: true,
      analysis: {
        select: {
          leadershipProfile: true,
          leadershipScore: true,
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
        },
      },
    },
  });

  const hydrated = await Promise.all(
    projects.map(async (p) => {
      if (p.analysis) return p;
      const analysis = analyzeProjectText(p, taxonomy);
      const saved = await prisma.projectAnalysis.upsert({
        where: { projectId: p.id },
        create: {
          projectId: p.id,
          competenciesHard: analysis.competenciesHard,
          competenciesSoft: analysis.competenciesSoft,
          areas: analysis.areas,
          leadershipProfile: analysis.leadershipProfile,
          leadershipScore: analysis.leadershipScore,
        },
        update: {
          competenciesHard: analysis.competenciesHard,
          competenciesSoft: analysis.competenciesSoft,
          areas: analysis.areas,
          leadershipProfile: analysis.leadershipProfile,
          leadershipScore: analysis.leadershipScore,
        },
        select: {
          leadershipProfile: true,
          leadershipScore: true,
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
        },
      });
      return { ...p, analysis: saved };
    }),
  );

  const series = hydrated.map((p) => ({
    id: p.id,
    title: p.title?.trim().length ? p.title : "Experiência sem título",
    updatedAt: p.updatedAt,
    leadershipScore: p.analysis?.leadershipScore ?? 0,
    leadershipProfile: p.analysis?.leadershipProfile ?? "N/A",
    topArea: toArray(p.analysis?.areas)[0]?.name ?? "N/A",
  }));

  const avg =
    series.length > 0
      ? Math.round((series.reduce((acc, x) => acc + x.leadershipScore, 0) / series.length) * 10) / 10
      : 0;
  const delta = series.length >= 2 ? series[series.length - 1].leadershipScore - series[0].leadershipScore : 0;

  const topHard = aggregate(hydrated.map((p) => toArray(p.analysis?.competenciesHard))).slice(0, 8);
  const topSoft = aggregate(hydrated.map((p) => toArray(p.analysis?.competenciesSoft))).slice(0, 8);
  const topAreas = aggregate(hydrated.map((p) => toArray(p.analysis?.areas))).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Evolução</h1>
          <p className="mt-1 text-sm text-slate-600">Acompanhe tendências de liderança, áreas e competências.</p>
        </div>
        <Link
          href="/student/projects"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-blue/50 bg-white px-4 text-sm font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
        >
          Ver experiências
        </Link>
      </div>

      {series.length === 0 ? (
        <div className="rounded-3xl border border-slate-300/70 bg-white p-6 text-sm text-slate-700 shadow-sm">
          Envie ao menos uma experiência para ver sua evolução.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Experiências enviadas</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{series.length}</div>
            </div>
            <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Liderança (média)</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{avg}/100</div>
            </div>
            <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Evolução (início → atual)</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {delta >= 0 ? "+" : ""}
                {delta}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Linha do tempo (liderança)</div>
            <div className="mt-4 flex flex-col gap-3">
              {series.map((p) => (
                <div key={p.id} className="grid gap-2 sm:grid-cols-[1fr,120px] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">{p.title}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(p.updatedAt)} • {p.topArea} •{" "}
                      {p.leadershipProfile}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-full rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-brand-orange"
                        style={{ width: `${clamp(p.leadershipScore, 0, 100)}%` }}
                      />
                    </div>
                    <div className="w-[48px] text-right text-xs font-semibold text-slate-700">{p.leadershipScore}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Top áreas</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topAreas.map((a) => (
                  <span
                    key={a.name}
                    className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Top hard skills</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topHard.map((a) => (
                  <span
                    key={a.name}
                    className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Top soft skills</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topSoft.map((a) => (
                  <span
                    key={a.name}
                    className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
