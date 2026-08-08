const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BUDGETS,
  summarizePerformanceSamples
} = require('../../scripts/performance-budget');

test('performance report enforces median separately from the maximum ceiling', () => {
  const sample = {
    navigationToActionablePractice: BUDGETS.navigationToActionablePractice.maximumMs,
    startPracticeToLegalInput: BUDGETS.startPracticeToLegalInput.maximumMs,
    fireToCastStart: BUDGETS.fireToCastStart.maximumMs,
    fireToVisibleProjectile: BUDGETS.fireToVisibleProjectile.maximumMs,
    fireToCompleteResponse: BUDGETS.fireToCompleteResponse.maximumMs
  };
  const report = summarizePerformanceSamples(sample, Array(5).fill(sample), 0, { project: 'test' });
  assert.equal(report.passed, false);
  assert.match(report.violations.join('\n'), /median/);

  const medianSafe = Array(3).fill({
    navigationToActionablePractice: BUDGETS.navigationToActionablePractice.medianMs,
    startPracticeToLegalInput: BUDGETS.startPracticeToLegalInput.medianMs,
    fireToCastStart: BUDGETS.fireToCastStart.medianMs,
    fireToVisibleProjectile: BUDGETS.fireToVisibleProjectile.medianMs,
    fireToCompleteResponse: BUDGETS.fireToCompleteResponse.maximumMs
  });
  const high = Array(2).fill(sample);
  assert.equal(summarizePerformanceSamples(sample, [...medianSafe, ...high], 0, { project: 'test' }).passed, true);

  const earlyProjectile = {
    navigationToActionablePractice: BUDGETS.navigationToActionablePractice.medianMs,
    startPracticeToLegalInput: BUDGETS.startPracticeToLegalInput.medianMs,
    fireToCastStart: BUDGETS.fireToCastStart.medianMs,
    fireToVisibleProjectile: BUDGETS.fireToVisibleProjectile.minimumMs - 0.1,
    fireToCompleteResponse: BUDGETS.fireToCompleteResponse.maximumMs
  };
  const earlyReport = summarizePerformanceSamples(
    earlyProjectile,
    Array(5).fill(earlyProjectile),
    0,
    { project: 'test' }
  );
  assert.equal(earlyReport.passed, false);
  assert.match(earlyReport.violations.join('\n'), /earlier than/);
});

test('performance report rejects missing samples, one-byte-equivalent timing overflow, and lazy SDK requests', () => {
  const sample = {
    navigationToActionablePractice: 1,
    startPracticeToLegalInput: 1,
    fireToCastStart: 1,
    fireToVisibleProjectile: 1,
    fireToCompleteResponse: BUDGETS.fireToCompleteResponse.maximumMs + 0.1
  };
  const report = summarizePerformanceSamples(null, [sample], 1, { project: 'test' });
  assert.equal(report.passed, false);
  assert.match(report.violations.join('\n'), /warm-up/);
  assert.match(report.violations.join('\n'), /requires 5/);
  assert.match(report.violations.join('\n'), /Mini App SDK/);
});
