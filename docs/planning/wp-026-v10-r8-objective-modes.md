# WP-026 V10 R8 Objective Modes

Status: **active; Waypoints 1-2 and Phone Gates A-B complete; Waypoint 3 implementation and automated checks complete; Phone Gate C passes on phone and awaits the focused larger-tablet motion recheck**

Required predecessor: completed WP-024 R7 promotion and completed WP-025
lifecycle and power hardening

## Product outcome

WP-026 turns the accepted Volcanic Ruin battlefield into an objective space.
The player can choose Defend, Collect or Claim. Movement, destructible routes,
cover, displacement and direct damage remain useful, while each mode supplies a
goal beyond eliminating the other actor.

The package introduces `nimble-knots-artillery-v10-r8`. It inherits the exact
accepted R7 arena, controls, 60-second action phase, Relics, crater sizes,
Stitching, Thread economy and one-life combat. It adds only objective entities,
objective-specific terminal rules, a deterministic objective-aware Loomkeeper
and the UI needed to play and understand the modes. R7 replay truth is immutable.

WP-026 must be operational without Gemini. It closes on a server-backed R8
Practice canary with deterministic replay and resume. R7 remains the standard
Practice and Daily ruleset until WP-027 completes the later selector and final
promotion gate.

## Frozen identities and vocabulary

- ruleset: `nimble-knots-artillery-v10-r8`;
- objective layout recipe: `volcanic-ruin-objectives-r1`;
- automation: `wp-026-v10-r8-objectives-v1`;
- deterministic policy: `nimble-knots-loomkeeper-v6`;
- objective modes: `defend`, `collect`, `claim`;
- challenge kind remains the existing `practice` or `reward` value.

The wire and server must use `objectiveMode` for the gameplay choice. Existing
`mode` fields keep their Practice/reward meaning and must not be overloaded.
The selected objective mode is immutable after challenge creation.

## Waypoint 1 Collect coin presentation contract

Waypoint 1 may replace only the Collect-mode round procedural coin with one
static, original amber textile hexagonal coin. It is a generic flat-top
six-sided game collectible, not the Nimiq logo: the contract prohibits Nimiq
name/marks, official paths, official pixels, cryptocurrency symbols, wallet UI,
text, watermark, or a claim of Nimiq brand identity. Defend and Claim chest
presentation remains unchanged. The exact project-owned geometry guide is
documentation-only and may condition one local-loopback ComfyUI FLUX.2 Klein
reference edit at seed `26026001`; it has deliberately distinct 1.2-ratio,
unrounded generic geometry. The owner approved the exact generic output. The one request completed as Comfy
prompt `66106a30-9011-4dc7-b340-b615c4f3acaf`, producing untouched external
1024x1024 RGB24 file `WormsPortFlux2KleinReferenceEdit_00011_.png` (906,163
bytes, SHA-256 `9D63D9A75187885BAEC0417A06B781A4B6EE9983493E6B8699F8CF4B3ADC73A1`).
Frozen deterministic matte cleanup, the same generic alpha mask, uniform
scale/centering, source-master admission and a byte-identical build runtime
copy now produce `assets/masters/objectives/collect/generic-amber-hex-coin-source-master-v1.png`
(SHA-256 `1E56B2742351A85678EE93F5694E4DCDE5964EFC3C2C7F2C78C4364AB5354405`).
Collect loads that static runtime texture at the existing object depth and world
clip; Defend and Claim chests remain code-owned.
No objective authority, 16-by-16 half extents, support, collection, score,
collision, mode, AI, protocol, server/reward/PEI/Gemini, controls, status bars,
atlas, dependency, animation, or per-frame image work may change.

## Mode rules

| Mode | Player victory | Loomkeeper victory | Turn-limit result |
| --- | --- | --- | --- |
| Defend | Eliminate the Loomkeeper through unravelling or a fall; chest survival is evaluated at the turn limit | Touch or drop the player chest, or eliminate the player | Player wins while the chest remains active |
| Collect | Establish an unbeatable coin lead or eliminate the Loomkeeper | Establish an unbeatable coin lead or eliminate the player | Higher collected score wins; equal score draws |
| Claim | Touch or drop the Loomkeeper chest, or eliminate the Loomkeeper | Eliminate the player; chest survival is evaluated at the turn limit | Loomkeeper wins while the chest remains active |

