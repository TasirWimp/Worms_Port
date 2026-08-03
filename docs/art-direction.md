# NIMble Knots World And Art Direction

Status: active production direction for the mobile competition release. This
document defines the current creative boundary. It does not approve concept
images or Nimiq brand elements as runtime product assets.

## Product Identity

- Game: **NIMble Knots**
- Subtitle: **Cotton Clash**
- Tagline: **Soft heroes. Epic clashes.**
- World: **The Patchwork Realms**
- Creatures: **Knotkin**
- Teams: **Guilds**
- Matches: **Clashes**
- Battlefields: **Patches**
- Character roles: **Callings**
- Magic and life force: **NIM Thread**
- Special abilities: **NIMbursts**
- Weapons and tools: **Relics**
- Health: **Stitching**
- Defeat: **Unraveling**
- Revival: **Restitching**
- Winner title: **Grand Knot**

Repository and upstream provenance may continue to use `Worms_Port`,
`TurtlePU/worms-ii`, and other historical names where accuracy requires them.
They are not the user-facing product identity.

## Core Fantasy

NIMble Knots is a playful fantasy artillery game about tiny handcrafted heroes
fighting spectacular comic battles. The confrontation and shooting mechanics
remain central. The re-theme must not turn the project into a robot, racing,
salvage, or non-combat game.

The Patchwork Realms are floating lands made from felt, yarn, cotton, wood,
buttons, and embroidery. NIM Thread is a luminous golden force that binds the
world together, gives Knotkin life, powers magic, and restitches defeated
fighters. Rival Guilds clash over magical spools, Loomstones, and Relics.

Combat is dramatic but not graphic. Impacts create cotton bursts, thread
spirals, embroidered marks, and comic reactions. A defeated Knotkin unravels
into fluff and thread and can later be restitched.

## Competition Release Mode

The first release is an immediately playable single-player artillery challenge
for phones inside Nimiq Pay. It does not depend on matchmaking.

- **Practice Clash:** starts without a wallet prompt, has unlimited retries,
  and does not pay a reward.
- **Daily Grand Knot Challenge:** uses a wallet-signed challenge ticket and a
  deterministic server-authoritative match against an AI-controlled Knotkin.
- **Loomkeeper:** the AI opponent follows the same movement, aiming, Relic,
  damage, and turn rules as the player. Its implementation must be independently
  designed and must not reproduce Sorcerers algorithms.
- **Win condition:** defeat the Loomkeeper within a disclosed turn limit.
- **Release Callings:** Wizard, Thief, and Warrior are the initial player
  choices. They share gameplay statistics until balancing tests justify
  differences. Ranger, Alchemist, and Cleric remain part of the canonical
  visual world and later content roadmap.

PvP, matchmaking, Guild rosters, tournaments, and player-funded entry are
post-competition concerns. Their future implementation must not complicate or
delay the single-player release.

## Mobile Presentation

NIMble Knots is composed for phone screens rather than desktop play scaled
down after implementation.

- WP-011D temporarily makes the landscape composition the default inside a
  portrait-locked Nimiq Pay viewport by rotating the complete game surface.
  This is a host workaround until Nimiq Pay supports full-screen game mode, not
  a change to the world's visual direction.
- The normal portrait layout remains maintained through `?sideways=off`: the
  fixed 16:9 Patch uses the maximum safe rectangle and contextual thumb controls
  overlay or occupy the surrounding space without reserving a permanent band.
- Actual landscape viewports use the landscape composition directly and must
  not receive a second virtual rotation.
- All gameplay commands use touch/pointer interaction; no hover, keyboard,
  right-click, or precision-mouse action may be required.
- Aiming, power, movement, Relic selection, confirmation, pause, and retry must
  remain readable and operable with safe-area insets and browser chrome.
- The arena reads first. Keep turn/time compact, anchor exact Stitching near the
  relevant Knotkin, use floating movement/aim pads, expand Relics temporarily,
  keep Fire explicit, and move Retry into the Pause sheet. Controls may fade by
  phase but keep stable anchors and accessible state.
