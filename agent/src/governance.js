import { readFileSync } from "node:fs";

export const CAN_AUTO_EXECUTE = false; // the agent never acts on the world — it advises + records

export function loadPolicy(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Pure, deterministic. RULES own the verdict; the model only advised.
 * Precedence: BLOCK > ESCALATE > HOLD > AUTO_APPROVE (safety first).
 */
export function decide(advisory, action, policy) {
  const reasons = [];
  const flags = advisory.risk_flags ?? [];

  // 1. Hard blocks (category denylist or hard-block flags)
  if (policy.deniedCategories?.includes(advisory.category)) {
    reasons.push(`category '${advisory.category}' is denied by policy`);
    return { verdict: "BLOCK", reasons, policy_version: policy.policy_version };
  }
  const hardHit = flags.filter((f) => policy.hardBlockFlags?.includes(f));
  if (hardHit.length) {
    reasons.push(`hard-block flag(s): ${hardHit.join(", ")}`);
    return { verdict: "BLOCK", reasons, policy_version: policy.policy_version };
  }

  // 2. Escalate on low confidence (model unsure → human judgment)
  if (advisory.confidence < policy.minConfidence) {
    reasons.push(`confidence ${advisory.confidence} < min ${policy.minConfidence}`);
    return { verdict: "ESCALATE", reasons, policy_version: policy.policy_version };
  }

  // 3. Hold on any (soft) risk flag
  if (flags.length) {
    reasons.push(`risk flag(s): ${flags.join(", ")}`);
    return { verdict: "HOLD_FOR_HUMAN", reasons, policy_version: policy.policy_version };
  }

  // 4. Hold when over global or per-category cost limits
  const cap = policy.perCategoryCap?.[advisory.category] ?? 0;
  if (advisory.est_cost_usd > policy.autoApproveLimit) {
    reasons.push(`cost ${advisory.est_cost_usd} > auto-approve limit ${policy.autoApproveLimit}`);
    return { verdict: "HOLD_FOR_HUMAN", reasons, policy_version: policy.policy_version };
  }
  if (advisory.est_cost_usd > cap) {
    reasons.push(`cost ${advisory.est_cost_usd} > ${advisory.category} cap ${cap}`);
    return { verdict: "HOLD_FOR_HUMAN", reasons, policy_version: policy.policy_version };
  }

  // 5. Otherwise safe to auto-approve
  reasons.push(`within limits (cost ${advisory.est_cost_usd} <= cap ${cap}, confidence ${advisory.confidence})`);
  return { verdict: "AUTO_APPROVE", reasons, policy_version: policy.policy_version };
}
