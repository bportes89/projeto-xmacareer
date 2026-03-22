import { assessStarField, rewriteStarField, type StarFieldKey } from "@/app/lib/projectAnalysis";

type Provider = "heuristic" | "openai" | "anthropic";

type OpenAIChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

type AnthropicMessagesResponse = {
  content?: Array<{ text?: string }>;
};

function clampText(text: string, max = 4000) {
  const clean = text.replace(/\u0000/g, "").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function getProvider(): Provider {
  const raw = (process.env.AI_PROVIDER ?? "heuristic").toLowerCase().trim();
  if (raw === "openai") return "openai";
  if (raw === "anthropic") return "anthropic";
  return "heuristic";
}

function toFieldLabel(field: StarFieldKey) {
  if (field === "situation") return "Situação";
  if (field === "task") return "Tarefa";
  if (field === "action") return "Ação";
  if (field === "result") return "Resultado";
  return "Desenvolvimento";
}

function buildPrompt(field: StarFieldKey, text: string, projectTitle: string) {
  const assessment = assessStarField(field, text);
  const hints = (assessment.missing.length ? assessment.missing : assessment.guidance).slice(0, 5);

  const title = projectTitle.trim() || "esta experiência";
  return {
    assessment,
    prompt: [
      `Você é um assistente de escrita para alunos. Reescreva o campo "${toFieldLabel(field)}" no método STAR + D da experiência "${title}".`,
      "Objetivo: deixar a resposta mais profunda, específica e clara, mantendo o sentido do original.",
      "Regras:",
      "- Escreva em português do Brasil.",
      "- Não invente fatos. Se faltar número/métrica/prazo, use placeholders entre colchetes (ex: [X%], [N dias], [R$]).",
      "- Use 1 a 3 parágrafos. Para Ação, pode usar bullets curtos se ajudar.",
      "- Não inclua títulos, não cite 'STAR', não inclua explicações meta.",
      "",
      "Texto original:",
      text.trim().length ? text.trim() : "[texto vazio]",
      "",
      "Pontos a reforçar (se aplicável):",
      ...hints.map((h) => `- ${h}`),
    ].join("\n"),
  };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function rewriteWithOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const { ok, json } = await fetchJson(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 900,
        messages: [
          { role: "system", content: "Você é um assistente de escrita objetivo e cuidadoso." },
          { role: "user", content: prompt },
        ],
      }),
    },
  );

  if (!ok || !json || typeof json !== "object") return null;
  const content = (json as OpenAIChatCompletionResponse).choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

async function rewriteWithAnthropic(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const { ok, json } = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
    },
  );

  if (!ok || !json || typeof json !== "object") return null;
  const text = (json as AnthropicMessagesResponse).content?.[0]?.text;
  return typeof text === "string" ? text : null;
}

export async function rewriteStarFieldPluggable(field: StarFieldKey, text: string, projectTitle: string, opts?: { nonce?: number }) {
  const heuristic = rewriteStarField(field, text, projectTitle, opts);
  const provider = getProvider();
  if (provider === "heuristic") return { ...heuristic, provider };

  const { assessment, prompt } = buildPrompt(field, text, projectTitle);

  const aiText =
    provider === "openai" ? await rewriteWithOpenAI(prompt) : provider === "anthropic" ? await rewriteWithAnthropic(prompt) : null;

  const suggestion = aiText ? clampText(aiText) : heuristic.suggestion;
  return { suggestion, guidance: assessment.guidance, score: assessment.score, missing: assessment.missing, provider };
}
