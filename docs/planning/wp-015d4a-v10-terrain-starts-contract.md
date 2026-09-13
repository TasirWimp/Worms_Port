# WP-015D4A V10 Terrain And Starting Positions Contract

Status: V10A finite product contract, V10B deterministic authority, V10C local
playable candidate and V10D assessment/physical-phone acceptance complete,
2026-09-08. V10E implementation and automated acceptance are complete with
physical-phone terrain feel still open. Owner-authorized WP-015D4C/V10F
procedural terrain, replay authority and local phone-preview implementation are
complete with physical-phone terrain feel still open. Public promotion remains
a separate owner decision.

## Purpose

V10 makes the Patch itself part of the tactical decision. It replaces V7's
exact 640-unit opening rule with a small deterministic family of map profiles
and profile-specific starting pairs. Each accepted opening must provide useful
terrain relief, a reachable movement route, a practical first attack for both
sides, and a credible response after the first terrain-changing turn.

V10 inherits the complete V9 action loop, Thread economy, Relics, utilities,
movement, AI work limits, Practice/reward authority boundary and mobile
presentation. It changes only terrain generation, opening placement, the
versioned state/protocol/replay identity needed to carry that terrain, and the
AI/client/server adapters required to play the candidate.

## Source and process boundary

The only Sorcerers-derived input is the frozen
[V10 terrain-tactics behavior record](../evidence/wp-015d4a-v10-terrain-tactics-behavior-record.md).
No runtime writer may access or copy Sorcerers source, maps, assets, algorithms,
constants, identifiers, tile rules or paint rules. The product decisions below
are authored against Worms_Port's existing V7 terrain and V9 simulation.

The owner explicitly directed the current single-owner task to continue from
observation into V10 planning and implementation. From that instruction
forward, this task uses only this frozen record and local Worms_Port sources.
The clean-room record remains `observed`; no independent clean-room or release
approval is claimed.

## Version and predecessor boundary

- Add ruleset ID `nimble-knots-artillery-v10`, ruleset version `10` and format
  version `10`.
- V10 state is V9 state plus a required terrain profile ID. The initial state,
  snapshot, state hash and replay bind that profile and the complete packed
  terrain bytes.
- V1 through V9 reconstruction, hashes, rules, starts and replay dispatch remain
  unchanged.
- V10 remains an explicit candidate. Ordinary production creation stays on its
  current ruleset until a later owner-approved promotion.
- Practice and rewarded modes must never select different V10 mechanics. A
  later public promotion must move both through the shared version selector.
- V11 teams, the deferred V9 Relic-selection bug, balance tuning, rewards and
  payout activation remain separate.

## Authoritative terrain representation

V10 retains the current 2048 by 576 world, 8-unit terrain cell, 256 by 72
packed collision field and integer-only deterministic simulation.

Every generated column has one upper surface and solid terrain below it. V10
does not add overhangs, caves, tunnels, ladders, floating islands, water gaps,
obstacle entities or separate collision layers. Adjacent movement samples may
rise by no more than the 16 world units already handled by V8-r1 walking. Larger
terrain relief is formed through successive reachable steps or slopes.

The profile family is exactly:

| Profile ID | Opening separation | Required tactical character |
| --- | ---: | --- |
| `sheltered-folds` | 512 | A central fold interrupts shallow fire while both starts retain an outward retreat and a route toward the crest. |
| `rising-braid` | 576 | The starts occupy meaningfully different elevations; seed reflection alternates which side receives the height advantage. |
| `open-terraces` | 640 | Longer sightlines are broken by shallow terraces that permit walking and jumping without trapping either actor. |

The normalized seed chooses the profile, its bounded phase/variation, and its
horizontal reflection. There is no wall-clock input, unseeded randomness,
runtime retry, external map data or decorative-pixel input. Generation fails
closed when its profile cannot produce an eligible opening.

## Starting-position admission

Candidate positions remain aligned to the terrain cell. An opening pair is
eligible only when all of these conditions hold:

1. both actors have solid support and body-clear placement;
2. both starts retain a safe world margin and at least one full 64-unit local
   movement path away from the opponent;
3. each actor has a continuous route toward the opponent, with no gap and no
   adjacent rise beyond the current walking step-up capability;
4. the pair uses the exact separation assigned to its map profile;
5. `sheltered-folds` and `open-terraces` start-height difference is at most 24
   world units;
6. `rising-braid` start-height difference is between 32 and 64 world units,
   inclusive, and reflection swaps the advantaged side;
7. neither body overlaps the other or begins unsupported after V9 state
   conversion; and
8. the bounded test-time opening assessment described below confirms an actual
   affordable attack and response for both opening roles.

Eligible pairs are ranked deterministically by profile-character fit, combined
local mobility, centre bias and a seed-derived stable tie break. Ranking never
uses actor identity. Reflection and role-swap tests must expose any hidden
left/right preference.

## Exposure, cover and destructive change

V10 uses terrain geometry rather than an additional cover entity. A profile
meets the cover claim when at least one low trajectory from an admitted start
intersects intervening terrain, while at least one higher affordable trajectory
or bounded repositioning path can still produce a legal attack. Open exposure
means an actor can move from its protected opening toward a supported firing
position during the existing action window.

Existing crater deformation remains authoritative. When a shot removes terrain,
support, falling, later projectile collision and subsequent AI rollouts must use
the mutated packed terrain. V10 adds no separate cached route or decorative
collision truth.

## Opening attack and reply assessment

Runtime pair selection uses bounded geometry only. Actual combat validation is
an engineering acceptance gate over seeds `1`, `2`, `3`, `0x13579BDF`,
`0xC0FFEE11` and `0xDEADBEEF`, their deterministic reflections, and both opening
actors.

For every assessed opening:

- initialize normal V10/V9 resources and action state;
- evaluate the unchanged finite V9 offensive search space against V10
  transitions;
- require at least one affordable legal plan for each actor that completes its
  turn without `simulation_limit`;
- require at least one actor plan to demonstrate terrain cover by replacing a
  blocked shallow attempt with a higher shot or bounded repositioning;
- execute the selected first turn, preserve its terrain mutation, and require
  the responding actor to complete a legal attack or a supported tactical
  repositioning turn;
- reconstruct the exact operation stream and compare every final hash; and
- compare the reflected/role-swapped carrier for first-side, elevation and
  no-legal-plan bias.

