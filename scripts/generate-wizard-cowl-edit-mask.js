const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MASK_CONTRACT = Object.freeze({
  width: 1024,
  height: 1024,
  renderScale: 4,
  sourcePath: 'docs/images/art-direction/knotkin-wizard-cowl-edit-mask.png',
  baseEvidenceSha256: 'DEF9265DAA4C6F2799D16870205E2015291E3E4AAE0F61802349C9FD8D56AD00',
  geometryEvidenceSha256: '5FF0A63DAC03E13B2A3390AD77E6929A9822412E1A1E0415E7A38125D703B246'
});

// White is editable. The outer polygon includes enough white-background halo
// for a head-worn cowl to extend above B2D's crown. The black face island keeps
// the accepted eyes, eyebrows, and mouth out of the sampled and composited edit.
const EDITABLE_COWL_REGION = Object.freeze([
  [230, 580],
  [224, 410],
  [218, 300],
  [252, 208],
  [320, 136],
  [635, 136],
  [718, 190],
  [770, 294],
  [772, 430],
  [750, 545],
  [700, 590],
  [650, 610],
  [300, 610],
  [255, 590]
]);

const PROTECTED_FACE_ISLAND = Object.freeze([
  [394, 222],
  [627, 218],
  [692, 272],
  [711, 390],
  [662, 506],
  [404, 516],
  [332, 454],
  [326, 318]
]);

const BLACK = Object.freeze([0, 0, 0, 255]);
const WHITE = Object.freeze([255, 255, 255, 255]);

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

function fillPolygon(pixels, width, height, points, color, scale) {
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

function downsample(source, sourceWidth, sourceHeight, scale) {
  const width = sourceWidth / scale;
  const height = sourceHeight / scale;
  const target = Buffer.alloc(width * height * 4);
  const sampleCount = scale * scale;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      for (let sampleY = 0; sampleY < scale; sampleY += 1) {
        for (let sampleX = 0; sampleX < scale; sampleX += 1) {
          const sourceOffset = (((y * scale + sampleY) * sourceWidth) + (x * scale + sampleX)) * 4;
          red += source[sourceOffset];
        }
      }
      const value = Math.round(red / sampleCount);
      const targetOffset = (y * width + x) * 4;
      target[targetOffset] = value;
      target[targetOffset + 1] = value;
      target[targetOffset + 2] = value;
      target[targetOffset + 3] = 255;
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

function createMaskPng() {
  const scale = MASK_CONTRACT.renderScale;
  const sourceWidth = MASK_CONTRACT.width * scale;
  const sourceHeight = MASK_CONTRACT.height * scale;
  const pixels = createCanvas(sourceWidth, sourceHeight, BLACK);

  fillPolygon(pixels, sourceWidth, sourceHeight, EDITABLE_COWL_REGION, WHITE, scale);
  fillPolygon(pixels, sourceWidth, sourceHeight, PROTECTED_FACE_ISLAND, BLACK, scale);

  return encodePng(
    downsample(pixels, sourceWidth, sourceHeight, scale),
    MASK_CONTRACT.width,
    MASK_CONTRACT.height
  );
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const outputPath = path.join(repoRoot, MASK_CONTRACT.sourcePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, createMaskPng());
  console.log(outputPath);
}

if (require.main === module) main();

module.exports = {
  EDITABLE_COWL_REGION,
  MASK_CONTRACT,
  PROTECTED_FACE_ISLAND,
  createMaskPng
};
