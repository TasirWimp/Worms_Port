# WP-024 V10 R7 Terrain As Gameplay

Status: **Complete 2026-09-15**
Planning base: `842da39`
Implementation base: `4f7c878`
Implementation branch: `codex/v10-r6-action-impact-dynamics`

## Product outcome

WP-024 makes terrain a primary weapon, route and loss condition in the current
Volcanic Ruin match. Practice and the PEI-gated Daily Challenge will ultimately
use the same `nimble-knots-artillery-v10-r7` gameplay. R7 keeps the accepted R6
mobile controls, 60-second action phase, compact actors and health bars,
projectiles, damage, blast impulse, Thread economy, deterministic simulation,
resume behavior and reward rules unless a waypoint below explicitly changes
them.

The package has two coupled product changes:

1. tune Threadball to about one-third of Spoolburst's crater area and size
   Spoolburst so the thinnest volcanic shelf needs at least two hits to open;
2. replace the surface-only volcanic terrain with an entirely destructible
   tactical battlefield that can contain cavities, bridges, overhangs, thin
   supports and openings to the bottom of the world.

After both terrain waypoints pass phone review, Waypoint 3 moves the exact R7
state into the existing server-authoritative Practice and Daily lifecycle with
the deterministic Loomkeeper. Objective modes belong to WP-026 and the
objective-aware Gemini selector belongs to WP-027; neither is part of R7.

## Current seams and required changes

The current runtime already stores terrain as a mutable `256 x 72` packed bit
field with 8-world-unit cells. `deformTerrain` clears every cell centre inside
an integer circular radius, movement re-evaluates support from the mutated
field, and an unsupported actor whose body leaves the 576-unit world is removed.
If only one actor remains alive, the other actor wins; if both leave before
either can settle, the result is a draw. These are suitable R7 authority seams.

The current `VOLCANIC_RUIN_SURFACE_ASCII` is not sufficient for R7. Its 32
columns describe only the first solid height of the central 1024-unit frame.
The compiler then fills every cell below that height and repeats the edge
columns across the rest of the 2048-unit world. It cannot author an enclosed
void, bridge, overhang, tunnel, floating section or open-bottom breach.

R7 therefore extends this existing ASCII compiler instead of introducing an
image-derived collision map or a second terrain engine. The packed bit field
remains the sole runtime terrain authority.

## Web reference and clean-room boundary

The web review contributes behavior and layout principles only:

- Team17 describes Worms W.M.D Mobilize as combat across randomly generated,
  destructible landscapes where reaching the bottom water eliminates a worm.
  R7 adopts destructible terrain as a route and bottom-boundary elimination
  tool without adding a water simulation.
- Team17's Worms 3D retrospective says its mutable terrain needed fast collision,
  fast modification and enough freedom for elaborate levels. It also describes
  using negative space and tall, thin structures to make constrained terrain
  feel larger. R7 applies those layout principles to the existing packed 2D
  mask.
No external game code, map, texture or asset enters the product. Sorcerers
remains quarantined and is not reopened for this package.

References:

- https://www.team17.com/games/worms-w-m-d-mobilize
- https://www.team17.com/news/team17s-100-games-part-eight-2002-2004-worms-3d-worms-blast-more

## Waypoint 1 - crater scale

### Explicit size basis

The accepted R6 actor presentation and direct-projectile envelope is 68 world
units high: 56 units above its ground root and 12 below it. R7 uses that height,
not the inherited 24-unit movement body, as the product-visible unit requested
for crater sizing.

The refined R7 terrain radii are:

| Relic | Diameter | Radius | Actor-height ratio | Nominal 8-unit-cell diameter |
| --- | ---: | ---: | ---: | ---: |
| Threadball | 128 | 64 | about 1.88 | 16 cells |
| Needlepoint | 16 | 8 | unchanged precision cut | 2 cells |
| Spoolburst | 224 | 112 | about 3.29 | 28 cells |

