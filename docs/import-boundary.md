# Import Boundary

This project has two upstream roles. They are intentionally not symmetrical.

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

## Product Asset Gate

Only files under `assets/` are product assets. Every product asset must have a
matching `legal/asset-manifest.json` entry before commit.

The manifest gate requires:

- source URL
- origin repo or direct original source
- author
- exact license
- commercial use allowed
- redistribution allowed
- modification allowed
- evidence URL
- checked date
- approved decision

If any field is unclear, the asset stays out of `assets/`.
