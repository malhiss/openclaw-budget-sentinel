import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, CAN_AUTO_EXECUTE } from "../src/governance.js";

const POLICY = {
  policy_version: "t", autoApproveLimit: 250, minConfidence: 0.75,
  deniedCategories: [], hardBlockFlags: ["policy_violation", "fraud_suspected"],
  perCategoryCap: { api_topup: 250, agent_tool_spend: 100, other: 0 }
};
const action = { id: "A1", title: "x" };
const base = { category: "api_topup", est_cost_usd: 100, risk_flags: [], confidence: 0.9,
  rationale: "ok", draft_note: "" };

test("auto-approves within all limits", () => {
  assert.equal(decide(base, action, POLICY).verdict, "AUTO_APPROVE");
});
test("holds when over auto-approve limit", () => {
  assert.equal(decide({ ...base, est_cost_usd: 300 }, action, POLICY).verdict, "HOLD_FOR_HUMAN");
});
test("holds when over per-category cap", () => {
  assert.equal(decide({ ...base, category: "agent_tool_spend", est_cost_usd: 150 }, action, POLICY).verdict, "HOLD_FOR_HUMAN");
});
test("blocks on hard-block risk flag", () => {
  assert.equal(decide({ ...base, risk_flags: ["policy_violation"] }, action, POLICY).verdict, "BLOCK");
});
test("escalates on low confidence", () => {
  assert.equal(decide({ ...base, confidence: 0.4 }, action, POLICY).verdict, "ESCALATE");
});
test("holds on soft risk flag", () => {
  assert.equal(decide({ ...base, risk_flags: ["unusual_amount"] }, action, POLICY).verdict, "HOLD_FOR_HUMAN");
});
test("fail-closed advisory never auto-approves", () => {
  const failClosed = { category: "other", est_cost_usd: 0, risk_flags: ["model_error"], confidence: 0, rationale: "x", draft_note: "" };
  assert.notEqual(decide(failClosed, action, POLICY).verdict, "AUTO_APPROVE");
});
test("agent cannot auto-execute", () => {
  assert.equal(CAN_AUTO_EXECUTE, false);
});

// --- reasons[] accumulation: every matched condition is recorded; precedence still owns the verdict ---

test("multi-condition: all matched reasons recorded, highest-precedence verdict wins", () => {
  const d = decide({ ...base, risk_flags: ["fraud_suspected", "unusual_amount"], confidence: 0.4, est_cost_usd: 300 }, action, POLICY);
  assert.equal(d.verdict, "BLOCK");
  assert.ok(d.reasons.some((r) => r.includes("hard-block")), "hard-block reason present");
  assert.ok(d.reasons.some((r) => r.includes("confidence")), "low-confidence reason present");
  assert.ok(d.reasons.some((r) => r.includes("unusual_amount")), "soft-flag reason present");
  assert.ok(d.reasons.some((r) => r.includes("auto-approve limit")), "over-limit reason present");
});

test("low confidence + soft flag: ESCALATE outranks HOLD, both reasons recorded", () => {
  const d = decide({ ...base, confidence: 0.4, risk_flags: ["unusual_amount"] }, action, POLICY);
  assert.equal(d.verdict, "ESCALATE");
  assert.ok(d.reasons.some((r) => r.includes("confidence")));
  assert.ok(d.reasons.some((r) => r.includes("unusual_amount")));
});

test("single-condition: first reason names the verdict's cause", () => {
  const d = decide({ ...base, est_cost_usd: 300 }, action, POLICY);
  assert.equal(d.verdict, "HOLD_FOR_HUMAN");
  assert.ok(d.reasons[0].includes("auto-approve limit"));
});

test("auto-approve carries exactly the within-limits reason", () => {
  const d = decide(base, action, POLICY);
  assert.equal(d.verdict, "AUTO_APPROVE");
  assert.equal(d.reasons.length, 1);
  assert.ok(d.reasons[0].startsWith("within limits"));
});
