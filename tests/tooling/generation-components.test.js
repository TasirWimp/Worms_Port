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

test('Wizard structure and edit-mask conditioning stay project-owned, exact, and documentation-only', () => {
  const invalid = structuredClone(manifest);
  const guide = invalid.conditioning_inputs.find(
    (input) => input.id === 'knotkin-wizard-structure-guide-v1'
  );
  guide.file_sha256 = '0'.repeat(64);
  guide.width = 512;
  guide.distribution = 'product_runtime';
  invalid.conditioning_inputs.push({ ...structuredClone(guide), id: 'arbitrary-guide' });
  invalid.policy.conditioning_input_state = 'approved_product_asset';

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /conditioning inputs must remain project-owned documentation references/);
  assert.match(errors, /project-owned conditioning inputs must remain MIT documentation-only/);
  assert.match(errors, /reviewed conditioning dimensions changed/);
  assert.match(errors, /reviewed conditioning file size or hash changed/);
  assert.match(errors, /conditioning source bytes do not match the manifest/);
  assert.match(errors, /arbitrary conditioning inputs are blocked/);
  assert.match(errors, /conditioning input count must remain closed/);
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

test('FLUX workflows keep their reviewed core topology and runtime states', () => {
  const invalid = structuredClone(manifest);
  const textWorkflow = invalid.components.find(
    (component) => component.id === 'wormsport-flux2-klein-text-to-image-workflow'
  );
  const editWorkflow = invalid.components.find(
    (component) => component.id === 'wormsport-flux2-klein-reference-edit-workflow'
  );
  const protectedEditWorkflow = invalid.components.find(
    (component) => component.id === 'wormsport-flux2-klein-protected-edit-workflow'
  );

  textWorkflow.runtime_enabled = false;
  textWorkflow.core_nodes_only = false;
  textWorkflow.model_components = ['different-model'];
  editWorkflow.source_template_revision = '0'.repeat(40);
  protectedEditWorkflow.runtime_enabled = false;

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /runtime-enabled/);
  assert.match(errors, /core_nodes_only/);
  assert.match(errors, /model component set/);
  assert.match(errors, /source_template_revision/);
  assert.match(errors, /reviewed runtime-enabled state changed/);
});

test('generation profiles reject arbitrary model, workflow, tool, and launch selection', () => {
  const invalid = structuredClone(manifest);
  const fluxProfile = invalid.profiles.find((profile) => profile.id === 'flux2-klein');
  fluxProfile.model_components = ['stable-diffusion-v1-5-archive-fp16'];
  fluxProfile.workflow_components = ['comfyui-mcp-generate-image-workflow'];
  fluxProfile.required_mcp_tools = ['run_workflow'];
  fluxProfile.required_comfy_arguments = [];
  fluxProfile.state = 'hardware_admitted_visual_pending';
  invalid.profiles.push({
    ...structuredClone(fluxProfile),
    id: 'arbitrary-model'
  });

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /model component chain/);
  assert.match(errors, /workflow component chain/);
  assert.match(errors, /MCP tool registration set/);
  assert.match(errors, /launch arguments/);
  assert.match(errors, /profile state changed/);
  assert.match(errors, /arbitrary generation profiles are blocked/);
  assert.match(errors, /profile count/);

  const policyInvalid = structuredClone(manifest);
  policyInvalid.policy.profile_selection = 'arbitrary';
  assert.match(validateGenerationComponents(policyInvalid).join('\n'), /profile selection must remain closed/);
});

test('WP-015B2F records the sole Wizard-hood edit and closes after visual rejection', () => {
  const profile = manifest.profiles.find((candidate) => candidate.id === 'flux2-klein');
  assert.equal(profile.state, 'wizard_hood_edit_generated_visual_rejected');
  assert.match(profile.notes, /WP-015B2D/);
  assert.match(profile.notes, /DEF9265DAA4C6F2799D16870205E2015291E3E4AAE0F61802349C9FD8D56AD00/);
  assert.match(profile.notes, /15026004/);
  assert.match(profile.notes, /0\.880098/);
  assert.match(profile.notes, /project owner/);
  assert.match(profile.notes, /AD4D4F96AD7D7C024A1A903A440DD4FE6D9E31353ACB7E436BF7DFC787321DAA/);
  assert.match(profile.notes, /2B6C5F51A6EA411BB8B9C40AF861A339622316CB1D9710719F7F0CDEC327425B/);
  assert.match(profile.notes, /15026005/);
  assert.match(profile.notes, /exactly one/);
  assert.match(profile.notes, /1275B2BD8021EAA5C51AA0606A6CC20BA21B15ED6CEBC4A7C1FC76308BA9D2E0/);
  assert.match(profile.notes, /d023da3f-77cf-4f05-ae7b-62ce66f1f176/);
  assert.match(profile.notes, /907427/);
  assert.match(profile.notes, /0\.840783/);
  assert.match(profile.notes, /No retry/);
  assert.match(profile.notes, /rejected/);
  assert.match(profile.notes, /WP-015B2F/);
  assert.match(profile.notes, /08CB26CE3FAC6605859F9C9B51331351F28F40A005F6A101B2E575D8A56C6AB8/);
  assert.match(profile.notes, /AC9F8F101094C5C15361FD24827C4F24B7C52ACBC652000748B209CB5483F56B/);
  assert.match(profile.notes, /A048CA16B249298BBECFAD2F57552B04958E26F766D01F6577D1C6A011A0231C/);
  assert.match(profile.notes, /approved/);
  assert.match(profile.notes, /15026006/);
  assert.match(profile.notes, /wormsport\/wizard-hood-scaffold-v1\.png/);
  assert.match(profile.notes, /wormsport\/wizard-hood-edit-mask-v1\.png/);
  assert.match(profile.notes, /Exactly one/);
  assert.match(profile.notes, /1f5fc569-5250-4799-a236-0bb22ba629c8/);
  assert.match(profile.notes, /355\.120/);
  assert.match(profile.notes, /BE162B61FF38BE0EE2EA58716BDBAF5D2B38F0D8E6608953D2ECA41EFE7AD608/);
  assert.match(profile.notes, /844934/);
  assert.match(profile.notes, /0\.796676/);
  assert.match(profile.notes, /seams/);
  assert.match(profile.notes, /No retry/);

  const workflow = manifest.components.find(
    (component) => component.id === 'wormsport-flux2-klein-protected-edit-workflow'
  );
  assert.equal(workflow.input_mode, 'masked_image_to_image');
  assert.equal(workflow.runtime_enabled, true);
  assert.equal(profile.workflow_components.includes(workflow.id), true);
  assert.equal(profile.required_mcp_tools.includes('generate_flux2_klein_protected_edit'), true);

  const invalid = structuredClone(manifest);
  invalid.profiles.find((candidate) => candidate.id === 'flux2-klein').notes =
    'Generic generation is permitted.';
  assert.match(
    validateGenerationComponents(invalid).join('\n'),
    /profile notes do not bind the reviewed bounded request/
  );
});
