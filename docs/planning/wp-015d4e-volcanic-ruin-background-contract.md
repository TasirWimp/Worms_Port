# WP-015D4E Volcanic-Ruin Background Art Contract

Status: in progress. This package begins from the closed V10G commit
`1accbeb` on `codex/volcanic-ruin-background-art`.

## Objective

Establish a lawful, reproducible path for isolated decorative background
assets: a volcanic cone, a stone tower ruin, and later vegetation. This is a
background-art preparation package. It must not alter V10G combat geometry,
rules, AI, replay bytes, terrain rendering, public activation, or the current
runtime asset inventory.

The scene direction and exact owner-provided reference are retained in the
[portable scene brief](../asset-briefs/backgrounds/volcanic-ruin-scene-preparation-v1.md).
The reference's SHA-256 is
`9A3E5DEDDF02B0C03B2A8E46894ED61158DB39D8471BA99CD42B8618A1EB0D04`.

## Stage A: Authority And Pipeline Preflight

This stage may inspect and prepare the pinned local `flux2-klein` Comfy
workflow, including exact component and workflow verification. It must not
submit a generation, run the workflow smoke request, stage the reference to
Comfy input, create a candidate, or change `assets/`.

Before a reference-conditioned request can be staged, amend the generation
manifest and validator with a narrowly defined `owner_provided_visual_reference`
input record. That record must bind the exact reference hash, owner
authorization date, documentation-only role, external upload destination, and
the prohibition on distribution or runtime use of the input. It must preserve
the existing deterministic/project-owned conditioning contracts rather than
reclassifying them.

The manifest amendment must also create one new request authorization. No
historic consumed authorization, seed, candidate, source master, or runtime
copy may be reused.

## Candidate Gates: Volcanic Cone Then Generic Stone Tower

After Stage A passes, submit at most one quarantined candidate under a reviewed
request record. The proposed identifier is
`volcanic-ruin-bg-volcanic-cone-v1`; its proposed deterministic seed is
`15040001`.

The request must generate one isolated, transparent-background textile volcanic
cone with a small subdued smoke plume. It must explicitly prohibit text, UI,
characters, terrain, buildings, a full game scene, watermarks, logos, branded
art, recognizable third-party material, and replication of the reference
composition. Use generic geographic language only; do not request a named
landmark or historic site.

The output remains external quarantine. It is not a source master or runtime
asset until its exact output hash, job ID, output rights, visual/IP review,
alpha isolation review, and a frozen normalizer contract are all recorded.
Rejection closes this request unless a separately recorded retry allowance is
approved.

### Completed Cone Record

The one allowed request completed with prompt ID
`f244bf54-332e-4987-8e31-543c421b5a78`, seed `15040001`, and untouched RGB24
candidate SHA-256 `4B34F5EEB08C831164BE403204723E73FB95B10E8C7AA8CD5013C4E5974E329C`.
The owner approved it for source-master normalization. Frozen config
`wp-015d4e-volcanic-cone-v1` applies only exact verification, white-matte
extraction/decontamination, the narrowly bounded contact-shadow discard,
connected-subject selection, enclosed-hole fill, uniform 3/4 scale, and
translation. Two independent runs produced the same 1024x576 RGBA master
`83E451892C13730D2EA1DE5794927EC9CD63110567F110DC485D5ED148D041AD` at
decorative baseline anchor `(512,528)`. The master is approved in
`legal/asset-manifest.json`, but has no runtime path.

### Authorized Tower Candidate

The owner authorized a second, distinct one-shot reference-edit request on
2026-09-10: `volcanic-ruin-bg-generic-stone-tower-v1`, seed `15040002`.
It may use the same exact owner-provided reference only to guide the handmade
textile material and distant-landmark readability. Its prompt requests a
generic weathered tropical stone bell-tower ruin with restrained vines and two
open arch windows; it excludes the volcano, terrain, characters, UI, a church
interior, full scene, named place, and photo replication. Although the game
concept calls this the Cagsawa-inspired church ruin, neither the generation
prompt nor the future asset may identify or reproduce the real landmark.

