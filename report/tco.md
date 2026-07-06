# Cost model — running the OpenClaw swarm three ways

All figures are **illustrative with stated, adjustable assumptions**. The token count is **measured**
(from `npm run eval`, avg 411 tokens/decision); prices are **cited list prices**. Adjust the assumptions to
your real volume.

## Assumptions

| Input | Value | Source |
|---|---|---|
| Agents in the swarm | 52 | Elchai OpenClaw description |
| Decisions per agent per day | 200 | assumption (tune to reality) |
| Decisions / month | ~312,000 | 52 × 200 × 30 |
| Tokens per decision | ~410 (≈340 in / 70 out) | **measured** on Qwen3-4B |
| Monthly tokens | ~106M in / ~22M out | derived |
| Kimi K2.6 price | $0.75 / M in, $3.50 / M out | [DeepInfra list](https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs); blended $1.15–2.15/1M across providers per [llm-stats](https://llm-stats.com/models/kimi-k2.6) |
| Frontier closed price (illustrative) | ~$3 / M in, ~$15 / M out | typical mid-frontier list price |
| Self-host GPU box (Qwen3.6-35B-A3B tier) | ~$6,000 capex / 3 yr + ~$30/mo power | assumption |

## The three options

| Option | Monthly cost | Scales with volume? | Data leaves your infra? |
|---|---|---|---|
| **Kimi K2.6 — cloud API** | **≈ $157** | Yes (linear) | **Yes** |
| **Qwen3 — self-hosted** | **≈ $200 flat** (~$0 marginal) | No (flat) | **No** |
| Frontier closed model | ≈ $645 | Yes (linear) | Yes |

Math: Kimi = 106M×$0.75 + 22M×$3.50 ≈ $80 + $77 = **$157/mo**. Frontier = 106M×$3 + 22M×$15 ≈ $318 + $327 =
**$645/mo**. Self-host = $6,000/36 + $30 ≈ **$197/mo**, independent of how many decisions you run.

## The takeaways

1. **Open-weight is 3–5× cheaper than a frontier closed model** at this volume, whichever way you run it.
2. **Self-host is a flat cost.** At ~312k decisions/month it is comparable to Kimi cloud; **double or triple the
   volume and self-host wins decisively** while cloud keeps scaling linearly. The crossover is roughly where
   monthly cloud spend passes the amortized box cost.
3. **Only self-host keeps data in your infrastructure.** For DIFC-finance / government clients that is not a
   cost line, it is a hard requirement — which is why the recommendation pairs "cheapest at scale" with "the
   only option that satisfies data residency."

A realistic Elchai posture: **self-host Qwen3 for regulated / high-volume deployments** (sovereignty + flat
cost), keep **Kimi K2.6 cloud** as an on-demand ceiling for non-sensitive, bursty, or highest-capability tasks.
