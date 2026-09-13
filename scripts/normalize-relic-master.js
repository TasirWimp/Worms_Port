const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { getBounds } = require('./compare-character-silhouettes.js');
const {
  encodeRgbaPng,
  retainLargestVisibleComponent,
  resampleRgba,
  scaleRgba,
  sha256,
  selectLargestComponent,
  verifySource
} = require('./normalize-character-master.js');

const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-015b3a-threadball-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1, `${resolved}: unsupported normalization schema.`);
  assert(config.id === 'wp-015b3a-threadball-v1', `${resolved}: unexpected relic normalization id.`);
  assert(config.matte.enclosed_holes === 'preserve_background',
    `${resolved}: Threadball strand gaps must remain transparent.`);
  return { config, resolved };
}

function alphaMask(image, threshold = 1) {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = image.pixels[index * 4 + 3] >= threshold ? 1 : 0;
  }
  return mask;
}

function pixelDistance(image, index, backgroundRgb) {
  const offset = index * image.channels;
  return Math.max(
    Math.abs(image.pixels[offset] - backgroundRgb[0]),
    Math.abs(image.pixels[offset + 1] - backgroundRgb[1]),
    Math.abs(image.pixels[offset + 2] - backgroundRgb[2])
  );
}

function dilate(mask, width, height, radius) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let nextY = Math.max(0, y - radius); nextY <= Math.min(height - 1, y + radius); nextY += 1) {
        for (let nextX = Math.max(0, x - radius); nextX <= Math.min(width - 1, x + radius); nextX += 1) {
          result[nextY * width + nextX] = 1;
        }
      }
    }
  }
  return result;
}

function createRelicMatteRgba(image, matteConfig) {
  const hardMask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < hardMask.length; index += 1) {
    hardMask[index] = pixelDistance(image, index, matteConfig.background_rgb) >=
      matteConfig.hard_foreground_threshold ? 1 : 0;
  }
  const hard = selectLargestComponent(
    hardMask,
    image.width,
    image.height,
    matteConfig.component_connectivity
  );
  const nearSubject = dilate(hard.mask, image.width, image.height, matteConfig.soft_edge_radius_pixels);
  const rgba = Buffer.alloc(image.width * image.height * 4);
  let opaquePixels = 0;
  let partialPixels = 0;
  for (let index = 0; index < hard.mask.length; index += 1) {
    const sourceOffset = index * image.channels;
    const targetOffset = index * 4;
    let alpha = 0;
    if (hard.mask[index]) {
      alpha = 255;
    } else if (nearSubject[index]) {
      const distance = pixelDistance(image, index, matteConfig.background_rgb);
      if (distance > matteConfig.soft_edge_low_threshold) {
        alpha = Math.round(255 * Math.min(1,
          (distance - matteConfig.soft_edge_low_threshold) /
          (matteConfig.soft_edge_high_threshold - matteConfig.soft_edge_low_threshold)));
      }
    }
    if (alpha === 255) {
      rgba[targetOffset] = image.pixels[sourceOffset];
      rgba[targetOffset + 1] = image.pixels[sourceOffset + 1];
      rgba[targetOffset + 2] = image.pixels[sourceOffset + 2];
      rgba[targetOffset + 3] = 255;
      opaquePixels += 1;
    } else if (alpha > 0) {
      const normalizedAlpha = alpha / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const composite = image.pixels[sourceOffset + channel];
        const uncomposited = (composite - matteConfig.background_rgb[channel] * (1 - normalizedAlpha)) /
          normalizedAlpha;
        rgba[targetOffset + channel] = Math.round(Math.max(0, Math.min(255, uncomposited)));
      }
      rgba[targetOffset + 3] = alpha;
      partialPixels += 1;
    }
  }
  return {
    image: { width: image.width, height: image.height, channels: 4, pixels: rgba },
    hard,
    enclosedPixels: 0,
    opaquePixels,
    partialPixels
  };
}

