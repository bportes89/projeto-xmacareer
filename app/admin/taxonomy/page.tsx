import { revalidatePath } from "next/cache";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => (typeof x === "string" ? x : "")).filter((x) => x.trim().length > 0);
}

function parseKeywords(input: string) {
  return input
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 50);
}

function toCategoryLabel(category: string) {
  if (category === "HARD") return "Hard skills";
  if (category === "SOFT") return "Soft skills";
  if (category === "AREA") return "Áreas";
  return "Liderança";
}

export default async function TaxonomyAdminPage() {
  const user = await requireAuthUser();
  if (user.role !== "SCHOOL") return null;

  await getTaxonomyBundle(prisma);

  const rules = await prisma.skillTaxonomyRule.findMany({
    orderBy: [{ category: "asc" }, { label: "asc" }],
    select: { id: true, category: true, label: true, keywords: true, weight: true, active: true, updatedAt: true },
  });

  const categories = Array.from(new Set(rules.map((r) => r.category)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Taxonomia</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure regras de extração por palavras-chave (hard/soft/áreas/liderança).
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <form action={createRule} className="grid gap-3 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-3">
            <div className="text-sm font-semibold text-slate-900">Categoria</div>
            <select
              name="category"
              className="mt-1 h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
              defaultValue="HARD"
            >
              <option value="HARD">Hard</option>
              <option value="SOFT">Soft</option>
              <option value="AREA">Área</option>
              <option value="LEADERSHIP">Liderança</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <div className="text-sm font-semibold text-slate-900">Label</div>
            <input
              name="label"
              className="mt-1 h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
              placeholder="Ex: SQL"
              required
              maxLength={60}
            />
          </div>
          <div className="sm:col-span-4">
            <div className="text-sm font-semibold text-slate-900">Keywords (separadas por vírgula)</div>
            <input
              name="keywords"
              className="mt-1 h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
              placeholder="sql, select, join"
              required
            />
          </div>
          <div className="sm:col-span-1">
            <div className="text-sm font-semibold text-slate-900">Peso</div>
            <input
              name="weight"
              type="number"
              min={0}
              max={100}
              defaultValue={10}
              className="mt-1 h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
            />
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-brand-orange px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0"
            >
              Adicionar
            </button>
          </div>
        </form>
      </div>

      {categories.map((cat) => {
        const items = rules.filter((r) => r.category === cat);
        return (
          <div key={cat} className="overflow-hidden rounded-3xl border border-slate-300/70 bg-white shadow-sm">
            <div className="border-b border-slate-200/60 bg-white/50 px-5 py-4">
              <div className="text-sm font-semibold text-slate-950">{toCategoryLabel(cat)}</div>
              <div className="mt-1 text-xs text-slate-600">{items.length} regra(s)</div>
            </div>
            <div className="divide-y divide-slate-200/60">
              {items.map((r) => {
                const keywords = toStringArray(r.keywords).join(", ");
                return (
                  <div key={r.id} className="grid gap-3 px-5 py-4 sm:grid-cols-12 sm:items-center">
                    <div className="sm:col-span-2">
                      <div className="text-sm font-semibold text-slate-950">{r.label}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Atualizado{" "}
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(r.updatedAt)}
                      </div>
                    </div>
                    <form action={updateRule} className="grid gap-3 sm:col-span-9 sm:grid-cols-12 sm:items-center">
                      <input type="hidden" name="id" value={r.id} />
                      <div className="sm:col-span-8">
                        <input
                          name="keywords"
                          defaultValue={keywords}
                          className="h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          name="weight"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={r.weight}
                          className="h-10 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input
                            name="active"
                            type="checkbox"
                            defaultChecked={r.active}
                            className="h-4 w-4 rounded border-slate-300 text-brand-orange focus:ring-brand-orange/30"
                          />
                          Ativo
                        </label>
                        <button
                          type="submit"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300/70 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
                        >
                          Salvar
                        </button>
                      </div>
                    </form>
                    <form action={deleteRule} className="sm:col-span-1 sm:flex sm:justify-end">
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs font-semibold text-rose-700 hover:underline">
                        Excluir
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function createRule(formData: FormData) {
  "use server";
  const user = await requireAuthUser();
  if (user.role !== "SCHOOL") return;

  const category = String(formData.get("category") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 60);
  const keywordsRaw = String(formData.get("keywords") ?? "");
  const weight = Number(formData.get("weight") ?? 10);

  if (!label.length) return;
  if (!["HARD", "SOFT", "AREA", "LEADERSHIP"].includes(category)) return;

  const keywords = parseKeywords(keywordsRaw);
  if (keywords.length === 0) return;

  await prisma.skillTaxonomyRule.create({
    data: {
      category: category as "HARD" | "SOFT" | "AREA" | "LEADERSHIP",
      label,
      keywords,
      weight: Number.isFinite(weight) ? Math.max(0, Math.min(100, Math.round(weight))) : 10,
      active: true,
    },
  });

  revalidatePath("/admin/taxonomy");
}

async function updateRule(formData: FormData) {
  "use server";
  const user = await requireAuthUser();
  if (user.role !== "SCHOOL") return;

  const id = String(formData.get("id") ?? "").trim();
  const keywordsRaw = String(formData.get("keywords") ?? "");
  const weight = Number(formData.get("weight") ?? 10);
  const active = formData.get("active") === "on";

  if (!id.length) return;
  const keywords = parseKeywords(keywordsRaw);

  await prisma.skillTaxonomyRule.updateMany({
    where: { id },
    data: {
      keywords,
      weight: Number.isFinite(weight) ? Math.max(0, Math.min(100, Math.round(weight))) : 10,
      active,
    },
  });

  revalidatePath("/admin/taxonomy");
}

async function deleteRule(formData: FormData) {
  "use server";
  const user = await requireAuthUser();
  if (user.role !== "SCHOOL") return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id.length) return;

  await prisma.skillTaxonomyRule.deleteMany({ where: { id } });
  revalidatePath("/admin/taxonomy");
}

