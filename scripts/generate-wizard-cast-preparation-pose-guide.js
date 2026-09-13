const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// This is deliberately a diagram, not character art.  It supplies one local,
// project-owned structural reference for the single external FLUX.2 pose pilot.
const POSE_GUIDE_CONTRACT = Object.freeze({
  width: 1024,
  height: 1024,
  renderScale: 2,
  groundBaseline: Object.freeze([512, 902]),
  loomseedAnchor: Object.freeze([814, 456]),
  sourcePath: 'docs/images/art-direction/knotkin-wizard-cast-preparation-pose-guide-v1.png'
});

const COLORS = Object.freeze({
  background: [255, 255, 255, 255],
  outline: [31, 35, 72, 255],
  guideBlue: [98, 181, 226, 255],
  guideNavy: [63, 97, 154, 255],
  eye: [31, 35, 72, 255],
  loomseedGold: [238, 181, 51, 255],
  loomseedBlue: [81, 152, 214, 255],
  baseline: [169, 179, 198, 255]
});

// All positions are 1024x1024 output coordinates.  The feet share y=902 and
// the held Loomseed remains at the exact doubled approved-master anchor
// (407,228) -> (814,456).  The torso and hat lean a little toward the cast.
const BODY = Object.freeze([
  [379, 542], [491, 506], [609, 541], [662, 655],
  [631, 777], [571, 818], [403, 818], [342, 744], [335, 634]
]);
const HEAD = Object.freeze([527, 431, 156, 126]);
const HAT = Object.freeze([
  [400, 352], [655, 352], [586, 300], [539, 118],
  [493, 228], [454, 298]
]);
const HAT_BRIM = Object.freeze([527, 361, 175, 42]);
const REAR_ARM = Object.freeze([
  [375, 557], [321, 577], [270, 691], [305, 747], [369, 676], [416, 592]
]);
const FRONT_ARM = Object.freeze([
  [615, 546], [667, 520], [724, 475], [773, 445], [797, 476], [738, 522], [667, 594]
]);
const REAR_FOOT = Object.freeze([
  [394, 803], [484, 803], [491, 902], [321, 902], [321, 861]
]);
const FRONT_FOOT = Object.freeze([
  [510, 805], [590, 805], [660, 902], [479, 902], [479, 855]
]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
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
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return pixels;
}

function setPixel(pixels, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  pixels.set(color, (y * width + x) * 4);
}

function scaledPoint([x, y], scale) {
  return [Math.round(x * scale), Math.round(y * scale)];
}

function fillPolygon(pixels, width, height, points, color, scale) {
  const scaled = points.map((point) => scaledPoint(point, scale));
  const minY = Math.max(0, Math.min(...scaled.map(([, y]) => y)));
  const maxY = Math.min(height - 1, Math.max(...scaled.map(([, y]) => y)));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let index = 0; index < scaled.length; index += 1) {
      const start = scaled[index];
      const end = scaled[(index + 1) % scaled.length];
      if ((start[1] <= y && end[1] > y) || (end[1] <= y && start[1] > y)) {
        intersections.push(start[0] + ((y - start[1]) * (end[0] - start[0])) / (end[1] - start[1]));
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      for (let x = Math.max(0, Math.ceil(intersections[index])); x <= Math.min(width - 1, Math.floor(intersections[index + 1])); x += 1) {
        setPixel(pixels, width, height, x, y, color);
      }
    }
  }
}

function fillEllipse(pixels, width, height, centerX, centerY, radiusX, radiusY, color, scale) {
  const cx = centerX * scale;
  const cy = centerY * scale;
  const rx = radiusX * scale;
  const ry = radiusY * scale;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function strokeSegment(pixels, width, height, start, end, color, strokeWidth, scale) {
  const [startX, startY] = scaledPoint(start, scale);
  const [endX, endY] = scaledPoint(end, scale);
  const radius = (strokeWidth * scale) / 2;
  const vectorX = endX - startX;
  const vectorY = endY - startY;
  const lengthSquared = vectorX * vectorX + vectorY * vectorY;
  for (let y = Math.max(0, Math.floor(Math.min(startY, endY) - radius)); y <= Math.min(height - 1, Math.ceil(Math.max(startY, endY) + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(Math.min(startX, endX) - radius)); x <= Math.min(width - 1, Math.ceil(Math.max(startX, endX) + radius)); x += 1) {
      const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - startX) * vectorX + (y - startY) * vectorY) / lengthSquared));
      const dx = x - (startX + projection * vectorX);
      const dy = y - (startY + projection * vectorY);
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function strokePolygon(pixels, width, height, points, color, strokeWidth, scale) {
  for (let index = 0; index < points.length; index += 1) {
    strokeSegment(pixels, width, height, points[index], points[(index + 1) % points.length], color, strokeWidth, scale);
  }
}

