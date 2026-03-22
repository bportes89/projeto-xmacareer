import { notFound } from "next/navigation";

import { prisma } from "@/app/lib/prisma";

function toEvidenceArray(value: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const label = (x as { label?: unknown }).label;
      const url = (x as { url?: unknown }).url;
      return { label: typeof label === "string" ? label : "", url: typeof url === "string" ? url : "" };
    })
    .filter((x) => x.label.trim().length > 0 && x.url.trim().length > 0)
    .slice(0, 20);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function experienceLabel(value: string | null | undefined) {
  if (value === "ACADEMIC") return "Acadêmico";
  if (value === "INTERNSHIP") return "Estágio";
  if (value === "WORK") return "Trabalho";
  if (value === "VOLUNTEER") return "Voluntariado";
  if (value === "PERSONAL") return "Pessoal";
  if (value === "EVENT") return "Evento";
  if (value === "OTHER") return "Outro";
  return null;
}

function formatMonthYear(value: Date | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(d);
}

function normalizeConfirmedCompetencies(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as { hard?: unknown; soft?: unknown; areas?: unknown };
  const hard = Array.isArray(v.hard) ? v.hard.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const soft = Array.isArray(v.soft) ? v.soft.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const areas = Array.isArray(v.areas) ? v.areas.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  return {
    hard: Array.from(new Set(hard.map((x) => x.trim()))).slice(0, 30),
    soft: Array.from(new Set(soft.map((x) => x.trim()))).slice(0, 30),
    areas: Array.from(new Set(areas.map((x) => x.trim()))).slice(0, 30),
  };
}

export default async function PublicPortfolioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const share = await prisma.portfolioShare.findFirst({
    where: { token, enabled: true },
    select: { userId: true, user: { select: { name: true } } },
  });
  if (!share) notFound();

  const projects = await prisma.project.findMany({
    where: { userId: share.userId, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      headline: true,
      experienceDescription: true,
      experienceType: true,
      organization: true,
      roleTitle: true,
      location: true,
      startDate: true,
      endDate: true,
      projectUrl: true,
      repoUrl: true,
      tags: true,
      confirmedCompetencies: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
      evidences: true,
      analysis: { select: { leadershipProfile: true, leadershipScore: true } },
      evidenceFiles: { select: { id: true, name: true, size: true, createdAt: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="rounded-3xl border border-slate-300/70 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Portfólio</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{share.user.name}</h1>
        <div className="mt-1 text-sm text-slate-600">Experiências em STAR + D</div>
      </div>

      <div className="mt-6 grid gap-4">
        {projects.length === 0 ? (
          <div className="rounded-3xl border border-slate-300/70 bg-white p-6 text-sm text-slate-700 shadow-sm">
            Ainda não há experiências públicas.
          </div>
        ) : (
          projects.map((p) => {
            const title = p.title?.trim().length ? p.title : "Experiência sem título";
            const evidences = toEvidenceArray(p.evidences);
            const confirmed = normalizeConfirmedCompetencies(p.confirmedCompetencies);
            const confirmedChips =
              confirmed && (confirmed.hard.length || confirmed.soft.length || confirmed.areas.length)
                ? [...confirmed.areas.slice(0, 4), ...confirmed.soft.slice(0, 4), ...confirmed.hard.slice(0, 4)]
                : null;
            const metaParts = [
              experienceLabel(p.experienceType),
              p.organization?.trim().length ? p.organization.trim() : null,
              p.roleTitle?.trim().length ? p.roleTitle.trim() : null,
              (() => {
                const start = formatMonthYear(p.startDate);
                const end = formatMonthYear(p.endDate);
                if (start && end) return `${start} – ${end}`;
                if (start) return `${start} – atual`;
                if (end) return end;
                return null;
              })(),
              p.location?.trim().length ? p.location.trim() : null,
            ].filter((x): x is string => typeof x === "string" && x.length > 0);
            const headline = p.headline?.trim().length ? p.headline.trim() : null;
            const experienceDescription = p.experienceDescription?.trim().length ? p.experienceDescription.trim() : null;
            return (
              <div key={p.id} className="rounded-3xl border border-slate-300/70 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="text-base font-semibold text-slate-950">{title}</div>
                    {headline ? <div className="text-sm text-slate-700">{headline}</div> : null}
                    {experienceDescription ? <div className="text-sm text-slate-700">{experienceDescription}</div> : null}
                    {metaParts.length ? <div className="text-xs text-slate-600">{metaParts.join(" • ")}</div> : null}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.analysis?.leadershipProfile} • {p.analysis?.leadershipScore}/100
                  </div>
                </div>

                {p.projectUrl?.trim().length || p.repoUrl?.trim().length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.projectUrl?.trim().length ? (
                      <a
                        href={p.projectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-brand-blue hover:underline"
                      >
                        Link da experiência
                      </a>
                    ) : null}
                    {p.repoUrl?.trim().length ? (
                      <a
                        href={p.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-brand-blue hover:underline"
                      >
                        Repositório
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {Array.isArray(p.tags) && p.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.tags
                      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                      .slice(0, 10)
                      .map((t) => (
                        <div
                          key={t}
                          className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
                        >
                          {t}
                        </div>
                      ))}
                  </div>
                ) : null}

                {confirmedChips ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {confirmedChips.map((t) => (
                      <div
                        key={t}
                        className="rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-slate-800"
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                ) : null}

                {evidences.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {evidences.slice(0, 8).map((e) => (
                      <a
                        key={`${e.label}-${e.url}`}
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-brand-blue hover:underline"
                        title={e.url}
                      >
                        {e.label}
                      </a>
                    ))}
                  </div>
                ) : null}

                {p.evidenceFiles.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {p.evidenceFiles.slice(0, 8).map((f) => (
                      <a
                        key={f.id}
                        href={`/api/public-portfolio/${token}/evidence-files/${f.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300/70 bg-white px-3 py-2 text-sm font-semibold text-brand-blue shadow-sm hover:underline"
                        title={f.name}
                      >
                        <span className="min-w-0 truncate">{f.name}</span>
                        <span className="text-xs font-semibold text-slate-600">{formatBytes(f.size)}</span>
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Section title="Situação" text={p.situation} />
                  <Section title="Tarefa" text={p.task} />
                  <Section title="Ação" text={p.action} />
                  <Section title="Resultado" text={p.result} />
                </div>
                <div className="mt-3">
                  <Section title="Desenvolvimento" text={p.development} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{text?.trim().length ? text : "—"}</div>
    </div>
  );
}