- Wallet approval dialogs pause challenge timers and cannot cause a lost turn.
- Character silhouettes, eyes, held Relics, trajectory previews, hazards, and
  Stitching state must remain legible at the smallest supported phone viewport.

## Release Relic Roster

The competition release has exactly three independently designed Relics. Their
mechanics are product-authored and do not derive from Sorcerers names,
constants, algorithms, code, or assets.

- **Threadball** (`threadball`) is the balanced baseline: a wound ball of NIM
  Thread with medium range and medium Stitching damage.
- **Needlepoint** (`needlepoint`) is the long-range choice: a toy-like polished
  needle trailing luminous thread, with the highest range and lowest Stitching
  damage.
- **Spoolburst** (`spoolburst`) is the heavy close-range choice: an oversized
  wooden spool that deals the highest Stitching damage at the lowest range.

WP-015 differentiates only these two dimensions: range and maximum direct
Stitching damage. Damage radius, terrain radius, precision, falloff, ammo,
cooldowns, secondary effects, and Calling modifiers remain on a shared basic
baseline or are deferred until the assembled game has been evaluated on real
phones. Any future precision mechanic must be deterministic and disclosed; it
must not introduce hidden or ambient random misses.

The existing `nimble-knots-artillery-v2` constants remain immutable replay
history. The range/damage identities above are planned for a new versioned
ruleset rather than changing historical v2 results.

All three use the same movement budget, angle and power inputs, projectile
flight, collision authority, one-shot turn completion, and Stitching scale for
player and Loomkeeper. Selection has no ammo, cooldown, hidden modifier, or
Calling restriction and remains active until another Relic is selected.

Code-drawn placeholders and production assets must remain distinct without
color alone: Threadball reads as round and balanced, Needlepoint as fast and
long-reaching, and Spoolburst as heavy and short-reaching. WP-015 visuals must
not imply unimplemented radius, precision, or secondary-effect differences.

## Knotkin Anatomy

All Knotkin share one readable species silhouette:

- a broad angular hexagonal head-and-torso with a flat crown,
- chamfered cheeks and sloped shoulders,
- short angular arms,
- a narrow lower bridge,
- two separate stubby rectangular feet,
- exactly two oversized glossy black bead eyes,
- one small readable mouth suitable for expression variants, and
- no nose, eyebrows, or other facial marks.

The shape is inspired by the user-supplied Nimiq emoticon reference. It must be
expressed as soft three-dimensional anatomy, not printed as a Nimiq logo.
Emotion comes from eye angle, the small mouth, body tilt, pose, costume, and
animation. The neutral master keeps one simple mouth that later expression
variants may replace without changing the eyes or body silhouette.

Costumes may exaggerate a Calling but must not hide the shared body silhouette.
The design must remain readable at mobile-game scale.

## Callings

- **Wizard:** folded hood, spool staff, pom-pom spells, tangled lightning.
- **Thief:** low hood, long scarf, needle grappling tool, button smoke bombs.
- **Warrior:** felt armor, thimble helmet, button shield, spool hammer.
- **Ranger:** stitched hat, twig-and-thread bow, yarn quiver.
- **Alchemist:** stitched goggles, dye flasks, glue traps, cotton mixtures.
- **Cleric:** layered robes, repair thread, protective patches, needle wand.

These are visual and gameplay archetypes, not imports from Sorcerers. Sorcerers
may inform high-level gameplay observation only; its code, costumes, artwork,
audio, names, and other assets remain quarantined.

## Material Language

- Bodies use chunky chenille crochet with visible stitches and cotton stuffing.
- Clothing uses felt, woven yarn, embroidery, cords, and tassels.
- Hardware uses wooden buttons, spools, beads, buckles, and polished thimbles.
- Terrain uses layered felt, tufted yarn grass, cotton clouds, and stitched
  edges.
