const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { decodePng, getBounds } = require('./compare-character-silhouettes.js');

const DEFAULT_CONFIG = path.join(__dirname, 'asset-normalization', 'wp-015b2h-wizard-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function loadConfig(configPath = DEFAULT_CONFIG) {
  const resolved = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  assert(config.schema_version === 1, `${resolved}: unsupported normalization schema.`);
  return { config, resolved };
}

function verifySource(sourcePath, config) {
  const resolved = path.resolve(sourcePath);
  const bytes = fs.readFileSync(resolved);
  assert(bytes.length === config.source.bytes,
    `${resolved}: expected ${config.source.bytes} bytes, received ${bytes.length}.`);
  const digest = sha256(bytes);
  assert(digest === config.source.sha256,
    `${resolved}: expected SHA-256 ${config.source.sha256}, received ${digest}.`);
  const image = decodePng(resolved);
  assert(image.width === config.source.width && image.height === config.source.height,
    `${resolved}: expected ${config.source.width}x${config.source.height}, received ${image.width}x${image.height}.`);
  assert(image.channels === config.source.channels,
    `${resolved}: expected ${config.source.channels} channels, received ${image.channels}.`);
  return { resolved, bytes, digest, image };
}

function pixelDistance(image, index, backgroundRgb) {
  const offset = index * image.channels;
  return Math.max(
    Math.abs(image.pixels[offset] - backgroundRgb[0]),
    Math.abs(image.pixels[offset + 1] - backgroundRgb[1]),
    Math.abs(image.pixels[offset + 2] - backgroundRgb[2])
  );
}

function createHardMask(image, matteConfig) {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    const y = Math.floor(index / image.width);
    const offset = index * image.channels;
    const blueExcess = image.pixels[offset + 2] -
      Math.max(image.pixels[offset], image.pixels[offset + 1]);
    const outsideShadowZone = y < matteConfig.ground_shadow_exclusion.start_y;
    mask[index] = pixelDistance(image, index, matteConfig.background_rgb) >=
      matteConfig.hard_foreground_threshold &&
      (outsideShadowZone || blueExcess >= matteConfig.ground_shadow_exclusion.hard_minimum_blue_excess) ? 1 : 0;
  }
  return mask;
}

function selectLargestComponent(mask, width, height, connectivity = 8) {
  assert(connectivity === 8, 'Only 8-connected subject selection is supported.');
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  let label = 0;
  let largestLabel = 0;
  let largestSize = 0;
  let componentCount = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue;
    label += 1;
    componentCount += 1;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = start;
    labels[start] = label;

    while (head < tail) {
      const index = queue[head++];
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          if (nextX < 0 || nextX >= width) continue;
          const next = nextY * width + nextX;
          if (!mask[next] || labels[next]) continue;
          labels[next] = label;
          queue[tail++] = next;
        }
      }
    }

    if (size > largestSize) {
      largestSize = size;
      largestLabel = label;
    }
  }

  assert(largestLabel !== 0, 'The hard foreground mask is empty.');
  const selected = new Uint8Array(mask.length);
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === largestLabel) selected[index] = 1;
  }
  return {
    mask: selected,
    componentCount,
    selectedPixels: largestSize,
    discardedPixels: mask.reduce((total, value) => total + value, 0) - largestSize,
    bounds: getBounds(selected, width, height)
  };
}

function fillEnclosedHoles(selected, width, height, maximumRetainedY = height - 1) {
  const external = new Uint8Array(selected.length);
  const queue = new Int32Array(selected.length);
  let head = 0;
  let tail = 0;

  function enqueue(index) {
    if (selected[index] || external[index]) return;
    external[index] = 1;
    queue[tail++] = index;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  const filled = selected.slice();
  const visited = new Uint8Array(selected.length);
  let enclosedPixels = 0;
  let rejectedEnclosedPixels = 0;
  for (let start = 0; start < filled.length; start += 1) {
    if (selected[start] || external[start] || visited[start]) continue;
    head = 0;
    tail = 0;
    let maxY = -1;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      maxY = Math.max(maxY, y);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      for (const next of neighbors) {
        if (selected[next] || external[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (maxY <= maximumRetainedY) {
      for (let index = 0; index < tail; index += 1) filled[queue[index]] = 1;
      enclosedPixels += tail;
    } else {
      rejectedEnclosedPixels += tail;
    }
  }
  return { mask: filled, enclosedPixels, rejectedEnclosedPixels };
}

function dilate(mask, width, height, radius) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);
      for (let nextY = minY; nextY <= maxY; nextY += 1) {
        const row = nextY * width;
        for (let nextX = minX; nextX <= maxX; nextX += 1) result[row + nextX] = 1;
      }
    }
  }
  return result;
}

