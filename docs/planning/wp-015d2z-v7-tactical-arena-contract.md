# WP-015D2Z V7 Tactical Arena Candidate Contract

Status: complete on 2026-09-01. Implementation commit
`b086479ca736200db3daca438c8698403b306569` and bounded repair commit
`3654c2bf2eb4c0d85229384b97984b28003a9fc6` passed the declared feature,
historical, analytical-reentry, clean-room, and source-boundary gates.

## Purpose and protected outcome

V7 is a separately versioned, plausible intermediate tactical-arena candidate
for the playable marketing branch. It replaces V6's shallow random walk and
fixed actor coordinates only for new V7 matches with deterministic,
surface-only terrain profiles and a terrain-valid, balance-aware opening pair.
It preserves the accepted V5 Relic profile and V6 movement corrections.

This package does not claim final balance. Its bounded claim is that every
declared V7 seed starts on connected terrain that the actual V6 movement model
can traverse, gives both actors valid local movement, retains a 640-world-unit
opening duel, bounds opening height difference, and produces visible terrain
relief without introducing a mechanic the client cannot use.

## Exact source boundary and carrier decision

```yaml
source_boundary:
  repository: Worms_Port
  branch: codex/wp-015d2z-v7-tactical-arena-v0
  starting_commit: 17bd15ed9925168c4920d619415053a2c694feb6
  starting_tree: a64aeead0f4f4cf7a96c00890f78e7b4a6ac46a4
  package_lock_git_bytes_sha256: D4DAC6AE09A3D2F6C5A7EAA11520BAC43F1628320C5331575BCF1E1857073D73
  initial_worktree: clean
  baseline_check_compliance: pass
  baseline_test_simulation: pass_32
  sorcerers_reference_used: true
  sorcerers_pin: 0f45c4920321c0a3a14de30fe5cf44131a38da89
```

No existing planning or evidence carrier describes a V7 ruleset, tactical
terrain profile, or terrain-derived actor-placement lifecycle. The completed
V5 and V6 contracts are immutable predecessors; Lane G is a closed
player-observation preregistration and cannot carry gameplay implementation;
WP-016 already owns retention and distribution. A new WP-015D2Z contract,
evidence record, and frozen reference-observation record are therefore the
narrowest suitable carriers in the existing planning/evidence homes.

The reference observer produced only the frozen behavior record at
`docs/evidence/wp-015d2z-v7-terrain-and-placement-behavior-record.md`. A
different implementation identity must work from that frozen record, the
approved Turtle base, and Worms_Port's V6 contracts without accessing
Sorcerers or quarantine material. A third identity must perform the final
similarity/source-boundary review. Compliance must remain fail-closed until
all three roles and the behavioral tests are recorded.

## Authoritative V7 boundary

`nimble-knots-artillery-v7` receives ruleset, format, snapshot, hash, and replay
identity `7`. V1 through V6 keep their exact terrain generation, spawns,
commands, state hashes, reconstruction, and replay behavior.

V7 retains the 2048 by 576 world, 8-unit terrain cell and movement quantum,
64-unit movement allowance, 24-unit maximum climb, 640-unit opening
separation, V5 Relic launch/damage profile, V6 free turn-in-place and aim
clearing, existing Loomkeeper policy, turn timing, collision, deformation,
Stitching, reward boundary, and presentation assets.

V7 may add a small, code-owned family of deterministic surface profiles. Every
terrain column has exactly one upper surface with solid terrain beneath it;
there are no overhangs, caves, tunnels, disconnected islands, water gaps,
ladders, or obstacle entities. Profile choice and any variation are derived
only from the normalized simulation seed through bounded integer operations.

The actor pair is selected from the generated surface, not copied from a
reference and not stored as a fixed V7 coordinate pair. Every accepted pair
must satisfy all of these checks:

1. each actor has solid support and body-clear terrain placement;
2. each spawn has a safe horizontal world margin;
3. each actor can take at least one valid movement quantum both left and right
   at the opening state;
4. the surface route between the actors is continuous and every adjacent
   movement quantum stays within the existing 24-unit climb bound;
5. opening separation is exactly 640 world units;
6. opening height difference is at most 24 world units; and
7. deterministic scoring prefers the least height-biased pair, then the
   strongest combined local mobility, then closeness to the arena centre, with
   a seed-derived stable tie break.

Generation fails closed if no pair satisfies the contract. No runtime retry,
time-derived seed, hidden fallback to historical fixed spawns, or unbounded
search is allowed.

## Scenario and acceptance boundary

Focused tests must cover seeds `1`, `0xC0FFEE11`, `0xDEADBEEF`, and at least
one seed selecting each profile. The test surface must prove deterministic
same-seed identity, cross-profile variety, support/clearance, margins,
bidirectional local movement, continuous reachability, exact separation,
height tolerance, role-swap parity of the pair score, and a bounded-generation
workload. Historical golden hashes and explicit V4/V5/V6 reconstruction remain
green.

