const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validateGenerationComponents } = require('../../scripts/check-generation-components');

const manifestPath = path.resolve(__dirname, '..', '..', 'legal', 'generation-component-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

test('generation component manifest keeps tools external and output quarantined', () => {
  assert.deepEqual(validateGenerationComponents(manifest), []);

  const extended = structuredClone(manifest);
  extended.components.push({
    ...extended.components[0],
    id: 'reviewed-custom-node',
    kind: 'generation_custom_node'
  });
  assert.deepEqual(validateGenerationComponents(extended), []);

  const bundled = structuredClone(manifest);
  bundled.components[0].distribution = 'bundled';
  assert.match(validateGenerationComponents(bundled).join('\n'), /external and unbundled/);

  const promotable = structuredClone(manifest);
  promotable.policy.generated_output_state = 'approved';
  assert.match(validateGenerationComponents(promotable).join('\n'), /must remain quarantined/);
});

test('generation checkpoint requires exact hash, size, name, and license evidence', () => {
  const invalid = structuredClone(manifest);
  const checkpoint = invalid.components.find((component) => component.kind === 'generation_checkpoint');
  checkpoint.file_sha256 = 'abc';
  checkpoint.file_size = 0;
  checkpoint.file_name = 'different.safetensors';
  checkpoint.license = '';

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /file_sha256/);
  assert.match(errors, /file_size/);
  assert.match(errors, /file_name/);
  assert.match(errors, /missing license/);
  assert.match(errors, /license must remain explicit/);
});

test('generation workflow requires an exact JSON hash and disclosed input mode', () => {
  const invalid = structuredClone(manifest);
  const workflow = invalid.components.find((component) => component.kind === 'generation_workflow');
  workflow.file_sha256 = 'abc';
  workflow.file_path = '../different.json';
  workflow.input_mode = 'undisclosed';

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /file_sha256/);
  assert.match(errors, /runtime workflow path/);
  assert.match(errors, /input_mode/);
});

test('project image-conditioned workflow is exact MIT source tooling', () => {
  const hashInvalid = structuredClone(manifest);
  const hashedWorkflow = hashInvalid.components.find((component) => component.distribution === 'project_source_tooling');
  hashedWorkflow.file_sha256 = '0'.repeat(64);
  assert.match(validateGenerationComponents(hashInvalid).join('\n'), /project workflow hash mismatch/);

  const invalid = structuredClone(manifest);
  const workflow = invalid.components.find((component) => component.distribution === 'project_source_tooling');
  workflow.source_path = '../different.json';
  workflow.runtime_path = '../different.json';
  workflow.license = 'Unclear';

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /repository MIT license/);
  assert.match(errors, /runtime workflow path/);
  assert.match(errors, /source_path/);
});
