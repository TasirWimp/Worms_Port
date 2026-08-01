const fs = require('node:fs');
const path = require('node:path');

const policyPath = path.resolve(__dirname, '..', 'tests', 'browser', 'quality-policy.json');

function loadQualityPolicy() {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

function recordKey(project, file, title) {
  return `${project}\u0000${file}\u0000${title}`;
}

function testKey(file, title) {
  return `${file}\u0000${title}`;
}

function evaluateQualityRun(policy, configuredProjects, records) {
  const errors = [];
  const maintained = new Set(policy.maintainedProjects);
  const configured = new Set(configuredProjects);
  for (const project of maintained) {
    if (!configured.has(project)) errors.push(`maintained project did not run: ${project}`);
  }
  for (const project of configured) {
    if (!maintained.has(project)) errors.push(`unreviewed quality-gate project ran: ${project}`);
  }

  const recordMap = new Map();
  for (const record of records) {
    const key = recordKey(record.project, record.file, record.title);
    if (recordMap.has(key)) errors.push(`duplicate quality result: ${record.project} / ${record.file} / ${record.title}`);
    recordMap.set(key, record);
  }

  for (const file of policy.requiredFiles) {
    if (!records.some((record) => record.file === file)) errors.push(`required browser suite did not run: ${file}`);
  }

  const expectedSkips = new Map(policy.expectedProjectSkips.map((entry) => [
    testKey(entry.file, entry.title), entry
  ]));
  for (const record of records) {
    if (record.status !== 'skipped') continue;
    const entry = expectedSkips.get(testKey(record.file, record.title));
    if (!entry || entry.runsOn.includes(record.project)) {
      errors.push(`unexpected skip: ${record.project} / ${record.file} / ${record.title}`);
    }
  }

  for (const entry of policy.expectedProjectSkips) {
    for (const project of policy.maintainedProjects) {
      const record = recordMap.get(recordKey(project, entry.file, entry.title));
      if (!record) {
        errors.push(`expected routed test did not run: ${project} / ${entry.file} / ${entry.title}`);
      } else if (entry.runsOn.includes(project) && record.status === 'skipped') {
        errors.push(`required routed test skipped: ${project} / ${entry.file} / ${entry.title}`);
      } else if (!entry.runsOn.includes(project) && record.status !== 'skipped') {
        errors.push(`expected project exclusion ran unexpectedly: ${project} / ${entry.file} / ${entry.title}`);
      }
    }
  }

  for (const critical of policy.criticalTests) {
    for (const project of policy.maintainedProjects) {
      const record = recordMap.get(recordKey(project, critical.file, critical.title));
      if (!record) {
        errors.push(`critical test did not run: ${project} / ${critical.file} / ${critical.title}`);
      } else if (record.status === 'skipped') {
        errors.push(`critical test skipped: ${project} / ${critical.file} / ${critical.title}`);
      }
    }
  }
  return errors;
}

module.exports = { evaluateQualityRun, loadQualityPolicy };
