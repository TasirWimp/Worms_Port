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

## WP-015B2A Gate 1 Result: Exact Components

Review date: 2026-08-03. Status: **pass with a canonical encoder
substitution; FLUX route still not approved**.

The three external component files admitted for the next native-workflow review
are:

| Role | Reviewed external file | Bytes | SHA-256 | Exact source relation |
| --- | --- | ---: | --- | --- |
| Distilled FP8 diffusion model | `flux-2-klein-4b-fp8.safetensors` | 4,070,624,520 | `97ED34FE0567E436200F2FAEE3939B88F2B5D99F8AF2A4DC16532C4245C0CCB6` | exact canonical BFL file at `5b4408e59397a4a37ccb46afe426d8ed86379441`, Apache-2.0 |
| Qwen3 4B text encoder | `qwen_3_4b_bfl_apache.safetensors` | 8,044,982,048 | `AD65083F0B6561CC84B9B6A42FF397EE749171E367C28D800C4A6FD612ABC169` | deterministic single-file repackage of the two canonical BFL Klein 4B shards at `e7b7dc27f91deacad38e78976d1f2b499d76a294`, Apache-2.0 |
| FLUX.2 VAE | `flux2-vae.safetensors` | 336,213,556 | `D64F3A68E1CC4F9F4E29B6E0DA38A0204FE9A49F2D4053F0EC1FA1CA02F9C4B5` | exact canonical BFL FP32 VAE at `26afe3a78bb242c0a8bb181dcc8937bb16e5c66c`; BFL's pinned `flux2` README licenses the FLUX.2 autoencoder under Apache-2.0 |

The encoder repackage has two exact inputs:

- `model-00001-of-00002.safetensors`, 4,967,215,360 bytes, SHA-256
  `8C0506E7F4936FA7E26183A4FD8DA4E2BDBC5990BA64AE441F965D51228F36EA`;
- `model-00002-of-00002.safetensors`, 3,077,766,632 bytes, SHA-256
  `82F2BD839378541B0557BFABAF37C7D3D637071FDCB73302DEDD7CF61162CE07`.

The merge removes only the safetensors `__metadata__` records, shifts the
second shard's data offsets by the first shard's data length, writes one
compact eight-byte-aligned combined header, and concatenates the two source
data regions without conversion. Independent post-build comparison passed for
all 398 tensor names, shapes, dtypes, and per-tensor raw SHA-256 values.

The official Comfy guide's pre-release mirror
`qwen_3_4b.safetensors`, SHA-256
`6C671498573AC2F7A5501502CCCE8D2B08EA6CA2F661C458E708F36B36EDFC5A`,
is explicitly rejected. It was uploaded before the BFL Klein release, has no
exact license/provenance declaration, and differs from both the canonical BFL
and Qwen bytes in `model.layers.35.mlp.down_proj.weight` and
`model.layers.35.mlp.up_proj.weight`. It must not be substituted into the
reviewed route merely because the official Comfy tutorial links to it.

The VAE's exact hash is present in BFL's canonical `FLUX.2-dev` repository.
Its 251 tensor names and shapes also match the Apache Klein 4B VAE: projecting
each of the 250 FP32 floating tensors to BF16 reproduces the Klein tensor
exactly, while the I64 state matches directly. This evidence is limited to the
autoencoder; it does not admit any non-autoencoder `FLUX.2-dev` weight.

External evidence is preserved below
`E:\ComFy\TasirWimp\component-evidence\wp-015b2a`. The admitted files are
installed at:

```text
E:\ComFy\TasirWimp\Worms_Port-models\diffusion_models\flux-2-klein-4b-fp8.safetensors
E:\ComFy\TasirWimp\Worms_Port-models\text_encoders\qwen_3_4b_bfl_apache.safetensors
E:\ComFy\TasirWimp\Worms_Port-models\vae\flux2-vae.safetensors
```

The ignored local `E:\ComFy\TasirWimp\ComfyUI\extra_model_paths.yaml`
registers those three E: subdirectories while retaining the Comfy Desktop shared
root for the approved SD 1.5 route, inputs, and outputs. Its reviewed SHA-256 is
`D03C5A366C7291F161B30DDB6CF5002800B67380E6D32D7DCC410AEFD1B4A00D`.
The repository pipeline preflight pins that hash and fails closed on path drift.

Gate 1 approves only those exact external bytes for Gate 2 workflow
construction. It does not approve either FLUX workflow, the pipeline profile,
RX 7600 compatibility, prompt settings, generation, output, or product-media
promotion. The next bounded action is to construct, inspect, exact-hash, and
register native ComfyUI 0.27.1 text-to-image and single-reference-edit graphs
without updating ComfyUI or installing custom nodes.

## WP-015B2A Gate 2 Result: Native Core-Node Workflows

Review date: 2026-08-03. Status: **pass as non-executable source tooling;
FLUX route still not approved**.

