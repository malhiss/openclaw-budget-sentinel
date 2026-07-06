import { z } from "zod";

export const CATEGORIES = ["agent_tool_spend", "vendor_invoice", "api_topup", "subscription", "other"];

export const AdvisorySchema = z.object({
  category: z.enum(CATEGORIES),
  est_cost_usd: z.number().nonnegative(),
  risk_flags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  draft_note: z.string().default("")
});

export const FAILCLOSED_ADVISORY = Object.freeze({
  category: "other",
  est_cost_usd: 0,
  risk_flags: ["model_error", "needs_human_review"],
  confidence: 0,
  rationale: "advisory unavailable or malformed — routed to human review",
  draft_note: ""
});

export function toAdvisoryOrFallback(raw) {
  const parsed = AdvisorySchema.safeParse(raw);
  return parsed.success ? parsed.data : FAILCLOSED_ADVISORY;
}
