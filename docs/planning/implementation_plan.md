# Implementation Plan

This plan adapts the NimiRun_CodeRepo subagent concept to Worms_Port. The goal
is scoped coordination around the current repo risks: MIT base code, Sorcerers
quarantine, commercial-use asset traceability, and a modern buildable
Phaser/Socket.IO stack.

## Execution Pointer

- Active target: mobile-first single-player Nimiq Pay competition release.
- Next work package: **WP-005 Autonomous Foundation And Release Contract**.
- Last completed work package: **WP-004 First Asset Import Trial**.
- PvP and matchmaking: deferred until after the competition release.
- Canonical artwork reference:
  `docs/images/art-direction/knotkin-class-lineup-concept.png`.
- Physical Android/iOS testing: outside the automated cycle. Record it as not
  run until a separate release-testing environment is provided.

A fresh Codex chat should read `AGENTS.md` and its ordered source documents,
check the worktree and recent commits, then start only the work package named
above. Update this pointer in the same commit that completes a work package.

## Competition Release Contract

The first public release must be useful when only one person is online. Its
primary journey is:

1. Open the mini app on a phone inside Nimiq Pay.
2. Start an unlimited Practice Clash without matchmaking or a wallet prompt.
3. Optionally sign an eligible Daily Grand Knot Challenge with a Nimiq wallet.
4. Fight a deterministic AI Loomkeeper under server-authoritative rules.
5. Win by skill within a disclosed turn limit.
6. Claim one reserved, fixed sponsor-funded NIM reward when available.
7. Retry, view the daily leaderboard, or share the mini-app deep link.

The release starts with one player-controlled Knotkin, one AI opponent, one
Patch, Wizard/Thief/Warrior Calling choices, Threadball, two additional
independently designed Relics, movement, touch aiming and power, destructible
terrain, Stitching damage, turn timing, Unraveling, results, and retry.

The reward is not a stake, wager, escrow, random prize, or transfer funded by a
losing player. Practice remains available when the Prize Loom is empty. Reward
availability and terms must be disclosed before a challenge starts.

## Current Status

- `TurtlePU/worms-ii` is imported as the MIT base code source.
- `lorgan3/sorcerers` is recorded as GPL-3.0 quarantine/reference only.
- The project builds with Vite for the client and esbuild for the server.
- Compliance checks cover product asset manifests, import-boundary rules, and
  npm package license policy.
- No Sorcerers product assets or Sorcerers code are imported.
- WP-003 established NIMble Knots and the canonical Knotkin Calling lineup.
- The current runtime is a lobby/reconnect shell with placeholder gameplay; it
  does not yet implement the competition release contract.
- Automated unit, deterministic simulation, Socket.IO protocol, mobile-browser,
  visual-regression, and performance suites do not yet exist.

## Codex Subagent Roles

Role-specific Codex agents live in `.codex/agents/`. Use them as scoped
workers; they coordinate through docs, manifests, commits, and completion
summaries rather than private handoff.

Current roles:

- `worms_port_planner` - feature slicing, source-boundary checks, sequencing,
  and non-goal definition before code changes.
- `worms_port_test_worker` - test planning, typecheck/build/audit verification,
  and smoke-test notes.
- `worms_port_base_game_worker` - Turtle-derived Phaser client, phone layouts,
  touch combat, scene behavior, overlay UI, and re-theme implementation.
- `worms_port_network_worker` - Express server, Socket.IO protocol,
  authoritative simulation sessions, challenge tickets, and reward runtime.
- `worms_port_asset_curator` - Sorcerers quarantine, exact-file asset license
  review, `assets/`, `legal/asset-manifest.json`, and attribution.
- `worms_port_compliance_keeper` - MIT compatibility, source manifests,
  dependency-license overrides, compliance scripts, and legal docs.
- `worms_port_docs_keeper` - README, docs, `AGENTS.md`, role definitions, and
  implementation-plan maintenance.
