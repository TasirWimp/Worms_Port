const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { decodePng } = require('../../scripts/compare-character-silhouettes');
const {
  createMatteRgba,
  encodeRgbaPng,
  loadConfig,
  resampleRgba,
  retainLargestVisibleComponent,
  sha256,
  verifySource
} = require('../../scripts/normalize-character-master');

function createImage(width, height, rgb = [255, 255, 255]) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 3] = rgb[0];
    pixels[index * 3 + 1] = rgb[1];
    pixels[index * 3 + 2] = rgb[2];
  }
  return { width, height, channels: 3, pixels };
}

function setRgb(image, x, y, rgb) {
  const offset = (y * image.width + x) * image.channels;
  image.pixels[offset] = rgb[0];
  image.pixels[offset + 1] = rgb[1];
  image.pixels[offset + 2] = rgb[2];
}

function alphaAt(image, x, y) {
  return image.pixels[(y * image.width + x) * 4 + 3];
}

const matteConfig = {
  background_rgb: [255, 255, 255],
  hard_foreground_threshold: 24,
  soft_edge_low_threshold: 4,
  soft_edge_high_threshold: 24,
  soft_edge_radius_pixels: 1,
  component_connectivity: 8,
  preserve_enclosed_holes_max_y: 6,
  ground_shadow_exclusion: {
    start_y: 7,
    hard_minimum_blue_excess: 32,
    soft_minimum_blue_excess: 12
  }
};

test('Wizard matte keeps the connected blue subject and rejects its neutral floor shadow', () => {
  const image = createImage(10, 10);
  for (let y = 2; y <= 6; y += 1) {
    for (let x = 2; x <= 6; x += 1) setRgb(image, x, y, [40, 110, 210]);
  }
  setRgb(image, 4, 4, [255, 255, 255]);
  setRgb(image, 1, 4, [244, 248, 252]);
  setRgb(image, 3, 7, [50, 110, 210]);
  setRgb(image, 4, 7, [100, 100, 100]);
  setRgb(image, 9, 9, [200, 20, 20]);

  const result = createMatteRgba(image, matteConfig);
  assert.equal(result.hard.componentCount, 1);
  assert.equal(result.hard.discardedPixels, 0);
  assert.equal(alphaAt(result.image, 4, 4), 255, 'enclosed source highlight must stay opaque');
  assert.equal(alphaAt(result.image, 3, 7), 255, 'blue foot pixel must stay attached');
  assert.equal(alphaAt(result.image, 4, 7), 0, 'neutral contact shadow must be removed');
  assert.equal(alphaAt(result.image, 9, 9), 0, 'disconnected source fragment must be removed');
  assert.ok(alphaAt(result.image, 1, 4) > 0 && alphaAt(result.image, 1, 4) < 255,
    'adjacent pale-blue edge must receive partial alpha');
});

test('RGBA PNG encoding and exact-source verification are byte deterministic', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wormsport-normalizer-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const pixels = Buffer.from([
    10, 20, 30, 255, 0, 0, 0, 0,
    40, 50, 60, 128, 70, 80, 90, 255
  ]);
  const encoded = encodeRgbaPng({ width: 2, height: 2, channels: 4, pixels });
  assert.deepEqual(encoded, encodeRgbaPng({ width: 2, height: 2, channels: 4, pixels }));
  const sourcePath = path.join(directory, 'source.png');
  fs.writeFileSync(sourcePath, encoded);
  const sourceConfig = {
    source: {
      bytes: encoded.length,
      sha256: sha256(encoded),
      width: 2,
      height: 2,
      channels: 4
    }
  };
  const verified = verifySource(sourcePath, sourceConfig);
  assert.equal(verified.digest, sourceConfig.source.sha256);
  assert.deepEqual(decodePng(sourcePath).pixels, pixels);
  assert.throws(
    () => verifySource(sourcePath, { source: { ...sourceConfig.source, sha256: '0'.repeat(64) } }),
    /expected SHA-256/
  );
});

test('resampling is uniform-only and post-resize cleanup removes ringing islands', () => {
  const source = {
    width: 2,
    height: 2,
    channels: 4,
    pixels: Buffer.from([
      20, 60, 200, 255, 20, 60, 200, 255,
      20, 60, 200, 255, 20, 60, 200, 255
    ])
  };
  assert.throws(
    () => resampleRgba(source, 4, 4, {
      scale_x: 2,
      scale_y: 1,
      translate_x: 0,
      translate_y: 0
    }, { b: 1 / 3, c: 1 / 3 }),
    /Non-uniform resampling is blocked/
  );

  const pixels = Buffer.alloc(5 * 5 * 4);
  for (const [x, y] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
    const offset = (y * 5 + x) * 4;
    pixels[offset] = 20;
    pixels[offset + 1] = 60;
    pixels[offset + 2] = 200;
    pixels[offset + 3] = 255;
  }
  pixels[(0 * 5 + 4) * 4 + 3] = 1;
  const cleaned = retainLargestVisibleComponent({ width: 5, height: 5, channels: 4, pixels });
  assert.equal(cleaned.removedPixels, 1);
  assert.equal(alphaAt(cleaned.image, 4, 0), 0);
});

test('frozen B2H configuration binds one source and blocks generation and runtime integration', () => {
  const { config } = loadConfig();
  assert.equal(config.id, 'wp-015b2h-wizard-v1');
  assert.equal(config.source.sha256,
    '40F9E81254A0792B967889808BD8BD8DE33DBDE5EAB7C4CBB1B336DD02BC54A5');
  assert.deepEqual(config.geometry.master.ground_pivot, [256, 451]);
  assert.deepEqual(config.geometry.master.visible_palm_socket, [407, 228]);
  assert.ok(config.boundaries.blocked.includes('inference'));
  assert.ok(config.boundaries.blocked.includes('runtime integration'));
  assert.match(config.outputs.approved_master_path, /^assets\/masters\//);
});
