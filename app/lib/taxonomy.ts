import type { PrismaClient, TaxonomyCategory } from "@prisma/client";

import { type KeywordRule, getDefaultTaxonomyBundle, type TaxonomyBundle } from "@/app/lib/projectAnalysis";

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => (typeof x === "string" ? x : "")).filter((x) => x.trim().length > 0);
}

function categoryToKey(category: TaxonomyCategory) {
  if (category === "HARD") return "hardRules";
  if (category === "SOFT") return "softRules";
  if (category === "AREA") return "areaRules";
  return "leadershipRules";
}

export async function getTaxonomyBundle(prisma: PrismaClient): Promise<TaxonomyBundle> {
  const model = (prisma as unknown as { skillTaxonomyRule?: { count: () => Promise<number> } }).skillTaxonomyRule;
  if (!model) return getDefaultTaxonomyBundle();

  const existing = await model.count().catch(() => 0);
  if (existing === 0) {
    const defaults = getDefaultTaxonomyBundle();
    const seed: Array<{ category: TaxonomyCategory; label: string; keywords: string[]; weight: number; active: boolean }> =
      [];

    for (const r of defaults.hardRules) seed.push({ category: "HARD", label: r.label, keywords: r.keywords, weight: r.score, active: true });
    for (const r of defaults.softRules) seed.push({ category: "SOFT", label: r.label, keywords: r.keywords, weight: r.score, active: true });
    for (const r of defaults.areaRules) seed.push({ category: "AREA", label: r.label, keywords: r.keywords, weight: r.score, active: true });
    for (const r of defaults.leadershipRules)
      seed.push({ category: "LEADERSHIP", label: r.label, keywords: r.keywords, weight: r.score, active: true });

    await prisma.skillTaxonomyRule
      .createMany({
        data: seed.map((s) => ({
          category: s.category,
          label: s.label,
          keywords: s.keywords,
          weight: Math.max(0, Math.min(100, Math.round(s.weight))),
          active: s.active,
        })),
      })
      .catch(() => null);
  }

  const active = await prisma.skillTaxonomyRule.findMany({
    where: { active: true },
    select: { category: true, label: true, keywords: true, weight: true },
    orderBy: [{ category: "asc" }, { label: "asc" }],
  });

  const grouped: Partial<Record<keyof TaxonomyBundle, KeywordRule[]>> = {};
  for (const r of active) {
    const key = categoryToKey(r.category);
    const arr = (grouped[key] ??= []);
    arr.push({
      label: r.label,
      keywords: toStringArray(r.keywords),
      score: typeof r.weight === "number" ? r.weight : 10,
    });
  }

  const defaults = getDefaultTaxonomyBundle();
  return {
    hardRules: grouped.hardRules?.length ? grouped.hardRules : defaults.hardRules,
    softRules: grouped.softRules?.length ? grouped.softRules : defaults.softRules,
    areaRules: grouped.areaRules?.length ? grouped.areaRules : defaults.areaRules,
    leadershipRules: grouped.leadershipRules?.length ? grouped.leadershipRules : defaults.leadershipRules,
  };
}
