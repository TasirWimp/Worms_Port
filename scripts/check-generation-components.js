const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'legal', 'generation-component-manifest.json');
const requiredIds = new Set([
  'comfyui',
  'comfyui-mcp-server',
  'stable-diffusion-v1-5-archive-fp16',
  'flux2-klein-4b-distilled-fp8',
  'flux2-klein-qwen3-4b-text-encoder',
  'flux2-vae',
  'wormsport-flux2-klein-text-to-image-workflow',
  'wormsport-flux2-klein-reference-edit-workflow',
  'comfyui-mcp-generate-image-workflow',
  'wormsport-generate-image-conditioned-workflow'
]);
const allowedKinds = new Set([
  'external_generation_tool',
  'external_generation_bridge',
  'generation_checkpoint',
  'generation_diffusion_model',
  'generation_text_encoder',
  'generation_vae',
  'generation_lora',
  'generation_embedding',
  'generation_controlnet',
  'generation_upscaler',
  'generation_custom_node',
  'generation_workflow'
]);
const modelFileKinds = new Set([
  'generation_checkpoint',
  'generation_diffusion_model',
  'generation_text_encoder',
  'generation_vae'
]);
const reviewedModelContracts = new Map([
  ['stable-diffusion-v1-5-archive-fp16', {
    kind: 'generation_checkpoint',
    fileName: 'v1-5-pruned-emaonly-fp16.safetensors',
    fileSize: 2132696762,
    fileSha256: 'E9476A13728CD75D8279F6EC8BAD753A66A1957CA375A1464DC63B37DB6E3916',
    license: 'CreativeML-OpenRAIL-M'
  }],
  ['flux2-klein-4b-distilled-fp8', {
    kind: 'generation_diffusion_model',
    fileName: 'flux-2-klein-4b-fp8.safetensors',
    fileSize: 4070624520,
    fileSha256: '97ED34FE0567E436200F2FAEE3939B88F2B5D99F8AF2A4DC16532C4245C0CCB6',
    license: 'Apache-2.0',
    sourceRelation: 'canonical'
  }],
  ['flux2-klein-qwen3-4b-text-encoder', {
    kind: 'generation_text_encoder',
    fileName: 'qwen_3_4b_bfl_apache.safetensors',
    fileSize: 8044982048,
    fileSha256: 'AD65083F0B6561CC84B9B6A42FF397EE749171E367C28D800C4A6FD612ABC169',
    license: 'Apache-2.0',
    sourceRelation: 'deterministic_repackage'
  }],
  ['flux2-vae', {
    kind: 'generation_vae',
    fileName: 'flux2-vae.safetensors',
    fileSize: 336213556,
    fileSha256: 'D64F3A68E1CC4F9F4E29B6E0DA38A0204FE9A49F2D4053F0EC1FA1CA02F9C4B5',
    license: 'Apache-2.0',
    sourceRelation: 'canonical'
  }]
]);
const reviewedConditioningInputContracts = new Map([
  ['knotkin-wizard-structure-guide-v1', {
    kind: 'project_owned_structure_reference',
    sourcePath: 'docs/images/art-direction/knotkin-wizard-structure-guide.png',
    generatorPath: 'scripts/generate-wizard-structure-guide.js',
    width: 1024,
    height: 1024,
    fileSize: 15044,
    fileSha256: '5A8F1C1D0942755F113327467462D47812A22A64BAF3DF2C5CD2E0F491FA9AA1',
    generatorSha256: '695B499E67794692BFEB248C22CA24C24C2D0091107B4EAAE247D29830FCAF63'
  }]
]);
const reviewedFluxWorkflowContracts = new Map([
  ['wormsport-flux2-klein-text-to-image-workflow', {
    sourcePath: 'scripts/comfy-workflows/generate_flux2_klein_text.json',
    runtimePath: 'workflows/generate_flux2_klein_text.json',
    inputMode: 'text_to_image',
    sourceTemplateUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/cebdebc9fc2febcb97a5db0dd291f59f5300b176/templates/image_flux2_klein_text_to_image.json',
    sourceTemplateRevision: 'cebdebc9fc2febcb97a5db0dd291f59f5300b176',
    nodeClasses: [
      'CFGGuider',
      'CLIPLoader',
      'CLIPTextEncode',
      'ConditioningZeroOut',
      'EmptyFlux2LatentImage',
      'Flux2Scheduler',
      'KSamplerSelect',
      'RandomNoise',
      'SamplerCustomAdvanced',
      'SaveImage',
      'UNETLoader',
      'VAEDecode',
      'VAELoader'
    ],
    placeholders: ['PARAM_INT_SEED', 'PARAM_PROMPT']
  }],
  ['wormsport-flux2-klein-reference-edit-workflow', {
    sourcePath: 'scripts/comfy-workflows/generate_flux2_klein_reference_edit.json',
    runtimePath: 'workflows/generate_flux2_klein_reference_edit.json',
    inputMode: 'image_to_image',
    sourceTemplateUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/cebdebc9fc2febcb97a5db0dd291f59f5300b176/templates/image_flux2_klein_image_edit_4b_distilled.json',
    sourceTemplateRevision: 'cebdebc9fc2febcb97a5db0dd291f59f5300b176',
    nodeClasses: [
      'CFGGuider',
      'CLIPLoader',
      'CLIPTextEncode',
      'ConditioningZeroOut',
      'EmptyFlux2LatentImage',
      'Flux2Scheduler',
      'GetImageSize',
      'ImageScaleToTotalPixels',
      'KSamplerSelect',
      'LoadImage',
      'RandomNoise',
      'ReferenceLatent',
      'ReferenceLatent',
      'SamplerCustomAdvanced',
      'SaveImage',
      'UNETLoader',
      'VAEDecode',
      'VAEEncode',
      'VAELoader'
    ],
    placeholders: ['PARAM_INT_SEED', 'PARAM_PROMPT', 'PARAM_STR_REFERENCE_IMAGE']
  }]
]);
const reviewedFluxModelComponents = [
  'flux2-klein-4b-distilled-fp8',
  'flux2-klein-qwen3-4b-text-encoder',
  'flux2-vae'
];
const reviewedProfileContracts = new Map([
  ['sd15', {
    state: 'approved_quarantined_generation',
    modelComponents: ['stable-diffusion-v1-5-archive-fp16'],
    workflowComponents: [
      'comfyui-mcp-generate-image-workflow',
      'wormsport-generate-image-conditioned-workflow'
    ],
    requiredMcpTools: ['generate_image', 'generate_image_conditioned'],
    comfyLaunchMode: 'pinned_launcher',
    requiredComfyArguments: [],
    smokeTool: 'generate_image'
  }],
  ['flux2-klein', {
    state: 'robot_scaffold_knit_route_passed',
    modelComponents: reviewedFluxModelComponents,
    workflowComponents: [
      'wormsport-flux2-klein-text-to-image-workflow',
      'wormsport-flux2-klein-reference-edit-workflow'
    ],
    requiredMcpTools: [
      'generate_flux2_klein_text',
      'generate_flux2_klein_reference_edit'
    ],
    comfyLaunchMode: 'lowvram_no_preview',
    requiredComfyArguments: ['--lowvram', '--preview-method none'],
    smokeTool: 'generate_flux2_klein_text'
  }]
]);

