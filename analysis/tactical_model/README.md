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
