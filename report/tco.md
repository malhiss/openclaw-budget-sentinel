# Cost model — running the OpenClaw swarm three ways

All figures are **illustrative with stated, adjustable assumptions**. The token count is **measured**
(from `npm run eval`, avg 468 tokens/decision); prices are **cited list prices**. Adjust the assumptions to
your real volume.

## Assumptions

| Input | Value | Source |
|---|---|---|
| Agents in the swarm | 52 | Elchai OpenClaw description |
| Decisions per agent per day | 200 | assumption (tune to reality) |
| Decisions / month | ~312,000 | 52 × 200 × 30 |
| Tokens per decision | ~468 (≈395 in / 73 out) | **measured** on Qwen3-4B |
| Monthly tokens | ~123M in / ~23M out | derived |
| Kimi K2.6 price | $0.75 / M in, $3.50 / M out | [DeepInfra list](https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs); provider rates vary per [llm-stats](https://llm-stats.com/models/kimi-k2.6) |
| Mid-tier closed price | ~$3 / M in, ~$15 / M out | e.g. Claude Sonnet-5 list ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)) |
| Frontier closed price | ~$5 / M in, ~$25 / M out | e.g. Claude Opus 4.8 / GPT-5.5 list ([Claude](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI](https://developers.openai.com/api/docs/pricing)) |
| Self-host GPU box (Qwen3.6-35B-A3B tier) | ~$6,000 capex / 3 yr + ~$30/mo power | assumption |

## The four options

| Option | Monthly cost | Scales with volume? | Data leaves your infra? |
|---|---|---|---|
| **Kimi K2.6 — cloud API** | **≈ $170** | Yes (linear) | **Yes** |
| **Qwen — self-hosted** | **≈ $200 flat** (~$0 marginal) | No (flat) | **No** |
| Mid-tier closed model ($3/$15) | ≈ $710 | Yes (linear) | Yes |
| Frontier closed model ($5/$25) | ≈ $1,190 | Yes (linear) | Yes |

Math: Kimi = 123M×$0.75 + 23M×$3.50 ≈ $92 + $80 = **$172/mo**. Mid-tier = 123M×$3 + 23M×$15 ≈ $369 + $342 =
**$711/mo**. Frontier = 123M×$5 + 23M×$25 ≈ $615 + $570 = **$1,185/mo**. Self-host = $6,000/36 + $30 ≈
**$197/mo**, independent of how many decisions you run.

## The takeaways

1. **Open-weight is ~4× cheaper than a mid-tier closed model and ~7× cheaper than a frontier one** at this
   volume, whichever way you run it.
2. **Self-host is a flat cost.** At ~312k decisions/month it is comparable to Kimi cloud; **double or triple the
   volume and self-host wins decisively** while cloud keeps scaling linearly. The crossover is roughly where
   monthly cloud spend passes the amortized box cost.
3. **Only self-host keeps data in your infrastructure.** For DIFC-finance / government clients that is not a
   cost line, it is a hard requirement — which is why the recommendation pairs "cheapest at scale" with "the
   only option that satisfies data residency."

A realistic Elchai posture: **self-host Qwen3 for regulated / high-volume deployments** (sovereignty + flat
cost), keep **Kimi K2.6 cloud** as an on-demand ceiling for non-sensitive, bursty, or highest-capability tasks.
