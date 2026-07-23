import { SYSTEM, buildUserMessage } from "./prompt.js";
import { toAdvisoryOrFallback, FAILCLOSED_ADVISORY } from "./schema.js";

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";

// A hung model server must fail CLOSED to human review, never hang the gate.
const MODEL_TIMEOUT_MS = () => Number(process.env.MODEL_TIMEOUT_MS || 60_000);

function extractJson(text) {
  // tolerate models that wrap JSON in prose / code fences / <think> blocks
  const noThink = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = noThink.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object in model output");
  return JSON.parse(match[0]);
}

async function callLocal(action) {
  const body = {
    model: OLLAMA_MODEL,
    messages: [ { role: "system", content: SYSTEM }, { role: "user", content: buildUserMessage(action) } ],
    stream: false,
    format: "json",
    think: false,
    options: { temperature: 0.2, seed: 42 } // fixed seed → reproducible eval at the sampling temperature
  };
  const base = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS())
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const data = await res.json();
  const raw = extractJson(data.message?.content ?? "");
  return { raw, tokens_in: data.prompt_eval_count ?? 0, tokens_out: data.eval_count ?? 0 };
}

async function callCloud(action) {
  const base = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
  const key = process.env.KIMI_API_KEY;
  if (!key) throw new Error("KIMI_API_KEY not set");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.KIMI_MODEL || "kimi-k2",
      messages: [ { role: "system", content: SYSTEM }, { role: "user", content: buildUserMessage(action) } ],
      temperature: 0.2, response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS())
  });
  if (!res.ok) throw new Error(`kimi ${res.status}`);
  const data = await res.json();
  const raw = JSON.parse(data.choices[0].message.content);
  return { raw, tokens_in: data.usage?.prompt_tokens ?? 0, tokens_out: data.usage?.completion_tokens ?? 0 };
}

function callMock(action) {
  const amt = Number(action.amount_hint ?? 0);
  const flags = [];
  if (/lottery|prize|winner|urgent wire/i.test(action.description ?? "")) flags.push("fraud_suspected");
  if (/duplicate|identical/i.test(action.description ?? "")) flags.push("duplicate");
  if (/not seen before|unknown vendor|no po/i.test(action.description ?? "")) flags.push("vendor_unknown");
  if (amt > 1000) flags.push("unusual_amount");
  const known = ["agent_tool_spend", "vendor_invoice", "api_topup", "subscription"];
  const cat = known.includes(action.category_hint) ? action.category_hint : "other";
  const ambiguous = action.amount_hint == null;
  return {
    raw: {
      category: cat,
      est_cost_usd: amt,
      risk_flags: flags,
      confidence: ambiguous ? 0.5 : flags.length ? 0.6 : 0.9,
      rationale: "heuristic assessment (mock backend)",
      draft_note: ambiguous ? "amount missing — confirm with finance" : ""
    },
    tokens_in: 0, tokens_out: 0
  };
}

export async function classify(action, { mode = process.env.MODE || "local" } = {}) {
  const start = Date.now();
  const engine = mode === "cloud" ? (process.env.KIMI_MODEL || "kimi-k2")
    : mode === "mock" ? "mock" : OLLAMA_MODEL;
  try {
    const { raw, tokens_in, tokens_out } =
      mode === "cloud" ? await callCloud(action) : mode === "mock" ? callMock(action) : await callLocal(action);
    return { advisory: toAdvisoryOrFallback(raw), meta: { engine, latency_ms: Date.now() - start, tokens_in, tokens_out } };
  } catch (err) {
    return { advisory: FAILCLOSED_ADVISORY, meta: { engine, latency_ms: Date.now() - start, tokens_in: 0, tokens_out: 0, error: String(err.message || err) } };
  }
}
