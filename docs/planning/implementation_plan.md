# Implementation Plan

This plan adapts the NimiRun_CodeRepo subagent concept to Worms_Port. The goal
is scoped coordination around the current repo risks: MIT base code, Sorcerers
quarantine, commercial-use asset traceability, and a modern buildable
Phaser/Socket.IO stack.

## Execution Pointer

- Active target: mobile-first single-player Nimiq Pay competition release.
- Next work package: **WP-013 Sponsored Daily Challenge implementation**.
- Last completed work package: **WP-012 Nimiq Pay Identity Adapter**.
- WP-012 exactly pins `@nimiq/mini-app-sdk` `0.1.0` and server-only
  `@nimiq/core` `2.7.1`. Provider access remains lazy, identity acceptance is
  query-gated at `?identity-preview=1` until WP-013 adds the production
  rewarded-match entry, and Practice never depends on Nimiq Pay. A deployed
  identity acceptance pass still requires `NIMIQ_NETWORK=main-albatross` and
  either Render's `RENDER_EXTERNAL_URL` or an explicit matching
  `IDENTITY_PUBLIC_ORIGIN`.
- WP-013 planning was security-refined on 2026-07-29. Its implementation must
  add a durable PostgreSQL reward ledger, atomic reservation and daily-budget
  enforcement, an explicit payout state machine, exact signed-transaction
  recovery, a low-funded dedicated sponsor hot wallet, and disabled-by-default
  activation gates. A wallet address is an eligibility identity, not proof of
  one human; Practice remains the unrestricted fallback.
- PvP and matchmaking: deferred until after the competition release.
- Canonical artwork reference:
  `docs/images/art-direction/knotkin-class-lineup-concept.png`.
- General physical Android/iOS testing remains outside the automated cycle.
  WP-011A's user-run Samsung Galaxy S22 acceptance gate in Nimiq Pay passed on
  2026-07-20 for the reported real-device regressions.
  WP-011B acceptance on the same device confirmed working full screen in Samsung
  Chrome and no exposed Fullscreen API inside Nimiq Pay.
  WP-011C's clockwise sideways mode passed user-run Samsung Galaxy S22 Nimiq
  Pay acceptance on 2026-07-21. WP-011D's no-query clockwise default then passed
  user-run acceptance on the same device and date. Its removal trigger is a
  verified documented Nimiq Pay full-screen game mode or equivalent
  standard/native capability that removes host chrome. Until then, keep
  `?sideways=left` and `?sideways=off` as documented controls.
  WP-011E's arena-first HUD passed user-run Samsung Galaxy S22 Nimiq Pay
  acceptance on 2026-07-21.
  WP-012 automated fake-provider acceptance passed across the maintained phone
  browser projects. Physical Nimiq Pay acceptance subsequently confirmed real
  authorization and signing rejection, but exposed that a rejected signature
  left its server authorization pending and could block an immediate retry.
  The owner-bound cancellation correction was deployed and the user-run
  Samsung Galaxy S22 re-test confirmed immediate retry on 2026-07-29.

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

## Hosting Decision

The competition release will use one **Render Starter Web Service** in
Frankfurt, serving the built client and persistent Node/Socket.IO runtime from
the same process. Render Free may be used for private previews only. The public
release stays on one always-on instance because authoritative session,
simulation, Loomkeeper, and replay state is currently in memory.

Horizontal scaling is deliberately disabled until shared durable state,
exactly-once turn leases, and cross-instance event delivery exist. Durable
reward reservations, claims, payout idempotency, and completed-match evidence
must be added before real sponsor-funded rewards are enabled. WP-017 owns the
deployment, health check, rollback, environment, origin, secret, and spending
guardrails for this selected host.

## Current Status

- `TurtlePU/worms-ii` is imported as the MIT base code source.
- `lorgan3/sorcerers` is recorded as GPL-3.0 quarantine/reference only.
- The project builds with Vite for the client and esbuild for the server.
- Compliance checks cover product asset manifests, import-boundary rules, and
  npm package license policy.
- No Sorcerers product assets or Sorcerers code are imported.
- WP-003 established NIMble Knots and the canonical Knotkin Calling lineup.
- The default runtime is a complete server-backed Practice Clash from Calling
  selection through combat, authoritative result, reconnect, pause, and retry.
  The deterministic combat preview remains a separate test-only fixture.
- WP-005 provides tooling tests plus fresh-build phone Chromium/WebKit smoke.
- WP-006 provides strict schema tests and a real `socket.io-client` protocol
  suite. The full gameplay phone matrix and visual-regression suites do not yet
  exist.
- WP-007 provides the product-owned deterministic artillery ruleset, canonical
  state hashes, bounded replay reconstruction, 29 focused simulation tests,
  and simulation-aware protocol/reconnect coverage.
- WP-008 provides the independently designed deterministic Loomkeeper policy,
  bounded legal search, automated authoritative turns, replay integration, and
  fixed-seed/golden verification.
- WP-009 provides the v2 replay ABI and the complete Threadball, Needlepoint,
  and Spoolburst gameplay roster while preserving v1 reconstruction.
- WP-010 provides the fixed-world Phaser battlefield, code-drawn combat
  presentation, touch input state machine, cloned-state trajectory preview,
  and its focused Chromium/WebKit phone matrix.
- WP-011 provides the complete live server-backed Practice Clash lifecycle,
  authoritative pause/retry, reconnect suspension, and its focused
  Chromium/WebKit phone matrix.
- A first Samsung Galaxy S22 acceptance pass in Nimiq Pay confirmed the initial
  Practice Clash core loop, but found repeated-match result, movement and aim,
  turn presentation, trajectory lifecycle, and landscape layout regressions.
  WP-011A implemented the stabilization candidate, passed its automated gates,
  and passed the user-run Samsung Galaxy S22 Nimiq Pay portrait/landscape
  acceptance re-test. WP-012 subsequently preserved that accepted integration
  boundary.
- WP-011B adds a standards-based, user-activated full-screen probe for compact
  landscape. Samsung Galaxy S22 acceptance confirmed that it works in Chrome,
  while Nimiq Pay does not expose the required API and correctly retains the
  compact embedded fallback. Chrome acceptance also found forced-landscape and
  result-screen exit defects assigned to WP-011C.
- WP-011C removes the browser orientation lock,
  retains a full-screen exit action on results, and adds opt-in `sideways=right`
  and `sideways=left` virtual-landscape modes for portrait-locked mini-app
  viewports. Its automated verification and deployed Samsung Galaxy S22 Nimiq
  Pay acceptance passed.
- WP-011D makes clockwise sideways presentation the temporary default for
  portrait browser viewports. `sideways=left` selects the opposite direction
  and `sideways=off` preserves the maintained normal responsive composition.
  The deployed no-query default passed user-run Samsung Galaxy S22 Nimiq Pay
  acceptance on 2026-07-21.
- WP-011E gives the arena the maximum safe 16:9
  rectangle, adds compact actor-local status, floating thumb pads, contextual
  Relic/Fire controls, and a Pause sheet without changing gameplay authority.
  Automated verification and user-run Samsung Galaxy S22 Nimiq Pay acceptance
  passed on 2026-07-21.
- WP-012 adds a lazy query-gated Nimiq Pay adapter, server-created signed
  identity challenges, official server-only verification, atomic replay
  protection, and opaque authenticated-session rotation. Automated acceptance
  passed; physical Nimiq Pay identity approval remains external.
- Reward work, the expanded phone matrix, and visual regression remain.

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

Status: complete.

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

Implementation note: the approved-asset build path is manifest-aware and is
verified with isolated fixtures. It copies only entries that declare a runtime
path. WP-005 does not assign that path to the Pocket Robot or add production
art, so its generated runtime inventory remains empty until a future package
approves a genuine runtime asset.

Delivered with exact-file asset hashes, untracked implementation/quarantine
scanning, staged clean-room and work-package evidence gates, built-only overlay
serving, non-stale smoke commands, Playwright 1.61.1 Chromium/WebKit phone
projects on a dynamic test-owned port, failure artifact retention, and GitHub
Actions verification. The official Nimiq skill, documentation MCP, and SDK
readiness are recorded for WP-012 without adding a premature wallet dependency.

### WP-006 Validated Session And Command Protocol

Status: complete. Depends on WP-005.

Goal: define runtime-validated schemas for signed sessions, practice and reward
challenge creation, commands, snapshots, acknowledgements, errors, and results.
Replace caller-supplied Socket.IO identity with opaque server-issued tokens;
add origin, size, rate, timeout, teardown, and replay guards.

Owning roles: `worms_port_network_worker`, `worms_port_test_worker`.

Verification: schema unit tests, malformed/event-flood cases, real
`socket.io-client` protocol tests, compliance, types, build, and built smoke.

Implementation note: signed-session and reward request envelopes are frozen but
return `FEATURE_UNAVAILABLE`; WP-006 does not verify wallet signatures or
reserve rewards. The legacy lobby remains only as a strict session-bound
adapter so no insecure identity stack runs in parallel.

Delivered with strict Zod v1 contracts, opaque digest-only bearer sessions,
bounded token-rotation recovery, reconnect-grace rebinding, deterministic
challenge-expiry results, replay and sequence enforcement, origin/payload/rate
guards, and a 24-case protocol/client regression suite plus four phone-browser
journeys. The browser uses
WebSocket transport so production Origin enforcement remains fail-closed.

### WP-007 Deterministic Artillery Simulation

Status: complete. Depends on WP-006.

Goal: implement a Phaser-independent, server-authoritative model with fixed
ticks, seeded randomness, stable command ordering, serializable snapshots,
state hashes, movement, projectile flight, collision, bounded terrain
deformation, Stitching damage, turns, timeouts, and victory.

Owning roles: `worms_port_network_worker`, `worms_port_base_game_worker`,
`worms_port_test_worker`.

Verification: unit tests, invariant/property tests with printed seeds, golden
replays, reconnect reconstruction, duplicate/late command rejection, build.

