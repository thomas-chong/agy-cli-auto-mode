const CONTROL_TOOLS = new Set([
  "ask_permission",
  "list_permissions",
  "ask_question",
]);

const HIGH_RISK_COMMANDS = [
  /(?:^|[;&|]\s*)rm\s+(?=[^\n;|&]*-[a-z]*r)(?=[^\n;|&]*-[a-z]*f)/i,
  /\b(?:sudo|su)\b/i,
  /\b(?:mkfs(?:\.[a-z0-9]+)?|fdisk|parted|shutdown|reboot|poweroff)\b/i,
  /\bdd\s+[^\n]*(?:\bof=|\/dev\/)/i,
  /\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*f|push\b[^\n]*(?:--force|-f\b))/i,
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:sh|bash|zsh)\b/i,
  /\b(?:npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish|docker\s+push|kubectl\s+(?:delete|apply)|terraform\s+(?:apply|destroy))\b/i,
];

const SENSITIVE_PATH = /(?:^|[\\/])(?:\.env(?:\.|$)|\.ssh(?:[\\/]|$)|\.aws(?:[\\/]|$)|\.gnupg(?:[\\/]|$)|\.kube(?:[\\/]|$)|credentials?(?:\.|[\\/]|$)|secrets?(?:\.|[\\/]|$))/i;

function strings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, result);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) strings(item, result);
  }
  return result;
}

export function deterministicDecision(toolCall) {
  const name = toolCall?.name;
  if (typeof name !== "string" || !name.trim()) {
    return { decision: "force_ask", reason: "Auto mode received an invalid tool call." };
  }

  if (CONTROL_TOOLS.has(name)) {
    return { decision: "allow", reason: "Antigravity user-control tool." };
  }

  const values = strings(toolCall.args).join("\n");
  if (name === "run_command" && HIGH_RISK_COMMANDS.some((pattern) => pattern.test(values))) {
    return { decision: "force_ask", reason: "Known high-risk command requires your approval." };
  }

  if (SENSITIVE_PATH.test(values)) {
    return { decision: "force_ask", reason: "Access to a sensitive path requires your approval." };
  }

  return null;
}
