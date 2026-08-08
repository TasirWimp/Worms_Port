const BUDGETS = Object.freeze({
  warmupRuns: 1,
  measuredRuns: 5,
  navigationToActionablePractice: { medianMs: 2_000, maximumMs: 3_000 },
  startPracticeToLegalInput: { medianMs: 3_000, maximumMs: 5_000 },
  // The Wizard's two-second cast now overlaps the existing early projectile
  // launch. Preserve a sub-half-second hard ceiling while allowing its 200ms
  // charge/formation sequence plus real browser scheduling overhead.
  fireToVisibleProjectile: { medianMs: 350, maximumMs: 500 },
  fireToCompleteResponse: { maximumMs: 10_000 },
  lazyMiniAppSdkRequests: 0
});

const TIMING_MEASURES = [
  'navigationToActionablePractice',
  'startPracticeToLegalInput',
  'fireToVisibleProjectile',
  'fireToCompleteResponse'
];

function summarizePerformanceSamples(warmup, samples, lazyMiniAppSdkRequests, environment) {
  const measurements = {};
  for (const measure of TIMING_MEASURES) {
    const values = samples.map((sample) => sample[measure]);
    measurements[measure] = {
      samplesMs: values,
      medianMs: median(values),
      maximumMs: values.length ? Math.max(...values) : null
    };
  }
  const report = {
    schemaVersion: 1,
    environment,
    budgets: BUDGETS,
    warmup,
    measurements,
    lazyMiniAppSdkRequests,
    passed: false,
    violations: []
  };
  report.violations = evaluatePerformanceReport(report);
  report.passed = report.violations.length === 0;
  return report;
}

function evaluatePerformanceReport(report) {
  const violations = [];
  if (!report.warmup) violations.push('Expected one discarded warm-up sample.');
  for (const measure of TIMING_MEASURES) {
    const summary = report.measurements[measure];
    if (!summary || summary.samplesMs.length !== BUDGETS.measuredRuns ||
        summary.samplesMs.some((value) => !Number.isFinite(value) || value < 0)) {
      violations.push(`${measure} requires ${BUDGETS.measuredRuns} finite measured samples.`);
      continue;
    }
    const budget = BUDGETS[measure];
    if (budget.medianMs !== undefined && summary.medianMs > budget.medianMs) {
      violations.push(`${measure} median ${format(summary.medianMs)} ms exceeded ${budget.medianMs} ms.`);
    }
    if (summary.maximumMs > budget.maximumMs) {
      violations.push(`${measure} maximum ${format(summary.maximumMs)} ms exceeded ${budget.maximumMs} ms.`);
    }
  }
  if (report.lazyMiniAppSdkRequests !== BUDGETS.lazyMiniAppSdkRequests) {
    violations.push(`Ordinary Practice requested the lazy Mini App SDK ${report.lazyMiniAppSdkRequests} time(s).`);
  }
  return violations;
}

function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function format(value) {
  return Number(value).toFixed(1);
}

module.exports = {
  BUDGETS,
  evaluatePerformanceReport,
  summarizePerformanceSamples
};