Delivered as `nimble-knots-artillery-v1`: a Phaser-independent integer model
with seeded packed terrain, bounded fixed-tick movement and Threadball flight,
swept collision, Euclidean radial damage, deformation, settling, turn timeout,
turn-limit completion, canonical SHA-256 state hashes, bounded projectile
traces, replay reconstruction, and complete reconnect snapshots. The protocol
uses `expectedTurn` beside its transport sequence so delayed commands cannot
execute in a later turn. Seven frozen seeds and a six-command golden replay end
in a player victory at tick 186. State remains in-process; durable multi-instance
deployment is explicitly outside this slice.

### WP-008 Loomkeeper AI

Status: complete. Depends on WP-007.

Goal: add an independently designed deterministic AI that evaluates a bounded
set of legal movement, Relic, angle, and power choices through the public
simulation API. Difficulty comes from bounded search and controlled aim error,
not hidden rule advantages.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`.

Verification: deterministic decision tests, legal-command invariants, turn
budget, difficulty bounds, golden match replays, build.

Delivered as `nimble-knots-loomkeeper-v1`: a Phaser-free policy that searches
only accepted public simulation transitions on detached clones. Gentle,
standard, and sharp profiles use fixed candidate and controlled aim-error
bounds; practice challenges currently freeze and disclose standard. The
server commits at most one selected plan per Loomkeeper turn, records each
chosen command in the normal replay, and guards duplicate/timeout scheduling
with authoritative hash, revision, actor, and turn rechecks. Seven fixed-seed
decision tests and two complete golden matches freeze policy behavior and exact
reconstruction hashes. A sixteen-command player-turn cap plus full-plan replay
reservation prevents replay exhaustion from stranding an AI handoff. The AI
remains subject to the existing in-process,
single-process, restart-sensitive simulation limitation.

### WP-009 Relic Ruleset Completion

Status: complete. Depends on WP-007 and WP-008.

Goal: freeze and implement the two additional independently designed Relics
required by the competition contract. Introduce a new replay ABI identifier
rather than changing `nimble-knots-artillery-v1` in place. Each Relic must have
a distinct, disclosed, deterministic tactical role; use only bounded integer
state and the public simulation transition API; obey the same authority,
movement, damage, turn, and replay rules for player and Loomkeeper; and remain
usable without production artwork.

The package must first record the exact Relic names, player-facing behavior,
integer constants, selection rules, terrain interaction, damage/effect bounds,
AI candidate representation, and phone-readable placeholder requirements in
the gameplay and art-direction documentation. It then updates strict protocol
snapshots, replay reconstruction, the Loomkeeper policy, and golden evidence
for the new ruleset while retaining reconstruction support for existing v1
fixtures. No Sorcerers mechanics, constants, names, code, or assets may inform
the design.

Owning roles: `worms_port_planner`, `worms_port_base_game_worker`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification: deterministic unit and invariant tests for all three Relics,
player/Loomkeeper legal-command parity, bounded candidate and transition work,
terrain and damage edge cases, v1 replay compatibility, new-ruleset golden
replays including player win, Loomkeeper win, and turn-limit draw, protocol
snapshot limits, compliance, build, and read-only review.

Delivered as `nimble-knots-artillery-v2` with Threadball as the balanced Relic,
Needlepoint as the narrow precision-damage Relic, and Spoolburst as the broad
terrain/control Relic. New challenges and replays name v2 explicitly; legacy
`RULESET_ID`/version exports, v1 state hashes, projectile shape, golden tests,
and metadata-free replay reconstruction remain v1. Strict challenge snapshots
couple v1 to Loomkeeper policy v1 and v2 to policy v2. The v2 Loomkeeper uses a
deterministic axis-covering sampler across movement, Relic, angle, and power
without raising its candidate or transition budgets. Golden v2 matches cover
player win, Loomkeeper win, Spoolburst tactical selection, and turn-limit draw.
No runtime assets, dependencies, or Sorcerers material were used.

### WP-010 Phone Combat Scene

Status: complete. Depends on WP-009.

Goal: implement the portrait-first Phaser battlefield and large touch controls
for movement, Relic selection, drag aim/power, trajectory preview, firing,
Stitching, turn time, and pause/retry affordances. Landscape is enhanced but
optional. Use code-drawn placeholders until production art is approved.

WP-010 owns presentation, touch-input state, control availability, and the
snapshot-to-command adapter. Its pause control suspends client input and
presentation only; it does not stop the authoritative turn clock. Its retry
control exposes a safe UI state but does not own challenge creation or match
lifecycle. WP-011 owns practice-match creation, results, actual retry behavior,
and any authoritative practice pause semantics. Rewarded matches remain
unpausable except for a separately specified wallet interruption.

Mobile input references:

- `phaserjs/examples` at
  `6d23cdeb99c956ce72993904ad0f869c06fc6b3b` for Phaser-native horizontal
  drag, multitouch pointer registration, FIT scaling, and orientation events,
- `rexrainbow/phaser3-rex-notes` at
  `12d1ed131105e47515fc429ef0ba8abc93fb025f` for floating joystick placement,
  horizontal direction locking, vector force/angle, dead zones, and touch-event
  isolation,
- `colinkiama/last-one-flying` at
  `f1e7501d47777621aab67da4db166b2e59c25987` as the primary applied-game
  reference for separating touch controls, movement, combat, HUD, settings,
  pause/resume, and scene-shutdown responsibilities,
- `Acquati/touchscreen-joystick-for-phaser-3` at
  `9a535e3a2fc5feb1d15e24d730682188ace194b3` as the focused integration
  reference for wiring a Rex joystick into a small Phaser 3 TypeScript scene,
- Phaser 3.90 Input and Scale documentation plus the W3C Pointer Events
  specification for current API and browser cancellation semantics.

These are code-reference-only sources. Do not import their assets or add a Rex
runtime dependency by default. The normative adaptation rules and exact source
paths are in `docs/process/development_workflow.md` under **Mobile Touch
Reference Protocol**.

Applied-project use is deliberately selective. Last One Flying demonstrates a
useful systems boundary and complete scene lifecycle, but its fixed coordinates,
real-time dual joysticks, and incomplete cancellation handling are not product
requirements. Acquati demonstrates a minimal integration, but its older Phaser
and Rex versions and direct mutation of keyboard cursor state are not copied.
The NIMble Knots control contract below takes precedence.

Control contract:

- a floating horizontal movement pad is restricted to the lower-left control
  zone and produces normalized, quantized movement intent,
- a lower-right aim pad maps one owned pointer vector to angle and power; release
  locks the preview and never fires,
- a separate explicit Fire button sends the authoritative command and remains
  disabled outside the player's valid turn state,
- Relic selection uses large tap targets rather than a required swipe,
- pointer ownership cannot transfer between controls during one contact,
- pointer cancellation, release outside, blur, backgrounding, resize, and
  orientation change clear transient input and can never fire a shot,
- raw screen coordinates are not network commands; the client emits validated,
  bounded gameplay intent against the shared deterministic simulation.

Rendering and command data contract:

- consume the v2 `ChallengeSnapshot`, `RELIC_IDS`, and `RELIC_RULES` rather than
  duplicating Relic identifiers, balance values, selected state, Stitching,
  turn ownership, or deadline data in UI code,
- map the simulation's 128 by 72 cells at 8 units per cell to one fixed
  1024x576 logical battlefield, then adapt camera and control zones around that
  world for portrait, landscape, safe areas, and browser chrome,
- calculate the trajectory preview from a clone of the current v2 snapshot
  through the shared deterministic simulation API; preview work is advisory,
  never mutates authoritative state, and never submits a network command,
- replace local presentation immediately from each accepted authoritative
  snapshot, including after stale-command rejection or reconnect.

Keep the existing room/game flow from becoming one combined scene. Use scoped
boundaries for the combat scene/layout, snapshot renderer, touch-control state
machine, command adapter, and HUD/pause overlay. WP-010 may use a deterministic
fixture or adapter harness for lifecycle states that WP-011 has not wired yet.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`.

Verification: Chromium at 360x640, 390x844, and 844x390 plus WebKit at 390x844;
touch-only journey; movement and aim dead zones; exact cloned-state trajectory
preview; explicit-fire safety; pointer ownership; release-outside and
cancellation cases; safe areas; browser scroll/zoom suppression; resize and
orientation; background/resume; reduced motion; screenshots; build. WP-014
owns the expanded 412x915, visual-regression, network-degradation, and
performance matrix.

Delivered: a separate Phaser combat scene consumes v2 challenge snapshots and
maps the fixed 1024x576 simulation world into portrait and landscape layouts.
Product-owned DOM/pointer controls implement the 18% movement dead zone,
single-pointer ownership, bounded aim/power, explicit Fire, three distinct
Relic buttons, client-only pause, and retry affordance. Terrain, Knotkin,
Relics, Stitching, turn time, last-projectile trace, and advisory trajectory are
code-drawn without runtime assets. The advisory trace is reconstructed through
the shared simulation API from a detached clone and recomputed after accepted
snapshots. Cancellation, release outside, blur, backgrounding, resize,
orientation, and scene shutdown clear transient input. Five focused tests and
sixteen built-browser cases cover the documented WP-010 matrix; the foundation
smoke suite now runs eight live-practice cases over the same projects. The
deterministic `combat-preview` fixture is intentionally not the WP-011 live
practice flow.

### WP-011 Complete Practice Clash

Status: complete. Depends on WP-008, WP-009, and WP-010.

Goal: deliver an immediate, unlimited, non-rewarded player-versus-Loomkeeper
match through the live session/challenge protocol and authoritative v2
simulation. Practice starts without a wallet, matchmaking, another player, or
a reward pool. The server-backed path is the only product lifecycle in this
package. The deterministic `combat-preview` route remains a test-only adapter
harness; an offline/local product mode is not part of the competition release.

Lifecycle contract:

- keep onboarding, live protocol/session ownership, combat presentation, and
  results as separate typed responsibilities rather than extending the legacy
  room scene into one controller,