function collectPlaceholders(value, result = []) {
  if (typeof value === 'string' && value.startsWith('PARAM_')) result.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, result);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPlaceholders(item, result);
  }
  return result;
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateGenerationComponents(manifest, root = repoRoot) {
  const errors = [];
  const components = manifest?.components;

  if (manifest?.schema_version !== 1) errors.push('schema_version must be 1.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest?.checked_date || '')) {
    errors.push('checked_date must use YYYY-MM-DD.');
  }
  if (manifest?.policy?.distribution !== 'external_not_bundled') {
    errors.push('policy must keep third-party generation components external and unbundled.');
  }
  if (manifest?.policy?.project_workflow_distribution !== 'source_tooling_only_not_product_runtime') {
    errors.push('project workflows must remain source tooling and outside product runtime assets.');
  }
  if (manifest?.policy?.profile_selection !== 'closed_manifest_profiles_only') {
    errors.push('generation profile selection must remain closed to manifest-defined profiles.');
  }
  if (manifest?.policy?.conditioning_input_state !== 'project_owned_documentation_only_until_generated_output_review') {
    errors.push('conditioning inputs must remain project-owned documentation references until output review.');
  }
  if (manifest?.policy?.generated_output_state !== 'quarantined_candidate_until_exact_file_approval') {
    errors.push('generated output must remain quarantined until exact-file approval.');
  }
  if (!Array.isArray(components)) return [...errors, 'components must be an array.'];

  const ids = new Set();
  for (const component of components) {
    const label = component?.id || '<missing id>';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(component?.id || '')) errors.push(`${label}: invalid component id.`);
    if (ids.has(component?.id)) errors.push(`${label}: duplicate component id.`);
    ids.add(component?.id);

    for (const field of ['id', 'kind', 'version', 'license', 'license_evidence', 'distribution', 'notes']) {
      if (typeof component?.[field] !== 'string' || !component[field]) {
        errors.push(`${label}: missing ${field}.`);
      }
    }
    if (!allowedKinds.has(component?.kind)) errors.push(`${label}: invalid kind.`);
    if (component?.distribution === 'external_not_bundled') {
      if (!/^https:\/\//.test(component?.source_url || '')) errors.push(`${label}: source_url must be HTTPS.`);
      if (!/^https:\/\//.test(component?.license_evidence || '')) errors.push(`${label}: license_evidence must be HTTPS.`);
      if (!/^[0-9a-f]{40}$/.test(component?.revision || '')) errors.push(`${label}: revision must be a full Git hash.`);
    } else if (component?.distribution === 'project_source_tooling') {
      if (component.kind !== 'generation_workflow') {
        errors.push(`${label}: only a project-owned generation workflow may use project_source_tooling.`);
      }
      if (component.license !== 'MIT' || component.license_evidence !== 'LICENSE') {
        errors.push(`${label}: project source tooling must use the repository MIT license.`);
      }
    } else {
      errors.push(`${label}: invalid component distribution; third-party components must remain external and unbundled.`);
    }
    if (component?.kind === 'external_generation_tool' || component?.kind === 'external_generation_bridge') {
      if (!Array.isArray(component.allowed_untracked_paths) ||
          component.allowed_untracked_paths.some((entry) => typeof entry !== 'string' || !entry)) {
        errors.push(`${label}: allowed_untracked_paths must be an explicit string array.`);
      }
    }
    for (const field of ['approved_uses', 'blocked_uses']) {
      if (!Array.isArray(component?.[field]) || component[field].length === 0 ||
          component[field].some((entry) => typeof entry !== 'string' || !entry)) {
        errors.push(`${label}: ${field} must be a non-empty string array.`);
      }
    }
    if (modelFileKinds.has(component?.kind)) {
      if (!/^[0-9A-F]{64}$/.test(component.file_sha256 || '')) {
        errors.push(`${label}: file_sha256 must be 64 uppercase hexadecimal characters.`);
      }
      if (!Number.isInteger(component.file_size) || component.file_size <= 0) {
        errors.push(`${label}: file_size must be a positive integer.`);
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.safetensors$/.test(component.file_name || '')) {
        errors.push(`${label}: file_name must identify one safetensors file.`);
      }
    }
  }

  for (const id of requiredIds) {
    if (!ids.has(id)) errors.push(`missing required component ${id}.`);
  }

  const conditioningInputs = manifest?.conditioning_inputs;
  if (!Array.isArray(conditioningInputs)) {
    errors.push('conditioning_inputs must be an array.');
  } else {
    const conditioningIds = new Set();
    for (const input of conditioningInputs) {
      const label = input?.id || '<missing conditioning input id>';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(input?.id || '')) errors.push(`${label}: invalid conditioning input id.`);
      if (conditioningIds.has(input?.id)) errors.push(`${label}: duplicate conditioning input id.`);
      conditioningIds.add(input?.id);
      if (input?.license !== 'MIT' || input?.distribution !== 'documentation_conditioning_only') {
        errors.push(`${label}: project-owned conditioning inputs must remain MIT documentation-only material.`);
      }
      for (const field of ['approved_uses', 'blocked_uses']) {
        if (!Array.isArray(input?.[field]) || input[field].length === 0 ||
            input[field].some((entry) => typeof entry !== 'string' || !entry)) {
          errors.push(`${label}: ${field} must be a non-empty string array.`);
        }
      }

      const contract = reviewedConditioningInputContracts.get(input?.id);
      if (!contract) {
        errors.push(`${label}: arbitrary conditioning inputs are blocked.`);
        continue;
      }
      if (input.kind !== contract.kind) errors.push(`${label}: reviewed conditioning kind changed.`);
      if (input.source_path !== contract.sourcePath) errors.push(`${label}: reviewed conditioning source_path changed.`);
      if (input.generator_path !== contract.generatorPath) errors.push(`${label}: reviewed conditioning generator_path changed.`);
      if (input.width !== contract.width || input.height !== contract.height) {
        errors.push(`${label}: reviewed conditioning dimensions changed.`);
      }
      if (input.file_size !== contract.fileSize || input.file_sha256 !== contract.fileSha256) {
        errors.push(`${label}: reviewed conditioning file size or hash changed.`);
      }
      if (input.generator_sha256 !== contract.generatorSha256) {
        errors.push(`${label}: reviewed conditioning generator hash changed.`);
      }

      const sourcePath = path.resolve(root, input.source_path || '');
      const generatorPath = path.resolve(root, input.generator_path || '');
      const rootPrefix = path.resolve(root) + path.sep;
      if (!sourcePath.startsWith(rootPrefix) || !fs.existsSync(sourcePath)) {
        errors.push(`${label}: conditioning source must resolve inside the repository.`);
      } else {
        const bytes = fs.readFileSync(sourcePath);
        const hash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
        if (bytes.length !== input.file_size || hash !== input.file_sha256) {
          errors.push(`${label}: conditioning source bytes do not match the manifest.`);
        }
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature) ||
            bytes.readUInt32BE(16) !== input.width || bytes.readUInt32BE(20) !== input.height) {
          errors.push(`${label}: conditioning source must be the reviewed PNG dimensions.`);
        }
      }
      if (!generatorPath.startsWith(rootPrefix) || !fs.existsSync(generatorPath)) {
        errors.push(`${label}: conditioning generator must resolve inside the repository.`);
      } else {
        const generatorHash = crypto.createHash('sha256').update(fs.readFileSync(generatorPath)).digest('hex').toUpperCase();
        if (generatorHash !== input.generator_sha256) {
          errors.push(`${label}: conditioning generator bytes do not match the manifest.`);
        }
      }
    }
    for (const inputId of reviewedConditioningInputContracts.keys()) {
      if (!conditioningIds.has(inputId)) errors.push(`missing required conditioning input ${inputId}.`);
    }
    if (conditioningInputs.length !== reviewedConditioningInputContracts.size) {
      errors.push('conditioning input count must remain closed to the reviewed set.');
    }
  }

  for (const [id, contract] of reviewedModelContracts) {
    const component = components.find((candidate) => candidate.id === id);
    if (!component) continue;
    if (component.kind !== contract.kind) errors.push(`${id}: unexpected reviewed model kind.`);
    if (component.file_name !== contract.fileName) errors.push(`${id}: unexpected reviewed file_name.`);
    if (component.file_size !== contract.fileSize) errors.push(`${id}: unexpected reviewed file_size.`);
    if (component.file_sha256 !== contract.fileSha256) errors.push(`${id}: unexpected reviewed file_sha256.`);
    if (component.license !== contract.license) errors.push(`${id}: model license must remain explicit as ${contract.license}.`);
    if (contract.sourceRelation && component.source_relation !== contract.sourceRelation) {
      errors.push(`${id}: source_relation must remain ${contract.sourceRelation}.`);
    }
    if (contract.sourceRelation === 'deterministic_repackage') {
      if (!/^https:\/\//.test(component.canonical_source_url || '')) {
        errors.push(`${id}: canonical_source_url must be HTTPS for a deterministic repackage.`);
      }
      if (!/^[0-9a-f]{40}$/.test(component.canonical_revision || '')) {
        errors.push(`${id}: canonical_revision must be a full Git hash for a deterministic repackage.`);
      }
      if (!Array.isArray(component.compatibility_evidence) || component.compatibility_evidence.length === 0 ||
          component.compatibility_evidence.some((entry) => typeof entry !== 'string' || !entry)) {
        errors.push(`${id}: compatibility_evidence must bind a deterministic repackage to its canonical component.`);
      }
      if (!Array.isArray(component.provenance_inputs) || component.provenance_inputs.length === 0 ||
          component.provenance_inputs.some((entry) =>
            typeof entry?.file_name !== 'string' || !entry.file_name ||
            !Number.isInteger(entry.file_size) || entry.file_size <= 0 ||
            !/^[0-9A-F]{64}$/.test(entry.file_sha256 || '') ||
            !/^https:\/\//.test(entry.source_url || ''))) {
        errors.push(`${id}: provenance_inputs must exact-hash every canonical repackage input.`);
      }
      if (typeof component.repackage_recipe !== 'string' || !component.repackage_recipe) {
        errors.push(`${id}: repackage_recipe must describe the deterministic external transformation.`);
      }
    }
  }

  const bridge = components.find((component) => component.id === 'comfyui-mcp-server');
  if (bridge) {
    if (!/^\d+\.\d+\.\d+$/.test(bridge.python_version || '')) {
      errors.push(`${bridge.id}: python_version must be exact.`);
    }
    if (!/^[0-9A-F]{64}$/.test(bridge.requirements_lock_sha256 || '')) {
      errors.push(`${bridge.id}: requirements_lock_sha256 must be exact.`);
    }
    if (!/^[0-9A-F]{64}$/.test(bridge.local_config_sha256 || '')) {
      errors.push(`${bridge.id}: local_config_sha256 must be exact.`);
    }
    const expectedUntrackedPaths = [
      '.venv/',
      'logs/',
      'workflows/generate_image_conditioned.json',
      'workflows/generate_flux2_klein_reference_edit.json',
      'workflows/generate_flux2_klein_text.json'
    ];
    if (!sameArray(bridge.allowed_untracked_paths, expectedUntrackedPaths)) {
      errors.push(`${bridge.id}: allowed_untracked_paths must remain the exact reviewed runtime set.`);
    }
    const lockPath = path.resolve(root, bridge.requirements_lock || '');
    if (!lockPath.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(lockPath)) {
      errors.push(`${bridge.id}: requirements_lock must resolve inside the repository.`);
    } else {
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex').toUpperCase();
      if (actualHash !== bridge.requirements_lock_sha256) {
        errors.push(`${bridge.id}: requirements lock hash mismatch.`);
      }
    }
  }

  const comfy = components.find((component) => component.id === 'comfyui');
  if (comfy && !/^[0-9A-F]{64}$/.test(comfy.local_launcher_sha256 || '')) {
    errors.push(`${comfy.id}: local_launcher_sha256 must be exact.`);
  }
  if (comfy && !/^[0-9A-F]{64}$/.test(comfy.local_extra_model_paths_sha256 || '')) {
    errors.push(`${comfy.id}: local_extra_model_paths_sha256 must be exact.`);
  }

  const workflows = components.filter((component) => component.kind === 'generation_workflow');
  for (const workflow of workflows) {
    if (!/^[0-9A-F]{64}$/.test(workflow.file_sha256 || '')) {
      errors.push(`${workflow.id}: file_sha256 must be exact.`);
    }
    const runtimePath = workflow.file_path || workflow.runtime_path;
    if (!/^workflows\/[a-z0-9][a-z0-9._-]*\.json$/.test(runtimePath || '')) {
      errors.push(`${workflow.id}: runtime workflow path must name one JSON file below workflows/.`);
    }
    if (!['text_to_image', 'image_to_image'].includes(workflow.input_mode)) {
      errors.push(`${workflow.id}: input_mode must disclose text_to_image or image_to_image.`);
    }
    if (workflow.runtime_enabled !== true) {
      errors.push(`${workflow.id}: reviewed workflow must be runtime-enabled only through a closed profile.`);
    }
    if (workflow.distribution === 'project_source_tooling') {
      if (!/^scripts\/comfy-workflows\/[a-z0-9][a-z0-9._-]*\.json$/.test(workflow.source_path || '')) {
        errors.push(`${workflow.id}: source_path must name one JSON file below scripts/comfy-workflows/.`);
        continue;
      }
      const sourcePath = path.resolve(root, workflow.source_path);
      if (!sourcePath.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(sourcePath)) {
        errors.push(`${workflow.id}: source_path must resolve inside the repository.`);
        continue;
      }
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').toUpperCase();
      if (actualHash !== workflow.file_sha256) {
        errors.push(`${workflow.id}: project workflow hash mismatch.`);
      }
    }

    const contract = reviewedFluxWorkflowContracts.get(workflow.id);
    if (!contract) continue;
    if (workflow.source_path !== contract.sourcePath) errors.push(`${workflow.id}: reviewed source_path changed.`);
    if (workflow.runtime_path !== contract.runtimePath) errors.push(`${workflow.id}: reviewed runtime_path changed.`);
    if (workflow.input_mode !== contract.inputMode) errors.push(`${workflow.id}: reviewed input_mode changed.`);
    if (workflow.source_template_url !== contract.sourceTemplateUrl) {
      errors.push(`${workflow.id}: official source_template_url changed.`);
    }
    if (workflow.source_template_revision !== contract.sourceTemplateRevision) {
      errors.push(`${workflow.id}: official source_template_revision changed.`);
    }
    if (workflow.comfyui_revision !== 'c2638ce6c00e3426c48d56a775bc46e9a8464094') {
      errors.push(`${workflow.id}: ComfyUI compatibility revision changed.`);
    }
    if (!sameArray(workflow.model_components, reviewedFluxModelComponents)) {
      errors.push(`${workflow.id}: reviewed FLUX model component set changed.`);
    }
    if (workflow.core_nodes_only !== true) errors.push(`${workflow.id}: core_nodes_only must remain true.`);
    if (workflow.runtime_enabled !== true) errors.push(`${workflow.id}: Gate 3 workflow must remain profile-enabled.`);

    const sourcePath = path.resolve(root, contract.sourcePath);
    if (!fs.existsSync(sourcePath)) continue;
    let graph;
    try {
      graph = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    } catch {
      errors.push(`${workflow.id}: source workflow must contain valid JSON.`);
      continue;
    }
    const nodes = Object.values(graph);
    const actualClasses = nodes.map((node) => node?.class_type).sort();
    const expectedClasses = [...contract.nodeClasses].sort();
    if (!sameArray(actualClasses, expectedClasses)) {
      errors.push(`${workflow.id}: reviewed core node set changed.`);
    }
    const placeholders = [...new Set(collectPlaceholders(graph))].sort();
    if (!sameArray(placeholders, [...contract.placeholders].sort())) {
      errors.push(`${workflow.id}: reviewed parameter placeholder set changed.`);
    }

    const onlyNode = (classType) => nodes.find((node) => node?.class_type === classType);
    if (onlyNode('UNETLoader')?.inputs?.unet_name !== 'flux-2-klein-4b-fp8.safetensors') {
      errors.push(`${workflow.id}: reviewed diffusion-model filename changed.`);
    }
    const clip = onlyNode('CLIPLoader');
    if (clip?.inputs?.clip_name !== 'qwen_3_4b_bfl_apache.safetensors' || clip?.inputs?.type !== 'flux2') {
      errors.push(`${workflow.id}: reviewed FLUX.2 text-encoder binding changed.`);
    }
    if (onlyNode('VAELoader')?.inputs?.vae_name !== 'flux2-vae.safetensors') {
      errors.push(`${workflow.id}: reviewed VAE filename changed.`);
    }
    if (onlyNode('Flux2Scheduler')?.inputs?.steps !== 4) {
      errors.push(`${workflow.id}: distilled schedule must remain four steps.`);
    }
    if (onlyNode('CFGGuider')?.inputs?.cfg !== 1) {
      errors.push(`${workflow.id}: distilled CFG must remain 1.`);
    }
    if (onlyNode('KSamplerSelect')?.inputs?.sampler_name !== 'euler') {
      errors.push(`${workflow.id}: distilled sampler must remain Euler.`);
    }
    if (onlyNode('EmptyFlux2LatentImage')?.inputs?.batch_size !== 1) {
      errors.push(`${workflow.id}: batch size must remain one.`);
    }
    if (workflow.input_mode === 'text_to_image') {
      const latent = onlyNode('EmptyFlux2LatentImage');
      const scheduler = onlyNode('Flux2Scheduler');
      if (latent?.inputs?.width !== 1024 || latent?.inputs?.height !== 1024 ||
          scheduler?.inputs?.width !== 1024 || scheduler?.inputs?.height !== 1024) {
        errors.push(`${workflow.id}: text canvas and schedule must remain 1024x1024.`);
      }
    } else {
      const scale = onlyNode('ImageScaleToTotalPixels');
      if (scale?.inputs?.megapixels !== 1 || scale?.inputs?.resolution_steps !== 1 ||
          scale?.inputs?.upscale_method !== 'nearest-exact') {
        errors.push(`${workflow.id}: reference preprocessing must remain bounded to one megapixel.`);
      }
      if (onlyNode('LoadImage')?.inputs?.image !== 'PARAM_STR_REFERENCE_IMAGE') {
        errors.push(`${workflow.id}: reference input must remain an explicit staged filename parameter.`);
      }
    }
  }

  const profiles = manifest?.profiles;
  if (!Array.isArray(profiles)) {
    errors.push('profiles must be an array.');
  } else {
    const profileIds = new Set();
    for (const profile of profiles) {
      const label = profile?.id || '<missing profile id>';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(profile?.id || '')) errors.push(`${label}: invalid profile id.`);
      if (profileIds.has(profile?.id)) errors.push(`${label}: duplicate profile id.`);
      profileIds.add(profile?.id);
      if (profile?.runtime_enabled !== true) errors.push(`${label}: reviewed profile must be runtime-enabled.`);
      if (typeof profile?.notes !== 'string' || !profile.notes) errors.push(`${label}: missing profile notes.`);

      const contract = reviewedProfileContracts.get(profile?.id);
      if (!contract) {
        errors.push(`${label}: arbitrary generation profiles are blocked.`);
        continue;
      }
      if (profile.state !== contract.state) errors.push(`${label}: reviewed profile state changed.`);
      if (!sameArray(profile.model_components, contract.modelComponents)) {
        errors.push(`${label}: reviewed model component chain changed.`);
      }
      if (!sameArray(profile.workflow_components, contract.workflowComponents)) {
        errors.push(`${label}: reviewed workflow component chain changed.`);
      }
      if (!sameArray(profile.required_mcp_tools, contract.requiredMcpTools)) {
        errors.push(`${label}: reviewed MCP tool registration set changed.`);
      }
      if (profile.comfy_launch_mode !== contract.comfyLaunchMode) {
        errors.push(`${label}: reviewed Comfy launch mode changed.`);
      }
      if (!sameArray(profile.required_comfy_arguments, contract.requiredComfyArguments)) {
        errors.push(`${label}: reviewed Comfy launch arguments changed.`);
      }
      if (profile.smoke_tool !== contract.smokeTool ||
          !contract.requiredMcpTools.includes(profile.smoke_tool)) {
        errors.push(`${label}: reviewed smoke tool changed or is not registered by the profile.`);
      }

      for (const componentId of profile.model_components || []) {
        const component = components.find((candidate) => candidate.id === componentId);
        if (!component || !modelFileKinds.has(component.kind)) {
          errors.push(`${label}: model component ${componentId} is missing or is not an exact model file.`);
        }
      }
      for (const componentId of profile.workflow_components || []) {
        const component = components.find((candidate) => candidate.id === componentId);
        if (!component || component.kind !== 'generation_workflow' || component.runtime_enabled !== true) {
          errors.push(`${label}: workflow component ${componentId} is missing or not runtime-enabled.`);
        }
      }
    }
    for (const profileId of reviewedProfileContracts.keys()) {
      if (!profileIds.has(profileId)) errors.push(`missing required generation profile ${profileId}.`);
    }
    if (profiles.length !== reviewedProfileContracts.size) {
      errors.push('generation profile count must remain closed to the reviewed set.');
    }
  }

  return errors;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateGenerationComponents(manifest);
  if (errors.length > 0) {
    console.error('Generation-component compliance failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Generation-component compliance passed (${manifest.components.length} component(s), ${manifest.profiles.length} profile(s)).`);
}

if (require.main === module) main();

module.exports = { validateGenerationComponents };
