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
  const hash = hashEntry(prev_hash, { seq, ts, payload });
  const entry = { seq, ts, payload, prev_hash, hash };
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return entry;
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
