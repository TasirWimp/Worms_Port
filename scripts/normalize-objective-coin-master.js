const fs = require('node:fs');
const path = require('node:path');

const { alphaMetrics, createRelicMatteRgba } = require('./normalize-relic-master.js');
const {
  encodeRgbaPng,
  retainLargestVisibleComponent,
  resampleRgba,
  sha256,
  verifySource
} = require('./normalize-character-master.js');

const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-026-generic-amber-hex-coin-v1.json');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1 && config.id === 'wp-026-generic-amber-hex-coin-v1',
    'Unexpected objective coin normalization configuration.');
  return { config, resolved };
}

function pointInsidePolygon(x, y, vertices) {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const [xi, yi] = vertices[index];
    const [xj, yj] = vertices[previous];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function createHexMask(width, height, vertices) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let covered = 0;
      for (const offsetY of [0.25, 0.75]) for (const offsetX of [0.25, 0.75]) {
        if (pointInsidePolygon(x + offsetX, y + offsetY, vertices)) covered += 1;
      }
      mask[y * width + x] = Math.round(255 * covered / 4);
    }
  }
  return mask;
}

function applyHexMask(image, mask) {
  const pixels = Buffer.from(image.pixels);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    pixels[offset + 3] = Math.round(pixels[offset + 3] * mask[index] / 255);
    if (pixels[offset + 3] === 0) pixels.fill(0, offset, offset + 4);
  }
  return { ...image, pixels };
}

function normalizeObjectiveCoin(sourcePath, config) {
  const source = verifySource(sourcePath, config);
  const matte = createRelicMatteRgba(source.image, config.matte);
  const expected = config.matte.expected_hard_bounds;
  const actual = matte.hard.bounds;
  assert(actual.minX === expected.min_x && actual.minY === expected.min_y &&
    actual.maxX === expected.max_x && actual.maxY === expected.max_y,
  'Approved objective coin foreground bounds changed.');
  const [width, height] = config.geometry.master_canvas;
  const scale = config.geometry.uniform_scale_numerator / config.geometry.uniform_scale_denominator;
  const [translateX, translateY] = config.geometry.translation;
  const resampled = resampleRgba(matte.image, width, height, {
    scale_x: scale, scale_y: scale, translate_x: translateX, translate_y: translateY
  }, config.resampling);
  const clipped = applyHexMask(resampled, createHexMask(width, height, config.guide.vertices_master_pixels));
  const master = retainLargestVisibleComponent(clipped).image;
  const metrics = alphaMetrics(master);
  const safe = config.geometry.motion_safe;
  assert(metrics.border_alpha_pixels === 0 && metrics.visible_component_count === 1 &&
    metrics.disconnected_visible_pixels === 0, 'Objective coin alpha isolation failed.');
  assert(metrics.core_bounds.minX >= safe.min_x && metrics.core_bounds.maxX <= safe.max_x &&
    metrics.core_bounds.minY >= safe.min_y && metrics.core_bounds.maxY <= safe.max_y,
  'Objective coin exceeds frozen motion-safe bounds.');
  return { source, matte, master, metrics };
}

function writeMaster(result, outputPath) {
  const bytes = encodeRgbaPng(result.master);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);
  return { path: outputPath, bytes: bytes.length, sha256: sha256(bytes) };
}

function main() {
  const values = {};
  for (let index = 0; index < process.argv.length - 2; index += 2) values[process.argv[index + 2].slice(2)] = process.argv[index + 3];
  const { config, resolved } = loadConfig(values.config);
  const result = normalizeObjectiveCoin(values.source || config.source.default_external_path, config);
  const output = path.resolve(values['master-output'] || config.outputs.approved_master_path);
  console.log(JSON.stringify({ config_sha256: sha256(fs.readFileSync(resolved)),
    master: writeMaster(result, output), alpha: result.metrics,
    guide_vertices: config.guide.vertices_master_pixels }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { applyHexMask, createHexMask, loadConfig, normalizeObjectiveCoin };
