import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function csvEscape(value: string) {
  const needsQuotes = /[,"\n\r;]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "desc" }],
    select: {
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
      updatedAt: true,
      analysis: { select: { leadershipProfile: true, leadershipScore: true } },
    },
  });

  const header = [
    "titulo",
    "headline",
    "tipo_experiencia",
    "organizacao",
    "papel",
    "local",
    "inicio",
    "fim",
    "url_projeto",
    "url_repositorio",
    "tags",
    "descricao",
    "competencias_confirmadas",
    "situacao",
    "tarefa",
    "acao",
    "resultado",
    "desenvolvimento",
    "evidencias_urls",
    "lideranca_perfil",
    "lideranca_score",
    "atualizado_em",
  ];

  const rows = projects.map((p) => [
    p.title ?? "",
    p.headline ?? "",
    p.experienceType ?? "",
    p.organization ?? "",
    p.roleTitle ?? "",
    p.location ?? "",
    p.startDate ? p.startDate.toISOString().slice(0, 7) : "",
    p.endDate ? p.endDate.toISOString().slice(0, 7) : "",
    p.projectUrl ?? "",
    p.repoUrl ?? "",
    Array.isArray(p.tags)
      ? p.tags
          .filter((x) => typeof x === "string")
          .map((x) => x.trim())
          .filter((x) => x.length)
          .join(",")
      : "",
    p.experienceDescription ?? "",
    (() => {
      const cc = p.confirmedCompetencies as { hard?: unknown; soft?: unknown; areas?: unknown } | null;
      if (!cc || typeof cc !== "object") return "";
      const hard = Array.isArray(cc.hard) ? cc.hard.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
      const soft = Array.isArray(cc.soft) ? cc.soft.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
      const areas = Array.isArray(cc.areas) ? cc.areas.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
      const parts = [
        hard.length ? `hard:${hard.join(",")}` : null,
        soft.length ? `soft:${soft.join(",")}` : null,
        areas.length ? `areas:${areas.join(",")}` : null,
      ].filter((x): x is string => typeof x === "string" && x.length > 0);
      return parts.join(" | ");
    })(),
    p.situation ?? "",
    p.task ?? "",
    p.action ?? "",
    p.result ?? "",
    p.development ?? "",
    Array.isArray(p.evidences)
      ? p.evidences
          .filter((x) => x && typeof x === "object")
          .map((x) => (typeof (x as { url?: unknown }).url === "string" ? (x as { url: string }).url : ""))
          .filter((x) => x.length)
          .join(",")
      : "",
    p.analysis?.leadershipProfile ?? "",
    String(p.analysis?.leadershipScore ?? ""),
    p.updatedAt.toISOString(),
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="cv.csv"',
    },
  });
}
