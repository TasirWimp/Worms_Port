# WP-023 V10 R6 Action And Impact Dynamics

Status: **Waypoint 1 refinements ready for the Phone Gate A correction pass**
Branch: `codex/v10-r6-action-impact-dynamics`  
Starting commit: `c0f63ec`

## Product change

WP-023 makes the accepted Volcanic Ruin match more mobile and action-oriented
without changing its terrain or weapon balance. The current server-backed
Practice and PEI-gated Daily paths use a new `nimble-knots-artillery-v10-r6`
identity. R6 keeps the exact R5 arena, openings, terrain mask, crater radii,
damage, projectile rules, Thread costs, shields, turn count and reward rules.

The package changes three coupled parts:

1. Present both shared Wizard actors at `0.40` animation scale and use a
   code-owned `44 x 68` direct-projectile target around the same ground root.
   The authoritative movement body remains the existing `24 x 24` body so
   terrain traversal stays stable.
2. Give each actor a 1,800-tick, 60-second action phase at 30 Hz. Movement and
   jumps may continue throughout the phase until the actor fires its single
   offensive shot. Projectile, settling and two-second retreat phases keep
   their existing bounds. Sixteen completed turns remain the match limit;
   the resulting combat and replay ceiling is 38,400 ticks.
3. Add deterministic explosion impulse and its settling behavior only after
   the first two changes pass physical-phone review. The impulse must derive
   from the authoritative impact, preserve replay equivalence and never alter
   terrain carving or damage.

R6 touch movement refreshes at 200 ms. Its 600 ms authority lease tolerates a
normal phone round trip while keeping a full 60-second hold below the existing
512-intent turn budget. The inherited Loomkeeper may continue refreshing at
its proven three-tick cadence and should act promptly rather than wait out the
larger action clock.

The first physical Phone Gate A accepted sustained movement and the 200 ms
refresh behavior, then requested three corrections. R6 therefore uses compact
actor-attached health bars whose remaining fill changes continuously from
green through yellow to red, raises ordinary walking from 256 to 320
fixed-point units per tick, and adds a dedicated 48 px **Hop** action. A held
left movement pointer stays owned while Hop is tapped and supplies bounded
horizontal aftertouch during the committed jump. Vertical impulse, gravity,
terrain collision and the reinforced Threadleap remain unchanged.
The R6 action strip keeps Actions, Hop and Use in one centered row in both the
default sideways phone composition and the supported portrait opt-out.

This control choice follows the current mobile reference rather than adding a
third simultaneous gesture. Team17's Worms W.M.D Mobilize uses an explicit
forward-jump control and lets held left/right input influence jump direction
and distance through aftertouch. Apple's game-control guidance places movement
on the left, keeps frequent virtual controls at least 44 by 44 points, and
recommends reducing awkward simultaneous button sequences. Pointer ownership
continues to use independent Pointer Events IDs and per-control pointer capture
as defined by the web standard.

References:

- https://www.team17.com/news/worms-w-md-mobilize-out-now-on-apple-android
- https://developer.apple.com/design/human-interface-guidelines/game-controls
- https://www.w3.org/TR/pointerevents/#pointer-capture

R5 remains available only for explicit simulation and local-preview diagnosis.
It is excluded from ordinary feature, quality and release acceptance along
with the already retired V7/V8/V9 profiles.

## Waypoints and phone gates

### Waypoint 1 — scale, target and action clock

Implement the R6 identity, unchanged volcanic arena and weapon table, compact
presentation/target, 60-second action clock, mobile refresh lease, replay
bounds and current Practice/Daily protocol identity. Automated review must
cover deterministic R5/R6 terrain equality, exact timing boundaries, a long
touch-style hold, one-shot enforcement, compact collision behavior, live
protocol ownership, build/smoke and the supported phone browser journey.

**Phone Gate A** uses ordinary wallet-free Practice at `/`:

1. Confirm the volcanic arena and background still load with the familiar
   starting positions.
2. Confirm both actors are visibly smaller, remain grounded and have status
   cards attached to the correct actor.
3. Confirm the action clock begins at about 60 seconds.
4. Hold movement for at least 15 seconds, release, jump and move again; movement
   must stay continuous and responsive without lease stutter.
5. Fire one relic, confirm the familiar crater/damage behavior, then use the
   existing two-second retreat window. A second offensive shot in the same
   turn must remain unavailable.
6. Confirm the Loomkeeper responds normally, then reload/resume and start a
   fresh Practice match.

Do not advance until the owner accepts Phone Gate A.

### Waypoint 2 — explosion impulse

Add the bounded R6-only authoritative impulse, grounded launch, air movement,
terrain collision and deterministic settling. Preserve the accepted Waypoint
1 scale, timing and weapon/terrain behavior.

**Phone Gate B** repeats the Practice journey and checks direct, edge and
terrain-adjacent explosions from both sides. Actors must move in the expected
direction, settle reliably and never tunnel, hover, jitter or leave controls
owned after impact. Do not advance until the owner accepts Phone Gate B.

### Waypoint 3 — complete product journey

Review the accepted R6 mechanics through standard Practice and the existing
wallet/PEI receipt/Daily/reward lifecycle. Update current-path documentation,
selected checks and release evidence. Do not broaden helper issuance, Daily
eligibility or reward economics.

**Phone Gate C** runs one wallet-free Practice and one available PEI-gated
Daily. It confirms receipt consumption only when Daily starts, the same R6
match behavior in both modes, reconnect continuity, a terminal result and the
existing payout behavior for an eligible win. The helper may remain paused
until the Daily receipt is actually needed.

## Verification policy

The primary assistant owns implementation, coverage selection and direct
review. The configured `worms_port_test_runner` executes the explicit plan.
Start with `npm run verify:changes -- --dry-run --base c0f63ec`; preserve all
passing unchanged-input results. After a failure, reproduce the smallest
affected case and rerun only the affected phase when the selector fingerprint
and build proof have not changed. Do not repeat the full selector for an
infrastructure-looking failure without changed inputs, a changed plan or
evidence of cross-phase contamination. The 22:00 Europe/Berlin daily suite and
Ubuntu visual-baseline workflow retain their existing cadence.
