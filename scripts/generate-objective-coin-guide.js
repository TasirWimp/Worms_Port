const fs = require('node:fs');
const path = require('node:path');

const { encodeRgbaPng, sha256 } = require('./normalize-character-master.js');

const SIZE = 1024;
// This is a project-authored flat-top hexagon, deliberately wider than the
// official Nimiq mark and with unrounded vertices. It is a generic coin guide,
// not a logo or a reconstruction of any third-party geometry.
const VERTICES = Object.freeze([
  [256, 176], [768, 176], [944, 512], [768, 848], [256, 848], [80, 512]
]);
const OUTPUT = path.join(__dirname, '..', 'docs', 'images', 'art-direction', 'objectives',
  'generic-amber-hex-coin-guide-v1.png');

function pointInPolygon(x, y, vertices = VERTICES) {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const [x1, y1] = vertices[index];
    const [x2, y2] = vertices[previous];
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function createGuide() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4, 255);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!pointInPolygon(x + 0.5, y + 0.5)) continue;
      const offset = (y * SIZE + x) * 4;
      const highlight = Math.max(0, 1 - Math.hypot(x - 430, y - 360) / 680);
      pixels[offset] = Math.round(190 + 35 * highlight);
      pixels[offset + 1] = Math.round(119 + 46 * highlight);
      pixels[offset + 2] = Math.round(30 + 13 * highlight);
    }
  }
  return { width: SIZE, height: SIZE, channels: 4, pixels };
}

function writeGuide(output = OUTPUT) {
  const bytes = encodeRgbaPng(createGuide());
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes);
  return { output, bytes: bytes.length, sha256: sha256(bytes), width: SIZE, height: SIZE, vertices: VERTICES };
}

if (require.main === module) console.log(JSON.stringify(writeGuide(process.argv[2] || OUTPUT), null, 2));

module.exports = { SIZE, VERTICES, pointInPolygon, createGuide, writeGuide };
