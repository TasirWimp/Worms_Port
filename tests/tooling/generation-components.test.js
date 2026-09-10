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

test('owner-provided volcanic-ruin reference is exact, local-only, never-runtime, and bound only to the cone and tower requests', () => {
  const reference = manifest.conditioning_inputs.find(
    (input) => input.id === 'volcanic-ruin-scene-reference-v1'
  );
  const profile = manifest.profiles.find((candidate) => candidate.id === 'flux2-klein');

  assert.deepEqual(reference, {
    id: 'volcanic-ruin-scene-reference-v1',
    kind: 'owner_provided_visual_reference',
    source_path: 'docs/images/art-direction/backgrounds/volcanic-ruin-scene-reference-v1.png',
    version: '1',
    width: 1672,
    height: 941,
    file_size: 2323466,
    file_sha256: '9A3E5DEDDF02B0C03B2A8E46894ED61158DB39D8471BA99CD42B8618A1EB0D04',
    owner_authorized_on: '2026-09-09',
    source_rights: 'owner_authorized_conditioning_only',
    license: 'Owner-Authorized-Reference-Only',
    distribution: 'documentation_conditioning_only',
    external_upload_scope: 'local_loopback_comfy_only',
    runtime_path_assigned: false,
    approved_uses: [
      'one exact-file, local-loopback FLUX reference-edit request for the WP-015D4E isolated volcanic-cone candidate only',
      'one separately recorded exact-file, local-loopback FLUX reference-edit request for the WP-015D4E isolated generic stone-tower-ruin candidate only',
      'one separately recorded exact-file, local-loopback FLUX reference-edit request for the WP-015D4E isolated distant-jungle-canopy candidate only',
      'documentation and visual review of generic textile material, depth, and landmark readability'
    ],
    blocked_uses: [
      'product runtime use, distribution, cropping, source-master admission, or treatment as finished artwork',
      'any external upload other than the exact staged local Comfy input for the reviewed request',
      'a whole-scene generation, named-place replication, UI/character/terrain reuse, any fourth request, batch, or unrecorded conditioning'
    ],
    notes: 'Exact owner-provided scene-reference bytes. The owner authorized FLUX conditioning on 2026-09-09 for isolated generic background assets, but does not transfer this reference into a product asset or source master. UI, text, characters, terrain, clouds, and all composited scene pixels remain excluded from the requested output.'
  });
  assert.equal(profile.background_authorized_request.tool, 'generate_flux2_klein_reference_edit');
  assert.equal(profile.background_authorized_request.seed, 15040001);
  assert.equal(profile.background_authorized_request.status, 'consumed_owner_review_pending');
  assert.equal(profile.background_authorized_request.requests_consumed, 1);
  assert.equal(profile.background_authorized_request.external_output_sha256,
    '4B34F5EEB08C831164BE403204723E73FB95B10E8C7AA8CD5013C4E5974E329C');
  assert.equal(profile.background_source_master_review.normalized_master_sha256,
    '83E451892C13730D2EA1DE5794927EC9CD63110567F110DC485D5ED148D041AD');
  assert.equal(profile.background_source_master_review.runtime_path_assigned, false);
  assert.deepEqual(profile.tower_authorized_request, {
    decision: 'one_reference_edit_request_approved',
    work_package: 'WP-015D4E',
    purpose: 'volcanic-ruin-isolated-generic-stone-tower-source',
    tool: 'generate_flux2_klein_reference_edit',
    workflow_sha256: 'A2BF8CD3C015D36646E73F2FA87F22741E4410D27B26D562331057B49CFF6C8E',
    seed: 15040002,
    prompt: 'One original isolated decorative mobile-game background asset on a plain white background: a single weathered tropical stone bell-tower ruin, upright and centered with generous padding, built from rounded warm-gray crochet-stone blocks with a few restrained green vine accents and two open dark arch windows. Calm low-contrast landmark, tactile handmade textile material, with no ground plane or horizon. No volcano, smoke, tree, palm, bush, terrain, character, weapon, projectile, UI, text, number, logo, watermark, frame, map, photo replication, named place, branded game art, church interior, or full scene.',
    width: 1024,
    height: 1024,
    batch_size: 1,
    steps: 4,
    cfg: 1,
    sampler: 'euler',
    reference_input: 'volcanic-ruin-scene-reference-v1',
    reference_staged_name: 'volcanic-ruin-scene-reference-v1.png',
    max_requests: 1,
    status: 'consumed_source_master_approved',
    requests_consumed: 1,
    prompt_id: 'dd98b736-8300-47b1-a3df-29c9f1012a23',
    runtime_seconds: 317.963,
    external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinReferenceEdit_00007_.png',
    external_output_sha256: '6DDE21C23C9CF96D445DA3119D6EB9D282BE619B6BB2E3597CB699576D58D264',
    external_output_bytes: 634010,
    external_output_pixel_format: 'RGB24',
    further_requests_authorized: false
  });
  assert.deepEqual(profile.tower_source_master_review, {
    decision: 'source_master_approved',
    generation_work_package: 'WP-015D4E',
    normalization_work_package: 'WP-015D4E',
    seed: 15040002,
    conditioning_reference_sha256: '9A3E5DEDDF02B0C03B2A8E46894ED61158DB39D8471BA99CD42B8618A1EB0D04',
    external_source_sha256: '6DDE21C23C9CF96D445DA3119D6EB9D282BE619B6BB2E3597CB699576D58D264',
    normalization_config_path: 'scripts/asset-normalization/wp-015d4e-stone-tower-v1.json',
    normalization_config_sha256: '00BD489A6B613147827C8F08338B7B285ECDD31DBC0275F00D9D85158D465326',
    normalizer_path: 'scripts/normalize-stone-tower-master.js',
    normalizer_sha256: '51973D516D88ECB2DD176A8D122A0D2EA7468530381AABCCF507829B91CEFB43',
    normalized_master_path: 'assets/masters/environment/backgrounds/volcanic-ruin/stone-tower-source-master-v1.png',
    normalized_master_sha256: '0810A4F5D3A3CCB72352F01AF61899BFAD7F4FC6EF9306164078F8C92FECBFA0',
    master_canvas: [1024, 576],
    placement_anchor: [512, 528],
    runtime_path_assigned: false,
    further_generation_authorized: false
  });
  assert.equal(profile.distant_jungle_authorized_request.seed, 15040003);
  assert.equal(profile.distant_jungle_authorized_request.status, 'consumed_source_master_approved');
  assert.equal(profile.distant_jungle_authorized_request.requests_consumed, 1);
  assert.equal(profile.distant_jungle_authorized_request.external_output_sha256,
    'B3AC79151D180F4439E82BD8EB9113734601084CE2780A2C56B4AA62CC09EBA1');
  assert.equal(profile.distant_jungle_source_master_review.normalized_master_sha256,
    '5174F7E0108F3CA11157D5A436BC2438389AF2FA7205050E43D3E5F5E19A964A');

  const invalid = structuredClone(manifest);
  const invalidReference = invalid.conditioning_inputs.find(
    (input) => input.id === 'volcanic-ruin-scene-reference-v1'
  );
  invalidReference.external_upload_scope = 'any_external_service';
  invalidReference.runtime_path_assigned = true;
  invalidReference.file_sha256 = '0'.repeat(64);
  invalid.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .background_authorized_request.seed = 15040002;
  invalid.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .background_source_master_review.placement_anchor = [511, 528];
  invalid.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .tower_authorized_request.seed = 15040003;
  invalid.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .tower_source_master_review.placement_anchor = [511, 528];
  invalid.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .distant_jungle_authorized_request.seed = 15040004;

  const errors = validateGenerationComponents(invalid).join('\n');
  assert.match(errors, /owner-provided visual references must remain owner-authorized/);
  assert.match(errors, /conditioning source bytes do not match the manifest/);
  assert.match(errors, /exact background authorized generation request changed/);
  assert.match(errors, /exact background source-master review changed/);
  assert.match(errors, /exact tower authorized generation request changed/);
  assert.match(errors, /exact tower source-master review changed/);
  assert.match(errors, /exact distant-jungle authorized generation request changed/);
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

test('FLUX profile preserves approved Wizard, Threadball, Patch masters, and the rejected-to-manual Terrain Interior recovery record', () => {
  const profile = manifest.profiles.find((candidate) => candidate.id === 'flux2-klein');
  assert.equal(profile.state, 'wizard_threadball_cloud_terrain_top_terrain_interior_runtime_inventory_approved');
  assert.deepEqual(profile.latest_review, {
    decision: 'source_master_approved',
    generation_work_package: 'WP-015B2G',
    normalization_work_package: 'WP-015B2H',
    seed: 15027002,
    external_source_sha256: '40F9E81254A0792B967889808BD8BD8DE33DBDE5EAB7C4CBB1B336DD02BC54A5',
    normalization_config_path: 'scripts/asset-normalization/wp-015b2h-wizard-v1.json',
    normalized_master_sha256: '7AF4864E00C7206A05684312916092C6881127F921FA7CEA01524899093318A9',
    normalization_config_sha256: '2AAEF899BD9FDBE202D5D9A293F1DC971ED62AAC32ED95095AF662FE6567D644',
    normalizer_path: 'scripts/normalize-character-master.js',
    normalizer_sha256: 'B4AEF73CC30133F622C131A8E8D0322DECF953F933FEFC4EE83940FB328CDD82',
    normalized_master_path: 'assets/masters/characters/knotkin/wizard/knotkin-wizard-source-master-v1.png',
    runtime_path_assigned: false,
    further_generation_authorized: false
  });
  assert.deepEqual(profile.authorized_request, {
    decision: 'one_text_request_approved',
    work_package: 'WP-015B3A',
    purpose: 'worldweave-threadball-replacement',
    tool: 'generate_flux2_klein_text',
    workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
    seed: 15035001,
    prompt: 'One isolated mobile-game spell projectile centered on a plain white background: a compact spherical knot of tightly tensioned sky-blue chenille world-thread, layered strands pulled inward around a bright warm-gold NIM Thread core visible through several narrow openings. It hovers alone with contained magical pressure, tactile crochet fibers, a clean balanced silhouette, soft studio light, and generous padding. No character, hand, room, floor, shadow, loose trailing strands, sparks, rune, text, logo, fuse, flame, orbit, cage, or second object.',
    width: 1024,
    height: 1024,
    batch_size: 1,
    steps: 4,
    cfg: 1,
    sampler: 'euler',
    reference_input: 'none',
    max_requests: 1,
    status: 'consumed_source_master_approved',
    requests_consumed: 1,
    prompt_id: 'af2f84ad-deca-4a6d-bd83-b0b88e87c696',
    runtime_seconds: 272.426,
    external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00006_.png',
    external_output_sha256: '1F41AF26B9F15419BFB5A59E2485B70EC706AB505672EC57AC8C9295B43F56EC',
    external_output_bytes: 787706,
    external_output_pixel_format: 'RGB24',
    further_requests_authorized: false,
    paused_candidate_sha256: '2BAE664F7E5A862BCB53B55A68071580485CE040A89650C68EC6FA398F4089EB',
    concept_reference_sha256: 'BD87405A8E29E4FCEEC87F4E4BC22256CEF215F2789DFDB1DD4BDD6A31DA6699',
    concept_reference_role: 'external_comparison_only'
  });
  assert.deepEqual(profile.threadball_source_master_review, {
    decision: 'source_master_approved',
    generation_work_package: 'WP-015B3A',
    normalization_work_package: 'WP-015B3A',
    seed: 15035001,
    external_source_sha256: '1F41AF26B9F15419BFB5A59E2485B70EC706AB505672EC57AC8C9295B43F56EC',
    normalization_config_path: 'scripts/asset-normalization/wp-015b3a-threadball-v1.json',
    normalization_config_sha256: 'CF8C6301E9A41DBAB2A16B127F4DF553F719474644761EBE865EDF3A0452635B',
    normalizer_path: 'scripts/normalize-relic-master.js',
    normalizer_sha256: 'F44A5B86B146EC678E3C594E9C9FD78CADD592F8AF5069BE8A9E4A7944D65B8B',
    normalized_master_path: 'assets/masters/relics/threadball/relic-threadball-source-master-v1.png',
    normalized_master_sha256: '608F490CEE2A7FA79F0EA47BF7B15A8E49685B7B1E65E5AE38E15A34B4CD9B6F',
    projectile_origin: [128, 128],
    runtime_path_assigned: false,
    further_generation_authorized: false
  });
  assert.deepEqual(profile.cloud_authorized_request, {
    decision: 'one_text_request_approved',
    work_package: 'WP-015B3A',
    purpose: 'patch-01-cotton-cloud-source',
    tool: 'generate_flux2_klein_text',
    workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
    seed: 15035002,
    prompt: 'One isolated low horizontal cotton cloud layer for a mobile-game sky, centered on a plain white background: three overlapping soft off-white crochet pompoms form one connected calm cloud with a wide rounded silhouette, subtle visible fibers, even soft studio light, and generous padding. No separate cloud, scenery, horizon, ground, shadow, character, text, logo, icon, frame, weather, stars, rainbow, sun, moon, or dramatic lighting.',
    width: 1024,
    height: 1024,
    batch_size: 1,
    steps: 4,
    cfg: 1,
    sampler: 'euler',
    reference_input: 'none',
    max_requests: 1,
    status: 'consumed_source_master_approved',
    requests_consumed: 1,
    prompt_id: '0936905b-fb40-47e9-a621-8106e4382a93',
    runtime_seconds: 255.665,
    external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00007_.png',
    external_output_sha256: 'EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7',
    external_output_bytes: 688501,
    external_output_pixel_format: 'RGB24',
    further_requests_authorized: false
  });
  assert.deepEqual(profile.cloud_source_master_review, {
    decision: 'source_master_approved',
    generation_work_package: 'WP-015B3A',
    normalization_work_package: 'WP-015B3A',
    seed: 15035002,
    external_source_sha256: 'EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7',
    normalization_config_path: 'scripts/asset-normalization/wp-015b3a-patch-cloud-v1.json',
    normalization_config_sha256: 'A13DB44E682870B262C6D2660790A63A5876F3131504DCA4F7E57C09309FAE78',
    normalizer_path: 'scripts/normalize-cloud-master.js',
    normalizer_sha256: '185E37D22822FEEB6FBA8049D77E18163758EFEF37CBDE28E13D82F9912B0492',
    normalized_master_path: 'assets/masters/environment/patch-01/clouds/patch-01-cloud-source-master-v1.png',
    normalized_master_sha256: '7F327B515FBF89F7DD275C4385FA194AE3F95E677C60BE10126CA68D9024B23C',
    placement_anchor: [256, 256],
    runtime_path_assigned: true,
    runtime_path: 'assets/product/environment/patch-01/clouds/cloud-v1.png',
    runtime_copy_work_package: 'WP-015B3C.1',
    runtime_copy_source_bytes: 211751,
    further_generation_authorized: false
  });
  assert.deepEqual(profile.terrain_top_authorized_request, {
    decision: 'one_text_request_approved',
    work_package: 'WP-015B3A',
    purpose: 'patch-01-terrain-top-source',
    tool: 'generate_flux2_klein_text',
    workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
    seed: 15035003,
    prompt: 'One flat orthographic textile material study centered on a plain white background: an uninterrupted straight horizontal boundary reaches from left edge to right edge, with a shallow upper strip of tufted light-olive yarn grass above broader warm-brown felt earth, joined by one restrained line of small gold blanket stitches. Tactile fibers, calm even light, and consistent scale. No hill, perspective, object, scenery, border, text, logo, shadow, or central motif.',
    width: 1024,
    height: 1024,
    batch_size: 1,
    steps: 4,
    cfg: 1,
    sampler: 'euler',
    reference_input: 'none',
    max_requests: 1,
    status: 'consumed_source_master_approved',
    requests_consumed: 1,
    prompt_id: 'd2ca47de-5cfb-4830-bb2e-243edad798eb',
    runtime_seconds: 260.706,
    external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00008_.png',
    external_output_sha256: 'BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22',
    external_output_bytes: 774627,
    external_output_pixel_format: 'RGB24',
    further_requests_authorized: false
  });
  assert.deepEqual(profile.terrain_top_source_master_review, {
    decision: 'source_master_approved',
    generation_work_package: 'WP-015B3A',
    normalization_work_package: 'WP-015B3A',
    seed: 15035003,
    external_source_sha256: 'BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22',
    normalization_config_path: 'scripts/asset-normalization/wp-015b3a-patch-terrain-top-v1.json',
    normalization_config_sha256: '4BA76F6477FF10F332B632C832EE314AB73FF624E9DBE3F05AE9B4673BF3FFC8',
    normalizer_path: 'scripts/normalize-terrain-top-master.js',
    normalizer_sha256: 'F5668C102F21E2098BA7246866A2BE1FB59CCA91988BDCF2BCEA5CF65AA4FC6F',
    normalized_master_path: 'assets/masters/environment/patch-01/terrain/patch-01-terrain-top-source-master-v1.png',
    normalized_master_sha256: '41511E63D0DBF602FCA854EB983DB9B754631587F6E5234CBB9DAF9113E77897',
    source_crop: [0, 392, 1024, 256],
    master_canvas: [256, 64],
    repeat_edge_maximum_difference: 0,
    runtime_path_assigned: true,
    runtime_path: 'assets/product/environment/patch-01/terrain/top-v1.png',
    runtime_copy_work_package: 'WP-015B3C.1',
    runtime_copy_source_bytes: 41834,
    further_generation_authorized: false
  });
  assert.deepEqual(profile.terrain_interior_authorized_request, {
    decision: 'one_text_request_approved',
    work_package: 'WP-015B3A',
    purpose: 'patch-01-terrain-interior-source',
    tool: 'generate_flux2_klein_text',
    workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
    seed: 15035004,
    prompt: 'One flat orthographic square textile material study filling the canvas: evenly distributed warm-brown felt and dense short crochet fibers with sparse tiny gold stitches, quiet tactile depth, consistent scale, and even soft light. No central motif, directional pattern, border, seam, horizon, grass, stone, object, character, text, logo, shadow, vignette, or scenery.',
    width: 1024,
    height: 1024,
    batch_size: 1,
    steps: 4,
    cfg: 1,
    sampler: 'euler',
    reference_input: 'none',
    max_requests: 1,
    status: 'consumed_rejected_contract_violation',
    requests_consumed: 1,
    prompt_id: 'db813267-25e6-4bef-ba14-ea8b41d491c6',
    runtime_seconds: 255.203,
    external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00009_.png',
    external_output_sha256: '98091C738D0E226FCAFA60EFA00BB4F63A503723CC310726E7787FEC702250F9',
    external_output_bytes: 2440150,
    external_output_pixel_format: 'RGB24',
    further_requests_authorized: false
  });
  assert.deepEqual(profile.terrain_interior_manual_repair_review, {
    decision: 'source_master_approved_owner_manual_repair',
    recovery_work_package: 'WP-015B3C',
    rejected_external_source_sha256: '98091C738D0E226FCAFA60EFA00BB4F63A503723CC310726E7787FEC702250F9',
    editable_source_sha256: '2E94BBE46A3E901BB8EB14B21F413E8ACCB850D3443FFD72308D63B09DCDBC7B',
    editable_source_bytes: 6331391,
    flattened_export_sha256: '6419C1E81F13FF75650A13F1FE6654711A7334C9A24EC48F86C4356533CF8095',
    flattened_export_bytes: 2731505,
    export_tool: 'GIMP 3.2.4 non-interactive flattened PNG export',
    normalization_config_path: 'scripts/asset-normalization/wp-015b3c-patch-terrain-interior-manual-v1.json',
    normalization_config_sha256: '73118EE47A92EEA00DD78D11508F4031EA532B8DB798030B56E48A19C951C71D',
    normalizer_path: 'scripts/normalize-terrain-interior-master.js',
    normalizer_sha256: '0DBA3767ECDF3B92A1C26653F899950FD1E8998E035BE7FB22B3EFFA2D4ED0CA',
    normalized_master_path: 'assets/masters/environment/patch-01/terrain/patch-01-terrain-interior-source-master-v1.png',
    normalized_master_sha256: 'D50C2C60A9941DEF0CD9E1C3C98A205A329CCFEC8766F3B1B70456728E2E40E9',
    master_canvas: [256, 256],
    horizontal_repeat_edge_maximum_difference: 0,
    vertical_repeat_edge_maximum_difference: 0,
    runtime_path_assigned: true,
    runtime_path: 'assets/product/environment/patch-01/terrain/interior-v1.png',
    runtime_copy_work_package: 'WP-015B3C.1',
    runtime_copy_source_bytes: 151898,
    further_generation_authorized: false
  });
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
  assert.match(profile.notes, /0936905b-fb40-47e9-a621-8106e4382a93/);
  assert.match(profile.notes, /EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7/);
  assert.match(profile.notes, /7F327B515FBF89F7DD275C4385FA194AE3F95E677C60BE10126CA68D9024B23C/);
  assert.match(profile.notes, /d2ca47de-5cfb-4830-bb2e-243edad798eb/);
  assert.match(profile.notes, /BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22/);
  assert.match(profile.notes, /db813267-25e6-4bef-ba14-ea8b41d491c6/);
  assert.match(profile.notes, /98091C738D0E226FCAFA60EFA00BB4F63A503723CC310726E7787FEC702250F9/);
  assert.match(profile.notes, /255\.203/);
  assert.match(profile.notes, /visible large diagonal\/diamond quilt seams/);
  assert.match(profile.notes, /project owner rejected it/);
  assert.match(profile.notes, /That exact candidate remains rejected historical evidence/);
  assert.match(profile.notes, /GIMP 3\.2\.4/);
  assert.match(profile.notes, /2E94BBE46A3E901BB8EB14B21F413E8ACCB850D3443FFD72308D63B09DCDBC7B/);
  assert.match(profile.notes, /D50C2C60A9941DEF0CD9E1C3C98A205A329CCFEC8766F3B1B70456728E2E40E9/);
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

  const changedReview = structuredClone(manifest);
  changedReview.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .latest_review.runtime_path_assigned = true;
  assert.match(
    validateGenerationComponents(changedReview).join('\n'),
    /latest exact-output review changed/
  );

  const changedRequest = structuredClone(manifest);
  changedRequest.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .authorized_request.seed = 15035002;
  assert.match(
    validateGenerationComponents(changedRequest).join('\n'),
    /exact authorized generation request changed/
  );

  const changedThreadballReview = structuredClone(manifest);
  changedThreadballReview.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .threadball_source_master_review.projectile_origin = [127, 128];
  assert.match(
    validateGenerationComponents(changedThreadballReview).join('\n'),
    /exact Threadball source-master review changed/
  );

  const changedCloudReview = structuredClone(manifest);
  changedCloudReview.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .cloud_source_master_review.placement_anchor = [255, 256];
  assert.match(
    validateGenerationComponents(changedCloudReview).join('\n'),
    /exact Cloud source-master review changed/
  );

  const changedTerrainTopRequest = structuredClone(manifest);
  changedTerrainTopRequest.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .terrain_top_authorized_request.seed = 15035004;
  assert.match(
    validateGenerationComponents(changedTerrainTopRequest).join('\n'),
    /exact Terrain Top authorized generation request changed/
  );

  const changedTerrainTopReview = structuredClone(manifest);
  changedTerrainTopReview.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .terrain_top_source_master_review.repeat_edge_maximum_difference = 1;
  assert.match(
    validateGenerationComponents(changedTerrainTopReview).join('\n'),
    /exact Terrain Top source-master review changed/
  );

  const changedTerrainInteriorRequest = structuredClone(manifest);
  changedTerrainInteriorRequest.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .terrain_interior_authorized_request.status = 'consumed_owner_review_pending';
  assert.match(
    validateGenerationComponents(changedTerrainInteriorRequest).join('\n'),
    /exact Terrain Interior authorized generation request changed/
  );

  const changedTerrainInteriorManualReview = structuredClone(manifest);
  changedTerrainInteriorManualReview.profiles.find((candidate) => candidate.id === 'flux2-klein')
    .terrain_interior_manual_repair_review.master_canvas = [255, 256];
  assert.match(
    validateGenerationComponents(changedTerrainInteriorManualReview).join('\n'),
    /exact Terrain Interior manual-repair review changed/
  );
});
