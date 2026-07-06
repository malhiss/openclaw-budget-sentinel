import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { append, readAll, verify } from "./ledger.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(__dir, "..", "data", "ledger.jsonl");

const [, , actionId, verb, ...noteParts] = process.argv;
if (!actionId || !["approve", "reject"].includes(verb)) {
  console.log("Usage: node src/approve.js <actionId> <approve|reject> [note]");
  process.exit(1);
}
const entries = readAll(LEDGER);
const decision = entries.find((e) => e.payload?.action_id === actionId && e.payload?.type === "agent_decision");
if (!decision) { console.error(`No decision found for ${actionId}. Run 'npm start' first.`); process.exit(1); }
const v = decision.payload.decision.verdict;
if (v === "AUTO_APPROVE") { console.error(`${actionId} was AUTO_APPROVE - no human action needed.`); process.exit(1); }

append(LEDGER, { type: "human_review", action_id: actionId, human_verdict: verb.toUpperCase(),
  reviewer: process.env.APPROVER || "reviewer@elchai", note: noteParts.join(" ") || "", of_agent_verdict: v });
const res = verify(LEDGER);
console.log(`Recorded ${verb.toUpperCase()} for ${actionId} (agent said ${v}). Ledger: ${res.ok ? "VERIFIED" : "BROKEN@" + res.brokenAt}`);