Two phone reads found both earlier crater candidates too large. The current
volcanic map's thinnest shelf starts at world Y 448 and leaves 128 units of
terrain above the open world bottom. Spoolburst's 112-unit radius preserves a
bottom collision row after a first hit even at the deepest point of that shelf;
a second hit into the newly exposed crater floor can open it. Threadball's area
is about 32.7% of Spoolburst's. The integer radii retain deterministic circular
carving on the 8-unit collision grid. These remain phone-review values, not an
authorization to tune other weapon axes at the same time. At a cell-centred
impact, the packed-mask surface spans are 16 cells for Threadball, 2 for
Needlepoint and 28 for Spoolburst.

Damage radius, maximum damage, launch bands, gravity, Thread cost and shield
interaction remain unchanged. After the crater scale and fall exit passed phone
review, Gate A found the inherited Needlepoint recoil visually absent at the
compact phone scale. R7 therefore raises only its Needlepoint impulse from the
R6 `256 / 768 / 512` table to `384 / 1024 / 768` fixed-point units per tick.
The direct horizontal launch is 4 world units per tick with a 3-unit upward
bias, remaining below Threadball and Spoolburst force. R6 stays frozen.
This deliberately makes Threadball and especially Spoolburst stronger terrain
tools without silently increasing their health damage. A later adjustment must
be justified by observed gameplay and contracted separately within R7.

The circular mask stays centred on the authoritative impact and clips only at
world bounds. It must be rotationally symmetric at the 8-unit grid resolution,
must clear every solid material symbol identically and must never create solid
cells. Direct actor impacts continue to carve at the resolved impact point.

### Phone Gate A - scale and feel

Use the wallet-free private R7 preview at `/?combat-preview=v10r7`:

1. Fire one Spoolburst into the thinnest terrain and confirm it leaves a floor;
   hit the exposed crater floor again and confirm the second hit opens it.
2. Compare both crater roles and confirm Threadball reads as about one-third of
   Spoolburst by area.
3. Confirm Needlepoint remains a small precision cut.
4. Hit a surviving actor directly with Needlepoint from either side and confirm
   it visibly launches away from the impact. Confirm damage, health bars,
   self-blast, firing, retreat, controls and the 60-second action flow remain
   accepted.
5. Walk and jump through the new crater edges and confirm collision, camera and
   rendering remain smooth on the phone.
6. Open a crater through the world bottom, let either Nimble fall through it and
   confirm the actor leaves the screen before the loss result appears.

At committed and pushed `4933cb2`, the owner accepted points 4 and 5 after the
bounded Needlepoint recoil correction. Together with the previously accepted
crater roles, precision cut and open-bottom fall presentation, **Phone Gate A
is complete** and authorizes Waypoint 2. It does not approve the new battlefield
or server promotion.

## Waypoint 2 - fully destructible ASCII battlefield

### Authoring chart

R7 replaces the central surface recipe with one complete `64 x 36` authoring
chart for the existing `2048 x 576` world. This retains the present human-scale
cell dimensions: each authoring column expands to four collision cells (32
world units) and each row expands to two collision cells (16 world units). No
column is filled implicitly, and no edge or bottom terrain is synthesized.

The source chart accepts this closed legend:

| Character | Authoring meaning | Runtime occupancy |
| --- | --- | --- |
| `.` | empty space | empty |
| `#` | bulk Worldweave | destructible solid |
| `=` | bridge or shelf annotation | destructible solid |
| `|` | pillar or support annotation | destructible solid |
| `+` | intended breach plug annotation | destructible solid |
| `P` | player opening anchor | empty |
| `L` | Loomkeeper opening anchor | empty |

The additional solid characters document the intended battlefield role; they
do not create material classes, hit points or indestructible terrain. After
compilation, `#`, `=`, `|` and `+` are identical bits. `P` and `L` are removed
from occupancy. Their horizontal centre and lower cell edge define the opening
x-coordinate and support surface; the simulation root remains the inherited 12
units above that surface. Exactly one of each is required.

The compiler rejects wrong dimensions, carriage-return ambiguity after
normalization, unknown characters, duplicate or missing anchors, occupied actor
envelopes, missing support, out-of-world geometry and charts that cannot
round-trip to the expected packed mask. The 44 by 68 direct target and the 24 by
24 movement body must both begin clear and supported.

### Tactical layout

The first map remains a fixed volcanic battlefield so visual and gameplay review
are repeatable. It should use the approved volcanic composition and existing
terrain materials to provide:

- two protected but destructible opening shelves;
- a central high route with at least one thin bridge or support;
- a lower route initially separated by one or more labelled breach plugs;
- vertical obstructions that block shallow shots and can be removed;
- negative-space cavities that create distinct firing windows;
- terrain thin enough in deliberate lower zones for a crater to open the map to
  the bottom boundary; and
- enough open air above and between structures for the accepted jump and
  projectile arcs.

The opening may be compositionally asymmetric, but deterministic probes must
show that both actors can move, jump, aim and fire without an initial trap. No
actor may begin over a one-input accidental loss hole. At least one breach
should be achievable with Threadball and one larger route transformation with
Spoolburst. Needlepoint should be able to enlarge or finish a narrow opening
without replacing the other two terrain roles.

Disconnected terrain does not acquire gravity or collapse. It remains fixed
until another crater removes it. This keeps terrain authority as one packed
mask and avoids a second rigid-body/debris simulation while retaining the
intended ability to remove the support beneath an actor.

The implemented `volcanic-ruin-battlefield-r1` chart uses all 64 authoring
columns. A nine-row, 144-world-unit destructible foundation spans the complete
2048-unit width. Elevated outer ledges and bastions occupy both world edges;
the opening shelves remain at world x 624 and 1424; and the high bridge,
vertical blockers, central `+` breach plug, cavities and linked lower shelves
use the space between them. Base-only approach zones at authoring columns 8-9
and 54-55 visibly expose the lower route and the intended sustained-damage
bottom breach without turning the outer arena into empty camera margin.

The foundation depth preserves the accepted weapon roles: one Spoolburst at a
fresh base-only zone leaves a floor and a second aligned hit can open the
bottom; Threadball needs approximately three aligned foundation hits. The
central labelled plug remains a useful one-Threadball route breach. The R7
preview begins with the existing 2048-unit opening survey before focusing the
player, while R5/R6 retain their accepted fixed volcanic frame.

### Open-bottom elimination

Every solid bit is destructible. There is no hidden floor, bedrock row or
indestructible border beneath the map. Left, right and top world bounds remain
simulation limits; the bottom is an elimination boundary.

When destruction creates an empty path to the bottom and a Nimble loses its
support, existing gravity and swept collision carry it through the opening. Its
body leaving the world sets its Stitching to zero. If the other actor remains,
that actor wins the match. If both actors leave before the outcome resolves,
the match is a draw. The replay result can retain the established
`unravelled` finish reason, while a deterministic fall event gives the client a
clear fall-through presentation and result message.

The camera must keep the falling actor legible until the world edge and then
show the result without a blank or stalled interval. Large craters must reveal
valid terrain interiors and edges from the approved runtime material; the
background remains collisionless and behind all terrain.

### Live ASCII state and destruction updates

The initial authoring chart is not mutated during play. `PackedTerrain.words`
remains authoritative. After every impact, R7 derives the next ASCII state from
the changed bits rather than editing text or inferring which cells were removed.

The canonical live serializer emits exactly 72 lines of 256 characters, one
character per 8 by 8 collision cell, with LF separators and no terminal newline:

- `#` is a current solid bit;
- `.` is a current empty bit;
- `P` overlays the player's current simulation-root cell; and
- `L` overlays the Loomkeeper's current simulation-root cell.

Exact numeric unit coordinates, velocity, grounded state and health remain
structured fields next to the map, so the one-cell overlay does not pretend to
describe the full body. An actor marker must overlay an empty cell. The
serializer has a terrain-only mode whose `#` and `.` output parses back to the
exact packed words.

Each terrain-changing transition records an integer `terrainRevision` and a
canonical `terrainHash`. A no-op impact does not advance the revision. The
battlefield snapshot also carries the existing full state hash. Serializer
caching may key only on terrain revision; actor overlays are rebuilt for every
decision.

Waypoint 2 implements the serializer directly from `PackedTerrain.words`, the
transition reconciler, and strict restore validation. The private R7 preview
persists bounded simulation snapshots in same-origin browser storage at state
and terrain boundaries, so closing and reopening restores the exact changed
mask. The explicit in-game restart starts a fresh R7 battlefield. This local
review aid is not a substitute for the later server-backed reconnect/replay
authority.

### Phone Gate B - terrain as gameplay

Use the same private R7 Practice preview after Gate A:

1. Confirm the volcanic battlefield reads clearly with a high route, lower
   route, cover, bridges/supports and deliberate negative space.
2. Open a breach plug, remove a firing obstruction and create a new route with
   at least two different Relics.
3. Remove support beneath either actor and confirm it falls through the opened
   bottom, loses, and produces a clear result.
4. Confirm isolated terrain remains stable, while every visible terrain part
   can still be removed by later hits.
5. Confirm walking, jumping, aftertouch, aiming, blast movement, camera motion
   and large-crater rendering stay smooth.
6. Close and reopen the private R7 preview during a changed battlefield and
   confirm the same terrain revision and destruction state resumes; use the
   in-game restart and confirm it deliberately starts a fresh battlefield.

Gate B accepts the authored battlefield and fall rule. It does not activate the
server-backed Practice or rewarded Daily path.

At committed and pushed `9e17773`, the owner accepted all seven physical-phone
checks. The full arena, tactical routes, destructible foundation, open-bottom
fall loss, exact changed-map reopen and deliberate fresh restart behaved as
specified. **Phone Gate B is complete.** The current implementation candidate
now carries the accepted R7 state through live server creation, transport,
replay reconstruction, deterministic Loomkeeper selection and reward
verification. The practice-only deployment profile is the Phone Gate C canary;
the deployed Daily service stays on R6 until that gate passes.

## Waypoint 3 - server-authoritative R7 and deterministic Loomkeeper

### Version and authority

Waypoint 3 promotes the already accepted R7 simulation into the existing live
server lifecycle without adding another gameplay mechanic. It changes the
current V10 ruleset and automation identity only after the server, replay,
client and reward verifier all agree on the same exact R7 identity. R6 replay
truth stays reconstructable and cannot be relabelled as R7 evidence.

The server creates R7 from the accepted fixed battlefield recipe, owns every
input and tick, publishes the complete authoritative state, and applies the
same crater, fall, action, Thread and result rules proven in the private
preview. The browser stops owning local recovery once it enters server-backed
Practice or Daily; reconnect requests the existing challenge and accepts only
its server state and cursors.

R7 retains the deterministic Loomkeeper already inherited by the preview. Its
planner and execution use the current changed terrain, and its selected ordinal
and utility prefix remain replay evidence. WP-024 does not add an external
provider, prompt, model choice, candidate shortlist or API dependency.

### Replay, resume and reward verification

The live R7 replay binds the battlefield recipe revision, initial state hash,
every accepted operation, every deterministic Loomkeeper selection, terrain
revision and terrain hash progression, terminal result and final state hash.
The fresh verifier reconstructs those facts locally and never performs a
network call. A replay with a changed ruleset, automation identity, recipe,
terrain transition, selection or result must fail closed.

Reward settlement replays the exact deterministic proof cooperatively in
six-tick batches. Its verifier owns a validated private state, uses the same
V8/V9 mechanics kernel, regenerates the Loomkeeper plan and compares every
canonical record and state hash before the durable reward update. Yielding
between batches keeps terminal result delivery and unrelated matches
responsive; it does not skip a replay operation or weaken the final invariant.
The result screen may therefore appear briefly while the entitlement remains
`in_progress`, and the existing reward update completes that transition.

Closing and reopening the mini app during either actor's turn must recover the
same challenge, terrain, turn, phase, actor positions, input cursors and already
selected deterministic plan. A deliberate in-game leave or restart follows the
existing authoritative lifecycle and cannot resurrect the local preview state.

Practice admission comes first. The branch's current wire identity is R7 so the
practice-only profile can exercise the real server and client path without
constructing identity, PEI or reward services. Rewarded Daily remains on its
deployed R6 build until the R7 Practice canary and replay verifier pass. Final
activation deploys the exact same R7 ruleset and automation identity through
the ordinary profile; the reward service still pays only a verified
authoritative player win.

### Phone Gate C - server-backed R7 Practice

Deploy the exact R7 identity to the server-backed Practice canary with the
deterministic Loomkeeper:

1. Start Practice and confirm the accepted full R7 battlefield, crater roles,
   controls, timing and opening survey appear without wallet or PEI.
2. Create different holes, barriers and bottom threats across several turns and
   confirm the Loomkeeper remains legal while using the current changed terrain.
