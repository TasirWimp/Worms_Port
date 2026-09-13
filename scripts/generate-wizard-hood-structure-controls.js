const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { decodePng } = require('./compare-character-silhouettes');

const CONTROL_CONTRACT = Object.freeze({
  width: 1024,
  height: 1024,
  renderScale: 4,
  guidePath: 'docs/images/art-direction/knotkin-wizard-hood-structure-guide.png',
  maskPath: 'docs/images/art-direction/knotkin-wizard-hood-edit-mask.png',
  baseEvidenceSha256: 'DEF9265DAA4C6F2799D16870205E2015291E3E4AAE0F61802349C9FD8D56AD00'
});

// The mask is a generous permission region, not the desired garment outline.
// It leaves room for a tall folded crown and for complete removal of the old
// horizontal neck wrap while protecting the accepted face and lower anatomy.
const EDITABLE_HOOD_REGION = Object.freeze([
  [215, 590],
  [205, 455],
  [218, 320],
  [250, 220],
  [285, 155],
  [285, 18],
  [480, 28],
  [550, 95],
  [635, 135],
  [720, 190],
  [775, 285],
  [792, 420],
  [780, 520],
  [730, 585],
  [650, 615],
  [350, 615],
  [270, 595]
]);

const PROTECTED_FACE_ISLAND = Object.freeze([
  [388, 214],
  [625, 208],
  [688, 258],
  [709, 382],
  [675, 407],
  [620, 425],
  [430, 430],
  [360, 408],
  [326, 320]
]);

const PROTECTED_MOUTH_ISLAND = Object.freeze([
  [474, 420],
  [635, 416],
  [641, 465],
  [470, 467]
]);

// This is the intended structural cue. Its bent crown leans away from the
// forward Relic hand and its two short mantle flaps avoid a thief-like scarf.
const HOOD_OUTER = Object.freeze([
  [274, 505],
  [258, 396],
  [273, 292],
  [306, 220],
  [365, 165],
  [330, 44],
  [435, 62],
  [520, 120],
  [622, 157],
  [690, 204],
  [736, 292],
  [750, 405],
  [728, 493],
  [681, 535],
  [635, 555],
  [380, 559],
  [319, 538]
]);

const LEFT_MANTLE = Object.freeze([
  [274, 448],
  [355, 478],
  [416, 513],
  [390, 607],
  [329, 580],
  [286, 526]
]);

const RIGHT_MANTLE = Object.freeze([
  [650, 478],
  [735, 447],
  [720, 526],
  [666, 603],
  [608, 514]
]);

const CENTER_NECK_OPENING = Object.freeze([
  [350, 418],
  [705, 412],
  [690, 498],
  [603, 536],
  [520, 578],
  [438, 538],
  [378, 500]
]);

const RECLAIMED_NECK_REGION = Object.freeze([
  [246, 396],
  [765, 390],
  [744, 565],
  [664, 599],
  [355, 600],
  [278, 566]
]);

const LEFT_MANTLE_EDGE = Object.freeze([
  [350, 570],
  [421, 588],
  [418, 599],
  [347, 581]
]);

const RIGHT_MANTLE_EDGE = Object.freeze([
  [655, 582],
  [712, 532],
  [718, 540],
  [660, 592]
]);

const COLORS = Object.freeze({
  black: [0, 0, 0, 255],
  white: [255, 255, 255, 255],
  pale: [216, 239, 244, 255],
  paleShadow: [188, 220, 229, 255],
  indigo: [65, 50, 126, 255],
  indigoShadow: [45, 35, 92, 255],
  gold: [222, 174, 43, 255],
  eye: [25, 27, 43, 255]
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createCanvas(width, height, color) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
  return pixels;
}

function setPixel(pixels, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillPolygon(pixels, width, height, points, color, scale = 1) {
  const scaled = points.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);
  const minY = Math.max(0, Math.min(...scaled.map((point) => point[1])));
  const maxY = Math.min(height - 1, Math.max(...scaled.map((point) => point[1])));

  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let index = 0; index < scaled.length; index += 1) {
      const start = scaled[index];
      const end = scaled[(index + 1) % scaled.length];
      if ((start[1] <= y && end[1] > y) || (end[1] <= y && start[1] > y)) {
        const ratio = (y - start[1]) / (end[1] - start[1]);
        intersections.push(start[0] + ratio * (end[0] - start[0]));
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const minX = Math.max(0, Math.ceil(intersections[index]));
      const maxX = Math.min(width - 1, Math.floor(intersections[index + 1]));
      for (let x = minX; x <= maxX; x += 1) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function fillCircle(pixels, width, height, centerX, centerY, radius, color, scale = 1) {
  const cx = Math.round(centerX * scale);
  const cy = Math.round(centerY * scale);
  const r = Math.round(radius * scale);
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r ** 2) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function downsample(source, sourceWidth, sourceHeight, scale) {
  const width = sourceWidth / scale;
  const height = sourceHeight / scale;
  const target = Buffer.alloc(width * height * 4);
  const sampleCount = scale * scale;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < scale; sampleY += 1) {
        for (let sampleX = 0; sampleX < scale; sampleX += 1) {
          const sourceOffset = (((y * scale + sampleY) * sourceWidth) + (x * scale + sampleX)) * 4;
          for (let channel = 0; channel < 4; channel += 1) sums[channel] += source[sourceOffset + channel];
        }
      }
      const targetOffset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        target[targetOffset + channel] = Math.round(sums[channel] / sampleCount);
      }
    }
  }
  return target;
}

