import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_POLICY_BYTES = 256 * 1024;
const TOP_LEVEL_KEYS = new Set(["$schema", "version", "thresholds", "context", "rules"]);
const THRESHOLD_KEYS = new Set(["safeProbability", "readOnlySafeProbability", "minimumConfidence"]);
const CONTEXT_KEYS = new Set(["environment", "instructions"]);
const RULE_KEYS = new Set(["id", "decision", "tool", "argument", "equals", "startsWith", "reason"]);
const DECISIONS = new Set(["allow", "ask", "deny"]);

export const EMPTY_POLICY = Object.freeze({
  version: 1,
  thresholds: {},
  context: { environment: [], instructions: [] },
  rules: [],
});

export function policyPath(env = process.env) {
  if (env.JEV_AUTO_MODE_POLICY_PATH) return env.JEV_AUTO_MODE_POLICY_PATH;
  const configRoot = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configRoot, "agy-jev-auto-mode", "policy.json");
}

function rejectUnknownKeys(value, allowed, location) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${location}: unknown field ${JSON.stringify(key)}`);
  }
}

function boundedNumber(value, location) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${location} must be a number between 0 and 1`);
  }
  return value;
}

function stringList(value, location) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${location} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function normalizeRule(rule, index, ids) {
  const location = `rules[${index}]`;
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`${location} must be an object`);
  rejectUnknownKeys(rule, RULE_KEYS, location);
  if (typeof rule.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(rule.id)) {
    throw new Error(`${location}.id must be 1-64 letters, numbers, dots, underscores, or hyphens`);
  }
  if (ids.has(rule.id)) throw new Error(`${location}.id is duplicated: ${rule.id}`);
  ids.add(rule.id);
  if (!DECISIONS.has(rule.decision)) throw new Error(`${location}.decision must be allow, ask, or deny`);
  if (typeof rule.tool !== "string" || !rule.tool.trim()) throw new Error(`${location}.tool must be a non-empty tool name or *`);

  const hasArgument = rule.argument !== undefined;
  const matchers = [rule.equals !== undefined, rule.startsWith !== undefined].filter(Boolean).length;
  if (hasArgument) {
    if (typeof rule.argument !== "string" || !/^[A-Za-z0-9_.-]+$/.test(rule.argument)) {
      throw new Error(`${location}.argument must be a dotted argument path`);
    }
    if (matchers !== 1) throw new Error(`${location} with argument requires exactly one of equals or startsWith`);
  } else if (matchers !== 0) {
    throw new Error(`${location} cannot use equals or startsWith without argument`);
  }
  if (rule.equals !== undefined && typeof rule.equals !== "string") throw new Error(`${location}.equals must be a string`);
  if (rule.startsWith !== undefined && (typeof rule.startsWith !== "string" || !rule.startsWith)) {
    throw new Error(`${location}.startsWith must be a non-empty string`);
  }
  if (rule.reason !== undefined && (typeof rule.reason !== "string" || !rule.reason.trim())) {
    throw new Error(`${location}.reason must be a non-empty string`);
  }

  return {
    id: rule.id,
    decision: rule.decision,
    tool: rule.tool.trim(),
    ...(hasArgument ? { argument: rule.argument } : {}),
    ...(rule.equals !== undefined ? { equals: rule.equals } : {}),
    ...(rule.startsWith !== undefined ? { startsWith: rule.startsWith } : {}),
    ...(rule.reason !== undefined ? { reason: rule.reason.trim() } : {}),
  };
}

export function validatePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("policy must be a JSON object");
  rejectUnknownKeys(value, TOP_LEVEL_KEYS, "policy");
  if (value.$schema !== undefined && typeof value.$schema !== "string") throw new Error("policy.$schema must be a string");
  if (value.version !== 1) throw new Error("policy.version must be 1");

  const thresholds = value.thresholds ?? {};
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) throw new Error("policy.thresholds must be an object");
  rejectUnknownKeys(thresholds, THRESHOLD_KEYS, "policy.thresholds");
  const normalizedThresholds = {};
  for (const [key, entry] of Object.entries(thresholds)) normalizedThresholds[key] = boundedNumber(entry, `policy.thresholds.${key}`);

  const context = value.context ?? {};
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("policy.context must be an object");
  rejectUnknownKeys(context, CONTEXT_KEYS, "policy.context");

  const rules = value.rules ?? [];
  if (!Array.isArray(rules) || rules.length > 256) throw new Error("policy.rules must be an array with at most 256 entries");
  const ids = new Set();

  return {
    ...(value.$schema ? { $schema: value.$schema } : {}),
    version: 1,
    thresholds: normalizedThresholds,
    context: {
      environment: stringList(context.environment, "policy.context.environment"),
      instructions: stringList(context.instructions, "policy.context.instructions"),
    },
    rules: rules.map((rule, index) => normalizeRule(rule, index, ids)),
  };
}

export async function loadPolicy(path = policyPath()) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("policy path is not a regular file");
    if (metadata.size > MAX_POLICY_BYTES) throw new Error(`policy exceeds ${MAX_POLICY_BYTES} bytes`);
    if (process.platform !== "win32" && (metadata.mode & 0o022) !== 0) {
      throw new Error("policy file must not be group- or world-writable");
    }
    const policy = validatePolicy(JSON.parse(await readFile(path, "utf8")));
    return { policy, path, configured: true };
  } catch (error) {
    if (error?.code === "ENOENT") return { policy: EMPTY_POLICY, path, configured: false };
    const message = error instanceof SyntaxError ? `invalid JSON: ${error.message}` : error.message;
    throw new Error(`invalid custom policy at ${path}: ${message}`);
  }
}

function argumentValue(args, dottedPath) {
  let current = args;
  for (const segment of dottedPath.split(".")) {
    if (!current || typeof current !== "object" || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function ruleMatches(rule, toolCall) {
  if (rule.tool !== "*" && rule.tool !== toolCall?.name) return false;
  if (!rule.argument) return true;
  const value = argumentValue(toolCall?.args, rule.argument);
  if (typeof value !== "string") return false;
  if (rule.equals !== undefined) return value === rule.equals;
  return value.startsWith(rule.startsWith);
}

export function evaluatePolicyRules(policy, toolCall) {
  const matching = policy.rules.filter((rule) => ruleMatches(rule, toolCall));
  for (const decision of ["deny", "ask", "allow"]) {
    const rule = matching.find((entry) => entry.decision === decision);
    if (rule) {
      return {
        decision: decision === "ask" ? "force_ask" : decision,
        reason: rule.reason ?? `Custom policy rule ${rule.id} returned ${decision}.`,
        policyRule: rule.id,
      };
    }
  }
  return null;
}
