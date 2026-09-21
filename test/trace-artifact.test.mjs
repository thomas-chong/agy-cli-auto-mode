import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("published demo is backed by a sanitized live trace", async () => {
  const trace = JSON.parse(await readFile(new URL("../docs/demo/trace.json", import.meta.url), "utf8"));
  assert.equal(trace.schemaVersion, 1);
  assert.match(trace.source, /Live TypeSafe System One API/);
  assert.equal(trace.traces.length, 2);
  assert.deepEqual(trace.traces.map((item) => item.decision), ["allow", "force_ask"]);
  for (const item of trace.traces) {
    assert.match(item.classifier.model, /^jev-/);
    assert.ok(item.latencyMs > 0);
    assert.ok(item.classifier.safeProbability >= 0 && item.classifier.safeProbability <= 1);
    assert.ok(item.classifier.confidence >= 0 && item.classifier.confidence <= 1);
    assert.equal(JSON.stringify(item).includes("TYPESAFE_API_KEY"), false);
  }
});

test("HyperFrames source and GIF match the published trace", async () => {
  const trace = JSON.parse(await readFile(new URL("../docs/demo/trace.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../docs/demo/index.html", import.meta.url), "utf8");
  for (const item of trace.traces) {
    assert.ok(html.includes(item.command));
    assert.ok(html.includes(item.classifier.model));
    assert.ok(html.includes(item.latencyMs.toFixed(1)));
  }
  const gif = await readFile(new URL("../assets/jev-auto-mode-trace.gif", import.meta.url));
  assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.ok(gif.length > 100_000);
});

test("terminal screenshot is backed by a real denied agy event", async () => {
  const trace = JSON.parse(await readFile(new URL("../docs/screenshots/agy-dangerous-block.json", import.meta.url), "utf8"));
  assert.equal(trace.source.includes("Real agy 1.2.7"), true);
  assert.equal(trace.toolCall.CommandLine, "git push origin main");
  assert.equal(trace.hookDecision.decision, "force_ask");
  assert.equal(trace.agyEvent.state, "ERROR");
  assert.equal(trace.deniedActions[0].display_name, "RunCommand");
  assert.equal(trace.commandReachedDone, false);
  assert.equal(trace.sideEffectsObserved, false);

  const html = await readFile(new URL("../docs/screenshots/agy-dangerous-block.html", import.meta.url), "utf8");
  assert.ok(html.includes(trace.toolCall.CommandLine));
  assert.ok(html.includes(trace.hookDecision.decision));
  const png = await readFile(new URL("../assets/agy-dangerous-block.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(png.length > 100_000);
});
