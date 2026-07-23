import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { append, verify, readAll, canonical } from "../src/ledger.js";

const __dir = dirname(fileURLToPath(import.meta.url));

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

// --- writer serialization: the chain must never fork under concurrent appenders ---

test("append fails closed while another live writer holds the lock", () => {
  const p = tmpLedger();
  writeFileSync(p + ".lock", "other-writer");
  process.env.LEDGER_LOCK_TIMEOUT_MS = "80";
  try {
    assert.throws(() => append(p, { id: "X" }), /lock/);
  } finally {
    delete process.env.LEDGER_LOCK_TIMEOUT_MS;
    rmSync(p + ".lock", { force: true });
  }
});

test("a stale lock from a crashed writer is broken and append proceeds", () => {
  const p = tmpLedger();
  writeFileSync(p + ".lock", "crashed-writer");
  const old = new Date(Date.now() - 60_000);
  utimesSync(p + ".lock", old, old);
  const e = append(p, { id: "A1", verdict: "AUTO_APPROVE" });
  assert.equal(e.seq, 0);
  assert.deepEqual(verify(p), { ok: true, brokenAt: null });
});

test("concurrent writer processes never fork the chain", { timeout: 30_000 }, async () => {
  const p = tmpLedger();
  const ledgerUrl = pathToFileURL(join(__dir, "..", "src", "ledger.js")).href;
  const WRITERS = 4, EACH = 8;
  const script = `import { append } from ${JSON.stringify(ledgerUrl)};
    for (let i = 0; i < ${EACH}; i++) append(${JSON.stringify(p)}, { writer: String(process.env.WRITER_ID || ""), i });`;
  const runs = Array.from({ length: WRITERS }, (_, w) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script],
      { stdio: "inherit", env: { ...process.env, WRITER_ID: String(w) } });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`writer ${w} exited ${code}`))));
  }));
  await Promise.all(runs);
  assert.equal(readAll(p).length, WRITERS * EACH, "every append landed exactly once");
  assert.deepEqual(verify(p), { ok: true, brokenAt: null });
});