Gate 2 translated the distilled graphs from the official Comfy workflow
templates at exact revision
`cebdebc9fc2febcb97a5db0dd291f59f5300b176` into project-owned Comfy API
format. The translations replace the template encoder mirror with the reviewed
canonical-shard merge and bind all three Gate 1 filenames exactly:

| Mode | Project source | Nodes | SHA-256 |
| --- | --- | ---: | --- |
| Text to image | `scripts/comfy-workflows/generate_flux2_klein_text.json` | 13 | `626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28` |
| Single-reference edit | `scripts/comfy-workflows/generate_flux2_klein_reference_edit.json` | 19 | `A2BF8CD3C015D36646E73F2FA87F22741E4410D27B26D562331057B49CFF6C8E` |

Both graphs fix the distilled route to four steps, CFG 1, Euler, batch size
one, `flux-2-klein-4b-fp8.safetensors`,
`qwen_3_4b_bfl_apache.safetensors`, and `flux2-vae.safetensors`. The text graph
fixes the canvas and scheduler to 1024x1024. The edit graph accepts one
explicitly staged reference filename, scales it to one megapixel using
`nearest-exact`, derives the output dimensions from that bounded image, and
uses the native `ReferenceLatent` conditioning structure. It does not expose a
second reference, denoise control, arbitrary model choice, custom node, or
workflow selector.

Every node class, required input, and connected output/input type was checked
against the running pinned ComfyUI 0.27.1 `object_info` schema. The exact model
filenames were also visible to `UNETLoader`, `CLIPLoader`, and `VAELoader`.
No prompt was submitted and no FLUX model was loaded for inference.

The manifest records both workflows with `runtime_enabled: false`. Their
runtime targets are intentionally absent from the external MCP `workflows`
directory, and the pipeline still exposes only the established SD 1.5 route.
Gate 2 therefore approves exact source graphs for Gate 3 integration review;
it does not approve execution, hardware compatibility, prompt settings,
generated output, or product media.

Before this review, the three verified failed-download directories below
`E:\ComFy\TasirWimp\hf-cache`, `hf-downloads`, and `hf-verified` were removed,
reclaiming about 8.94 GiB. The reviewed model store and
`component-evidence\wp-015b2a` were preserved.

The next bounded action is Gate 3 only: add a separate fail-closed FLUX profile
to the local pipeline, keep the SD 1.5 route intact, verify the full component
and workflow chain before staging runtime copies, and reject arbitrary model or
workflow selection. Do not run the RX 7600 technical smoke until that profile
passes its own tooling and compliance checks.

## WP-015B2A Gate 3 Result: Closed Runtime Profiles

Review date: 2026-08-03. Status: **pass without inference; FLUX hardware route
still not approved**.

Gate 3 adds exactly two manifest-defined runtime profiles:

| Profile | Exact model chain | Exact workflow chain | Required MCP tools | Launch mode |
| --- | --- | --- | --- | --- |
| `sd15` | archived SD 1.5 checkpoint | pinned generic text graph plus project VAE img2img graph | `generate_image`, `generate_image_conditioned` | existing pinned launcher |
| `flux2-klein` | Gate 1 diffusion, encoder, and VAE | Gate 2 text and single-reference graphs | `generate_flux2_klein_text`, `generate_flux2_klein_reference_edit` | `--lowvram --preview-method none` |

The pipeline parameter accepts only those two names. It runs the generation
manifest compliance check before copying, rejects an unknown profile, maps
each reviewed component kind to one fixed external model directory, verifies
model size on every action, and verifies model SHA-256 during `Prepare`,
`Start`, `Smoke`, or `Status -VerifyHashes`. Each workflow source and runtime
copy is exact-hashed. The bridge's allowed untracked paths now contain only its
virtual environment, logs, and the three exact project workflow copies.

Local non-inference integration produced these results:

- `Prepare -Profile sd15` verified the original checkpoint and both original
  workflows. Its two MCP tools remained registered.
- `Prepare -Profile flux2-klein` verified all 12.45 GB of reviewed FLUX model
  bytes and installed both exact workflow copies. It truthfully reported the
  old process as not profile-ready before restart.
- `Start -Profile flux2-klein` safely restarted the reviewed loopback ComfyUI
  and MCP processes. Runtime status reported ComfyUI 0.27.1, AMD Radeon RX 7600
  native, LOW_VRAM launch readiness, and both exact FLUX tools registered.
- A subsequent exact SD 1.5 status check passed, demonstrating that the old
  route and default checkpoint were not replaced.
- An arbitrary profile name failed parameter validation before script work.
- The Comfy queue remained empty. The newest external output stayed
  `WormsPortConditioned_00002_.png` from
  `2026-08-02T19:31:17.8169394Z`; Gate 3 wrote no generated image.

The FLUX workflows are now executable only through the closed reviewed profile,
but no inference has occurred. Gate 3 does not establish that the 8 GB GPU can
load or sample the complete chain. The next bounded action is one Gate 4
fixed-seed technical text-to-image smoke. It must record runtime and memory
behavior plus the exact quarantined output; it must not evaluate the B1 art
briefs, use reference editing, or trigger product promotion.
