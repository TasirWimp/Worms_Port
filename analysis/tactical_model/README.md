# WP-015D2A Tactical Analysis

This directory is a deterministic, project-owned **analysis tool**. It is not
part of the Phaser client, server authority, Socket.IO protocol, replay ABI,
Loomkeeper, reward path, or product build. The authoritative game remains the
TypeScript simulation under `shared/`.

The checked-in V4 fixture is regenerated from `shared/simulation.ts` by
`scripts/export-tactical-v4-baseline.ts` and verified by the TypeScript test.
The Python model validates the shared V4 arena, spawn, Stitching, turn, and
movement facts before a configuration runs. Its level-ground direct-hit model
does not claim terrain or ballistic parity.

Run the complete D2A harness:

```powershell
npm run test:tactical-model
```

Run the fixed C4 cross-band starting-distance sweep:

```powershell
python -m analysis.tactical_model.run `
  --config analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json `
  --starting-distances 448 512 576 640 704 `
  --output test-results/tactical-model/v5-range-damage-forward-seam-pin-escape-slack-128-c4-starting-distance-sweep-report.json
```

Each supplied distance creates a centered, open-ground analytical scenario,
then mirrors actor positions and first actor. These scenarios are not altered
V4 spawns and do not claim TypeScript replay parity; they are controlled
counterfactuals that test how the candidate behaves at the Spoolburst,
Threadball, Needlepoint, and out-of-range boundaries.

Write an ignored, reproducible report for one configuration:

```powershell
python -m analysis.tactical_model.run `
  --config analysis/tactical_model/configs/v4-baseline-abstract-v1.json `
  --output test-results/tactical-model/v4-baseline-report.json
```

`v4-baseline-abstract-v1.json` records the ideal-direct-hit consequences of
the accepted V4 values. `v5-range-damage-candidate-a.json` is a comparison
candidate only: it has no ruleset identifier, runtime path, replay authority,
or approval to become V5. Reports name their assumptions and policy limits;
they are design evidence, not a prediction of real-player behavior.

`v5-range-damage-seam-pin-candidate-b.json` is a separately schema-versioned
exploratory tactical-core candidate. It keeps Candidate A's range/damage table,
then lets a direct Needlepoint hit cap only the target's next
distance-increasing movement at 32 units, for one target turn. The target may
still cast, hold, or move toward the caster; its caster has a one-own-turn
Needlepoint cooldown. This is analysis-only, uses ideal direct hits, and does
not authorize a status effect, production ruleset, replay field, UI, or asset.

The report's `aggregate` always uses the original five-policy mirrored 50-match
matrix, so its metrics remain comparable between configurations. Candidate-only
policies appear separately in `candidatePolicyProbes` rather than silently
changing the headline sample.

`v5-range-damage-forward-seam-pin-candidate-b2.json` tests the narrower
forward-stitch rule: a stationary Needlepoint cast still deals its low ideal
direct damage but creates no tether, a cast after movement away from the target
is unavailable, and only an advancing cast can apply Seam Pin. It preserves the
same no-post-shot-movement turn economy as every other model configuration.
Candidate B2 has no production authority and is evaluated against the same
primary five-policy matrix as Candidates A and B.

The four schema-version 4 Candidate C configurations add an equal,
non-refilling **Escape Slack** reserve to Candidate B2:

- `v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json`
- `v5-range-damage-forward-seam-pin-escape-slack-192-candidate-c1.json`
- `v5-range-damage-forward-seam-pin-escape-slack-256-candidate-c2.json`
- `v5-range-damage-forward-seam-pin-escape-slack-320-candidate-c3.json`

Each actor begins with the declared reserve for the whole match. Only the
actual portion of a move that increases separation spends that actor's own
reserve; approaching, holding, and casts cost none. Once it is exhausted, the
actor can still approach and cast but cannot increase separation. This is a
soft, symmetric arena-convergence hypothesis rather than a total movement
budget: it never freezes a pursuer merely because they have already moved.
Seam Pin applies first, so a tethered 32-unit retreat consumes exactly 32
Escape Slack, not the attempted 64. Candidate C remains analytical only and
does not authorize a live meter, rule, UI, replay field, or status effect.

The `retreat_kite` policy is deliberately constrained to label only a real
separation-increasing relocation as a retreat. If Escape Slack prevents such a
move, it chooses its best legal cast instead of moving toward the opponent
under a misleading retreat label. This keeps policy traces useful as bounded
strategy evidence; it does not claim a human or production Loomkeeper will
make the same choice.

`v5-range-damage-forward-seam-pin-escape-slack-brace-candidate-d1.json` is a
separate schema-version 5 defensive probe. Each actor has one public `brace`
action: it ends the turn and reduces the next opposing direct hit by 50%; it
expires if that opponent instead relocates. It has no healing, damage return,
turn-order change, opening protection, runtime path, or production authority.
Its `brace_counter` probe policy spends the action only when that reduction
makes the opponent's currently legal hit nonlethal. D1 is recorded as rejected
negative evidence: a post-hit, damage-only Brace does not counter the
first-actor direct-hit race in this model.

The three schema-version 6 Candidate E configurations keep C4's forward Seam
Pin and 128-unit Escape Slack, then make **Spoolburst** pay a self-Stitching
cost. A cast is legal only when the caster has more Stitching than the cost, so
it always leaves the caster at one or more Stitching and cannot create a
simultaneous self-Unraveling:

- `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-10-candidate-e1.json`
- `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-20-candidate-e2.json`
- `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-30-candidate-e3.json`

The compact trace now records `actorBacklashDamage` independently from the
target's `damage`; the report declares the candidate under
`tacticalCore.spoolburstBacklash`. Candidate E is rejected analysis-only
evidence: each cost removes the bounded direct Spoolburst forced actions, but
10 reintroduces timeouts and 20/30 increase the cross-band first-actor rate.
It does not authorize a live self-damage rule, Threadball effect, UI, replay
field, or V5 ruleset.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadball-disruption-candidate-f1.json`
is the separate schema-version 7 follow-up to that rejected result. It restores
Spoolburst's full direct damage, but a caster must spend one full in-range turn
on `prepare_spoolburst`; the charge is usable only on that caster's immediately
following turn as a stationary release, so a one-step retreat really can escape
the threat. A direct Threadball hit during the window clears the charge and
still deals its ordinary 45 direct damage. Compact traces record the charge,
its start, and disruption separately. F1 proves that the telegraphed
preparation/disruption loop occurs in the fixed policy matrix, but it is also
rejected analysis-only evidence: it removes bounded forced openings and
timeouts while worsening cross-band first-actor bias. It authorizes no live
charge state, Threadball status, UI, replay field, or V5 ruleset.

