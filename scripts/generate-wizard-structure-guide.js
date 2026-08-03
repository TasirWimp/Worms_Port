const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const GUIDE_CONTRACT = Object.freeze({
  width: 1024,
  height: 1024,
  renderScale: 2,
  groundBaseline: Object.freeze([512, 902]),
  heldRelicSocket: Object.freeze([682, 586]),
  sourcePath: 'docs/images/art-direction/knotkin-wizard-structure-guide.png'
});

const COLORS = Object.freeze({
  background: [255, 255, 255, 255],
  outline: [31, 35, 72, 255],
  body: [76, 174, 224, 255],
  eye: [8, 12, 24, 255],
  eyeHighlight: [255, 255, 255, 255]
});

const BODY = Object.freeze([
  [320, 190],
  [590, 190],
  [680, 285],
  [655, 560],
  [575, 695],
  [535, 760],
  [365, 760],
  [325, 695],
  [235, 560],
  [210, 285]
]);

const REAR_ARM = Object.freeze([
  [260, 425],
  [205, 445],
  [165, 545],
  [205, 595],
  [285, 525]
]);

const FRONT_ARM = Object.freeze([
  [610, 425],
  [650, 445],
  [714, 535],
  [704, 596],
  [666, 616],
  [620, 548]
]);

const LEFT_FOOT = Object.freeze([
  [350, 748],
  [445, 748],
  [454, 902],
  [322, 902],
  [322, 790]
]);

const RIGHT_FOOT = Object.freeze([
  [480, 748],
  [565, 748],
  [610, 902],
  [478, 902]
]);

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

function scaledPoint(point, scale) {
  return [Math.round(point[0] * scale), Math.round(point[1] * scale)];
}

function fillPolygon(pixels, width, height, points, color, scale) {
  const scaled = points.map((point) => scaledPoint(point, scale));
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

function fillEllipse(pixels, width, height, centerX, centerY, radiusX, radiusY, color, scale) {
  const cx = centerX * scale;
  const cy = centerY * scale;
  const rx = radiusX * scale;
  const ry = radiusY * scale;
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(width - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(height - 1, Math.ceil(cy + ry));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function strokeSegment(pixels, width, height, start, end, color, strokeWidth, scale) {
  const [startX, startY] = scaledPoint(start, scale);
  const [endX, endY] = scaledPoint(end, scale);
  const radius = strokeWidth * scale / 2;
  const minX = Math.max(0, Math.floor(Math.min(startX, endX) - radius));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(startX, endX) + radius));
  const minY = Math.max(0, Math.floor(Math.min(startY, endY) - radius));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(startY, endY) + radius));
  const vectorX = endX - startX;
  const vectorY = endY - startY;
  const lengthSquared = vectorX * vectorX + vectorY * vectorY;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const projection = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - startX) * vectorX + (y - startY) * vectorY) / lengthSquared));
      const closestX = startX + projection * vectorX;
      const closestY = startY + projection * vectorY;
      const dx = x - closestX;
      const dy = y - closestY;
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function strokePolygon(pixels, width, height, points, color, strokeWidth, scale) {
  for (let index = 0; index < points.length; index += 1) {
    strokeSegment(
      pixels,
      width,
      height,
      points[index],
      points[(index + 1) % points.length],
      color,
      strokeWidth,
      scale
    );
  }
}

function drawPolygon(pixels, width, height, points, fill, outline, strokeWidth, scale) {
  fillPolygon(pixels, width, height, points, fill, scale);
  strokePolygon(pixels, width, height, points, outline, strokeWidth, scale);
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
          const sourceOffset = (((y * scale + sampleY) * sourceWidth) + (x * scale + sampleX)) * 4;
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += source[sourceOffset + channel];
        }
      }
      const targetOffset = (y * width + x) * 4;
      const sampleCount = scale * scale;
      for (let channel = 0; channel < 4; channel += 1) {
        target[targetOffset + channel] = Math.round(totals[channel] / sampleCount);
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
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND')
  ]);
}

function createGuidePng() {
  const scale = GUIDE_CONTRACT.renderScale;
  const sourceWidth = GUIDE_CONTRACT.width * scale;
  const sourceHeight = GUIDE_CONTRACT.height * scale;
  const pixels = createCanvas(sourceWidth, sourceHeight, COLORS.background);

  drawPolygon(pixels, sourceWidth, sourceHeight, REAR_ARM, COLORS.body, COLORS.outline, 14, scale);
  drawPolygon(pixels, sourceWidth, sourceHeight, LEFT_FOOT, COLORS.body, COLORS.outline, 14, scale);
  drawPolygon(pixels, sourceWidth, sourceHeight, RIGHT_FOOT, COLORS.body, COLORS.outline, 14, scale);
  drawPolygon(pixels, sourceWidth, sourceHeight, BODY, COLORS.body, COLORS.outline, 14, scale);
  drawPolygon(pixels, sourceWidth, sourceHeight, FRONT_ARM, COLORS.body, COLORS.outline, 14, scale);
  fillEllipse(pixels, sourceWidth, sourceHeight, 682, 586, 40, 38, COLORS.body, scale);
  fillEllipse(pixels, sourceWidth, sourceHeight, 682, 586, 40, 38, COLORS.outline, scale);
  fillEllipse(pixels, sourceWidth, sourceHeight, 682, 586, 31, 29, COLORS.body, scale);

  fillEllipse(pixels, sourceWidth, sourceHeight, 500, 354, 42, 48, COLORS.eye, scale);
  fillEllipse(pixels, sourceWidth, sourceHeight, 590, 362, 39, 45, COLORS.eye, scale);
  fillEllipse(pixels, sourceWidth, sourceHeight, 486, 338, 11, 13, COLORS.eyeHighlight, scale);
  fillEllipse(pixels, sourceWidth, sourceHeight, 577, 347, 10, 12, COLORS.eyeHighlight, scale);

  return encodePng(
    downsample(pixels, sourceWidth, sourceHeight, scale),
    GUIDE_CONTRACT.width,
    GUIDE_CONTRACT.height
  );
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const outputPath = path.join(repoRoot, GUIDE_CONTRACT.sourcePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, createGuidePng());
  console.log(outputPath);
}

if (require.main === module) main();

module.exports = { GUIDE_CONTRACT, createGuidePng };
