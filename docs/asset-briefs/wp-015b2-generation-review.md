# WP-015B2 Quarantined Generation Review

Status: in progress. No file recorded here is an approved product asset.

## Frozen Inputs

- Starting commit: `1eaf731`
- B1 contract: `docs/asset-briefs/wp-015b1-vertical-slice.md`
- B1 contract SHA-256:
  `5A323A12BF3C3238179C624D3B87DEA9F0AA3D80B7FD974B51A30CC174B9862E`
- Checkpoint SHA-256:
  `E9476A13728CD75D8279F6EC8BAD753A66A1957CA375A1464DC63B37DB6E3916`
- Text workflow SHA-256:
  `968A5B78766549BBAF374C1C27BE80B75E6BB389A01CCC237639DFB4EFCF3CD5`
- Initial settings: 512x512, 28 steps, CFG 7, Euler, normal scheduler,
  denoise 1.0, batch size 1.
- External output root:
  `C:/Users/jensb/AppData/Local/Comfy-Desktop/ComfyUI-Shared/output`

`Prepare`, `Status -VerifyHashes`, and `Start` passed before generation. ComfyUI
0.27.1 used the AMD Radeon RX 7600 through the pinned loopback MCP bridge. No
Sorcerers, Worms/Team17, official Nimiq brand file, or unrecorded conditioning
input was used.

## Primary Attempt

The dedicated `generate_image` tool received the exact B1 prompts, settings,
and seeds. All files remain untouched in external quarantine.

| Purpose | Seed | File / SHA-256 | Asset / prompt ID | Decision |
| --- | ---: | --- | --- | --- |
| Wizard | `15015001` | `ComfyUI_00002_.png`, 564653 bytes, `ABD455783DE51F33EAE87BFFABA217FE39AE85BD8C2F1FE8A96B2D904A17D434` | `8506d11f-b6d5-44f6-ae9e-3064425146e6` / `d00515db-f6a0-4eb0-b507-6a9ae55ffd52` | reject |
| Loomkeeper | `15015002` | `ComfyUI_00003_.png`, 468129 bytes, `35EEB5F047B78C57EB6728299B43ADC422DA488019F1A78FE221CDE20A2AAE66` | `db2dd982-ead4-4030-8744-a3753da00acc` / `9c2f6188-0f1e-43db-b0f6-f210ce0925d1` | reject |
| Threadball | `15015003` | `ComfyUI_00004_.png`, 385051 bytes, `3F4B5B7A657127978347A7BDBD3DF7AB4DAB2E28BDE8B71C2A77B33007693069` | `cd8860e3-40e9-4915-8ab3-3bccef862e18` / `25523409-6d57-418d-b634-5db3e99eea62` | reject |
| Patch cloud | `15015004` | `ComfyUI_00005_.png`, 302917 bytes, `811A37F2570630AF9FB871799950634098025A4342A6B06A28D4D38180474C3A` | `55787cf7-0b4a-4ce5-b91e-1a3fc1fb7441` / `4928027f-291f-4c6f-bb66-c5e70e121526` | reject |
| Patch terrain top | `15015005` | `ComfyUI_00006_.png`, 490007 bytes, `EEEB59B29BACDDD5BD6127EFD6A7693C620800505F17AF1871D83B22977157F9` | `64fe9eca-b003-4dc4-9262-1fdcd63bcee1` / `d179dc79-e634-493e-8bcf-ce090f7773d9` | reject |
| Patch terrain interior | `15015006` | `ComfyUI_00007_.png`, 543755 bytes, `2DD3006A1C8788CABF10BB1ACE11557BB378143DB57B566B46C8DD6CC3BA8542` | `ec65fd70-ba77-4d8a-9ddf-daaf3e2b7ca4` / `1a62c9ab-0f43-4a62-945c-f41f0eaca6bd` | reject |

Review findings:

- Wizard has only one visible eye, rounded doll anatomy, no usable side-view
  hand socket, the wrong body/costume balance, and a textured contact backdrop.
- Loomkeeper is a hanging elongated plush object rather than a character; it
  has no face, eyes, limbs, feet, baseline, or held-Relic socket.
- Threadball is a readable round yarn ball but lacks the required gold-thread
  identity and uses a realistic floor, background, and contact shadow.
- Patch cloud contains multiple disconnected clouds against a dark scene rather
  than one isolated low horizontal layer.
- Patch terrain top is a full green corduroy-like field without the brown felt
  edge or gold stitched boundary.
- Patch terrain interior is directionally usable brown crochet, but its opposite
  edge mean RGB differences are 29.91 horizontally and 36.55 vertically. The
  visible repeat and edge mismatch fail the 3x3 seamless-material gate.

## Retry 1 Prompt Amendment

