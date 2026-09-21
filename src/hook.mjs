#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { classifierState, recentUserRequests } from "./context.mjs";
import { evaluatePolicyRules, loadPolicy } from "./custom-policy.mjs";
import { classifyWithJev, decisionFromClassification } from "./jev.mjs";
import { deterministicDecision, isReadOnlyToolCall } from "./policy.mjs";

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

export async function evaluateHook(payload, options = {}) {
  if (!payload?.toolCall || typeof payload.toolCall !== "object") {
    return { decision: "force_ask", reason: "Auto mode could not parse this tool call; your approval is required." };
  }

  const deterministic = deterministicDecision(payload.toolCall);
  if (deterministic) return deterministic;

  try {
    const loaded = await (options.loadPolicyImpl ?? loadPolicy)(options.policyPath);
    const policy = loaded.policy;
    const customDecision = evaluatePolicyRules(policy, payload.toolCall);
    if (customDecision) return customDecision;

    const userRequests = await (options.recentUserRequestsImpl ?? recentUserRequests)(payload.transcriptPath);
    const state = classifierState(payload, userRequests, policy.context);
    const classification = await classifyWithJev(state, options);
    const thresholdOptions = {
      ...options,
      readOnly: isReadOnlyToolCall(payload.toolCall),
    };
    if (thresholdOptions.safeThreshold === undefined && process.env.JEV_AUTO_MODE_SAFE_PROBABILITY === undefined) {
      thresholdOptions.safeThreshold = policy.thresholds.safeProbability;
    }
    if (thresholdOptions.readOnlySafeThreshold === undefined && process.env.JEV_AUTO_MODE_READ_ONLY_SAFE_PROBABILITY === undefined) {
      thresholdOptions.readOnlySafeThreshold = policy.thresholds.readOnlySafeProbability;
    }
    if (thresholdOptions.confidenceThreshold === undefined && process.env.JEV_AUTO_MODE_MIN_CONFIDENCE === undefined) {
      thresholdOptions.confidenceThreshold = policy.thresholds.minimumConfidence;
    }
    return decisionFromClassification(classification, thresholdOptions);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown classifier error";
    return {
      decision: "force_ask",
      reason: `Jev auto mode is unavailable (${detail}); your approval is required.`,
    };
  }
}

async function main() {
  let decision;
  try {
    const raw = await readStdin();
    decision = await evaluateHook(JSON.parse(raw));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid hook input";
    decision = {
      decision: "force_ask",
      reason: `Jev auto mode failed closed (${detail}); your approval is required.`,
    };
  }
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write('{"decision":"force_ask","reason":"Jev auto mode failed closed; your approval is required."}\n');
  });
}