R8 retains the current maximum of 16 alternating turns. Actor unravelling or an
open-bottom fall remains an immediate alternate victory in all three modes. This
is the smallest version that preserves the accepted combat system. Phone review
must test whether elimination makes the objectives irrelevant. Respawning,
temporary knockout, dropped banked coins or multiple lives require a later
ruleset and may not be introduced as an unrecorded balance correction.

Defend and Claim use one chest owned by the defender. Only the attacker can
capture it. The attacker wins when the chest leaves the bottom of the world,
regardless of which actor removed its support. This prevents the defender from
winning by deliberately destroying the chest platform.

Collect begins with seven neutral coins. Collection banks one point immediately.
The match ends when one score is greater than the opponent's score plus every
active coin, when all coins are collected or lost, or at the ordinary turn
limit. The higher score wins; equal scores draw. A lost coin never respawns and
does not award a point.

## Objective entity authority

The authoritative state adds one bounded objective record containing:

- `objectiveMode`, layout recipe and objective revision/hash;
- stable object IDs and `coin` or `chest` kind;
- fixed-point x/y position, vertical velocity and grounded state;
- `active`, `collected`, `captured` or `lost` status;
- collector/attacker identity when applicable; and
- the player and Loomkeeper coin scores.

There are at most seven coins or one chest in the first recipe. Objective data
is part of the complete simulation state hash, protocol snapshot and replay.
Objective motion changes `objectiveRevision` and `objectiveHash`, never
`terrainRevision` or `terrainHash` unless terrain itself also changed.

Objective objects use deterministic fixed-point gravity and support queries
against the same packed terrain mask as the actors. They fall vertically when
support disappears, can settle on lower terrain and become `lost` only after
leaving the open world bottom. The first version has no rolling, bounce,
horizontal velocity or direct blast impulse.

Projectiles do not collide with, damage or stop on objective objects. Actors do
not treat them as solid obstacles. A living in-bounds actor overlapping an
active coin collects it; an attacker overlapping the enemy chest captures it.
Banked coins are not physical objects and cannot be dropped.

Each authoritative tick resolves in this order:

1. accepted actor input, projectile motion and terrain deformation;
2. actor and objective gravity/support motion;
3. coin collection and chest contact by actors still alive and in bounds;
4. objective loss through the bottom; and
5. all objective and actor terminal conditions.

If opposing victory conditions become true on the same tick, the result is a
draw. If both actors overlap one coin on the same tick, the nearer body centre
collects it; an exact fixed-point distance tie leaves the coin active. Stable
object-ID order resolves independent simultaneous collections.

## ASCII objective layer and layouts

The accepted R7 `64 x 36` terrain chart and `256 x 72` packed mask remain
unchanged. R8 adds a separate aligned objective authoring layer so item markers
never become terrain bits:

| Character | Meaning |
| --- | --- |
| `.` | no objective |
| `o` | neutral coin anchor |
| `C` | chest anchor |

The compiler validates dimensions, the exact object count for the selected
mode, unique anchors, clear object envelopes, initial support and in-world
positions. No objective marker may alter the R7 terrain hash.

The live tactical serialization can overlay `P`, `L`, `o` and `C` on the exact
`#`/`.` terrain grid. Exact positions, velocities, scores and statuses remain
structured beside the ASCII view. An active object and actor contact resolves
before a published snapshot, avoiding ambiguous same-cell symbols. A
terrain-only serialization must still round-trip to the exact packed words.

The fixed first layouts use the complete accepted arena:

- Defend places the player chest on a supported home-side position with at
  least one movement approach and one terrain-opening approach.
- Claim mirrors the role on the Loomkeeper side without requiring pixel-perfect
  visual symmetry.