function createMatteRgba(image, matteConfig) {
  const hard = createHardMask(image, matteConfig);
  const selected = selectLargestComponent(
    hard,
    image.width,
    image.height,
    matteConfig.component_connectivity
  );
  const filled = fillEnclosedHoles(
    selected.mask,
    image.width,
    image.height,
    matteConfig.preserve_enclosed_holes_max_y
  );
  const nearSubject = dilate(
    filled.mask,
    image.width,
    image.height,
    matteConfig.soft_edge_radius_pixels
  );
  const rgba = Buffer.alloc(image.width * image.height * 4);
  const low = matteConfig.soft_edge_low_threshold;
  const high = matteConfig.soft_edge_high_threshold;
  const background = matteConfig.background_rgb;
  let opaquePixels = 0;
  let partialPixels = 0;

  for (let index = 0; index < filled.mask.length; index += 1) {
    const sourceOffset = index * image.channels;
    const targetOffset = index * 4;
    let alpha = 0;
    if (filled.mask[index]) {
      alpha = 255;
    } else if (nearSubject[index]) {
      const distance = pixelDistance(image, index, background);
      const y = Math.floor(index / image.width);
      const blueExcess = image.pixels[sourceOffset + 2] -
        Math.max(image.pixels[sourceOffset], image.pixels[sourceOffset + 1]);
      const passesShadowExclusion = y < matteConfig.ground_shadow_exclusion.start_y ||
        blueExcess >= matteConfig.ground_shadow_exclusion.soft_minimum_blue_excess;
      if (distance > low && passesShadowExclusion) {
        alpha = Math.round(255 * Math.min(1, (distance - low) / (high - low)));
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
        const uncomposited = (composite - background[channel] * (1 - normalizedAlpha)) /
          normalizedAlpha;
        rgba[targetOffset + channel] = Math.round(Math.max(0, Math.min(255, uncomposited)));
      }
      rgba[targetOffset + 3] = alpha;
      partialPixels += 1;
    }
  }

  return {
    image: { width: image.width, height: image.height, channels: 4, pixels: rgba },
    hard: selected,
    enclosedPixels: filled.enclosedPixels,
    rejectedEnclosedPixels: filled.rejectedEnclosedPixels,
    opaquePixels,
    partialPixels
  };
}

function mitchellWeight(value, b = 1 / 3, c = 1 / 3) {
  const x = Math.abs(value);
  if (x < 1) {
    return ((12 - 9 * b - 6 * c) * x ** 3 +
      (-18 + 12 * b + 6 * c) * x ** 2 + (6 - 2 * b)) / 6;
  }
  if (x < 2) {
    return ((-b - 6 * c) * x ** 3 + (6 * b + 30 * c) * x ** 2 +
      (-12 * b - 48 * c) * x + (8 * b + 24 * c)) / 6;
  }
  return 0;
}

function resampleRgba(source, targetWidth, targetHeight, transform, filterConfig) {
  const target = Buffer.alloc(targetWidth * targetHeight * 4);
  const scaleX = transform.scale_x;
  const scaleY = transform.scale_y;
  assert(Math.abs(scaleX - scaleY) < 1e-12, 'Non-uniform resampling is blocked.');
  assert(scaleX > 0, 'Scale must be positive.');
  const b = filterConfig.b;
  const c = filterConfig.c;

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = (targetY + 0.5 - transform.translate_y) / scaleY - 0.5;
    const yStart = Math.floor(sourceY) - 1;
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = (targetX + 0.5 - transform.translate_x) / scaleX - 0.5;
      const xStart = Math.floor(sourceX) - 1;
      let alphaSum = 0;
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;

      for (let sampleY = yStart; sampleY <= yStart + 3; sampleY += 1) {
        if (sampleY < 0 || sampleY >= source.height) continue;
        const weightY = mitchellWeight(sourceY - sampleY, b, c);
        if (weightY === 0) continue;
        for (let sampleX = xStart; sampleX <= xStart + 3; sampleX += 1) {
          if (sampleX < 0 || sampleX >= source.width) continue;
          const weight = weightY * mitchellWeight(sourceX - sampleX, b, c);
          if (weight === 0) continue;
          const offset = (sampleY * source.width + sampleX) * 4;
          const alpha = source.pixels[offset + 3] / 255;
          alphaSum += alpha * weight;
          redSum += source.pixels[offset] / 255 * alpha * weight;
          greenSum += source.pixels[offset + 1] / 255 * alpha * weight;
          blueSum += source.pixels[offset + 2] / 255 * alpha * weight;
        }
      }

      const alpha = Math.max(0, Math.min(1, alphaSum));
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      if (alpha > 0) {
        target[targetOffset] = Math.round(255 * Math.max(0, Math.min(alpha, redSum)) / alpha);
        target[targetOffset + 1] = Math.round(255 * Math.max(0, Math.min(alpha, greenSum)) / alpha);
        target[targetOffset + 2] = Math.round(255 * Math.max(0, Math.min(alpha, blueSum)) / alpha);
        target[targetOffset + 3] = Math.round(alpha * 255);
      }
    }
  }

  return { width: targetWidth, height: targetHeight, channels: 4, pixels: target };
}

