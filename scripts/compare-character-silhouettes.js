const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(filePath) {
  const bytes = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error(`${filePath}: not a PNG file.`);

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const imageData = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(`${filePath}: unsupported PNG compression, filter, or interlace mode.`);
      }
    } else if (type === 'IDAT') {
      imageData.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`${filePath}: only non-interlaced 8-bit RGB/RGBA PNG files are supported.`);
  }

  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(imageData));
  if (inflated.length !== (stride + 1) * height) throw new Error(`${filePath}: unexpected PNG data length.`);

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)];
    const sourceOffset = y * (stride + 1) + 1;
    const targetOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? pixels[targetOffset + x - channels] : 0;
      const above = y > 0 ? pixels[targetOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[targetOffset + x - stride - channels] : 0;
      if (filter === 0) pixels[targetOffset + x] = raw;
      else if (filter === 1) pixels[targetOffset + x] = (raw + left) & 0xff;
      else if (filter === 2) pixels[targetOffset + x] = (raw + above) & 0xff;
      else if (filter === 3) pixels[targetOffset + x] = (raw + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) pixels[targetOffset + x] = (raw + paeth(left, above, upperLeft)) & 0xff;
      else throw new Error(`${filePath}: unsupported PNG filter ${filter}.`);
    }
  }

  return { width, height, channels, pixels };
}

function createForegroundMask(image, threshold) {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * image.channels;
    const red = image.pixels[offset];
    const green = image.pixels[offset + 1];
    const blue = image.pixels[offset + 2];
    const alpha = image.channels === 4 ? image.pixels[offset + 3] : 255;
    const distanceFromWhite = Math.max(255 - red, 255 - green, 255 - blue);
    mask[index] = alpha >= 128 && distanceFromWhite >= threshold ? 1 : 0;
  }
  return mask;
}

function getBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('Foreground mask is empty.');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function normalizeMask(mask, width, bounds, size) {
  const normalized = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(bounds.maxY, bounds.minY + Math.floor((y + 0.5) * bounds.height / size));
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(bounds.maxX, bounds.minX + Math.floor((x + 0.5) * bounds.width / size));
      normalized[y * size + x] = mask[sourceY * width + sourceX];
    }
  }
  return normalized;
}

function intersectionOverUnion(left, right) {
  if (left.length !== right.length) throw new Error('Masks must have equal lengths.');
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] || right[index]) union += 1;
    if (left[index] && right[index]) intersection += 1;
  }
  return union === 0 ? 1 : intersection / union;
}

function compareImages(referencePath, candidatePath, options = {}) {
  const threshold = options.threshold ?? 32;
  const normalizedSize = options.normalizedSize ?? 256;
  const minimumIou = options.minimumIou ?? 0.9;
  const maximumBaselineDrift = options.maximumBaselineDrift ?? 16;
  const reference = decodePng(referencePath);
  const candidate = decodePng(candidatePath);
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error('Reference and candidate canvases must have equal dimensions.');
  }

  const referenceMask = createForegroundMask(reference, threshold);
  const candidateMask = createForegroundMask(candidate, threshold);
  const referenceBounds = getBounds(referenceMask, reference.width, reference.height);
  const candidateBounds = getBounds(candidateMask, candidate.width, candidate.height);
  const normalizedReference = normalizeMask(referenceMask, reference.width, referenceBounds, normalizedSize);
  const normalizedCandidate = normalizeMask(candidateMask, candidate.width, candidateBounds, normalizedSize);
  const normalizedIou = intersectionOverUnion(normalizedReference, normalizedCandidate);
  const canvasIou = intersectionOverUnion(referenceMask, candidateMask);
  const baselineDrift = Math.abs(referenceBounds.maxY - candidateBounds.maxY);

  return {
    reference: path.resolve(referencePath),
    candidate: path.resolve(candidatePath),
    canvas: { width: reference.width, height: reference.height },
    foreground_threshold_from_white: threshold,
    normalized_size: normalizedSize,
    reference_bounds: referenceBounds,
    candidate_bounds: candidateBounds,
    canvas_iou: Number(canvasIou.toFixed(6)),
    normalized_iou: Number(normalizedIou.toFixed(6)),
    baseline_drift_pixels: baselineDrift,
    minimum_normalized_iou: minimumIou,
    maximum_baseline_drift_pixels: maximumBaselineDrift,
    numeric_gate_pass: normalizedIou >= minimumIou && baselineDrift <= maximumBaselineDrift
  };
}

function compareProtectedPixels(referencePath, candidatePath, maskPath) {
  const reference = decodePng(referencePath);
  const candidate = decodePng(candidatePath);
  const mask = decodePng(maskPath);
  if (reference.width !== candidate.width || reference.height !== candidate.height ||
      reference.width !== mask.width || reference.height !== mask.height) {
    throw new Error('Reference, candidate, and mask canvases must have equal dimensions.');
  }

  let protectedPixels = 0;
  let mismatchedProtectedPixels = 0;
  let maximumChannelDifference = 0;
  for (let index = 0; index < reference.width * reference.height; index += 1) {
    const maskOffset = index * mask.channels;
    if (mask.pixels[maskOffset] !== 0) continue;
    protectedPixels += 1;

    const referenceOffset = index * reference.channels;
    const candidateOffset = index * candidate.channels;
    let pixelMatches = true;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(
        reference.pixels[referenceOffset + channel] - candidate.pixels[candidateOffset + channel]
      );
      maximumChannelDifference = Math.max(maximumChannelDifference, difference);
      if (difference !== 0) pixelMatches = false;
    }
    if (!pixelMatches) mismatchedProtectedPixels += 1;
  }

  return {
    reference: path.resolve(referencePath),
    candidate: path.resolve(candidatePath),
    mask: path.resolve(maskPath),
    canvas: { width: reference.width, height: reference.height },
    protected_mask_rule: 'red channel equals zero',
    protected_pixels: protectedPixels,
    mismatched_protected_pixels: mismatchedProtectedPixels,
    maximum_channel_difference: maximumChannelDifference,
    exact_protected_pixels_pass: mismatchedProtectedPixels === 0
  };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs.');
    values[key.slice(2)] = value;
  }
  if (!values.reference || !values.candidate) {
    throw new Error('Usage: node scripts/compare-character-silhouettes.js --reference <png> --candidate <png> [--mask <png>]');
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = compareImages(args.reference, args.candidate, {
    threshold: args.threshold ? Number(args.threshold) : undefined,
    normalizedSize: args['normalized-size'] ? Number(args['normalized-size']) : undefined,
    minimumIou: args['minimum-iou'] ? Number(args['minimum-iou']) : undefined,
    maximumBaselineDrift: args['maximum-baseline-drift'] ? Number(args['maximum-baseline-drift']) : undefined
  });
  if (args.mask) {
    result.protected_pixel_comparison = compareProtectedPixels(args.reference, args.candidate, args.mask);
  }
  console.log(JSON.stringify(result, null, 2));
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
  compareImages,
  compareProtectedPixels,
  createForegroundMask,
  decodePng,
  getBounds,
  intersectionOverUnion,
  normalizeMask
};