- Collect places seven coins across both outer regions, the high route, lower
  route, central contested space and at least one deliberate breach area.
- Every object begins supported and neither actor starts in collection/capture
  range.
- At least one goal is reachable by accepted movement and another becomes
  materially easier after deliberate terrain destruction.

Random, procedural or Gemini-authored objective placement is outside WP-026.

## Deterministic objective-aware Loomkeeper

WP-026 replaces shot-only evaluation for R8 with bounded complete-turn plans.
Each candidate contains its legal movement and jumps, firing position, Relic,
aim and power, cast, retreat and final position. The server simulates every
candidate through the R8 authority before it can be selected.

A revision-keyed navigation analysis derives reachable surfaces, route openings,
cover and firing windows, support thickness, bottom-fall threats, distance to
active objectives and safe final positions. Candidate summaries record health,
position, terrain and objective consequences. The deterministic policy scores:

- chest approach, capture, support removal, interception and guarding in Defend
  and Claim;
- reachable coin value, collection, denial, score lead and opponent proximity
  in Collect; and
- damage, ring-out, route creation/denial and self-preservation in every mode.

Candidate enumeration and limited reply evaluation must have fixed count, tick
and wall-work ceilings. There is no unbounded path search. A selected candidate
is stored as replay evidence and executed only through ordinary authoritative
intents. The deterministic policy is also the permanent fallback later used by
WP-027.

## Client and camera contract

Wizard is the only player character in the current product. The lobby therefore
removes the obsolete Wizard, Thief and Warrior class choice. New R7 Practice and
Daily challenges continue to send the existing `calling: "wizard"` field so this
UI correction does not force a protocol, database or replay migration.

The private R8 canary reuses that three-button lobby space for Defend, Collect
and Claim before local challenge creation. Each button has one short goal
description and identifies the chest owner where relevant. The selected button
is exposed as `objectiveMode`, is immutable during the match and is restored by
the review URL. `/?combat-preview=v10r8` opens this selector; the existing
`objective-mode=defend|collect|claim` deep links continue to open the selected
match directly. Restart starts the same mode fresh, while a completed match
offers **Change Mode**. The normal result path uses **Back to Lobby** because
there is no longer a Calling to change. Practice needs no wallet or PEI.

The match HUD shows coin scores and remaining active coins for Collect, or chest
owner/status and attacker/defender roles for Defend and Claim. Small noninteractive
edge indicators keep offscreen active objectives discoverable in the wide arena.
Collection, capture, falling/lost objects and the exact result reason must remain
legible in both normal and virtual-landscape phone compositions. Reduced motion
removes decorative movement without hiding authoritative object position.

Code-owned placeholder presentation may prove scale and behavior in the private
gate. WP-026 must close with either an explicitly approved code-owned final
presentation or admitted production coin and chest media. Imported or generated
media requires the normal exact-file source, license, manifest, build-copy,
budget and phone-size review. WP-027 may not inherit an unresolved placeholder.

## Protocol, replay and reward boundary

Challenge creation, snapshot, result and replay schemas add `objectiveMode`, the
objective recipe identity and bounded objective state. New events distinguish
`coin_collected`, `chest_captured`, `objective_lost` and the expanded terminal
reasons. Unknown modes, object IDs, recipes, transitions and result reasons fail
closed.

Fresh reconstruction must reproduce every terrain mutation, objective fall and
landing, contact, score, deterministic Loomkeeper selection, terminal reason and
final hash. Resume restores the exact objective state and never rebuilds objects
from the opening layout after play has started.

WP-026 specifies but does not activate the Daily path. When R8 later reaches the
WP-027 promotion gate, the player selects `objectiveMode` before the Daily
challenge is created. The server binds it to the reservation, eligibility,
ruleset and replay. One started Daily and one consumed PEI receipt apply across
all three choices, and a resumed challenge cannot switch modes. The fixed 1 NIM
reward remains payable only for a verified authoritative player win.

## Waypoints and phone gates

### Waypoint 1 - object physics and ASCII