function scaleRgba(source, targetWidth, targetHeight, filterConfig) {
  const scale = targetWidth / source.width;
  assert(Math.abs(scale - targetHeight / source.height) < 1e-12,
    'Review derivatives must preserve the source aspect ratio.');
  return resampleRgba(source, targetWidth, targetHeight, {
    scale_x: scale,
    scale_y: scale,
    translate_x: 0,
    translate_y: 0
  }, filterConfig);
}

function retainLargestVisibleComponent(image) {
  const visible = alphaMask(image, 1);
  const selected = selectLargestComponent(visible, image.width, image.height, 8);
  if (selected.componentCount === 1) return { image, removedPixels: 0, componentCount: 1 };
  const pixels = Buffer.from(image.pixels);
  for (let index = 0; index < selected.mask.length; index += 1) {
    if (selected.mask[index]) continue;
    const offset = index * 4;
    pixels[offset] = 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 0;
    pixels[offset + 3] = 0;
  }
  return {
    image: { width: image.width, height: image.height, channels: 4, pixels },
    removedPixels: selected.discardedPixels,
    componentCount: selected.componentCount
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function encodeRgbaPng(image) {
  assert(image.channels === 4, 'PNG encoder requires RGBA input.');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = image.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const outputOffset = y * (stride + 1);
    scanlines[outputOffset] = 0;
    image.pixels.copy(scanlines, outputOffset + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function alphaMask(image, threshold) {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = image.pixels[index * 4 + 3] >= threshold ? 1 : 0;
  }
  return mask;
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
  const visibleMask = alphaMask(image, 1);
  const coreMask = alphaMask(image, 128);
  const component = selectLargestComponent(visibleMask, image.width, image.height, 8);
  return {
    transparent_pixels: transparent,
    partial_alpha_pixels: partial,
    opaque_pixels: opaque,
    border_alpha_pixels: borderAlphaPixels,
    visible_component_count: component.componentCount,
    disconnected_visible_pixels: component.discardedPixels,
    visible_bounds: getBounds(visibleMask, image.width, image.height),
    core_bounds: getBounds(coreMask, image.width, image.height)
  };
}

function compositeContactSheet(master, reviewConfig) {
  const names = reviewConfig.contact_sheet_order;
  assert(names.length === 2, 'The edge review contact sheet requires exactly two backgrounds.');
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

function normalizeCharacter(sourcePath, config) {
  const source = verifySource(sourcePath, config);
  const matte = createMatteRgba(source.image, config.matte);
  assert(compareBounds(matte.hard.bounds, config.matte.expected_hard_bounds),
    `Hard subject bounds ${JSON.stringify(matte.hard.bounds)} do not match the frozen configuration.`);

  const scale = config.geometry.master.uniform_scale_numerator /
    config.geometry.master.uniform_scale_denominator;
  const translation = config.geometry.master.translation;
  const masterResample = resampleRgba(matte.image, 512, 512, {
    scale_x: scale,
    scale_y: scale,
    translate_x: translation[0],
    translate_y: translation[1]
  }, config.resampling);
  const masterCleanup = retainLargestVisibleComponent(masterResample);
  const master = masterCleanup.image;
  const review192Cleanup = retainLargestVisibleComponent(scaleRgba(master, 192, 192, config.resampling));
  const review48Cleanup = retainLargestVisibleComponent(scaleRgba(master, 48, 48, config.resampling));
  const review192 = review192Cleanup.image;
  const review48 = review48Cleanup.image;
  const edgeReview = compositeContactSheet(master, config.review_backgrounds);
  const metrics = alphaMetrics(master);

  assert(metrics.border_alpha_pixels === 0, 'Normalized master has visible pixels on the canvas border.');
  assert(metrics.visible_component_count === 1, 'Normalized master must contain one connected visible subject.');
  assert(metrics.disconnected_visible_pixels === 0,
    'Normalized master contains disconnected visible background fragments.');
  const safe = config.geometry.master.motion_safe;
  assert(metrics.core_bounds.minX >= safe.min_x && metrics.core_bounds.maxX <= safe.max_x,
    'Normalized master exceeds the horizontal motion-safe bounds.');
  assert(metrics.core_bounds.minY >= safe.min_y - 2 && metrics.core_bounds.maxY <= safe.baseline_y + 2,
    'Normalized master exceeds the vertical motion-safe bounds tolerance.');

  const sourcePivot = config.geometry.source_landmarks.ground_pivot;
  const sourceSocket = config.geometry.source_landmarks.visible_palm_socket;
  const mappedPivot = [translation[0] + sourcePivot[0] * scale, translation[1] + sourcePivot[1] * scale];
  const mappedSocket = [translation[0] + sourceSocket[0] * scale, translation[1] + sourceSocket[1] * scale];
  assert(Math.abs(mappedPivot[0] - config.geometry.master.ground_pivot[0]) < 1e-9 &&
    Math.abs(mappedPivot[1] - config.geometry.master.ground_pivot[1]) < 1e-9,
  'Frozen transform does not map the ground pivot exactly.');

  return {
    source,
    matte,
    master,
    review192,
    review48,
    edgeReview,
    metrics,
    componentCleanup: {
      master_removed_pixels: masterCleanup.removedPixels,
      review_192_removed_pixels: review192Cleanup.removedPixels,
      review_48_removed_pixels: review48Cleanup.removedPixels
    },
    mappedPivot,
    mappedSocket
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
      enclosed_shadow_zone_pixels_discarded: result.matte.rejectedEnclosedPixels,
      source_matte_opaque_pixels: result.matte.opaquePixels,
      source_matte_partial_pixels: result.matte.partialPixels
    },
    geometry: {
      uniform_scale: config.geometry.master.uniform_scale_numerator /
        config.geometry.master.uniform_scale_denominator,
      translation: config.geometry.master.translation,
      mapped_ground_pivot: result.mappedPivot,
      mapped_visible_palm_socket: result.mappedSocket,
      rounded_master_ground_pivot: config.geometry.master.ground_pivot,
      rounded_master_visible_palm_socket: config.geometry.master.visible_palm_socket,
      superseded_b1_socket: config.geometry.superseded_b1_socket
    },
    alpha: result.metrics,
    post_resample_component_cleanup: result.componentCleanup,
    outputs: files,
    checks: {
      exact_source_pass: true,
      expected_hard_bounds_pass: true,
      one_visible_component_pass: true,
      disconnected_background_pass: true,
      transparent_canvas_border_pass: true,
      uniform_transform_pass: true,
      motion_safe_core_bounds_pass: true,
      deterministic_reproduction: 'Run twice and compare output SHA-256 values in the tooling test and B2H evidence.'
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
    if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs.');
    values[key.slice(2)] = value;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const loaded = loadConfig(args.config || DEFAULT_CONFIG);
  const sourcePath = args.source || loaded.config.source.default_external_path;
  const outputDirectory = args['output-dir'] || path.join('test-results', 'wp-015b2h');
  const result = normalizeCharacter(sourcePath, loaded.config);
  const written = writeOutputs(result, loaded.config, loaded.resolved, outputDirectory);
  console.log(JSON.stringify({
    report: written.reportPath,
    master: written.report.outputs.master,
    review_192: written.report.outputs.review_192,
    review_48: written.report.outputs.review_48,
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
  createHardMask,
  createMatteRgba,
  encodeRgbaPng,
  fillEnclosedHoles,
  loadConfig,
  mitchellWeight,
  normalizeCharacter,
  retainLargestVisibleComponent,
  resampleRgba,
  scaleRgba,
  selectLargestComponent,
  sha256,
  verifySource,
  writeOutputs
};
