export type ProjectText = {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  development: string;
};

export type StarFieldKey = "situation" | "task" | "action" | "result" | "development";

export type KeywordRule = {
  label: string;
  keywords: string[];
  score: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(list: T[], seed: number) {
  if (list.length === 0) throw new Error("pick: empty list");
  return list[seed % list.length]!;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((k) => text.includes(k));
}

function extractMatches(text: string, rules: KeywordRule[]) {
  const n = normalize(text);
  const hits = rules
    .filter((r) => includesAny(n, r.keywords))
    .map((r) => ({ label: r.label, score: r.score }));

  const merged = new Map<string, number>();
  for (const h of hits) merged.set(h.label, (merged.get(h.label) ?? 0) + h.score);

  return Array.from(merged.entries())
    .map(([label, score]) => ({ label, score }))
    .sort((a, b) => b.score - a.score);
}

const hardRules: KeywordRule[] = [
  { label: "Excel", keywords: ["excel", "planilha", "power query"], score: 10 },
  { label: "SQL", keywords: ["sql", "select", "join", "query"], score: 12 },
  { label: "Python", keywords: ["python", "pandas", "numpy"], score: 12 },
  { label: "Power BI", keywords: ["power bi", "dax", "dashboard"], score: 12 },
  { label: "Gestão de Projetos", keywords: ["cronograma", "kanban", "scrum", "agile", "backlog"], score: 10 },
  { label: "Pesquisa", keywords: ["pesquisa", "entrevista", "questionario", "survey"], score: 8 },
  { label: "Apresentação", keywords: ["apresentacao", "slide", "pitch"], score: 8 },
];

const softRules: KeywordRule[] = [
  { label: "Comunicação", keywords: ["comunic", "apresentei", "explicar", "alinhamento"], score: 10 },
  { label: "Trabalho em Equipe", keywords: ["equipe", "time", "colabor", "parceria"], score: 10 },
  { label: "Proatividade", keywords: ["proativ", "iniciei", "propus", "antecipei"], score: 10 },
  { label: "Resolução de Problemas", keywords: ["resolver", "problema", "causa raiz", "hipotese"], score: 10 },
  { label: "Organização", keywords: ["organizei", "planejei", "priorizei", "rotina"], score: 8 },
  { label: "Negociação", keywords: ["negoci", "conflito", "acordo"], score: 8 },
];

const areaRules: KeywordRule[] = [
  { label: "Dados/Analytics", keywords: ["sql", "power bi", "dashboard", "kpi", "indicador", "dados"], score: 10 },
  { label: "Produto", keywords: ["produto", "usuario", "ux", "roadmap", "mvp"], score: 10 },
  { label: "Marketing", keywords: ["marketing", "campanha", "leads", "conteudo", "crm"], score: 10 },
  { label: "Operações", keywords: ["processo", "operacao", "logistica", "sop", "padronizei"], score: 10 },
  { label: "Finanças", keywords: ["orcamento", "custos", "receita", "financeiro", "margem"], score: 10 },
  { label: "Pessoas", keywords: ["treinamento", "recrut", "feedback", "clima", "people"], score: 10 },
];

const leadershipRules: KeywordRule[] = [
  { label: "Influência", keywords: ["convenci", "alinhamento", "stakeholder", "influenc"], score: 10 },
  { label: "Coordenação", keywords: ["coordenei", "lider", "deleguei", "organizei", "facilitei"], score: 15 },
  { label: "Iniciativa", keywords: ["iniciei", "propus", "criei", "implementei"], score: 12 },
  { label: "Mentoria", keywords: ["mentorei", "treinei", "ensinei"], score: 10 },
  { label: "Entrega", keywords: ["entreg", "resultado", "meta", "prazo"], score: 8 },
];

export type TaxonomyBundle = {
  hardRules: KeywordRule[];
  softRules: KeywordRule[];
  areaRules: KeywordRule[];
  leadershipRules: KeywordRule[];
};

export function getDefaultTaxonomyBundle(): TaxonomyBundle {
  return {
    hardRules,
    softRules,
    areaRules,
    leadershipRules,
  };
}

function estimateImpactScore(text: string) {
  const n = normalize(text);
  const hasNumbers = /\d/.test(n);
  const hasPercent = n.includes("%") || n.includes("por cento");
  const hasTime = includesAny(n, ["dias", "seman", "mes", "horas", "minutos"]);

  let score = 0;
  if (hasNumbers) score += 10;
  if (hasPercent) score += 10;
  if (hasTime) score += 6;
  return score;
}

export function analyzeProjectText(project: ProjectText, taxonomy?: Partial<TaxonomyBundle>) {
  const combined = `${project.title}\n${project.situation}\n${project.task}\n${project.action}\n${project.result}\n${project.development}`;
  const bundle = getDefaultTaxonomyBundle();
  const rules = {
    hardRules: taxonomy?.hardRules ?? bundle.hardRules,
    softRules: taxonomy?.softRules ?? bundle.softRules,
    areaRules: taxonomy?.areaRules ?? bundle.areaRules,
    leadershipRules: taxonomy?.leadershipRules ?? bundle.leadershipRules,
  };

  const competenciesHard = extractMatches(combined, rules.hardRules).map((x) => ({
    name: x.label,
    score: x.score,
  }));

  const competenciesSoft = extractMatches(combined, rules.softRules).map((x) => ({
    name: x.label,
    score: x.score,
  }));

  const areas = extractMatches(combined, rules.areaRules).map((x) => ({
    name: x.label,
    score: x.score,
  }));

  const leadership = extractMatches(combined, rules.leadershipRules);
  const impactScore = estimateImpactScore(`${project.result}\n${project.action}`);
  const leadershipScoreRaw = leadership.reduce((acc, x) => acc + x.score, 0) + impactScore;
  const leadershipScore = Math.max(0, Math.min(100, Math.round((leadershipScoreRaw / 70) * 100)));

  const leadershipProfile =
    leadershipScore >= 75
      ? "Liderança forte"
      : leadershipScore >= 50
        ? "Influência em execução"
        : leadershipScore >= 30
          ? "Colaboração consistente"
          : "Execução inicial";

  return {
    competenciesHard,
    competenciesSoft,
    areas,
    leadershipProfile,
    leadershipScore,
  };
}

const baseHints: Record<StarFieldKey, string[]> = {
  situation: [
    "Onde aconteceu e qual era o contexto?",
    "Qual era o problema/desafio e por que era importante?",
    "Quem estava envolvido (time, cliente, área)?",
  ],
  task: ["Qual era o objetivo?", "Qual era sua responsabilidade direta?", "Qual era o prazo/restrição?"],
  action: [
    "Quais passos você executou (em ordem)?",
    "Que ferramentas/metodologias você usou?",
    "Como você colaborou e tomou decisões?",
  ],
  result: [
    "Qual foi o impacto e como você mediu?",
    "Que número ou evidência pode incluir (%, tempo, custo)?",
    "Qual foi o aprendizado?",
  ],
  development: [
    "Quais competências você desenvolveu (hard/soft)?",
    "O que faria diferente na próxima vez?",
    "Que próximo passo você recomendaria?",
  ],
};

export function assessStarField(field: StarFieldKey, text: string) {
  const clean = text.trim();
  const n = normalize(clean);

  const hasNumbers = /\d/.test(n);
  const hasPercent = n.includes("%") || n.includes("por cento");
  const hasTime = /\b(dia|dias|semana|semanas|mes|meses|ano|anos|hora|horas|minuto|minutos|prazo|data)\b/.test(
    n,
  );
  const hasStakeholders = includesAny(n, [
    "cliente",
    "usuario",
    "time",
    "equipe",
    "gestor",
    "lider",
    "professor",
    "colega",
    "stakeholder",
    "area",
  ]);
  const hasTools = includesAny(n, [
    "excel",
    "planilha",
    "power query",
    "sql",
    "python",
    "pandas",
    "numpy",
    "power bi",
    "dax",
    "dashboard",
    "kanban",
    "scrum",
    "agile",
    "backlog",
    "crm",
  ]);
  const hasSteps = includesAny(n, ["primeiro", "depois", "em seguida", "entao", "por fim"]) || clean.includes("\n-");
  const sentenceCount = clean
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/g)
    .filter(Boolean).length;

  const lenScore = clamp(Math.round((clean.length / 250) * 40), 0, 40);
  const evidenceScore = clamp((hasNumbers ? 12 : 0) + (hasPercent ? 8 : 0) + (hasTime ? 6 : 0), 0, 20);
  const specificityScore = clamp((hasStakeholders ? 8 : 0) + (hasTools ? 8 : 0) + (hasTime ? 4 : 0), 0, 20);
  const structureScore = clamp(
    (sentenceCount >= 2 ? 10 : 0) + (sentenceCount >= 4 ? 5 : 0) + (hasSteps ? 5 : 0),
    0,
    20,
  );

  const score = clamp(lenScore + evidenceScore + specificityScore + structureScore, 0, 100);

  const missing: string[] = [];
  const addIf = (condition: boolean, hint: string) => {
    if (!condition) missing.push(hint);
  };

  if (field === "situation") {
    addIf(hasTime, "Quando aconteceu e qual era o prazo?");
    addIf(hasStakeholders, baseHints.situation[2]);
    addIf(includesAny(n, ["problema", "desafio", "dor", "dificuld", "queda", "erro", "atraso"]), baseHints.situation[1]);
  }

  if (field === "task") {
    addIf(includesAny(n, ["objetivo", "meta", "precisava", "tinha que", "alvo", "resultado esperado"]), baseHints.task[0]);
    addIf(includesAny(n, ["minha responsabilidade", "meu papel", "fiquei responsavel", "eu era"]), baseHints.task[1]);
    addIf(hasTime, baseHints.task[2]);
  }

  if (field === "action") {
    addIf(hasSteps, baseHints.action[0]);
    addIf(hasTools, baseHints.action[1]);
    addIf(includesAny(n, ["alinhei", "colab", "equipe", "time", "stakeholder", "comuniquei", "apresentei"]), baseHints.action[2]);
  }

  if (field === "result") {
    addIf(includesAny(n, ["reduz", "aument", "melhor", "entreg", "ating", "cresci", "econom", "otimiz"]), baseHints.result[0]);
    addIf(hasNumbers, baseHints.result[1]);
    addIf(includesAny(n, ["aprendi", "aprendizado", "licao", "lição"]), baseHints.result[2]);
  }

  if (field === "development") {
    addIf(
      includesAny(n, [
        ...hardRules.flatMap((r) => r.keywords),
        ...softRules.flatMap((r) => r.keywords),
        "competenc",
        "habilidad",
        "skill",
      ]),
      baseHints.development[0],
    );
    addIf(includesAny(n, ["da proxima", "proxima vez", "próxima vez", "faria diferente", "melhoraria"]), baseHints.development[1]);
    addIf(includesAny(n, ["proximo passo", "próximo passo", "recomendo", "continuaria", "planejo"]), baseHints.development[2]);
  }

  const guidance = baseHints[field];

  return { score, missing, guidance };
}

