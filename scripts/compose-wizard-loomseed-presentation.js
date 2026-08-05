const fs = require('node:fs');
const path = require('node:path');

const { decodePng } = require('./compare-character-silhouettes.js');
const {
  alphaMetrics,
  compositeContactSheet,
  encodeRgbaPng,
  resampleRgba,
  scaleRgba,
  sha256
} = require('./normalize-character-master.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-015b3c-wizard-loomseed-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1, `${resolved}: unsupported composition schema.`);
  return { config, resolved };
}

function verifyInput(input, label) {
  const resolved = path.resolve(ROOT, input.path);
  assert(resolved.startsWith(`${ROOT}${path.sep}`), `${label}: source must remain inside the repository.`);
  assert(fs.existsSync(resolved), `${label}: source file is missing: ${input.path}`);
  const bytes = fs.readFileSync(resolved);
  assert(bytes.length === input.bytes,
    `${label}: expected ${input.bytes} bytes, received ${bytes.length}.`);
  const digest = sha256(bytes);
  assert(digest === input.sha256,
    `${label}: expected SHA-256 ${input.sha256}, received ${digest}.`);
  const image = decodePng(resolved);
  assert(image.width === input.width && image.height === input.height && image.channels === input.channels,
    `${label}: expected ${input.width}x${input.height} RGBA, received ${image.width}x${image.height} with ${image.channels} channels.`);
  return { path: resolved, bytes, digest, image };
}

function alphaComposite(background, foreground) {
  assert(background.width === foreground.width && background.height === foreground.height,
    'Alpha composition requires matching canvases.');
  assert(background.channels === 4 && foreground.channels === 4,
    'Alpha composition requires straight RGBA sources.');
  const pixels = Buffer.alloc(background.width * background.height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const backgroundAlpha = background.pixels[offset + 3] / 255;
    const foregroundAlpha = foreground.pixels[offset + 3] / 255;
    const outputAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
    if (outputAlpha === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const premultiplied = foreground.pixels[offset + channel] / 255 * foregroundAlpha +
        background.pixels[offset + channel] / 255 * backgroundAlpha * (1 - foregroundAlpha);
      pixels[offset + channel] = Math.round(255 * premultiplied / outputAlpha);
    }
    pixels[offset + 3] = Math.round(255 * outputAlpha);
  }
  return {
    width: background.width,
    height: background.height,
    channels: 4,
    pixels
  };
}

function countOpaqueWizardPixelDifferences(wizard, composed) {
  let checked = 0;
  let differences = 0;
  for (let offset = 0; offset < wizard.pixels.length; offset += 4) {
    if (wizard.pixels[offset + 3] !== 255) continue;
    checked += 1;
    if (wizard.pixels[offset] !== composed.pixels[offset] ||
        wizard.pixels[offset + 1] !== composed.pixels[offset + 1] ||
        wizard.pixels[offset + 2] !== composed.pixels[offset + 2] ||
        composed.pixels[offset + 3] !== 255) {
      differences += 1;
    }
  }
  return { checked, differences };
}

function countVisibleLoomseedPixels(loomseed, composed) {
  let visible = 0;
  for (let offset = 0; offset < loomseed.pixels.length; offset += 4) {
    if (loomseed.pixels[offset + 3] === 0) continue;
    if (composed.pixels[offset + 3] > 0) visible += 1;
  }
  return visible;
}

function composeWizardLoomseed(config) {
  const wizard = verifyInput(config.inputs.wizard, 'Wizard source');
  const threadball = verifyInput(config.inputs.threadball, 'Threadball source');
  const [canvasWidth, canvasHeight] = config.geometry.canvas;
  assert(wizard.image.width === canvasWidth && wizard.image.height === canvasHeight,
    'Wizard source canvas must exactly match the frozen presentation canvas.');

  const scale = config.geometry.loomseed_uniform_scale_numerator /
    config.geometry.loomseed_uniform_scale_denominator;
  const [translateX, translateY] = config.geometry.loomseed_translation;
  const loomseed = resampleRgba(threadball.image, canvasWidth, canvasHeight, {
    scale_x: scale,
    scale_y: scale,
    translate_x: translateX,
    translate_y: translateY
  }, config.resampling);
  const mappedCenter = [
    translateX + config.geometry.threadball_visual_center[0] * scale,
    translateY + config.geometry.threadball_visual_center[1] * scale
  ];
  assert(JSON.stringify(mappedCenter) === JSON.stringify(config.geometry.loomseed_center) &&
    JSON.stringify(mappedCenter) === JSON.stringify(config.geometry.wizard_palm_anchor),
  'Frozen Loomseed transform must map its visual center exactly to the Wizard palm anchor.');
  assert(JSON.stringify(config.geometry.layer_order) === JSON.stringify(['wizard', 'loomseed']),
    'The Loomseed must remain above the Wizard palm so its held focus is visibly readable.');

  const master = alphaComposite(wizard.image, loomseed);
  const review192 = scaleRgba(master, 192, 192, config.resampling);
  const review48 = scaleRgba(master, 48, 48, config.resampling);
  const edgeReview = compositeContactSheet(master, config.review_backgrounds);
  const metrics = alphaMetrics(master);
  const opaqueWizard = countOpaqueWizardPixelDifferences(wizard.image, master);
  const visibleLoomseedPixels = countVisibleLoomseedPixels(loomseed, master);

  assert(metrics.border_alpha_pixels === 0, 'Combined master has visible pixels on the canvas border.');
  assert(visibleLoomseedPixels > 0,
    'The Loomseed has no visible pixels after composition.');

  return {
    wizard,
    threadball,
    loomseed,
    master,
    review192,
    review48,
    edgeReview,
    metrics,
    mappedCenter,
    opaqueWizard,
    visibleLoomseedPixels
  };
}

