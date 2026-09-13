# WP-023 V10 R6 Action And Impact Dynamics

Status: **Waypoint 1 third refinements ready for Phone Gate A**
Branch: `codex/v10-r6-action-impact-dynamics`  
Starting commit: `c0f63ec`

## Product change

WP-023 makes the accepted Volcanic Ruin match more mobile and action-oriented
without changing its terrain or weapon balance. The current server-backed
Practice and PEI-gated Daily paths use a new `nimble-knots-artillery-v10-r6`
identity. R6 keeps the exact R5 arena, openings, terrain mask, crater radii,
damage, projectile rules, Thread costs, shields, turn count and reward rules.
Its player opening inventory is 5 Thread so every release Relic is available
on the first turn; R5 keeps its frozen 3-Thread opening.

The current V10 coordinator also excludes each measured Loomkeeper planning
batch from the real-time debt anchors of all active matches. Logical planning
ticks already charge that work to the acting match; charging the same internal
server work as scheduler delay to peer matches could stop a valid Clash under
concurrent load. Unmeasured event-loop stalls continue to accrue normally.

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
refresh behavior, then requested compact actor-attached health bars, faster
walking and jump aftertouch. The second pass accepted those health bars while
actors are visible, requested the same compact display on off-screen focus
controls, another 5 percent walking increase and one movement control instead
of a separate Hop button. It also confirmed that Spoolburst was still
unavailable to the player at the opening 3-Thread inventory.

The third pass accepted the presentation, walking pace, first-turn Spoolburst
and the complete fire/retreat/Loomkeeper/restart journey. One held-thumb
walk-and-jump worked, but the next jump incorrectly required releasing and
retouching the movement region. The ordinary jump also interrupted play too
long and rose slightly too high.

R6 now uses the same small green-through-yellow-to-red bar for actor-attached
and off-screen status. The off-screen card remains inside a 76 by 48 px touch
target. Walking rises from 320 to 336 fixed-point units per tick. The full
left movement region behaves as a dynamic thumbstick: contact establishes its
visual origin, a sideways drag walks, and a 16 px upward commitment jumps
without releasing. Once committed, horizontal steering is measured from the
jump position with a 6 px threshold and 24 fixed-point acceleration. This
allows quick landing corrections while retaining bounded authority physics.
Returning the held thumb to a 6 px vertical reset band rearms the next jump;
another upward commitment can buffer for 250 ms before landing and fires as
soon as authoritative ground contact arrives. Each accepted jump rebases air
steering at its own launch position. The ordinary R6 jump impulse changes from
`-2048` to `-1728` fixed-point units. With the inherited 64-unit gravity, its
unobstructed arc falls from about 2.10 to 1.77 seconds and from about 124 to 88
world units at the apex. Terrain collision and reinforced Threadleap stay
unchanged. The action strip remains Actions and Use.

Apple's current guidance places movement on the left, gives touch movement a
large input region and recommends combining related functionality in one
control. Its touch-game session demonstrates embedding another action in a
thumbstick through the gesture magnitude. Team17's Worms W.M.D Mobilize also
allows held left/right input to influence jump direction and distance through
aftertouch. Celeste's creator identifies a short pre-landing jump buffer as one
of its moment-to-moment forgiveness techniques. The R6 control applies those
patterns to the existing deterministic Worms-style authority. Pointer ownership
continues to use independent Pointer Events IDs and per-control pointer capture
as defined by the web standard.

References:

- https://www.team17.com/news/worms-w-md-mobilize-out-now-on-apple-android
- https://developer.apple.com/design/human-interface-guidelines/game-controls
- https://developer.apple.com/videos/play/wwdc2026/358/
- https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html
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
2. Confirm both actors are visibly smaller, remain grounded and have compact
   color health bars attached to the correct actor. Pan until an actor is off
   screen and confirm its edge control also uses the small bar without a large
   number while remaining easy to tap.
3. Confirm the action clock begins at about 60 seconds.
4. Confirm there is no Hop button. Touch anywhere comfortable in the left blue
   movement region, drag sideways to walk, then push upward without lifting to
   jump. Make small left/right changes around that launch position in flight.
   Return toward the horizontal walk band and push upward again before or after
   landing; repeat several walk/jump cycles without lifting the thumb. Confirm
   landing corrections react promptly, the next jump is buffered near landing,
   and the lower, shorter ordinary arc restores the playing rhythm without lease
   stutter. The walking pace remains the accepted 5 percent refinement.
5. Open Actions > Attack and confirm Spoolburst can be selected on the first
   turn with the displayed 5 Thread. Fire one relic, confirm the familiar
   crater/damage behavior, then use the existing two-second retreat window. A
   second offensive shot in the same turn must remain unavailable.
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
