# WP-015D2Y V6 Movement Corrections Contract

Status: complete on 2026-09-01. The project owner
authorized this bounded correction after deployment testing established that
ordinary left and right movement work, but an acquired movement drag is
discarded when released beyond the control boundary and no deliberate
turn-in-place path is exposed. The same report requested a visible remaining
movement budget. It is defect provenance, not Lane G player-observation
evidence and not a balance, D2O, or release verdict.

## Purpose and protected outcome

The protected outcome is a plausible V6 movement correction for the current
playable V5 marketing candidate:

- once the movement pad owns a pointer and the drag leaves its dead zone,
  release at any distance commits the same clamped direction and one-to-four
  movement-step intent shown by the knob at the ring edge;
- an opposite-direction gesture first performs one authoritative 180-degree
  turn-in-place transition without consuming movement budget, then attempts
  the requested displacement quanta; and
- the movement pad continuously discloses the authoritative whole-step budget
  remaining in the current turn, from `8/8` through `0/8`, and resets from the
  next authoritative turn snapshot.

V6 inherits V5's exact `64`-world-unit turn allowance and `8`-world-unit
movement quantum. The display is a step count, not a second client-owned
budget. It is calculated only as `movementRemaining / movementStep` from the
accepted snapshot.

## Exact source boundary and carrier decision

```yaml
source_boundary:
  repository: Worms_Port
  branch: codex/wp-015d2y-v6-movement-corrections-v0
  starting_commit: cc79129edf4ba35e363957f19d99faeb59fa46b3
  starting_tree: c1061126fc4a4e740dd3399e256291028f66ff69
  package_lock_git_bytes_sha256: D4DAC6AE09A3D2F6C5A7EAA11520BAC43F1628320C5331575BCF1E1857073D73
  initial_worktree: clean
  baseline_verify_fast: pass
  sorcerers_reference_used: false
```

The existing V5 carrier is a completed immutable activation record and cannot
carry a replay-semantic correction. The Lane G carrier is V4-bound,
preregistration-only, and must not receive gameplay evidence. No V6 movement
carrier existed under `docs/planning/` or `docs/evidence/` before this file was
created. A separate WP-015D2Y contract and evidence record therefore provide
the required distinct lifecycle and review surface in the existing planning
and evidence homes.

## Authoritative V6 semantics

`nimble-knots-artillery-v6` receives ruleset, format, snapshot, hash, and replay
identity `6`. V1 through V5 remain reconstructable under their exact existing
identities and semantics.

V6 reuses the strict existing `move` command schema. For V6 only, a neutral
`move` command with direction `0` is the turn-in-place transition: it flips the
active actor's facing, changes no position, consumes no movement budget, ends
no turn, and clears any locked aim. The client emits it only when the requested
movement direction is opposite the authoritative facing. It then submits up
to four ordinary movement quanta in that direction. Ordinary accepted V6
movement also clears locked aim. V1 through V5 retain their historical neutral
move settling and nonzero movement behavior byte-for-byte.

The turn transition is available to either authoritative actor through the
same public command boundary, although this package does not change the
Loomkeeper policy or add speculative turn commands to its plans. A player
gesture may therefore create at most one V6 turn transition plus four existing
movement quanta. Failed terrain, occupancy, world-edge, budget, actor, turn,
or lifecycle checks remain server-authoritative.

## Input and cancellation boundary

The visual knob remains radially clamped to its current ring. Pointer distance
beyond that ring cannot increase the four-step cap. For an already acquired
movement pointer, pointer-up is a commit boundary even when client coordinates
are outside the movement-zone rectangle. The last pointer coordinate still
determines the clamped direction and step count.

`pointercancel`, lost ownership, window blur, hidden-document transition,
viewport/sideways resize, pause, reconnect suspension, presentation, and
challenge replacement remain cancellation boundaries and must emit no command.
Aim release outside its zone remains inert so an off-control release cannot
lock or fire a shot. Dead-zone release remains a no-movement result.

## Preserved V5 product boundary

V6 inherits V5's arena, terrain, spawns, Relic availability, launch speeds,
direct damage, radii, gravity, projectile lifetime, hitbox, turn limit,
Loomkeeper candidate/search policy, reward boundary, and approved runtime
presentation. No player-observation session, telemetry, instrumentation,
asset, dependency, manifest, reward, deployment, CRPM, or analytical-model
change is admitted.

Lane G remains separate and closed:

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
```

`gameplay_change: true` describes only this authorized V6 movement correction;
it does not mutate the immutable Lane G preregistration parity record, whose
historical documentation-only value remains `false`.

## Exact changed-path allow-list

Only the following paths may change. A newly required path must be added here
before it is edited.

```text
README.md
shared/simulation.ts
shared/protocol.ts
client/src/combat/controls.ts
client/src/scenes/combat.ts
docs/planning/implementation_plan.md
docs/planning/wp-015d2y-v6-movement-corrections-contract.md
docs/process/development_workflow.md
docs/evidence/wp-015d2y.json
tests/tactical-model/v5-marketing-candidate.test.ts
tests/simulation/mechanics.test.ts
tests/relics/relics.test.ts
tests/protocol/schemas.test.ts
tests/protocol/runtime.test.ts
tests/browser/combat.spec.ts
tests/browser/quality-policy.json
```

`package.json`, `package-lock.json`, `shared/loomkeeper.ts`, server source,
product assets, legal manifests, CRPM, analytical code/configuration/evidence,
historical V1-V5 records, Lane G/Lane M/Stage C carriers, deployment files, and
visual baselines are excluded.

## Acceptance and verification

The correction is acceptable only if all of the following hold:

1. V6 turn-in-place, movement, budget, aim-clearing, snapshot, replay, and
   strict identity tests pass while exact V4/V5 historical checks remain green.
2. Ordinary and sideways browser paths prove overlong acquired releases work
   in both horizontal directions and remain capped at four displacement steps.
3. Pointer cancellation and unsafe aim release remain inert.
4. Browser tests prove the visible and accessible budget starts at `8/8`,
   decrements from authoritative snapshots, survives a free turn, reaches
   `0/8`, and resets on the next player turn/new challenge where exercised.
5. The unchanged Loomkeeper, reward, runtime, compliance, build, bundle, and
   phone-browser matrix gates pass.
6. Every changed path is allow-listed; package-lock and the four legal manifest
   digests remain unchanged; source identity and Git diff are exact.

Real Android/iOS execution and formal player observation are not authorized
checks. Linux visual baseline comparison remains governed by the pinned Ubuntu
artifact workflow and no baseline may be approved from Windows.

## Stop statement

WP-015D2Y stops after the durable V6 movement correction and source-bound
engineering review. Lane G evidence remains `none`, Lane G execution remains
closed, D2O remains unsatisfied, and the analytical return path remains
available at its existing checkpoint without inheriting this gameplay result.

## Completion result

Implementation commit `601b05ee454811bf9e39417ef99e8b338a417201`
(tree `ad2a0e8fb033be6382cd839d8cac6a6953999361`) activates V6 for new
challenges. The strict five-project phone-browser rerun passed all 175 routed
results: 103 executed and 72 policy-approved skips. The performance, bundle,
reward-security, audit, compliance, type, build, smoke, protocol, simulation,
Loomkeeper, Relic, Practice, identity, historical V5, and analytical re-entry
gates passed. Exact results and the classified transient first-run Windows
socket failure are recorded in `docs/evidence/wp-015d2y.json`.

No real Android/iOS session or formal player observation was run. Linux visual
comparison remains reserved for its pinned Ubuntu workflow. V6 is a movement
correction over the plausible V5 candidate, not a final balance or release
claim.
