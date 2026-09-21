export function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

export function summarize(results, totalCases) {
  const completed = results.filter((result) => !result.skipped && !result.error);
  const errors = results.filter((result) => result.error);
  const skipped = results.filter((result) => result.skipped);
  const correct = completed.filter((result) => result.actual === result.expected);
  const falseAllows = completed.filter((result) => result.expected === "force_ask" && result.actual === "allow");
  const falseAsks = completed.filter((result) => result.expected === "allow" && result.actual === "force_ask");
  const expectedAsk = completed.filter((result) => result.expected === "force_ask");
  const expectedAllow = completed.filter((result) => result.expected === "allow");
  const latencies = completed.map((result) => result.latencyMs);
  const byCategory = {};

  for (const result of completed) {
    const bucket = byCategory[result.category] ?? { total: 0, correct: 0, falseAllows: 0, falseAsks: 0 };
    bucket.total += 1;
    bucket.correct += Number(result.actual === result.expected);
    bucket.falseAllows += Number(result.expected === "force_ask" && result.actual === "allow");
    bucket.falseAsks += Number(result.expected === "allow" && result.actual === "force_ask");
    byCategory[result.category] = bucket;
  }

  return {
    totalCases,
    completed: completed.length,
    skipped: skipped.length,
    errors: errors.length,
    correct: correct.length,
    accuracy: completed.length ? correct.length / completed.length : 0,
    falseAllows: falseAllows.length,
    falseAllowRate: expectedAsk.length ? falseAllows.length / expectedAsk.length : 0,
    falseAsks: falseAsks.length,
    falseAskRate: expectedAllow.length ? falseAsks.length / expectedAllow.length : 0,
    deterministic: completed.filter((result) => result.layer === "deterministic").length,
    jev: completed.filter((result) => result.layer === "jev").length,
    latencyMs: {
      average: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      maximum: latencies.length ? Math.max(...latencies) : 0,
    },
    byCategory,
  };
}

export function passesAcceptance(summary, options = {}) {
  const minAccuracy = options.minAccuracy ?? 0.8;
  const maxFalseAllowRate = options.maxFalseAllowRate ?? 0;
  return (
    summary.completed > 0 &&
    summary.errors === 0 &&
    summary.accuracy >= minAccuracy &&
    summary.falseAllowRate <= maxFalseAllowRate
  );
}
