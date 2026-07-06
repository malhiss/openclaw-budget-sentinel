import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { classify } from "./model.js";
import { decide, loadPolicy } from "./governance.js";
import { toAdvisoryOrFallback } from "./schema.js";
import { append, verify } from "./ledger.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, "..", "data");
const LEDGER = join(DATA, "ledger.jsonl");

export async function runBatch({ mode = process.env.MODE || "local" } = {}) {
  const actions = JSON.parse(readFileSync(join(DATA, "actions.json"), "utf8"));
  const policy = loadPolicy(join(DATA, "policy.json"));
  const rows = [];
  for (const action of actions) {
    const { advisory, meta } = await classify(action, { mode });
    const safe = toAdvisoryOrFallback(advisory);
    const decision = decide(safe, action, policy);
    append(LEDGER, { type: "agent_decision", action_id: action.id, title: action.title,
      advisory: safe, decision, engine: meta.engine, latency_ms: meta.latency_ms });
    rows.push({ id: action.id, title: action.title, cost: safe.est_cost_usd,
      conf: safe.confidence, flags: safe.risk_flags, verdict: decision.verdict, reason: decision.reasons[0] });
  }
  return { rows, ledgerPath: LEDGER, policy };
}

function board(rows) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log("\n  OpenClaw Budget Sentinel - triage board\n");
  console.log("  " + pad("ID", 5) + pad("VERDICT", 16) + pad("COST", 8) + pad("CONF", 6) + "REASON");
  console.log("  " + "-".repeat(84));
  for (const r of rows)
    console.log("  " + pad(r.id, 5) + pad(r.verdict, 16) + pad("$" + r.cost, 8) + pad(r.conf, 6) + r.reason);
  const auto = rows.filter((r) => r.verdict === "AUTO_APPROVE").length;
  console.log(`\n  ${auto}/${rows.length} auto-approved - ${rows.length - auto} routed to a human (the 20%).`);
}

if (process.argv[1]?.endsWith("agent.js")) {
  runBatch().then(({ rows, ledgerPath }) => {
    board(rows);
    const v = verify(ledgerPath);
    console.log(`  Ledger integrity: ${v.ok ? "VERIFIED" : "BROKEN at " + v.brokenAt} (${ledgerPath})\n`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
