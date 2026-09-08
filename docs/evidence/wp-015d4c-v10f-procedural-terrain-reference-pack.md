# WP-015D4C V10F Procedural Terrain Reference Pack

Status: frozen reference observation for the V10F preparation slice,
2026-09-08. This record documents research inputs; it is not an asset or code
admission record.

## Owner authorization and boundary

After V10E, the owner explicitly reopened terrain research, asked to use
Sorcerers as inspiration, asked for comparable open-source engines and then
authorized preparation of the proposed deterministic build-mask design. This
bounded authorization supersedes the earlier instruction not to reopen
Sorcerers for V10A-E. It does not change Sorcerers' GPL quarantine status.

No source code, algorithm implementation, constants, identifiers, maps,
textures, screenshots, sample tiles, pixels or assets from the sources below
were copied into Worms_Port. The V10F implementation is product-owned
TypeScript built against the existing `PackedTerrain` representation. Source
licenses are recorded because they constrain any future decision to copy or
adapt code; this preparation authorizes reference observation only.

## Sources used to form the design

| Source and pin | Exact material inspected | License boundary | Design contribution |
| --- | --- | --- | --- |
| [`lorgan3/sorcerers@0f45c49`](https://github.com/lorgan3/sorcerers/tree/0f45c4920321c0a3a14de30fe5cf44131a38da89) | `src/data/wfc/tiles.ts`, `runWfc.ts`, `wfc.worker.ts`, `wfc.ts`, `mask.ts`, `postProcess.ts`; `src/data/map/index.ts`, `terrain.ts`; `src/data/terrainPaint/index.ts`; previews under `public/maps/` | GPL-3.0 quarantine/reference only. No code, maps, assets, values or tile rules may enter product paths. | Confirmed the useful architectural separation: construct a gameplay mask, validate/post-process it, then paint presentation from that authority. Its map images were viewed only to discuss cover, elevation and traversal. |
| [`openclonk/openclonk@36de799`](https://github.com/openclonk/openclonk/tree/36de799544af0459014ea088867fe263779a8bdd) | [`MapScript.xml`](https://github.com/openclonk/openclonk/blob/36de799544af0459014ea088867fe263779a8bdd/docs/sdk/script/MapScript.xml), [`MapCreatorS2.xml`](https://github.com/openclonk/openclonk/blob/36de799544af0459014ea088867fe263779a8bdd/docs/sdk/scenario/MapCreatorS2.xml), selected `planet/**/Map.c` examples, and `src/landscape/C4MapScriptAlgo.cpp` | Engine code is ISC under [`COPYING`](https://github.com/openclonk/openclonk/blob/36de799544af0459014ea088867fe263779a8bdd/COPYING). Game data and graphics are excluded from this reference permission. No code or assets imported. | Supported a small composable operation grammar: each operation maps coordinates to mask changes, and temporary layers/operations compose into a final collision field. |
| [`hedgewars/hw@8568582`](https://github.com/hedgewars/hw/tree/85685825d924cf08b2becfdac61bccbaf4dbd9dd) | `rust/landgen/src/lib.rs`, `maze.rs`, `outline_template_based/template_based.rs`, `wavefront_collapse/`, `share/hedgewars/Data/map_templates.yaml`, and `hedgewars/uLandGenPerlin.pas` | Code is GPL-2.0 under [`COPYING`](https://github.com/hedgewars/hw/blob/85685825d924cf08b2becfdac61bccbaf4dbd9dd/COPYING); repository data has separate duties. No code, templates or assets imported. | Supported a stable generator boundary, seed-owned variation, interchangeable generation strategies and bounded mirror/flip transforms. |
| [`mxgmn/WaveFunctionCollapse@de7d22e`](https://github.com/mxgmn/WaveFunctionCollapse/tree/de7d22e705e816b62b4d613199d0463820fcaef3) | [`README.md`](https://github.com/mxgmn/WaveFunctionCollapse/blob/de7d22e705e816b62b4d613199d0463820fcaef3/README.md), `Model.cs`, and `SimpleTiledModel.cs` | Software is MIT under [`LICENSE`](https://github.com/mxgmn/WaveFunctionCollapse/blob/de7d22e705e816b62b4d613199d0463820fcaef3/LICENSE). Sample images, tiles and linked works are not admitted. No code or sample data imported. | Supplied the later-stage vocabulary of adjacency constraints, symmetry and contradiction. V10F does not adopt WFC in its first implementation because the current surface grammar and gameplay gates are smaller and easier to reproduce. |
| [PCG Book, Chapter 2: *Search-Based Procedural Content Generation*](https://www.pcgbook.com/chapter02.pdf) | Representation, evaluation function and search structure | Research citation only; no code or dataset was used. | Supported separating candidate construction from hard gameplay admission and deterministic ranking. |
| [Phaser 3.90 DynamicTexture documentation](https://docs.phaser.io/api-documentation/3.90.0/class/textures-dynamictexture) and [texture concepts](https://docs.phaser.io/phaser/concepts/textures) | Current dependency documentation | Documentation for the already installed Phaser dependency. | Confirms that later presentation can be generated from authoritative terrain without changing collision truth. No rendering change is part of this preparation slice. |

## Evaluated references not adopted

- [`kchapelier/wavefunctioncollapse@f1374ee`](https://github.com/kchapelier/wavefunctioncollapse/tree/f1374ee2c04d197afe6d01652f87663a68cbf6a5)
  is an MIT JavaScript WFC implementation whose API accepts an injected random
  function. It remains a possible later technical reference; it is not a
  dependency and no code was imported.
- [`dubzzz/fast-check@962a125`](https://github.com/dubzzz/fast-check/tree/962a12504550e8f4436e5d7c45f8e1084491f6f6)
  was evaluated for property-based seed testing. It is MIT, but the current
  fixed seed/index corpus is sufficient for the preparation seam, so no package
  was added.

## Product-owned decisions

The following choices come from Worms_Port requirements rather than any one
reference implementation:

1. `PackedTerrain` remains the sole collision and destruction authority.
2. V10 and V10E generation remain isolated and retain their accepted hashes.
3. The initial grammar uses seven integer operations: plateau, ramp, two
   hollows, two jump shelves and one notch.
4. Each normalized seed exposes exactly eight candidates. Parameters use
   independently tagged sub-seeds so adding one parameter does not shift all
   later random choices.
5. Candidate count and operation count are fixed. Generation never depends on
   elapsed time, retries until success or external data.
6. A later slice must reject candidates that fail actor support/clearance,
   safe margins, retreat, jump landing, cover plus a legal attack, legal AI
   response after terrain mutation or exact replay reconstruction.
7. A later replay-distinct ruleset may select the highest-ranked admitted
   candidate with a stable seed tie break and a fixed product-owned fallback.
8. Caves, overhangs and floating terrain remain deferred because current
   movement and terrain-top rendering assume one upper surface per column.

## Re-entry rule

This record is the complete external reference pack for the V10F preparation
slice. Runtime implementation may use the product decisions above and local
Worms_Port code. Reopening an external repository, importing a dependency,
copying code/data, adding an external tile pack or changing the source pins
requires a new owner-authorized review and a source-manifest update.