- let the player choose Wizard, Thief, or Warrior before creating a `practice`
  challenge; the three Callings retain identical gameplay statistics,
- open or resume the opaque-token session, create the challenge through
  `v1:challenge.create`, submit gameplay through `v1:command.submit`, and
  consume `v1:challenge.snapshot` and `v1:challenge.result` as the only live
  gameplay authority,
- make the live client adapter own request IDs, the server-provided next
  sequence, acknowledgement correlation, one in-flight mutation, strict typed
  errors, and listener cleanup; UI and Phaser code never manufacture transport
  authority,
- replace presentation only from the newest accepted authoritative challenge
  revision and state hash. The challenge revision is monotonic across both
  simulation updates and lifecycle-only pause/resume changes; it must never be
  reset from the embedded simulation revision. A stale acknowledgement,
  delayed snapshot, duplicate event, or local trajectory preview cannot roll
  state backward,
- suspend controls during disconnect and resume the same active challenge from
  the complete server snapshot and next sequence. Do not replay speculative
  client commands after reconnect,
- present exactly one terminal result for player win, Loomkeeper win, draw,
  leave, or expiry, with its authoritative final hash and retry action, and
- make Retry close or leave any active challenge when required, then create a
  fresh practice challenge with a new challenge ID and seed. The prior
  challenge must reject further commands.

Practice pause contract:

- add one strict, versioned, session-authorized and sequence-checked protocol
  operation that sets the paused state idempotently; do not encode pause as a
  simulation command or client-only timer adjustment,
- allow authoritative pause only for an active practice challenge during the
  player's `awaiting_command` phase. Reward challenges and Loomkeeper turns
  reject it without changing transport or simulation state beyond the normal
  sequence contract,
- expose the accepted pause state in the authoritative challenge snapshot.
  While paused, the coordinator does not advance that challenge's simulation
  ticks or turn deadline and gameplay commands are rejected; leave and retry
  remain available,
- resume from the same simulation tick and remaining turn budget. Session and
  overall challenge expiry continue to bound retained in-memory state, and
- retain pause state across a transient reconnect. Client input remains
  suspended until the server acknowledges resume and provides the current
  authoritative snapshot.

Failure contract: a Render process restart or expired session may end an
in-memory practice match. The client must say that the match cannot be resumed
and offer a fresh Practice Clash; WP-011 does not imply durable recovery.

Non-goals: wallet or Nimiq Pay integration, rewarded challenges, claims,
leaderboards, sharing, PvP, offline/local product play, durable restart
recovery, production art/audio, and the expanded WP-014 visual, degraded
network, 412x915, and performance gates.

Owning roles: `worms_port_base_game_worker`, `worms_port_network_worker`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification:

- focused client lifecycle and protocol-schema tests for request/sequence
  ownership, stale and duplicate delivery, pause authorization/state, retry,
  listener cleanup, and fail-closed error handling,
- real Socket.IO journeys for creation, player commands, automated Loomkeeper
  turns, pause/resume, terminal result, leave, retry, and reconnect from both a
  player turn and a pending Loomkeeper handoff,
- one deterministic player-win golden match and one deterministic non-win
  golden match, with final result, snapshot, replay hash, and reconstructed
  state in agreement,
- a complete touch-only onboarding-to-retry browser journey on Chromium at
  360x640, 390x844, and 844x390 plus WebKit at 390x844, using the live local
  server rather than `combat-preview`,
- process-loss/session-expiry coverage that clearly offers a fresh Practice
  Clash without claiming the old in-memory match was recovered,
- screenshots and traces outside `assets/`; compliance, types, focused unit,
  simulation, Loomkeeper, Relic, combat, protocol, clean build, built smoke,
  browser smoke, live-practice browser checks, audit, and read-only review.

Physical Android/iOS and Nimiq Pay WebView testing remain not run until the
separate release-testing environment exists. WP-014 still owns 412x915,
visual-regression baselines, low-bandwidth/offline/resume, bundle/performance,
and the complete competition-candidate quality gate.

Delivered: the default phone route now selects one of the three equal-stat
Callings and creates a live v2 practice challenge without wallet or matchmaking
dependencies. A scoped client adapter owns strict acknowledgements, request
IDs, sequence advancement, stale/conflicting snapshot rejection, bootstrap
snapshot/result buffering, reconnect suspension, and result deduplication. The
combat scene consumes asynchronous Loomkeeper and timer authority, while a
separate result scene exposes final tick/hash and Play Again or Calling-change
actions. Retry closes an active challenge and creates a fresh ID and seed.

`v1:challenge.pause` adds strict ordered practice-only pause/resume. Server
snapshots expose pause state and a monotonic challenge revision independent of
the embedded simulation revision. Paused matches stop coordinator ticks,
reject gameplay commands, retain state across reconnect, and resume at the same
tick; session/challenge expiry remains bounded. Focused client, coordinator,
schema, and real Socket.IO tests cover ordering and pause authority. The built
Chromium/WebKit phone suites cover onboarding, live commands, pause, automated
Loomkeeper handoff, reconnect, and fresh retry without using the fixture route.

### WP-011A Real-device Gameplay Stabilization

Status: complete. Depends on WP-011.

Goal: close the real-device acceptance gap between a correct authoritative
Practice Clash and a clearly readable, repeatable touch experience. Preserve
the v2 simulation, Loomkeeper decisions, replay hashes, and server authority;
fix lifecycle and presentation behavior without moving gameplay outcomes to
the client.

Acceptance evidence: the first Samsung Galaxy S22 test inside Nimiq Pay on
2026-07-20 passed Calling selection, first-match creation, round progression,
pause/resume, portrait composition, and the remaining WP-011 core journey on
the first attempt. It also exposed the following blocking regressions:

- after retry, a completed second match did not transition to the result scene;
  controls became disabled and only the in-scene Retry action remained,
- movement input produced no visible Knotkin movement and caused the advisory
  trajectory to reverse direction,
- authoritative player and Loomkeeper turns collapsed into an immediate state
  change: projectiles, impacts, Loomkeeper movement/aim, and damage order were
  not visibly presented, so both Stitching values appeared to change together,
- the advisory trajectory remained visible after firing, and
- in landscape, the Nimiq Pay browser ribbon reduced the usable visual viewport
  while movement, aim, Relic, and action controls overlapped or were clipped.

Lifecycle and presentation scope:

- reset all per-challenge result, listener, acknowledgement, and presentation
  state when Play Again or Retry creates a fresh challenge. Every terminal
  challenge, including two or more consecutive retries, must present exactly
  one result scene with Play Again and Calling-change actions,
- keep the newest accepted authoritative snapshot as protocol truth while a
  separate bounded presentation queue renders accepted revisions in order.
  Client animation must never manufacture commands, outcomes, damage, terrain,
  or hashes and must not roll authority backward,
- visibly present the player movement, player projectile, impact, terrain and
  Stitching change, Loomkeeper movement/aim, Loomkeeper projectile, impact, and
  resulting state before returning control or showing the terminal result,
- suspend gameplay input while confirmed actions are being presented. Cap and
  coalesce only presentation-safe idle frames so delayed rendering cannot grow
  an unbounded queue; reconnect may snap to the newest complete authoritative
  state with a clear recovery transition,
- use existing authoritative projectile traces and snapshots when sufficient.
  Add only the minimum typed presentation metadata if an accepted transition
  cannot otherwise be reconstructed; do not change simulation or AI balance,
- make accepted movement visibly reposition the Knotkin and provide clear
  feedback for rejected or terrain-blocked movement. Movement must not invert
  aim or facing through a screen/world coordinate error,
- show the advisory trajectory only for the current legal player aim. Clear it
  on Fire, movement, turn change, disconnect, result, and challenge replacement;
  recreate it from the next accepted snapshot and new player input, and
- preserve reduced-motion behavior by shortening or simplifying presentation,
  not by collapsing causally distinct player and Loomkeeper outcomes into one
  unexplained Stitching update.

Real-device layout scope:

- size the combat shell against the usable `visualViewport` and dynamic viewport
  height, including Nimiq Pay browser chrome and safe-area insets,
- provide a compact landscape composition in which battlefield, HUD, movement,
  aim, Relic selection, Fire, Pause, and Retry remain visible, non-overlapping,
  and touchable without page scrolling,
- retain the accepted portrait behavior and touch target sizes, and
- treat resize, orientation, visual-viewport changes, and browser-ribbon changes
  as input-cancellation boundaries so they cannot move or fire accidentally.

Non-goals: wallet identity, rewarded challenges, payouts, leaderboards, PvP,
new Calling statistics, Relic balance changes, production art/audio, durable
restart recovery, or the complete WP-014 visual/performance/degraded-network
gate.

Owning roles: `worms_port_base_game_worker`, `worms_port_network_worker`,
`worms_port_test_worker`, and `worms_port_reviewer`.

Verification:

- focused lifecycle tests that complete at least two consecutive challenges and
  assert one result transition per challenge plus fresh challenge ID and seed,
- presentation-queue tests for ordered player/AI movement, projectile, impact,
  terrain, Stitching, turn, reconnect, reduced-motion, and terminal-result
  handling without authority rollback,
- movement and coordinate-transform tests in both orientations, including
  blocked movement and trajectory direction before and after movement,
- live Socket.IO and built-browser journeys that visibly distinguish player and
  Loomkeeper actions and verify trajectory cleanup and control suspension,
- Chromium 360x640, 390x844, and 844x390 plus WebKit 390x844, with bounding-box
  assertions that every essential control is inside the visual viewport and no
  control groups overlap,
- a Samsung Galaxy S22 Nimiq Pay re-test in portrait and landscape, including
  two completed matches, movement in both directions, all three Relics,
  pause/resume, rotation, and retry, and
- compliance, types, focused tests, build, built smoke, and phone-browser smoke.
  Store automated screenshots, video, and traces outside `assets/`. Record the
  user-run physical-device result separately from the autonomous checks.

