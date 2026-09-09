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

## First Candidate Gate: Volcanic Cone Only

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
   validation boundary and binds the consumed one-shot cone request.
4. The owner-approved cone is a deterministic source master only; no runtime
   path, renderer behavior, or gameplay authority changes.

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
- No production identification of Mayon, Cagsawa, or any other named real-world
  location; the intended visual read remains generic.
- No change to the closed V10G package, its owner phone acceptance, or its
  branch history.
