# WP-015D3A Frozen Action-Turn Behavior Record

Status: frozen reference-observation handoff, 2026-09-02; no implementation.

Observer: Codex primary /root reference-observer 2026-09-02.
Reference identity: public `lorgan3/sorcerers`, commit
`0f45c4920321c0a3a14de30fe5cf44131a38da89`.

This handoff distills the preceding source-based reference investigation. No
game session, player observation, interview, device session, or timing
collection was performed. These are source-supported descriptions of intended
observable behavior, not measured runtime results or a fairness finding.

## Behavior-level reference observations

| Player input or event | Observable behavior or transition |
| --- | --- |
| Hold a directional movement control during the controlled turn | The active actor can continue walking while directional intent is held; movement is not a single displacement committed only on release. |
| Release directional control | Walking intent ends; this does not imply that airborne motion or every other physical motion ends immediately. |
| Request a jump in a legal grounded situation | The actor leaves the supporting ground and can land on terrain; jumping makes terrain relief part of movement choice. |
| Time elapses during an active turn | Available action time decreases. Movement takes place within a timed turn rather than consuming a visible fixed walking-distance allowance. |
| Use a turn-ending attack | The turn proceeds through attack resolution and a bounded end-of-turn interval before control passes on. Remaining movement can permit repositioning; the exact behavior depends on the attack/state. |
| The turn ends | Control transfers to the next active actor. The game remains turn-based, not simultaneous real-time combat. |

The reference does not establish that every attack has identical retreat
semantics, that a post-cast move can evade an already resolved hit, or that
these features remove first-actor advantage. No source-specific duration,
movement speed, jump formula, cost table, or internal state machine is supplied.

## Independent product requirements, not reference observations

The following are owner-approved Worms_Port design intentions. Implement them
independently from the MIT product baseline and the separately reviewed V8
contract; they are not claims about the reference implementation.

- Keep timed, alternating turns against the deterministic AI Loomkeeper.
- Replace V7's distance-budget interaction with hold-to-walk, release-to-stop
  intent and a touch-friendly jump. Keep free facing and explicit Fire.
- Use one offensive cast followed, for a surviving active actor in an ongoing
  match, by a short movement-only retreat. No second cast during retreat.
- Resolve the shot before retreat in the initial candidate. Retreat changes
  the next firing position; it is not a reaction that retroactively cancels
  already committed damage.
- Begin with the existing three Relics, their V5 combat tuning, V7 terrain and
  starting positions, and one actor per side. Resources, new weapons,
  defensive/mobility utilities, redesigned maps, and teams belong to later
  versions, not the V8 movement pilot.
- Use server-authoritative deterministic fixed ticks and bounded integer
  state. The client sends intent, never authoritative position or elapsed time.
- Stop held intent on cancellation, interruption, lost connection, and phase
  change; a server-owned bounded input lease must also stop lost releases.
- Require a fresh gesture after reconnect/resume. No input crosses a turn,
  challenge, pause, or terminal boundary.
- Freeze product-authored numerical parameters and exhaustive phase rules
  before implementation. Do not obtain them from reference constants.
- Introduce explicit versioned state/protocol/replay handling and a new AI
  policy where needed. Preserve V1 through V7 behavior and reward-mode pinning.

## Exclusions and implementer boundary

No reference source code, algorithms, identifiers, data structures, file
layout, formulas, constants, parameter tables, tests, map bytes, assets, or
expressive sequences may be copied. The implementer receives this record and
Worms_Port's own contract/code/tests, not the observer's transcript, reference
source, or quarantine. A distinct reviewer evaluates boundary compliance.

No Stage C, Lane M, or prior analytical result is imported as player evidence.
Lane G begins and remains at no player-observation evidence. This handoff
claims neither balance nor player-visible credible response, D2O satisfaction,
ProductAuthority, placement, P5, landfall, or marketing readiness.
