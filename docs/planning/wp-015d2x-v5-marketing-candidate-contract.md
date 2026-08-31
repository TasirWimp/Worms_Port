# WP-015D2X V5 Marketing Candidate Contract

Status: in progress. The project owner authorized this bounded implementation
package on 2026-08-31. It may implement and, only after the gates below pass,
activate `nimble-knots-artillery-v5` for new challenges. It is not a claim of
global balance, player fun, D2O satisfaction, Lane G evidence, release
readiness, or final ProductAuthority.

## Purpose and protected outcome

The protected outcome is a plausible, playable intermediate artillery ruleset
for the real competition-release Practice start. V5 should make the three
existing Relics produce readable range/damage decisions without attempting to
solve every distance, policy, terrain, or player-skill question.

The declared acceptance domain is the authoritative V4/V5 arena at the
production spawn separation of 640 world units. Starts at 576 and 704 are
adjacent safety checks only. They cannot be aggregated into a global balance
claim.

## Exact source boundary

```yaml
source_boundary:
  repository: Worms_Port
  branch: codex/wp-015d2-v5-marketing-candidate-v0
  starting_commit: 14cf9d490d7cf7b23e22918f608a694bb3028005
  starting_tree: 3aded1af96972d3c3362c3a0905053ced1ad0964
  analytical_checkpoint: checkpoint/wp-015d2-analytical-return-2026-08-31
  package_lock_sha256: D4DAC6AE09A3D2F6C5A7EAA11520BAC43F1628320C5331575BCF1E1857073D73
  initial_worktree: clean
  sorcerers_reference_used: false
```

The authoritative implementation inputs are:

- `shared/simulation.ts` at the starting commit;
- `analysis/tactical_model/configs/v5-range-damage-candidate-a.json` as
  historical, analysis-only calibration provenance;
- `docs/planning/wp-015d2a-tactical-game-model-contract.md` for the known
  initiative, convergence, and forced-opening results; and
- `docs/planning/wp-015d2g-relational-gameplay-navigation-review.md` for the
  negative-landmark and non-globalization constraints.

Candidate A and every later D2A configuration remain immutable analytical
records. This package may copy their declared starting values into a new
candidate carrier, but it may not rewrite them or inherit their disposition as
production proof.

## Starting V5 hypothesis

| Relic | Public role | Ideal maximum-range target | Maximum direct Stitching damage | Direct hits from 100 Stitching |
| --- | --- | ---: | ---: | ---: |
| `threadball` | medium / balanced | 576 | 45 | 3 |
| `needlepoint` | long / light | 640 | 30 | 4 |
| `spoolburst` | short / heavy | 512 | 80 | 2 |

The range numbers are calibration targets, not runtime distance clamps. V5
expresses them through deterministic per-Relic integer launch-speed bands in
the authoritative projectile model. Fixed-shot TypeScript traces must freeze
the exact speed integers and their achieved ordering before activation.

V5 changes only the per-Relic launch-speed and maximum-damage table needed for
those roles. Historical arena, movement, aim input, projectile gravity and
lifetime, turn completion, direct-hit profile, replay bound, and Loomkeeper
candidate/search limits remain unchanged. Radius and terrain behavior must use
one explicitly frozen basic V5 baseline; they do not become a third balancing
axis in this package.

## Bounded calibration

At most three candidate profiles may be evaluated:

1. the starting hypothesis above; and
2. at most two revisions limited to launch-speed integers or
   hit-count-preserving direct-damage adjustments.

Every evaluated profile must have a distinct ID and deterministic report. The
first profile satisfying all hard gates is selected. A later profile may not
be run merely to optimize a passing result. If all three fail, V5 remains
non-default and this package stops for owner review.

No calibration profile may add or borrow Seam Pin, Escape Slack, Brace,
Spoolburst preparation, Cocoon, Unweave, Threadback, Opening Weave, Threadstep,
reaction timing, overtime, cooldown, ammo, precision, status, Calling
modifier, obstacle, terrain tactic, or policy replacement.

## Plausibility gates

The selected candidate must pass all of the following in the declared
deterministic policy/seed matrix at production separation 640:

- at least 90 percent of matches finish by Unraveling within the existing
  sixteen-turn horizon;
- the mirrored first-actor win share is between 35 and 65 percent inclusive;
- the existing bounded opening search finds no forced opening;
- the declared tactical recurrence cut has no repeated non-terminal witness;
- each Relic has at least one reproducible legal state in which its role is
  useful and it is not strictly dominated by both alternatives;
- no direct hit can remove all 100 Stitching in one shot; and
- Loomkeeper decisions remain within the existing candidate, transition, and
  command budgets.

