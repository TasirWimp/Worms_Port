# WP-015B1 Vertical-Slice Asset Briefs

Status: frozen historical B1 contract, amended for future character work by the
WP-015B2C mouth, WP-015B2D creative-expression, and WP-015B2G rounded-doll
decisions below.

This document is the production contract for the first NIMble Knots visual
slice: Wizard, Loomkeeper, Threadball, and Patch 01. WP-015B1 writes and reviews
the contract only. It generates, promotes, and integrates no media.

## Boundary And Source

- Canonical visual reference:
  `docs/images/art-direction/knotkin-class-lineup-concept.png`
- Canonical reference SHA-256:
  `B4B9B1E676E7DD5CD13F7ABB2B63048884D209295379FCC10347348F80D5FD46`
- The concept supplies material, palette, costume, and world-language guidance.
  Its angular anatomy is historical after WP-015B2G. Its pixels may not be
  cropped, traced, normalized, or shipped.
- Do not pass the complete lineup directly to ordinary VAE img2img. Its
  multi-character landscape composition conflicts with the isolated-master
  contract. Image-conditioned refinement may begin only from an isolated,
  quarantined candidate that has passed master review.
- No Sorcerers, Worms/Team17, official Nimiq brand file, or other unrecorded
  third-party input is allowed in prompts, conditioning, comparison, or output.
- Nimiq-inspired body geometry was project-approved for the competition scope,
  but WP-015B2G no longer requires it after the generation evidence showed a
  persistent conflict with the selected cute crochet-doll direction. Outputs
  must not display an official Nimiq logo or claim official-product status.
- Every output remains in external quarantine until its exact file, parents,
  generation record, visual/IP review, and product manifest entry pass.

### WP-015B2C facial amendment

The project owner approved one small expressive mouth on 2026-08-03. Future
Knotkin masters require exactly two glossy bead eyes and one small neutral mouth;
later animation may replace that mouth with bounded expression variants. No
nose, eyebrows, extra eye, or other facial feature is introduced.

### WP-015B2D creative-expression amendment

The project owner accepted the B2D Wizard's minimal stitched eyebrows and
bounded body variation on 2026-08-03. Future masters still require exactly two
bead eyes and one small expression-ready mouth, but may add one intentional
stitched eyebrow above each eye when it improves friendly expression. Eyebrows
are an allowed creative choice, not a mandatory species feature. A nose, extra
eye, duplicated mouth, unrelated face mark, or inconsistent accidental feature
remains blocked.

Under the historical B2D decision, silhouette comparison was diagnostic evidence
rather than pixel-deterministic art authority. Its then-protected body property
was the broad angular Knotkin family: flat-crowned/chamfered upper body, narrow
lower bridge, separate feet, and no return to a round head stacked on an oval
torso. That record explains the later control work but is superseded by B2G
below.

### WP-015B2G rounded-doll and Relic-palm amendment

The project owner superseded the angular body requirement on 2026-08-03 after
reviewing the complete B2A-B2F path. FLUX repeatedly mapped cute crochet
characters to rounded doll anatomy. Enforcing the earlier hexagonal target
required a robot scaffold, material conversion, and protected garment edits
that successively introduced mechanical residue, reduced cuteness, produced a
thief-like wrap, or exposed hard composite seams. Future Knotkin masters instead
share a compact rounded crochet-doll head and body, short separate limbs, two
separate feet, exactly two bead eyes, one small expression-ready mouth, and
optional paired stitched eyebrows.

The Wizard's image-right arm reaches away from the torso and ends in an
upward-facing cupped crochet mitten. Its palm reads like a shallow bowl: the
thumb and rounded mitten edge rise without meeting, leaving an empty,
unobstructed cradle for a separately rendered Relic. This visible-shape wording
supersedes abstract `C-shaped grip` or invisible-cylinder instructions. The
shared held-Relic socket, baseline, projectile origin, animation triggers,
external quarantine, and exact-file approval gates remain normative. Future
Loomkeeper and roster characters use the same rounded family while retaining
distinct Calling colors and costumes.

The exact SD 1.5 prompts and negative prompt below remain unchanged historical
evidence for reproducibility. Their `no mouth`/`mouth` exclusions are superseded
for future candidates and must not be copied into WP-015B2C or later generation
contracts. Their angular anatomy language is likewise superseded. Baseline,
socket, animation, environment, and source-boundary requirements remain
normative.

