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
