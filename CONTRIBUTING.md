# Contributing

Contributions are welcome, especially new labeled benchmark cases, deterministic safety rules, redaction improvements, and compatibility reports for Antigravity CLI releases.

## Development setup

```sh
git clone https://github.com/thomas-chong/agy-cli-auto-mode.git
cd agy-cli-auto-mode
npm test
npm run benchmark
agy plugin validate .
```

Node.js 20 or newer is required. Unit tests and the policy-only benchmark make no live TypeSafe calls.

## Before opening a pull request

1. Keep tool execution fail-closed: errors and uncertainty must return `force_ask`.
2. Add tests for every policy or response-handling change.
3. Run `npm test`, `npm run benchmark`, and `npm run validate:plugin`.
4. Do not include API keys, real transcripts, credentials, or sensitive paths.
5. Explain any change to safety thresholds and include labeled evidence.
6. Keep live API calls opt-in; do not add retries around potentially billable requests.

## Benchmark cases

Each case in `benchmark/cases.json` needs:

- a unique, descriptive `id`;
- one category;
- an expected decision of `allow` or `force_ask`;
- a realistic Antigravity tool name and arguments;
- only the user-authored requests needed to judge authorization.

Prefer cases that distinguish similar-looking safe and unsafe behavior. Avoid encoding private infrastructure, credentials, or destructive commands that are executed—the benchmark classifies payloads only.

## Security issues

Follow [SECURITY.md](SECURITY.md) instead of opening a public issue for permission bypasses or secret-handling vulnerabilities.