## Exact Generation Contract

This contract applies only to the frozen, rejected B1/SD 1.5 run. B2G uses the
separately admitted FLUX.2 Klein profile, exact settings, and exact prompts
recorded in `docs/asset-briefs/wp-015b2-generation-review.md`; it does not
retroactively change the historical contract below.

The original WP-015B2 run could use only these already-reviewed components:

| Component | Exact value |
| --- | --- |
| Checkpoint | `v1-5-pruned-emaonly-fp16.safetensors` |
| Checkpoint SHA-256 | `E9476A13728CD75D8279F6EC8BAD753A66A1957CA375A1464DC63B37DB6E3916` |
| Text workflow | `generate_image` / `workflows/generate_image.json` |
| Text workflow SHA-256 | `968A5B78766549BBAF374C1C27BE80B75E6BB389A01CCC237639DFB4EFCF3CD5` |
| Conditioned workflow | `generate_image_conditioned` |
| Conditioned workflow SHA-256 | `C21BD9224D08E1708073C3C11BFF749E4B901F5BE20EFE32245DAE6B489D3060` |

All initial candidates use the text workflow with the following exact settings:

| Setting | Value |
| --- | ---: |
| Width | `512` |
| Height | `512` |
| Batch size | `1` |
| Steps | `28` |
| CFG | `7` |
| Sampler | `euler` |
| Scheduler | `normal` |
| Denoise | `1.0` |

An image-conditioned refinement is allowed only after the input is an isolated,
reviewed, quarantined master staged through `StageInput`. It reuses that
asset-family seed and exact positive/negative prompts with steps `24`, CFG `6`,
sampler `euler`, scheduler `normal`, and denoise `0.35`. Any other input,
component, prompt, seed, dimension, sampler, scheduler, or denoise value needs a
reviewed amendment to this contract before use.

The generator may return an opaque PNG. A plain isolated background is therefore
acceptable for a quarantined source candidate. Do not describe it as an RGBA
master until a reviewed deterministic normalization step has produced and
verified real alpha. Fake checkerboard transparency is a rejection.

### Seed register

| Seed | Purpose |
| ---: | --- |
| `15015000` | Completed B0 technical smoke; never a production candidate |
| `15015001` | Wizard isolated master |
| `15015002` | Loomkeeper isolated master |
| `15015003` | Threadball isolated master |
| `15015004` | Patch 01 cotton-cloud master |
| `15015005` | Patch 01 terrain-top master |
| `15015006` | Patch 01 terrain-interior master |

Generate one primary candidate per registered purpose. A rejection does not
authorize seed shopping or silent prompt changes. Record the failure, keep the
file quarantined, and amend this contract before another primary generation.

### Shared character negative prompt

Use this exact negative prompt for Wizard and Loomkeeper:

```text
multiple characters, second character, group, front view, rear view, looking left, cropped head, cropped feet, cut off body, scenery, landscape, room, props in foreground, text, letters, numbers, watermark, signature, logo, official Nimiq logo, printed symbol, worm, slug, realistic human, realistic animal, mouth, lips, teeth, nose, nostrils, eyebrows, third eye, one eye, four eyes, extra face, extra arms, extra legs, fused feet, missing feet, detached limbs, deformed anatomy, realistic firearm, gun, rifle, military camouflage, gore, injury, blood, menacing horror, hard plastic body, metal robot, glossy vinyl toy, flat vector icon, pixel art, fake transparency, checkerboard background, cast shadow touching the body, recognizable copyrighted character
```

## Character Geometry And Animation

Wizard and Loomkeeper share one normalization contract:

| Field | 512x512 source | 192x192 runtime candidate |
| --- | ---: | ---: |
| Ground pivot | `(256, 451)` | `(96, 169)` |
| Held-Relic socket | `(341, 293)` | `(128, 110)` |
| Projectile-origin offset in Relic-local space | `(96, 0)` | `(36, 0)` |
| Motion-safe horizontal bounds | `64..448` | `24..168` |
| Motion-safe top/baseline | `32..451` | `12..169` |

The master uses a right-facing, orthographic-like three-quarter side view so
both bead eyes remain visible. The forward hand aligns to the held-Relic socket
without a Relic baked into neutral locomotion. Runtime rotates a separate Relic
around that socket; the local origin offset rotates with it. Mirroring for a
left-facing actor is allowed only after costume handedness and asymmetry review.