- `worms_port_reviewer` - read-only review for bugs, boundary drift, license
  gaps, missing tests, and build/runtime risk.

## Completed Slices

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

Status: complete.

Goal: remove remaining Worms-facing naming from user-visible surfaces and define
a new non-infringing theme direction before importing visual/audio assets.

Owning roles: `worms_port_planner`, `worms_port_base_game_worker`,
`worms_port_asset_curator`.

Verification:

- source scan for blocked brand names in user-facing code/docs,
- `npm run build`.

Delivered as **NIMble Knots: Cotton Clash**, featuring mouthless, big-eyed
Knotkin fantasy Callings in the cotton-and-crochet Patchwork Realms.
`docs/art-direction.md` is the creative source of truth. Product metadata,
visible client surfaces, default game schema, and server model terminology now
use NIMble Knots concepts. The Pocket Robot was removed from runtime and
replaced by code-drawn Knotkin placeholders; it remains only as the approved
asset-import traceability fixture. Concept artwork remains documentation-only
pending Nimiq brand-use confirmation and final per-file product approval.

### WP-004 First Asset Import Trial

Status: complete.

Goal: import one CC0/owned placeholder asset through the full manifest,
attribution, and compliance flow.

Owning roles: `worms_port_asset_curator`, `worms_port_compliance_keeper`.

Verification:

- complete `legal/asset-manifest.json` entry,
- `npm run check:compliance`,
- build if runtime references are added.

Delivered with the owned, AI-assisted Pocket Robot runtime sprite as the first
complete manifest trial. WP-003 later removed it from the client bundle after
the Knotkin direction was selected. The approved file and exact source, master,
and runtime hashes remain as a traceability fixture in the asset manifest.

## Autonomous Execution Model

Every planned work package runs in an isolated branch or worktree and follows
the loop in `docs/process/development_workflow.md`. The orchestrating agent must
record the starting commit, changed paths, planned checks, deterministic seeds,
and final evidence. Implementation, test, compliance, asset, and review roles
remain separated when their responsibilities differ.

Routine implementation choices do not require user confirmation. Stop and ask
only when a change would weaken licensing or import rules, use unclear brand or
asset rights, activate real funds, expose secrets, materially change the release
contract, or require unavailable external infrastructure.

## Sorcerers Clean-Room Protocol

Sorcerers can inform black-box behavior only:

1. A reference observer records visible inputs, outcomes, state transitions,
   and timing tolerances against the pinned Sorcerers commit.
2. The record identifies viewed material and classifies each requirement as
   product-authored, Turtle-derived, common genre behavior, or reference-observed.
3. It excludes code, algorithms, internal identifiers, constants, file names,
   assets, costumes, audio, and distinctive expressive sequences.
4. The behavioral specification is frozen and hashed before implementation.
5. Implementers use only that specification, the MIT Turtle base, this repo's
   product documents, and independently licensed technical sources.
6. A read-only reviewer checks for suspicious text, identifiers, constants,
   structure, control flow, event sequences, and asset similarity.

Sorcerers images or files must never be uploaded to image generation, ComfyUI,
AutoSprite, or another production service.

## Planned Work Packages

### WP-005 Autonomous Foundation And Release Contract

Status: next.

Goal: make the approved plan executable and fail closed before gameplay work.

Owning roles: `worms_port_planner`, `worms_port_test_worker`,
`worms_port_compliance_keeper`, `worms_port_docs_keeper`.

Deliverables:

- executable work-package and evidence conventions,
- clean-room reference records and similarity-review gate,
- CI for compliance, types, clean build, audit, and non-stale smoke testing,
- stronger import scanning that includes untracked product files,
- one runtime path from approved root `assets/` into the client build,
- official Nimiq Mini Apps skill and MCP capability readiness notes,
- `@playwright/test` as a reviewed development dependency with its exact version
  recorded in `package-lock.json`,
- a checked-in Playwright configuration that starts a freshly built server on
  an isolated port and retains traces, screenshots, and video on failure,
