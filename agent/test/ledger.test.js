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
