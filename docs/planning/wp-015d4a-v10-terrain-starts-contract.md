# WP-015D4A V10 Terrain And Starting Positions Contract

Status: V10A finite product contract, V10B deterministic authority, V10C local
playable candidate and V10D assessment/physical-phone acceptance complete,
2026-09-08. V10E implementation and automated acceptance are complete with
physical-phone terrain feel still open. Owner-authorized WP-015D4C/V10F
procedural-terrain preparation is in progress. Public promotion remains a
separate owner decision.

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
packed terrain state. The intended later local route is
`/?combat-preview=v10f`; creating that route will not promote Practice, Daily
Challenge or rewards.

The preparation commit did not add a ruleset ID, replay schema, selector,
browser route or public runtime behavior. The following stages 1-4
implementation adds internal candidate admission/ranking and replay-distinct
R2 authority while still adding no browser route or public runtime behavior.
Its combined runtime and assessment gates are:

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

Those gates now pass for the internal R2 authority. A local phone preview is a
separate next step and remains unimplemented. WFC remains a possible later
generator behind the same seam. Caves, overhangs, floating terrain and a
rendering rewrite remain deferred while movement and terrain-top presentation
assume one solid surface per column.

The recipe tests additionally render and snapshot each normalized ASCII chart,
check all 32 authoring samples and 256 collision samples, cover every operation
at its minimum and maximum span/delta, and exercise all four recipes under both
physical sides and opening actors. Phone acceptance checks that crests, pockets,
shelves and current action guidance remain readable without reducing the clear
arena or touch-target sizes.