The 576 and 704 adjacent starts must remain deterministic, bounded, and free
of crashes, invalid replay, or one-shot direct kills. Their win shares and
turn-limit rates are reported as residue, not activation thresholds.

These gates establish only engineering plausibility under declared automated
policies. They do not prove human balance, fun, accessibility, real-device
pacing, or an equilibrium.

## Versioning and activation boundary

- V1 through V4 constants, hashes, replay reconstruction, terrain, policy
  behavior, and protocol identities must remain byte-compatible.
- V5 receives its own ruleset ID, version, snapshot format, deterministic
  rules lookup, fixed-shot tests, replay tests, and protocol schema.
- V5 is implemented non-default first. `LATEST_RULESET_ID` may advance only in
  a separate activation commit after all hard gates pass.
- Existing reward modes receive no activation exception. Reward configuration,
  sponsor budgets, payout keys, network settings, and `REWARD_PAUSED` are not
  changed. Replay-verification tests must pass before default activation.
- Any later balance change after V5 activation requires V6; released V5
  constants are never silently retuned.

## Player-facing boundary

The existing Relic chooser may disclose the three roles with compact text and
accessible labels. The authoritative trajectory preview must continue to use a
detached clone of the selected ruleset, so its visible path matches V5 without
duplicating physics in the client.

This package creates no new art, audio, dependency, telemetry,
instrumentation, interview, playtest, participant data, or device session.
Needlepoint and Spoolburst retain their current code-drawn presentation until
WP-015D3.

## Exact changed-path allow-list

Only the following paths may change in WP-015D2X. A required path not listed
here must be added to this contract before that path is edited.

```text
README.md
package.json
analysis/tactical_model/configs/v5-marketing-candidate-v0.json
scripts/run-v5-balance-candidate.ts
shared/simulation.ts
shared/protocol.ts
shared/loomkeeper.ts
client/src/combat/controls.ts
client/src/style.css
docs/planning/implementation_plan.md
docs/planning/wp-015d2x-v5-marketing-candidate-contract.md
docs/process/development_workflow.md
docs/evidence/wp-015d2x.json
tests/tactical-model/v5-marketing-candidate.test.ts
tests/simulation/mechanics.test.ts
tests/simulation/determinism.test.ts
tests/simulation/golden-and-properties.test.ts
tests/relics/relics.test.ts
tests/loomkeeper/loomkeeper.test.ts
tests/protocol/schemas.test.ts
tests/protocol/runtime.test.ts
tests/combat/combat.test.ts
tests/browser/combat.spec.ts
tests/browser/practice.spec.ts
tests/reward/runtime.test.ts
tests/reward/service.test.ts
```

`package-lock.json`, product assets, manifests, Linux visual baselines, server
configuration, reward configuration, CRPM, and the historical D2A/D2G/D2V/D2W
carriers are excluded. Linux baseline candidates may be added only later from
the pinned Ubuntu artifact workflow after explicit visual inspection.

## Verification funnel

Baseline and candidate verification are:

1. `npm run verify:fast`;
2. the new deterministic V5 calibration command and focused V5 test;
3. `npm run test:tactical-model`;
4. `npm run test:simulation`;
5. `npm run test:relics`;
6. `npm run test:loomkeeper`;
7. `npm run test:protocol`;
8. `npm run test:combat` and `npm run test:practice`;
9. `npm run test:reward` and `npm run check:reward-security`;
10. `npm run verify:runtime`;
11. `npm run test:browser:matrix`, `npm run test:browser:performance`, and
    `npm run check:bundle-budget`;
12. `npm audit`; and
13. exact diff, changed-path, work-package, source-identity, historical-replay,
    and clean-worktree review.

Real Android/iOS and formal player observation are not autonomous checks. They
remain explicitly not run until separately authorized and supplied.

## Analytical re-entry and Lane G

The published checkpoint remains the exact return point if calibration fails
or a tactical-core question becomes material. WP-015D2X does not repair the
Stage C aggregate, execute Lane M, or inherit their evidence.

The existing Lane G contract remains immutable and V4-bound. It starts no
observation and supplies no V5 evidence. After an exact V5 build is stable, a
separately versioned rebind may preregister Lane G against that build. Until
then:

```yaml
Lane_G_current_evidence: none
Lane_G_execution_open: false
D2O_player_information_timing_gate: unsatisfied
ProductAuthority: none
P5_open: false
landfall_claim: false
```

## Stop statement

WP-015D2X stops after a source-bound, reproducible V5 marketing candidate and
its review evidence. It does not claim final balance, conduct player
observation, open Lane G or Lane M execution, activate rewards, or approve the
competition release.