`v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json`
is the separate schema-version 8 response-contract probe. It gives the prepared
Spoolburst a decisive 100 direct damage and a one-hit Spun Cocoon that absorbs
Needlepoint or Spoolburst damage. Threadball has a deliberately separated
choice: a normal 45-damage Strike leaves the Cocoon/charge intact, whereas the
zero-damage `unweave_spoolburst` action clears both. F2 reduces the cross-band
first-actor rate below C4, but produces a pure prepare/Unweave loop in every
medium-hold versus short-approach pairing. It remains rejected analysis-only
evidence: no Cocoon, 100-damage Spoolburst, Unweave action, UI, replay field,
or V5 ruleset is approved.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json`
is the isolated schema-version 9 follow-up. It deliberately removes F2's Cocoon
so the test asks one question only: can an Unweave remain a readable counter
without returning the duel to the same tactical state? A zero-damage Threadball
Unweave clears a prepared Spoolburst only when its caster can take one full
64-unit step away using their existing Escape Slack. Normal Threadball damage
does not clear preparation. The report's `tacticalVoyage.recurrenceGate` uses a
declared tactical-state cut—active actor, position, Stitching, temporary state,
and bounded reserves, but not elapsed turns—to surface repeated non-terminal
states in the fixed policy witness. This is an L4+ CRPM-inspired analytical
lens, not a runtime dependency, player model, or production design authority.

F3 removes F2's repeated-state witnesses and all 250 cross-band matches
Unravel, but its cross-band first-actor rate rises to 68.8%. It is therefore
rejected negative evidence: a visible residual can repair convergence without
repairing initiative fairness. No Threadback, forced movement, charge state,
UI, replay field, or V5 rule is approved.
