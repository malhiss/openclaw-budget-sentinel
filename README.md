# OpenClaw Budget Sentinel

**A governed open-model spend gate for the AI-agent swarm.** An open-weight model *advises*, deterministic
rules *decide*, a human approves the risky 20%, and every action is written to a tamper-evident ledger.

> Pre-interview assessment for Elchai Group (AI Agent & OpenClaw Research Intern). Concept design applying an
> open-source model to Elchai's own OpenClaw philosophy: *AI executes the 80%, humans decide the 20%.*
> Not an official Elchai product.

**⚡ The whole submission is one page: https://malhiss.github.io/openclaw-budget-sentinel/** — the concept, a
live dashboard on the real verified ledger, the measured benchmark, and the full report, all baked in (works
offline too: just open `index.html`).

**Selected model:** Kimi K2.6 (open-weight, cloud, the capability ceiling) with **Qwen** as the self-hostable
alternative. The live demo runs on **local Qwen3-4B via Ollama** — no cloud, no API key, data never leaves the
machine. See [`report/REPORT.md`](report/REPORT.md) for the full evaluation, benchmark, cost model, risks, and
recommendation.

---

## Run it in 30 seconds (no model, no key)

Needs only **Node 24+**. The `mock` backend mimics the model's JSON contract deterministically, so the whole
governance pipeline runs with zero setup.

```bash
cd agent
npm install                 # one dependency: zod
npm start                   # MODE defaults to mock if no model is running
```

You'll see the triage board: routine spend auto-approved, over-limit held, fraud blocked, ambiguous escalated,
and the ledger verified. Then exercise the human gate:

```bash
node src/approve.js A3 approve "one-off benchmark spend"
node src/approve.js A5 reject  "phishing / lottery scam"
```

Run the tests (deterministic core — schema, governance, ledger):

```bash
npm test                    # node --test, 14 tests, zero test deps
```

## Run it on the real open model (optional)

Proves the same pipeline on a genuinely self-hosted open-weight model.

1. Install [Ollama](https://ollama.com/download) and pull the model: `ollama pull qwen3:4b`
2. `cp .env.example .env` (defaults are fine — `MODE=local`, `qwen3:4b`)
3. `npm start` and `npm run eval`

`npm run eval` runs a 25-case labeled benchmark on the live model and writes `eval/results.json` — the numbers
in the report are produced exactly this way. To point it at **Kimi (K2.6)** cloud instead, set `MODE=cloud` and
`KIMI_API_KEY` in `.env` (no code change).

## The landing page

Two design directions for the product concept live in [`landing/`](landing/): `a/` (dark instrument) and
`b/` (light institutional). Open either `index.html` in a browser, or see the deployed version linked in the
submission email.

---

## How it works

```
proposed action ─▶ model.classify()   open model ADVISES (category, cost, risk, confidence)
                     │
                     ▼  Zod contract — malformed output fails closed to a human
                   governance.decide() RULES own the verdict (deterministic, fail-closed)
                     │  AUTO_APPROVE within limits · HOLD over cap · BLOCK on policy/fraud · ESCALATE if unsure
                     ▼
                   ledger.append()     hash-chained, tamper-evident (entry.hash = sha256(prev + payload))
                     │
        ┌────────────┴───────────┐
   AUTO_APPROVE              HOLD / ESCALATE ─▶ approve.js  separate human process → ledger
```

The model can never approve, act, or exceed a cap: `governance.decide()` is a pure function that owns the
verdict, and `CAN_AUTO_EXECUTE` is hard-wired `false`. Bad or missing model output degrades to human review,
never to an unsafe approval.

## Repo layout

```
index.html      THE deliverable — self-contained site: brief-map + dashboard + benchmark (works offline)
report.html     the full report, rendered in-page
agent/          the governed agent (Node, one dep: zod)
  src/          model · schema · prompt · governance · ledger · agent · approve
  data/         actions.json (synthetic) · policy.json · ledger.demo.jsonl (verified evidence)
  eval/         cases.json (25 labeled) · run.mjs · results.json (committed evidence)
  test/         schema · governance · ledger  (node --test)
landing/        two design directions (a: dark instrument, b: light institutional)
report/         REPORT.md (the memo) · tco.md · scorecard.md
assets/         architecture diagram
docs/           design spec + implementation plan
PROMPTS.md      exact prompts + rationale
```

## Tools used

Node 24 · zod · Ollama (local Qwen3) · deterministic-first architecture. Full prompt and tool log in
[`PROMPTS.md`](PROMPTS.md).
