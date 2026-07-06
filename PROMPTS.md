# Prompts & tools used

Transparency on exactly how the model is prompted and what was used to build this. A core design point:
**the model is given a narrow, advisory-only role** and is never trusted to make or execute a decision.

## The system prompt (the model's whole job)

The model receives this system prompt on every call (`agent/src/prompt.js`). It defines a strict JSON output
contract and forbids the model from deciding or fabricating:

```
You are OpenClaw Budget Sentinel, an ADVISORY module for a governed AI-agent operating system.
You do NOT approve, reject, or execute anything. You only assess a proposed spend/action and return JSON.
A separate deterministic policy engine and a human make the actual decision.

Return ONLY a JSON object with EXACTLY these fields:
{
  "category": one of ["agent_tool_spend","vendor_invoice","api_topup","subscription","other"],
  "est_cost_usd": number (USD; use the amount given — NEVER invent a number you were not given; if none, 0),
  "risk_flags": string[] (e.g. "unusual_amount","duplicate","vendor_unknown","policy_violation","fraud_suspected"; [] if none),
  "confidence": number 0..1 (your certainty in this assessment),
  "rationale": short string (one sentence, why),
  "draft_note": short string (optional note for the human reviewer; "" if none)
}
Rules: be conservative — when unsure, lower confidence and add a risk flag. Never fabricate costs, vendors, or facts.
```

### Why it is written this way
- **"You do NOT approve, reject, or execute."** The model's role is bounded at the prompt level *and* enforced
  in code — the deterministic gate ignores anything except the advisory fields, and there is no tool the model
  can call to act.
- **Exact JSON schema in the prompt + `format: "json"`.** Constrains output to a shape the Zod contract can
  validate. If the model deviates, validation fails closed to human review rather than passing junk downstream.
- **"NEVER invent a number / never fabricate."** Directly targets the hallucination risk that matters most for a
  spend agent: a made-up cost or vendor.
- **"When unsure, lower confidence and add a risk flag."** Pushes uncertainty into signals the deterministic
  gate uses to route to a human (low confidence → ESCALATE), rather than into a confident wrong answer.
- **Temperature 0.2.** Low, for consistent structured output.

The user message per action is a plain, labelled field list (`buildUserMessage`) — id, title, category hint,
amount hint, description — with no instructions, so the action data cannot smuggle in prompt injection that
overrides the system role.

## Model backends

One `classify()` interface, three backends (`agent/src/model.js`), selected by `MODE`:
- `local` (default) — **Qwen3 via Ollama** on `127.0.0.1:11434`. Real, offline, self-hosted.
- `cloud` — **Kimi K2** via its OpenAI-compatible endpoint (one env var, no code change).
- `mock` — a deterministic heuristic that mimics the JSON contract, for zero-setup runs and tests.

## Tools used to build this

| Tool | Use |
|---|---|
| **Ollama + Qwen3 (`qwen3:4b`)** | the self-hosted open-weight model the demo runs and benchmarks |
| **Node.js 24** | runtime; built-in `fetch`, `node:crypto` (ledger hashing), `node:test` (unit tests) |
| **zod** | the schema contract at the model→rules boundary (the only runtime dependency) |
| **Claude Code (Opus 4.8)** | pair-built the agent, eval harness, and landing pages under a research→plan→build→verify workflow; design directions sourced from a reference-driven design library |
| **Kimi K2 (Moonshot) — evaluated, cited** | the cloud capability ceiling; benchmarks and pricing cited, not run locally (paid) |

## Reproducing the benchmark

`npm run eval` sends the 25 labeled cases in `agent/eval/cases.json` through the live model, compares the
resulting governed verdict to ground truth, and writes `agent/eval/results.json` (accuracy, the false
auto-approve safety rate, latency, tokens). The numbers in `report/REPORT.md` come straight from that file.
