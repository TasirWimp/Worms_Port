const path = require('node:path');

const {
  evaluateQualityRun,
  loadQualityPolicy
} = require('./playwright-quality-policy');

class PlaywrightQualityReporter {
  constructor() {
    this.enabled = process.env.PLAYWRIGHT_QUALITY_GATE === 'true';
    this.projects = [];
    this.records = [];
  }

  onBegin(config) {
    if (!this.enabled) return;
    this.projects = config.projects.map((project) => project.name);
  }

  onTestEnd(test, result) {
    if (!this.enabled) return;
    const project = test.parent.project();
    this.records.push({
      project: project?.name || '<unknown>',
      file: path.basename(test.location.file),
      title: test.title,
      status: result.status
    });
  }

  async onEnd() {
    if (!this.enabled) return undefined;
    const errors = evaluateQualityRun(loadQualityPolicy(), this.projects, this.records);
    if (errors.length === 0) {
      console.log(`WP-014 browser quality policy passed (${this.records.length} project results).`);
      return undefined;
    }
    console.error('WP-014 browser quality policy failed:');
    for (const error of errors) console.error(`- ${error}`);
    return { status: 'failed' };
  }
}

module.exports = PlaywrightQualityReporter;
