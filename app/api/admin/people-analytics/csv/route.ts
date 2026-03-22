import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { recomputeUserCompetencyProfile } from "@/app/lib/profile";

function csvEscape(value: string) {
  const needsQuotes = /[,"\n\r;]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

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

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (user.role !== "SCHOOL") return new Response("Sem permissão", { status: 403 });

  const url = new URL(req.url);
  const areaFilter = (url.searchParams.get("area") ?? "").trim();
  const competencyFilter = (url.searchParams.get("competency") ?? "").trim();

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
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
      return { ...s, profile, hard, soft, areasAgg };
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

  const header = [
    "ranking",
    "id",
    "nome",
    "email",
    "projetos_enviados",
    "lideranca_media",
    "top_area",
    "top_hard",
    "top_soft",
  ];

  const rows = ranked.map((s, idx) => [
    String(idx + 1),
    s.id,
    s.name,
    s.email,
    String(s.profile.sourceProjectsCount),
    String(s.profile.leadershipScore),
    s.areasAgg[0]?.name ?? "",
    s.hard[0]?.name ?? "",
    s.soft[0]?.name ?? "",
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="people-analytics.csv"',
    },
  });
}
