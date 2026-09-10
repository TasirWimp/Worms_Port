const fs = require('node:fs');
const path = require('node:path');

const { createCloudMatteRgba } = require('./normalize-cloud-master.js');
const { alphaMetrics, compositeContactSheet } = require('./normalize-relic-master.js');
const {
  encodeRgbaPng,
  retainLargestVisibleComponent,
  resampleRgba,
  sha256,
  verifySource
} = require('./normalize-character-master.js');

const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-015d4e-stone-tower-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1, `${resolved}: unsupported normalization schema.`);
  assert(config.id === 'wp-015d4e-stone-tower-v1', `${resolved}: unexpected Stone Tower normalization id.`);
  assert(config.matte.enclosed_holes === 'fill_enclosed_white_matte_only',
    `${resolved}: Stone Tower matte must only fill enclosed white-matte stitch pinholes.`);
  assert(config.geometry.master.canvas.join('x') === '1024x576',
    `${resolved}: Stone Tower master canvas must remain 1024x576.`);
  return { config, resolved };
}

function sameBounds(actual, expected) {
  return actual.minX === expected.min_x && actual.minY === expected.min_y &&
    actual.maxX === expected.max_x && actual.maxY === expected.max_y;
}

function scaleForCanvas(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  assert(sourceWidth * targetHeight === sourceHeight * targetWidth,
    'Review canvas must preserve the Stone Tower master aspect ratio.');
  return targetWidth / sourceWidth;
}

function discardContactShadowRows(matte, firstDiscardedSourceY) {
  const image = {
    width: matte.image.width,
    height: matte.image.height,
    channels: 4,
    pixels: Buffer.from(matte.image.pixels)
  };
  let removedPixels = 0;
  for (let y = firstDiscardedSourceY; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.pixels[offset + 3] > 0) {
        image.pixels.fill(0, offset, offset + 4);
        removedPixels += 1;
      }
    }
  }
  return { image, removedPixels };
}

function normalizeStoneTower(sourcePath, config) {
  const source = verifySource(sourcePath, config);
  const matte = createCloudMatteRgba(source.image, config.matte);
  assert(sameBounds(matte.hard.bounds, config.matte.expected_hard_bounds),
    `Hard Stone Tower bounds ${JSON.stringify(matte.hard.bounds)} do not match the frozen configuration.`);
  const shadowCleanup = discardContactShadowRows(matte, config.matte.contact_shadow.first_discarded_source_y);
  const [masterWidth, masterHeight] = config.geometry.master.canvas;
  const scale = config.geometry.master.uniform_scale_numerator / config.geometry.master.uniform_scale_denominator;
  const [translateX, translateY] = config.geometry.master.translation;
  const masterCleanup = retainLargestVisibleComponent(resampleRgba(shadowCleanup.image, masterWidth, masterHeight, {
    scale_x: scale, scale_y: scale, translate_x: translateX, translate_y: translateY
  }, config.resampling));
  const master = masterCleanup.image;
  const reviews = {};
  const reviewCleanup = {};
  for (const [width, height] of config.geometry.review_sizes) {
    const reviewScale = scaleForCanvas(masterWidth, masterHeight, width, height);
    const key = `${width}x${height}`;
    const cleaned = retainLargestVisibleComponent(resampleRgba(master, width, height, {
      scale_x: reviewScale, scale_y: reviewScale, translate_x: 0, translate_y: 0
    }, config.resampling));
    reviews[key] = cleaned.image;
    reviewCleanup[key] = cleaned.removedPixels;
  }
  const metrics = alphaMetrics(master);
  const safe = config.geometry.master.motion_safe;
  assert(metrics.border_alpha_pixels === 0, 'Normalized Stone Tower has visible pixels on the canvas border.');
  assert(metrics.visible_component_count === 1 && metrics.disconnected_visible_pixels === 0,
    'Normalized Stone Tower must contain exactly one connected visible subject.');
  assert(metrics.core_bounds.minX >= safe.min_x && metrics.core_bounds.maxX <= safe.max_x &&
    metrics.core_bounds.minY >= safe.min_y && metrics.core_bounds.maxY <= safe.max_y,
  'Normalized Stone Tower exceeds its motion-safe bounds.');
  const [sourceX, sourceY] = config.geometry.source_landmarks.baseline_center;
  const mappedAnchor = [translateX + sourceX * scale, translateY + sourceY * scale];
  assert(JSON.stringify(mappedAnchor) === JSON.stringify(config.geometry.master.placement_anchor),
    'Frozen transform does not map the Stone Tower baseline anchor exactly.');
  return { source, matte, master, reviews, edgeReview: compositeContactSheet(master, config.review_backgrounds), metrics,
    mappedAnchor, componentCleanup: { source_contact_shadow_removed_pixels: shadowCleanup.removedPixels,
      master_removed_pixels: masterCleanup.removedPixels, review_removed_pixels: reviewCleanup } };
}