3. Close and reopen during both player and Loomkeeper turns and confirm the same
   terrain, turn, positions and already selected plan resume smoothly.
4. Complete one health win and one open-bottom fall result, then start a fresh
   Practice match and confirm it receives a fresh battlefield state.

Gate C accepts the server lifecycle, deterministic replay and Practice behavior.
It does not add objective modes, Gemini or a Daily reward change.

On 2026-09-15 the owner passed all four functional checks, including both
resume positions and both terminal outcomes. The same phone read exposed a
foreground performance regression: Threadball and Spoolburst aiming lagged,
full-arena panning stuttered, movement could hang, jumps briefly froze and
Pause sometimes needed repeated taps. Gate C therefore remained open even
though its functional behavior had passed.

The correction keeps gameplay and authority unchanged. Touch movement may
replace only the newest unrendered trajectory request before the next display
frame; the resulting preview still comes from the exact R7 mechanics. A
detached preview validates once at entry and completion rather than once for
every internal projectile tick. The renderer compiles terrain runs only when
the authoritative terrain revision/hash changes, then reprojects those runs
for camera motion. Static control geometry is rewritten only when its layout
changes. The live coordinator may use its private owned-state tick kernel, but
it must validate before publication and preserve every replay operation and
state hash.

Final-source verification passes all 73 supported simulation cases, all 21
protocol cases, the affected combat and Practice units, build/smoke and three
targeted current-phone Practice browser journeys. On an idle development host,
warm trajectory previews measured about 12-13 ms for all three relics, compared
with roughly 114-140 ms before the correction. A 300-tick R7 coordinator
diagnostic measured about 386 ms, compared with about 1.12 seconds before.
These diagnostics establish the removed work; the phone decides whether the
result restores the intended feel.

The focused Phone Gate C retest checks:

1. continuously change Threadball and Spoolburst angle/power and confirm the
   trajectory follows the thumb without the previous drag; compare Needlepoint;
2. pan repeatedly between both arena edges and confirm the scene follows the
   thumb smoothly;
3. sustain walking, perform several jumps and steer in the air while snapshots
   arrive, confirming no hangs or mid-air freezes; and
4. tap Pause once from an idle grounded player action and confirm the sheet
   responds on that tap, then resume once.

At committed and pushed `cf11916`, the owner accepted this focused retest on
the physical phone: the corrected game feels much better during aiming,
panning, walking, jumping and Pause input. Together with the earlier four
functional passes, this closes Phone Gate C and authorizes final R7 promotion.

## Final promotion and Phone Gate D

After Gates A-C and automated replay proof pass, promote one exact R7 identity
to both standard Practice and the PEI-gated Daily Challenge. No separate Daily
terrain, crater table or controls are permitted.

The final promotion uses the already implemented current constants rather than
adding another gameplay selector: an absent `NIMBLE_RUNTIME_PROFILE` is the
only normal production route and resolves both modes to
`nimble-knots-artillery-v10-r7` with automation
`wp-024-v10-r7-live-v1`. The retired `production-v7` alias is rejected. Named
development profiles remain isolated diagnostics and cannot serve Daily.
Supported protocol and browser assertions bind the shared Daily-to-Practice and
PEI-to-Daily-to-Practice journeys to the literal R7 identifiers so a future
change to a generic `CURRENT` constant cannot conceal version drift.

The final change-selected acceptance passed the exact production-profile and
R7 protocol boundary, fresh build/smoke, identity bundle isolation, reward
security and one canonical Chromium journey each for standard Daily-to-Practice
and PEI-to-Daily-to-Practice.

Phone Gate D checks one final end-to-end journey:

1. Practice starts directly with the accepted R7 battlefield and Loomkeeper.
2. A helper interaction leaves an unused PEI receipt attached to the wallet.
3. Daily consumes one receipt only when the challenge starts.
4. The player changes terrain, closes and reopens the app, and resumes the exact
   match with smooth accepted controls.
5. A terrain fall produces the correct winner; a normal health win remains
   valid as well.
6. A winning eligible match still completes the existing fixed 1 NIM reward and
   exposes its transaction hash.
7. The one-started-Daily-per-wallet/day rule still applies after the temporary
   development override is removed.