- installed Chromium and WebKit browser binaries in local development and CI,
- an initial phone-sized Chromium and WebKit smoke test that proves the built
  page loads, the Phaser canvas is nonblank, no page or console error occurs,
  and touch input can activate the first available interaction,
- package scripts for the browser smoke and later full browser suite.

Playwright is not currently installed in this repository. Codex in-app browser
automation may support exploratory inspection, but it is not a substitute for
the reproducible project test runner, checked-in configuration, pinned package,
or CI browser binaries.

WP-005 Playwright acceptance criteria:

1. `npm ls @playwright/test --depth=0` resolves the locked dependency.
2. `npx playwright --version` succeeds from the repository.
3. Chromium and WebKit launch through Playwright without using a system-browser
   executable override.
4. The browser smoke starts from a clean build rather than stale ignored output.
5. At least one Chromium phone project and one WebKit phone project pass.
6. A deliberately failing local run can produce a readable trace and screenshot
   artifact; generated evidence remains outside product `assets/`.
7. CI installs the matching browser binaries and uploads failure artifacts.
8. Browser caches and generated results are ignored and never enter the product
   asset manifest.

Verification: compliance, types, clean build, audit, built smoke, Playwright
version and browser-launch checks, mobile Chromium/WebKit smoke, and read-only
review. No gameplay behavior is added.

### WP-006 Validated Session And Command Protocol

Status: planned. Depends on WP-005.

Goal: define runtime-validated schemas for signed sessions, practice and reward
challenge creation, commands, snapshots, acknowledgements, errors, and results.
Replace caller-supplied Socket.IO identity with opaque server-issued tokens;
add origin, size, rate, timeout, teardown, and replay guards.

Owning roles: `worms_port_network_worker`, `worms_port_test_worker`.

Verification: schema unit tests, malformed/event-flood cases, real
`socket.io-client` protocol tests, compliance, types, build, and built smoke.

### WP-007 Deterministic Artillery Simulation

Status: planned. Depends on WP-006.

Goal: implement a Phaser-independent, server-authoritative model with fixed
ticks, seeded randomness, stable command ordering, serializable snapshots,
state hashes, movement, projectile flight, collision, bounded terrain
deformation, Stitching damage, turns, timeouts, and victory.

Owning roles: `worms_port_network_worker`, `worms_port_base_game_worker`,
`worms_port_test_worker`.

Verification: unit tests, invariant/property tests with printed seeds, golden
replays, reconnect reconstruction, duplicate/late command rejection, build.

### WP-008 Loomkeeper AI

Status: planned. Depends on WP-007.

Goal: add an independently designed deterministic AI that evaluates a bounded
set of legal movement, Relic, angle, and power choices through the public
simulation API. Difficulty comes from bounded search and controlled aim error,
not hidden rule advantages.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`.

Verification: deterministic decision tests, legal-command invariants, turn
budget, difficulty bounds, golden match replays, build.

### WP-009 Phone Combat Scene

Status: planned. Depends on WP-007; may proceed in parallel with WP-008.

Goal: implement the portrait-first Phaser battlefield and large touch controls
for movement, Relic selection, drag aim/power, trajectory preview, firing,
Stitching, turn time, pause, and retry. Landscape is enhanced but optional.
Use code-drawn placeholders until production art is approved.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`.

Verification: phone viewport browser tests, touch-only journey, safe areas,
resize/orientation, background/resume, reduced motion, screenshots, build.

### WP-010 Complete Practice Clash

Status: planned. Depends on WP-008 and WP-009.

Goal: deliver an immediate, unlimited, non-rewarded player-versus-Loomkeeper
match with onboarding, results, retry, and deterministic local/server modes.

Owning roles: `worms_port_base_game_worker`, `worms_port_network_worker`,
`worms_port_test_worker`.

Verification: complete touch journey on the browser phone matrix, two full
golden matches, result consistency, reconnect/resume, visual evidence, build.

