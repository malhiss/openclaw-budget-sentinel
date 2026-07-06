# Open-source models for OpenClaw — an adoption assessment

**Elchai Group · AI Agent & OpenClaw Research Intern · pre-interview assessment**
**Author: Sultan Malhis · 2026-07-06**

---

## 1. Selected model / tool

- **Primary (capability ceiling): Kimi K2** — Moonshot AI's open-weight agentic model.
- **Alternative actually run (self-host floor): Qwen3** — Alibaba's open-weight family. The working demo and
  every measured number below run on **Qwen3-4B, self-hosted locally via Ollama**, with no cloud call and no
  API key. Kimi K2's figures are **cited from published sources, not run locally** (it is a paid cloud API, and
  the assessment says paid tools are not required).

Why two: Kimi K2 is the strongest open agentic model to headline the evaluation; Qwen3 is what a data-sovereign
Elchai deployment would actually self-host, and what I could run and measure for free. This mirrors the task's
"name your intended tool + the alternative you used + why."

> **Note on the reference video.** The video's version numbers (Kimi 2.6, Qwen 3.6, GPT-4.4, Opus 4.6,
> Gemini 3.1) are illustrative/near-future. This report is grounded in the **real, current** models.

## 2. What these models are, in plain words

**Kimi K2** and **Qwen3** are *open-weight* large language models: the model files are published, so you can run
them on your own hardware instead of only through a company's paid API. They are strong at **agentic** work —
following instructions, using tools, and returning structured output — which is exactly what an agent operating
system needs. Kimi K2 is frontier-class (≈76–80% on SWE-bench Verified, competitive with closed frontier models
[cited]); Qwen3 comes in sizes from tiny to very large, so you can trade quality for the hardware you have.