function alphaMetrics(image) {
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  let borderAlphaPixels = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const alpha = image.pixels[index * 4 + 3];
    if (alpha === 0) transparent += 1;
    else if (alpha === 255) opaque += 1;
    else partial += 1;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    if (alpha > 0 && (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1)) {
      borderAlphaPixels += 1;
    }
  }
  const visible = alphaMask(image, 1);
  const core = alphaMask(image, 128);
  const component = selectLargestComponent(visible, image.width, image.height, 8);
  return {
    transparent_pixels: transparent,
    partial_alpha_pixels: partial,
    opaque_pixels: opaque,
    border_alpha_pixels: borderAlphaPixels,
    visible_component_count: component.componentCount,
    disconnected_visible_pixels: component.discardedPixels,
    visible_bounds: getBounds(visible, image.width, image.height),
    core_bounds: getBounds(core, image.width, image.height)
  };
}

function compositeContactSheet(master, reviewConfig) {
  const names = reviewConfig.contact_sheet_order;
  assert(Array.isArray(names) && names.length === 2,
    'The edge review contact sheet requires exactly two backgrounds.');
  const output = Buffer.alloc(master.width * 2 * master.height * 4);
  for (let panel = 0; panel < 2; panel += 1) {
    const background = reviewConfig[names[panel]];
    assert(Array.isArray(background) && background.length === 3,
      `Review background ${names[panel]} must be RGB.`);
    for (let y = 0; y < master.height; y += 1) {
      for (let x = 0; x < master.width; x += 1) {
        const sourceOffset = (y * master.width + x) * 4;
        const targetOffset = (y * master.width * 2 + panel * master.width + x) * 4;
        const alpha = master.pixels[sourceOffset + 3] / 255;
        for (let channel = 0; channel < 3; channel += 1) {
          output[targetOffset + channel] = Math.round(
            master.pixels[sourceOffset + channel] * alpha + background[channel] * (1 - alpha)
          );
        }
        output[targetOffset + 3] = 255;
      }
    }
  }
  return { width: master.width * 2, height: master.height, channels: 4, pixels: output };
}

function compareBounds(actual, expected) {
  return actual.minX === expected.min_x && actual.minY === expected.min_y &&
    actual.maxX === expected.max_x && actual.maxY === expected.max_y;
}

function normalizeRelic(sourcePath, config) {
  const source = verifySource(sourcePath, config);
  const matte = createRelicMatteRgba(source.image, config.matte);
  assert(compareBounds(matte.hard.bounds, config.matte.expected_hard_bounds),
    `Hard subject bounds ${JSON.stringify(matte.hard.bounds)} do not match the frozen configuration.`);

  const [masterWidth, masterHeight] = config.geometry.master.canvas;
  assert(masterWidth === masterHeight, 'Threadball master canvas must remain square.');
  const scale = config.geometry.master.uniform_scale_numerator /
    config.geometry.master.uniform_scale_denominator;
  const [translateX, translateY] = config.geometry.master.translation;
  const resampled = resampleRgba(matte.image, masterWidth, masterHeight, {
    scale_x: scale,
    scale_y: scale,
    translate_x: translateX,
    translate_y: translateY
  }, config.resampling);
  const masterCleanup = retainLargestVisibleComponent(resampled);
  const master = masterCleanup.image;
  const reviews = {};
  const reviewCleanup = {};
  for (const size of config.geometry.review_sizes) {
    const cleaned = retainLargestVisibleComponent(scaleRgba(master, size, size, config.resampling));
    reviews[size] = cleaned.image;
    reviewCleanup[size] = cleaned.removedPixels;
  }
  const edgeReview = compositeContactSheet(master, config.review_backgrounds);
  const metrics = alphaMetrics(master);
  const safe = config.geometry.master.motion_safe;
  assert(metrics.border_alpha_pixels === 0, 'Normalized master has visible pixels on the canvas border.');
  assert(metrics.visible_component_count === 1 && metrics.disconnected_visible_pixels === 0,
    'Normalized Threadball must contain exactly one connected visible subject.');
  assert(metrics.core_bounds.minX >= safe.min_x && metrics.core_bounds.maxX <= safe.max_x &&
    metrics.core_bounds.minY >= safe.min_y && metrics.core_bounds.maxY <= safe.max_y,
  'Normalized Threadball exceeds its motion-safe bounds.');

  const [sourceX, sourceY] = config.geometry.source_landmarks.visible_center;
  const mappedCenter = [translateX + sourceX * scale, translateY + sourceY * scale];
  const expectedCenter = config.geometry.master.projectile_origin;
  assert(Math.abs(mappedCenter[0] - expectedCenter[0]) < 1e-9 &&
    Math.abs(mappedCenter[1] - expectedCenter[1]) < 1e-9,
  'Frozen transform does not map the visible Threadball center exactly.');

  return {
    source,
    matte,
    master,
    reviews,
    edgeReview,
    metrics,
    mappedCenter,
    componentCleanup: {
      master_removed_pixels: masterCleanup.removedPixels,
      review_removed_pixels: reviewCleanup
    }
  };
}

