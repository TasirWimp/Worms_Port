# WP-023 Frozen Sorcerers Action And Impact Behavior Record

Status: frozen reference-observation handoff, 2026-09-13; implementation is
independent and in progress.

Observer: Codex primary single-owner reference observer.
Reference identity: public `lorgan3/sorcerers`, commit
`0f45c4920321c0a3a14de30fe5cf44131a38da89`.

This record distills the read-only reference investigation that preceded the
owner-approved WP-023 design. It records observable behavior only. It contains
no reference code, formulas, algorithms, constants, data structures, map data
or assets.

## Behavior-level observations

- Combatants occupy a relatively small part of the visible world. Terrain
  relief, ledges, gaps and carved openings therefore create meaningful routes
  and obstacles around them.
- Walking and jumping happen within a timed active turn. The controlled actor
  can spend the available time repositioning before committing an attack; the
  match remains alternating-turn combat.
- Explosions can displace combatants as well as damage and carve terrain. The
  displacement makes an impact's direction and nearby terrain or open space
  matter to the resulting position.

These observations do not establish a commercially suitable balance, an exact
turn duration, any actor size, collision rectangle, blast force, fall rule,
weapon table, AI policy or network protocol for NIMble Knots.

## Independent NIMble Knots decisions

The owner-approved WP-023 values and transitions are product decisions:

- animation presentation scale `0.40`, direct target `44 x 68`, and the
  retained `24 x 24` terrain-movement body;
- a 1,800-tick action at the existing 30 Hz authority rate, one offensive shot,
  the retained projectile/settling/two-second retreat phases, sixteen turns and
  the derived 38,400-tick combat/replay ceiling;
- a 200 ms client refresh, 600 ms R6 movement lease and existing 512-intent
  turn budget; and
- the later R6-only deterministic impulse rules, which remain unimplemented
  until Phone Gate A passes.

All terrain bytes, weapon values, reward rules and PEI behavior come from the
existing MIT product and owner-approved local contracts.

## Implementation boundary

Implementation uses the existing Worms_Port V10 code, this behavior record and
the [WP-023 contract](../planning/wp-023-v10-r6-action-impact-dynamics.md).
Sorcerers source code, identifiers, file layout, algorithms, constants, tests,
maps and assets are excluded. The primary assistant performs a direct
source-boundary review before package closure; this is single-owner review and
is not claimed as independent clean-room separation.
