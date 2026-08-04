const fs = require('node:fs');
const path = require('node:path');

const {
  encodeRgbaPng,
  resampleRgba,
  sha256,
  verifySource
} = require('./normalize-character-master.js');

const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-015b3a-patch-terrain-top-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1, `${resolved}: unsupported normalization schema.`);
  assert(config.id === 'wp-015b3a-patch-terrain-top-v1',
    `${resolved}: unexpected Terrain Top normalization id.`);
  assert(config.geometry?.master?.uniform_scale_numerator === 1 &&
    config.geometry?.master?.uniform_scale_denominator === 4,
  `${resolved}: Terrain Top must use the frozen one-quarter uniform scale.`);
  assert(config.geometry?.master?.horizontal_edge_blend?.mode === 'reciprocal_linear_pair_blend',
    `${resolved}: Terrain Top must use the frozen reciprocal edge blend.`);
  return { config, resolved };
}

function cropRgbToOpaqueRgba(image, crop) {
  assert(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= image.width &&
    crop.y + crop.height <= image.height, 'Terrain Top crop exceeds the exact source bounds.');
  const pixels = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const sourceOffset = ((crop.y + y) * image.width + crop.x + x) * image.channels;
      const targetOffset = (y * crop.width + x) * 4;
      pixels[targetOffset] = image.pixels[sourceOffset];
      pixels[targetOffset + 1] = image.pixels[sourceOffset + 1];
      pixels[targetOffset + 2] = image.pixels[sourceOffset + 2];
      pixels[targetOffset + 3] = 255;
    }
  }
  return { width: crop.width, height: crop.height, channels: 4, pixels };
}

function blendHorizontalRepeatSeam(image, widthPixels) {
  assert(image.channels === 4, 'Terrain Top seam blending requires RGBA pixels.');
  assert(Number.isInteger(widthPixels) && widthPixels > 0 && widthPixels * 2 <= image.width,
    'Terrain Top edge blend width must fit inside the master.');
  const pixels = Buffer.from(image.pixels);
  for (let x = 0; x < widthPixels; x += 1) {
    const reciprocalWeight = (widthPixels - x) / (widthPixels * 2);
    const oppositeWeight = 1 - reciprocalWeight;
    const leftX = x;
    const rightX = image.width - 1 - x;
    for (let y = 0; y < image.height; y += 1) {
      const leftOffset = (y * image.width + leftX) * 4;
      const rightOffset = (y * image.width + rightX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const left = image.pixels[leftOffset + channel];
        const right = image.pixels[rightOffset + channel];
        pixels[leftOffset + channel] = Math.round(left * oppositeWeight + right * reciprocalWeight);
        pixels[rightOffset + channel] = Math.round(right * oppositeWeight + left * reciprocalWeight);
      }
    }
  }
  return { width: image.width, height: image.height, channels: 4, pixels };
}

function horizontalSeamMetrics(image) {
  assert(image.channels === 4, 'Terrain Top seam metrics require RGBA pixels.');
  let absoluteDifference = 0;
  let maximumDifference = 0;
  let samples = 0;
  for (let y = 0; y < image.height; y += 1) {
    const leftOffset = (y * image.width) * 4;
    const rightOffset = (y * image.width + image.width - 1) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(image.pixels[leftOffset + channel] - image.pixels[rightOffset + channel]);
      absoluteDifference += difference;
      maximumDifference = Math.max(maximumDifference, difference);
      samples += 1;
    }
  }
  return {
    edge_mean_absolute_difference: absoluteDifference / samples,
    edge_maximum_absolute_difference: maximumDifference,
    edge_pixels_match_exactly: maximumDifference === 0
  };
}

function repeatHorizontally(image, columns) {
  assert(Number.isInteger(columns) && columns >= 2, 'Terrain Top repeat proof needs at least two columns.');
  const pixels = Buffer.alloc(image.width * columns * image.height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let column = 0; column < columns; column += 1) {
      image.pixels.copy(
        pixels,
        (y * image.width * columns + column * image.width) * 4,
        y * image.width * 4,
        (y + 1) * image.width * 4
      );
    }
  }
  return { width: image.width * columns, height: image.height, channels: 4, pixels };
}

