import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluatePolicyRules, loadPolicy, validatePolicy } from "../src/custom-policy.mjs";
import { evaluateHook } from "../src/hook.mjs";

const base = {
  version: 1,
  thresholds: { safeProbability: 0.92, readOnlySafeProbability: 0.78, minimumConfidence: 0.6 },
  context: { environment: ["github.example.com/acme"], instructions: ["Staging is disposable."] },
  rules: [
    { id: "allow-tests", decision: "allow", tool: "run_command", argument: "CommandLine", equals: "npm test" },
    { id: "ask-push", decision: "ask", tool: "run_command", argument: "CommandLine", startsWith: "git push " },
    { id: "deny-prod", decision: "deny", tool: "run_command", argument: "CommandLine", startsWith: "kubectl delete -n prod" },
  ],
};

test("custom policy validation is strict", () => {
  const policy = validatePolicy(base);
  assert.equal(policy.rules.length, 3);
  assert.equal(policy.thresholds.readOnlySafeProbability, 0.78);
  assert.throws(() => validatePolicy({ ...base, typo: true }), /unknown field/);
  assert.throws(() => validatePolicy({ ...base, thresholds: { safeProbability: 2 } }), /between 0 and 1/);
  assert.throws(() => validatePolicy({ ...base, rules: [{ id: "bad", decision: "allow", tool: "run_command", argument: "CommandLine" }] }), /exactly one/);
});

test("custom rules use deny then ask then allow precedence", () => {
  const policy = validatePolicy({
    ...base,
    rules: [
      { id: "allow-all-shell", decision: "allow", tool: "run_command" },
      { id: "ask-push", decision: "ask", tool: "run_command", argument: "CommandLine", startsWith: "git push" },
      { id: "deny-main", decision: "deny", tool: "run_command", argument: "CommandLine", equals: "git push origin main" },
    ],
  });
  assert.equal(evaluatePolicyRules(policy, { name: "run_command", args: { CommandLine: "git push origin main" } }).decision, "deny");
  assert.equal(evaluatePolicyRules(policy, { name: "run_command", args: { CommandLine: "git push origin feature" } }).decision, "force_ask");
  assert.equal(evaluatePolicyRules(policy, { name: "run_command", args: { CommandLine: "npm test" } }).decision, "allow");
});

test("policy loader accepts secure files and rejects writable policy files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-policy-test-"));
  const path = join(directory, "policy.json");
  await writeFile(path, JSON.stringify(base), { mode: 0o600 });
  assert.equal((await loadPolicy(path)).configured, true);
  if (process.platform !== "win32") {
    await chmod(path, 0o666);
    await assert.rejects(() => loadPolicy(path), /must not be group- or world-writable/);
  }
});

test("hook applies custom allow without Jev but built-in holds remain first", async () => {
  const policy = validatePolicy(base);
  let called = false;
  const loadPolicyImpl = async () => ({ policy, path: "/test/policy.json", configured: true });
  const allowed = await evaluateHook(
    { toolCall: { name: "run_command", args: { CommandLine: "npm test" } } },
    { loadPolicyImpl, fetchImpl: async () => { called = true; } },
  );
  assert.equal(allowed.decision, "allow");
  assert.equal(called, false);

  const held = await evaluateHook(
    { toolCall: { name: "run_command", args: { CommandLine: "rm -rf build" } } },
    {
      loadPolicyImpl: async () => ({
        policy: validatePolicy({
          ...base,
          rules: [{ id: "allow-delete", decision: "allow", tool: "run_command", argument: "CommandLine", equals: "rm -rf build" }],
        }),
      }),
    },
  );
  assert.equal(held.decision, "force_ask");
  assert.match(held.reason, /Known high-risk/);
});

test("hook sends owner context to Jev and applies policy thresholds", async () => {
  const policy = validatePolicy({ ...base, rules: [] });
  const result = await evaluateHook(
    { toolCall: { name: "run_command", args: { CommandLine: "npm run custom" } }, workspacePaths: ["/repo"] },
    {
      apiKey: "test",
      loadPolicyImpl: async () => ({ policy, path: "/test/policy.json", configured: true }),
      recentUserRequestsImpl: async () => ["Run the custom task"],
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        assert.match(request.state, /github\.example\.com\/acme/);
        return new Response(JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            safety: {
              type: "choice",
              choice: "safe",
              probabilities: { safe: 0.91, ask: 0.09 },
              confidence: 0.9,
            },
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  );
  assert.equal(result.decision, "force_ask");
});

test("invalid policy loading fails closed", async () => {
  const result = await evaluateHook(
    { toolCall: { name: "run_command", args: { CommandLine: "npm test" } } },
    { loadPolicyImpl: async () => { throw new Error("invalid policy"); } },
  );
  assert.equal(result.decision, "force_ask");
  assert.match(result.reason, /invalid policy/);
});
