const fs = require('node:fs');
const path = require('node:path');
const {createCloudMatteRgba} = require('./normalize-cloud-master.js');
const {alphaMetrics} = require('./normalize-relic-master.js');
const {
  encodeRgbaPng,
  retainLargestVisibleComponent,
  resampleRgba,
  sha256,
  verifySource
} = require('./normalize-character-master.js');

const defaultConfig = path.join(__dirname, 'asset-normalization', 'wp-015d4e-bush-cluster-v1.json');

function normalizeBushCluster(sourcePath, config) {
  const source = verifySource(sourcePath, config);
  const matte = createCloudMatteRgba(source.image, config.matte);
  const bounds = matte.hard.bounds;
  const expected = config.matte.expected_hard_bounds;
  if (bounds.minX !== expected.min_x || bounds.minY !== expected.min_y ||
      bounds.maxX !== expected.max_x || bounds.maxY !== expected.max_y) {
    throw new Error('Bush-cluster hard bounds changed.');
  }
  const [width, height] = config.geometry.master.canvas;
  const scale = config.geometry.master.uniform_scale_numerator /
    config.geometry.master.uniform_scale_denominator;
  const [translateX, translateY] = config.geometry.master.translation;
  const master = retainLargestVisibleComponent(resampleRgba(matte.image, width, height, {
    scale_x: scale,
    scale_y: scale,
    translate_x: translateX,
    translate_y: translateY
  }, config.resampling)).image;
  const metrics = alphaMetrics(master);
  const [sourceX, sourceY] = config.geometry.source_landmarks.baseline_center;
  const anchor = [translateX + sourceX * scale, translateY + sourceY * scale];
  const expectedAnchor = config.geometry.master.placement_anchor;
  if (Math.abs(anchor[0] - expectedAnchor[0]) > 1e-9 ||
      Math.abs(anchor[1] - expectedAnchor[1]) > 1e-9) {
    throw new Error('Bush-cluster anchor changed.');
  }
  if (metrics.border_alpha_pixels || metrics.visible_component_count !== 1 ||
      metrics.disconnected_visible_pixels) {
    throw new Error('Bush-cluster alpha isolation failed.');
  }
  return {master, metrics, anchor};
}

function main() {
  const config = JSON.parse(fs.readFileSync(defaultConfig, 'utf8'));
  const result = normalizeBushCluster(config.source.default_external_path, config);
  const output = path.resolve(process.argv[2] ||
    'assets/masters/environment/backgrounds/volcanic-ruin/bush-cluster-source-master-v1.png');
  const bytes = encodeRgbaPng(result.master);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, bytes);
  console.log(JSON.stringify({sha256: sha256(bytes), bytes: bytes.length, alpha: result.metrics, anchor: result.anchor}, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {normalizeBushCluster};
