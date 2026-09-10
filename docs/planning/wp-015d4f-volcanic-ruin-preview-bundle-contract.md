# WP-015D4F Volcanic-Ruin Preview Bundle Contract

Status: in progress. This successor package follows the source-only WP-015D4E
admission and does not revise or replace its evidence.

## Scope

Admit five already-approved volcanic-ruin source masters as exact, lazy
engineering-preview build copies. The preview is available only at
`/?combat-preview=v10g&background-preview=volcanic-ruin`; it is not selected by
Practice, Daily, a replay, match authority, or a public feature flag.

The existing WP-015C initial-media inventory remains exactly 11 files and
1,402,579 bytes under its 1,500,000-byte ceiling. `check:b3c-runtime-inventory`
continues to reject every added runtime path. This package adds a separate
five-file preview bundle of 1,835,347 bytes under a deliberately distinct
1,900,000-byte ceiling. The maximum served copies when the preview is requested
is therefore 3,237,926 bytes; no initial-media budget claim is widened.

## Exact-copy admission

Only these byte-identical source-master copies are admitted below
`assets/product/environment/backgrounds/volcanic-ruin/`:

| Source master | Runtime copy |
| --- | --- |
| `volcanic-cone-source-master-v1.png` | `volcanic-cone-v1.png` |
| `stone-tower-source-master-v1.png` | `stone-tower-v1.png` |
| `distant-jungle-source-master-v1.png` | `distant-jungle-v1.png` |
| `palm-cluster-source-master-v1.png` | `palm-cluster-v1.png` |
| `bush-cluster-source-master-v1.png` | `bush-cluster-v1.png` |

`scripts/copy-approved-assets.js` remains the sole copy path, checks the
manifest hash before and after copying, and permits no atlas or transformed
derivative. `check:wp015d4f-background-bundle` freezes the source hashes,
paths, byte total, preview-only admission text, and continued WP-015C guard.

## Scene and authority boundary

`BackgroundScene` owns fixed normalized anchors, a scene-owned fixed seed, and
camera parallax only. L0 is the code-owned sky and current cloud family; L1
volcano/jungle uses 0.08/0.10 parallax; L2 tower uses 0.18; L3 seeded palms and
bushes use 0.32. Landmark scale derives only from viewport height divided by
world height. A fixed LCG generates vegetation, never `Math.random`.

The background renderer creates only masked Phaser images. It consumes no
terrain pixels, `PackedTerrain` geometry, simulation state, AI, replay bytes,
destruction, spawn, collision, support, damage, or trajectory input. It is
behind terrain, actors, projectile and effects depths. Fixed legibility lanes
exclude landmark and vegetation anchors from actor/status/projectile contrast
areas.

All five textures are required before any scene art is instantiated. A failed
or unavailable file yields the unchanged sky/cloud/terrain presentation with
no partial background.

## Acceptance and release boundary

This is an owner-review engineering preview only. Public Practice/Daily
activation, visual baseline approval, and physical-device acceptance remain
separate decisions. Windows may run functional browser smoke, but may not
create or approve visual baselines; those come only from the pinned Ubuntu
artifact workflow.