### WP-011 Nimiq Pay Identity Adapter

Status: planned. Depends on WP-006 and WP-010.

Goal: isolate the official Mini App SDK behind an adapter for initialization,
language, wallet account selection, signed challenges, rejection, timeout, and
optional consent-based device identity. Practice cannot depend on the provider.

Owning roles: `worms_port_network_worker`, `worms_port_compliance_keeper`,
`worms_port_test_worker`.

Verification: fake-provider approve/reject/timeout tests, nonce expiry, wrong
address/network, replay rejection, package audit, compliance, build.

### WP-012 Sponsored Daily Challenge

Status: planned. Depends on WP-007, WP-008, and WP-011.

Goal: implement fixed reward configuration, eligibility checks, short-lived
reward reservation, server-authoritative result verification, idempotent claim
queue, daily ceiling, exhausted-pool disclosure, and payout kill switch.

Owning roles: `worms_port_network_worker`, `worms_port_compliance_keeper`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification: forged result, nonce replay, duplicate claim, reservation expiry,
concurrent winners, depleted pool, cancellation, provider outage, delayed
confirmation, and secret-scan tests. Real funds remain disabled by default.

### WP-013 Autonomous Quality Harness

Status: planned. Depends on WP-010 and WP-012.

Goal: complete automated browser, visual, performance, protocol, abuse, and
reward-security gates. Use isolated browser contexts and deterministic fake
wallets; retain traces, screenshots, diffs, replay seeds, bundle data, and
timing evidence on failure.

WP-013 extends the Playwright installation and launch smoke delivered by WP-005;
it does not introduce the browser runner for the first time.

Owning roles: `worms_port_test_worker`, `worms_port_reviewer`.

Verification matrix: mobile Chromium at 360x640, 390x844, and 412x915;
844x390 landscape; mobile WebKit emulation; low-bandwidth/offline/resume;
desktop only as a debugging fallback. Physical phones are explicitly excluded.

### WP-014 Production Art And Audio

Status: planned. Depends on WP-009 and WP-013 asset gates.

Goal: produce Wizard, Thief, Warrior, Loomkeeper variant, Relics, first Patch,
effects, UI media, and short audio through the MCP asset pipeline. Every brief
must cite `docs/images/art-direction/knotkin-class-lineup-concept.png` as the
canonical visual reference. No pixels from the concept image enter runtime
without explicit exact-file approval.

Minimum visual asset inventory:

- four isolated side-view character masters: Wizard, Thief, Warrior, and a
  friendly but clearly opposing Loomkeeper variant,
- one normalized runtime atlas per character with `idle`, `move`, `jump_start`,
  `fall`, `land`, `aim_low`, `aim_mid`, `aim_high`, `fire`, `hit`, `unravel`,
  and `victory` states,
- separate transparent masters and phone-readable icons for Threadball and the
  two additional Relics frozen by the gameplay specification,
- separate projectile, trail, impact, Stitching-damage, Unraveling, and Prize
  Loom reward effects,
- one Patch environment split into a scalable decorative backdrop, separate
  transparent background props, repeatable terrain material textures, and a
  code-owned destructible collision mask,
- Calling portraits or icons derived from approved character masters rather
  than cropped from the lineup concept,
- short approved audio for aiming/charging, firing, impact, damage, Unraveling,
  victory, and reward confirmation through a separate audio provenance path.

Character master contract:

- 512x512 RGBA source master, transparent background, facing right,
- orthographic-like side view suitable for a side-on artillery game,
- one full character only, no scenery, text, frame, shadow crop, or other
  character,
- exactly two glossy bead eyes, no mouth or other facial marks,
- full feet visible on one shared ground baseline with sufficient motion
  padding,
- consistent body proportions, costume topology, lighting, palette, and
  handedness across all poses,
- neutral locomotion masters avoid baking a selected Relic into every frame;
  unavoidable Relic-specific animation is a separately tracked derivative,