function encodePng(pixels, width, height) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (width * 4 + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND')
  ]);
}

function createMaskPixels() {
  const scale = CONTROL_CONTRACT.renderScale;
  const width = CONTROL_CONTRACT.width * scale;
  const height = CONTROL_CONTRACT.height * scale;
  const pixels = createCanvas(width, height, COLORS.black);
  fillPolygon(pixels, width, height, EDITABLE_HOOD_REGION, COLORS.white, scale);
  fillPolygon(pixels, width, height, PROTECTED_FACE_ISLAND, COLORS.black, scale);
  fillPolygon(pixels, width, height, PROTECTED_MOUTH_ISLAND, COLORS.black, scale);
  return downsample(pixels, width, height, scale);
}

function drawGarment(pixels, width, height, scale = 1) {
  fillPolygon(pixels, width, height, HOOD_OUTER, COLORS.indigo, scale);
  fillPolygon(pixels, width, height, LEFT_MANTLE, COLORS.indigoShadow, scale);
  fillPolygon(pixels, width, height, RIGHT_MANTLE, COLORS.indigoShadow, scale);
  fillPolygon(pixels, width, height, LEFT_MANTLE_EDGE, COLORS.gold, scale);
  fillPolygon(pixels, width, height, RIGHT_MANTLE_EDGE, COLORS.gold, scale);
}

function createGuidePixels() {
  const scale = CONTROL_CONTRACT.renderScale;
  const width = CONTROL_CONTRACT.width * scale;
  const height = CONTROL_CONTRACT.height * scale;
  const pixels = createCanvas(width, height, COLORS.white);

  fillPolygon(pixels, width, height, [[394, 486], [632, 482], [682, 714], [628, 835], [394, 835], [342, 714]], COLORS.pale, scale);
  fillPolygon(pixels, width, height, [[344, 535], [286, 578], [306, 742], [371, 704]], COLORS.paleShadow, scale);
  fillPolygon(pixels, width, height, [[674, 520], [730, 555], [756, 710], [693, 726], [644, 591]], COLORS.paleShadow, scale);
  fillPolygon(pixels, width, height, [[404, 825], [491, 825], [478, 925], [391, 925]], COLORS.paleShadow, scale);
  fillPolygon(pixels, width, height, [[538, 825], [625, 825], [638, 925], [551, 925]], COLORS.paleShadow, scale);

  drawGarment(pixels, width, height, scale);
  fillPolygon(pixels, width, height, CENTER_NECK_OPENING, COLORS.pale, scale);
  fillPolygon(pixels, width, height, PROTECTED_FACE_ISLAND, COLORS.pale, scale);
  fillPolygon(pixels, width, height, PROTECTED_MOUTH_ISLAND, COLORS.pale, scale);
  fillCircle(pixels, width, height, 478, 358, 42, COLORS.eye, scale);
  fillCircle(pixels, width, height, 585, 350, 42, COLORS.eye, scale);
  fillPolygon(pixels, width, height, [[490, 442], [548, 451], [584, 432], [548, 464], [503, 458]], COLORS.eye, scale);

  return downsample(pixels, width, height, scale);
}

