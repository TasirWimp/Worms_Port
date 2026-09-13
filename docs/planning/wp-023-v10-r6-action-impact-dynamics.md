# WP-023 V10 R6 Action And Impact Dynamics

Status: **Waypoint 1 movement-button refinement ready for Phone Gate A**
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

The shorter arc passed the next phone review, but repeated jumps exposed an
inherent limit in the dynamic thumbstick: the user had to find its original
neutral point before another upward displacement could be recognized. Rebasing
that origin after every jump would instead make the control walk upward through
its finite screen region. The owner selected the mobile Worms arrangement of
fixed left, right and up/jump buttons.

R6 now uses the same small green-through-yellow-to-red bar for actor-attached
and off-screen status. The off-screen card remains inside a 76 by 48 px touch
target. Walking rises from 320 to 336 fixed-point units per tick. The left
movement region now contains three fixed, non-overlapping targets of at least
48 by 48 px: jump above, with left and right below. Holding either direction
walks and supplies the same bounded airborne acceleration. The thumb may slide
from a direction through jump and into either direction for aftertouch; gaps do
not discard the last held direction, while lifting or an interrupted capture
releases it. Each fresh entry into jump can buffer for 250 ms before landing.
The fixed controls remove origin lookup, re-centering and cumulative drift.
The ordinary R6 jump impulse changes from
`-2048` to `-1728` fixed-point units. With the inherited 64-unit gravity, its
unobstructed arc falls from about 2.10 to 1.77 seconds and from about 124 to 88
world units at the apex. Terrain collision and reinforced Threadleap stay
unchanged. The action strip remains Actions and Use.

Apple's controller guidance separates continuous directional movement from a
discrete jump action. Team17's Worms W.M.D Mobilize applies that arrangement on
touch with left/right movement, a separate jump control and directional
aftertouch. Celeste's creator identifies a short pre-landing jump buffer as one
of its moment-to-moment forgiveness techniques. The R6 control applies those
patterns to the existing deterministic Worms-style authority while allowing a
single thumb to slide across the cluster. Pointer ownership continues to use
Pointer Events capture as defined by the web standard.

References:

- https://www.team17.com/news/worms-w-md-mobilize-out-now-on-apple-android
- https://developer.apple.com/library/archive/documentation/ServicesDiscovery/Conceptual/GameControllerPG/IncorporatingControllersintoYourDesign/IncorporatingControllersintoYourDesign.html
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
4. Confirm the left movement cluster has separate blue left, right and up/jump
   buttons with comfortable gaps and no Hop action in the centre strip. Hold a
   direction to walk, slide the same thumb to jump, then slide into either
   direction in flight for an accurate landing. Repeat several walk/jump cycles
   without searching for a neutral origin and also try direct taps on all three
   targets. Confirm each target is easy to distinguish, landing corrections
   react promptly, a near-landing jump remains buffered, and releasing the
   cluster stops movement. The accepted walking pace and shorter arc remain.
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
