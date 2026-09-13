# WP-015D2Z Frozen Terrain And Placement Behavior Record

Status: frozen reference-observation record, 2026-09-01.

This record contains only behavior-level observations that may be handed to a
clean-room implementation worker. It is not a player-observation session, a
source-code specification, an asset source, or permission to copy an
implementation. The observer inspected the public `lorgan3/sorcerers`
reference at pinned commit `0f45c4920321c0a3a14de30fe5cf44131a38da89`.

## Frozen observable behavior

- A side-view artillery battlefield can present more than one supported actor
  location and more than one useful elevation within a single match.
- Actors begin above solid terrain with visible clearance from the terrain and
  from each other; unusable or occupied candidate positions are not selected.
- Connected traversable ground gives the opening actors local movement choices
  without requiring a lethal gap crossing.
- Terrain relief can create distinct low, high, and intervening positions that
  change the visible firing problem without requiring a separate obstacle
  object.
- A battlefield with broad supported surfaces is a more credible first
  gameplay stage than separated islands when the available movement has no
  jump, ladder, or bridge action.
- Terrain and starting positions must be evaluated together. A supported point
  alone is insufficient when the surrounding route is unusable or the opening
  pair is badly separated.
- Multiple candidate locations may exist for one battlefield. Selection should
  reject invalid geometry before choosing the opening pair.
- The reference does not establish balanced, fair, deterministic, or
  role-symmetric placement. Those are Worms_Port product requirements and must
  be specified and tested independently.

## Product-authored boundary supplied with the handoff

The V7 implementation must be derived from Worms_Port's own V6 authority and
the following product constraints, not from reference internals:

- preserve exact V1 through V6 replay identity and behavior;
- use deterministic integer-only generation with no wall clock or unseeded
  randomness;
- keep the current single-valued, surface-only packed-terrain representation;
- keep every adjacent route step within the existing V6 movement climb bound;
- derive both actor starts from the generated terrain;
- require body-clear support, safe world margins, bidirectional opening
  movement, continuous reachability, bounded opening height difference, and a
  target opening separation of 640 world units;
- retain the V5 Relic ranges/damage and V6 movement semantics unchanged; and
- introduce no cave, tunnel, ladder, island gap, water, obstacle, prop, asset,
  telemetry, reward, or player-observation dependency.

## Explicit exclusions

No reference algorithms, constants, identifiers, file layout, data structure,
randomness scheme, map bytes, source code, tests, expressive sequence, or
asset may be used. Historical Stage C or Lane M evidence is not input. This
record makes no claim that the reference is balanced and no claim that V7 will
be finally balanced, fun, market-ready, or D2O-satisfying.
