# Adoption scorecard — open-weight models for OpenClaw

*30-second read. Full detail in [`REPORT.md`](REPORT.md).*

| | |
|---|---|
| **Model** | Kimi K2.6 (cloud ceiling) + Qwen (self-host; measured on Qwen3-4B) |
| **Fit for Elchai** | ★★★★★ — OpenClaw is already a self-hosted, local-model agent framework; open weights are its natural engine |
| **What was built** | A working, benchmarked OpenClaw governance module (Budget Sentinel), not a slide |
| **Measured (Qwen3-4B, live)** | 80% exact-verdict accuracy · **0% unsafe auto-approvals** · 1.6 s p50 · 468 tok/decision |
| **Cost (52-agent swarm)** | Kimi K2.6 cloud ≈ $170/mo · self-host Qwen ≈ $200/mo flat · mid-tier closed ≈ $710/mo · frontier ≈ $1,190/mo |
| **Top risk** | Model exact-match accuracy (raise with a bigger model); safety floor is already 0% by construction |
| **Data residency** | Self-host keeps all spend data on-prem — the requirement for DIFC / gov / healthcare clients |

## Verdict: **TEST — controlled internal pilot**

The pattern is production-shaped and **safe by construction** (deterministic rules own the verdict; the model
only advises; everything is auditable and fails closed). It is ready for a real pilot, not for unsupervised
wide rollout, because the model's exact-match accuracy should be raised first.

**Rollout (OpenClaw's own proof-before-expansion method):**

1. Pilot on **one branch**, self-hosted **Qwen3.6-35B-A3B**, capped budget, humans clear every hold for two weeks.
2. Measure exact-match, unsafe rate (must stay 0), and human-review load vs. the committed baseline.
3. Evaluate **Kimi K2.6** in parallel as the capability ceiling where a cloud call is acceptable.
4. Expand branch by branch **only after the ledger proves** the safety and cost case.

**Do not:** let the model emit the final verdict, run without the deterministic gate, or auto-execute spend.