Implement the bounded objective state, compiler, live serialization, gravity,
support, landing and open-bottom loss behind a wallet-free private R8 preview.

The implementation begins at clean `c82e74d`. It keeps R8 out of the current
ruleset registry and wraps an R7 simulation only inside the private
`/?combat-preview=v10r8` fixture. Separate fixed `64 x 36` layers compile seven
coins for Collect or one owned chest for Defend and Claim. Object position and
vertical velocity use fixed-point state; support, landing and open-bottom loss
advance after the inherited combat tick with their own revision and hash.
Projectiles and actors remain transparent to these objects. The tactical
serializer publishes an overlay plus exact structured object state without
altering the terrain serialization or terrain hash. Coins and chests use a
temporary code-owned drawing for this phone-size gate. Contact, score, terminal
rules, HUD and server authority remain reserved for the later waypoints.

Private review routes are:

- `/?combat-preview=v10r8&objective-mode=collect`;
- `/?combat-preview=v10r8&objective-mode=defend`; and
- `/?combat-preview=v10r8&objective-mode=claim`.

Missing or unknown objective modes fail to the bounded Collect review mode.
Reload restores only the matching local seed, Calling, recipe and mode; Restart
constructs the same mode from its fresh fixed layout. The root path and both
server-backed Practice and Daily remain exact R7 throughout this waypoint.

Phone Gate A confirms readable object scale; intact objects survive direct fire;
removing support makes each kind fall and land; an open bottom removes it; and
camera, crater rendering and controls remain smooth.

The owner's first physical Android read at committed and pushed `17200ab`
accepted all nine object, terrain, camera, control and R7-isolation steps, but
kept Gate A open for two R8 presentation regressions: the fixed movement buttons
did not receive their compact aligned styling, and actor status cards fell back
to a larger two-row layout. The cause was a stylesheet boundary listing literal
R6/R7 IDs while R8 already used the same three-button controller and compact
status behavior. The refinement assigns that inherited interface one semantic
`combat-action-dynamics` class, so R6, R7 and R8 share the same CSS without
expanding another ruleset-ID list. Supported browser coverage freezes button
visibility, 2-4 pixel spacing, absence of joystick remnants and the one-row
health card. The owner then accepted that correction in both Defend and Collect.
At committed and pushed `87a6568`, the owner also confirmed that the approved
runtime Collect coins display with the intended hexagonal shape. Combined with
the previously accepted object behavior, **Phone Gate A and Waypoint 1 are
complete.**

### Waypoint 2 - three deterministic modes

Add exact mode layouts, contact, scoring and terminal rules plus the local HUD
and mode selector. The private R8 lobby uses the former three Calling buttons
for Defend, Collect and Claim and fixes the player Calling to Wizard internally.
The ordinary R7 lobby removes the class selector but keeps new server-backed
Practice and Daily challenges on exact R7 with `calling: "wizard"`. Waypoint 3,
not this local slice, moves the R8 selector into server-backed Practice.

Phone Gate B completes and restarts each mode, exercises chest capture and chest
loss, collects and denies coins, checks a Collect draw, and judges whether direct
elimination leaves meaningful objective play.

Use `/?combat-preview=v10r8` for the physical review. Confirm that the lobby
offers Defend, Collect and Claim with one fixed Wizard, then:

1. start Collect, bank coins by contact and drop at least one unbanked coin out
   of the open bottom; verify score, remaining-coin HUD and edge indicators;
2. finish Collect once with equal scores to confirm the draw and exact result
   wording;
3. start Claim and touch the Loomkeeper chest to confirm attacker capture;
4. start Defend, remove the support below the player chest and let it leave the
   open bottom to confirm the Loomkeeper wins even when the player opened it;
5. finish any mode by direct elimination and judge whether the objective still
   changes useful play; and
6. confirm **Restart Mode** starts the same clean layout while **Change Mode**
   returns to the selector and can start another mode immediately.

The ordinary `/` Practice and Daily paths must still show no class selector,
start as the Wizard, and remain exact server-backed R7 during this gate.

