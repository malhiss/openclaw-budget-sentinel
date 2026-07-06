import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { classify } from "../src/model.js";
import { decide, loadPolicy } from "../src/governance.js";
import { toAdvisoryOrFallback } from "../src/schema.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const mode = process.env.MODE || "local";
const cases = JSON.parse(readFileSync(join(__dir, "cases.json"), "utf8"));
const policy = loadPolicy(join(__dir, "..", "data", "policy.json"));

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const results = [];
for (const c of cases) {
  const { advisory, meta } = await classify(c.action, { mode });
  const decision = decide(toAdvisoryOrFallback(advisory), c.action, policy);
  results.push({
    id: c.action.id, expected: c.expected_verdict, got: decision.verdict,
    correct: decision.verdict === c.expected_verdict,
    latency_ms: meta.latency_ms, tokens: (meta.tokens_in || 0) + (meta.tokens_out || 0), engine: meta.engine
  });
  process.stdout.write(`  ${c.action.id}: expected ${c.expected_verdict.padEnd(14)} got ${decision.verdict.padEnd(14)} ${decision.verdict === c.expected_verdict ? "ok" : "MISS"}\n`);
}

const correct = results.filter((r) => r.correct).length;
// SAFETY: any item that should NOT have auto-approved (BLOCK / HOLD / ESCALATE) but got AUTO_APPROVE — a real risk slipping through
const unsafe = results.filter((r) => r.expected !== "AUTO_APPROVE" && r.got === "AUTO_APPROVE");
const lat = results.map((r) => r.latency_ms);
const summary = {
  engine: results[0]?.engine, n: results.length,
  accuracy: +(correct / results.length).toFixed(3),
  false_auto_approve_rate: +(unsafe.length / results.length).toFixed(3),
  false_auto_approve_ids: unsafe.map((r) => r.id),
  latency_p50_ms: percentile(lat, 0.5), latency_p95_ms: percentile(lat, 0.95),
  avg_tokens_per_decision: Math.round(mean(results.map((r) => r.tokens))),
  ran_at: new Date().toISOString()
};
writeFileSync(join(__dir, "results.json"), JSON.stringify({ summary, results }, null, 2));

console.log(`\n| metric | value |`);
console.log(`|---|---|`);
console.log(`| engine | ${summary.engine} |`);
console.log(`| cases | ${summary.n} |`);
console.log(`| decision accuracy | ${(summary.accuracy * 100).toFixed(1)}% |`);
console.log(`| **false auto-approve (safety)** | ${(summary.false_auto_approve_rate * 100).toFixed(1)}%${summary.false_auto_approve_ids.length ? " (" + summary.false_auto_approve_ids.join(",") + ")" : ""} |`);
console.log(`| latency p50 / p95 (warm) | ${summary.latency_p50_ms} / ${summary.latency_p95_ms} ms |`);
console.log(`| avg tokens / decision | ${summary.avg_tokens_per_decision} |`);
console.log(`\nWrote eval/results.json`);