export function rewriteStarField(
  field: StarFieldKey,
  text: string,
  projectTitle: string,
  opts?: { nonce?: number },
) {
  const clean = text.trim();
  const title = projectTitle.trim() || "esta experiência";
  const assessment = assessStarField(field, clean);

  const seed = stableHash(`${field}|${title}|${clean}|${opts?.nonce ?? 0}`);
  const openers = [
    `No contexto da experiência ${title},`,
    `Durante a experiência ${title},`,
    `Na experiência ${title},`,
    `Ao trabalhar na experiência ${title},`,
  ];
  const opener = pick(openers, seed);

  const missing = assessment.missing.length ? assessment.missing : assessment.guidance;
  const topMissing = missing.slice(0, 3);

  const tooShallow = clean.length < 80 || assessment.score < 55;

  if (tooShallow) {
    const starters = [
      clean.length ? clean : "[descreva aqui o que aconteceu]",
      clean.length ? `Resumo: ${clean}` : "[resuma o que aconteceu em 1 frase]",
    ];
    const start = pick(starters, seed + 7);

    return {
      suggestion: [
        opener,
        start,
        "",
        "Complete com mais profundidade:",
        ...topMissing.map((h) => `- ${h}`),
      ].join("\n"),
      guidance: assessment.guidance,
      score: assessment.score,
      missing: assessment.missing,
    };
  }

  const sentences = clean
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/g)
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => (s.endsWith(".") ? s : `${s}.`));

  const closers = [
    "Se possível, inclua evidências (números, prazo, escala).",
    "Se puder, adicione um dado (%, tempo, volume, custo) para sustentar o impacto.",
    "Se fizer sentido, detalhe como você mediu o resultado (métrica/KPI).",
  ];
  const closer = pick(closers, seed + 13);

  const missingBlock =
    topMissing.length > 0
      ? ["", "Para deixar ainda melhor:", ...topMissing.map((h) => `- ${h}`)]
      : [];

  return {
    suggestion: [opener, ...sentences, ...missingBlock, "", closer].join("\n"),
    guidance: assessment.guidance,
    score: assessment.score,
    missing: assessment.missing,
  };
}