function writeOutputs(result, config, configPath, outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  fs.mkdirSync(resolvedOutput, { recursive: true });
  const images = {
    master: result.master,
    review_48: result.reviews[48],
    review_36: result.reviews[36],
    review_28: result.reviews[28],
    edge_review: result.edgeReview
  };
  const files = {};
  for (const [key, image] of Object.entries(images)) {
    assert(image, `Missing requested ${key} review output.`);
    const bytes = encodeRgbaPng(image);
    const filename = config.outputs[key];
    const filePath = path.join(resolvedOutput, filename);
    fs.writeFileSync(filePath, bytes);
    files[key] = {
      path: filePath,
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
    segmentation: {
      hard_threshold: config.matte.hard_foreground_threshold,
      hard_component_count: result.matte.hard.componentCount,
      selected_hard_pixels: result.matte.hard.selectedPixels,
      discarded_hard_pixels: result.matte.hard.discardedPixels,
      selected_hard_bounds: result.matte.hard.bounds,
      enclosed_pixels_retained: result.matte.enclosedPixels,
      source_matte_opaque_pixels: result.matte.opaquePixels,
      source_matte_partial_pixels: result.matte.partialPixels
    },
    geometry: {
      uniform_scale: config.geometry.master.uniform_scale_numerator /
        config.geometry.master.uniform_scale_denominator,
      translation: config.geometry.master.translation,
      mapped_projectile_origin: result.mappedCenter,
      projectile_origin: config.geometry.master.projectile_origin
    },
    alpha: result.metrics,
    post_resample_component_cleanup: result.componentCleanup,
    outputs: files,
    checks: {
      exact_source_pass: true,
      expected_hard_bounds_pass: true,
      preserved_open_strand_gaps_pass: true,
      one_visible_component_pass: true,
      transparent_canvas_border_pass: true,
      uniform_transform_pass: true,
      motion_safe_core_bounds_pass: true,
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
  const outputDirectory = args['output-dir'] || path.join('test-results', 'wp-015b3a', 'normalized');
  const result = normalizeRelic(sourcePath, loaded.config);
  const written = writeOutputs(result, loaded.config, loaded.resolved, outputDirectory);
  console.log(JSON.stringify({
    report: written.reportPath,
    master: written.report.outputs.master,
    review_48: written.report.outputs.review_48,
    review_36: written.report.outputs.review_36,
    review_28: written.report.outputs.review_28,
    edge_review: written.report.outputs.edge_review,
    alpha: written.report.alpha,
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
  alphaMetrics,
  compositeContactSheet,
  createRelicMatteRgba,
  loadConfig,
  normalizeRelic,
  writeOutputs
};
