# Security policy

## Project status

Antigravity Jev Auto Mode is experimental security-adjacent software. It reduces approval fatigue; it is not a sandbox, policy engine, or guarantee that a tool call is safe.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could enable permission bypass, secret disclosure, or unintended tool execution.

Use GitHub's **Report a vulnerability** flow for this repository. If private vulnerability reporting is unavailable, contact the repository maintainer privately before disclosing details publicly.

Include:

- affected version or commit;
- Antigravity CLI and Node.js versions;
- the proposed tool call and relevant permission configuration;
- expected and observed decisions;
- a minimal reproduction with secrets removed;
- whether the action actually executed.

## Deployment guidance

- Keep `toolPermission` set to `request-review`.
- Add only narrow native `permissions.allow` rules for namespaces governed by the hook.
- Keep deterministic deny rules and terminal sandboxing enabled.
- Never use `always-proceed` or `--dangerously-skip-permissions` with this gate.
- Pin and benchmark a Jev model before production use.
- Treat classifier failures and uncertainty as requiring human approval.
- Use scoped, low-privilege credentials in the agent environment.

Security fixes may change classification behavior or thresholds and can be released without preserving unsafe compatibility.
