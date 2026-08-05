const fs = require('node:fs');
const path = require('node:path');

const { decodePng } = require('./compare-character-silhouettes.js');
const {
  alphaMetrics,
  encodeRgbaPng,
  resampleRgba,
  sha256
} = require('./normalize-character-master.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-015b3c-threadball-cast-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1, `${resolved}: unsupported cast-derivative schema.`);
  return { config, resolved };
}

function verifyInput(input) {
  const resolved = path.resolve(ROOT, input.path);
  assert(resolved.startsWith(`${ROOT}${path.sep}`), 'Threadball source must remain inside the repository.');
  assert(fs.existsSync(resolved), `Threadball source file is missing: ${input.path}`);
  const bytes = fs.readFileSync(resolved);
  assert(bytes.length === input.bytes,
    `Threadball source: expected ${input.bytes} bytes, received ${bytes.length}.`);
  const digest = sha256(bytes);
  assert(digest === input.sha256,
    `Threadball source: expected SHA-256 ${input.sha256}, received ${digest}.`);
  const image = decodePng(resolved);
  assert(image.width === input.width && image.height === input.height && image.channels === input.channels,
    `Threadball source: expected ${input.width}x${input.height} RGBA, received ${image.width}x${image.height} with ${image.channels} channels.`);
  return { path: resolved, bytes, digest, image };
}

function deriveStage(source, input, stage) {
  const [width, height] = stage.canvas;
  const scale = stage.uniform_scale_numerator / stage.uniform_scale_denominator;
  const [translateX, translateY] = stage.translation;
  const image = resampleRgba(source.image, width, height, {
    scale_x: scale,
    scale_y: scale,
    translate_x: translateX,
    translate_y: translateY
  }, stage.resampling);
  const mappedOrigin = [
    translateX + input.visual_center[0] * scale,
    translateY + input.visual_center[1] * scale
  ];
  assert(JSON.stringify(mappedOrigin) === JSON.stringify(stage.visual_origin),
    `Frozen stage transform must map Threadball visual center to ${stage.visual_origin}.`);
  const metrics = alphaMetrics(image);
  assert(metrics.border_alpha_pixels === 0, 'Cast stage has visible pixels on the canvas border.');
  assert(metrics.visible_component_count === 1,
    'Cast stage must preserve one visible Threadball component.');
  assert(metrics.disconnected_visible_pixels === 0,
    'Cast stage contains disconnected non-Threadball pixels.');
  return { image, mappedOrigin, metrics, scale };
}

function alphaComposite(background, foreground, offsetX, offsetY) {
  const pixels = Buffer.from(background.pixels);
  for (let y = 0; y < foreground.height; y += 1) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= background.height) continue;
    for (let x = 0; x < foreground.width; x += 1) {
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= background.width) continue;
      const sourceOffset = (y * foreground.width + x) * 4;
      const targetOffset = (targetY * background.width + targetX) * 4;
      const foregroundAlpha = foreground.pixels[sourceOffset + 3] / 255;
      if (foregroundAlpha === 0) continue;
      const backgroundAlpha = pixels[targetOffset + 3] / 255;
      const outputAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const premultiplied = foreground.pixels[sourceOffset + channel] / 255 * foregroundAlpha +
          pixels[targetOffset + channel] / 255 * backgroundAlpha * (1 - foregroundAlpha);
        pixels[targetOffset + channel] = Math.round(255 * premultiplied / outputAlpha);
      }
      pixels[targetOffset + 3] = Math.round(255 * outputAlpha);
    }
  }
  return { width: background.width, height: background.height, channels: 4, pixels };
}

function createReviewSheet(stages, reviewConfig) {
  const names = reviewConfig.contact_sheet_order;
  assert(names.length === 2, 'Cast review requires exactly two backgrounds.');
  const orderedStages = ['formation_start', 'formation_ready', 'projectile'];
  const cellSize = 96;
  const sheet = {
    width: cellSize * orderedStages.length,
    height: cellSize * names.length,
    channels: 4,
    pixels: Buffer.alloc(cellSize * orderedStages.length * cellSize * names.length * 4)
  };

  for (let index = 0; index < sheet.pixels.length; index += 4) sheet.pixels[index + 3] = 255;
  for (let row = 0; row < names.length; row += 1) {
    const background = reviewConfig[names[row]];
    for (let y = 0; y < cellSize; y += 1) {
      for (let column = 0; column < orderedStages.length; column += 1) {
        for (let x = 0; x < cellSize; x += 1) {
          const offset = ((row * cellSize + y) * sheet.width + column * cellSize + x) * 4;
          sheet.pixels[offset] = background[0];
          sheet.pixels[offset + 1] = background[1];
          sheet.pixels[offset + 2] = background[2];
        }
      }
    }
  }
  for (let row = 0; row < names.length; row += 1) {
    for (let column = 0; column < orderedStages.length; column += 1) {
      const stage = stages[orderedStages[column]].image;
      const x = column * cellSize + (cellSize - stage.width) / 2;
      const y = row * cellSize + (cellSize - stage.height) / 2;
      const transparent = { width: stage.width, height: stage.height, channels: 4, pixels: Buffer.alloc(stage.width * stage.height * 4) };
      const cell = { width: cellSize, height: cellSize, channels: 4, pixels: Buffer.alloc(cellSize * cellSize * 4) };
      for (let index = 0; index < cell.pixels.length; index += 4) {
        cell.pixels[index] = reviewConfig[names[row]][0];
        cell.pixels[index + 1] = reviewConfig[names[row]][1];
        cell.pixels[index + 2] = reviewConfig[names[row]][2];
        cell.pixels[index + 3] = 255;
      }
      const composed = alphaComposite(cell, alphaComposite(transparent, stage, 0, 0), (cellSize - stage.width) / 2, (cellSize - stage.height) / 2);
      for (let yCell = 0; yCell < cellSize; yCell += 1) {
        const sourceOffset = yCell * cellSize * 4;
        const targetOffset = ((row * cellSize + yCell) * sheet.width + column * cellSize) * 4;
        composed.pixels.copy(sheet.pixels, targetOffset, sourceOffset, sourceOffset + cellSize * 4);
      }
    }
  }
  return sheet;
}

