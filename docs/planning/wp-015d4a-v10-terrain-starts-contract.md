# WP-015D4A V10 Terrain And Starting Positions Contract

Status: V10A finite product contract, V10B deterministic authority, V10C local
playable candidate and V10D assessment/physical-phone acceptance complete,
2026-09-08. Owner-authorized V10E tactical terrain refinement is in progress.
Public promotion remains a separate owner decision.

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