### Waypoint 3 - server Practice and deterministic Loomkeeper

Move exact R8 into the server-backed Practice canary, implement complete-turn
deterministic candidates and bind all objective facts to replay and resume.

Phone Gate C plays all three modes across changed terrain, closes and reopens
during both actors’ turns, confirms the same challenge and objective state
resume, and checks that the deterministic Loomkeeper completes legal,
non-stalling turns. Judging visibly convincing chest or coin strategy is moved
to WP-027 with the objective-aware Gemini selector; it is not a WP-026 closure
condition.

Waypoint 3 keeps the private `combat-preview=v10r8` admission boundary, but the
match behind it is now the live server authority rather than the local fixture.
Ordinary Practice and PEI-gated Daily remain exact R7. An R8 Practice creation
binds `objectiveMode`, `volcanic-ruin-objectives-r1` and
`wp-026-v10-r8-objectives-v1`; every subsequent input and lifecycle packet must
carry that same recorded ruleset and automation identity.

The owner's first physical Gate C read accepted mode entry and ordinary live
play, then exposed four canary corrections. Destroying the mini-app WebView lost
the R8 Practice bearer during both the player and Loomkeeper turns; terminal
combat briefly showed an in-arena retry/change-mode sheet before the result
scene; R8 aim, pan and movement regressed on phone and more strongly on a larger
tablet; and post-Loomkeeper displacement could be presented as player walking.
The bounded correction retains only an active R8 objective bearer across
destroyed WebViews, clears it at terminal or rejection, removes the duplicate
live terminal action surface, reuses the projectile-transparent R7 trajectory
path, removes repeated validation and storage work, schedules presentation
redraws only when their state changes, and labels walking only from active held
movement. The focused physical recheck owns player-turn resume,
Loomkeeper-turn resume, one terminal prompt, smooth phone/tablet pan, aim and
movement, and absence of uncommanded player walking.

The focused phone recheck passed all five corrected lifecycle, terminal-surface,
foreground-performance and motion-ownership steps. The first larger-tablet read
found that both Wizards could move smoothly at first and later skip frames, with
jumps briefly pausing in mid-air. Interpolating toward each newest publication
improved that behavior substantially, but the next tablet read retained a small
pause during roughly every third quick-combo jump. Live V10 authority publishes
every three 30 Hz simulation ticks, so presentation now stays four ticks behind:
one complete publication interval plus one tick of arrival-jitter margin. It
interpolates between buffered authoritative samples and never extrapolates.
Input acknowledgements retain that spatial history; phase/turn boundaries,
reconnect, long publication gaps and reduced-motion preference still snap to
current truth. Between authority redraws it updates only the two Wizard sprites,
team cues and anchored health cards; terrain, objectives, scenery and effects
are not rebuilt at display-frame cadence. Gate C now owns only the focused
physical larger-tablet quick-combo jump recheck for both actors.

## Automated acceptance

Meaningful current-R8 coverage must prove object support/fall/landing/loss,
projectile transparency, collection and capture boundaries, simultaneous-event
ordering, every mode's early and turn-limit result, ASCII and structured-state
round trips, revision/hash isolation, candidate legality and objective diversity,
exact reconstruction, reconnect, client presentation and canary server smoke.
R7 and older runtime profiles remain explicit diagnostics.

## Explicit deferrals

WP-026 does not add Gemini or require human-like objective strategy from its
bounded deterministic fallback. It also does not add respawning, temporary
knockout, dropped banked coins,
object blast impulse, rolling, bounce, carrying a chest, returning it to a base,
procedural layouts, PvP, variable rewards or another PEI rule. WP-027 owns the
external selector and final R8 promotion.

## Definition of done

WP-026 closes when Phone Gates A-C pass, all three modes are complete in the
server-backed R8 Practice canary, the deterministic Loomkeeper remains legal,
bounded and replayable, the fresh replay verifier reproduces every objective
transition, change-selected checks pass, the work-package evidence is complete
and housekeeping agrees with the execution pointer. R7 remains standard
Practice and Daily until WP-027.
