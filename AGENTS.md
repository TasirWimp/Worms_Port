# Worms_Port Agent Instructions

## Repository Context

Worms_Port is an MIT-licensed Phaser project bootstrapped from the MIT
`TurtlePU/worms-ii` code base. The repo uses `lorgan3/sorcerers` only as a
quarantined reference/archive. Sorcerers code and bulk assets are not product
inputs.

Current project goal: deliver a mobile-first Nimiq Pay competition release with
instant single-player practice, a deterministic AI Loomkeeper, and an optional
fixed sponsor-funded NIM reward for eligible skill-based wins. PvP matchmaking
is deferred. Keep the imported Turtle base buildable and preserve strict
third-party traceability. Only assets with exact-file evidence for commercial
use, redistribution, modification, and attribution duties may enter `assets/`.

## Source Documents

Before feature work, read the relevant docs in this order:

1. `README.md` - project setup, current import boundary, build commands.
2. `docs/art-direction.md` - NIMble Knots world, characters, visual boundary,
   and concept provenance.
3. `docs/import-boundary.md` - Turtle base and Sorcerers quarantine rules.
4. `docs/asset-review-workflow.md` - per-asset review workflow.
5. `docs/process/development_workflow.md` - required development loop.
6. `docs/planning/implementation_plan.md` - current slices and subagent roles.
7. `legal/source-manifest.json` - source roles and upstream pins.
8. `legal/asset-manifest.json` - approved product assets.
9. `legal/allowed-licenses.json` - allowed and blocked asset licenses.
10. `legal/dependency-license-overrides.json` - npm license metadata overrides.

For fresh-chat re-entry, follow that order, then read the **Execution Pointer**
at the top of `docs/planning/implementation_plan.md`. Check Git status and recent
commits before starting only the named next work package.

Temporary display policy: WP-011D defaults portrait browser viewports to the
clockwise sideways landscape workaround because Nimiq Pay does not currently
provide full-screen mini-app presentation. `README.md` documents the user setup,
`?sideways=left` alternative, `?sideways=off` escape hatch, and removal trigger.
Do not remove or silently redesign this workaround until the Execution Pointer
records a verified Nimiq Pay full-screen replacement.

## Required Workflow

For implementation work:

1. Check `git status --short --branch`.
2. Identify which source document and subagent role owns the change.
3. Keep changes scoped to the requested slice.
4. Preserve the Turtle/Sorcerers import boundary.
5. Run the planned verification.
6. Update docs or manifests when source, license, build, or workflow truth
   changes.
7. Report changed files, checks run, and remaining risk.

If the user asks only for planning, review, or brainstorming, do not edit code.

## Import Boundary Rules

- `TurtlePU/worms-ii` is the approved MIT base code source.
- `lorgan3/sorcerers` is GPL-3.0 quarantine/reference only.
- Do not copy Sorcerers code into `client/`, `server/`, `shared/`, or scripts.
- Do not bulk import Sorcerers assets.
- Do not treat Sorcerers credits as final license evidence.
- Product assets must live under `assets/` and have approved manifest entries.
- Quarantine material belongs only under ignored quarantine folders.
- Keep the project MIT-compatible for commercial use.

## Test Expectations

- Documentation-only changes do not require a full build; say that explicitly.
- Source/tooling changes should run `npm run build`.
- Compliance-sensitive changes should run `npm run check:compliance`.
- Package changes should run `npm audit`.
- Server/client runtime changes should include a smoke test when practical.
- After WP-005, browser-facing changes should run the Playwright phone smoke.
- Gameplay, identity, or reward UI changes must run the full automated
  phone-browser matrix with `npm run test:browser:matrix`; WP-014A provides the
  five-project zero-retry gate and reviewed expected-skip policy.
- Visual baseline candidates must come from the pinned Ubuntu 24.04
  artifact-only workflow on the implementation PR, be inspected explicitly,
  and then pass ordinary comparison CI. After the workflow exists on the
  default branch, it may also be dispatched manually for an exact ref. Never
  update or approve release baselines from Windows.
- Real Android/iOS testing is outside the autonomous cycle. Report it as not run
  until a separate release-testing environment is provided.
- Always report skipped checks and why.

## Active Product Constraints

- Competition release play must not depend on another human being online.
- Practice must work without wallet connection, matchmaking, or a reward pool.
- Rewarded matches are server-authoritative deterministic skill challenges
  against an independently implemented AI.
- Rewards are fixed and sponsor-funded. Player stakes, betting, escrow, random
  winner selection, and player-loss-funded payouts are blocked.
- While the WP-011D Nimiq Pay workaround is active, portrait browser viewports
  default to the clockwise virtual-landscape composition. The normal portrait
  composition remains supported through `?sideways=off`, and actual landscape
  viewports must not be double-rotated. No core action may require hover,
  keyboard, or precision mouse.
- Production Calling colors, textile materials, and fantasy vocabulary continue
  to follow `docs/images/art-direction/knotkin-class-lineup-concept.png`, but
  WP-015B2G supersedes its angular anatomy with the owner-approved rounded
  crochet-doll direction and upward-facing cupped Relic palm recorded in
  `docs/art-direction.md`. The lineup and every external FLUX candidate remain
  documentation/quarantine evidence until exact-file asset approval.
- WP-015B2H is the only active asset slice. It may deterministically normalize
  exact Wizard source `40F9E812...4A5` and decide its source-master approval; it
  may not run inference, repaint/warp the character, animate it, create another
  Calling, or integrate runtime media. WP-015B3 must complete and approve the
  vertical-slice inventory before integration-only WP-015C begins.

## Codex Subagent Roles

Role-specific Codex agents live in `.codex/agents/`:

- `worms_port_planner` - feature slicing, scope checks, and import-boundary planning.
- `worms_port_test_worker` - test planning, type/build/audit checks, and smoke verification.
- `worms_port_base_game_worker` - Turtle-derived Phaser/client gameplay and re-theme work.
- `worms_port_network_worker` - Express, Socket.IO, server runtime, and multiplayer state.
- `worms_port_asset_curator` - Sorcerers quarantine review, asset manifests, and attribution.
- `worms_port_compliance_keeper` - legal manifests, package/license gates, and MIT compatibility.
- `worms_port_docs_keeper` - README, docs, AGENTS, planning, and role maintenance.
- `worms_port_reviewer` - read-only review for boundary risk, bugs, and missing checks.

Subagents coordinate through docs, manifests, commits, and completion summaries,
not private handoff.

## Git And Reporting

- Check status before edits and commits.
- Do not revert or overwrite user changes unless explicitly asked.
- Keep commits small and conventional.
- If asked to commit all open changes, use `git add -A`.
- Final summaries should list behavior delivered, files changed, checks run,
  and next recommended step.
