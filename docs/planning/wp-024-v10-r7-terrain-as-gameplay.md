# WP-024 V10 R7 Terrain As Gameplay

Status: **Waypoint 1 and Phone Gate A accepted; Waypoint 2 implemented, awaiting Phone Gate B**
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

The package has three coupled product changes:

1. tune Threadball to about one-third of Spoolburst's crater area and size
   Spoolburst so the thinnest volcanic shelf needs at least two hits to open;
2. replace the surface-only volcanic terrain with an entirely destructible
   tactical battlefield that can contain cavities, bridges, overhangs, thin
   supports and openings to the bottom of the world; and
3. give the Loomkeeper a Gemini-backed tactical selector that reasons over an
   exact ASCII representation of the current battlefield without giving an
   external model simulation authority.

The crater scale and battlefield come first. Gemini enters through the same
ASCII state seam only after terrain round trips, destruction and reward replay
are independently trustworthy.

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
- Google's Gemini documentation supports schema-constrained JSON, but explicitly
  requires applications to validate semantically incorrect output. It also
  distinguishes stable model names from hot-swapped `latest` aliases and
  requires production API keys to remain server-side. R7 therefore treats the
  model response as untrusted plan selection, pins an exact stable model in a
  policy identity and keeps the key out of the client.

No external game code, map, texture or asset enters the product. Sorcerers
remains quarantined and is not reopened for this package.

References:

- https://www.team17.com/games/worms-w-m-d-mobilize
- https://www.team17.com/news/team17s-100-games-part-eight-2002-2004-worms-3d-worms-blast-more
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/rate-limits

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
or Gemini behavior.

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
the changed bits rather than editing text or asking Gemini to infer which cells
were removed.

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

Gate B accepts the authored battlefield and fall rule. It does not activate
Gemini or the rewarded Daily path.

## Waypoint 3 - Gemini-backed Loomkeeper selection

### Authority boundary

Gemini is a bounded selector, not the game simulation, collision system, map
store or command authority. At the start of each Loomkeeper turn, the server:

1. snapshots the exact authoritative R7 state;
2. serializes the complete current battlefield ASCII, including all accumulated
   destruction;
3. deterministically enumerates and simulates legal Loomkeeper candidate plans;
4. reduces them to a diverse shortlist of at most 24 candidates with stable IDs;
5. sends the snapshot and candidate summaries to Gemini; and
6. accepts only a returned ID that occurs in that exact shortlist before feeding
   the candidate's already validated operations through the existing authority.

Candidate summaries include the proposed movement/jump, Relic, aim and power,
predicted impact cell, health effects, fall/elimination result, final actor
positions and terrain cells removed. The shortlist keeps legal diversity across
Relics, movement and tactical result instead of sending 24 near-duplicate shots.
Gemini never supplies coordinates, velocities, crater edits or arbitrary
commands.

Every request contains a fresh complete snapshot. R7 does not use Gemini chat
history or `previous_interaction_id` as battlefield memory. This makes the
updated ASCII map the model's current view while preventing accumulated model
state from drifting away from authoritative destruction.

### Structured response

Use Gemini structured output with a small JSON Schema equivalent to:

```json
{
  "candidateId": "r7-candidate-id",
  "tactic": "damage|ring_out|open_route|deny_route|self_preserve"
}
```

`candidateId` is an enum of the current shortlist IDs. Both fields are required,
additional properties are rejected, output count is one and output tokens are
kept small. `tactic` is audit metadata and never changes authority. The server
still parses, size-bounds and semantically validates the response because schema
conformance alone does not prove that a plan is current or legal.

The policy uses an exact stable model name. It must not use `latest`, preview or
experimental aliases for rewarded matches. Temperature is set to zero to reduce
variation, but no deterministic-output claim is made.

### Replay and reward verification

Calling Gemini again during settlement would be nondeterministic and would make
historical rewards depend on an external model version. R7 instead extends each
automated selection record with:

- turn and R7 policy ID;
- provider: `gemini` or `deterministic-fallback`;
- exact stable model ID and prompt-contract revision;
- basis state hash, terrain revision and terrain hash;
- candidate-set hash and selected candidate ID; and
- canonical structured-response hash.

The fresh verifier reconstructs the decision state, regenerates the candidate
set locally, checks all hashes and confirms the recorded ID was legal, then
replays that candidate's operations. It never contacts Gemini. This proves the
simulation and chosen action exactly; it does not claim that a later Gemini call
would choose the same action. Rewarded activation requires this distinction to
be visible in direct review and accepted before the Daily gate.

Reconnect and process restart retain the chosen plan record. A match captures
its provider and policy revision at creation, so an environment or model change
cannot switch an in-progress match halfway through.

### Availability, latency and cost