Aim pose selection follows the authoritative locked angle:

- `aim_low`: angle below `30_000` millidegrees,
- `aim_mid`: angle from `30_000` through `59_999` millidegrees,
- `aim_high`: angle from `60_000` through `90_000` millidegrees.

The vertical slice freezes these frame counts and triggers:

| State | Frames | Timing | Trigger |
| --- | ---: | --- | --- |
| `idle` | 6 | 140 ms, loop | Stable living actor with no more specific presentation |
| `move` | 8 | 90 ms, loop | Accepted movement presentation until the unit reaches its authoritative position |
| `aim_low` | 1 | hold | Locked low-angle aim presentation |
| `aim_mid` | 1 | hold | Locked mid-angle aim presentation |
| `aim_high` | 1 | hold | Locked high-angle aim presentation |
| `fire` | 5 | 70 ms, once | Accepted Fire presentation; release on zero-based frame `2` |
| `hit` | 4 | 90 ms, once | Authoritative `damaged` event with amount greater than zero |
| `unravel` | 8 | 110 ms, once | Stitching reaches zero and this actor loses |
| `victory` | 8 | 120 ms, loop | Authoritative terminal winner |

The release frame must use the same socket and local projectile-origin offset
as the held aim pose. Presentation animation never changes collision, shot
origin, damage, turn timing, or replay truth.

## Brief: Wizard

- Asset-family ID: `knotkin-wizard-v1`
- Intended product path after approval:
  `assets/product/characters/knotkin/wizard/`
- Purpose: initial player Calling and first character integration master.
- Seed: `15015001`
- Palette: Nimiq Light Blue `#0582CA`, Nimiq Blue `#1F2348`, Nimiq Gold
  `#E9B213`, with pale-blue cotton highlights.
- Silhouette: shared compact rounded crochet-doll anatomy, short separate limbs,
  two separate feet, and one readable upward-facing cupped palm.
- Costume: tall pointed deep-blue felt Wizard hat with a softly folded tip,
  small gold stitched stars, visible gold blanket stitching,
  woven belt and wooden button clasp. A compact spool staff may be strapped
  behind the rear shoulder, but the forward hand and Relic socket remain clear.
- Expression: curious and determined through eye angle, one small neutral mouth,
  optional minimal paired stitched eyebrows, and forward body lean; exactly two
  glossy black bead eyes and no nose, extra eye, or unrelated facial marks.

Historical exact SD 1.5 positive prompt, superseded for future generation by
WP-015B2G:

```text
one complete cute handcrafted crochet fantasy game character, an angular Knotkin Wizard in a right-facing orthographic three-quarter side view, both glossy black bead eyes visible, no mouth, broad hexagonal head and torso with flat crown, chamfered cheeks, sloped shoulders, short angular arms, narrow lower bridge, two separate stubby rectangular feet, chunky pale blue chenille crochet body with visible stitches and cotton softness, folded deep navy felt wizard hood, gold blanket stitching, woven belt and wooden button clasp, compact wooden spool staff strapped behind the rear shoulder, empty forward hand held clearly in front for a separate game Relic, full feet on one level baseline, warm soft studio lighting, tactile yarn and felt materials, strong readable mobile game silhouette, one centered isolated subject on a plain uniform near-white background, generous empty padding, high quality 2D game asset source
```

Wizard acceptance:

- the rounded crochet-doll anatomy and blue/gold Wizard identity remain readable,
- the upward-facing cupped palm can align to the shared socket without covering
  an eye,
- the pointed star hat leaves the face visible and the two feet remain separate,
- staff, belt, and tassels stay inside motion-safe bounds and do not read as a
  realistic weapon,
- both eyes remain distinct at a 48-pixel-tall phone preview, and
- no official Nimiq mark, text, scenery, second character, or selected Relic is
  present.

## Brief: Loomkeeper

- Asset-family ID: `knotkin-loomkeeper-v1`
- Intended product path after approval:
  `assets/product/characters/knotkin/loomkeeper/`
- Purpose: friendly but unmistakable opposing AI character using the same rules
  and animation/socket contract as the player.
- Seed: `15015002`
- Palette: Nimiq Purple `#5F4B8B`, Nimiq Pink `#FA7268`, Nimiq Blue
  `#1F2348`, and restrained Nimiq Gold `#E9B213` stitching.
