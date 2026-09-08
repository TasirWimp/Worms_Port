# Worms_Port Agent Instructions

## Single-owner development — effective 2026-09-07

Do not spawn, delegate to, resume, or request work from any subagent in this
repository. This includes implementation, review, research, probes, tests and
documentation. Do not use other tasks, CLI sessions or external agent services
as a delegation workaround. The current primary assistant owns the entire
change, integration, review, verification and corrections.

This owner instruction supersedes all older agent-role, model-routing,
reciprocal-support and independent-agent-review requirements in repository
documents, historical contracts and archived roles. Do not reactivate the
harness unless the owner explicitly changes this policy. Ordinary test runners
and the existing 22:00 Europe/Berlin full-suite automation remain in use.

WP-016 is retained for CRPM research, not for current development. See the
[retirement and research record](docs/process/development_workflow.md#harness-retirement-and-research-preservation).

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
6. `docs/planning/implementation_plan.md` - current slices and acceptance gates.
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
2. Identify which source document and behavior owns the change.
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
- Use `npm run verify:changes -- --dry-run` to inspect the selected checks,
  then `npm run verify:changes` for the current edit. For a whole committed
  slice, pass `-- --base <starting-commit>` to both commands. This selector is
  the mandatory edit-loop baseline and CI plan, not an upper bound on the
  primary assistant's risk-based test choice.
- Runtime/build changes require types, current build outputs and built smoke.
  Documentation, Codex settings and test/verification-tool-only changes do not
  require a game build. Unknown paths receive conservative product coverage.
- Compliance-sensitive changes should run `npm run check:compliance`.
- Package changes should run `npm audit`.
- Server/client runtime changes should include a smoke test when practical.
- After WP-005, browser-facing changes should run the Playwright phone smoke.
- `npm run verify:feature` is the same change-selected entry point. Browser-facing
  changes run complete relevant specs on the canonical phone, including V8 and
  identity/reward cases where relevant. Visual changes compare all maintained
  projects on Ubuntu. This does not substitute for the daily release gate.
- Run `npm run verify:daily` once at the end-of-day checkpoint and at an explicit
  release boundary. It retains the full automated five-project, zero-retry
  phone-browser matrix, performance, security, bundle, audit, and reviewed
  expected-skip policy. Do not rerun it after every feature unless a focused
  failure requires full-matrix diagnosis.
- The existing local daily automation runs at **22:00 Europe/Berlin**, including
  daylight-saving changes. It runs the full product suite, not the selector.
  Use the Verify workflow's manual dispatch for the full Ubuntu release matrix
  and PostgreSQL gate. Normal PR/push CI uses change selection.
- Visual baseline candidates must come from the pinned Ubuntu 24.04
  artifact-only workflow on the implementation PR, be inspected explicitly,
  and then pass ordinary comparison CI. After the workflow exists on the
  default branch, it may also be dispatched manually for an exact ref. Never
  update or approve release baselines from Windows.
- Real Android/iOS testing is outside the autonomous cycle. Report it as not run
  until a separate release-testing environment is provided.
- Always report skipped checks and why.

## Direct Review And Verification

The primary assistant reviews the complete changed behavior and runs the
necessary checks directly. The selector is a mandatory starting baseline,
not an upper limit. Inspect the diff, accepted predecessor journey, execution
pointer and relevant tests; widen checks when the changed risk warrants it.
Retain continuity for mobile layout/guidance, the playable loop, presentation,
AI, accessibility, lifecycle/authority and inherited capabilities. Each relevant
capability must be preserved, explicitly replaced, or deferred to an
owner-approved waypoint. Missing behavior or evidence blocks acceptance.

Reproduce findings, implement corrections and add meaningful regression tests
within the same continuous task. Report commands, outcomes, skipped checks and
residual risk. Call this direct review; never claim independent agent review.
Daily/release and physical-device acceptance remain separate gates. New package
records use `execution_mode: single_owner`; historical support evidence remains
research history, not an instruction to reopen agent collaboration.

## Repository Housekeeping

The primary assistant runs `npm run audit:housekeeping` at package transitions,
merge/release boundaries and before package closure. Reconcile branch/tracking,
execution pointer, evidence and review state directly. Preserve history; do not
rename, delete, merge or publish branches without user authorization.

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
  documentation/quarantine evidence until exact-file asset approval. WP-015B2H
  approved only exact Wizard source master
  `assets/masters/characters/knotkin/wizard/knotkin-wizard-source-master-v1.png`,
  SHA-256 `7AF4864E...18A9`; it has no runtime path.
- WP-015B3C.1 completed the closed runtime-copy admission on 2026-08-05. Existing Threadball candidate
  `2BAE664F...F4089EB` is paused as historical structure evidence because it
  reads as ordinary yarn rather than the compressed Worldweave spell. Do not
  normalize, promote, delete, or use it as conditioning. The replacement gate
  consumed one text-only request at seed `15035001`; exact external output
  `1F41AF26...F56EC` is now deterministically approved as source master
  `608F490C...D9B6F` with no runtime path. Supplied Gemini concept
  `BD87405A...DA6699` remains external comparison-only evidence and contributes
  no pixels or conditioning. Do not retry, regenerate, animate, or integrate
  the Threadball. The separate Patch source contract is frozen: Cloud,
  Terrain Top, and Terrain Interior use text-only/no-reference seeds
  `15035002` through `15035004` under the pinned FLUX workflow. It authorizes
  no Patch inference in the contract commit. Cloud's sole external candidate
  `EA972B0B...FFE7` is owner-approved and deterministically promoted as
  source master `7F327B51...4B23C`, with its sole B3C.1 runtime build-copy path.
  Owner-approved
  Terrain Top `BE5EB2E7...2B22` is deterministically promoted only as 256x64
  source master `41511E63...7897`; its three-copy horizontal repeat proof has
  exact edge difference zero and its sole B3C.1 runtime build-copy path. Terrain Interior's one
  separately preflighted FLUX candidate `98091C73...50F9` remains rejected
  historical evidence for visible directional quilt seams. The project owner
  separately repaired it in external four-layer XCF `2E94BBE4...CDBC7B`; only
  its exact GIMP 3.2.4 flattened export `6419C1E8...CF8095` may feed frozen
  config `wp-015b3c-patch-terrain-interior-manual-v1`. Deterministic uniform
  scaling plus fixed 32px horizontal/vertical reciprocal blends produced the
  opaque 256x256 source master `D50C2C60...2E40E9` twice, with a 3x3 proof of
  zero difference at both repeat boundaries and its sole B3C.1 runtime build-copy path. Do not
  retry or otherwise reuse the original FLUX candidate; do not infer, paint
  after the bound export, integrate, or generate a new Patch asset. FLUX and
  manual sources require deterministic alpha/repeatability proof.
  B3A may not generate a distinct Loomkeeper or silently generate another Wizard
  or Threadball.
  B3B's first Wizard preset-Idle pilot lowered/remade the raised cupped palm
  (`6EA23DEE...4C718`), and the sole free-tier Custom successor replaced the
  empty palm with a blue woven basket/cup-like object in its first frame. Both
  remain external rejected evidence. No further AutoSprite request, paid pose
  control, normalizer, or runtime use is authorized. The owner superseded the
  empty-palm overlay requirement with a deterministic Wizard presentation: a
  permanent Loomseed is composed only from approved Threadball lineage at palm
  anchor `(407,228)`, while a separate temporary Threadball emits from that
  origin. B3C has frozen config `wp-015b3c-wizard-loomseed-v1` and approved
  source-only composition `1CC252B4...9419C`: it uses only the two approved
  parents, layers the Loomseed above the palm, and leaves both source files
  untouched. Its sole B3C.1 runtime build-copy path is the approved presentation copy. B3C now also approves three source-only
  temporary cast stages derived only from the same Threadball parent: compact
  `formation-start` (`C189A206...FDD0`), `formation-ready`
  (`94F0DEDC...CCA9`), and `projectile` (`8ECA37C6...23E9`). Frozen config
  `wp-015b3c-threadball-cast-v1` maps each local visual origin to `(32,32)` and
  records the Wizard root-space emission offset `[151,-223]`. It creates no
  glow, loose fibers, tail, impact, animation, runtime path, or gameplay
  authority. Separate config `wp-015b3c-threadball-effects-v1`
  (`2C9A827F...D34A`) now admits only later deterministic procedural halo,
  inward thread-stroke, short-tail, and four-loop Unraveling rules; it binds
  solely to the existing authoritative presentation events and creates no
  effect-runtime path. Do not use either rejected pilot or modify Wizard source pixels.
  B3C.1 assigned `runtime_path` only to byte-identical build copies of these
  seven approved masters: Loomseed Wizard `1CC252B4...9419C`, cast stages
  `C189A206...FDD0`, `94F0DEDC...CCA9`, and `8ECA37C6...23E9`, Cloud
  `7F327B51...4B23C`, Terrain Top `41511E63...7897`, and Terrain Interior
  `D50C2C60...2E40E9`. The copied output must stay below `assets/product/`,
  exactly match the source hash, and total 607,427 source bytes. It must not
  create a duplicate source file, promote the empty-handed Wizard/raw Threadball
  master or rejected FLUX Terrain Interior, generate an atlas, add code, or make
  player-visible changes. WP-015C is now the next integration-only slice and reuses the one
  approved Wizard presentation for the player and AI Loomkeeper. Distinct
  Loomkeeper production is deferred to the wider character roster in WP-015D.

## Codex Subagent Roles

Retired. The unchanged role definitions are preserved under
[`.codex/retired-agents/`](.codex/retired-agents/) for CRPM research and must not
be loaded or followed for Worms_Port development. `.codex/agents/` is no longer
an active project role directory; `[agents].enabled = false` disables
multi-agent tools in project configuration.

## Task Model Routing

Retired with the harness. The primary task uses its selected model and effort;
project defaults remain Terra/high. Do not spawn a different model to work
around uncertainty. Investigate and correct directly; report a concrete blocker
when needed. Configuration changes do not prove which model served a turn.

## Git And Reporting

- Check status before edits and commits.
- Do not revert or overwrite user changes unless explicitly asked.
- Keep commits small and conventional.
- If asked to commit all open changes, use `git add -A`.
- Final summaries should list behavior delivered, files changed, checks run,
  and next recommended step.
