# Import Boundary

This project has one approved base-code upstream and one quarantined gameplay
reference. They are intentionally not symmetrical. Additional MIT technical
references may inform bounded implementation patterns but are not imported
upstreams or product asset sources.

## TurtlePU/worms-ii

Role: approved base code.

`TurtlePU/worms-ii` is MIT licensed and is the only upstream repo imported as
code. The imported base is pinned in `legal/source-manifest.json`. Generated
build output from the upstream repo is excluded.

Allowed:

- Maintain and modify imported MIT code.
- Keep MIT notices and source traceability.
- Replace product name, theme, art, audio, and UI over time.

Required:

- Preserve upstream MIT notice.
- Keep the source manifest updated when the base import is refreshed.

## lorgan3/sorcerers

Role: quarantined reference/archive only.

`lorgan3/sorcerers` is GPL-3.0 and includes many third-party graphics and audio
sources. It is not a free product asset bucket.

Allowed:

- Inspect gameplay ideas.
- Use it to discover candidate asset origins.
- Store local raw review material under ignored quarantine folders.

Blocked:

- Copying Sorcerers code into `client/`, `server/`, `shared/`, or scripts.
- Bulk importing Sorcerers assets.
- Treating Sorcerers credits as sufficient license evidence.
- Importing any asset without exact-file source, author, license, evidence URL,
  checked date, and an approved manifest entry.

## Mobile Input Technical References

Role: approved code-reference-only sources.

The pinned `phaserjs/examples`, `rexrainbow/phaser3-rex-notes`,
`colinkiama/last-one-flying`, and
`Acquati/touchscreen-joystick-for-phaser-3` commits in
`legal/source-manifest.json` may inform WP-010 touch input, drag-vector,
dead-zone, orientation, event-isolation, and applied scene/system integration.

Allowed:

- Inspect only the recorded source paths and their directly required helper
  code.
- Reimplement product-specific behavior against Phaser 3.90 APIs.
- Copy a small MIT code fragment only after recording the exact source path,
  preserving its notice, and updating `copied_into` in the source manifest.

Blocked:

- Importing example images, sounds, fonts, skins, demo assets, or other media.
- Treating the reference repos as product asset buckets.
- Adding a Rex plugin dependency without dependency-license and bundle review.
- Assuming a Phaser 3.86 or current Phaser 4 example works unchanged with the
  project's Phaser 3.90 runtime.
- Copying generic joystick code when a smaller product-owned control adapter
  satisfies the documented behavior.
- Copying Last One Flying's fixed-position dual-stick layout or Acquati's direct
  keyboard-cursor mutation instead of implementing the documented turn-based
  command and cancellation model.

## Product Asset Gate

Only files under `assets/` are product assets. Every product asset must have a
matching `legal/asset-manifest.json` entry before commit.

The manifest gate requires:

- source URL
- origin repo or direct original source
- author
- exact license
- exact-file SHA-256
- commercial use allowed
- redistribution allowed
- modification allowed
- evidence URL
- checked date
- approved decision

If any field is unclear, the asset stays out of `assets/`.

An approved entry is not automatically shipped. Runtime candidates must also
declare a unique `runtime_path` below `assets/product/`. The client build copies
only those explicitly approved entries, verifies source/destination byte
hashes, and publishes `/assets/approved-assets.json`. Entries without a runtime
path, including the Pocket Robot traceability fixture, stay outside the client
build.