function createScaffoldPixels(basePath) {
  const bytes = fs.readFileSync(basePath);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (hash !== CONTROL_CONTRACT.baseEvidenceSha256) {
    throw new Error(`Expected exact B2D base ${CONTROL_CONTRACT.baseEvidenceSha256}, found ${hash}.`);
  }
  const base = decodePng(basePath);
  if (base.width !== CONTROL_CONTRACT.width || base.height !== CONTROL_CONTRACT.height) {
    throw new Error('The exact B2D base must remain 1024x1024.');
  }

  const pixels = createCanvas(base.width, base.height, COLORS.white);
  for (let index = 0; index < base.width * base.height; index += 1) {
    const sourceOffset = index * base.channels;
    const targetOffset = index * 4;
    pixels[targetOffset] = base.pixels[sourceOffset];
    pixels[targetOffset + 1] = base.pixels[sourceOffset + 1];
    pixels[targetOffset + 2] = base.pixels[sourceOffset + 2];
    pixels[targetOffset + 3] = base.channels === 4 ? base.pixels[sourceOffset + 3] : 255;
  }

  fillPolygon(pixels, base.width, base.height, RECLAIMED_NECK_REGION, COLORS.pale);
  drawGarment(pixels, base.width, base.height);
  fillPolygon(pixels, base.width, base.height, CENTER_NECK_OPENING, COLORS.pale);

  const faceMask = createCanvas(base.width, base.height, COLORS.black);
  fillPolygon(faceMask, base.width, base.height, PROTECTED_FACE_ISLAND, COLORS.white);
  fillPolygon(faceMask, base.width, base.height, PROTECTED_MOUTH_ISLAND, COLORS.white);
  for (let index = 0; index < base.width * base.height; index += 1) {
    if (faceMask[index * 4] !== 255) continue;
    const sourceOffset = index * base.channels;
    const targetOffset = index * 4;
    pixels[targetOffset] = base.pixels[sourceOffset];
    pixels[targetOffset + 1] = base.pixels[sourceOffset + 1];
    pixels[targetOffset + 2] = base.pixels[sourceOffset + 2];
    pixels[targetOffset + 3] = base.channels === 4 ? base.pixels[sourceOffset + 3] : 255;
  }

  const mask = createMaskPixels();
  for (let index = 0; index < base.width * base.height; index += 1) {
    if (mask[index * 4] !== 0) continue;
    const sourceOffset = index * base.channels;
    const targetOffset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      if (pixels[targetOffset + channel] !== base.pixels[sourceOffset + channel]) {
        throw new Error(`Scaffold changed protected pixel ${index}.`);
      }
    }
  }
  return pixels;
}

function createMaskPng() {
  return encodePng(createMaskPixels(), CONTROL_CONTRACT.width, CONTROL_CONTRACT.height);
}

function createGuidePng() {
  return encodePng(createGuidePixels(), CONTROL_CONTRACT.width, CONTROL_CONTRACT.height);
}

function createScaffoldPng(basePath) {
  return encodePng(createScaffoldPixels(basePath), CONTROL_CONTRACT.width, CONTROL_CONTRACT.height);
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs.');
    values[key.slice(2)] = value;
  }
  if ((values.base && !values['scaffold-out']) || (!values.base && values['scaffold-out'])) {
    throw new Error('--base and --scaffold-out must be supplied together.');
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const guidePath = path.join(repoRoot, CONTROL_CONTRACT.guidePath);
  const maskPath = path.join(repoRoot, CONTROL_CONTRACT.maskPath);
  fs.mkdirSync(path.dirname(guidePath), { recursive: true });
  fs.writeFileSync(guidePath, createGuidePng());
  fs.writeFileSync(maskPath, createMaskPng());
  console.log(guidePath);
  console.log(maskPath);

  if (args.base) {
    const scaffoldPath = path.resolve(args['scaffold-out']);
    fs.mkdirSync(path.dirname(scaffoldPath), { recursive: true });
    fs.writeFileSync(scaffoldPath, createScaffoldPng(path.resolve(args.base)));
    console.log(scaffoldPath);
  }
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
  CONTROL_CONTRACT,
  CENTER_NECK_OPENING,
  EDITABLE_HOOD_REGION,
  HOOD_OUTER,
  LEFT_MANTLE,
  PROTECTED_FACE_ISLAND,
  PROTECTED_MOUTH_ISLAND,
  RECLAIMED_NECK_REGION,
  RIGHT_MANTLE,
  createGuidePng,
  createMaskPng,
  createScaffoldPng
};