The product acceptance is automated engineering evidence only. No player
observation, interview, playtest, browser/device timing collection, telemetry,
or gameplay instrumentation is admitted. Existing browser smoke may verify
that a V7 snapshot renders and accepts ordinary movement/fire commands, but it
does not become Lane G evidence.

## Preserved governance facts

```yaml
Lane_G_identity_recorded: true
Lane_G_current_evidence: none
Lane_G_execution_open: false
D2O_player_information_timing_gate: unsatisfied
active_execution_pointer: WP-015D2A
aggregate_debt: interrupted_no_tap
ProductAuthority: none
mathematical_placement_implication: none
gameplay_change: true
P5_open: false
landfall_claim: false
pilot_activation: not_required
```

`gameplay_change: true` applies only to this separately versioned V7 product
candidate. It does not edit the Lane G contract, open observation, change a
CRPM verdict, activate a cross-world witness, or advance the analytical
execution pointer. Lane G remains independent of the Stage C aggregate-harness
repair; neither Stage C nor Lane M evidence enters V7.

## Exact changed-path allow-list

Only these paths may change. A newly required path must be added here before it
is edited:

```text
README.md
shared/simulation.ts
shared/protocol.ts
client/src/scenes/combat.ts
docs/planning/implementation_plan.md
docs/planning/wp-015d2z-v7-tactical-arena-contract.md
docs/evidence/wp-015d2z.json
docs/evidence/wp-015d2z-v7-terrain-and-placement-behavior-record.md
legal/clean-room-record.schema.json
legal/clean-room-records.json
scripts/check-clean-room-records.js
tests/tooling/clean-room-records.test.js
tests/tooling/clean-room-lifecycle.test.js
tests/simulation/mechanics.test.ts
tests/simulation/golden-and-properties.test.ts
tests/protocol/schemas.test.ts
tests/protocol/runtime.test.ts
tests/relics/relics.test.ts
tests/tactical-model/v5-marketing-candidate.test.ts
tests/combat/combat.test.ts
tests/combat/presentation.test.ts
tests/reward/service.test.ts
scripts/export-tactical-v4-baseline.ts
```

`package.json`, `package-lock.json`, `shared/loomkeeper.ts`, server source,
assets, dependencies, source/asset/license manifests, CRPM, analytical
code/configuration/evidence other than the allow-listed V4 exporter binding,
Lane G/Lane M/Stage C carriers, deployment files,
visual baselines, rewards, authority, schemas other than the clean-room work
package identifier repair, and the active analytical pointer are excluded.

The clean-room schema/checker/test paths are admitted only to make their
work-package identifier grammar match the already accepted evidence grammar
(`WP-015D2Z`). They may not weaken hash, pin, role-separation, similarity, or
reverse-link checks.

The V4 exporter is admitted only to replace its accidental latest-ruleset
lookup with the explicit immutable V4 identity already named by the exporter
and its fixture. It may not change V4 runtime behavior, the fixture, the
analytical model, or any accepted result.

## Planned verification

- focused red/green V7 simulation and strict protocol tests;
- `npm run verify:feature` as the per-feature shipping gate;
- focused historical replay, Relic-profile, Loomkeeper, protocol, and tactical
  model preservation checks;
- clean-room lifecycle, duplicate-key, exact changed-path, Git-diff, source
  identity, package-lock, and legal-manifest digest checks; and
- `npm run verify:daily` only at the next requested end-of-day/full-quality
  checkpoint, not as part of this feature loop.

No real Android/iOS session, formal player observation, or Linux visual
baseline approval is authorized by this contract.

## Stop condition

Stop with V7 separately versioned and new challenges routed to it only after
the clean-room lifecycle is complete, focused and feature gates pass, and the
source-bound review is durable. Otherwise retain V6 as latest and leave this
package `in_progress`.

## Completion result

V7 is the latest ruleset for new challenges with strict format/ruleset identity
`7`. It provides three deterministic integer-only surface profiles and a
bounded terrain-derived opening-pair selection that enforces exact 640-unit
separation, safe margins, body-clear support, bidirectional local movement,
continuous V6-climb-valid reachability, and at most 24 units of opening height
difference. V1 through V6 remain explicitly reconstructable under their
historical identities; V7 inherits V5 Relic values and V6 movement/turn
semantics.

The distinct implementer declaration, distinct reviewer, passing similarity
review, behavioral tests, exact commits, check results, skipped checks, and
residual risks are recorded in `legal/clean-room-records.json` and
`docs/evidence/wp-015d2z.json`. Independent review found one V7-triggered V4
exporter coupling and one missing V7 direct-hit test; repair commit `3654c2b`
bound the exporter explicitly to V4 and added the exact 30-damage Needlepoint
direct-hit regression without changing V7 runtime bytes.

No Sorcerers code or asset entered the product. No player observation, Lane G
execution, telemetry, reward, asset, dependency, ProductAuthority, placement,
P5, landfall, D2O, CRPM verdict, or analytical execution-pointer change was
made. The end-of-day `verify:daily`, real-device testing, and Linux visual
baseline approval remain separate later gates.
