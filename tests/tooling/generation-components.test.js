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

  const pathConfigDrift = structuredClone(manifest);
  const comfy = pathConfigDrift.components.find((component) => component.id === 'comfyui');
  comfy.local_extra_model_paths_sha256 = 'abc';
  assert.match(validateGenerationComponents(pathConfigDrift).join('\n'), /local_extra_model_paths_sha256 must be exact/);
});

test('generation checkpoint requires exact hash, size, name, and license evidence', () => {
  const invalid = structuredClone(manifest);
  const checkpoint = invalid.components.find((component) => component.id === 'stable-diffusion-v1-5-archive-fp16');
  checkpoint.file_sha256 = 'abc';
  checkpoint.file_size = 0;
  checkpoint.file_name = 'different.safetensors';
  checkpoint.license = '';

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /file_sha256/);
  assert.match(errors, /file_size/);
  assert.match(errors, /file_name/);
  assert.match(errors, /missing license/);
  assert.match(errors, /model license must remain explicit/);
});

test('FLUX split model files remain exact and provenance-bound', () => {
  const invalid = structuredClone(manifest);
  const diffusion = invalid.components.find((component) => component.id === 'flux2-klein-4b-distilled-fp8');
  const textEncoder = invalid.components.find((component) => component.id === 'flux2-klein-qwen3-4b-text-encoder');
  const vae = invalid.components.find((component) => component.id === 'flux2-vae');

  diffusion.file_sha256 = '0'.repeat(64);
  textEncoder.source_relation = 'canonical';
  textEncoder.compatibility_evidence = [];
  textEncoder.provenance_inputs = [];
  textEncoder.repackage_recipe = '';
  vae.source_relation = 'verified_repackage';

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /unexpected reviewed file_sha256/);
  assert.match(errors, /source_relation must remain deterministic_repackage/);
  assert.match(errors, /compatibility_evidence must bind/);
  assert.match(errors, /provenance_inputs must exact-hash/);
  assert.match(errors, /repackage_recipe must describe/);
  assert.match(errors, /source_relation must remain canonical/);
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

test('FLUX workflows stay reviewed, core-only, and runtime-disabled at Gate 2', () => {
  const invalid = structuredClone(manifest);
  const textWorkflow = invalid.components.find(
    (component) => component.id === 'wormsport-flux2-klein-text-to-image-workflow'
  );
  const editWorkflow = invalid.components.find(
    (component) => component.id === 'wormsport-flux2-klein-reference-edit-workflow'
  );

  textWorkflow.runtime_enabled = true;
  textWorkflow.core_nodes_only = false;
  textWorkflow.model_components = ['different-model'];
  editWorkflow.source_template_revision = '0'.repeat(40);

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /runtime-disabled/);
  assert.match(errors, /core_nodes_only/);
  assert.match(errors, /model component set/);
  assert.match(errors, /source_template_revision/);
});