The gate records outcomes descriptively. It blocks work failures, invalid
states, missing replies and systematic geometry exclusion; it does not invent a
win-rate promise from this small deterministic matrix.

## Loomkeeper boundary

V10 initially reuses V9's 180-plan lattice, 30 charged planning ticks,
per-candidate rollout cap, total work cap, affordability rules and deterministic
tie order. A thin V10 adapter may translate state identity around the existing
mechanics, but it may not silently change V9 or its historical AI outcomes.

If the unchanged search cannot find legal V10 openings or replies, stop and
amend this contract before changing lattice size, aim values, movement scripts,
ranking, work accounting or Render clock-debt limits. A terrain failure is not
permission to expand AI cost implicitly.

## Client, camera and guidance

- Add an isolated `?combat-preview=v10` candidate using the existing compact
  V9 controls, explicit Fire action, upper-left Pause control, anchored Stitching
  displays and approved Patch presentation assets.
- The opening survey must frame both starts when possible, then return to the
  active actor. If the opponent is off-screen, a clear directional cue must be
  visible before movement begins.
- Camera framing follows actual map-specific starts and post-destruction actor
  positions; no V7/V9 fixed-coordinate assumption is allowed.
- The profile name may appear in non-blocking status copy. No map selector,
  minimap, editor or new permanent HUD panel is added.
- All core actions remain touch/pointer operable in the default sideways phone
  composition, maintained portrait escape hatch and actual landscape view.

## Authority and deployment boundary

V10 first enters through injected simulation/protocol tests and the local
query-gated preview. A later bounded slice may add an explicit no-reward
development Practice profile for phone acceptance. Ordinary startup, public
Practice, Daily Challenge and reward selection remain unchanged until separate
promotion evidence exists.

No V10 path may enable monetary services, weaken origin/session/sequence
ownership, alter settlement, or accept terrain/start data from the client.

## Implementation sequence

1. **V10A — contract and observation (complete):** freeze this product
   contract, register the behavior record, and change no runtime code.
2. **V10B — deterministic authority (complete):** add V10 terrain/profile
   generation, opening selection, state identity, strict protocol/replay
   dispatch and focused historical-preservation tests.
3. **V10C — playable candidate (complete):** adapt the unchanged bounded
   Loomkeeper, render the V10 Patch in the existing phone scene, and expose
   only the local query-gated preview.
4. **V10D — assessment and acceptance (complete):** run the opening/reply
   matrix, selected product checks and phone-browser journey; then separately
   record real-device acceptance and request any public promotion.

Each step must update the existing WP-015D4A evidence before the next begins.

## V10A changed-path boundary

V10A is documentation and evidence only:

```text
README.md
docs/evidence/wp-015d4a-v10-terrain-tactics-behavior-record.md
docs/evidence/wp-015d4a.json
docs/planning/implementation_plan.md
docs/planning/wp-015d4a-v10-terrain-starts-contract.md
legal/clean-room-records.json
legal/source-manifest.json
```

## V10A verification and stop condition

Run the selector dry-run and selected checks, clean-room/work-package gates,
documentation link inspection, `git diff --check` and housekeeping. A game
build, browser matrix, PostgreSQL gate and daily release suite are intentionally
outside this documentation-only step.

Stop V10A with the runtime still unchanged and the execution pointer naming
V10B deterministic authority as next. The V10 engineering candidate and the
clean-room lifecycle remain `in_progress`.

## V10B implementation boundary

V10B adds a separate `nimble-knots-artillery-v10` state and replay identity.
It generates the three contracted profiles as packed, surface-only collision
terrain; deterministically ranks profile-specific starting pairs; wraps the
unchanged V9 transitions; and reconstructs V10 operation streams through the
versioned coordinator. The current combat selector remains V7.

V10B has no socket events, SessionRegistry admission, automated Loomkeeper,
query preview, reward route, deployment selector or player-visible behavior.
Those exclusions prevent an authority foundation from being mistaken for a
playable candidate.

The implementation and focused tests are limited to:

```text
shared/simulation-v10.ts
shared/protocol-v10.ts
server/src/simulation/coordinator-v10.ts
server/src/simulation/versioned-coordinator.ts
tests/protocol/terrain-starts-v10.test.ts
tests/simulation/terrain-starts-v10.test.ts
tests/simulation/terrain-starts-v10-replay.test.ts
```

V10B closes when types, protocol, simulation, replay reconstruction,
historical dispatch, selected repository checks, build outputs and built smoke
pass.

## V10C implementation boundary

V10C adds an identity-only adapter around the unchanged V9 planner. The adapter
retains all 180 candidates, six candidates per tick, 30 charged planning ticks,
the per-candidate and total rollout caps, affordability, rank and deterministic
tie order. It gives the planner a detached V9-compatible clone, then applies
the selected operation cursor only through V10 transitions so the terrain
profile and current destructible terrain remain authoritative.

The local `?combat-preview=v10` fixture owns the real-time tick loop and bounded
Loomkeeper response. It is lazy-loaded, has no socket, SessionRegistry, replay,
reward or deployment-selector path, and does not alter ordinary Practice. Its
presentation reuses the compact V9 action drawer, explicit Use button,
upper-left Pause control, actor Stitching cards, movement/projectile effects and
off-screen actor controls. V10 begins with a three-second full-map survey and
returns to the player camera; player input or a browser interruption completes
that return immediately.

Focused adapter, fixture and canonical phone-browser checks cover frozen V9
selection parity, exact work caps, V10-only transition execution, completed AI
projectile response, detached trajectory preview, local-only routing, the
opening survey, interruption recovery, compact controls, actor cards and the
directional Loomkeeper cue. V10D completes the six-seed opening/reply matrix,
selected product gate and physical-phone acceptance recorded below.

## V10C inherited Relic-selection correction

The owner initially passed the deployed V10 phone journey, then found the
previously tracked V9 Relic-selection failure while explicitly changing the
attack. The shared compact controls required Use once to acknowledge a locally
held selection, silently cleared an existing aim, and required another aim and
Use before casting. This made the red control appear unresponsive whenever the
player changed away from the carried/default Relic.