function normalizeTerrainTop(sourcePath, config) {
  const source = verifySource(sourcePath, config);
  const crop = cropRgbToOpaqueRgba(source.image, config.geometry.source_crop);
  const [masterWidth, masterHeight] = config.geometry.master.canvas;
  const scale = config.geometry.master.uniform_scale_numerator /
    config.geometry.master.uniform_scale_denominator;
  assert(crop.width * scale === masterWidth && crop.height * scale === masterHeight,
    'Frozen Terrain Top crop and master canvas must retain one uniform scale.');
  const resampled = resampleRgba(crop, masterWidth, masterHeight, {
    scale_x: scale,
    scale_y: scale,
    translate_x: 0,
    translate_y: 0
  }, config.resampling);
  const master = blendHorizontalRepeatSeam(
    resampled,
    config.geometry.master.horizontal_edge_blend.width_pixels
  );
  const seam = horizontalSeamMetrics(master);
  assert(seam.edge_pixels_match_exactly,
    'Terrain Top edge blend must make the horizontal repeat boundary exact.');
  assert([...master.pixels.filter((_, index) => index % 4 === 3)].every((alpha) => alpha === 255),
    'Terrain Top source master must remain fully opaque.');

  const repeatProof = repeatHorizontally(master, config.geometry.review.repeat_columns);
  const [reviewWidth, reviewHeight] = config.geometry.review.phone_preview_canvas;
  const phonePreview = resampleRgba(master, reviewWidth, reviewHeight, {
    scale_x: reviewWidth / masterWidth,
    scale_y: reviewHeight / masterHeight,
    translate_x: 0,
    translate_y: 0
  }, config.resampling);
  return { source, crop, master, repeatProof, phonePreview, seam };
}

function writeOutputs(result, config, configPath, outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  fs.mkdirSync(resolvedOutput, { recursive: true });
  const images = {
    master: result.master,
    repeat_3x: result.repeatProof,
    review_48: result.phonePreview
  };
  const files = {};
  for (const [key, image] of Object.entries(images)) {
    const bytes = encodeRgbaPng(image);
    const outputPath = path.join(resolvedOutput, config.outputs[key]);
    fs.writeFileSync(outputPath, bytes);
    files[key] = {
      path: outputPath,
      bytes: bytes.length,
      sha256: sha256(bytes),
      width: image.width,
      height: image.height
    };
  }
  const report = {
    schema_version: 1,
    id: config.id,
    work_package: config.work_package,
    config: {
      path: path.resolve(configPath),
      sha256: sha256(fs.readFileSync(configPath))
    },
    source: {
      path: result.source.resolved,
      bytes: result.source.bytes.length,
      sha256: result.source.digest,
      width: result.source.image.width,
      height: result.source.image.height,
      channels: result.source.image.channels
    },
    geometry: {
      source_crop: config.geometry.source_crop,
      uniform_scale: config.geometry.master.uniform_scale_numerator /
        config.geometry.master.uniform_scale_denominator,
      master_canvas: config.geometry.master.canvas,
      horizontal_edge_blend: config.geometry.master.horizontal_edge_blend
    },
    repeat_proof: {
      columns: config.geometry.review.repeat_columns,
      seam: result.seam
    },
    outputs: files,
    checks: {
      exact_source_pass: true,
      fixed_crop_pass: true,
      uniform_scale_pass: true,
      opaque_master_pass: true,
      deterministic_reciprocal_edge_blend_pass: true,
      exact_horizontal_repeat_boundary_pass: true,
      deterministic_reproduction: 'Run twice and compare output SHA-256 values in the tooling test and B3A evidence.'
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
  const sourcePath = args.source || loaded.config.source.default_external_path;
  const outputDirectory = args['output-dir'] || path.join('test-results', 'wp-015b3a', 'terrain-top-normalized');
  const result = normalizeTerrainTop(sourcePath, loaded.config);
  const written = writeOutputs(result, loaded.config, loaded.resolved, outputDirectory);
  console.log(JSON.stringify({
    report: written.reportPath,
    master: written.report.outputs.master,
    repeat_3x: written.report.outputs.repeat_3x,
    review_48: written.report.outputs.review_48,
    repeat_proof: written.report.repeat_proof,
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
  blendHorizontalRepeatSeam,
  cropRgbToOpaqueRgba,
  horizontalSeamMetrics,
  loadConfig,
  normalizeTerrainTop,
  repeatHorizontally,
  writeOutputs
};
