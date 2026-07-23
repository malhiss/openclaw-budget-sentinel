import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, existsSync, openSync, closeSync, writeSync, statSync, rmSync } from "node:fs";

const GENESIS = "0".repeat(64);

const LOCK_TIMEOUT_MS = () => Number(process.env.LEDGER_LOCK_TIMEOUT_MS || 5_000);
const LOCK_STALE_MS = () => Number(process.env.LEDGER_LOCK_STALE_MS || 10_000);

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// Advisory lock: one writer at a time, so concurrent appends can never read the
// same tail and fork the hash chain (append is read-then-write). O_EXCL create is
// atomic on every platform; a lock older than LEDGER_LOCK_STALE_MS is treated as
// a crashed writer and broken. Serializing the writer is also the prerequisite
// for any ledger-derived velocity/idempotency check.
function acquireLock(path) {
  const lockPath = path + ".lock";
  const deadline = Date.now() + LOCK_TIMEOUT_MS();
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return lockPath;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS()) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch { /* lock vanished between check and stat — retry */ }
      if (Date.now() >= deadline) throw new Error(`ledger lock timeout — another writer holds ${lockPath}`);
      sleepSync(20);
    }
  }
}

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
  const lock = acquireLock(path);
  try {
    const entries = readAll(path);
    const prev = entries.length ? entries[entries.length - 1] : null;
    const prev_hash = prev ? prev.hash : GENESIS;
    const seq = entries.length;
    const ts = new Date().toISOString();
    const hash = hashEntry(prev_hash, { seq, ts, payload });
    const entry = { seq, ts, payload, prev_hash, hash };
    appendFileSync(path, JSON.stringify(entry) + "\n");
    // append-and-check: fail loudly if a non-cooperating writer raced us anyway
    if (readAll(path)[seq]?.hash !== hash)
      throw new Error("ledger append raced by an unserialized writer — chain integrity not guaranteed");
    return entry;
  } finally {
    rmSync(lock, { force: true });
  }
}

// Detects any modification or reordering of recorded entries. It does NOT detect
// deletion of the most recent entries (truncation): closing that needs the latest
// hash anchored externally (e.g. a signed checkpoint) — a standard extension, not built here.
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
