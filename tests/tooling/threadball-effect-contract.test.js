const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT, 'scripts/asset-normalization/wp-015b3c-threadball-effects-v1.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function fileHash(relativePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, relativePath)))
    .digest('hex')
    .toUpperCase();
}

test('B3C Threadball effect contract binds only approved presentation inputs and preserves authority', () => {
  const config = readConfig();
  assert.equal(config.schema_version, 1);
  assert.equal(config.id, 'wp-015b3c-threadball-effects-v1');
  assert.equal(config.inputs.wizard_loomseed_presentation.sha256,
    '1CC252B45C93D2553AC733DAA6AA49D05D6351DCC85E61EA559ECED458C9419C');
  assert.equal(fileHash(config.inputs.wizard_loomseed_presentation.path),
    config.inputs.wizard_loomseed_presentation.sha256);
  assert.deepEqual(config.inputs.wizard_loomseed_presentation.root_space_emission_offset, [151, -223]);
  assert.deepEqual(config.event_binding.normal_order, [
    'existing_loomkeeper_aim_when_applicable',
    'threadball-cast-charge',
    'threadball-cast-formation',
    'existing-authoritative-projectile',
    'existing-authoritative-impact'
  ]);
  assert.deepEqual(config.event_binding.reduced_motion_order, config.event_binding.normal_order);
  for (const stage of Object.values(config.inputs.threadball_stages)) {
    assert.deepEqual(stage.local_visual_origin, [32, 32]);
    assert.match(stage.sha256, /^[A-F0-9]{64}$/);
    assert.equal(fileHash(stage.path), stage.sha256);
  }
  assert.match(config.event_binding.authority_rule, /must not alter launch origin, collision, damage/i);
});

test('B3C Threadball effect contract keeps motion bounded and blocks synthesis and gameplay mutation', () => {
  const config = readConfig();
  const normal = config.timing_ms.normal;
  const reduced = config.timing_ms.reduced_motion;
  for (const key of Object.keys(normal)) {
    assert.ok(reduced[key] < normal[key], `${key} must be shorter under reduced motion.`);
  }
  assert.equal(normal.cast_charge + normal.cast_formation, 200);
  assert.equal(reduced.cast_charge + reduced.cast_formation, 70);
  assert.equal(config.procedural_effects.cast_charge.limits.thread_stroke_count_max, 3);
  assert.equal(config.procedural_effects.flight_tail.limits.trace_segments_max, 3);
  assert.equal(config.procedural_effects.impact_unravel.limits.loop_count_max, 4);
  assert.equal(config.procedural_effects.impact_unravel.limits.damage_radius_coupling, 'forbidden');
  for (const blocked of [
    'new raster asset generation',
    'source-master modification',
    'damage-radius visual scaling',
    'collision or terrain authority',
    'simulation or replay mutation',
    'WP-015C runtime integration in this B3C contract'
  ]) assert.ok(config.boundaries.blocked.includes(blocked));
});