function writePng(filePath, image) {
  const bytes = encodeRgbaPng(image);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return { path: filePath, bytes: bytes.length, sha256: sha256(bytes), width: image.width, height: image.height };
}

function writeOutputs(result, config, configPath, outputDirectory, masterOutputPath) {
  const root = path.resolve(outputDirectory);
  const files = {
    master: writePng(path.join(root, config.outputs.master), result.master),
    review_384: writePng(path.join(root, config.outputs.review_384), result.reviews['384x216']),
    review_128: writePng(path.join(root, config.outputs.review_128), result.reviews['128x72']),
    edge_review: writePng(path.join(root, config.outputs.edge_review), result.edgeReview)
  };
  if (masterOutputPath) {
    files.approved_master = writePng(path.resolve(masterOutputPath), result.master);
    assert(files.approved_master.sha256 === files.master.sha256,
      'Approved Stone Tower master must be byte-identical to the reviewed output.');
  }
  const report = { schema_version: 1, id: config.id, work_package: config.work_package,
    config: { path: path.resolve(configPath), sha256: sha256(fs.readFileSync(configPath)) },
    source: { path: result.source.resolved, bytes: result.source.bytes.length, sha256: result.source.digest,
      width: result.source.image.width, height: result.source.image.height, channels: result.source.image.channels },
    segmentation: { hard_threshold: config.matte.hard_foreground_threshold, hard_component_count: result.matte.hard.componentCount,
      selected_hard_pixels: result.matte.hard.selectedPixels, discarded_hard_pixels: result.matte.hard.discardedPixels,
      selected_hard_bounds: result.matte.hard.bounds, source_matte_opaque_pixels: result.matte.opaquePixels,
      source_matte_partial_pixels: result.matte.partialPixels },
    geometry: { uniform_scale: config.geometry.master.uniform_scale_numerator / config.geometry.master.uniform_scale_denominator,
      translation: config.geometry.master.translation, mapped_placement_anchor: result.mappedAnchor,
      placement_anchor: config.geometry.master.placement_anchor }, alpha: result.metrics,
    post_resample_component_cleanup: result.componentCleanup, outputs: files,
    checks: { exact_source_pass: true, expected_hard_bounds_pass: true, deterministic_interior_matte_fill_pass: true,
      fixed_contact_shadow_row_removal_pass: true, one_visible_component_pass: true, transparent_canvas_border_pass: true,
      uniform_transform_pass: true, motion_safe_core_bounds_pass: true,
      deterministic_reproduction: 'Run twice and compare output SHA-256 values before source-master admission.' } };
  const reportPath = path.join(root, config.outputs.report);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs.');
    values[key.slice(2)] = value;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const loaded = loadConfig(args.config || DEFAULT_CONFIG);
  const result = normalizeStoneTower(args.source || loaded.config.source.default_external_path, loaded.config);
  const written = writeOutputs(result, loaded.config, loaded.resolved,
    args['output-dir'] || path.join('test-results', 'wp-015d4e', 'stone-tower-normalized'), args['master-output']);
  console.log(JSON.stringify({ report: written.reportPath, outputs: written.report.outputs, alpha: written.report.alpha,
    geometry: written.report.geometry, checks: written.report.checks }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { discardContactShadowRows, loadConfig, normalizeStoneTower, writeOutputs };
