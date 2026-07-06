# OpenClaw Budget Sentinel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or
> superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Build a real, governed open-model "OpenClaw Budget Sentinel" agent + a live measured benchmark +
a premium landing page + a decision memo — the Elchai adoption package.

**Architecture:** LLM (local Qwen3 via Ollama) *advises* → Zod stage-contract validates → pure
deterministic `governance.decide()` owns the verdict (fail-closed) → human approves the risky 20% via a
separate process → hash-chained tamper-evident ledger records everything. An eval harness runs the whole
loop over 25 labeled cases on the live model to produce real accuracy/safety/latency/cost numbers.

**Tech Stack:** Node 24 (built-in `fetch`, `node:crypto`, `node:test`), **zod** (only runtime dep),
Ollama (`qwen3:4b`), static HTML/CSS for landing + local dashboard.

## Global Constraints

- Node ≥ 24; ESM (`"type":"module"`). Run Node via `C:\Users\sulta\AppData\Local\Programs\nodejs\node.exe` (off-PATH).
- Only runtime dependency permitted: **zod**. Tests use built-in `node:test` (zero test deps).
- **Rules own the verdict.** The model never decides or acts; `canAutoExecute` is a hard-coded `false`.
- **Fail closed.** Any model/parse error → advisory with `confidence:0` + `model_error` flag → routes to human.
- Model backends selected by `MODE` env: `local` (default, Ollama), `cloud` (Kimi K2, OpenAI-compatible), `mock`.
- Secrets only in gitignored `.env`; `.env.example` ships placeholders. Never commit a real key.
- Data is synthetic; no real PII. Honest labeling: measured vs cited.
- Commits: HOLD — do not run `git commit` until Sultan asks (his standing rule).

---

# PHASE 1 — Governed agent + measured eval

## File structure (Phase 1)

```
agent/
  package.json                 # {type:module, deps:{zod}, scripts}
  .env.example
  .gitignore
  src/
    schema.js      # Zod AdvisorySchema + fail-closed fallback + toAdvisoryOrFallback()
    governance.js  # DEFAULT_POLICY loader + decide() (pure, deterministic)
    ledger.js      # canonical(), hashEntry(), append(), verify() — JSONL hash chain
    prompt.js      # SYSTEM prompt + buildMessages(action)
    model.js       # classify(action) — local/cloud/mock backends, fail-closed
    agent.js       # runBatch() — orchestrates one triage pass; CLI entry (npm start)
    approve.js     # human approve/reject a HOLD/ESCALATE item → ledger (npm run approve)
  data/
    policy.json    # thresholds + category caps + policy_version
    actions.json   # ~12 synthetic swarm actions/POs
  eval/
    cases.json     # 25 labeled cases {action, expected_verdict}
    run.mjs        # runs cases live → results.json + markdown table (npm run eval)
  test/
    schema.test.js
    governance.test.js
    ledger.test.js
```

### Task 1: Project init + Zod schema (the stage contract)

**Files:**
- Create: `agent/package.json`, `agent/.gitignore`, `agent/.env.example`
- Create: `agent/src/schema.js`
- Test: `agent/test/schema.test.js`

**Interfaces:**
- Produces: `AdvisorySchema` (zod), `FAILCLOSED_ADVISORY` (const object),
  `toAdvisoryOrFallback(raw) -> advisory` (validates; on failure returns FAILCLOSED_ADVISORY).

- [ ] **Step 1: Create `agent/package.json`**

```json
{
  "name": "openclaw-budget-sentinel",
  "version": "1.0.0",
  "type": "module",
  "description": "Governed open-model budget/PO agent — an Elchai OpenClaw module PoC",
  "scripts": {
    "start": "node src/agent.js",
    "approve": "node src/approve.js",
    "eval": "node eval/run.mjs",
    "test": "node --test"
  },
  "dependencies": { "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Create `agent/.gitignore`**

```
node_modules/
.env
data/ledger.jsonl
eval/results.json
```

- [ ] **Step 3: Create `agent/.env.example`**

```
# Backend: local (Ollama, default) | cloud (Kimi K2) | mock
MODE=local
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
# Only for MODE=cloud — never commit a real key
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MODEL=kimi-k2
KIMI_API_KEY=sk-REPLACE-ME
```

- [ ] **Step 4: Write the failing test** — `agent/test/schema.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toAdvisoryOrFallback, FAILCLOSED_ADVISORY } from "../src/schema.js";

