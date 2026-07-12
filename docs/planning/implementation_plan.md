# Implementation Plan

This plan adapts the NimiRun_CodeRepo subagent concept to Worms_Port. The goal
is scoped coordination around the current repo risks: MIT base code, Sorcerers
quarantine, commercial-use asset traceability, and a modern buildable
Phaser/Socket.IO stack.

## Execution Pointer

- Active target: mobile-first single-player Nimiq Pay competition release.
- Next work package: **WP-011 Complete Practice Clash**.
- Last completed work package: **WP-010 Phone Combat Scene**.
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
- The current runtime has a session-bound lobby/reconnect shell plus a separate
  portrait-first combat preview over the validated v2 snapshot/command
  boundary. WP-011 still owns the complete live practice lifecycle.
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
- Complete practice lifecycle, the expanded phone matrix, and visual
  regression remain.

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
sixteen built-browser cases cover the documented WP-010 matrix; the legacy
smoke suite now runs eight cases over the same projects. The deterministic
`combat-preview` fixture is intentionally not the WP-011 live practice flow.

### WP-011 Complete Practice Clash

Status: planned. Depends on WP-008, WP-009, and WP-010.

Goal: deliver an immediate, unlimited, non-rewarded player-versus-Loomkeeper
match with onboarding, results, challenge creation, actual retry behavior,
authoritative practice pause semantics, and deterministic local/server modes.

Owning roles: `worms_port_base_game_worker`, `worms_port_network_worker`,
`worms_port_test_worker`.

Verification: complete touch journey on the browser phone matrix, two full
golden matches, result consistency, reconnect/resume, visual evidence, build.

### WP-012 Nimiq Pay Identity Adapter

Status: planned. Depends on WP-006 and WP-011.

Goal: isolate the official Mini App SDK behind an adapter for initialization,
language, wallet account selection, signed challenges, rejection, timeout, and
optional consent-based device identity. Practice cannot depend on the provider.

Owning roles: `worms_port_network_worker`, `worms_port_compliance_keeper`,
`worms_port_test_worker`.

Verification: fake-provider approve/reject/timeout tests, nonce expiry, wrong
address/network, replay rejection, package audit, compliance, build.

### WP-013 Sponsored Daily Challenge

Status: planned. Depends on WP-007, WP-008, WP-009, and WP-012.

Goal: implement fixed reward configuration, eligibility checks, short-lived
reward reservation, server-authoritative result verification, idempotent claim
queue, daily ceiling, exhausted-pool disclosure, and payout kill switch.

Owning roles: `worms_port_network_worker`, `worms_port_compliance_keeper`,
`worms_port_test_worker`, `worms_port_reviewer`.

Verification: forged result, nonce replay, duplicate claim, reservation expiry,
concurrent winners, depleted pool, cancellation, provider outage, delayed
confirmation, and secret-scan tests. Real funds remain disabled by default.

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
WP-005 -> WP-006 -> WP-007 -> WP-008 -> WP-009 -> WP-010 -> WP-011
WP-011 -> WP-012 -> WP-013 -> WP-014
WP-010 + WP-014 ----------------------------------------------------> WP-015
WP-013 + WP-015 ----------------------------------------------------> WP-016 -> WP-017
```

WP-011 is the first complete playable. WP-014 is the automated competition
candidate gate. WP-017 is the submission-ready repository and deployment.

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
