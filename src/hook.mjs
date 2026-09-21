#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { classifierState, recentUserRequests } from "./context.mjs";
import { classifyWithJev, decisionFromClassification } from "./jev.mjs";
import { deterministicDecision } from "./policy.mjs";

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
    const userRequests = await (options.recentUserRequestsImpl ?? recentUserRequests)(payload.transcriptPath);
    const state = classifierState(payload, userRequests);
    const classification = await classifyWithJev(state, options);
    return decisionFromClassification(classification, options);
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