The deterministic R6/R7 planner remains a permanent fallback. Missing keys,
timeouts, quota/rate limits, network failures, invalid JSON, unknown IDs, stale
hashes and rejected responses select the deterministic plan at the same bounded
decision point. Candidate-generation or simulation failures still fail closed;
they are not converted into an external model success.

Gemini first runs in shadow mode: the deterministic Loomkeeper acts while the
server records Gemini latency, validity, candidate choice and estimated/token-
count cost. Practice can then run a live canary. Daily activation follows only
after the replay verifier, fallback and operational thresholds pass.

The decision is released at one fixed logical boundary even if Gemini answers
early. Shadow measurements select that boundary, initially targeting no more
than 90 ticks (three seconds). A late response is ignored. There is one external
request per Loomkeeper turn and no request retry inside the turn; the local
fallback is cheaper and faster than extending gameplay around API backoff. With
the existing 16-turn limit, a match can make at most eight Gemini calls.

The server enforces one in-flight request per match, a global concurrency cap,
an input-byte/token ceiling, a small output ceiling, a circuit breaker and a
deployment spend budget. The full `256 x 72` ASCII terrain alone is 18,503 ASCII
bytes, so shadow mode must measure actual tokens with the target model rather
than infer billing from characters. API latency and internal selection work do
not charge another match as scheduler debt.

### Security and deployment configuration

The Gemini adapter lives only in the server. Its request contains gameplay
state and candidate data but no wallet address, PEI receipt, transaction hash,
reward reservation, session bearer, IP address or device data. It accepts no
player-authored prompt text. Logs retain model/policy IDs, hashes, latency,
provider outcome, token counts and bounded error classes, without the API key or
wallet identity.

Safe deployment defaults are:

```text
LOOMKEEPER_PROVIDER=deterministic
GEMINI_API_KEY=<server-side secret; absent while deterministic>
GEMINI_MODEL=<exact stable model ID; required for shadow or live Gemini>
```

Allowed provider values are `deterministic`, `gemini-shadow` and `gemini`.
Invalid or incomplete configuration fails startup for a requested Gemini mode;
it does not silently expose a key to the browser. The first implementation
should prefer the existing server runtime and a small transport adapter. Adding
an SDK requires the ordinary package, license, audit and bundle review and is
not assumed by this plan.

### Phone Gate C - live Gemini Practice canary

After shadow evidence passes, deploy `LOOMKEEPER_PROVIDER=gemini` only to the
Practice canary:

1. Play several turns after creating different holes, barriers and bottom
   threats; confirm the Loomkeeper reacts to the current changed terrain rather
   than the opening map.
2. Confirm its movement and shot remain legal and the fixed thinking interval
   does not stall controls or another match.
3. Close and reopen during both player and Loomkeeper turns and confirm the same
   terrain and already selected plan resume.
4. Exercise a controlled missing-key or disabled-provider deployment and confirm
   deterministic fallback completes Practice without a broken match.

Gate C accepts operational Practice behavior, not rewards.

## Final promotion and Phone Gate D

After Gates A-C and automated replay proof pass, promote one exact R7 identity
to both standard Practice and the PEI-gated Daily Challenge. No separate Daily
terrain, crater table or controls are permitted.

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
- server-generated candidate diversity, shortlist bounds, structured-response
  validation, stale/unknown selection rejection and deterministic fallback;
- fixed decision timing, timeout/rate/quota/circuit behavior using local fakes,
  with no live Gemini call in routine CI;
- restart/reconnect replay reconstruction without any verifier network call;
- client/server bundle separation so `GEMINI_API_KEY` and the provider adapter
  cannot enter browser output;
- current R7 Practice and Daily browser journeys, reward settlement, security,
  build and the standard volcanic server smoke; and
- phone-layout and terrain visuals on all maintained projects, with any changed
  Ubuntu baselines produced only through the pinned artifact workflow.

R5/R6 and older runtime profiles remain explicit diagnostics. Ordinary feature,
quality and release acceptance runs current R7 only. A documentation-only plan
change needs no game build. Live Gemini, PostgreSQL, Ubuntu artifact and physical
phone gates are reported separately and are run only when their waypoint makes
them relevant.

## Explicit deferrals

R7 does not add terrain gravity, debris, fluids, material hit points, terrain
repair, player-authored maps, procedural map generation, Gemini-authored maps,
arbitrary Gemini commands, PvP, player stakes, variable rewards or PEI carrier
experimentation. It does not change the approved art-source boundary.

## Definition of done

WP-024 closes only when the owner has accepted Gates A-D, the exact R7 Practice
and Daily paths are deployed, replay verification proves every selected plan and
terrain mutation without calling Gemini, safe environment settings are restored,
change-selected checks pass, the work-package evidence is complete and
housekeeping agrees with the execution pointer. Until then, R6 remains the
standard game.