Retry 1 changes prompts only. It keeps the same purpose seed, checkpoint,
workflow, dimensions, steps, CFG, sampler, scheduler, and denoise. The shorter
SD 1.5 prompts emphasize the failed structural requirements. This is a recorded
amendment, not seed shopping or relaxed acceptance.

### Wizard retry 1

Positive:

```text
(one full-body cute crochet fantasy game character:1.4), (right-facing three-quarter side view:1.3), (two large glossy black bead eyes visible:1.5), (no mouth:1.4), (angular hexagon-shaped head and torso:1.5), flat crown, chamfered cheeks, short arms, narrow lower bridge, two separate block feet, pale sky-blue chenille yarn body, deep navy folded felt wizard hood, gold blanket stitching, wooden button, small spool staff strapped behind the back, empty front hand for a separate game item, centered, full feet on one baseline, tactile yarn and felt, strong mobile game silhouette, isolated on a plain uniform warm-white background, generous padding, soft studio light
```

Negative:

```text
two characters, multiple characters, front view, rear view, left-facing, single visible eye, missing eye, mouth, nose, eyebrows, round human head, long dress, fused legs, missing feet, extra limbs, cropped body, scenery, textured backdrop, floor, contact shadow, text, watermark, signature, logo, official Nimiq logo, worm, slug, robot, gun, gore
```

### Loomkeeper retry 1

Positive:

```text
(one full-body cute crochet fantasy game character:1.4), (right-facing three-quarter side view:1.3), (two large glossy black bead eyes visible:1.5), (no mouth:1.4), (angular hexagon-shaped head and torso:1.5), flat crown, chamfered cheeks, short arms, narrow lower bridge, two separate block feet, chunky purple chenille yarn body, short coral felt keeper mantle, asymmetrical folded cowl, dark woven sash, small wooden buttons, restrained gold stitching, empty front hand for a separate game item, calm friendly competitive pose, centered, full feet on one baseline, tactile yarn felt and wood, strong mobile game silhouette, isolated on a plain uniform warm-white background, generous padding, soft studio light
```

Negative:

```text
hanging ornament, cocoon, keychain, faceless object, two characters, multiple characters, front view, rear view, left-facing, single visible eye, missing eye, mouth, nose, eyebrows, wizard hat, crown, long dress, fused legs, missing feet, extra limbs, cropped body, scenery, wood wall, textured backdrop, floor, contact shadow, text, watermark, signature, logo, official Nimiq logo, worm, slug, robot, weapon, gun, gore
```

### Threadball retry 1

Positive:

```text
(one single round yarn ball:1.5), (thick sky-blue chenille yarn:1.3), (three thin luminous golden thread wraps crossing around the ball:1.5), compact balanced spherical textile game projectile, visible soft fibers, clean round silhouette, medium visual weight, centered isolated object, plain uniform warm-white background, generous padding, soft studio light, no floor and no shadow
```

Negative:

```text
plain blue ball without gold, multiple balls, character, hand, face, needle, spool, bomb, grenade, fuse, spikes, fire, explosion, orbit, cage, logo, official Nimiq logo, text, watermark, scenery, floor, tabletop, horizon, contact shadow, long trail, motion blur, cropped object, hard plastic, metal sphere
```

### Patch cloud retry 1

Positive:

```text
(one single connected low horizontal cotton cloud:1.6), one compact cluster of overlapping soft white cotton pompoms, handcrafted textile game environment layer, rounded uneven silhouette, centered isolated object, solid uniform pale-blue background, generous padding, gentle even studio light, subtle cotton fibers, no face and no scenery
```

Negative:

```text
multiple separate clouds, second cloud, scattered balls, character, face, eyes, landscape, horizon, dark sky, black background, gradient background, floor, contact shadow, dramatic lighting, text, watermark, signature, logo, official Nimiq logo, frame, cropped cloud
```

### Patch terrain-top retry 1

Positive:

```text
(flat orthographic textile game texture:1.3), (one straight horizontal terrain edge crossing completely from left to right:1.6), upper area made from short tufted light olive-green yarn grass, lower area made from warm brown felt, one narrow row of small regular golden blanket stitches exactly along the horizontal boundary, even density and lighting across both side edges, no hills, no objects, no scenery
```

Negative:

```text
vertical stripes, corduroy, full green field, all grass, no brown felt, missing stitch line, hills, curve, landscape perspective, horizon sky, character, weapon, object, central motif, frame, outer border, text, watermark, signature, logo, official Nimiq logo, hard plastic, metal
```

### Patch terrain-interior retry 1

Positive:

```text
(seamless tile:1.6), uniform dense warm-brown looped crochet and felt game terrain material, flat top-down orthographic texture, small irregular textile fibers, restrained tiny gold stitches distributed evenly, identical visual density and lighting at every edge, no central motif, no directional pattern, fills the complete square
```

