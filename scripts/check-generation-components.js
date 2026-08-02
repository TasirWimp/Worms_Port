const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'legal', 'generation-component-manifest.json');
const requiredIds = new Set([
  'comfyui',
  'comfyui-mcp-server',
  'stable-diffusion-v1-5-archive-fp16'
]);
const allowedKinds = new Set([
  'external_generation_tool',
  'external_generation_bridge',
  'generation_checkpoint',
  'generation_vae',
  'generation_lora',
  'generation_embedding',
  'generation_controlnet',
  'generation_upscaler',
  'generation_custom_node',
  'generation_workflow'
]);

function validateGenerationComponents(manifest, root = repoRoot) {
  const errors = [];
  const components = manifest?.components;

  if (manifest?.schema_version !== 1) errors.push('schema_version must be 1.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest?.checked_date || '')) {
    errors.push('checked_date must use YYYY-MM-DD.');
  }
  if (manifest?.policy?.distribution !== 'external_not_bundled') {
    errors.push('policy must keep generation components external and unbundled.');
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

    for (const field of ['id', 'kind', 'source_url', 'revision', 'version', 'license', 'license_evidence', 'distribution', 'notes']) {
      if (typeof component?.[field] !== 'string' || !component[field]) {
        errors.push(`${label}: missing ${field}.`);
      }
    }
    if (!allowedKinds.has(component?.kind)) errors.push(`${label}: invalid kind.`);
    if (!/^https:\/\//.test(component?.source_url || '')) errors.push(`${label}: source_url must be HTTPS.`);
    if (!/^https:\/\//.test(component?.license_evidence || '')) errors.push(`${label}: license_evidence must be HTTPS.`);
    if (!/^[0-9a-f]{40}$/.test(component?.revision || '')) errors.push(`${label}: revision must be a full Git hash.`);
    if (component?.distribution !== 'external_not_bundled') errors.push(`${label}: component must remain external and unbundled.`);
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
  }

  for (const id of requiredIds) {
    if (!ids.has(id)) errors.push(`missing required component ${id}.`);
  }

  const checkpoint = components.find((component) => component.id === 'stable-diffusion-v1-5-archive-fp16');
  if (checkpoint) {
    if (!/^[0-9A-F]{64}$/.test(checkpoint.file_sha256 || '')) {
      errors.push(`${checkpoint.id}: file_sha256 must be 64 uppercase hexadecimal characters.`);
    }
    if (!Number.isInteger(checkpoint.file_size) || checkpoint.file_size <= 0) {
      errors.push(`${checkpoint.id}: file_size must be a positive integer.`);
    }
    if (checkpoint.file_name !== 'v1-5-pruned-emaonly-fp16.safetensors') {
      errors.push(`${checkpoint.id}: unexpected checkpoint file_name.`);
    }
    if (checkpoint.license !== 'CreativeML-OpenRAIL-M') {
      errors.push(`${checkpoint.id}: checkpoint license must remain explicit.`);
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
  console.log(`Generation-component compliance passed (${manifest.components.length} component(s)).`);
}

if (require.main === module) main();

module.exports = { validateGenerationComponents };