**Why this matters for Elchai specifically.** Elchai's flagship, **OpenClaw**, is itself an open-source,
self-hosted agent framework that runs local models via Ollama and keeps data on your own machines
([Ollama × OpenClaw](https://docs.ollama.com/integrations/openclaw)). Elchai deploys it as a governed enterprise
"Controlled AI Operating System": ~52 agents handle 80% of execution, humans keep the 20% (judgment, approvals,
compliance, budget). An open-weight model is the natural engine for that, for two reasons Elchai's own clients
care about most:

- **Data sovereignty.** Self-hosted means spend data, vendor names, and PO details never leave the client's
  infrastructure — the requirement DIFC-finance, healthcare, and government clients cannot waive.
- **Budget control.** Open weights cost cents per thousand decisions (or a flat self-host cost), so a 52-agent
  swarm stays inside a predictable budget line rather than an unpredictable per-token cloud bill.

## 3. The practical project — "OpenClaw Budget Sentinel"

Rather than a slide, I built a small **working governance module** for OpenClaw and benchmarked it. It puts a
governed gate in front of every agent's spend:

> the open model **advises** → a strict schema **validates** → deterministic rules **decide** → a human
> **approves the 20%** → every action is written to a **tamper-evident ledger**.

The model can never approve, act, or exceed a cap. `governance.decide()` is a pure function that owns the
verdict; `CAN_AUTO_EXECUTE` is hard-wired `false`; malformed or missing model output fails closed to human
review. See [`../README.md`](../README.md) to run it (30 seconds, no model needed via mock mode), the
architecture in [`../assets/architecture.svg`](../assets/architecture.svg), and the exact prompts in
[`../PROMPTS.md`](../PROMPTS.md). Two landing-page directions for the concept are in [`../landing/`](../landing/).

### Measured results (live, on self-hosted Qwen3-4B)

25 labeled spend/PO cases run through the real model on a consumer laptop (RTX 2060, 6 GB). Reproduce with
`npm run eval`; raw output in [`../agent/eval/results.json`](../agent/eval/results.json).

| Metric | Result |
|---|---|
| Decision accuracy (exact verdict) | **80.0%** (20/25) |
| **Unsafe auto-approvals** (risky item wrongly auto-approved) | **0.0%** (0/25) |
| Correct routing (auto vs. human) | **24/25**; all 16 human-review items routed to a human |
| Warm latency p50 / p95 | 1.8 s / 2.1 s |
| Avg tokens / decision | 411 |

**The finding that matters:** accuracy was 80%, but **every single error was in the safe direction** — the model
being *more* cautious (holding a legitimate invoice, or escalating an over-cap item instead of holding it, both
of which still land in front of a human). Nothing risky was ever auto-approved. This is the whole point of the
design: **the deterministic gate, not the model, owns safety**, so a mid-sized open model's imperfections turn
into extra human review, never into unauthorized spend. A larger model (Qwen3-30B, or Kimi K2) would raise the
exact-match rate; it would not change the safety floor, which is already 0% by construction.

## 4. Use case for Elchai

Drop Budget Sentinel in front of an OpenClaw swarm's spend: routine top-ups and small tooling costs auto-clear,
over-cap GPU bursts and unknown-vendor invoices are held, fraud/policy-violating requests are blocked, ambiguous
ones escalate — each recorded to a replayable ledger. Leadership watches one board and only touches exceptions.
This is OpenClaw's "budget control" and "PO hardening" made concrete, deployable branch by branch, expanded only
after the ledger proves it safe.

## 5. Departments that benefit

| Department | Benefit |
|---|---|
| **Finance** | Hard, versioned budget caps + a full audit trail; predictable swarm cost |
| **Engineering** | A reusable governed-agent pattern (rules own the verdict, model bounded to evidence) |
| **IT / Infrastructure** | Self-hosted model = no third-party data egress; runs on existing hardware |
| **Product** | A shippable OpenClaw module + governance story for regulated-client pitches |
| **Strategy** | Open-weight adoption de-risks vendor lock-in and supports data-residency requirements |
| **Operations** | Humans handle only the ~20% of exceptions; the rest is automated and logged |

## 6. Risks & limitations

| Risk | Reality here | Mitigation (built or recommended) |
|---|---|---|
| **Privacy / data** | Spend data is sensitive | Self-hosted model; data never leaves the box (built) |
| **Security / prompt injection** | Action text could carry an injected instruction | Model gets data in a labelled field, no instructions; it cannot act; rules gate everything (built). Keep it network-isolated (recommended) |
| **Model accuracy** | 80% exact-match on Qwen3-4B | Errors are safe-direction only; use a larger model (Qwen3-30B / Kimi K2) to raise exact-match (recommended) |
| **Hallucination** | Could invent a cost/vendor | Prompt forbids fabrication; a fabricated high cost still hits caps → human; low-confidence → escalate (built) |
| **Local hardware cost** | 4B runs on a laptop; production tiers need real GPUs | Size the model to the tier; self-host cost is flat vs. volume (see TCO) |
| **Integration difficulty** | Must hook into real PO/spend systems | Clean `classify()` boundary + Zod contract; swap mock→local→cloud by one env var (built) |
| **Reliability** | Model or server could fail | Fail-closed: any error → human review, never an auto-approve (built) |
| **Vendor / geo / licensing** | Chinese open models raise governance questions | Weights run locally (no data to China); confirm license terms (Qwen3 Apache-2.0; Kimi K2 open) before production (recommended) |

## 7. Cost

See [`tco.md`](tco.md). Summary for a 52-agent swarm (~312k decisions/month, ~410 tokens each): **Kimi K2 cloud
≈ $120/month; self-hosted Qwen3 ≈ a flat hardware+power cost (≈ $0 marginal); a frontier closed model ≈ $600+/month
and data leaves.** Open-weight is 3–5× cheaper and self-hostable. Kimi K2 pricing cited at $0.60/M input,
$2.50/M output ([OpenRouter](https://openrouter.ai/moonshotai/kimi-k2-thinking)).

## 8. Final recommendation

**Test it — a controlled internal pilot.** The pattern is production-shaped and safe by construction, but the
model's exact-match accuracy (80% on a 4B) should be raised before wide rollout. Concretely:

1. **Pilot** Budget Sentinel on one OpenClaw branch with **self-hosted Qwen3-30B**, capped budget, humans clearing
   every hold for the first two weeks.
2. **Measure** exact-match, unsafe rate (must stay 0), and human-review load against the committed baseline.
3. **Evaluate Kimi K2** in parallel where a cloud call is acceptable, as the capability ceiling.
4. **Expand** branch by branch only after the ledger proves the safety and cost case — OpenClaw's own
   proof-before-expansion method.

**Do not** let any open model emit the final verdict, run without the deterministic gate, or auto-execute spend.

## 9. Prompts & tools used

Full detail in [`../PROMPTS.md`](../PROMPTS.md). In short: local Qwen3-4B (Ollama), Node 24, zod (the schema
contract), a hash-chained ledger, and Claude Code as the build pair. Kimi K2 evaluated from published
benchmarks/pricing (cited, not run).

---
*Measured numbers are from a live local run and reproducible via `npm run eval`. Items marked "cited" are from
published sources, labelled inline. Sample data is synthetic; no real PII or secrets are included.*