The owner-directed fast-follow changes only the shared V9/V10 control adapter
and its tests. Attack drawer choices now submit the cost-free authoritative
selection immediately; current selection and the next aim step are explicit;
Use activates only the eventual cast. Guard and Leap still require Use. V10
terrain, starts, planner budgets, simulation/protocol/replay identity, local-only
routing and all public selectors remain unchanged. The subsequent correction
and accepted physical-phone retest are recorded below.

The first redeployed correction still allowed the player to begin aiming while
the Relic request was pending. On a phone, that let selection authority arrive
after the aim lock and clear it as required by the simulation. The follow-up
holds aim unavailable until selection settles, keeps the selected Relic through
the following aim acknowledgement, and removes Relic value changes from the
client's lifecycle-boundary key. The default clockwise phone path now carries
the selection-to-aim-to-Use browser proof. The owner confirmed that exact order
on the redeployed physical phone on 2026-09-08.

## V10D assessment and acceptance

`npm run assess:v10` executes the frozen 24-opening matrix: six contract seeds,
their generated and assessment-only mirrored carriers, and both opening actors.
Every opening runs the unchanged 180-plan V9 lattice through V10 transitions,
replaces a terrain-blocked shallow shot with a legal higher or repositioned
attack, carries the resulting terrain into the other actor's selected reply,
and reconstructs every recorded operation, event and state hash. The report is
retained under ignored `.cache/assessments/` so browser cleanup cannot erase it.

The accepted matrix has 48 selected turns and 24 cover probes, with zero
`no_legal_plan`, work, invariant, rollout-cap or reconstruction failures. All
three profiles contribute eight rows. Opening actors and physical opening sides
split 12/12, while the rising-braid elevated side splits 4/4 under reflection.
Seventeen selected first turns deform terrain; the other seven are direct hits
whose unchanged terrain is also carried exactly into the reply. These are
engineering acceptance facts, not a win-rate or balance promise.

The selected product gate, canonical Chromium phone journey and performance
gate pass. The owner reports the pushed `941c851` V10 preview and corrected
Relic selection-to-aim-to-Use sequence working as expected on the physical
phone. V10D changes only assessment, routing and records, so it does not
invalidate that runtime acceptance. PostgreSQL and the full Ubuntu release
matrix remain separate gates. Ordinary Practice and Daily Challenge still use
their current public ruleset; promoting V10 requires a separate owner decision.

## V10E tactical terrain refinement

The owner found that the accepted V10 profiles provided cover and elevation but
did not create a meaningful reason to use the inherited jump. The original
contract required every adjacent rise on the opponent route to remain walkable;
that requirement made traversal reliable by removing the tactical choice. V10E
replaces that requirement only for its new profile family. The accepted V10
generator and its replay reconstruction remain available unchanged.

V10E uses ruleset ID `nimble-knots-artillery-v10-r1`, format/ruleset version
`10`, and three new profile IDs. The distinct ruleset ID binds the new terrain
to snapshots, hashes and replays without changing an existing V10 seed under
the old identity.

| Profile ID | Opening separation | Required tactical character |
| --- | ---: | --- |
| `twin-hollows` | 512 | Level protected openings face a broad central crest with paired 48-unit jump approaches. |
| `broken-loom` | 576 | Level opening pockets face paired 32-unit firing shelves separated by a central low notch. |
| `high-stitch` | 640 | Reflection alternates a 32-unit opening-height advantage while each side retains a separate 32-unit jump lookout. |

The V10E opening selector admits a pair only when:

1. both actors retain the existing 64-unit supported outward retreat;
2. each actor has an inward tactical landing position 64 units from its start;
3. that position is 24 to 48 units above the opening and has body-clear,
   actor-width support;
4. at least one rise on that inward segment exceeds the inherited 16-unit
   automatic walking step, so walking cannot silently substitute for jumping;
5. the existing normal jump reaches and lands on the position in simulation;
6. shallow fire from the opening meets terrain while a legal higher or
   repositioned attack remains available; and
7. the complete first attack, resulting terrain and other actor's reply remain
   deterministic and reconstruct exactly.

The battlefield remains one surface with solid terrain below it. V10E adds no
cave, overhang, floating island, lethal gap, obstacle entity or collision
layer. Jumping offers a more exposed firing position; it is not mandatory for
an opening attack, so a player who stays in cover can still act. Existing
crater deformation can remove cover or shelf support and remains the sole
terrain authority after a shot.

The inherited V9 planner lattice, movement physics, resource rules and action
timings remain unchanged. The combined `npm run assess:v10` gate now evaluates
both V10 identities across the six frozen seeds, generated and mirrored
carriers, and both opening actors: 48 openings, 96 selected turns and 48
shallow-cover probes. A separate local route,
`/?combat-preview=v10e`, exposes the refined candidate while
`/?combat-preview=v10` keeps the accepted original. Neither route creates a
session, reward, database or public selector path. Physical-phone terrain feel
and readability remain a separate owner acceptance gate after deployment.

## V10F deterministic surface-grammar preparation

The owner authorized a bounded return to terrain-engine research after V10E.
The exact sources, revisions, inspected paths, license boundaries and adopted
design ideas are frozen in the
[V10F procedural-terrain reference pack](../evidence/wp-015d4c-v10f-procedural-terrain-reference-pack.md).
That record supersedes the earlier no-reopen instruction only for this
observation. Sorcerers remains GPL quarantine/reference-only, and no external
code, map, template, asset, constant or pixel enters product paths.

V10F starts by extracting the accepted V10/V10E row construction behind a
product-owned generator seam. The compatibility path keeps the same seed
normalization, xorshift sequence, phase, variation, reflection, authored rows
and packed-mask conversion. The six accepted assessment-seed V10 state hashes
remain the exact compatibility gate; V10E is exercised by its existing
determinism, traversal and assessment tests.

The initial unselected prototype established the fixed eight-candidate and
tagged-parameter seam. The implemented compiler now applies each selected
family's complete typed operation sequence. Adding or removing an unrelated
parameter cannot silently shift subsequent choices. Every candidate produces
one surface row per collision column in the existing 34-to-54 row envelope.
It uses no wall clock, unbounded retry, file input, network input, dependency
or decorative pixel data.

### ASCII chart and recipe authority

V10F uses compact ASCII charts to communicate the intended silhouette and
tactical purpose of an authored level family. A free-form Markdown chart is not
runtime input: whitespace, escaping and line wrapping make it unsuitable for
replay authority. Each chart must have one machine-readable product recipe,
and the tooling must render a normalized ASCII preview from that recipe. The
generated preview, recipe operation list and sampled height signature stay
together so documentation drift is visible in review.

