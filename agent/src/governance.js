import { readFileSync } from "node:fs";

export const CAN_AUTO_EXECUTE = false; // the agent never acts on the world — it advises + records

export function loadPolicy(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Pure, deterministic. RULES own the verdict; the model only advised.
 * Precedence: BLOCK > ESCALATE > HOLD > AUTO_APPROVE (safety first).
 * Every matched condition lands in reasons[] (full audit trail); the
 * highest-precedence match owns the verdict.
 *
 * Honest limit — velocity/idempotency: decide() is stateless, so cross-request
 * risks (duplicate submission, spend velocity) are caught only when the
 * advisory flags them from the request text (demo A8 rides on the model's
 * `duplicate` flag). The deterministic close is ledger-derived input flags
 * (fingerprint idempotency + a coarse velocity breaker) so rules own that
 * class too — planned, not built here.
 */
export function decide(advisory, action, policy) {
  const reasons = [];
  const flags = advisory.risk_flags ?? [];
  let verdict = null;
  // Checks run in precedence order: the first match fixes the verdict,
  // later matches still append their reason.
  const match = (v, reason) => { verdict = verdict ?? v; reasons.push(reason); };

  // 1. Hard blocks (category denylist or hard-block flags)
  if (policy.deniedCategories?.includes(advisory.category))
    match("BLOCK", `category '${advisory.category}' is denied by policy`);
  const hardHit = flags.filter((f) => policy.hardBlockFlags?.includes(f));
  if (hardHit.length)
    match("BLOCK", `hard-block flag(s): ${hardHit.join(", ")}`);

  // 2. Escalate on low confidence (model unsure → human judgment)
  if (advisory.confidence < policy.minConfidence)
    match("ESCALATE", `confidence ${advisory.confidence} < min ${policy.minConfidence}`);

  // 3. Hold on soft risk flags (hard ones are already reported above)
  const softHit = flags.filter((f) => !policy.hardBlockFlags?.includes(f));
  if (softHit.length)
    match("HOLD_FOR_HUMAN", `risk flag(s): ${softHit.join(", ")}`);

  // 4. Hold when over global or per-category cost limits
  const cap = policy.perCategoryCap?.[advisory.category] ?? 0;
  if (advisory.est_cost_usd > policy.autoApproveLimit)
    match("HOLD_FOR_HUMAN", `cost ${advisory.est_cost_usd} > auto-approve limit ${policy.autoApproveLimit}`);
  if (advisory.est_cost_usd > cap)
    match("HOLD_FOR_HUMAN", `cost ${advisory.est_cost_usd} > ${advisory.category} cap ${cap}`);

  // 5. Nothing matched → safe to auto-approve
  if (!verdict)
    match("AUTO_APPROVE", `within limits (cost ${advisory.est_cost_usd} <= cap ${cap}, confidence ${advisory.confidence})`);

  return { verdict, reasons, policy_version: policy.policy_version };
}
