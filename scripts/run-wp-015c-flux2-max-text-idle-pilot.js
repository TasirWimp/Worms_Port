const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const privateOutputFolder = '.' + 'quarantine';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function fail(message) {
  throw new Error(`WP-015C FLUX.2 text idle pilot blocked: ${message}`);
}

function readRequest() {
  const requestPath = path.join(repoRoot, 'docs', 'asset-briefs', 'wp-015c-animation-flux2-max-text-idle-request-v1.json');
  const bytes = fs.readFileSync(requestPath);
  return { request: JSON.parse(bytes.toString('utf8')), requestHash: sha256(bytes) };
}

function resolveInsideRepo(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(`${repoRoot}${path.sep}`)) fail('path escapes the repository.');
  return resolved;
}

function validateRequest(request) {
  if (request?.id !== 'wp-015c-animation-flux2-max-text-idle-v1') fail('unexpected request contract id.');
  if (request?.status !== 'owner_authorized_pending_submission') fail('request contract is not pending owner-authorized submission.');
  if (request?.max_submissions !== 1 || request?.reference_images_submitted !== false) fail('one-call/no-reference boundary changed.');
  if (request?.endpoint !== 'https://api.bfl.ai/v1/flux-2-max' || request?.model !== 'FLUX.2 [max]') fail('endpoint or model changed.');
  if (typeof request?.prompt !== 'string' || request.prompt.length === 0) fail('prompt is missing.');
  const parameters = request?.parameters;
  if (!parameters || parameters.disable_pup !== true || parameters.seed !== 15039002 ||
      parameters.width !== 1024 || parameters.height !== 1024 ||
      parameters.safety_tolerance !== 2 || parameters.output_format !== 'png') {
    fail('fixed request parameters changed.');
  }
  const outputDirectory = resolveInsideRepo(request.output_directory || '');
  const approvedOutputRoot = path.join(repoRoot, privateOutputFolder, 'wp-015c-animation', 'flux2-max-text-idle-v1');
  if (outputDirectory !== approvedOutputRoot) fail('output directory changed.');
  return { outputDirectory };
}

function loadUserScopedApiKey() {
  const command = "[Console]::Out.Write([Environment]::GetEnvironmentVariable('Flux_GameAssets_API_Key', 'User'))";
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) fail('could not read Flux_GameAssets_API_Key from Windows User scope.');
  const apiKey = result.stdout.trim();
  if (!apiKey) fail('Flux_GameAssets_API_Key is missing at Windows User scope.');
  return apiKey;
}

function sanitizedContract(request, requestHash) {
  return {
    request_contract_sha256: requestHash,
    endpoint: request.endpoint,
    model: request.model,
    reference_images_submitted: false,
    prompt: request.prompt,
    parameters: request.parameters,
    submitted_at: new Date().toISOString()
  };
}

async function postRequest(request, apiKey) {
  const payload = {
    prompt: request.prompt,
    disable_pup: request.parameters.disable_pup,
    seed: request.parameters.seed,
    width: request.parameters.width,
    height: request.parameters.height,
    safety_tolerance: request.parameters.safety_tolerance,
    output_format: request.parameters.output_format
  };
  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-key': apiKey },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.id || !body?.polling_url) fail(`BFL rejected the one submission (${response.status}).`);
  return body;
}

async function pollUntilSettled(pollingUrl, apiKey) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(pollingUrl, { headers: { accept: 'application/json', 'x-key': apiKey } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) fail(`BFL polling failed (${response.status}).`);
    if (['Ready', 'Error', 'Failed', 'Content Moderated', 'Request Moderated', 'Task not found'].includes(body.status)) return body;
  }
  fail('BFL task did not settle within the 180-second local polling cap. Submission metadata is retained for manual result recovery.');
}

async function downloadOutput(sampleUrl) {
  const response = await fetch(sampleUrl);
  if (!response.ok) fail(`BFL output download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 8).equals(pngSignature)) fail('BFL result is not the required PNG output.');
  return bytes;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { request, requestHash } = readRequest();
  const { outputDirectory } = validateRequest(request);
  if (fs.existsSync(outputDirectory)) fail('quarantine output directory already exists; never submit a retry.');
  if (dryRun) {
    console.log(JSON.stringify({ ...sanitizedContract(request, requestHash), dry_run: true }, null, 2));
    return;
  }

  fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: false });
  let apiKey;
  try {
    apiKey = loadUserScopedApiKey();
    const submitted = await postRequest(request, apiKey);
    const submission = {
      ...sanitizedContract(request, requestHash),
      request_id: submitted.id,
      request_cost_credits: submitted.cost ?? null,
      input_megapixels: submitted.input_mp ?? null,
      output_megapixels: submitted.output_mp ?? null,
      polling_url: submitted.polling_url
    };
    fs.writeFileSync(path.join(outputDirectory, 'submission.json'), `${JSON.stringify(submission, null, 2)}\n`, { flag: 'wx' });
    console.log(`BFL task submitted: ${submitted.id}`);
    const result = await pollUntilSettled(submitted.polling_url, apiKey);
    const terminalRecord = {
      request_id: submitted.id,
      settled_at: new Date().toISOString(),
      status: result.status,
      settled_cost_credits: result.cost ?? null,
      moderation_reasons: result?.details?.['Moderation Reasons'] ?? null
    };
    if (result.status !== 'Ready' || !result?.result?.sample) {
      fs.writeFileSync(path.join(outputDirectory, 'result.json'), `${JSON.stringify(terminalRecord, null, 2)}\n`, { flag: 'wx' });
      fail(`BFL task settled as ${result.status}.`);
    }
    const outputBytes = await downloadOutput(result.result.sample);
    const outputPath = path.join(outputDirectory, 'wizard-text-idle-flux2-max-v1.png');
    fs.writeFileSync(outputPath, outputBytes, { flag: 'wx' });
    terminalRecord.output_path = path.relative(repoRoot, outputPath).replaceAll('\\', '/');
    terminalRecord.output_bytes = outputBytes.length;
    terminalRecord.output_sha256 = sha256(outputBytes);
    fs.writeFileSync(path.join(outputDirectory, 'result.json'), `${JSON.stringify(terminalRecord, null, 2)}\n`, { flag: 'wx' });
    console.log(`BFL task ready: ${submitted.id}`);
    console.log(`Quarantined output SHA-256: ${terminalRecord.output_sha256}`);
  } finally {
    apiKey = undefined;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