The first Phone Gate D read passed point 1 and points 3 through 7. It exposed
one shared result-navigation defect at point 2: after either a won or lost
Practice or Daily match, **Change Calling** appeared to do nothing, so the app
had to be closed before starting another helper crossing. The completed V10
client retained its terminal result; the newly created Practice scene subscribed
to that retained result and was immediately sent back to the result scene.

The correction dismisses only completed local combat ownership before entering
the Calling lobby. It preserves the socket session, authorized wallet, unused
PEI receipts, reward update and daily-attempt authority. Current R7 browser
coverage must tap **Change Calling** after both a Practice result and a Daily
loss, observe the lobby remain active, then start fresh Practice successfully.
The focused phone retest repeats only this navigation from one Practice result
and one Daily result; the other Gate D points remain accepted.

Focused verification passes with a fresh build and standard R7 built smoke.
The exact current-R7 Practice and Daily browser journeys both dismiss the
completed result, remain on the Calling lobby and start fresh Practice. At
committed and pushed `81fb876`, the owner confirmed the corrected Practice
navigation on the physical phone. The ordinary daily limit left no second Daily
attempt, so the owner accepted the equivalent automated Daily proof and
explicitly authorized closure. Combined with the retained first-read passes for
Gate D points 1 and 3 through 7, this closes Phone Gate D and WP-024.

The mainnet helper and reward paths stay paused except for the supervised phone
gate and return to their existing safe state immediately afterward.

## Automated acceptance and direct review

The implementation must add meaningful current-R7 coverage for:

- exact radii, circular mask symmetry, world-edge clipping and unchanged
  damage/impulse/Thread rules;
- the 64 by 36 character whitelist, anchor semantics, solid aliases, no implicit
  fill and exact packed-mask round trip;
- spawn clearance, opening mobility, intended breachability and an actual
  open-bottom elimination for either actor plus the simultaneous draw;
- exact live ASCII serialization after successive overlapping craters,
  `terrainRevision`, terrain hash and state hash continuity;
- exact R7 live protocol and automation identities, deterministic Loomkeeper
  selection records and rejection of R6/R7 replay relabelling;
- server-backed restart/reconnect reconstruction of changed terrain, actor state,
  input cursors and the already selected deterministic plan;
- current R7 Practice and Daily browser journeys, reward settlement, security,
  build and the standard volcanic server smoke; and
- phone-layout and terrain visuals on all maintained projects, with any changed
  Ubuntu baselines produced only through the pinned artifact workflow.

R5/R6 and older runtime profiles remain explicit diagnostics. Ordinary feature,
quality and release acceptance runs current R7 only. A documentation-only plan
change needs no game build. PostgreSQL, Ubuntu artifact and physical phone gates
are reported separately and are run only when their waypoint makes them relevant.

## Explicit deferrals

R7 does not add terrain gravity, debris, fluids, material hit points, terrain
repair, player-authored maps, procedural map generation, objective objects or
objective modes, Gemini selection, PvP, player stakes, variable rewards or PEI
carrier experimentation. It does not change the approved art-source boundary.

WP-026 owns the new Defend, Collect and Claim rules on a separately versioned R8
state after lifecycle hardening. WP-027 owns the later objective-aware Gemini
selector. Neither successor may rewrite R7 replay truth or be claimed as WP-024
acceptance.

Mobile lifecycle and power hardening is also outside WP-024 so it cannot disrupt
the accepted terrain path or weaken Gates C-D. It is a mandatory successor queued
immediately after WP-024 closes. That package will stop app-owned simulation,
rendering and live snapshot traffic while hidden, preserve authoritative Daily
Challenge resume, and finish with a physical-phone background-battery gate. The
implementation plan records the bounded scope and the separate Nimiq Pay WebView
host follow-up if app-side suspension does not remove the observed activity.

## Definition of done

WP-024 closed after the owner accepted Gates A-D, the exact R7 Practice
and Daily paths are deployed, replay verification proves every selected plan and
terrain mutation through the deterministic policy, safe environment settings are
restored, change-selected checks pass, the work-package evidence is complete and
housekeeping agrees with the execution pointer. R7 is the standard Practice and
Daily game; WP-025 Mobile Lifecycle And Power Hardening is the next authorized
package and has not started.