The existing terrain contains 256 collision columns, each eight world units
wide, across the 2048-unit arena. V10F introduces a separate 32-column authoring
grid. One authoring column expands to eight collision columns, or 64 world
units. Operation spans below use authoring columns; final collision and replay
state still contain all 256 surface samples. Ramps and curved operations are
rasterized over the expanded columns with fixed integer interpolation and
rounding. Surface row numbers increase downward, so a negative delta raises
terrain and a positive delta lowers it.

A recipe contains:

- a stable recipe/profile ID and revision;
- an ordered list of typed operations in 32-column authoring coordinates;
- parameter ranges owned by that recipe;
- `mirror`, `seed-reflect` or `none` transformation policy;
- named start pockets and required jump/cover landmarks; and
- family-specific tactical assertions used by admission and assessment.

The supported recipe operations are:

| Operation | Integer surface effect | Authoring span | Admission note |
| --- | --- | ---: | --- |
| `plateau` | Hold the current row | 3-5 columns | Must retain actor-width support where used for a start or landing. |
| `ramp` | Change the row by 1-3 over the complete span | 2-4 columns | Expansion must keep every adjacent collision step walkable unless the boundary is explicitly a jump landmark. |
| `hollow` | Lower terrain by 2-5 rows using a bounded bowl | 3-6 columns | An actor-accessible hollow must have a supported normal exit and may not become a spawn trap. |
| `ridge` | Raise terrain by 3-6 rows using a bounded crest | 3-5 columns | May block shallow fire but must leave an affordable legal attack path. |
| `jump-shelf` | Hold a raised landing 3-6 rows above its takeoff | 2-3 columns | The 24-48 world-unit rise preserves the accepted V10E jump-only range; two rows would remain walkable and is therefore excluded. |
| `notch` | Lower a narrow surface section by 3-5 rows | 1-2 columns | This remains a depressed surface, never an empty vertical gap. A literal one-cell collision notch is not treated as actor space. |
| `asymmetric-elevation` | Apply a continuous 3-6-row side offset across the midline | up to 16 columns | Seed reflection must alternate the high side, and both reflected openings must pass the same legal-action gates. |

### Initial authored recipe families

The first V10F family is exactly four recipes. Names describe tactical intent;
all geometry remains generated from bounded integer parameters.

#### Twin Crests (`twin-crests`)

Sequence: `plateau` -> edge `ridge` -> `hollow` -> `jump-shelf` ->
`notch` -> center `ridge` -> `notch` -> `jump-shelf` -> `hollow` ->
edge `ridge` -> `plateau`.

The recipe is mirror-symmetrical. Both starts occupy protected pockets, the
center crest blocks a shallow direct shot, and each side can jump forward to a
supported exposed firing shelf. Admission requires a legal arcing attack from
cover and a legal attack after reaching either shelf.

#### Asymmetric Rampart (`asymmetric-rampart`)

Sequence: high `plateau` -> `asymmetric-elevation` -> `ramp` ->
`jump-shelf` -> `notch` -> `hollow` -> cover `ridge` -> low `plateau`.

One opening receives immediate elevation and less shelter; the other receives
a deeper protected pocket and an ascending route. `seed-reflect` alternates
which physical side is high. Admission runs both reflections and both opening
actors, requires a legal attack and escape route from the low pocket, and
rejects a layout when the bounded opening assessment cannot find a legal first
attack and reply for both the high and low openings.

#### Trench Needle (`trench-needle`)

Sequence: `plateau` -> `hollow` -> `ridge` -> `notch` -> `hollow` ->
`jump-shelf` -> `hollow` -> `notch` -> `ridge` -> `hollow` ->
`plateau`.

Narrow ridges must block selected shallow trajectories while higher precision
shots remain legal. The assessment must prove that crater mutation can open at
least one previously blocked line without leaving either actor unsupported or
inside terrain. Every notch used for movement must expand to actor-clear width;
narrower notches are projectile geometry only.

#### Stepping Mesa (`stepping-mesa`)

Sequence: `plateau` -> `hollow` -> `jump-shelf` -> `notch` -> peak
`ridge` -> `notch` -> `jump-shelf` -> `hollow` -> `plateau`.

Forward shelves provide a sequence of offensive positions across multiple
turns. Each contracted jump must be reachable through normal simulation and
land with actor-width support. A missed or declined jump may lead into a
supported hollow, but the hollow must retain a normal exit and a legal action;
the recipe may restrict horizontal fire temporarily but may not soft-lock play.

### Deterministic recipe compilation and selection

For a normalized seed, V10F performs the following fixed work:

1. choose a recipe family by stable seed mapping;
2. derive each recipe parameter from its own recipe/revision/parameter tag;
3. emit exactly eight candidate recipes at indices zero through seven;
4. compile each 32-column recipe to exactly 256 bounded surface rows;
5. pack those rows through the existing `PackedTerrain` mask writer;
6. run the fixed structural and projectile-preflight admission gates and reject
   failures;
7. rank admitted candidates lexicographically by family landmark fit,
   worst-side legal preflight options, worst-side local mobility, center bias,
   a stable seed-derived tie break and finally candidate index; and
8. use a fixed product-owned fallback recipe when none is admitted.

Runtime generation may evaluate only bounded integer geometry, movement and
direct projectile preflights. It must not execute the 180-plan Loomkeeper search
for each of eight candidates or turn wall-clock performance into map authority.
The complete planner response after representative first attacks belongs to
the offline V10 assessment and the 22:00/release suite. Recipe parameter ranges,
their boundaries and the fixed fallback remain the runtime safety envelope.

The generated normalized ASCII preview is a review artifact from step four. It
does not affect selection, collision, state hashes or replay reconstruction.
Replay-distinct `nimble-knots-artillery-v10-r2` binds its ruleset ID,
recipe/profile ID, recipe revision, selected candidate index and complete
packed terrain state. The implemented local route is
`/?combat-preview=v10f`; it does not promote Practice, Daily Challenge or
rewards. Its optional `terrain-seed` parameter accepts canonical positive
32-bit decimal seeds and otherwise falls back to seed 1. The fixed review set
is seed 1 for authored Asymmetric Rampart, seed 5 for its reflection, seed 2 for
Trench Needle, seed 3 for Stepping Mesa and seed 4 for Twin Crests.