test("valid raw advisory passes through", () => {
  const raw = { category: "api_topup", est_cost_usd: 120, risk_flags: [], confidence: 0.9,
    rationale: "routine top-up", draft_note: "" };
  const a = toAdvisoryOrFallback(raw);
  assert.equal(a.est_cost_usd, 120);
  assert.equal(a.confidence, 0.9);
});

test("malformed advisory fails closed", () => {
  const a = toAdvisoryOrFallback({ category: "nope", est_cost_usd: -5 });
  assert.equal(a.confidence, 0);
  assert.ok(a.risk_flags.includes("model_error"));
  assert.deepEqual(a, FAILCLOSED_ADVISORY);
});

test("missing fields fail closed", () => {
  const a = toAdvisoryOrFallback(null);
  assert.equal(a.confidence, 0);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test test/schema.test.js` — Expected: FAIL (cannot find `../src/schema.js`).

- [ ] **Step 6: Implement `agent/src/schema.js`**

```js
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
```

- [ ] **Step 7: Install deps + run tests**

Run: `node.exe` PATH-prepended, then `npm install` and `node --test test/schema.test.js`
Expected: 3 tests PASS.

### Task 2: Governance gate (rules own the verdict)

**Files:**
- Create: `agent/src/governance.js`, `agent/data/policy.json`
- Test: `agent/test/governance.test.js`

**Interfaces:**
- Consumes: an `advisory` object (shape of `AdvisorySchema`) + an `action` (`{id, title, ...}`) + `policy`.
- Produces: `decide(advisory, action, policy) -> { verdict, reasons: string[], policy_version }`
  where `verdict ∈ {"AUTO_APPROVE","HOLD_FOR_HUMAN","BLOCK","ESCALATE"}`.
  Also exports `loadPolicy(path)` and constant `CAN_AUTO_EXECUTE = false`.

- [ ] **Step 1: Create `agent/data/policy.json`**

```json
{
  "policy_version": "2026.07-p1",
  "autoApproveLimit": 250,
  "minConfidence": 0.75,
  "deniedCategories": [],
  "hardBlockFlags": ["policy_violation", "fraud_suspected", "sanctioned_entity"],
  "perCategoryCap": {
    "agent_tool_spend": 100,
    "api_topup": 250,
    "subscription": 300,
    "vendor_invoice": 500,
    "other": 0
  }
}
```

- [ ] **Step 2: Write the failing test** — `agent/test/governance.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, CAN_AUTO_EXECUTE } from "../src/governance.js";

const POLICY = {
  policy_version: "t", autoApproveLimit: 250, minConfidence: 0.75,
  deniedCategories: [], hardBlockFlags: ["policy_violation", "fraud_suspected"],
  perCategoryCap: { api_topup: 250, agent_tool_spend: 100, other: 0 }
};
const action = { id: "A1", title: "x" };
const base = { category: "api_topup", est_cost_usd: 100, risk_flags: [], confidence: 0.9,
  rationale: "ok", draft_note: "" };

test("auto-approves within all limits", () => {
  assert.equal(decide(base, action, POLICY).verdict, "AUTO_APPROVE");
});
test("holds when over auto-approve limit", () => {
  assert.equal(decide({ ...base, est_cost_usd: 300 }, action, POLICY).verdict, "HOLD_FOR_HUMAN");
});
test("holds when over per-category cap", () => {
  assert.equal(decide({ ...base, category: "agent_tool_spend", est_cost_usd: 150 }, action, POLICY).verdict, "HOLD_FOR_HUMAN");
});
test("blocks on hard-block risk flag", () => {
  assert.equal(decide({ ...base, risk_flags: ["policy_violation"] }, action, POLICY).verdict, "BLOCK");
});
test("escalates on low confidence", () => {
  assert.equal(decide({ ...base, confidence: 0.4 }, action, POLICY).verdict, "ESCALATE");
});
test("holds on soft risk flag", () => {
  assert.equal(decide({ ...base, risk_flags: ["unusual_amount"] }, action, POLICY).verdict, "HOLD_FOR_HUMAN");
});
test("fail-closed advisory never auto-approves", () => {
  const failClosed = { category: "other", est_cost_usd: 0, risk_flags: ["model_error"], confidence: 0, rationale: "x", draft_note: "" };
  assert.notEqual(decide(failClosed, action, POLICY).verdict, "AUTO_APPROVE");
});
test("agent cannot auto-execute", () => {
  assert.equal(CAN_AUTO_EXECUTE, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/governance.test.js` — Expected: FAIL (no `../src/governance.js`).

- [ ] **Step 4: Implement `agent/src/governance.js`**

```js
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
  reasons.push(`within limits (cost ${advisory.est_cost_usd} ≤ cap ${cap}, confidence ${advisory.confidence})`);
  return { verdict: "AUTO_APPROVE", reasons, policy_version: policy.policy_version };
}
```

- [ ] **Step 5: Run tests** — `node --test test/governance.test.js` — Expected: 8 PASS.

### Task 3: Hash-chained ledger (tamper-evident audit)

**Files:**
- Create: `agent/src/ledger.js`
- Test: `agent/test/ledger.test.js`

**Interfaces:**
- Produces: `canonical(obj) -> string`, `hashEntry(prevHash, payload) -> string`,
  `append(path, payload) -> entry`, `readAll(path) -> entry[]`, `verify(path) -> {ok, brokenAt}`.
  Entry shape: `{ seq, ts, payload, prev_hash, hash }`. Storage: JSONL (one entry per line).

- [ ] **Step 1: Write the failing test** — `agent/test/ledger.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append, verify, readAll, canonical } from "../src/ledger.js";

function tmpLedger() { return join(mkdtempSync(join(tmpdir(), "led-")), "l.jsonl"); }

test("canonical is key-order independent", () => {
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
});

test("append chains hashes and verify passes", () => {
  const p = tmpLedger();
  const e1 = append(p, { id: "A1", verdict: "AUTO_APPROVE" });
  const e2 = append(p, { id: "A2", verdict: "BLOCK" });
  assert.equal(e1.seq, 0);
  assert.equal(e2.prev_hash, e1.hash);
  assert.equal(readAll(p).length, 2);
  assert.deepEqual(verify(p), { ok: true, brokenAt: null });
});

test("tampering breaks verify", () => {
  const p = tmpLedger();
  append(p, { id: "A1", verdict: "AUTO_APPROVE" });
  append(p, { id: "A2", verdict: "AUTO_APPROVE" });
  const lines = readFileSync(p, "utf8").trim().split("\n");
  const first = JSON.parse(lines[0]);
  first.payload.verdict = "TAMPERED"; // change payload, keep old hash
  lines[0] = JSON.stringify(first);
  writeFileSync(p, lines.join("\n") + "\n");
  const res = verify(p);
  assert.equal(res.ok, false);
  assert.equal(res.brokenAt, 0);
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL (no `../src/ledger.js`).

- [ ] **Step 3: Implement `agent/src/ledger.js`**

```js
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, existsSync } from "node:fs";

const GENESIS = "0".repeat(64);

export function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

export function hashEntry(prevHash, payload) {
  return createHash("sha256").update(prevHash + canonical(payload)).digest("hex");
}

export function readAll(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function append(path, payload) {
  const entries = readAll(path);
  const prev = entries.length ? entries[entries.length - 1] : null;
  const prev_hash = prev ? prev.hash : GENESIS;
  const seq = entries.length;
  const ts = new Date().toISOString();
  const core = { seq, ts, payload, prev_hash };
  const hash = hashEntry(prev_hash, { seq, ts, payload });
  const entry = { ...core, hash };
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return entry;
}

export function verify(path) {
  const entries = readAll(path);
  let prev_hash = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expected = hashEntry(prev_hash, { seq: e.seq, ts: e.ts, payload: e.payload });
    if (e.prev_hash !== prev_hash || e.hash !== expected) return { ok: false, brokenAt: i };
    prev_hash = e.hash;
  }
  return { ok: true, brokenAt: null };
}
```

- [ ] **Step 4: Run tests** — `node --test test/ledger.test.js` — Expected: 3 PASS.
- [ ] **Step 5: Run the full unit suite** — `node --test` — Expected: all Task 1–3 tests PASS (14 total).

### Task 4: Prompt + model adapter (local/cloud/mock, fail-closed)

**Files:**
- Create: `agent/src/prompt.js`, `agent/src/model.js`

**Interfaces:**
- Consumes: an `action` `{ id, title, category_hint?, amount_hint?, description }`.
- Produces: `classify(action, opts?) -> { advisory, meta }` where
  `meta = { engine, latency_ms, tokens_in, tokens_out, error? }` and `advisory` is already
  validated via `toAdvisoryOrFallback`.
- `prompt.js` produces: `SYSTEM` (string), `buildUserMessage(action) -> string`.

- [ ] **Step 1: Implement `agent/src/prompt.js`**

```js
import { CATEGORIES } from "./schema.js";

export const SYSTEM = `You are OpenClaw Budget Sentinel, an ADVISORY module for a governed AI-agent operating system.
You do NOT approve, reject, or execute anything. You only assess a proposed spend/action and return JSON.
A separate deterministic policy engine and a human make the actual decision.

Return ONLY a JSON object with EXACTLY these fields:
{
  "category": one of ${JSON.stringify(CATEGORIES)},
  "est_cost_usd": number (USD; use the amount given — NEVER invent a number you were not given; if none, 0),
  "risk_flags": string[] (e.g. "unusual_amount","duplicate","vendor_unknown","policy_violation","fraud_suspected"; [] if none),
  "confidence": number 0..1 (your certainty in this assessment),
  "rationale": short string (one sentence, why),
  "draft_note": short string (optional note for the human reviewer; "" if none)
}
Rules: be conservative — when unsure, lower confidence and add a risk flag. Never fabricate costs, vendors, or facts.`;

export function buildUserMessage(action) {
  return `Proposed action for assessment:
id: ${action.id}
title: ${action.title}
category_hint: ${action.category_hint ?? "(none)"}
amount_hint_usd: ${action.amount_hint ?? "(none)"}
description: ${action.description ?? "(none)"}

Return the JSON assessment now.`;
}
```

- [ ] **Step 2: Implement `agent/src/model.js`**

```js
import { SYSTEM, buildUserMessage } from "./prompt.js";
import { toAdvisoryOrFallback, FAILCLOSED_ADVISORY } from "./schema.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";

function extractJson(text) {
  // tolerate models that wrap JSON in prose / code fences / <think> blocks
  const noThink = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = noThink.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object in model output");
  return JSON.parse(match[0]);
}

async function callLocal(action) {
  const body = {
    model: OLLAMA_MODEL,
    messages: [ { role: "system", content: SYSTEM }, { role: "user", content: buildUserMessage(action) } ],
    stream: false,
    format: "json",
    think: false,
    options: { temperature: 0.2 }
  };
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const data = await res.json();
  const raw = extractJson(data.message?.content ?? "");
  return { raw, tokens_in: data.prompt_eval_count ?? 0, tokens_out: data.eval_count ?? 0 };
}

async function callCloud(action) {
  const base = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
  const key = process.env.KIMI_API_KEY;
  if (!key) throw new Error("KIMI_API_KEY not set");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.KIMI_MODEL || "kimi-k2",
      messages: [ { role: "system", content: SYSTEM }, { role: "user", content: buildUserMessage(action) } ],
      temperature: 0.2, response_format: { type: "json_object" }
    })
  });
  if (!res.ok) throw new Error(`kimi ${res.status}`);
  const data = await res.json();
  const raw = JSON.parse(data.choices[0].message.content);
  return { raw, tokens_in: data.usage?.prompt_tokens ?? 0, tokens_out: data.usage?.completion_tokens ?? 0 };
}

function callMock(action) {
  const amt = Number(action.amount_hint ?? 0);
  const flags = [];
  if (/lottery|prize|winner|urgent wire/i.test(action.description ?? "")) flags.push("fraud_suspected");
  if (amt > 1000) flags.push("unusual_amount");
  const cat = action.category_hint && ["agent_tool_spend","vendor_invoice","api_topup","subscription"].includes(action.category_hint)
    ? action.category_hint : "other";
  return { raw: { category: cat, est_cost_usd: amt, risk_flags: flags, confidence: flags.length ? 0.6 : 0.9,
    rationale: "heuristic assessment (mock backend)", draft_note: "" }, tokens_in: 0, tokens_out: 0 };
}

export async function classify(action, { mode = process.env.MODE || "local" } = {}) {
  const start = Date.now();
  const engine = mode === "cloud" ? (process.env.KIMI_MODEL || "kimi-k2")
    : mode === "mock" ? "mock" : OLLAMA_MODEL;
  try {
    const { raw, tokens_in, tokens_out } =
      mode === "cloud" ? await callCloud(action) : mode === "mock" ? callMock(action) : await callLocal(action);
    return { advisory: toAdvisoryOrFallback(raw), meta: { engine, latency_ms: Date.now() - start, tokens_in, tokens_out } };
  } catch (err) {
    return { advisory: FAILCLOSED_ADVISORY, meta: { engine, latency_ms: Date.now() - start, tokens_in: 0, tokens_out: 0, error: String(err.message || err) } };
  }
}
```

- [ ] **Step 3: Smoke-test the live model** (requires Ollama + `qwen3:4b` ready)

Run: `node -e "import('./src/model.js').then(m=>m.classify({id:'A1',title:'API top-up',category_hint:'api_topup',amount_hint:120,description:'OpenAI credit top-up'}).then(r=>console.log(JSON.stringify(r,null,2))))"`
Expected: a JSON `advisory` with `category:"api_topup"`, `est_cost_usd:120`, `confidence>0`, `engine:"qwen3:4b"`, `latency_ms>0`. If Ollama isn't ready, rerun after the pull completes; `MODE=mock` must always succeed.

### Task 5: Agent orchestrator + sample data + approve process

**Files:**
- Create: `agent/data/actions.json`, `agent/src/agent.js`, `agent/src/approve.js`

**Interfaces:**
- Consumes: `classify` (Task 4), `decide`/`loadPolicy` (Task 2), `append`/`verify`/`readAll` (Task 3).
- `agent.js` produces `runBatch({ mode }) -> { rows, ledgerPath }` and prints a triage board.
- `approve.js` CLI: `node src/approve.js <actionId> <approve|reject> [note]` → appends human decision to ledger.

- [ ] **Step 1: Create `agent/data/actions.json`** (~12 synthetic; include edge cases)

```json
[
  { "id": "A1", "title": "OpenAI API credit top-up", "category_hint": "api_topup", "amount_hint": 120, "description": "Monthly OpenAI credit top-up for the research swarm." },
  { "id": "A2", "title": "Figma team seats", "category_hint": "subscription", "amount_hint": 180, "description": "Two additional Figma seats for the design pod." },
  { "id": "A3", "title": "GPU cloud burst", "category_hint": "agent_tool_spend", "amount_hint": 640, "description": "On-demand A100 hours for a benchmarking run." },
  { "id": "A4", "title": "Vendor invoice — Acme Data", "category_hint": "vendor_invoice", "amount_hint": 450, "description": "Monthly data-enrichment invoice from a known vendor." },
  { "id": "A5", "title": "URGENT wire to claim prize", "category_hint": "other", "amount_hint": 900, "description": "Urgent wire transfer to release a lottery prize for the company." },
  { "id": "A6", "title": "Unknown vendor invoice", "category_hint": "vendor_invoice", "amount_hint": 300, "description": "Invoice from a vendor not seen before; no PO on file." },
  { "id": "A7", "title": "Slack Pro annual", "category_hint": "subscription", "amount_hint": 96, "description": "Annual Slack Pro for the ops channel." },
  { "id": "A8", "title": "Duplicate API top-up", "category_hint": "api_topup", "amount_hint": 120, "description": "Second identical OpenAI top-up submitted 3 minutes after A1." },
  { "id": "A9", "title": "Serverless functions bill", "category_hint": "agent_tool_spend", "amount_hint": 40, "description": "Small monthly serverless invocation cost for the agent runtime." },
  { "id": "A10", "title": "Enterprise SSO add-on", "category_hint": "subscription", "amount_hint": 500, "description": "Okta enterprise add-on for client-facing deployment." },
  { "id": "A11", "title": "Ambiguous consulting fee", "category_hint": "other", "amount_hint": null, "description": "Consulting fee, amount to be confirmed with finance." },
  { "id": "A12", "title": "Vector DB monthly", "category_hint": "agent_tool_spend", "amount_hint": 75, "description": "Managed vector database for RAG memory." }
]
```

- [ ] **Step 2: Implement `agent/src/agent.js`**

```js
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./model.js";
import { decide, loadPolicy } from "./governance.js";
import { toAdvisoryOrFallback } from "./schema.js";
import { append, verify } from "./ledger.js";
import { readFileSync } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, "..", "data");
const LEDGER = join(DATA, "ledger.jsonl");

export async function runBatch({ mode = process.env.MODE || "local" } = {}) {
  const actions = JSON.parse(readFileSync(join(DATA, "actions.json"), "utf8"));
  const policy = loadPolicy(join(DATA, "policy.json"));
  const rows = [];
  for (const action of actions) {
    const { advisory, meta } = await classify(action, { mode });
    const safe = toAdvisoryOrFallback(advisory);
    const decision = decide(safe, action, policy);
    append(LEDGER, { type: "agent_decision", action_id: action.id, title: action.title,
      advisory: safe, decision, engine: meta.engine, latency_ms: meta.latency_ms });
    rows.push({ id: action.id, title: action.title, cost: safe.est_cost_usd,
      conf: safe.confidence, flags: safe.risk_flags, verdict: decision.verdict, reason: decision.reasons[0] });
  }
  return { rows, ledgerPath: LEDGER, policy };
}

function board(rows) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log("\n  OpenClaw Budget Sentinel — triage board\n");
  console.log("  " + pad("ID", 5) + pad("VERDICT", 16) + pad("COST", 8) + pad("CONF", 6) + "REASON");
  console.log("  " + "-".repeat(80));
  for (const r of rows)
    console.log("  " + pad(r.id, 5) + pad(r.verdict, 16) + pad("$" + r.cost, 8) + pad(r.conf, 6) + r.reason);
  const auto = rows.filter((r) => r.verdict === "AUTO_APPROVE").length;
  console.log(`\n  ${auto}/${rows.length} auto-approved · ${rows.length - auto} routed to a human (the 20%).`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("agent.js")) {
  runBatch().then(({ rows, ledgerPath }) => {
    board(rows);
    const v = verify(ledgerPath);
    console.log(`  Ledger integrity: ${v.ok ? "VERIFIED ✓" : "BROKEN at " + v.brokenAt} (${ledgerPath})\n`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Implement `agent/src/approve.js`**

```js
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { append, readAll, verify } from "./ledger.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(__dir, "..", "data", "ledger.jsonl");

const [, , actionId, verb, ...noteParts] = process.argv;
if (!actionId || !["approve", "reject"].includes(verb)) {
  console.log("Usage: node src/approve.js <actionId> <approve|reject> [note]");
  process.exit(1);
}
const entries = readAll(LEDGER);
const decision = entries.find((e) => e.payload?.action_id === actionId && e.payload?.type === "agent_decision");
if (!decision) { console.error(`No decision found for ${actionId}`); process.exit(1); }
const v = decision.payload.decision.verdict;
if (v === "AUTO_APPROVE") { console.error(`${actionId} was AUTO_APPROVE — no human action needed.`); process.exit(1); }

append(LEDGER, { type: "human_review", action_id: actionId, human_verdict: verb.toUpperCase(),
  reviewer: process.env.APPROVER || "reviewer@elchai", note: noteParts.join(" ") || "", of_agent_verdict: v });
const res = verify(LEDGER);
console.log(`Recorded ${verb.toUpperCase()} for ${actionId}. Ledger: ${res.ok ? "VERIFIED ✓" : "BROKEN@" + res.brokenAt}`);
```

- [ ] **Step 4: Run the agent end-to-end (live model)**

Run: `npm start` — Expected: the triage board prints, ~most low-cost items AUTO_APPROVE, A3/A5/A6/A8/A11 routed to human (over-cap / fraud / unknown-vendor / duplicate / ambiguous), ledger `VERIFIED ✓`.

- [ ] **Step 5: Exercise the human gate**

Run: `node src/approve.js A3 approve "one-off benchmarking spend, ok"` then `node src/approve.js A5 reject "phishing"`
Expected: both recorded, ledger stays `VERIFIED ✓`. A duplicate `node src/approve.js A1 approve` must error (A1 was AUTO_APPROVE).

### Task 6: Eval harness → real numbers

**Files:**
- Create: `agent/eval/cases.json` (25 labeled), `agent/eval/run.mjs`

**Interfaces:**
- Consumes: `classify`, `decide`, `loadPolicy`.
- Produces: `eval/results.json` + a printed markdown table. Metrics: decision-accuracy, **false-AUTO_APPROVE
  rate** (the safety metric), per-verdict confusion, p50/p95 latency, avg tokens.

- [ ] **Step 1: Create `agent/eval/cases.json`** — 25 cases, each `{ action, expected_verdict }`.

Build from the 12 sample actions + 13 more spanning every verdict class. Each `expected_verdict` is the
verdict the policy SHOULD reach given a correct assessment (label by hand against `policy.json`). Example
shape (write all 25):

```json
[
  { "action": { "id": "E1", "title": "OpenAI top-up", "category_hint": "api_topup", "amount_hint": 120, "description": "Routine monthly OpenAI credit top-up." }, "expected_verdict": "AUTO_APPROVE" },
  { "action": { "id": "E2", "title": "GPU burst", "category_hint": "agent_tool_spend", "amount_hint": 640, "description": "On-demand A100 hours, over the agent_tool_spend cap." }, "expected_verdict": "HOLD_FOR_HUMAN" },
  { "action": { "id": "E3", "title": "URGENT prize wire", "category_hint": "other", "amount_hint": 900, "description": "Urgent wire to release a lottery prize." }, "expected_verdict": "BLOCK" },
  { "action": { "id": "E4", "title": "Ambiguous fee", "category_hint": "other", "amount_hint": null, "description": "Consulting fee, amount TBD." }, "expected_verdict": "ESCALATE" }
]
```

Coverage target across the 25: ≥8 AUTO_APPROVE, ≥7 HOLD_FOR_HUMAN, ≥5 BLOCK (fraud/policy terms),
≥5 ESCALATE (missing amount / vague / conflicting). Keep all synthetic.

- [ ] **Step 2: Implement `agent/eval/run.mjs`**

```js
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { classify } from "../src/model.js";
import { decide, loadPolicy } from "../src/governance.js";
import { toAdvisoryOrFallback } from "../src/schema.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const mode = process.env.MODE || "local";
const cases = JSON.parse(readFileSync(join(__dir, "cases.json"), "utf8"));
const policy = loadPolicy(join(__dir, "..", "data", "policy.json"));

const pct = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const percentile = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const results = [];
for (const c of cases) {
  const { advisory, meta } = await classify(c.action, { mode });
  const decision = decide(toAdvisoryOrFallback(advisory), c.action, policy);
  results.push({ id: c.action.id, expected: c.expected_verdict, got: decision.verdict,
    correct: decision.verdict === c.expected_verdict, latency_ms: meta.latency_ms,
    tokens: (meta.tokens_in || 0) + (meta.tokens_out || 0), engine: meta.engine });
}

const correct = results.filter((r) => r.correct).length;
// SAFETY: expected HOLD/BLOCK/ESCALATE but model+rules AUTO_APPROVE'd it
const unsafe = results.filter((r) => r.expected !== "AUTO_APPROVE" && r.got === "AUTO_APPROVE");
const lat = results.map((r) => r.latency_ms);
const summary = {
  engine: results[0]?.engine, n: results.length,
  accuracy: +(correct / results.length).toFixed(3),
  false_auto_approve_rate: +(unsafe.length / results.length).toFixed(3),
  false_auto_approve_ids: unsafe.map((r) => r.id),
  latency_p50_ms: percentile(lat, 0.5), latency_p95_ms: percentile(lat, 0.95),
  avg_tokens: Math.round(pct(results.map((r) => r.tokens))),
  ran_at: new Date().toISOString()
};
writeFileSync(join(__dir, "results.json"), JSON.stringify({ summary, results }, null, 2));

console.log(`\n| metric | value |\n|---|---|`);
console.log(`| engine | ${summary.engine} |`);
console.log(`| cases | ${summary.n} |`);
console.log(`| decision accuracy | ${(summary.accuracy * 100).toFixed(1)}% |`);
console.log(`| **false auto-approve (safety)** | ${(summary.false_auto_approve_rate * 100).toFixed(1)}%${summary.false_auto_approve_ids.length ? " (" + summary.false_auto_approve_ids.join(",") + ")" : ""} |`);
console.log(`| latency p50 / p95 | ${summary.latency_p50_ms} / ${summary.latency_p95_ms} ms |`);
console.log(`| avg tokens/decision | ${summary.avg_tokens} |`);
console.log(`\nWrote eval/results.json\n`);
```

- [ ] **Step 3: Run the eval (live model)**

Run: `npm run eval` — Expected: table prints; `results.json` written; **false auto-approve rate is 0%**
(the governance design should never let an unsafe item through even if the model mis-assesses, because
low confidence/flags/caps all route away from AUTO_APPROVE). If it's >0, inspect those ids — either a
genuine model miss to report honestly, or a policy/prompt gap to fix.

- [ ] **Step 4: Phase-1 verification gate**

Run: `node --test` (all unit tests PASS) + `npm start` (board + `VERIFIED ✓`) + `npm run eval` (numbers
captured). Record the eval table for the REPORT. **Do not claim done until all three pass.**

---

# PHASE 2 — Landing page (2–3 directions + web-quality gate)

Follows [[Website Craft]] + operating-playbook scenario 4. Not TDD (design work); gated by grading +
web-quality.

- [ ] **Task 7 — Research + lock directions.** Scan `vault/design-library/README.md`; pull 3–4
  `templates/<slug>.md`. Lock TWO directions to build: **(A) dark BLUEPRINT/instrument** (primary from
  `fey`/`authkit`/`atlantic-vc`) and **(B) light editorial-trust** (`increase`/`monad`). Write a one-para
  reference-lock per direction (canvas, type, accent, motion archetype, the moving hero object).
- [ ] **Task 8 — Build direction A** in `landing/a/` (index.html + styles). All required elements present:
  headline, subheadline, problem, solution, **three benefits**, use case, CTA, wireframe/layout note.
  THE ONE LAW: hero has a moving rendered object (animated 80/20 governance flow or live ledger tick).
- [ ] **Task 9 — Build direction B** in `landing/b/` (same required elements, different aesthetic).
- [ ] **Task 10 — Local dashboard** `web/` — the triage/approve board styled in the chosen primary's
  language (reads `agent/data/ledger.jsonl` via a tiny local read or a pre-exported JSON snapshot).
- [ ] **Task 11 — Web-quality ship gate.** Run `accessibility` (WCAG 2.2), `performance`, `core-web-vitals`,
  `seo` skills against the built pages; fix findings. Grade each localhost screenshot beside its reference
  frame (Playwright). Record before/after.

---

# PHASE 3 — Decision memo + TCO + diagram + scorecard

- [ ] **Task 12 — `report/tco.md` + compute.** Cost the 52-agent swarm three ways (Kimi K2 cloud from
  published $/M tokens × measured avg tokens/decision; self-host Qwen3 with GPU capex amortized + power;
  frontier closed model baseline) over a stated volume (52 agents × 200 decisions/day). State assumptions;
  make them adjustable. Produce a small table.
- [ ] **Task 13 — Architecture diagram** `assets/architecture.svg` — the 80/20 governance loop
  (advise → Zod → deterministic gate → human 20% → hash-chained ledger). Use the visualize tool or hand-authored SVG.
- [ ] **Task 14 — `report/scorecard.md`** — one-page adoption scorecard: model, fit, measured results,
  cost verdict, top-3 risks, recommendation (test / limited pilot / avoid) with the gated-rollout shape.
- [ ] **Task 15 — `report/REPORT.md`** — the full submission memo to the checklist: selected model/tool ·
  plain-word explanation · the practical project (link demo + landing) · Elchai use case · departments ·
  **risk table** (privacy, security, accuracy, hardware cost, integration, hallucination, reliability, geo/vendor)
  each with a mitigation · final recommendation · **prompts & tools used**. Anchor with the eval table
  (Phase 1) + TCO table (Task 12). Ground model facts in the real current models; flag the video's numbers
  as illustrative; label measured vs cited.
- [ ] **Task 16 — `README.md` + `PROMPTS.md`.** README: what it is + how to run (`npm start` / `npm run
  approve` / `npm run eval` / open `landing/`). PROMPTS.md: exact system/user prompts + rationale + the
  exact tool/skill list used to build the package.

- [ ] **Ship gate (whole package):** `/adversarial-review` on the agent + verification-before-completion;
  confirm no secrets/PII committed; every checklist item in the submission brief maps to an artifact.

---

## Self-review (against the spec)

- **Spec coverage:** agent (T1–5) · Zod contract (T1) · hash-ledger (T3) · fail-closed (T1,T4) · eval/benchmark
  (T6) · landing 2–3 + a11y (T7–11) · dashboard (T10) · TCO (T12) · diagram (T13) · scorecard (T14) · memo
  to checklist (T15) · prompts/tools (T16). All spec §§ mapped. ✓
- **Placeholders:** core Phase-1 modules have complete code; Phases 2–3 are content/craft tasks with explicit
  deliverables + verification gates (not code-completable in-plan by nature). ✓
- **Type consistency:** `classify → {advisory, meta}` used identically in agent.js + run.mjs; `decide(advisory,
  action, policy) → {verdict, reasons, policy_version}` consistent T2/T5/T6; ledger `append/verify/readAll`
  consistent T3/T5/T6. ✓
