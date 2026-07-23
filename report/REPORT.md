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
Exam with tools (54.0%), at roughly 8–10× lower list pricing than Opus-tier closed models on routine tasks
($0.75/$3.50 per M vs ~$5/$25), though the advantage narrows on reasoning-heavy workloads (cited:
[llm-stats](https://llm-stats.com/models/kimi-k2.6), [Verdent](https://www.verdent.ai/guides/what-is-kimi-k2-6)).
Qwen comes in sizes from tiny to very large (Qwen 3.6 includes 35B-A3B: 35B parameters, ~3B active), so you can
trade quality for the hardware you have.

**Why this matters for Elchai specifically.** **OpenClaw** — the open-source agent framework Elchai deploys as
its "Controlled AI Operating System" — is itself an open-source,
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
| Decision accuracy (exact verdict) | **18/25 (72%)** on the reproducible pinned run · **19–20/25 (76–80%)** across 5 unpinned runs |
| **Unsafe auto-approvals** (risky item wrongly auto-approved) | **0/25 (0%)** — on every run, pinned and unpinned |
| Correct routing (auto vs. human) | **25/25**; all 8 auto-approvals correct, all 17 human-review items routed to a human |
| Warm latency p50 / p95 | 1.5 s / 2.1 s |
| Avg tokens / decision | 469 |

**The finding that matters:** exact-verdict accuracy was 18/25 (72%) on the pinned run and 19–20/25 (76–80%)
across unpinned runs, but **every single error was in the safe direction** — on each of the 7 misses the model
escalated or blocked a should-be-held item instead of holding it, so all of them still landed in front of a
human. **Unsafe auto-approvals stayed at 0/25 on every run.** This is the whole point of the
design: **the deterministic gate, not the model, owns safety**, so a mid-sized open model's imperfections turn
into extra human review, never into unauthorized spend. A larger model (Qwen3.6-35B-A3B, or Kimi K2.6) would raise the
exact-match rate; it would not change the safety floor, which is already 0% by construction.

*Method and honest limits:* the 25 benchmark cases are synthetic and non-adversarial, and the ground-truth
verdicts are my own interpretation of the policy (external adjudication recommended for production). The safety
metric uses the strict definition — **any** item that should not have auto-approved (BLOCK, HOLD, or ESCALATE)
but did — and it was 0/25 on every run. That 0/25 covers the **stateless risk classes** the eval can express
(per-request category, cost, flags, confidence); **cross-request velocity/duplicate risk is out of the eval's
scope and currently delegated to the model** — the one duplicate-style case (E14) is caught only because its
description narrates the duplication, not by a deterministic rule (`decide()` is stateless; a ledger-derived
deterministic check is the named fix, not built here). The eval is pinned (temperature 0.2, fixed seed), so `npm run eval`
reproduces the committed 18/25 run exactly; across 5 unpinned runs exact-match ranged 19–20/25 (76–80%) while
unsafe stayed 0. These are small counts on a 25-case set — read them as directional, not precise. The site's
interactive replay uses a separate 12-action illustrative run, not the 25-case benchmark. The hash-chained
ledger detects any modification or reordering of recorded entries; detecting deletion of the newest entries
also needs the latest hash anchored externally (a standard extension, not built here).

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
| **Security / prompt injection** | Action text could carry an injected instruction, or trick the model into understating a cost | Data goes to the model in labelled fields; the prompt makes it flag any embedded instruction as a risk (`injection_suspected` + low confidence → human), and it can never act or raise a cap. In production the amount/vendor come from the authoritative PO record, not the model's reading of free text (model advises category + risk only). Network-isolate (recommended) |
| **Model accuracy** | 72–80% exact-match on Qwen3-4B (18/25 pinned, 19–20/25 unpinned) | Errors are safe-direction only; use a larger model (Qwen3.6-35B-A3B / Kimi K2.6) to raise exact-match (recommended) |
| **Hallucination** | Could invent a cost/vendor | Prompt forbids fabrication; a fabricated high cost still hits caps → human; low-confidence → escalate (built) |
| **Local hardware cost** | 4B runs on a laptop; production tiers need real GPUs | Size the model to the tier; self-host cost is flat vs. volume (see TCO) |
| **Integration difficulty** | Must hook into real PO/spend systems | Clean `classify()` boundary + Zod contract; swap mock→local→cloud by one env var (built) |
| **Reliability** | Model or server could fail | Fail-closed: any error → human review, never an auto-approve (built) |
| **Vendor / geo / licensing** | Chinese open models raise governance questions | Weights run locally (no data to China); licenses are permissive (Qwen 3.6 Apache-2.0; Kimi K2.6 Modified MIT) but confirm terms before production (recommended) |

## 7. Cost

See [`tco.md`](tco.md). Summary for a 52-agent swarm (~312k decisions/month, ~469 tokens each): **Kimi K2.6 cloud
≈ $170/month; self-hosted Qwen ≈ a flat hardware+power cost (≈ $0 marginal); a mid-tier closed model ≈ $710/month
and a frontier one ≈ $1,190/month, both leaking data.** Open-weight is ~4× cheaper than mid-tier and ~7× cheaper
than frontier. Kimi K2.6 pricing cited at $0.75/M input, $3.50/M output
([DeepInfra list](https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs); provider rates vary
per [llm-stats](https://llm-stats.com/models/kimi-k2.6)); closed-model prices from Claude/OpenAI list pages.

## 8. Final recommendation

**Test it — a controlled internal pilot.** The pattern is production-shaped and safe by construction, but the
model's exact-match accuracy (72–80% on a 4B) should be raised before wide rollout. Concretely:

1. **Pilot** Budget Sentinel on one OpenClaw branch with **self-hosted Qwen3.6-35B-A3B**, capped budget, humans clearing
   every hold for the first two weeks.
2. **Measure** exact-match, unsafe rate (must stay 0), and human-review load against the committed baseline.
   Set explicit ship criteria (e.g. unsafe rate 0 and exact-match > 90% on a larger, adversarial eval set).
3. **Operationalise the human 20%:** define an approval SLA (what happens if a hold is unactioned — retry,
   expire, or escalate), staff it against the expected hold volume, and run a monthly ledger-verification
   ceremony (finance re-runs the hash-chain check and reconciles it against actual spend).
4. **Evaluate Kimi K2.6** in parallel where a cloud call is acceptable, as the capability ceiling.
5. **Expand** branch by branch only after the ledger proves the safety and cost case — OpenClaw's own
   proof-before-expansion method.

**Do not** let any open model emit the final verdict, run without the deterministic gate, or auto-execute spend.

## 9. Prompts & tools used

Full detail in [`../PROMPTS.md`](../PROMPTS.md). In short: local Qwen3-4B (Ollama), Node 24, zod (the schema
contract), a hash-chained ledger, and Claude Code as the build pair. Kimi K2.6 evaluated from published
benchmarks/pricing (cited, not run).

---
*Measured numbers are from a live local run and reproducible via `npm run eval`. Items marked "cited" are from
published sources, labelled inline. Sample data is synthetic; no real PII or secrets are included.*