- Damage tears, compresses, scorches, and releases stuffing instead of
  simulating realistic soil or injury.
- Equipment is oversized and toy-like. Avoid realistic firearms and military
  camouflage.

## Nimiq Visual Reference

The art direction translates the [Nimiq Style reference](https://nimiq.github.io/submodules/style/demo.html)
into physical materials rather than copying a flat interface into the world.

- Nimiq Blue `#1F2348`: structural textiles, deep shadows, framing.
- Nimiq Light Blue `#0582CA`: interactive magic and high-energy accents.
- Nimiq Gold `#E9B213`: NIM Thread, rewards, premium details.
- Nimiq Green `#21BCA5`: healing and alchemy.
- Nimiq Orange `#FC8702`: impact energy and warm hero accents.
- Nimiq Red `#D94432`: warrior and danger accents.
- Nimiq Purple `#5F4B8B`: stealth and trickster magic.
- Nimiq Pink `#FA7268`: playful secondary accents.
- Nimiq Light Green `#88B04B`: ranger and natural materials.
- Nimiq Brown `#795548`: wood, leather-like felt, and neutral hardware.

The palette should remain varied and tactile. Nimiq logos, icons, fonts, CSS,
and other brand files are not approved product inputs merely because they are
visible in the public style reference. Exact license or written brand-use
permission is required before importing them.

## Nimiq Reward Loop

The competition-safe concept uses a sponsor or community-funded **Prize Loom**,
not player-funded winner-takes-all deposits.

1. A player may start Practice immediately without connecting a wallet.
2. Before a rewarded challenge, the player signs a short-lived challenge
   request through Nimiq Pay.
3. The server confirms eligibility and reserves one available fixed reward for
   the disclosed challenge window.
4. A deterministic NIM Thread seed weaves the player and Loomkeeper into the
   Patch under equal, published rules.
5. The server authoritatively verifies movement, shots, damage, turns, victory,
   and the final replay hash.
6. An eligible winner may claim the reserved fixed NIM reward exactly once.
7. When the daily Prize Loom is empty, Practice remains available and the UI
   must disclose that no reward can be won before play starts.

Reward amount, daily budget, eligibility window, and reservation timeout are
deployment configuration, not client authority. Claims require an expiring
nonce, replay protection, idempotency, rate limits, a daily payout ceiling, and
an operator kill switch. A consenting pseudonymous device identifier may be
combined with the wallet identity for abuse resistance and leaderboard use.

Escrow, betting, chance-based payouts, player stakes, and player-loss-funded
rewards are blocked. Real sponsor funds require a separate operational approval
and payout canary outside ordinary autonomous code refinement.

## Current Concept Artwork

The retained images record the concept progression. All three are
documentation-only and must not be referenced by runtime code or moved into
`assets/` without completing the product asset gate.

### Cotton Material And Battle Study

![Cotton artillery battle study](images/art-direction/cotton-clash-battle-study.png)

This exploration established tactile crochet terrain, cotton-puff projectiles,
comic fantasy confrontation, and readable class colors. Its elongated body
shapes are superseded and are not canonical Knotkin anatomy.

### Fantasy Calling Study

![Early Knotkin fantasy Calling lineup](images/art-direction/knotkin-calling-lineup-study.png)

This exploration established the Wizard, Thief, Warrior, Ranger, Alchemist,
and Cleric lineup. Its rounded doll anatomy predates the Nimiq-inspired body
shape and is superseded.

### Current Knotkin Direction

![Knotkin fantasy Calling lineup](images/art-direction/knotkin-class-lineup-concept.png)

This image is the canonical artwork reference for future Knotkin and Calling
production. New character briefs, pose masters, sprites, portraits, promotional
art, and in-game Calling depictions must begin from its visual system:

- the same shared angular crochet body family,
- exactly two oversized glossy bead eyes and one small expressive mouth,
- the pictured Calling color identities and material vocabulary,
- chunky yarn bodies, felt garments, visible stitches, wooden buttons, spools,
  polished thimbles, and toy-like fantasy equipment,
- compact silhouettes that remain readable on a phone,
- a warm handcrafted stage with cotton clouds and stitched Patchwork terrain.

The project owner's 2026-08-03 mouth amendment is the one deliberate forward
deviation from the pictured faces: production masters add one small neutral
mouth so animation can provide expression variants. The lineup remains
canonical for anatomy, eyes, palette, material, costume, and world language;
the mouth amendment does not authorize other unrecorded redesigns.

The image is a design reference, not a sprite sheet or runtime source. The user
has approved it as the canonical creative and generation reference, so approved
production tools may receive the tracked file as conditioning input when its
path and SHA-256 are recorded. Do not crop, trace, or ship its pixels directly.

### Deterministic Wizard Structure Guide

![Project-owned Wizard structure guide](images/art-direction/knotkin-wizard-structure-guide.png)

`docs/images/art-direction/knotkin-wizard-structure-guide.png` is a
documentation-only control image for the bounded WP-015B2B Wizard recovery. It
is not concept art, generated output, or a runtime sprite. The project-owned
script `scripts/generate-wizard-structure-guide.js` draws it from the written
Knotkin anatomy and frozen 512x512 geometry contract without reading, cropping,
tracing, or copying any concept pixels.

- PNG SHA-256:
  `5A8F1C1D0942755F113327467462D47812A22A64BAF3DF2C5CD2E0F491FA9AA1`
- Generator SHA-256:
  `695B499E67794692BFEB248C22CA24C24C2D0091107B4EAAE247D29830FCAF63`
- Canvas: opaque 1024x1024 PNG on white.
- Frozen guide geometry: ground baseline `y=902`; held-Relic socket center
  `(682,586)`, exactly twice the B1 512x512 coordinates.

Its approved generation uses are the completed fixed-seed FLUX.2 Klein
single-reference diagnostic and the completed WP-015B2C Gate 1 robot-scaffold
test.
The first use defined structure and pose while the prompt defined crochet
material and Wizard Calling identity, but FLUX returned to rounded doll anatomy
and failed. B2C therefore removes crochet/Calling semantics for one mechanical
control. Gate 1 passed, and Gate 2 must reference only those exact robot bytes,
not the guide. The guide remains documentation evidence; it may not enter
`assets/`, substitute for exact-output review, authorize a rerun/other
character/batch, or be described as finished product artwork.

WP-015B2C proved the temporary mechanical-scaffold route without changing the
world boundary. Gate 1's external robot is SHA-256
`BC6B21B74C5016504A733D5D1EC306FE7F46A8CC5E526E0FFF28EB9EABC25D38`.
Gate 2's external fitted-knit conversion is SHA-256
`5FF0A63DAC03E13B2A3390AD77E6929A9822412E1A1E0415E7A38125D703B246`;
it preserves `0.956188` normalized silhouette IoU and a 12-pixel baseline drift.
This is route evidence only. The knit output retains construction seams and a
rear scaffold volume and lacks final Calling design, alpha, socket
normalization, animation, and exact-output product approval.

The first production interpretation is frozen in
`asset-briefs/wp-015b1-vertical-slice.md`. That contract translates the lineup
into isolated Wizard and Loomkeeper masters, a separate Threadball family, and
decomposed Patch 01 materials without copying the lineup's composite pixels.

For WP-015B0 the project owner records that the Nimiq team/foundation
encouraged the Nimiq-inspired body geometry for the Mini App competition: its
purpose is to bring the brand to a wider audience and build a recognizable
connection with Nimiq. That owner-supplied record closes the project's internal
competition-scope geometry decision. It does not import or authorize an
official Nimiq logo, icon, font, or other brand file, and the game must not claim
to be an official Nimiq product. Generated derivatives remain in quarantine
until their prompts, workflows, model licenses, source hashes, output hashes,
review, and manifest entries are complete.

### Concept Provenance

- `docs/images/art-direction/cotton-clash-battle-study.png`
  - Output SHA-256:
    `32F5672F5901B717DD7814040A51BFCE9194A200C6B613E388FB4BF830B555E8`
  - User-supplied cotton/crochet reference SHA-256:
    `0B0BB0502382167D52E599FD7A2AEE30A5FD03F5D371D0B043E4DE02A7ED47C7`
  - User-supplied Nimiq emoticon reference SHA-256:
    `FD99E18A96BF6CA12748A8B320AE6B3088EE37B1E2FAC387EE627E938CC04E9F`
- `docs/images/art-direction/knotkin-calling-lineup-study.png`
  - Output SHA-256:
    `27E3E7CED3D1453BF4EF68CF65F8E825F2C783E71708B4D6B57C55CEF05299DD`
  - OpenAI-generated material/class reference SHA-256:
    `32F5672F5901B717DD7814040A51BFCE9194A200C6B613E388FB4BF830B555E8`
- `docs/images/art-direction/knotkin-class-lineup-concept.png`
  - Output SHA-256:
    `B4B9B1E676E7DD5CD13F7ABB2B63048884D209295379FCC10347348F80D5FD46`
  - User-supplied Nimiq shape reference SHA-256:
    `1D86C3C01A75BD99FE918BDE6356EBB336FCA90F3E12FD58F6EF15F6247F1497`
  - Prior OpenAI-generated Calling study SHA-256:
    `27E3E7CED3D1453BF4EF68CF65F8E825F2C783E71708B4D6B57C55CEF05299DD`
  - Style reference:
    `https://nimiq.github.io/submodules/style/demo.html`

All three were generated on 2026-07-10 with OpenAI built-in image generation
under TasirWimp's authoring direction. OpenAI output terms do not by themselves
grant rights to third-party brands represented in input references. The
project-owner record above documents the Nimiq team/foundation encouragement
and approves the inspired geometry as the project's competition direction; any
official Nimiq brand file still needs separate exact permission and provenance.
No Sorcerers material was used.

The earlier Pocket Robot asset is a superseded import-workflow trial and is not
part of the NIMble Knots art direction. WP-003 removed it from runtime. The
approved file remains under `assets/` only as a traceability fixture until a
separate archive or removal policy is adopted.

## Art Boundary

Required:

- cute cotton Knotkin with the shared angular anatomy,
- big eyes and one small expression-ready mouth,
- readable fantasy Callings,
- playful artillery confrontation,
- tactile crochet, felt, cotton, and stitched terrain,
- strong mobile-scale silhouettes,
- per-file commercial-use and redistribution evidence for production assets.
- production briefs that cite
  `docs/images/art-direction/knotkin-class-lineup-concept.png` as the canonical
  visual reference and record any additional inputs separately.

Blocked:

- Worms or Team17 character silhouettes, names, UI, or branded visual motifs,
- Sorcerers code, artwork, costumes, audio, or copied character designs,
- realistic violence, gore, firearms, or grim military presentation,
- robots as the canonical player characters; a quarantined mechanical scaffold
  may be used only as a temporary generation-control input when its exact
  contract and output are recorded,
- unlicensed Nimiq brand assets or an implication that the game is an official
  Nimiq product,
- concept art entering runtime without an approved asset-manifest entry.

## Open Decisions

- If an official Nimiq logo, icon, font, or other brand file is proposed later,
  archive its separate written permission and exact-file provenance before use.
- Validate the frozen Wizard/Loomkeeper animation and socket contract in the
  first playable visual slice before extending it to Thief and Warrior.
- Validate Patch 01 tiling, phone composition, and code-owned circular
  destruction before producing additional Patches or decorative layers.
- Set the fixed reward, daily Prize Loom budget, eligibility window, and
  reservation timeout before enabling real payouts.
- Provide an Android/iOS release-testing environment when physical-device
  validation is scheduled; it remains outside the autonomous cycle.