The preparation commit did not add a ruleset ID, replay schema, selector,
browser route or public runtime behavior. Stages 1-4 then added internal
candidate admission/ranking and replay-distinct R2 authority without a browser
route or public runtime behavior. The current preview stage adds only the
query-gated local fixture, deterministic review metadata and phone-browser
acceptance. The combined runtime and assessment gates are:

1. actor-width support and body-clear starts inside safe world margins;
2. supported outward movement and an inward jump that lands through normal
   simulation without allowing walking to substitute for that jump;
3. meaningful shallow cover with an affordable legal high or repositioned
   attack from both opening roles;
4. offline proof of a bounded legal Loomkeeper response against the exact
   terrain resulting from representative first attacks;
5. exact reconstruction of selected candidate, opening, operations, events and
   state hashes; and
6. a deterministic ranking tuple, seed-derived final tie break and fixed
   product-owned fallback when no candidate is admitted.

Those gates now pass for R2 authority and the local phone preview. The preview
retains the existing opening survey, compact action guidance, actor cards,
camera cues, movement, attacks and automated Loomkeeper response. Automated
acceptance verifies local isolation, all review seeds and a normal jump from
the default case. Physical-phone terrain readability and feel remain an owner
gate. WFC remains a possible later generator behind the same seam. Caves,
overhangs, floating terrain and a rendering rewrite remain deferred while
movement and terrain-top presentation assume one solid surface per column.

The recipe tests additionally render and snapshot each normalized ASCII chart,
check all 32 authoring samples and 256 collision samples, cover every operation
at its minimum and maximum span/delta, and exercise all four recipes under both
physical sides and opening actors. Phone acceptance checks that crests, pockets,
shelves and current action guidance remain readable without reducing the clear
arena or touch-target sizes.

### Owner phone review and deferred tactical effectiveness

The owner confirms that the aiming correction works and the triggerable
gameplay checks pass. The terrain does not yet deliver the expected tactical
effect with the current gravity-curved projectile trajectories. The owner
explicitly defers that problem to a future step. Retain the implemented
generator and preview; this acceptance does not assert that cover, firing
shelves or destruction already produce satisfying tactical choices.

The future terrain/ballistics tuning step must assess actual weapon arcs,
positions and impact outcomes together with terrain geometry. A blocked
horizontal line alone is insufficient evidence of useful cover. Do not infer
authorization to add straight-shot weapons or change gravity from this report.
Physical-device approval of future tactical effectiveness and public promotion
remain separate decisions.

## V10G terrain and weapon tactics preparation

Status: **WP-015D4D V10G complete.** The owner accepted Twin Crests at
`c52fc28`, then the expanded family implementation at `8e40a82` on a physical
phone and explicitly requested closure. Selected verification passed, including
67 canonical phone-browser cases. Closure starts from `d796232`, whose extra
background-direction documentation does not change this gameplay scope.
Single-owner direct review and the source-boundary record are complete; no
independent review is claimed. Full daily/Ubuntu/PostgreSQL release gates,
merge and public activation remain separate. No next implementation is started.

### Outcome and first playable scope

Prove one complete loop on Twin Crests: a pocket protects against direct fire;
a normal jump to a shelf unlocks a useful precision attack but exposes the
attacker; a lob can reach over cover; a deliberate breach changes a subsequent
attack or movement option. All claims must hold in actual simulation for both
actors. A blocked test trajectory alone does not prove a tactical benefit.

Use existing Twin Crests seed 4 as the initial reproducible case. Preserve its
R2 version; if the geometry needs tuning, bind the new recipe revision to the
new ruleset. Keep the 32-column recipe/256-column mask workflow and generated
ASCII review diagrams. No ASCII parser or level editor is required.

### Binding geometry-first implementation contract

Owner requirement: terrain must be built from combat clearance requirements,
not generated from illustrative heights and judged tactical afterward. Phone
feedback reports obstacles too low and pockets too shallow; retain this as the
baseline failure to reproduce, not a measured diagnosis until inspected.

Before tuning weapon damage or generating the R3 layout, record a versioned
combat-dimensions table from authoritative code: actor damage hitbox and support
position, launch origin for each facing, projectile collision size, swept-contact
rules, jump envelope and landing/body clearance, blast reach and shielding rules.
Use world units and explicit conversions to recipe heights and collision cells;
rendered sprite bounds must not substitute for the actual damage hitbox.

Derive and record pocket depth/width, ridge height/thickness and shelf height,
width and spacing from that table. Round conservatively to the mask grid and
state clearance margins. The earlier illustrative grammar height ranges are
not acceptance limits. Preserve Twin Crests' intent, not its existing dimensions.

- A protective pocket must shelter the full damage hitbox against its declared
  incoming weapon/position envelope, including edge contacts and splash. Ridge
  height alone is insufficient: use actual muzzle positions and collision paths.
- Protection is weapon-specific. Label which attacks cover stops and which can
  reach it; do not claim universal safety. A legal Threadball lob may enter the
  pocket, but unexplained damage through a ridge cannot count as protection.
- Cover must permit a supported spawn, legal escape and the intended affordable
  lob. Taller geometry must not trap an actor or exceed the available jump budget.
- A shelf must support the full body and unlock an actual hit on the opponent's
  hitbox from the real launch origin. Prove its exposure cost with a counterattack;
  altitude or an unobstructed decorative sightline alone is not an advantage.

Use these constraints in recipe construction and bounded terrain admission.
Reject candidates that fail their declared protection, escape or advantage
requirements; do not admit them on silhouette or one blocked ray alone. Bound
generation attempts and use only a validated deterministic fallback, or report
unavailability if none exists. Keep broader tactical comparisons offline.
Changes to hitbox, projectile, blast or movement dimensions must invalidate or
rerun the affected terrain witnesses; geometry and combat rules are one versioned
compatibility contract.

### Proposed Relic contract

#### First implementation checkpoint: measured geometry

Implementation/evidence: [WP-015D4D](../evidence/wp-015d4d.json),
`shared/terrain-geometry-v10g.ts` and
`tests/simulation/terrain-geometry-v10g.test.ts`.