- Silhouette: shared rounded crochet-doll anatomy with a short keeper mantle and
  a folded asymmetrical cowl that does not resemble the Wizard hat.
- Costume: purple chenille body, coral felt mantle, dark woven sash, wooden
  buttons, a small decorative loom-shuttle charm fixed to the rear belt. No
  crown, armor, staff, weapon, villain spikes, or selected Relic.
- Expression: calm, capable, and competitive rather than sinister; exactly two
  glossy black bead eyes, one small neutral mouth, optional minimal paired
  stitched eyebrows, and no nose, extra eye, or unrelated facial marks.

Historical exact SD 1.5 positive prompt, superseded for future generation by
WP-015B2G:

```text
one complete cute handcrafted crochet fantasy game character, a friendly opposing Loomkeeper in a right-facing orthographic three-quarter side view, both glossy black bead eyes visible, no mouth, broad angular hexagonal head and torso with flat crown, chamfered cheeks, sloped shoulders, short angular arms, narrow lower bridge, two separate stubby rectangular feet, chunky purple chenille crochet body with visible stitches and cotton softness, short coral felt keeper mantle, asymmetrical folded cowl distinct from a wizard hood, dark woven sash, wooden button fasteners, restrained gold stitching, tiny decorative wooden loom-shuttle charm fixed behind the rear hip, empty forward hand held clearly in front for a separate game Relic, calm capable competitive pose, full feet on one level baseline, warm soft studio lighting, tactile yarn felt and wood materials, strong readable mobile game silhouette, one centered isolated subject on a plain uniform near-white background, generous empty padding, high quality 2D game asset source
```

Loomkeeper acceptance:

- the opponent reads as friendly and distinct from Wizard in grayscale and at a
  48-pixel-tall phone preview,
- cowl and mantle preserve the shared rounded crochet-doll species silhouette,
- the forward hand aligns to the shared socket and all asymmetry stays stable,
- the rear charm cannot be mistaken for a held weapon or projectile,
- there is no crown, evil face, military motif, selected Relic, or extra eye,
  and
- purple/coral color supports recognition but is not the only distinction.

## Brief: Threadball

- Asset-family ID: `relic-threadball-v1`
- Intended product path after approval: `assets/product/relics/threadball/`
- Purpose: balanced default Relic with medium range and medium direct Stitching
  damage. The art must not imply special radius, precision, homing, or secondary
  effects.
- Seed: `15015003`
- Master: one centered spherical wound-yarn object, no hand, character, icon
  frame, trail, impact, scenery, text, or shadow touching the object.
- Material/palette: sky-blue chenille thread core, a small number of luminous
  gold NIM Thread wraps, visible soft fibers, round balanced silhouette.
- Planned derivatives from the approved master: 48x48 UI icon, 36x36 held
  sprite, 28x28 projectile. The simple trail and impact remain separately
  reviewed derivatives and may not imply a larger damage radius.

Exact positive prompt:

```text
one single centered spherical Threadball game Relic, a compact balanced ball of hand-wound chunky sky-blue chenille yarn wrapped by a few thin luminous golden threads, tactile visible fibers and layered yarn strands, perfectly readable round silhouette, playful soft textile fantasy artillery projectile, medium visual weight, warm soft studio lighting, no character and no hand, one isolated object on a plain uniform near-white background, generous empty padding on every side, high quality 2D mobile game asset source
```

Exact negative prompt:

```text
multiple objects, second ball, character, creature, hand, arm, face, eyes, mouth, scenery, landscape, room, icon frame, user interface, text, letters, numbers, watermark, signature, logo, official Nimiq logo, printed symbol, needle, spool, bomb, grenade, fuse, firearm, spikes, blades, fire, explosion, huge blast, wide shockwave, homing effect, target reticle, motion blur, long trail, cast shadow touching the object, hard plastic, polished metal sphere, flat vector icon, pixel art, fake transparency, checkerboard background, recognizable copyrighted object
```

Threadball acceptance:

- silhouette remains circular at 28x28 and differs from Needlepoint and
  Spoolburst without relying only on color,
- gold wraps read as thread rather than a logo, fuse, electrical cage, or orbit,
- no trail or impact is baked into the projectile master,
- the object remains centered with complete padding and no cast-shadow contact,
  and
- the result communicates medium weight, not a needle-fast or spool-heavy
  extreme.

