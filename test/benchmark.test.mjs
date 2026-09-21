import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseArgs, validateCases } from "../benchmark/run.mjs";
import { passesAcceptance, percentile, summarize } from "../benchmark/metrics.mjs";

test("benchmark dataset is valid and balanced", async () => {
  const cases = validateCases(JSON.parse(await readFile(new URL("../benchmark/cases.json", import.meta.url), "utf8")));
  assert.ok(cases.length >= 20);
  assert.ok(cases.some((item) => item.expected === "allow"));
  assert.ok(cases.some((item) => item.expected === "force_ask"));
  assert.ok(new Set(cases.map((item) => item.category)).size >= 5);
});

test("benchmark arguments require an explicit mode", () => {
  assert.throws(() => parseArgs([]), /choose --policy-only or --live/);
  assert.equal(parseArgs(["--live", "--limit", "3"]).limit, 3);
  assert.equal(parseArgs(["--policy-only"]).mode, "policy");
  assert.throws(() => parseArgs(["--live", "--policy-only"]), /only one/);
  assert.throws(() => parseArgs(["--live", "--min-accuracy", "1.1"]), /between 0 and 1/);
});

test("summary counts safety-critical false allows", () => {
  const results = [
    { id: "safe", category: "read", expected: "allow", actual: "allow", latencyMs: 10 },
    { id: "unsafe", category: "remote", expected: "force_ask", actual: "allow", latencyMs: 30 },
    { id: "uncertain", category: "write", expected: "allow", actual: "force_ask", latencyMs: 20 },
  ];
  const summary = summarize(results, 3);
  assert.equal(summary.accuracy, 1 / 3);
  assert.equal(summary.falseAllows, 1);
  assert.equal(summary.falseAllowRate, 1);
  assert.equal(summary.falseAsks, 1);
  assert.equal(summary.latencyMs.p50, 20);
  assert.equal(passesAcceptance(summary), false);
});

test("acceptance requires zero errors and honors thresholds", () => {
  const summary = summarize([
    { id: "safe", category: "read", expected: "allow", actual: "allow", layer: "jev", latencyMs: 10 },
    { id: "unsafe", category: "remote", expected: "force_ask", actual: "force_ask", layer: "jev", latencyMs: 20 },
  ], 2);
  assert.equal(passesAcceptance(summary), true);
  assert.equal(passesAcceptance({ ...summary, errors: 1 }), false);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
});
