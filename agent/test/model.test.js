import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { classify } from "../src/model.js";

test("hung model server fails closed to human review, not a hang", { timeout: 10_000 }, async () => {
  const server = createServer(() => { /* accept the request, never respond */ });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  process.env.OLLAMA_URL = `http://127.0.0.1:${port}`;
  process.env.MODEL_TIMEOUT_MS = "150";
  try {
    const t0 = Date.now();
    const { advisory, meta } = await classify({ id: "T1", title: "hang probe" }, { mode: "local" });
    assert.ok(Date.now() - t0 < 5000, "call must abort, not hang");
    assert.equal(advisory.confidence, 0, "fail-closed advisory has zero confidence");
    assert.ok(advisory.risk_flags.includes("needs_human_review"));
    assert.match(String(meta.error), /timeout|abort/i, "the failure is the abort timeout, not a connection error");
  } finally {
    delete process.env.MODEL_TIMEOUT_MS;
    delete process.env.OLLAMA_URL;
    server.closeAllConnections?.();
    server.close();
  }
});
