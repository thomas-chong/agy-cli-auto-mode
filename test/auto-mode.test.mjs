import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { redact } from "../src/context.mjs";
import { evaluateHook } from "../src/hook.mjs";
import { parseSafetyAnswer } from "../src/jev.mjs";
import { deterministicDecision } from "../src/policy.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("known destructive commands always ask without calling Jev", async () => {
  let called = false;
  const result = await evaluateHook(
    { toolCall: { name: "run_command", args: { CommandLine: "rm -rf build" } } },
    { apiKey: "test", fetchImpl: async () => { called = true; } },
  );
  assert.equal(result.decision, "force_ask");
  assert.equal(called, false);
});

test("sensitive paths always ask", () => {
  const result = deterministicDecision({ name: "view_file", args: { AbsolutePath: "/home/me/.ssh/id_ed25519" } });
  assert.equal(result.decision, "force_ask");
});

test("a confident safe Jev choice is allowed", async () => {
  const result = await evaluateHook(
    {
      toolCall: { name: "run_command", args: { CommandLine: "npm test" } },
      workspacePaths: ["/repo"],
    },
    {
      apiKey: "test",
      recentUserRequestsImpl: async () => ["Run the tests"],
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        assert.equal(request.model, "jev-latest");
        assert.equal(request.questions.safety.type, "choice");
        return response({
          model: "jev-1.13.0",
          answers: {
            safety: {
              type: "choice",
              choice: "safe",
              probabilities: { safe: 0.97, ask: 0.03 },
              confidence: 0.94,
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        });
      },
    },
  );
  assert.equal(result.decision, "allow");
});

test("risk, uncertainty, and classifier failures ask the user", async (t) => {
  await t.test("risk choice", async () => {
    const result = await evaluateHook(
      { toolCall: { name: "call_mcp_tool", args: { server: "payments", tool: "charge" } } },
      {
        apiKey: "test",
        recentUserRequestsImpl: async () => [],
        fetchImpl: async () => response({
          model: "jev-1.13.0",
          answers: {
            safety: {
              type: "choice",
              choice: "ask",
              probabilities: { safe: 0.02, ask: 0.98 },
              confidence: 0.95,
            },
          },
        }),
      },
    );
    assert.equal(result.decision, "force_ask");
  });

  await t.test("low confidence", async () => {
    const result = await evaluateHook(
      { toolCall: { name: "replace_file_content", args: { TargetFile: "src/app.js" } } },
      {
        apiKey: "test",
        recentUserRequestsImpl: async () => [],
        fetchImpl: async () => response({
          model: "jev-1.13.0",
          answers: {
            safety: {
              type: "choice",
              choice: "safe",
              probabilities: { safe: 0.72, ask: 0.28 },
              confidence: 0.4,
            },
          },
        }),
      },
    );
    assert.equal(result.decision, "force_ask");
  });

  await t.test("API failure", async () => {
    const result = await evaluateHook(
      { toolCall: { name: "run_command", args: { CommandLine: "git status" } } },
      {
        apiKey: "test",
        recentUserRequestsImpl: async () => [],
        fetchImpl: async () => response({ error: "unavailable" }, 503),
      },
    );
    assert.equal(result.decision, "force_ask");
  });
});

test("invalid API answers are rejected", () => {
  assert.throws(() => parseSafetyAnswer({ answers: { safety: { type: "choice", choice: "safe" } } }));
});

test("secrets are redacted before classification", () => {
  const bearer = ["abcdefgh", "ijklmnop"].join("");
  const apiKey = ["topsecret", "value"].join("");
  const value = redact({ authorization: `Bearer ${bearer}`, api_key: apiKey });
  assert.ok(!value.includes(bearer));
  assert.ok(!value.includes(apiKey));
  assert.match(value, /REDACTED/);
});

test("CLI emits a valid fail-closed decision for malformed input", () => {
  const output = execFileSync(process.execPath, ["src/hook.mjs"], {
    cwd: new URL("..", import.meta.url),
    input: "not json",
    encoding: "utf8",
  });
  assert.equal(JSON.parse(output).decision, "force_ask");
});
