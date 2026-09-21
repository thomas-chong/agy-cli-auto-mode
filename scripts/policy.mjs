#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPolicy, policyPath, validatePolicy } from "../src/custom-policy.mjs";

const TEMPLATE = {
  $schema: "https://raw.githubusercontent.com/thomas-chong/agy-cli-auto-mode/main/policy.schema.json",
  version: 1,
  thresholds: {
    safeProbability: 0.9,
    readOnlySafeProbability: 0.8,
    minimumConfidence: 0.5,
  },
  context: {
    environment: [],
    instructions: [],
  },
  rules: [],
};

function usage() {
  return `Usage: node scripts/policy.mjs <command> [options]

Commands:
  path                  Print the active user policy path
  init [--force]        Create a secure policy template (mode 0600)
  show                  Print the validated effective user policy
  validate [PATH]       Validate the active policy or another file
  edit                  Edit a temporary copy with $VISUAL/$EDITOR, validate, then install atomically

Set JEV_AUTO_MODE_POLICY_PATH to use a managed or alternate user policy file.`;
}

async function readAndValidate(path) {
  return validatePolicy(JSON.parse(await readFile(path, "utf8")));
}

async function initialize(path, force = false) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if (!force) {
    const existing = await loadPolicy(path);
    if (existing.configured) throw new Error(`policy already exists at ${path}; pass --force to replace it`);
  }
  await writeFile(path, `${JSON.stringify(TEMPLATE, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function edit(path) {
  const current = await loadPolicy(path);
  if (!current.configured) await initialize(path);
  const editor = process.env.VISUAL || process.env.EDITOR;
  if (!editor) throw new Error("set VISUAL or EDITOR before running policy edit");

  const temporary = `${path}.edit-${process.pid}`;
  await copyFile(path, temporary);
  await chmod(temporary, 0o600);
  try {
    const result = spawnSync(process.env.SHELL || "/bin/sh", ["-lc", 'exec $EDITOR "$1"', "policy-edit", temporary], {
      stdio: "inherit",
      env: { ...process.env, EDITOR: editor },
    });
    if (result.status !== 0) throw new Error(`editor exited with status ${result.status ?? "unknown"}`);
    await readAndValidate(temporary);
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const activePath = policyPath();
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "path") {
    console.log(activePath);
    return;
  }
  if (command === "init") {
    const unknown = args.filter((arg) => arg !== "--force");
    if (unknown.length) throw new Error(`unknown init option: ${unknown[0]}`);
    await initialize(activePath, args.includes("--force"));
    console.log(`Created ${activePath}`);
    return;
  }
  if (command === "show") {
    const loaded = await loadPolicy(activePath);
    console.log(JSON.stringify({ path: loaded.path, configured: loaded.configured, policy: loaded.policy }, null, 2));
    return;
  }
  if (command === "validate") {
    const target = args[0] ?? activePath;
    if (args.length > 1) throw new Error("validate accepts at most one path");
    await readAndValidate(target);
    console.log(`Valid policy: ${target}`);
    return;
  }
  if (command === "edit") {
    if (args.length) throw new Error("edit does not accept arguments");
    await edit(activePath);
    console.log(`Updated ${activePath}`);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Policy error: ${error.message}`);
    process.exitCode = 1;
  });
}