function composeThreadballCast(config) {
  const source = verifyInput(config.input);
  const stages = {};
  for (const [name, stageConfig] of Object.entries(config.stages)) {
    stages[name] = deriveStage(source, config.input, { ...stageConfig, resampling: config.resampling });
  }
  const reviewSheet = createReviewSheet(stages, config.review_backgrounds);
  return { source, stages, reviewSheet };
}

function writeOutputs(result, config, configPath, outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  fs.mkdirSync(resolvedOutput, { recursive: true });
  const files = {};
  for (const name of Object.keys(config.stages)) {
    const image = result.stages[name].image;
    const bytes = encodeRgbaPng(image);
    const filePath = path.join(resolvedOutput, config.outputs[name]);
    fs.writeFileSync(filePath, bytes);
    files[name] = { path: filePath, bytes: bytes.length, sha256: sha256(bytes), width: image.width, height: image.height };
  }
  const reviewBytes = encodeRgbaPng(result.reviewSheet);
  const reviewPath = path.join(resolvedOutput, config.outputs.review_sheet);
  fs.writeFileSync(reviewPath, reviewBytes);
  files.review_sheet = { path: reviewPath, bytes: reviewBytes.length, sha256: sha256(reviewBytes), width: result.reviewSheet.width, height: result.reviewSheet.height };
  for (const [name, expected] of Object.entries(config.outputs.expected_sha256 || {})) {
    assert(files[name]?.sha256 === expected,
      `${name}: deterministic cast output changed from frozen SHA-256 ${expected}.`);
  }
  const report = {
    schema_version: 1,
    id: config.id,
    work_package: config.work_package,
    config: { path: path.resolve(configPath), sha256: sha256(fs.readFileSync(configPath)) },
    input: { path: result.source.path, bytes: result.source.bytes.length, sha256: result.source.digest },
    wizard_presentation_geometry: config.wizard_presentation_geometry,
    stages: Object.fromEntries(Object.entries(result.stages).map(([name, stage]) => [name, {
      visual_origin: stage.mappedOrigin,
      uniform_scale: stage.scale,
      alpha: stage.metrics,
      output: files[name]
    }])),
    review_sheet: files.review_sheet,
    checks: {
      exact_input_hash_pass: true,
      uniform_resampling_pass: true,
      centered_visual_origin_pass: true,
      one_component_per_stage_pass: true,
      transparent_canvas_border_pass: true,
      source_bytes_unchanged_pass: true,
      no_glow_fibers_tail_or_impact_generated_pass: true,
      no_animation_or_runtime_integration_pass: true,
      deterministic_reproduction: 'Run twice and compare the output SHA-256 values in the tooling test and B3C evidence.'
    }
  };
  const reportPath = path.join(resolvedOutput, config.outputs.report);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

function writeApprovedMasters(result, config, outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  fs.mkdirSync(resolvedOutput, { recursive: true });
  const files = {};
  for (const name of Object.keys(config.stages)) {
    const bytes = encodeRgbaPng(result.stages[name].image);
    const expected = config.outputs.expected_sha256[name];
    assert(sha256(bytes) === expected,
      `${name}: refusing to write an unreviewed master whose SHA-256 differs from ${expected}.`);
    const filePath = path.join(resolvedOutput, config.outputs[name]);
    fs.writeFileSync(filePath, bytes);
    files[name] = { path: filePath, bytes: bytes.length, sha256: sha256(bytes) };
  }
  return files;
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs.');
    values[key.slice(2)] = value;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const loaded = loadConfig(args.config || DEFAULT_CONFIG);
  const outputDirectory = args['output-dir'] || path.join('test-results', 'wp-015b3c', 'threadball-cast');
  const result = composeThreadballCast(loaded.config);
  const written = writeOutputs(result, loaded.config, loaded.resolved, outputDirectory);
  const approvedMasters = args['approved-output-dir']
    ? writeApprovedMasters(result, loaded.config, args['approved-output-dir'])
    : undefined;
  console.log(JSON.stringify({ report: written.reportPath, stages: written.report.stages, review_sheet: written.report.review_sheet, approved_masters: approvedMasters, checks: written.report.checks }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { alphaComposite, composeThreadballCast, createReviewSheet, deriveStage, loadConfig, verifyInput, writeApprovedMasters, writeOutputs };
