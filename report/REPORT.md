# Open-source models for OpenClaw — an adoption assessment

**Elchai Group · AI Agent & OpenClaw Research Intern · pre-interview assessment**
**Author: Sultan Malhis · 2026-07-06**

---

## 1. Selected model / tool

- **Primary (the tool I intended to use): Kimi K2.6** — Moonshot AI's open-weight agentic model from the
  reference video (released April 2026: a 1T-parameter MoE with 32B active parameters, Modified MIT license).
- **Alternative actually run: Qwen** — the other open family the video covers. The working demo and every
  measured number below run on **Qwen3-4B, self-hosted locally via Ollama**, with no cloud call and no API key.

**Why the alternative:** Kimi K2.6 is a paid cloud API (the assessment notes paid tools are not required) and
self-hosting its 1T weights needs serious hardware, so its figures are **cited from published sources, not run
locally**. Qwen is free, Apache-2.0, and self-hostable; I ran the 4B size because that is what my laptop GPU
supports, and the production recommendation targets the **Qwen3.6-35B-A3B** tier the video describes
(35B parameters, ~3B active).

> **Note on the reference video.** The models it covers are **real, current releases**: Kimi K2.6 (Moonshot,
> April 2026) and the Qwen 3.6 family (Alibaba, April 2026, Apache 2.0), including the 35B-A3B variant the
> video cites. This report evaluates those releases directly; the local demo uses a smaller model from the
> same Qwen line because of laptop hardware limits.

## 2. What these models are, in plain words

**Kimi K2.6** and **Qwen 3.6** are *open-weight* large language models: the model files are published, so you can run
them on your own hardware instead of only through a company's paid API. They are strong at **agentic** work —
following instructions, using tools, and returning structured output — which is exactly what an agent operating
system needs. Kimi K2.6 is frontier-class: it ties GPT-5.5 on SWE-Bench Pro (58.6%) and leads Humanity's Last
Exam with tools (54.0%), at roughly 80% lower cost per million tokens than closed frontier models (cited:
[llm-stats](https://llm-stats.com/models/kimi-k2.6), [Verdent](https://www.verdent.ai/guides/what-is-kimi-k2-6)).
Qwen comes in sizes from tiny to very large (Qwen 3.6 includes 35B-A3B: 35B parameters, ~3B active), so you can
trade quality for the hardware you have.

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
into extra human review, never into unauthorized spend. A larger model (Qwen3.6-35B-A3B, or Kimi K2.6) would raise the
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
| **Model accuracy** | 80% exact-match on Qwen3-4B | Errors are safe-direction only; use a larger model (Qwen3.6-35B-A3B / Kimi K2.6) to raise exact-match (recommended) |
| **Hallucination** | Could invent a cost/vendor | Prompt forbids fabrication; a fabricated high cost still hits caps → human; low-confidence → escalate (built) |
| **Local hardware cost** | 4B runs on a laptop; production tiers need real GPUs | Size the model to the tier; self-host cost is flat vs. volume (see TCO) |
| **Integration difficulty** | Must hook into real PO/spend systems | Clean `classify()` boundary + Zod contract; swap mock→local→cloud by one env var (built) |
| **Reliability** | Model or server could fail | Fail-closed: any error → human review, never an auto-approve (built) |
| **Vendor / geo / licensing** | Chinese open models raise governance questions | Weights run locally (no data to China); licenses are permissive (Qwen 3.6 Apache-2.0; Kimi K2.6 Modified MIT) but confirm terms before production (recommended) |

## 7. Cost

See [`tco.md`](tco.md). Summary for a 52-agent swarm (~312k decisions/month, ~410 tokens each): **Kimi K2.6 cloud
≈ $157/month; self-hosted Qwen ≈ a flat hardware+power cost (≈ $0 marginal); a frontier closed model ≈ $600+/month
and data leaves.** Open-weight is 3–4× cheaper and self-hostable. Kimi K2.6 pricing cited at $0.75/M input,
$3.50/M output ([DeepInfra list](https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs);
blended provider rates $1.15–2.15/1M per [llm-stats](https://llm-stats.com/models/kimi-k2.6)).

## 8. Final recommendation

**Test it — a controlled internal pilot.** The pattern is production-shaped and safe by construction, but the
model's exact-match accuracy (80% on a 4B) should be raised before wide rollout. Concretely:

1. **Pilot** Budget Sentinel on one OpenClaw branch with **self-hosted Qwen3.6-35B-A3B**, capped budget, humans clearing
   every hold for the first two weeks.
2. **Measure** exact-match, unsafe rate (must stay 0), and human-review load against the committed baseline.
3. **Evaluate Kimi K2.6** in parallel where a cloud call is acceptable, as the capability ceiling.
4. **Expand** branch by branch only after the ledger proves the safety and cost case — OpenClaw's own
   proof-before-expansion method.

**Do not** let any open model emit the final verdict, run without the deterministic gate, or auto-execute spend.

## 9. Prompts & tools used

Full detail in [`../PROMPTS.md`](../PROMPTS.md). In short: local Qwen3-4B (Ollama), Node 24, zod (the schema
contract), a hash-chained ledger, and Claude Code as the build pair. Kimi K2.6 evaluated from published
benchmarks/pricing (cited, not run).

---
*Measured numbers are from a live local run and reproducible via `npm run eval`. Items marked "cited" are from
published sources, labelled inline. Sample data is synthetic; no real PII or secrets are included.*