- runtime candidate normalized to a 192x192 frame with pivot at 50% horizontal
  and 88% vertical; a different size or pivot requires recorded phone-readability
  evidence and a contract update.

Environment contract:

- decorative background pixels never define authoritative collision,
- sky/fabric fill, cotton clouds, banners/loom structures, and distant props are
  separate layers that can compose in both portrait and landscape,
- terrain top, edge, and interior materials repeat without visible seams and
  remain convincing after circular destruction,
- deterministic map geometry and the server collision mask are generated or
  stored as product data independently from decorative artwork,
- no important landmark is placed where phone cropping or HUD safe areas hide
  it.

The exact MCP handoff, animation frame budgets, normalization rules, evidence
requirements, and phone acceptance checks are normative in
`docs/process/development_workflow.md` under **Asset Generation Loop**.

Owning roles: `worms_port_asset_curator`, `worms_port_compliance_keeper`,
`worms_port_base_game_worker`, `worms_port_reviewer`.

Verification: inventory completeness, character-master and environment
contracts, art-direction checks, animation consistency, exact provenance,
model/component license evidence, manifest hashes, attribution, atlas loading,
mobile screenshots at all automated phone viewports, visual review, compliance,
and build.

### WP-015 Retention And Distribution

Status: planned. Depends on WP-012 and WP-014.

Goal: add a privacy-conscious daily leaderboard, result sharing, Nimiq Pay
deep link, localized essential UI, reward availability messaging, and aggregate
funnel telemetry with disclosure and consent where required.

Owning roles: `worms_port_base_game_worker`, `worms_port_network_worker`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification: first-run under 60 seconds, share/deep-link fallbacks, privacy and
consent cases, locale overflow, depleted-pool clarity, full automated suite.

### WP-016 Deployment And Submission

Status: planned. Depends on WP-013 and WP-015.

Goal: deploy through HTTPS with environment validation, health checks, rollback,
secret separation, payout disabled-by-default configuration, submission copy,
screenshots, and walkthrough evidence.

Owning roles: `worms_port_planner`, `worms_port_network_worker`,
`worms_port_docs_keeper`, `worms_port_reviewer`.

Verification: clean install, audit, compliance, full build, complete automated
suite, production smoke, deep link, disabled/enabled reward configuration, and
rollback rehearsal. Real Android/iOS testing is listed separately as not run;
it does not block completion of the documented autonomous cycle.

## Dependency Order

```text
WP-005 -> WP-006 -> WP-007 -> WP-008 ----\
                         \-> WP-009 -----+-> WP-010 -> WP-011 -> WP-012
                                                           \-> WP-013
WP-009 + WP-013 --------------------------------------------> WP-014
WP-012 + WP-014 --------------------------------------------> WP-015 -> WP-016
```

WP-010 is the first complete playable. WP-013 is the automated competition
candidate gate. WP-016 is the submission-ready repository and deployment.

## Deferred Until After Competition

- PvP matchmaking, private rooms, tournaments, and Guild rosters.
- Player stakes, escrow, betting, or winner-takes-player-funds mechanics.
- More than the first three playable Callings and first three Relics.
- Campaigns, bots beyond the Loomkeeper, rankings, chat, and native wrappers.
- Sorcerers feature parity as a goal; only independently selected product
  behavior may enter a work package.

## Standing Risks

- Sorcerers GPL code contaminates product code.
- Sorcerers or other third-party assets enter without exact license evidence.
- Commercial-use-allowed is mistaken for mobile-app-safe.
- Dependency upgrades add non-commercial or copyleft package licenses.
- Runtime modernization breaks room/game Socket.IO behavior.
- Nimiq-derived geometry or brand elements enter production without written
  permission or an applicable license.
- Reward abuse drains sponsor funds through forged, replayed, or duplicate
  claims.
- Mobile browser emulation misses a Nimiq Pay WebView or physical-device issue.
- A generated asset inherits unclear model, reference, or service rights.