Delivered candidate: scene-local transition and presentation state now resets
for every fresh challenge, and a live deterministic browser journey completes
two consecutive Clashes with distinct challenge IDs and seeds and one result
screen per match. Accepted authority is separated from rendered state through a
bounded presentation queue that shows player movement/projectile/impact and
Loomkeeper movement/aim/projectile/impact phases before final terrain, Stitching,
turn, or result state is exposed. Reconnect cancels presentation and snaps to the
newest authoritative snapshot; reduced motion retains the causal phases with
shorter durations.

Movement drag strength submits up to four existing bounded movement commands,
animates accepted displacement, reports blocked movement, clears the prior aim,
and requires a new aim before Fire. Advisory trajectories clear across Fire,
movement, turn handoff, reconnect, result, and challenge replacement. The game
shell now follows `visualViewport`; compact landscape keeps movement, aim, and
all six action buttons visible and separate at an 800x300 usable viewport.
Deterministic test-only seed injection is enabled only under `NODE_ENV=test` for
repeatable consecutive-match browser evidence. No simulation, Loomkeeper,
Relic, replay, protocol authority, product asset, dependency, or hosting rule
changed.

Automated candidate verification passes the full compliance/type/unit/protocol/
build/smoke/audit funnel, twenty combat browser cases, and thirteen live-practice
browser cases (with three intentional project skips). The required user-run
Samsung Galaxy S22 Nimiq Pay portrait/landscape re-test passed on 2026-07-20;
the repeated-match result, movement/aim, causal turn presentation, trajectory
cleanup, and compact-landscape fixes worked on the deployed Render build.

### WP-011B Embedded Full-screen Capability Probe

Status: complete. Depends on WP-011A. WP-012 does not depend on the host
accepting this optional probe.

Goal: give landscape players the strongest standards-based request web content
can make to reduce browser chrome, without assuming control over Nimiq Pay's
native WebView or Android system UI.

Scope:

- show a compact **Full screen** HUD action only in landscape and only when the
  standard Fullscreen API reports that requests are enabled,
- invoke `requestFullscreen({ navigationUI: 'hide' })` directly from the player
  tap, then optionally request a landscape orientation lock after entry,
- expose a clear Exit action, follow browser Back/full-screen change events,
  cancel transient combat input during viewport changes, and resize against the
  resulting usable viewport,
- keep the existing compact landscape composition as the fallback when the API
  is unavailable or rejected, with a clear host-capability message, and
- verify the actual result inside Nimiq Pay on the Samsung Galaxy S22. Success
  means both system bars and the Nimiq Pay URL ribbon disappear; partial or no
  removal is recorded as a native-host limitation rather than worked around
  with undocumented APIs.

Non-goals: automatic full screen, misleading PWA metadata, CSS claims to hide
native chrome, a native wrapper, Nimiq Pay application changes, gameplay or
authority changes, dependencies, or assets.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`, and
`worms_port_reviewer`.

Verification: pure capability/request/exit/failure tests; a built Chromium
landscape UI probe; the WP-011A combat and live-practice phone matrices; build,
smoke, compliance, and audit; then Samsung Galaxy S22 Nimiq Pay landscape entry,
exit, rotation, and fallback acceptance.

Acceptance result on 2026-07-20: Samsung Chrome exposed the Fullscreen API, the
button appeared, and full-screen entry removed the browser chrome. Nimiq Pay did
not expose the API, so the button stayed hidden and the safe compact layout was
retained. The probe therefore established the native-host boundary as intended.
Chrome testing found two follow-up defects: the post-entry orientation lock
prevents rotating back to portrait, and transition to the result scene removes
the only visible full-screen toggle. Both are scoped to WP-011C rather than
reopening the host-capability probe.

### WP-011C Full-screen Rotation, Exit, and Sideways Stabilization

Status: complete. Depends on WP-011B. This corrective package does not block or
change WP-012 identity work.

Goal: make supported browser full screen reversible and orientation-responsive
through the complete Practice Clash journey, including terminal results, and
provide an explicit virtual-landscape fallback for portrait-locked Nimiq Pay.

Confirmed Samsung Galaxy S22 Chrome defects:

- entering full screen calls `screen.orientation.lock('landscape')`, after which
  physical rotation cannot switch the game to portrait, and
- completing a match while full screen transitions away from the combat HUD,
  so the result screen has no visible control to return to default browser mode.

Confirmed Samsung Galaxy S22 Nimiq Pay precondition:

- when Android auto-rotate is disabled while portrait, Nimiq Pay keeps a
  portrait browser viewport after the physical phone is turned sideways. This
  gives web content a stable surface on which to opt into a rotated landscape
  composition without relying on an unavailable host full-screen API.

Scope:

- remove the forced landscape orientation lock from full-screen entry. Keep the
  browser in full screen across ordinary rotation and recompute the existing
  portrait or landscape layout from the resulting usable viewport,
- preserve input cancellation and resize safety across full-screen and physical
  orientation changes,
- add a state-aware **Full screen** / **Exit full screen** control to the result
  screen. When full screen is active, the exit action must remain visible and
  usable regardless of orientation,
- centralize or share full-screen state only as much as needed to keep combat
  and result scenes synchronized with `fullscreenchange`,
- retain the existing compact fallback and hidden entry control in Nimiq Pay,
  where the host reports the Fullscreen API as unavailable, and
- ensure Play Again and Calling-change actions still work after entering or
  leaving full screen,
- add query-controlled `sideways=right` (also `sideways=1`) and
  `sideways=left` modes which create landscape logical dimensions only while
  the actual browser viewport is portrait,
- rotate the complete game surface, remap safe-area edges and inverse-map touch
  coordinates so movement and aiming retain their visual directions, and
- automatically disengage the virtual rotation when the actual viewport is
  landscape, avoiding a double rotation if the host or device setting changes.

Non-goals: forcing Nimiq Pay native chrome to disappear, closing the Nimiq Pay
mini app through an undocumented bridge, changing Android auto-rotate, detecting
physical device attitude independently of the browser viewport, making sideways
mode the default, locking any orientation, changing gameplay authority, or
adding dependencies and assets.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`, and
`worms_port_reviewer`.

Verification:

- unit coverage proving full-screen entry no longer requests an orientation
  lock and exit remains idempotent,
- Chromium phone-browser coverage for landscape entry, rotation to portrait and
  back while still full screen, completion into the result scene, result-screen
  exit, and subsequent Play Again/Calling-change actions,
- Chromium portrait-viewport coverage for both sideways directions, logical
  landscape sizing, touch movement and aim mapping, safe control fit, and
  automatic deactivation when the browser actually becomes landscape,
- the existing combat, live-practice, and smoke phone matrices plus build,
  compliance, and audit, and
- Samsung Galaxy S22 Chrome acceptance for entry, landscape-to-portrait rotation,
  match completion, result-screen exit to default mode, and retry. Confirm that
  Nimiq Pay still uses the non-full-screen fallback without a dead control, then
  test `sideways=right` and `sideways=left` in Nimiq Pay with Android auto-rotate
  disabled.

Acceptance result on 2026-07-21: the user-run Samsung Galaxy S22 Nimiq Pay test
confirmed the sideways workaround works and is the preferred way to play in
the current host. This closes WP-011C and motivates WP-011D's temporary default.

### WP-011D Default Sideways Host Workaround

Status: complete.
Depends on WP-011C. This presentation policy does not block or change WP-012
identity work.

Goal: use the accepted clockwise virtual-landscape workaround without requiring
a query parameter, while preserving explicit alternative and opt-out routes and
making the temporary host dependency easy to recover in a fresh implementation
session.

Scope:

- when `sideways` is absent and the browser viewport is portrait, behave as
  `sideways=right`,
- retain `sideways=1` / `sideways=right` and `sideways=left`, and add the
  documented `sideways=off` normal responsive composition,
- retain automatic virtual-rotation deactivation in an actual landscape
  viewport,
- show a prominent direction-aware start-card instruction to disable Android
  auto-rotate before turning the phone; hide it in normal responsive mode,
- keep legacy portrait and browser-full-screen regression coverage through the
  explicit opt-out while smoke and focused live tests cover the production
  default, and
- record the workaround prominently in `README.md`, `AGENTS.md`, this Execution
  Pointer, art direction, and the development workflow, including prerequisite,
  direction, escape hatch, host limitation, and removal trigger.

Removal trigger: replace the default only after a documented Nimiq Pay
full-screen game mode or reliable standard/native capability is verified on a
real device to remove the host URL ribbon/system-bar obstruction. Preserve
`sideways=off` throughout migration and do not substitute an undocumented host
bridge.

Non-goals: host sniffing, changing Android auto-rotate, inferring physical
device attitude, removing portrait support, changing gameplay authority,
wallet/reward work, dependencies, or assets.

Owning roles: `worms_port_base_game_worker`, `worms_port_docs_keeper`,
`worms_port_test_worker`, and `worms_port_reviewer`.

Verification:

- unit coverage for no-query clockwise default, explicit left/right forms, and
  `sideways=off`,
- built phone smoke coverage of the no-query default across the existing
  Chromium/WebKit phone projects,
- focused combat and live Practice coverage for default rotation, touch mapping,
  actual-landscape deactivation, and the explicit normal-layout regression path,
- existing build, compliance, combat, practice, browser, smoke, and audit gates,
  and
- user-run Samsung Galaxy S22 Nimiq Pay acceptance starting from the ordinary
  no-query Render URL with Android auto-rotate disabled while portrait.

Acceptance result on 2026-07-21: the user-run Samsung Galaxy S22 Nimiq Pay test
started from the ordinary no-query Render URL with Android auto-rotate disabled
and confirmed the default clockwise sideways presentation works as intended.
This closes WP-011D while retaining `sideways=left`, `sideways=off`, and the
documented host-capability removal trigger.

### WP-011E Arena-first Contextual Combat HUD

Status: complete. Depends on WP-011D's
presentation policy and deployed-device acceptance. This visual refinement does
not block or change WP-012 identity work.

