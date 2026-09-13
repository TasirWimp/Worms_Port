import { test, type TestInfo } from '@playwright/test';

import qualityPolicy from '../quality-policy.json';

export function skipExcludedProjectBeforeSetup(file: string, testInfo: TestInfo): void {
  const route = qualityPolicy.expectedProjectSkips.find((entry) =>
    entry.file === file && entry.title === testInfo.title
  );
  if (route && !route.runsOn.includes(testInfo.project.name)) {
    test.skip(true, route.reason);
  }
}