Negative:

```text
visible seam, border, frame, grid, repeating squares, rosette, central flower, large motif, vertical stripes, horizontal stripes, directional lighting, vignette, object, character, face, landscape, sky, grass, rocks, text, watermark, signature, logo, official Nimiq logo, hard plastic, glossy metal
```

## Retry 1 Results

Retry 1 used the amended prompts above and otherwise preserved every frozen
parameter. All outputs are rejected and remain untouched in external
quarantine.

| Purpose | File / SHA-256 | Asset / prompt ID | Decision |
| --- | --- | --- | --- |
| Wizard | `ComfyUI_00008_.png`, 593572 bytes, `7AFE93089AF565BBDD58A6E12C05245FDD2C7265EAAFF16D9FBC8C5AB5686AB7` | `52ae5c4d-3f5f-4f54-bab4-bbd2cdabb8d2` / `c73a5db3-baa8-422a-bf5b-adcd4630f644` | reject |
| Loomkeeper | `ComfyUI_00009_.png`, 362697 bytes, `6D1EF870F06C649FA69B58D70B526B3ABF10F2545558C1F607DF2F2B0C70C64E` | `15cd3bad-6275-4171-b11b-c29f3eccdde2` / `b134d563-4d8b-4cb5-b785-81abe8c82efe` | reject |
| Threadball | `ComfyUI_00010_.png`, 452580 bytes, `4F6CACDF120D1ECAB259252417DC7164F32A34993477FB15DC3ABDE2EB7E189A` | `ff7d905f-13b7-43be-80ad-a7c0ef467155` / `d5527de8-19b4-4274-b1da-0b78adebe750` | reject |
| Patch cloud | `ComfyUI_00011_.png`, 376975 bytes, `419D8CF404135840DA9F6AEADD844DDD6D6A2083B2206BE0C4AEBB5FFB295C5B` | `c96fc44e-5e4f-49bb-8c40-f6bb785b3a01` / `ab275252-4b8d-4f27-9d65-eacafd419150` | reject |
| Patch terrain top | `ComfyUI_00012_.png`, 480077 bytes, `10F8BB1A3957B7F94821DA52384EF78BB61820675A97E25E679721270FA2ED89` | `b240471b-f3de-4932-aab8-dfeb7745ca12` / `0002bace-17aa-418f-8c46-5dec6eaf20d9` | reject |
| Patch terrain interior | `ComfyUI_00013_.png`, 582833 bytes, `B1C4DFD5310AFCF8B7322B759D8B3C746427E89FC5A69EFFA1A21BE6EB280624` | `9e2d0fe5-a718-4980-adb6-221045256571` / `d8d9fd88-0785-4c76-96d8-3d2f6e85ba4d` | reject |

Review findings:

- Wizard collapsed into a dark hexagonal crochet patch with no character,
  anatomy, eyes, limbs, feet, costume, or socket.
- Loomkeeper became a cropped human-proportioned hooded figure with a face,
  oversized hand, black clothing, missing feet, and a geometric scene.
- Threadball contains three gold balls on a blue floor rather than one blue ball
  with restrained gold wraps.
- Patch cloud became a full-frame cotton texture with dark scene remnants rather
  than one isolated cloud.
- Patch terrain top became a brown geometric lattice without green yarn grass,
  felt, or the requested stitched material boundary.
- Patch terrain interior became a geometric repeating panel rather than crochet
  material. Opposite-edge mean RGB differences worsened to 49.30 horizontally
  and 80.35 vertically.

## Retry 2 Conditioned Amendment

Blind text-only retry is stopped. Retry 2 evaluates the reviewed
`generate_image_conditioned` workflow using exact, quarantined outputs only as
composition guides. Every guide remains rejected as a product master; staging
does not approve it. This amendment preserves the original purpose seeds and
Retry 1 prompts, uses 24 steps, CFG 6, Euler, and the normal scheduler, and
records family-specific denoise before execution.

| Purpose | Exact guide | Guide SHA-256 | Denoise |
| --- | --- | --- | ---: |
| Wizard | `ComfyUI_00002_.png` | `ABD455783DE51F33EAE87BFFABA217FE39AE85BD8C2F1FE8A96B2D904A17D434` | `0.60` |
| Loomkeeper | `ComfyUI_00009_.png` | `6D1EF870F06C649FA69B58D70B526B3ABF10F2545558C1F607DF2F2B0C70C64E` | `0.60` |
| Threadball | `ComfyUI_00004_.png` | `3F4B5B7A657127978347A7BDBD3DF7AB4DAB2E28BDE8B71C2A77B33007693069` | `0.35` |
| Patch cloud | `ComfyUI_00005_.png` | `811A37F2570630AF9FB871799950634098025A4342A6B06A28D4D38180474C3A` | `0.55` |
| Patch terrain top | `ComfyUI_00012_.png` | `10F8BB1A3957B7F94821DA52384EF78BB61820675A97E25E679721270FA2ED89` | `0.55` |
| Patch terrain interior | `ComfyUI_00007_.png` | `2DD3006A1C8788CABF10BB1ACE11557BB378143DB57B566B46C8DD6CC3BA8542` | `0.35` |