| Authority quantity | Measured value / consequence |
| --- | --- |
| Physical movement body | Radius 12; 24 by 24 world units. |
| Direct projectile target | Half-width 32, top 85 and bottom 13 relative to actor root; 64 by 98 extent. Root is 12 units above support, so the head is 97 units above ground. The inherited bottom extends one unit below support. |
| Terrain resolution | 8 world units per mask cell; 64 per authoring column. |
| Cover rise prerequisite | At least 112 units: 97-unit head clearance plus one 8-unit margin, rounded upward to the mask grid. Actual incoming attack envelopes may require more. |
| Pocket/shelf width prerequisite | At least 80 units: 64-unit target width plus one cell margin on each side. This is not a guaranteed safe movement envelope. |
| Normal free jump | Actual discrete authority reaches 124 units of rise and returns to starting height after 63 ticks/world units of forward drive. Obstacle landing still requires simulation. |
| Single-jump rise with margin | 112 units; tests verify actual landings from both directions on a 112-unit ledge, while walking stops below it. |
| Existing launch origin | Root plus facing times 16 horizontally, minus 4 vertically; inherited projectile is a swept point and gains 80 fixed-point vertical velocity per tick. Candidate launch/blast rules still need calibration and authority tests. |

Seed 4's R2 Twin Crests fails the new full-height horizontal protection
prerequisite from both sides. A 40-unit barrier also fails; a 112-unit barrier
passes this geometric prerequisite. A separate actual-authority paired shot
from elevated ground deals 45 damage behind the 40-unit barrier and zero behind
the 112-unit barrier, with identical Threadball launch/aim and actor positions;
both firing directions pass. These are executable reproductions, not
claims that a new map or all weapon interactions are accepted. The helper checks
all above-ground target rows and requires blocking material outside the hitbox.
It deliberately does not equate horizontal occlusion with tactical admission.
At that checkpoint, blast policy, angled attacks, candidate terrain generation
and real damage witnesses remained the next work. R3 progress is recorded below;
historical physics and generation remain untouched.

#### Candidate weapon roles

The following implementation table now binds the first R3 candidate. Changes
to accepted replay semantics require a new ruleset/recipe revision, not edits
to historical V5/V7/V8/V9/R2 tables.

| R3 Relic | Min/max launch speed (fp/tick) | Gravity (fp/tick/tick) | Direct damage | Crater radius | Splash radius | Thread |
| --- | --- | --- | --- | --- | --- | --- |
| Threadball | 1459 / 4864 | 80 | 45 | 40 | 64 | 2 |
| Needlepoint | 1536 / 5120 | 0 | 60 | 8 | 8 | 3 |
| Spoolburst | 1459 / 4864 | 80 | 25 | 80 | 48 | 5 |

R3 uses the inherited point projectile and launch origin. Its sweep includes
the muzzle and checks terrain before overlapping damage hitboxes. Splash uses
the **intact pre-impact mask**, before excavation, and starts at the last free
sweep point (the impact point for actor contact). A muzzle inside solid terrain
has no free origin and cannot leak splash through that material. A fixed nine
samples cover the damage rectangle's corners, edge midpoints and centre. Solid
cells block each sampled ray, including endpoints; radial falloff uses the
nearest exposed sample within the Relic's splash radius. An actor's direct
contact still receives its direct damage; Guard retains its inherited absorption.
The target rectangle extends one unit into the physical support plane, so those
buried bottom samples are shielded by the floor. No flood fill, post-crater
shielding, knockback, guidance or bouncing is introduced.

#### First playable candidate and evidence

`shared/terrain-generation-v10g.ts` derives one deterministic Twin Crests recipe
from combat clearance: pocket floor 448, shelf surface 336 (112 rise), centre
crest 328 (120 rise), 256-unit pockets and 128-unit firing shelves. Openings are
760 and 1288; approach to 800/1248 then normal jump reaches a shelf. The centre
crest retains one cell of clearance below a level shelf muzzle. Thirty-two
authoring rows expand to 256 mask columns and a generated 32-by-16 ASCII review.
This R3 compiler does not apply V10F's old height clamp. It validates dimension
and horizontal-occlusion prerequisites and fails unavailable if they fail; no
unvalidated fallback or random search exists. With one fixed geometry, the
actual-authority witnesses below are its offline admission gate. Broader runtime
candidate selection must not precede their extension to every new candidate.

Implemented witnesses in `tests/simulation/terrain-tactics-v10g.test.ts`:

- Needlepoint from pockets is blocked; a 60-degree, full-power Threadball lob
  deals 45 damage into cover, while the nearby 55-degree shot fails. Both sides
  pass. Spoolburst on the successful lob deals only 25 damage.
- Pocket boundary positions are tested with precision aimed at head, centre
  and feet from the opposing pocket and shelf, in both directions. This declares
  a precision-fire protection envelope, not invulnerability to lobs or all
  future weapons.
- A real normal jump enables a 60-damage shelf-to-shelf precision hit and exposes
  the jumper to the corresponding counterattack. Walking alone cannot climb it.
- After legally earning five Thread, a 45-degree Spoolburst opens a supported
  route: the same 120-tick later walk progresses 60 extra units left-to-right
  and 53 right-to-left. Both exceed the 48-unit witness requirement. Integer
  impact sampling at opposite cell faces and crater rasterization account for
  the sub-cell difference; exact mirrored destruction is not claimed.
- Thin-wall and blocked-muzzle tests prevent direct/splash leakage even when
  the same impact removes the shielding cells. Both directions pass.
- R3 planner tests retain 180 slots/30 planning ticks and identical cached versus
  uncached results. R3 precision angles and a 40-tick jump approach are explicit
  candidate choices; legacy V9 candidates stay unchanged. A breach and subsequent
  AI response reconstruct through the coordinator with exact final state/hash.

The first-map checkpoint used **`/?combat-preview=v10g`**, fixed to seed 4.
The expanded route below now supersedes that query selection. Existing `sideways=left`/`sideways=off` options remain.
Selection deliberately retires an old aim; fresh aim preserves the selected
Relic and its preview uses actual R3 flight. Attack choices show Lob, Precision
and Breach only for V10G R3/R4. Full role mechanics are isolated from public sessions,
wallets, rewards and R2 preview routes. Phone review must check the covered
silhouette, walking up to a wall then jumping onto it, lob versus precision,
later-turn breaching, aiming/selection, pause/restart and the AI response.
The owner accepted this first map at `c52fc28`, clearing family expansion.