function drawPolygon(pixels, width, height, points, fill, outline, strokeWidth, scale) {
  fillPolygon(pixels, width, height, points, fill, scale);
  strokePolygon(pixels, width, height, points, outline, strokeWidth, scale);
}

function drawEllipse(pixels, width, height, ellipse, fill, outline, strokeWidth, scale) {
  fillEllipse(pixels, width, height, ...ellipse, fill, scale);
  const [centerX, centerY, radiusX, radiusY] = ellipse;
  const outer = [centerX, centerY, radiusX + strokeWidth / 2, radiusY + strokeWidth / 2];
  const inner = [centerX, centerY, Math.max(0, radiusX - strokeWidth / 2), Math.max(0, radiusY - strokeWidth / 2)];
  fillEllipse(pixels, width, height, ...outer, outline, scale);
  fillEllipse(pixels, width, height, ...inner, fill, scale);
}

function downsample(source, sourceWidth, sourceHeight, scale) {
  const width = sourceWidth / scale;
  const height = sourceHeight / scale;
  const target = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < scale; sampleY += 1) {
        for (let sampleX = 0; sampleX < scale; sampleX += 1) {
          const sourceOffset = (((y * scale + sampleY) * sourceWidth) + x * scale + sampleX) * 4;
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += source[sourceOffset + channel];
        }
      }
      const targetOffset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) target[targetOffset + channel] = Math.round(totals[channel] / (scale * scale));
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

function createPoseGuidePng() {
  const scale = POSE_GUIDE_CONTRACT.renderScale;
  const width = POSE_GUIDE_CONTRACT.width * scale;
  const height = POSE_GUIDE_CONTRACT.height * scale;
  const pixels = createCanvas(width, height, COLORS.background);

  strokeSegment(pixels, width, height, [220, 902], [835, 902], COLORS.baseline, 8, scale);
  drawPolygon(pixels, width, height, REAR_ARM, COLORS.guideBlue, COLORS.outline, 13, scale);
  drawPolygon(pixels, width, height, REAR_FOOT, COLORS.guideBlue, COLORS.outline, 13, scale);
  drawPolygon(pixels, width, height, FRONT_FOOT, COLORS.guideBlue, COLORS.outline, 13, scale);
  drawPolygon(pixels, width, height, BODY, COLORS.guideBlue, COLORS.outline, 13, scale);
  drawEllipse(pixels, width, height, HEAD, COLORS.guideBlue, COLORS.outline, 13, scale);
  drawPolygon(pixels, width, height, HAT, COLORS.guideNavy, COLORS.outline, 13, scale);
  drawEllipse(pixels, width, height, HAT_BRIM, COLORS.guideNavy, COLORS.outline, 13, scale);
  drawPolygon(pixels, width, height, FRONT_ARM, COLORS.guideBlue, COLORS.outline, 13, scale);
  drawEllipse(pixels, width, height, [786, 471, 48, 43], COLORS.guideBlue, COLORS.outline, 13, scale);

  fillEllipse(pixels, width, height, 508, 422, 19, 24, COLORS.eye, scale);
  fillEllipse(pixels, width, height, 572, 429, 18, 23, COLORS.eye, scale);
  fillEllipse(pixels, width, height, 503, 415, 6, 8, COLORS.background, scale);
  fillEllipse(pixels, width, height, 567, 422, 6, 8, COLORS.background, scale);

  const [loomseedX, loomseedY] = POSE_GUIDE_CONTRACT.loomseedAnchor;
  drawEllipse(pixels, width, height, [loomseedX, loomseedY, 30, 30], COLORS.loomseedGold, COLORS.outline, 10, scale);
  drawEllipse(pixels, width, height, [loomseedX, loomseedY, 17, 17], COLORS.loomseedBlue, COLORS.outline, 6, scale);

  return encodePng(downsample(pixels, width, height, scale), POSE_GUIDE_CONTRACT.width, POSE_GUIDE_CONTRACT.height);
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const outputPath = path.join(repoRoot, POSE_GUIDE_CONTRACT.sourcePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, createPoseGuidePng());
  console.log(outputPath);
}

if (require.main === module) main();

module.exports = { POSE_GUIDE_CONTRACT, createPoseGuidePng };