The characters need higher denoise because the guide anatomy fails. Threadball
and terrain interior use the reviewed default to preserve their useful round
and textile structure. Cloud and terrain top use a bounded midpoint to preserve
composition while replacing failed scene/material content. A Retry 2 output
must still satisfy the original B1 acceptance criteria; no criterion is relaxed.

## Retry 2 Stop Record

The user stopped Retry 2 after recognizing that the local image model cannot
reliably follow the current number of simultaneous details. The orchestration
cell was terminated immediately. ComfyUI then reported zero running and zero
pending jobs.

One Wizard job had already completed before termination:

- File: `WormsPortConditioned_00002_.png`
- Bytes: 591372
- SHA-256:
  `F246DD12A61F84C5BD4C80060B97C66D1DEB86015B1DF41ADDB72D515DD444DA`
- Asset ID: `61b6e1c5-8d1d-4a04-b658-a0d3b07d43c8`
- Prompt ID: `c9c4e11d-287e-4ac0-85d4-00728441d362`
- Reference: `wormsport/wp015b2-wizard-primary.png`
- Settings: seed `15015001`, 24 steps, CFG 6, Euler, normal scheduler,
  denoise `0.60`.
- Decision: reject. It retains the rounded doll/dress structure, obscures the
  required two-eye face, lacks the angular Knotkin anatomy and usable forward
  socket, and preserves the textured contact background.

No Loomkeeper, Threadball, cloud, terrain-top, or terrain-interior conditioned
output completed in Retry 2. Generation remains paused. The next amendment must
split visual goals into short, staged prompts and test one asset at a time before
submitting another batch. Existing rejected files may be analyzed, but no new
generation occurs until that prompt refinement is reviewed.

## Approved Planning Deviation: WP-015B2A Model Admission

Decision date: 2026-08-02. Starting review record: `2c528b8`.

The prompt-only retries and conditioned Wizard diagnostic show that prompt
decomposition by itself is not a sufficient next step for the approved SD 1.5
route. The final sentence of the stop record above is therefore superseded only
for execution order: generation stays paused while a bounded FLUX.2 Klein 4B
distilled FP8 model-admission gate runs first. The rejected SD 1.5 files,
settings, prompts, seeds, and decisions remain immutable evidence; the proposed
route is not yet an approved generation component.

The deviation preserves the B1 product requirements for anatomy, side view,
eyes, baseline, sockets, projectile origin, animation triggers, environment
decomposition, phone readability, and exact-output review. It does not carry
the B1 SD 1.5 prompts, seeds, CFG, sampler, scheduler, or workflow settings into
a different architecture. If the new route passes admission, a separate
model-specific short staged prompt/settings/seed amendment must be reviewed
before B2 candidate generation resumes.

Admission proceeds in this exact order:

1. Review and exact-hash the external distilled FP8 diffusion model, Qwen3 4B
   text encoder, and FLUX.2 VAE with canonical-source and commercial-use
   license evidence. A mirror without exact license/provenance linkage fails.
2. Review and exact-hash bounded text-to-image and single-reference-edit
   workflows using only the pinned ComfyUI 0.27.1 core nodes. Do not update
   ComfyUI, install custom nodes, or use a cloud generation API.
3. Extend the local tooling with a fail-closed separate model profile. Preserve
   the existing SD 1.5 smoke route and reject arbitrary component or workflow
   selection.
4. Prove a batch-one technical smoke on the actual Windows AMD Radeon RX 7600
   8 GB route using low-VRAM text-encoder offload and disabled previews. Record
   exact settings, runtime, memory behavior, output hash, and failures. The
   published FP8 figure is about 8.4 GB on an RTX 5090, so local compatibility
   is a gate rather than an assumption.
5. Only after technical admission, run one Wizard structure pass, one
   Threadball structure pass, and at most one controlled reference edit with
   short staged prompts. Review after every output; do not batch the remaining
   purposes.
6. Record an explicit adopt/reject decision. Only an adopted route may receive
   the model-specific prompt amendment and resume B2 generation.

Model generation will not be treated as proof of seamless terrain, exact
transparent edges, repeatable tiling, or collision geometry. Those properties
remain deterministic postprocess or code-owned responsibilities. This planning
deviation downloads, generates, promotes, and approves nothing by itself.