The request completed as prompt `dd98b736-8300-47b1-a3df-29c9f1012a23` in
317.963 seconds, yielding one untouched RGB24 1360x768 external candidate:
`WormsPortFlux2KleinReferenceEdit_00007_.png`, 634,010 bytes, SHA-256
`6DDE21C23C9CF96D445DA3119D6EB9D282BE619B6BB2E3597CB699576D58D264`.
The owner approved the candidate for deterministic normalization. Frozen config
`wp-015d4e-stone-tower-v1` verifies only those exact candidate bytes, extracts
the white matte, fills enclosed stitch pinholes, removes only the reviewed
floor-shadow tail at source rows `712+`, and applies uniform 70% scale with a
fixed translation. Two independent runs produced the same 1024x576 RGBA master
`0810A4F5D3A3CCB72352F01AF61899BFAD7F4FC6EF9306164078F8C92FECBFA0` at
decorative baseline anchor `(512,528)`. It is approved in
`legal/asset-manifest.json`, but has no runtime path.

### Authorized Distant-Jungle Candidate

The owner authorized a third distinct one-shot reference-edit request on
2026-09-10: `volcanic-ruin-bg-distant-jungle-a-v1`, seed `15040003`. It may
use the same exact owner-provided reference only for restrained textile material
and low-contrast distant-foliage readability. The prompt requests one wide,
low horizontal generic tropical canopy cluster and blocks ground, horizon,
individual landmark trees, volcano, tower, palm, bush, terrain, characters,
UI, named place, photo replication, and full-scene output. The request
completed as prompt `76f6c459-be98-4a7d-ace6-70cb34d0c2a8` in 295.813 seconds,
yielding one untouched RGB24 1360x768 external candidate:
`WormsPortFlux2KleinReferenceEdit_00008_.png`, 841,296 bytes, SHA-256
`B3AC79151D180F4439E82BD8EB9113734601084CE2780A2C56B4AA62CC09EBA1`.
It remains external quarantine pending owner visual review, with no source
master or runtime path.

## Media And Integration Gate

The present initial-media inventory is frozen: eleven approved files total
`1,402,579` bytes against the `1,500,000` byte ceiling. This leaves only
`97,421` bytes, and its exact allowed-file list blocks any additional runtime
copy regardless of size.

No background candidate may enter `assets/product/`, `legal/asset-manifest.json`,
or a loader through this package. A later package must decide and test a
lazy-loading/fallback policy, revise the byte budget intentionally, and retain
the existing no-background fallback before any admission.

## Completion Criteria

1. The package records the exact reference and a distinct background-art
   branch without reopening V10G.
2. The Comfy profile preflight outcome is recorded without generating media.
3. The owner-provided-reference manifest extension has a strict, test-covered
   validation boundary and binds the consumed cone request plus the distinct
   one-shot tower request.
4. The owner-approved cone and tower are deterministic source masters only; no
   runtime path, renderer behavior, or gameplay authority changes.

## Planned Verification

1. `npm run audit:housekeeping`
2. `npm run check:work-packages`
3. `npm run verify:changes -- --dry-run`
4. `npm run verify:changes`
5. `git diff --check`

When the manifest/schema work begins, additionally run
`npm run check:generation-components` and its focused tooling tests. A game
build, browser run, PostgreSQL gate, and visual baseline are not required for
the documentation/preflight stage because no game-visible file changes.

## Explicit Non-Goals

- No Comfy generation, reference staging, smoke generation, or external upload
  in Stage A.
- No source-master promotion, image normalization, runtime build copy, atlas,
  asset-manifest entry, or `BackgroundScene` implementation.
- No production identification or literal reproduction of Mayon, Cagsawa, or
  any other named real-world location; the intended visual read remains generic.
- No change to the closed V10G package, its owner phone acceptance, or its
  branch history.
