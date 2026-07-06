import { test } from "node:test";
import assert from "node:assert/strict";
import { toAdvisoryOrFallback, FAILCLOSED_ADVISORY } from "../src/schema.js";

test("valid raw advisory passes through", () => {
  const raw = { category: "api_topup", est_cost_usd: 120, risk_flags: [], confidence: 0.9,
    rationale: "routine top-up", draft_note: "" };
  const a = toAdvisoryOrFallback(raw);
  assert.equal(a.est_cost_usd, 120);
  assert.equal(a.confidence, 0.9);
});

test("malformed advisory fails closed", () => {
  const a = toAdvisoryOrFallback({ category: "nope", est_cost_usd: -5 });
  assert.equal(a.confidence, 0);
  assert.ok(a.risk_flags.includes("model_error"));
  assert.deepEqual(a, FAILCLOSED_ADVISORY);
});

test("missing fields fail closed", () => {
  const a = toAdvisoryOrFallback(null);
  assert.equal(a.confidence, 0);
});