## Brief: Patch 01

- Asset-family ID: `patch-01-basic-v1`
- Intended product paths after approval:
  `assets/product/environment/patch-01/background/` and
  `assets/product/environment/patch-01/terrain/`.
- Purpose: one quiet tactile arena supporting maximum battlefield readability.
- Code-owned background fill: `#D9F2F3`; it needs no generated source or seed.
- Generated masters: one cotton-cloud layer, one repeatable terrain-top
  material, and one repeatable terrain-interior material. Each begins as an
  independent 512x512 candidate.
- Collision: the deterministic server terrain mask remains authoritative.
  Decorative pixels never define solidity, crater shape, or hit detection.

Shared Patch negative prompt:

```text
character, creature, face, eyes, mouth, hands, weapon, projectile, battlefield action, explosion, text, letters, numbers, watermark, signature, logo, official Nimiq logo, building, castle, loom machine, banner, foreground prop, dramatic landmark, realistic landscape, realistic soil, rocks, gore, military setting, hard plastic, glossy metal, dark horror lighting, strong perspective, vanishing point, picture frame, decorative outer border, fake transparency, checkerboard background, recognizable copyrighted scene
```

### Cotton cloud

- Seed: `15015004`
- Planned runtime derivative: one transparent layer no taller than 192 pixels,
  horizontally placeable without carrying an important landmark.

Exact positive prompt:

```text
one simple low horizontal cotton cloud made from clustered soft white cotton pompoms, handcrafted miniature textile game environment layer, rounded uneven edges, gentle warm studio light from upper left, subtle fiber detail, calm readable silhouette, no face and no scenery, centered isolated cloud on a plain uniform pale blue background, generous empty padding, high quality 2D mobile game asset source
```

### Terrain top

- Seed: `15015005`
- Planned runtime derivative: repeatable 256x64 top material with a stable
  horizontal join and no baked terrain silhouette.

Exact positive prompt:

```text
seamless horizontally repeatable handcrafted game terrain top material, a straight strip of tufted light olive green yarn grass attached to a narrow brown felt edge with small regular golden blanket stitches, tactile crochet fibers, flat orthographic material study, even lighting and density from left edge to right edge, no hills and no scenery, centered isolated material on a plain uniform near-white background, high quality 2D mobile game texture source
```

### Terrain interior

- Seed: `15015006`
- Planned runtime derivative: repeatable 256x256 interior material that remains
  convincing through arbitrary circular destruction masks.

Exact positive prompt:

```text
seamless repeatable square handcrafted game terrain interior material, layered warm brown felt and dense chunky crochet fibers with restrained short golden stitches, uniform texture and lighting across all edges, tactile soft textile depth without objects or scenery, flat orthographic material study, no border and no terrain silhouette, fills the complete square, high quality 2D mobile game texture source
```

Patch acceptance:

- cloud, top, and interior remain independent and contain no character, Relic,
  landmark, text, or collision silhouette,
- a 3x3 repeat test exposes no obvious hard seam or unique central object,
- the terrain top reads clearly above the interior at phone scale,
- circular code-owned destruction reveals consistent interior material without
  baked sky, props, or edge art,
- the cloud does not compete with trajectories, projectiles, status, or touch
  controls, and
- portrait, virtual-sideways, and actual-landscape crops preserve a quiet arena.

## WP-015B2 Handoff

Before generating anything:

1. Confirm the commit containing this contract exists on origin and the worktree
   is clean.
2. Run `Prepare`, `Status -VerifyHashes`, and `Start` through
   `scripts/comfy-asset-pipeline.ps1`.
3. Confirm the exact checkpoint and both workflow hashes above.
4. Generate only the registered primary candidates with the exact prompts,
   settings, and seeds.
5. Preserve untouched outputs in external quarantine and record timestamp,
   workflow/tool ID, settings, output ID/path, dimensions, byte size, and
   SHA-256 in `docs/evidence/wp-015b.json`.
6. Review each output against its family acceptance checks and the shared
   art/IP boundary. Do not use generic MCP publication tools.
7. Stop at reviewed quarantined candidates. WP-015B2 does not copy files into
   `assets/`, update `legal/asset-manifest.json`, or integrate runtime media.

WP-015B2 is ready to close only when every accepted master is reproducible from
this contract and every rejection remains explicitly recorded. Exact-file
promotion and gameplay integration belong to WP-015C.