Goal: give the fixed 16:9 battlefield the maximum usable safe-viewport area and
move the essential status and touch controls into a restrained, contextual
overlay. The arena should read first; controls should stay predictable and
usable without becoming a permanently opaque second screen.

Research basis:

- Apple's [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)
  guidance supports contextual controls, controls that fade while idle, and a
  floating thumbstick that appears where the player touches.
- The Game Developer articles on
  [dynamic interfaces](https://www.gamedeveloper.com/design/dynamic-user-interfaces-adapting-to-changing-situations-in-games-to-increase-player-performance)
  and [peripheral HUD perception](https://www.gamedeveloper.com/design/perceiving-without-looking-designing-huds-for-peripheral-vision)
  support removing irrelevant information by phase while keeping locations
  stable, shapes distinct, and text short enough to read peripherally.
- Activision's official
  [Call of Duty: Mobile control overview](https://blog.activision.com/call-of-duty/2019-10/Getting-a-Grip-on-the-Call-of-Duty-Mobile-Controls.html)
  provides a shipped reference for repositionable touch overlays and opacity
  adjustment. WP-011E adopts the overlay principle, not its visual design.
- Dargom Studio's [GunboundM](https://dargomstudio.com/index.php/gunboundm/)
  is a relevant mobile artillery reference for a battlefield-dominant
  composition. No code, artwork, layout pixels, or product assets may be copied.

Current measured baseline and target:

- At the Samsung acceptance viewport of 844 by 390 CSS pixels, the present
  eight-pixel safe margins leave about 828 by 374 pixels. The permanent 54-pixel
  status row and approximately 282-pixel action column limit the 16:9 arena to
  about 534 by 301 pixels.
- Using the same safe viewport without reserved status or control bands permits
  an approximately 665 by 374 arena. WP-011E must reach at least 660 by 370 at
  this viewport, a minimum 20 percent linear-scale improvement over the current
  layout, without cropping simulation space.
- The renderer must use the mathematical maximum 16:9 rectangle inside the safe
  viewport in every supported composition. Persistent opaque HUD surfaces must
  not reserve arena rows or columns and should cover no more than 10 percent of
  the arena at rest.

Target composition:

```text
+---------------------- full safe-viewport arena -----------------------+
| [Pause]                    [YOUR TURN - 17s]                           |
|                                                                      |
|          [Player Stitching]                 [AI Stitching]            |
|                Knotkin       terrain       Loomkeeper                 |
|                                                                      |
|  (floating MOVE)       [Selected Relic v]       (floating AIM)       |
|                                                    [FIRE]            |
+----------------------------------------------------------------------+
```

Information architecture:

| Current surface | Arena-first replacement |
| --- | --- |
| Full-width status bar | Compact top-center turn/timer pill |
| Combined `Stitching 100 - 100` text | Short exact-value bars anchored near, but not over, each actor |
| Permanently visible movement and aim pads | Stable left/right touch zones whose pad appears under the active thumb and fades when idle |
| Three permanent Relic buttons | Selected-Relic chip that opens a temporary three-item chooser in a stable location |
| Fire, Pause, and Retry row | Explicit Fire near the aim zone; Pause in a safe corner; Retry inside the pause sheet |
| Persistent instructional/status copy | Short transient battlefield toast with an accessible live-region equivalent |

Phase and visibility contract:

| Presentation phase | Persistent information | Active controls | Faded or hidden |
| --- | --- | --- | --- |
| Player decision, no locked aim | Turn/timer, both Stitching bars, Pause | Movement zone, aim zone, Relic chip | Fire unavailable; idle pad art faint |
| Player aiming or aim locked | Turn/timer, both Stitching bars, Pause | Aim zone, Relic chip, explicit Fire when locked | Movement fades; unrelated instructions hide |
| Player command presentation | Both Stitching bars, compact phase label | None | Movement, aim, Relic, and Fire fade and reject input |
| Loomkeeper presentation | Both Stitching bars, compact `Loomkeeper` phase label | Pause only when the lifecycle permits it | All command controls fade and reject input |
| Paused | Dimmed arena and current Stitching | Resume, Retry, and supported full-screen action in a modal sheet | Battlefield touch zones reject input |
| Disconnected/reconnecting | Latest rendered arena and connection state | Retry/return action only when the protocol permits it | All gameplay controls reject input |
| Terminal result | Existing result scene | Play Again, Calling change, and full-screen exit when applicable | Combat overlay is destroyed |

Interaction and accessibility invariants:

- Fire remains a separate deliberate action. Releasing the aim pad locks aim and
  must never also submit Fire.
- Logical control anchors stay fixed across phase changes. Controls may fade or
  expand in place; they must not jump beneath a resting thumb.
- Every button keeps a minimum 48 by 48 CSS-pixel target. Each floating pad has
  at least a 96-pixel active diameter and remains operable with one thumb.
- Idle pads remain discoverable through a faint boundary or first-use cue;
  active pads gain contrast at the touch origin. Visibility cannot depend on
  color alone.
- Exact Stitching values, whose turn it is, remaining time, selected Relic,
  locked-aim readiness, pause state, and connection state remain available to
  assistive technology even when their visual treatment is compact.
- Actor bars choose a clamped screen-space anchor above the actor and must not
  cover the actor center, aim origin, or safe edge. When anchors would collide,
  they move outward predictably rather than overlap.
- Reduced-motion mode uses immediate visibility changes while preserving every
  causal presentation phase. Ordinary fades are short presentation effects and
  never delay authority or enable input early.
- Safe-area insets, `visualViewport`, default clockwise sideways presentation,
  explicit left rotation, `sideways=off`, actual landscape, and browser full
  screen remain supported. The overlay cannot infer device attitude or control
  native host chrome.
- This package may change DOM/CSS/canvas presentation and input hit geometry,
  but not simulation commands, command ordering, replay hashes, Loomkeeper
  policy, server authority, result rules, or the Turtle/Sorcerers import
  boundary.

Implementation slices:

1. **Arena geometry and compact status.** Replace reserved HUD/action bands with
   a maximum-area battlefield, add turn/timer and actor Stitching anchors, and
   keep existing controls temporarily functional as overlays. Establish layout
   geometry tests before changing control disclosure.
2. **Contextual touch controls.** Convert movement and aim to floating pads,
   collapse Relics into the selected-chip chooser, keep explicit Fire, and move
   Retry into the Pause sheet. Preserve current command callbacks and pointer
   cancellation rules.
3. **Phase transitions and hardening.** Drive visibility from the existing
   presentation state, add reduced-motion and accessibility behavior, tune
   occlusion, and complete the browser/device matrix.

Non-goals: gameplay balance, new Relics, simulation or protocol changes,
drag-to-fire, auto-fire, hidden exact Stitching, host-specific APIs, native-app
changes, copied third-party UI, production artwork imports, user-customizable
HUD editing, or a general desktop HUD redesign beyond keeping `sideways=off`
functional.

Owning roles: `worms_port_base_game_worker`, `worms_port_test_worker`,
`worms_port_docs_keeper`, and `worms_port_reviewer`.

Verification:

- pure layout tests for maximum 16:9 arena geometry, safe-area clamping, actor
  bar collision handling, and both sideways directions,
- input tests proving floating-pad origin/mapping, aim-lock then explicit Fire,
  Relic chooser semantics, phase gating, pause-sheet Retry, pointer cancellation,
  keyboard focus, and accessible labels,
- Chromium 360 by 640, 390 by 844, 844 by 390, and compact 640 by 360 plus
  WebKit 390 by 844 screenshot/bounding-box coverage across decision, aim,
  player presentation, Loomkeeper presentation, pause, reconnect, and result,
- assertions that the 844 by 390 arena is at least 660 by 370, no essential
  target leaves the safe viewport, stable controls do not jump between phases,
  and persistent opaque overlays stay within the coverage budget,
- existing live Practice journeys, two-match regression, all three Relics,
  full-screen/result exit, sideways default/left/off, build, compliance, audit,
  and phone smoke, and
- user-run Samsung Galaxy S22 Nimiq Pay acceptance with auto-rotate disabled:
  first-use discoverability, one-thumb movement/aim/Fire, visible player and AI
  presentation, Pause/Retry recovery, no critical actor/trajectory occlusion,
  and materially larger battlefield confirmation.

Delivered candidate: layout now computes the maximum 16:9 arena inside the
safe `visualViewport`; at 844 by 390 it produces approximately 665 by 374 CSS
pixels compared with the prior approximately 534 by 301. The compact turn/timer
pill and collision-safe exact Stitching bars overlay the arena. Movement and aim
retain their established left/right activation zones while their 96-pixel
minimum pads appear at the active thumb and fade when idle or unavailable.

The three permanent Relic buttons are replaced by one selected-Relic chip and a
temporary three-item chooser. Aim release still locks without firing, explicit
Fire becomes prominent only after lock, command controls fade in place through
player/Loomkeeper presentation and reconnect, and reduced motion removes the
transition without changing phase order. Pause remains in the safe corner;
Retry and the supported combat full-screen action are available from its modal
sheet. Actor status follows rendered movement while authoritative values and
all simulation, protocol, replay, result, and Loomkeeper rules remain unchanged.

Automated candidate verification passes 18 focused combat tests, 26 applicable
combat-browser cases (six intentional project skips), 15 applicable live
Practice browser cases (nine intentional project skips), and all eight built
phone-smoke cases across the maintained Chromium/WebKit projects. Compliance,
types, build, built-server smoke, Practice tests, audit, and self-review pass.
The existing bundle-size warning remains. Physical Samsung Galaxy S22 Nimiq
Pay acceptance passed on 2026-07-21.

Acceptance result on 2026-07-21: the user-run Samsung Galaxy S22 Nimiq Pay test
confirmed that the maximum-area battlefield, actor-local Stitching, floating
movement and aim pads, contextual Relic/Fire controls, phase visibility, and
Pause-sheet recovery work correctly on the deployed build. This closes
WP-011E; physical coverage beyond that Samsung device remains a release risk.

### WP-012 Nimiq Pay Identity Adapter

Status: complete on 2026-07-29. Depends on WP-006's validated
session protocol and the accepted WP-011E client baseline. WP-011B through
WP-011D remain presentation constraints rather than identity authority.

Physical acceptance correction: Samsung Galaxy S22 Nimiq Pay successfully
completed account discovery, signing approval, official server verification,
and the authenticated result. Rejecting the native signing approval produced a
truthful failure, but the client did not release the short-lived server attempt.
Repeated account selection could therefore reach the pending/rate bound and
report `Identity authorization is temporarily unavailable` until disconnect or
expiry. Add a strict authenticated `v1:identity.cancel` operation that consumes
only the calling session/socket's authorization ID. The client must invoke it
after signing rejection, approval timeout, or malformed/failed provider output;
cancellation is best-effort and must never replace completion or authorize a
session. Immediate same-account retry must receive a fresh authorization and
reach signing approval without waiting for the three-minute expiry.

Correction implementation result: the strict cancel request, owner-bound
server consumption, uniform idempotent acknowledgement, and client cleanup are
implemented. Focused unit/Socket.IO coverage and the browser sequence `reject
signing -> retry the same account -> authorize` pass.

Acceptance closure on 2026-07-29: the deployed Samsung Galaxy S22 Nimiq Pay
re-test confirmed successful authorization, truthful signing rejection, and
immediate same-account retry without the temporary-unavailability error. This
closes the WP-012 correction and advances planning to WP-013.

Delivered: the Mini App SDK is loaded only after an explicit action on the
query-gated acceptance surface; ordinary Practice does not initialize it.
Server-issued three-minute challenges bind purpose, public origin, Nimiq
network, normalized address, authorization ID, 256-bit nonce, time bounds,
session, and connection. The server verifies the official signed-message
construction with exactly pinned server-only `@nimiq/core`, derives the signer
address, atomically consumes attempts, bounds/rate-limits pending work, and
rotates the opaque session token on success. Optional device consent discards
the raw identifier and is never authentication authority. No reward or NIM
transaction path was enabled.

Verification passed: the full fast suite, compliance and license checks, types,
production build, built-server smoke, package audit, server/client bundle
separation, browser smoke, Practice browser matrix, and fake-provider identity
matrix. The identity suite contains twenty-two passing adapter, cryptographic,
registry, and real Socket.IO tests, including official golden vectors,
domain/binding mutations, malformed-proof consumption, replay, concurrency,
active-Practice races, owner-bound cancellation, and immediate retry. User-run
Samsung Galaxy S22 Nimiq Pay acceptance passed for provider discovery,
authorization approval, signing rejection, and immediate retry.

Goal: isolate the official Mini App SDK behind an adapter for initialization,
language, wallet account selection, signed challenges, rejection, timeout, and
optional consent-based device identity. Practice cannot depend on the provider.

Official integration baseline, reviewed 2026-07-21:

- pin the pre-1.0 `@nimiq/mini-app-sdk` package at the reviewed exact version
  `0.1.0`; its npm metadata declares MIT and points to
  `nimiq/trust-web3-provider` branch `nimiq`, directory
  `packages/mini-app-sdk`,
- use `init({ timeout })` only behind the adapter and only after an explicit
  identity action; do not wait for provider injection during application boot,
- use `listAccounts()` for consent-based account selection and `sign()` for
  the canonical server challenge; the documented signing result contains hex
  `publicKey` and `signature` values,
- validate both thrown failures and resolved provider `ErrorResponse` values
  from `listAccounts()` and `sign()`; never destructure or authorize an
  unchecked provider result and never automatically retry a user rejection,
- read host language through the SDK helper or `window.nimiqPay?.language`,
  then fall back to the device language and English without turning WP-012 into
  a full localization package, and
- expose `requestDeviceIdentifier({ reason })` only as a separate optional
  consent action. It identifies an origin-scoped device, not a wallet user, and
  must never authenticate a session.

Open-source security review, reviewed 2026-07-21:

- primary behavior references are the official
  `nimiq/trust-web3-provider` commit
  `49cfe535b90c61e48766d1f7a6206a80442692a1`, `nimiq/hub` commit
  `3cee2efe83a476eae9a5825bb2f2dea2266a3918`, `nimiq/keyguard` commit
  `02e7534f9b7668bfc66666e1a82bd87584f5b406`, and `nimiq/wallet` commit
  `fa271bb362b2cf6a8abfc39560145f6f80b219e1`,
- community implementation evidence is `onmax/nimiq-auth` commit
  `c2a4c63a28b71e1185e16719922810553c11fab4`, `Harlski/nspace` commit
  `1b0f1e3698089e8bc1369c43b84e0c30231a31c1`, and
  `blouflashdb/Nuxt-Nimiq-Login` commit
  `902478a955228f09a1379a50784023fb9793ddc2`; these are review references,
  not approved code or asset inputs, and
- the reusable pattern is a server-created, short-lived, single-use challenge
  verified through official Nimiq cryptography with the signer address derived
  from the public key. Do not copy examples that leave a signed JWT replayable
  until expiry, compare authentication secrets with ordinary string equality,
  trust client-supplied messages or identity flags, or implement custom
  signature/address cryptography.

Adapter and product boundary:

- define a small application-owned interface with explicit `unavailable`,
  `initializing`, `ready`, `awaiting_approval`, `authorized`, `rejected`,
  `timed_out`, and `failed` outcomes; SDK/provider errors must not leak through
  as product control flow,
- standalone browsers and Nimiq Pay instances without an injected provider
  must return a bounded unavailable result while Start Practice continues to
  work unchanged,
- do not add wallet controls to the combat HUD, Pause sheet, or result actions,
  and do not trigger native approval while a Practice or rewarded turn is
  active,
- keep the production Practice entry visually and behaviorally unchanged;
  provide a query-gated same-origin identity acceptance surface for fake and
  physical Nimiq Pay provider testing, then let WP-013 own the production Daily
  Challenge identity call to action, and
- before and after any native approval request, cancel owned pointers and
  resynchronize `visualViewport`, full-screen, and sideways presentation state
  so returning from Nimiq Pay cannot continue a stale movement or shot.

Authorization protocol:

1. Add a strict authorization-begin request. The server creates an opaque
   authorization ID and at least 256 bits of CSPRNG nonce, stores only bounded
   pending state, and returns one canonical message to sign with a two-to-five
   minute lifetime. Do not place the challenge, proof, or authorization ID in a
   URL.
2. Bind that message to a schema/version tag, purpose, configured public
   origin/audience, configured Nimiq network, selected normalized address,
   authorization ID, nonce, issue time, expiry, and the current connection or
   anonymous session attempt. The client cannot supply or rewrite the message
   accepted by the verifier. Derive origin and network from server configuration,
   not request data. Use a short, printable ASCII, line-oriented format with
   fixed field order and LF endings so the host approval is understandable and
   JavaScript character length cannot diverge from UTF-8 byte length.
3. Complete authorization with only the authorization ID, normalized address,
   public key, and signature. Extend or replace the reserved
   `SignedSessionProofSchema`; the current address/challenge/signature shape is
   not sufficient for the SDK result or a server-issued challenge flow. Treat
   `listAccounts()` as selection UX only: its cached address list is not
   authentication authority.
4. Verify the canonical stored message using the standard Nimiq signed-message
   construction (`\x16Nimiq Signed Message:\n`, JavaScript message character
   length, message, SHA-256, then signature verification) and a reviewed,
   exactly pinned server-only Nimiq verification dependency. Do not verify the
   raw message directly and do not use Keyguard's distinct Connect Challenge
   prefix unless a future provider contract explicitly exposes that operation.
5. Derive the signer address from the verified public key and compare its
   normalized value with the address bound at begin time. Reject wrong or
   malformed signature, public key, address, purpose, origin/audience, network
   domain, expiry, or connection binding; never trust a client identity-mode
   flag.
6. Atomically consume an authorization ID before expensive proof verification,
   including invalid proofs, so simultaneous or replayed completion fails
   closed and any failure requires a fresh begin request. Bound outstanding
   attempts per connection, anonymous session, IP, and normalized-address hash;
   rate-limit begin/complete calls, cap request sizes, expire and sweep abandoned
   attempts, and return a uniform external authorization failure. A Render
   restart may invalidate pending authorization but cannot create an authorized
   session.
7. On success, rotate into a new opaque server session token, invalidate the
   anonymous attempt and other pending authorization owned by it, and bind the
   verified wallet identity to server-side session state. Never store a private
   key, raw device identifier, or reusable signed challenge in the browser
   session token.

Pending authorization remains server-side, so it does not need a client-carried
JWT or custom HMAC wrapper. Do not log full canonical messages, nonces,
signatures, public keys, session tokens, or raw wallet/device identifiers;
record only sanitized reason codes and opaque/hash-reduced correlation data.
Identity-enabled production startup must have an explicit public origin,
allowed Socket.IO origin set, and Nimiq network domain rather than a wildcard or
request-derived value.

The configured Nimiq network is a server authorization domain, not a value the
current Nimiq provider reports. “Wrong network” tests therefore mutate the
canonical signed domain or server configuration; WP-012 must not invent an
undocumented provider network API.

Non-goals: rewarded-match eligibility or reservation, claims, payouts or any
NIM transaction, production Daily Challenge UI, leaderboard behavior, using a
device ID as authentication, full localization, durable multi-instance
authorization state, PvP, or changes to simulation/gameplay authority. Real
fund movement remains blocked.

Owning roles: `worms_port_network_worker`, `worms_port_compliance_keeper`,
`worms_port_test_worker`, and `worms_port_reviewer`.

Verification:

- adapter unit tests for delayed injection, standalone unavailability,
  approval, rejection without retry, timeout, thrown errors, resolved
  `ErrorResponse` values, malformed provider results and encodings, account
  selection/cache behavior, host-language fallback, and optional
  device-identifier consent/error paths,
- protocol tests for nonce uniqueness and expiry, malformed payloads, wrong
  signature/public key/address/purpose/origin/network/binding, strict field
  order, LF/CRLF and non-ASCII canonicalization rejection, standard Nimiq
  signed-message golden vectors, raw-message and Connect-prefix negative cases,
  proof-size/encoding limits, replay, simultaneous completion with at most one
  success, failed-proof consumption, uniform failures, rate limits, disconnect,
  sweep/restart invalidation, and session-token issuance only after successful
  verification,
- Chromium/WebKit browser coverage proving default Practice never initializes
  or waits for the provider, plus a fake-provider identity acceptance route
  that preserves sideways/viewport state and clears stale input across the
  approval boundary,
- user-run Samsung Galaxy S22 Nimiq Pay acceptance for provider discovery,
  account approval, signing approval and rejection, returning from the native
  dialog, and continued wallet-free Practice; record allowlisting or host
  limitations separately,
- perform a server-only `@nimiq/core` dependency spike before committing the
  verifier: choose and exactly pin a reviewed compatible release, record its
  Apache-2.0 license, prove its WASM/resources start in the Render-built server,
  and inspect the client output to ensure neither the package nor its WASM is
  shipped in the browser bundle,
- exact dependency pins and license review, `npm audit`, compliance, types,
  focused protocol/identity/browser tests, clean build, built-server and Render
  runtime smoke, client-bundle inspection, and browser smoke, and
- read-only security review before merge. Keep real transactions and sponsor
  funds disabled and untested in this package.

### WP-013 Sponsored Daily Challenge

Status: security-refined on 2026-07-29; implementation pending. Depends on
WP-007, WP-008, WP-009, and WP-012.

Goal: deliver one optional wallet-authorized Daily Grand Knot Challenge with a
fixed sponsor-funded NIM reward for an eligible server-authoritative win.
Practice remains unlimited, wallet-free, and available when rewards are
disabled, paused, exhausted, or unavailable. Implement durable eligibility,
reservation, match evidence, claims, payout reconciliation, daily spending
limits, and an operator kill switch before any real sponsor funds can move.

#### Security and implementation references

The refinement was checked against primary Nimiq, OWASP, PostgreSQL, and Render
guidance:

- Nimiq transaction structure, network binding, submission failures, and
  macro-block finality:
  `https://nimiq.dev/protocol/transactions`;
- Nimiq server RPC submission and transaction lookup:
  `https://nimiq.dev/rpc/`;
- official Nimiq Core policy source:
  `https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/src/policy.rs`;
- OWASP Transaction Authorization, Secrets Management, Logging, and API6
  sensitive-business-flow guidance:
  `https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html`,
  `https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html`,
  `https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html`, and
  `https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/`;
- PostgreSQL serializable transactions, explicit/advisory locks, unique
  constraints, and `ON CONFLICT` behavior:
  `https://www.postgresql.org/docs/current/transaction-iso.html`,
  `https://www.postgresql.org/docs/current/explicit-locking.html`, and
  `https://www.postgresql.org/docs/current/sql-insert.html`; and
- Render runtime secrets and environment separation:
  `https://render.com/docs/configure-environment-variables` and
  `https://render.com/docs/projects`.

Open-source implementation review used
`Timidan/nimdrops@7bb791e6adf63a3fcc8f101e02f1fa2331d92556` as the closest
MIT behavioral reference for atomic claims, durable payout intent, a
single-worker lease, exact serialized-transaction persistence, and crash/race
tests. `Eligioo/nimtris@34018fc71aa840d0e62b5328ada288df7b42e5e0` was useful
only for historical Nimiq game-reward orientation and has no repository license
suitable for product import.
`NIMIQ-MINIAPPS/NIMIQ-ARCADE@d80f9156b9f816587b4fbe45970f0583d1cab337`
is MIT and closer to a Mini App game, but its client-reported score/XP and
untested payout path are explicitly rejected as reward authority. These
repositories are review evidence only: no code, assets, secrets, or payout
configuration may be copied from them.

The current Nimiq documentation is internally inconsistent about transaction
validity: the transaction guide describes 120 blocks, while pinned
`@nimiq/core` `2.7.1` exposes 120 batches, 60 blocks per batch, and 7,200
validity-window blocks, consistent with Nimiq's current multisig explanation.
Do not hardcode either prose value. Read and test
`Policy.TRANSACTION_VALIDITY_WINDOW_BLOCKS` from the exactly pinned server-only
core dependency when constructing and expiring transactions.

#### Product and authority boundary

- The ordinary Practice entry must not initialize Nimiq Pay, inspect reward
  state, require durable storage, or become unavailable with the payout
  service.
- The Daily Challenge entry is the first production consumer of WP-012's
  verified wallet session. Account selection alone is not authority.
- The server chooses the eligibility day, reward amount, recipient, ruleset,
  Loomkeeper profile, seed, turn limit, reservation deadline, and payout state.
  The client can request or display these values but cannot supply or alter
  them.
- Bind the immutable normalized payout recipient to the WP-012 verified public
  key/address when the reservation is created. A claim never accepts a payout
  address, reward amount, result, replay hash, transaction, network, or fee from
  the client.
- Use integer Luna throughout the money path (`1 NIM = 100,000 Luna`). Reject
  floating-point reward or fee configuration and out-of-range integer values.
- Disclose the fixed reward, eligibility rule, turn limit, reservation window,
  and current availability before native wallet approval and before play. A
  later race may truthfully return unavailable; it must not silently downgrade
  a rewarded match to Practice.
- Default eligibility is one started rewarded attempt per verified wallet per
  UTC challenge day. Unlimited Practice is the retry path after a loss,
  forfeit, or consumed rewarded attempt.
- Creating a reservation does not consume the daily attempt until the
  authoritative rewarded match starts. Bound pre-start reservation churn per
  wallet/session/IP, permit only one active reservation per wallet, and release
  an unstarted expired or cancelled reservation atomically.
- Starting, leaving, losing, timing out, or completing a rewarded match consumes
  the attempt. Provider failure before the match starts must not consume it.
  Once the server records an eligible win, the reward is a durable liability
  and cannot disappear at UTC rollover, reservation expiry, deploy, or
  disconnect.

#### Durable reward ledger and concurrency

- WP-013 requires a PostgreSQL-compatible durable database even while Render
  remains a single web-service instance. In-memory maps, local files, browser
  storage, and Render's ephemeral filesystem are not monetary authority.
- Store schema migrations in the repository and use a least-privileged runtime
  database role. Keep the sponsor private key out of every database table,
  migration, fixture, trace, and backup.
- Persist immutable challenge-day policy, reservation, authoritative match
  evidence, claim intent, payout intent, state-transition events, serialized
  signed transaction, transaction hash, inclusion/finality evidence, and
  sanitized operator reason codes.
- Required database backstops include one started attempt per
  wallet/challenge-day, one active reservation per eligible wallet, one payout
  per winning entitlement, one request digest per idempotency key, and one
  immutable signed transaction per payout attempt. Application checks alone
  are insufficient.
- Reserve a reward and decrement available daily capacity in one transaction.
  Reservations count against the configured daily Luna ceiling until released
  or converted to a durable winning liability.
- Use a small `SERIALIZABLE` transaction or explicit row lock for the final
  reward slot and ledger solvency check. Retry the complete transaction on
  PostgreSQL serialization failure (`SQLSTATE 40001`); never retry only the
  final statement.
- A PostgreSQL advisory lock may ensure that only one payout worker actively
  signs at a time, but it is cooperative and cannot replace unique constraints,
  state-transition guards, or idempotency.
- Treat “exactly once” as an exactly-once payout effect produced by durable
  idempotency and reconciliation. Do not claim that network delivery or RPC
  broadcasting itself occurs exactly once.

#### Reward and payout state machine

Only allow documented transitions. Request handlers own reservation and claim
intent; the authoritative simulation owns match outcomes; the payout worker
alone owns monetary states after queueing.

```text
reserved -> in_progress -> lost | forfeited | expired
reserved -> cancelled | expired
in_progress -> won -> claimable -> queued -> signed
signed -> broadcast_unknown -> included -> finalized
queued | signed | broadcast_unknown -> manual_review
```

- `lost`, `forfeited`, `expired`, `cancelled`, and `finalized` are terminal for
  their entitlement branch.
- `won` and later states retain the fixed liability until finalized or resolved
  by an audited operator action. Pool reset must not erase them.
- A kill switch stops new reservations, claims, signing, and first broadcasts.
  It must continue read-only reconciliation of already known transaction hashes
  so an ambiguous payout is not incorrectly treated as unpaid.
- Every state change checks its expected previous state in the same database
  statement or transaction and appends an audit event. Out-of-order, skipped,
  repeated with different data, or client-selected transitions fail closed.
- Cancellation is allowed only before `in_progress`. Disconnecting or closing
  the UI after a rewarded match starts is a forfeit or resumable authoritative
  match according to the existing session deadline, never a way to recover the
  consumed daily attempt.

#### Claim authorization and abuse controls

- The authoritative simulation result and retained replay/state hash are the
  only win evidence. A client result screen, score, health value, screenshot,
  elapsed time, or replay upload cannot create an entitlement.
- Issue a short-lived, single-use server claim nonce only for an authenticated
  session bound to a durable `won` entitlement. A re-authenticated session for
  the same verified wallet may recover an outstanding claim without changing
  its recipient or amount.
- Require a client idempotency key and bind it to the canonical claim-request
  digest. Repeating the same key and body returns the same claim; reusing the
  key with different data returns a conflict and creates nothing.
- Rate-limit availability, reservation, match creation, claim, and status
  polling separately by privacy-reduced IP, session, wallet, and entitlement
  keys. Keep the existing shared-carrier/NAT allowance in mind.
- One wallet is not proof of one human. Optional consent-based device identity,
  IP reputation, flow timing, or a risk-triggered human check may raise abuse
  cost, but none may replace the signed wallet or authoritative match result.
  Do not claim Sybil resistance, silently fingerprint users, or make raw device
  identifiers durable reward authority.
- Reservation exhaustion is an abuse case: limit active and daily reservation
  creation, sweep expiry transactionally, and alert when expired/unstarted
  reservations consume an unusual share of the pool.

#### Payout worker and Nimiq transaction recovery

- Run one logical signer worker. Public Socket.IO/HTTP handlers may enqueue
  immutable payout intent but must never receive the signer object, key bytes,
  or an operation that signs caller-provided transaction fields.
- Before signing, re-read the locked entitlement and validate the expected
  signer address, configured Nimiq network, immutable recipient and Luna value,
  per-transfer limit, daily ledger ceiling, hot-wallet balance, fee reserve,
  current chain height, and healthy non-stale RPC status.
- Build and sign only from stored server intent. Persist the exact serialized
  signed transaction and deterministic transaction hash before the first
  `sendRawTransaction` call.
- An RPC timeout, disconnect, duplicate response, worker crash, or process
  restart after submission is an ambiguous broadcast, not proof of failure.
  Query the stored hash and rebroadcast the exact stored bytes as needed.
  Never construct a replacement merely because submission did not return.
- Distinguish `signed`, `broadcast_unknown`, `included`, and `finalized` in
  storage and user messaging. Mempool acceptance or RPC submission is not
  “paid”; Nimiq macro-block finality is the completed state.
- The first release sends an expired, conflicting, missing-after-window, or
  otherwise irreconcilable transaction to `manual_review`. Automatic
  replacement transactions are out of scope because they can double-pay if the
  original status was misclassified.
- RPC endpoints are server-controlled HTTPS configuration, never request
  parameters. Validate expected network and freshness, bound timeouts/retries,
  and treat every RPC response as untrusted external input.
- Reconciliation must be restart-safe and scan durable non-terminal payouts on
  startup. A deploy cannot forget a signed or possibly broadcast transaction.

#### Sponsor key, hosting, and activation boundary

- Use a dedicated automated payout hot wallet, never a personal wallet or the
  full sponsor treasury. Keep the main sponsor funds offline or under a
  separately operated multisig and top up only the configured daily ceiling
  plus a bounded fee buffer.
- Supply the hot-wallet key only as a Render runtime secret file. Never commit
  it, place it in `render.yaml`, expose it as a Docker build argument, ship it
  in a client bundle, store it in PostgreSQL, or print it in logs/errors.
- Separate local/fake, testnet/staging, and mainnet database, RPC, signer, and
  wallet configuration. Staging must be unable to address the production
  secret or database through a shared environment group.
- Rewards start in `disabled` mode and the server must not require or parse a
  payout key in that mode. Presence of a key must never enable payouts.
- Activation progresses through disabled, deterministic fake/record-only,
  testnet, and explicit mainnet modes. Mainnet startup requires mutually
  consistent network, expected signer address, fixed reward, per-transfer and
  daily ceilings, database migrations, RPC health, secret source, and an
  operator acknowledgement. Any missing or contradictory value fails closed.
- Provide an immediate operator pause, key-rotation procedure, suspected-leak
  response, database/RPC outage procedure, low-balance and ledger-solvency
  alerts, and a reconciliation command that cannot sign or broadcast new data.
- Add and test an explicit production Content Security Policy and standard
  security headers before exposing the Daily entry. The existing browser
  session token is same-origin-script readable, so XSS prevention remains part
  of the reward boundary. Header choices must be verified inside Nimiq Pay and
  must not assume unsupported cross-origin isolation.

#### User-visible behavior

- Before authorization, show `available`, `paused`, `exhausted`, or
  `temporarily unavailable` without revealing wallet-specific eligibility.
- After authorization, distinguish ineligible/already attempted, reserved,
  match in progress, lost/forfeited, claimable, processing, finalized, and
  manual-review/support states.
- Never say “won NIM” before the authoritative `won` entitlement exists, or
  “paid” before finality. Display the fixed amount and bound recipient in the
  claim confirmation and payout status.
- Provider rejection, database/RPC outage, exhausted rewards, or the kill
  switch must leave Practice immediately available and must not loop native
  wallet approval.

Non-goals: player stakes, deposits, escrow, betting, random rewards,
player-loss-funded payouts, client-authoritative scores/results, automatic
replacement of ambiguous transactions, multiple concurrent signers,
horizontal Render scaling, a claimable token or internal currency, silent
device fingerprinting, proving one wallet equals one human, production
mainnet activation, or moving sponsor funds during autonomous implementation.

Owning roles: `worms_port_network_worker`, `worms_port_compliance_keeper`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification:

- schema/migration tests plus database restart recovery; unique-constraint,
  final-slot, serializable-retry, active-reservation, UTC rollover, expired
  reservation, and ledger-solvency races using at least two independent
  database connections;
- forged result/replay/recipient/amount/network/state-transition requests,
  claim-nonce replay, same-key/same-body idempotency, same-key/different-body
  conflict, duplicate claim, re-authenticated claim recovery, address mismatch,
  lost/forfeited match, reservation churn, rate limits, and depleted pool;
- deterministic fake signer/RPC tests covering insufficient funds, fee reserve,
  wrong signer/network, stale height, provider outage, delayed inclusion,
  macro-block finality, transaction expiry, and invalid external responses;
- crash injection before and after reservation commit, win commit, queue
  commit, signing, signed-byte/hash persistence, first broadcast, ambiguous
  timeout, inclusion, and finality; every restart must resume without losing a
  liability or constructing an unintended second transaction;
- concurrent worker tests proving one logical signer, cooperative advisory-lock
  behavior, database uniqueness as the final backstop, exact-byte rebroadcast,
  and manual review instead of automatic replacement;
- browser coverage for wallet-free Practice, truthful pre-authorization
  availability, account/sign rejection, consumed and unconsumed eligibility,
  expired/cancelled reservation, result-to-claim flow, processing/finalized
  wording, exhausted/paused/outage fallback, re-authentication, and no wallet
  action during an active turn;
- production-header/CSP checks, origin enforcement, request-size bounds,
  structured redacted logs, secret scans across source/build/test artifacts,
  client-bundle inspection, and proof that the sponsor key is not read while
  rewards are disabled;
- exact dependency pins and license review, `npm audit`, compliance, types,
  focused protocol/simulation/identity/reward tests, clean build, built-server
  and Render runtime smoke, complete maintained phone-browser coverage, and a
  read-only security review; and
- one explicitly approved tiny testnet canary followed by stored-hash
  reconciliation and restart recovery. Mainnet funds remain disabled and real
  Android/iOS payout acceptance remains a separate operator/user-run gate.

### WP-014 Autonomous Quality Harness

Status: planned. Depends on WP-011 and WP-013.

Goal: complete automated browser, visual, performance, protocol, abuse, and
reward-security gates. Use isolated browser contexts and deterministic fake
wallets; retain traces, screenshots, diffs, replay seeds, bundle data, and
timing evidence on failure.

WP-014 extends the Playwright installation and launch smoke delivered by WP-005;
it does not introduce the browser runner for the first time.

Owning roles: `worms_port_test_worker`, `worms_port_reviewer`.

Verification matrix: mobile Chromium at 360x640, 390x844, and 412x915;
844x390 landscape; mobile WebKit emulation; low-bandwidth/offline/resume;
desktop only as a debugging fallback. Physical phones are explicitly excluded.

### WP-015 Production Art And Audio

Status: planned. Depends on WP-010 and WP-014 asset gates.

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

### WP-016 Retention And Distribution

Status: planned. Depends on WP-013 and WP-015.

Goal: add a privacy-conscious daily leaderboard, result sharing, Nimiq Pay
deep link, localized essential UI, reward availability messaging, and aggregate
funnel telemetry with disclosure and consent where required.

Owning roles: `worms_port_base_game_worker`, `worms_port_network_worker`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification: first-run under 60 seconds, share/deep-link fallbacks, privacy and
consent cases, locale overflow, depleted-pool clarity, full automated suite.

### WP-017 Deployment And Submission

Status: planned. Depends on WP-014 and WP-016.

Goal: deploy the combined static client and persistent Node/Socket.IO server as
one single-instance Render Web Service in Frankfurt. Use Render Starter for the
public release, with Free permitted only for private development because it may
sleep and cold-start. Include HTTPS, environment validation, health checks,
rollback, secret separation, payout disabled-by-default configuration,
submission copy, screenshots, and walkthrough evidence. Do not enable multiple
instances until authoritative sessions, simulations, AI scheduling, replay,
and reward state have durable shared storage and exactly-once leases.

Owning roles: `worms_port_planner`, `worms_port_network_worker`,
`worms_port_docs_keeper`, `worms_port_reviewer`.

Verification: clean install, audit, compliance, full build, complete automated
suite, production smoke, deep link, disabled/enabled reward configuration, and
rollback rehearsal. Real Android/iOS testing is listed separately as not run;
it does not block completion of the documented autonomous cycle.

## Dependency Order

```text
WP-005 -> WP-006 -> WP-007 -> WP-008 -> WP-009 -> WP-010 -> WP-011 -> WP-011A
WP-011A -> WP-011B -> WP-011C -> WP-011D -> WP-011E (presentation path)
WP-011E -> WP-012 -> WP-013 -> WP-014
WP-010 + WP-014 ------------------------------------------------------------> WP-015
WP-013 + WP-015 ------------------------------------------------------------> WP-016 -> WP-017
```

WP-011 is the first complete playable. WP-011A is its real-device acceptance
stabilization gate. WP-011B is a non-blocking embedded-host capability probe.
WP-011C stabilizes the supported-browser path and proves the Nimiq Pay sideways
fallback. WP-011D makes that fallback the documented temporary default until
the host supplies full-screen game presentation. WP-011E then maximizes the
arena and makes its HUD phase-contextual without changing game authority.
WP-012 inherits that accepted client baseline but keeps identity outside the
default Practice journey; WP-013 is the first production reward entry point.
WP-014 is the automated competition-candidate gate. WP-017 is the
submission-ready repository and deployment.

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