function writeOutputs(result, config, configPath, outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  fs.mkdirSync(resolvedOutput, { recursive: true });
  const images = {
    master: result.master,
    review_192: result.review192,
    review_48: result.review48,
    edge_review: result.edgeReview
  };
  const files = {};
  for (const [key, image] of Object.entries(images)) {
    const bytes = encodeRgbaPng(image);
    const filePath = path.join(resolvedOutput, config.outputs[key]);
    fs.writeFileSync(filePath, bytes);
    files[key] = {
      path: filePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
      width: image.width,
      height: image.height
    };
    const expected = config.outputs.expected_sha256?.[key];
    assert(!expected || files[key].sha256 === expected,
      `${key}: deterministic composition output changed from frozen SHA-256 ${expected}.`);
  }
  const report = {
    schema_version: 1,
    id: config.id,
    work_package: config.work_package,
    config: {
      path: path.resolve(configPath),
      sha256: sha256(fs.readFileSync(configPath))
    },
    inputs: {
      wizard: {
        path: result.wizard.path,
        sha256: result.wizard.digest,
        bytes: result.wizard.bytes.length
      },
      threadball: {
        path: result.threadball.path,
        sha256: result.threadball.digest,
        bytes: result.threadball.bytes.length
      }
    },
    geometry: {
      wizard_palm_anchor: config.geometry.wizard_palm_anchor,
      mapped_loomseed_center: result.mappedCenter,
      temporary_cast_emission_origin: config.geometry.temporary_cast_emission_origin,
      uniform_scale: config.geometry.loomseed_uniform_scale_numerator /
        config.geometry.loomseed_uniform_scale_denominator,
      translation: config.geometry.loomseed_translation,
      layer_order: config.geometry.layer_order,
      source_pivot: config.geometry.source_pivot
    },
    alpha: result.metrics,
    wizard_opaque_pixels_covered_by_loomseed: result.opaqueWizard,
    visible_loomseed_pixels: result.visibleLoomseedPixels,
    outputs: files,
    checks: {
      exact_input_hashes_pass: true,
      uniform_threadball_resampling_pass: true,
      exact_palm_anchor_pass: true,
      loomseed_above_wizard_pass: true,
      wizard_source_bytes_unchanged_pass: true,
      visibly_held_loomseed_pass: true,
      no_projectile_or_animation_created_pass: true,
      deterministic_reproduction: 'Run twice and compare master/review/report SHA-256 values.'
    }
  };
  const reportPath = path.join(resolvedOutput, config.outputs.report);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Arguments must be --name value pairs.');
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const loaded = loadConfig(args.config || DEFAULT_CONFIG);
  const outputDirectory = args['output-dir'] || path.join('test-results', 'wp-015b3c', 'wizard-loomseed');
  const result = composeWizardLoomseed(loaded.config);
  const written = writeOutputs(result, loaded.config, loaded.resolved, outputDirectory);
  console.log(JSON.stringify({
    report: written.reportPath,
    master: written.report.outputs.master,
    review_192: written.report.outputs.review_192,
    review_48: written.report.outputs.review_48,
    edge_review: written.report.outputs.edge_review,
    geometry: written.report.geometry,
    checks: written.report.checks
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  alphaComposite,
  composeWizardLoomseed,
  countOpaqueWizardPixelDifferences,
  countVisibleLoomseedPixels,
  loadConfig,
  verifyInput,
  writeOutputs
};
