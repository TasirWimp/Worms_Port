# Implementation Plan

This plan adapts the NimiRun_CodeRepo subagent concept to Worms_Port. The goal
is scoped coordination around the current repo risks: MIT base code, Sorcerers
quarantine, commercial-use asset traceability, and a modern buildable
Phaser/Socket.IO stack.

## Current Status

- `TurtlePU/worms-ii` is imported as the MIT base code source.
- `lorgan3/sorcerers` is recorded as GPL-3.0 quarantine/reference only.
- The project builds with Vite for the client and esbuild for the server.
- Compliance checks cover product asset manifests, import-boundary rules, and
  npm package license policy.
- No Sorcerers product assets or Sorcerers code are imported.

## Codex Subagent Roles

Role-specific Codex agents live in `.codex/agents/`. Use them as scoped
workers; they coordinate through docs, manifests, commits, and completion
summaries rather than private handoff.

Current roles:

- `worms_port_planner` - feature slicing, source-boundary checks, sequencing,
  and non-goal definition before code changes.
- `worms_port_test_worker` - test planning, typecheck/build/audit verification,
  and smoke-test notes.
- `worms_port_base_game_worker` - Turtle-derived Phaser client, scene behavior,
  overlay UI, project renaming, and re-theme implementation.
- `worms_port_network_worker` - Express server, Socket.IO protocol, room/game
  lifecycle, and multiplayer runtime behavior.
- `worms_port_asset_curator` - Sorcerers quarantine, exact-file asset license
  review, `assets/`, `legal/asset-manifest.json`, and attribution.
- `worms_port_compliance_keeper` - MIT compatibility, source manifests,
  dependency-license overrides, compliance scripts, and legal docs.
- `worms_port_docs_keeper` - README, docs, `AGENTS.md`, role definitions, and
  implementation-plan maintenance.
- `worms_port_reviewer` - read-only review for bugs, boundary drift, license
  gaps, missing tests, and build/runtime risk.

## Near-Term Slices

### WP-001 Subagent Scaffolding

Status: complete.

Goal: add Worms_Port-specific subagent roles, repo instructions, and workflow
docs adapted from NimiRun_CodeRepo's concept.

Verification:

- `npm run check:compliance`
- No full build required for documentation/config-only role scaffolding.

### WP-002 Runtime Smoke Test Script

Status: complete.

Goal: add a repeatable script for built-server smoke checks so future network
changes can verify `/` and a room API response without ad hoc commands.

Owning roles: `worms_port_test_worker`, `worms_port_network_worker`.

Verification:

- `npm run build`
- smoke script returns success against the built server.

Delivered with `npm run smoke`, which starts `server/build/server.js` on an
available local port, verifies `/` and `/.room.join_id`, and cleans up the
server process after success or failure.

### WP-003 Product Rename And Theme Boundary

Status: active.

Goal: remove remaining Worms-facing naming from user-visible surfaces and define
a new non-infringing theme direction before importing visual/audio assets.

Owning roles: `worms_port_planner`, `worms_port_base_game_worker`,
`worms_port_asset_curator`.

Verification:

- source scan for blocked brand names in user-facing code/docs,
- `npm run build`.

Direction selected: **NIMble Knots: Cotton Clash**, featuring mouthless,
big-eyed Knotkin fantasy Callings in the cotton-and-crochet Patchwork Realms.
`docs/art-direction.md` is the creative source of truth. The concept image is
documentation-only pending Nimiq brand-use confirmation and final per-file
product asset approval. The Pocket Robot is non-canonical and remains only as
the completed asset-import trial until a later runtime replacement slice.

### WP-004 First Asset Import Trial

Status: complete.

Goal: import one CC0/owned placeholder asset through the full manifest,
attribution, and compliance flow.

Owning roles: `worms_port_asset_curator`, `worms_port_compliance_keeper`.

Verification:

- complete `legal/asset-manifest.json` entry,
- `npm run check:compliance`,
- build if runtime references are added.

Delivered with the owned, AI-assisted Pocket Robot runtime sprite. The approved
asset is loaded directly from `assets/sprites/` through Vite and displayed by
the Phaser game scene. Exact source, master, and runtime hashes are recorded in
the asset manifest.

## Standing Risks

- Sorcerers GPL code contaminates product code.
- Sorcerers or other third-party assets enter without exact license evidence.
- Commercial-use-allowed is mistaken for mobile-app-safe.
- Dependency upgrades add non-commercial or copyleft package licenses.
- Runtime modernization breaks room/game Socket.IO behavior.
- Re-theme work preserves Worms-branded or Team17-like assets/naming too long.