### Expanded family catalogue (R4)

`nimble-knots-artillery-v10-r4` binds `v10g-families-r1`, candidate index zero.
It reuses R3 weapon rules unchanged. R3 reconstruction still generates the old
Twin Crests map for every seed; R4 must never reinterpret an R3 recording.
The finite catalogue has five entries, selected by `(normalizedSeed + 1) % 5`.
There is no random retry or unvalidated fallback. Phone selection is deliberately
restricted to these named review maps; missing/unknown names select Twin Crests.

| `terrain-map` | Seed | Geometry and tactical purpose |
| --- | --- | --- |
| `twin-crests` (default) | 4 | Accepted 448-floor pockets, 336 shelves and 328 centre crest. |
| `trench-needle` | 5 | Same protected pockets; 128-wide ridges at 336 surround a 128-wide central notch down to 448. Ridge fire clears the notch; dropping loses the lane and requires a tested ordinary jump out on either side. |
| `stepping-mesa` | 6 | Same pockets and first shelves; central 128-wide mesa rises another 112 units to 224. Cross-shelf precision is blocked until the second climb and approach to the mesa edge enables downhill fire. |
| `rampart-high-left` | 7 | Left starts exposed at 336, right sheltered at 448. The low side jumps to the 336 shelf to gain a direct lane; the high side has an optional rear 224 shelf. |
| `rampart-high-right` | 8 | Exact surface-row reflection of seed 7, with starts and jump directions reflected. Damage rasterization need not be perfectly symmetric. |

Append `&terrain-map=<name>` to `/?combat-preview=v10g`. Existing sideways
options remain. Preview, live simulation, AI and replay all bind R4 explicitly;
no public Practice, session, wallet or reward route is opened.

All layouts retain 32 authoring columns expanded into 256 collision columns,
with generated ASCII from the exact rows. Runtime admission checks the bounded
surface, full-body opening clearance, actual contiguous pocket/shelf widths,
112-unit cover margin, supported takeoff/landing and ordinary jump envelope.
The finite authored catalogue is additionally admitted by offline authority
witnesses; these runtime geometry prerequisites are not a universal tactical
validator for arbitrary future recipes.

Family witnesses include pocket head/centre/feet boundary shots from opposing
pockets/shelves; ordinary walking versus every declared jump; affordable lob
alternatives on both sides; low-pocket breach followed by supported movement;
and complete AI response/reconstruction after mutation for all five seeds.
Mesa also requires two actual consecutive climbs and a walk to its exposed edge
before the downhill precision hit. Rampart high ground is intentionally not a
protected pocket: low-side shelf fire and the reverse countershot each deal 60.
The low-side opening lob reaches high ground only for 6/7 splash damage at the
recorded 60-degree/full-power setting, versus 45 from high to low. These are
tradeoffs, not a balance or equal-win-rate claim. Planner work remains bounded
at 180 candidates/30 ticks; multi-jump optimization is not added.

No new source inspection, code import or asset use is involved. The existing
frozen reference pack and clean-room record remain the reference provenance.
Expanded-family phone acceptance is recorded and V10G is closed. Public
promotion still requires a separate decision and release qualification.


| Relic | V10G role | Required tradeoff |
| --- | --- | --- |
| Threadball | Retain the familiar gravity-driven lob and baseline impact behavior. | Can clear a crest with suitable aim/power; a ridge or pocket must still change which arcs succeed. |
| Needlepoint | Straight, zero-gravity precision projectile with swept collision; stops on the first solid terrain or actor contact. Not hitscan and not terrain-piercing. | More effective direct-hit damage than Threadball, but a smaller crater and splash area; needs an exposed firing lane. |
| Spoolburst | Gravity-driven terrain breacher; one impact, no bouncing in this slice. | Larger crater than Threadball, lower direct-hit damage than Threadball; a miss may still buy a useful breach. |

This deliberately replaces the inherited V5 damage ordering for the new
candidate only. Keep the existing Thread economy/costs, turn phases, movement,
Guard and Leap initially. The implementation table above records the bounded
candidate parameters selected against the Twin Crests witnesses. Preserve those
versioned values and observed tradeoffs before expanding maps, and keep all
historical tables unchanged.
Measure crater radius separately from splash radius; a large excavation must
not silently imply damage through the entire removed area.

Terrain must stop Needlepoint before a character concealed behind it. Preserve
direct-hit/collision ordering deliberately, including near-surface overlaps.
Before geometry calibration, explicitly choose and document the R3 blast model:
radial distance only, terrain occlusion, or attenuation. This contract authorizes
the bounded shielding change needed to satisfy the declared cover requirements;
it does not prescribe an untested occlusion algorithm. Define target hitbox
sampling, edge contacts and whether shielding uses the pre-impact or post-crater
mask. Distance-only splash is acceptable only where dimensions actually keep the
protected hitbox outside its influence. Do not move one test actor farther away
to conceal failures elsewhere in the declared protected area. Report direct,
splash and terrain effects separately and preserve all legacy blast behavior.

### Implementation sequence and ownership

1. **Combat dimensions, terrain constraints, then calibration.** Measure the
   authoritative geometry and choose explicit candidate flight/blast rules.
   Retain failing baseline examples of shallow pockets and low obstacles. Derive
   and implement Twin Crests dimensions and admission from the binding contract
   above before tuning damage. Establish pocket/shelf and intact/breached paired
   witnesses at equal legal Thread/turn budgets. Record a finite parameter table
   and the resulting geometry constraints; do not start a broad optimizer.
2. **Versioned projectile authority.** Implemented
   `nimble-knots-artillery-v10-r3` and the expanded-map R4 identity. Carry per-Relic flight and impact rules through
   simulation, protocol validation, coordinator, hashes and replay. Use a shared
   internal parameter seam if needed, with legacy defaults and explicit version
   ownership; never mutate V5/V7/V8/V9/V10-R2 constants globally.
3. **Preview and AI parity.** Aim previews, live flight, terrain admission and
   Loomkeeper rollouts must use the same candidate rules and current terrain.
   In particular, the V10-to-V9 planner adapter must not erase R3 weapon physics.
   Preserve bounded planner work and measured local preview-computation timing.
   Local route `/?combat-preview=v10g` must retain the
   phone's Actions/Use flow, show concise role/cost guidance and never open a
   session, wallet or reward path. The implemented R4 route defaults to seed 4
   and accepts the documented named family selections.
4. **Twin Crests acceptance.** Run the witnesses below plus phone-browser aim,
   fire, jump, pause/restart and full AI-response checks. Present this one map
   for physical-phone review before generalizing its tuning.
5. **Family expansion.** After the first-map feel is accepted, apply the same
   evidence to Trench Needle, Stepping Mesa and both Asymmetric Rampart
   orientations. Tune recipes when needed, update bounded runtime admission
   and retain expensive multi-turn comparisons in offline assessment.

Expected local owners are `shared/simulation-v8.ts` (inherited flight/impact),
`shared/simulation-v10.ts`, `shared/protocol-v10.ts`,
`server/src/simulation/coordinator-v10.ts`, `shared/loomkeeper-v10.ts`, the
terrain generation/admission modules, and the V10 fixture/scene adapter. Inspect
their callers before choosing the smallest change; this list is not a mandate
to edit every file. At implementation entry create the WP-015D4D evidence
record with the actual starting commit, branch, existing changes and
`execution_mode: single_owner`. Preparation does not rename the current branch
or close historical packages.

### Required tactical witnesses

- **Pocket protection:** a Needlepoint shot toward a concealed opponent hits
  terrain and produces no direct or splash damage to that opponent; repeat
  after the opponent occupies the exposed shelf to establish the contrast.
- **Protection envelope:** test both actors/facings and representative boundary
  positions throughout the declared pocket, including the closest allowed blast
  impact, near-ridge hitbox contact and blocked muzzle cases. Hold weapon and aim
  fixed in paired cases where legal; document any necessary action difference.
  Include deliberately too-low ridges and too-shallow pockets that admission
  must reject, and a blast-rule regression proving the chosen shielding policy.
- **Useful jump:** walking cannot substitute for the contracted jump; landing
  on the shelf creates a previously unavailable precision hit. Verify the
  corresponding increase in exposure using the opponent's actual attacks.
- **Lob alternative:** a legal affordable Threadball arc reaches an opponent
  behind the crest while Needlepoint is blocked. A nearby angle/power miss must
  have a physically explainable terrain impact or overshoot.
- **Consequential breach:** Spoolburst changes the collision mask and opens a
  previously blocked attack or a supported traversable route. Replay a concrete
  subsequent action to prove the benefit; removed-cell count alone cannot pass.
- **Real choice:** pocket/lob, shelf/precision and breach/follow-up each have a
  documented benefit and cost. Include situations where each is useful; do not
  demand that every action be optimal in every position or equate equal damage
  with balance.
- **Continuation:** both sides remain supported or settle legally after impact,
  the AI selects and completes a response on the resulting terrain, and all
  operations/events/final hashes reconstruct exactly. Preserve R2 golden cases.

Report actor positions and hitbox bounds, launch origins, geometry dimensions
and clearance margins, declared protection envelope, aim/power, Relic, costs,
terrain revision, blast policy/mask revision, collision
target, damage, and the follow-up action for every witness. Use the actual
authoritative launch/collision rules instead of a separately approximated test
trajectory. V10F admission already includes gravity; V10G must improve its
tactical criteria rather than claim to add curved-flight checking for the
first time. Keep runtime candidate selection fixed and bounded; assess broader
position/weapon comparisons offline.

### Reference observations and implementation boundary

Owner-authorized source inspection used the existing ignored Sorcerers checkout
at [`0f45c4920321c0a3a14de30fe5cf44131a38da89`](https://github.com/lorgan3/sorcerers/tree/0f45c4920321c0a3a14de30fe5cf44131a38da89).
The source remains GPL-3.0 quarantine/reference only. These are code-observed
behaviors, not evidence from playing or benchmarking Sorcerers:

| Inspected path under `src/data/` | Observation | V10G disposition |
| --- | --- | --- |
| `spells/fireball.ts`, `collision/simpleBody.ts` | Gravity, terrain bounces and intermediate/final explosions. | Distinct terrain responses inform the design; bouncing is deferred. |
| `spells/magicMissile.ts` | Steering changes direction and suppresses gravity while controlled; collision detonates. | Guided flight is deferred. |
| `spells/zoltraak.ts` | Straight beam cuts terrain; shields can stop it. Ordinary terrain is not its simple blocking boundary. | Do not cite it as proof of terrain-blocked precision fire. Needlepoint's blocking rule is a Worms product decision. |
| `damage/explosiveDamage.ts`, `map/terrain.ts` | Explosions remove collision material and apply radial damage/force; inspected target selection has no terrain-occlusion test. | Separate excavation and damage; choose Worms shielding from its cover requirements rather than inheriting this behavior. Knockback remains deferred. |
| `spells/iceWall.ts`, `spells/windBlast.ts`, `spells/bomb.ts` | Temporary collision obstacles, directional pushes and physical proximity-triggered explosives provide additional positional interactions. | All deferred from the first V10G implementation. |
| `damage/fallDamage.ts` (partial read); `spells/rock.ts`, `spells/pebble.ts`, `spells/hairpin.ts` (keyword inspection) | Ancillary observation only; no general falling-damage claim was established from the file name. | No adopted behavior. |

No source code, algorithm implementation, constants, identifiers, artwork, map,
or asset is admitted by this research. Runtime work must use this distilled
contract and local Worms code. The new observation is documented here instead
of changing the hash-bound V10F reference pack. Register this bounded reference
with WP-015D4D at implementation entry; no independent clean-room review is
claimed or required to reactivate retired agents.

### Verification and exclusions

Use selector dry-run/selected verification, then widen to focused projectile,
terrain, replay and AI assessment cases for the new risks. Browser checks must
include immediate default aim/fire and switching Relics before/after aiming.
The full 22:00/release gate and physical-phone acceptance remain separate.
Ubuntu alone owns release visual comparisons. Missing evidence blocks the
specific claim; accepted functionality must not be relabeled as tactical
success. Preparation itself requires documentation/source-manifest checks,
not a game build.

No public Practice/Daily/reward promotion, database work, new asset generation,
guided flight, bounce simulation, knockback, temporary walls, caves, overhangs,
floating islands, engine reset or ASCII editor is included. First-map physical
acceptance precedes any further family expansion or public promotion.
