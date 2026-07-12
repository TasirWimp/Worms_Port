# Development Workflow

Worms_Port should move in small, auditable slices. The main engineering risk is
not only a bug; it is accidentally weakening the license/import boundary while
adding gameplay, assets, or tooling.

## Source Of Truth

Use these files to decide where a change belongs:

- `README.md` for setup, build, and high-level repo status.
- `AGENTS.md` for Codex operating rules and subagent roles.
- `docs/art-direction.md` for product identity, world, character, visual, and
  concept-art boundaries.
- `docs/import-boundary.md` for upstream source roles.
- `docs/asset-review-workflow.md` for third-party asset review.
- `docs/planning/implementation_plan.md` for current slices and role routing.
- `legal/source-manifest.json` for upstream source traceability.
- `legal/asset-manifest.json` for approved product assets.
- `legal/allowed-licenses.json` for asset license policy.
- `legal/dependency-license-overrides.json` for npm package license evidence.

## Required Development Loop

Every non-trivial change should follow this loop:

1. **Plan the slice**
   Define the intended behavior, owning role, affected files, non-goals, and
   import-boundary risk.
2. **Plan the checks**
   Decide whether to run compliance, typecheck, build, audit, smoke tests, or
   manual browser checks.
3. **Implement**
   Keep Turtle-derived code changes separate from asset review and compliance
   changes when practical.
4. **Verify**
   Run the planned checks and record results.
5. **Update docs/manifests**
   Update source, asset, attribution, planning, or workflow docs when the
   change alters repo truth.
6. **Summarize**
   Report files changed, checks run, skipped checks, and residual risk.

## Autonomous Slice Loop

For WP-005 and later, the orchestrating agent applies the required loop without
waiting for routine implementation decisions:

1. Read the execution pointer in `docs/planning/implementation_plan.md` and
   select only the named unblocked work package.
2. Record the starting commit, worktree status, affected ownership boundaries,
   dependency-lock hash when relevant, planned checks, and deterministic seeds.
3. Establish a green baseline for the selected checks. A red baseline is
   reported separately and is not attributed to the candidate patch.
4. Implement one bounded refinement in an isolated branch or worktree.
5. Run a fail-fast funnel: compliance, types, focused tests, clean build, built
   smoke, protocol/browser/visual/performance checks as applicable.
6. Ask the implementing agent to review its own change, then request the
   relevant test, compliance, asset, and read-only reviewer roles.
7. On failure, reproduce the smallest case, classify it, make one correction,
   rerun the failing check, then rerun the selected funnel.
8. Stop after three corrections for the same failure signature and report the
   blocker without weakening a threshold or guardrail.
9. Persist sanitized evidence, update source-of-truth documents, commit the
   bounded slice, and advance the execution pointer only after all gates pass.

Never auto-approve screenshot baselines, asset licenses, attribution omissions,
brand permissions, payment exceptions, security exceptions, or real-fund
activation.

## Verification Funnels

The planned scripts may evolve during WP-005, but their responsibilities are:

```text
verify:fast
  compliance -> types -> unit -> deterministic simulation

verify:runtime
  clean build -> built smoke -> protocol -> browser phone matrix

verify:full
  verify:fast -> verify:runtime -> visual -> performance -> read-only review
```

Built smoke tests must rebuild or prove that output metadata matches the current
source and lockfile. Passing against stale ignored build output is not evidence.

Browser automation covers phone-sized Chromium and WebKit, portrait and
landscape, touch input, safe areas, resize, slow/offline networking,
background/resume, fake-wallet approval/rejection, and deterministic visual
states. Real Android and iOS testing is outside the autonomous cycle. Every
completion summary must state that it was not run rather than imply device
coverage from emulation.

### Playwright Bootstrap

WP-005 must establish that Playwright works in this repository before later
work packages depend on it. Installing only the npm package or printing a
version is insufficient. Completion requires actual Chromium and WebKit
launches against a freshly built local server and a phone-sized smoke journey.

The checked-in Playwright configuration must:

- use the repository-local `@playwright/test` dependency,
- start or reuse only a test-owned server on an isolated port,
- use deterministic locale, timezone, viewport, device scale factor, and
  reduced-motion settings where visual evidence is captured,
- fail on uncaught page errors and unexpected console errors,
- assert that the Phaser canvas exists and contains nonblank pixels,
- retain trace and screenshot evidence on failure,
- keep caches, reports, videos, traces, and screenshots out of `assets/`, and
- provide Chromium and WebKit phone projects without system-browser executable
  overrides.

WP-005 provides browser launch and application smoke coverage. WP-013 expands
that foundation into the full viewport, visual-regression, network, resume,
fake-wallet, performance, and multiplayer-context matrix.

## Asset Generation Loop

Production art follows this fail-closed sequence:

```text
approved brief -> quarantined concept master -> controlled refinement
  -> animation/export -> deterministic normalization -> in-engine phone captures
  -> art/IP/provenance review -> manifest approval -> assets/ promotion
```

All Knotkin production briefs use
`docs/images/art-direction/knotkin-class-lineup-concept.png` as the canonical
visual reference. The image remains documentation-only: it cannot be cropped,
traced, or shipped directly. It may be supplied to an approved production tool
as the user-selected creative conditioning reference only when the tracked path
and SHA-256 are recorded in the generation evidence. This does not resolve
Nimiq brand or geometry rights. A brief must record all other inputs and
explicitly block Sorcerers, Worms/Team17, realistic firearms, unlicensed logos,
and recognizable third-party characters.

Built-in image generation is used for rights-safe concept masters, ComfyUI for
reproducible controlled refinement after every model component passes license
review, and AutoSprite for animation/export from an approved master. Record
prompts, negative constraints, workflow JSON and hash, seeds, model and custom
node versions and licenses, service/job IDs, parent/output hashes, postprocess
configuration, and reviewer identity.

### Production Decomposition

The lineup concept contains enough information to begin production, but it is a
composited front-facing scene. It must be decomposed through newly generated
assets rather than cropped into the game.

Character production starts with four isolated 512x512 RGBA masters: Wizard,
Thief, Warrior, and a Loomkeeper opponent variant. Each master shows one full
Knotkin facing right in an orthographic-like side view on transparency. The
feet share a stable baseline, the entire silhouette remains inside motion-safe
padding, and there is no scenery, text, framing, or second character. Exactly
two bead eyes, no mouth, Calling costume topology, body proportions, palette,
lighting direction, and handedness must remain stable.

Relics and effects are separate transparent asset families. At minimum this
includes Threadball, the two additional gameplay-approved Relics, their
phone-readable icons, projectiles, trails, impacts, Stitching damage,
Unraveling, and Prize Loom reward effects. A Relic should remain separate from
the character atlas when practical. If a pose must bake in a Relic, that atlas
is a separately named derivative with its own parent hashes and manifest entry.

The first Patch is not one flattened painting. Produce:

- a scalable sky or fabric fill,
- separate cotton-cloud and distant-decoration layers,
- separate banners, loom structures, and decorative props,
- repeatable terrain top, edge, and interior materials,
- optional foreground dressing that never controls collision.

The deterministic terrain silhouette and collision mask remain code-owned game
data. Decorative background pixels cannot define authoritative terrain or be
used as a collision mask. Terrain materials must tolerate circular destruction
without revealing baked scenery or obvious seams.

Calling portraits and icons are derived from approved isolated masters, not
cropped from `knotkin-class-lineup-concept.png`. Audio uses a separate brief,
generator/source evidence, license review, normalization, and manifest path; a
visual MCP output is never treated as audio provenance.

### MCP Handoff

Use this exact handoff for each visual asset family:

1. **Brief:** assign an asset-family ID, intended runtime path, dimensions,
   animation or layer inventory, blocked motifs, and acceptance checks. Record
   the canonical concept path and SHA-256 plus every additional input.
2. **Image generation:** create a new isolated master from the approved brief
   and canonical reference. Store the untouched result only in ignored
   quarantine and record the full prompt, output ID, date, and SHA-256.
3. **Master review:** reject anatomy, eye count, mouth, silhouette, costume,
   lighting, perspective, equipment, alpha, or third-party similarity drift.
   Only a reviewed master proceeds.
4. **ComfyUI refinement:** use only when every checkpoint, VAE, LoRA,
   ControlNet, embedding, upscaler, and custom node has approved commercial-use
   evidence. Record workflow JSON and hash, seed, sampler, scheduler, steps,
   CFG, dimensions, denoise, component names, versions, licenses, and hashes.
   If the model inventory is not approved or the server is unavailable, skip
   refinement or stop; do not substitute an unrecorded local workflow.
5. **AutoSprite animation:** upload the approved isolated character master,
   reuse one character ID for its Calling, request the normative animation
   states, and record character, pose, job, video, and spritesheet IDs plus all
   downloaded hashes. If AutoSprite is unavailable, stop animation production
   rather than silently changing generators.
6. **Deterministic normalization:** preserve the untouched master, normalize
   runtime frame size, pivot, baseline, padding, alpha, naming, timing, and
   atlas metadata through a versioned script and configuration hash.
7. **In-engine staging:** load quarantined candidates through a test-only path,
   render deterministic gameplay states, and capture the automated phone
   viewports. Staging cannot place unapproved files in product `assets/`.
8. **Review and refinement:** run art, animation, IP, provenance, canvas,
   visual-diff, and phone-readability checks. Permit at most three scoped
   retries for one failure signature; rejection does not relax the contract.
9. **Promotion:** add exact final hashes and evidence to the manifest, update
   attribution when required, copy only approved runtime files into `assets/`,
   then run compliance, build, browser smoke, and relevant visual tests.

### Animation Contract

Every first-release character atlas uses the same state names and baseline:

| State | Frames | Loop | Required behavior |
| --- | ---: | --- | --- |
| `idle` | 8-12 | yes | Minimal breathing/thread motion; no silhouette drift |
| `move` | 8-12 | yes | Stable baseline and readable short stride |
| `jump_start` | 3-5 | no | Leaves the ground from the idle pose |
| `fall` | 2-4 | holdable | Stable airborne pose without scale drift |
| `land` | 3-5 | no | Returns exactly to the idle baseline |
| `aim_low` | 1-3 | holdable | Low trajectory pose |
| `aim_mid` | 1-3 | holdable | Mid trajectory pose |
| `aim_high` | 1-3 | holdable | High trajectory pose |
| `fire` | 6-10 | no | Names the exact gameplay release frame |
| `hit` | 4-6 | no | Cotton compression without anatomy mutation |
| `unravel` | 8-12 | no | Non-graphic defeat ending in thread and fluff |
| `victory` | 8-12 | yes | Compact celebration that stays inside padding |

Generate right-facing source frames. Runtime mirroring is allowed only after a
handedness and costume-asymmetry review. Otherwise produce and track a separate
left-facing derivative. Start from 512x512 masters and normalize the first
runtime candidate to 192x192 RGBA frames with a pivot at 50% horizontal and 88%
vertical. Changing frame size, pivot, or baseline requires recorded in-engine
phone-readability evidence and an update to the asset-family brief.

### Runtime Naming And Placement

Use stable kebab-case asset-family IDs and group approved files by role:

```text
assets/characters/knotkin/{wizard,thief,warrior,loomkeeper}/
assets/relics/<relic-id>/
assets/effects/<effect-id>/
assets/environment/patch-01/{background,props,terrain}/
assets/ui/{callings,relics,reward}/
assets/audio/{combat,result,reward}/
```

Atlas frame names follow `<calling>/<state>/<zero-padded-frame>`. The atlas
records frame rectangles, pivots, durations, loop hints, and the release frame
for `fire`. Source masters, service downloads, rejected outputs, videos,
workflows, and intermediate frames remain in ignored quarantine rather than the
runtime tree.

### Asset Acceptance

Before promotion, automated and reviewer evidence must establish:

- exactly two eyes, no mouth, stable anatomy, costume, palette, lighting, and
  equipment identity across every character frame,
- stable frame dimensions, ground baseline, pivot, alpha edges, visual scale,
  and no disconnected alpha fragments or halos,
- valid loops and transitions with no eye duplication, hand/equipment swapping,
  flicker, clipping, or unintended left/right changes,
- complete Phaser atlas loading with every required state and release frame,
- readable character, Relic, trajectory, projectile, and impact silhouettes at
  360x640, 390x844, 412x915, and 844x390,
- no collision dependency on decorative art and no important background detail
  hidden by portrait cropping, safe areas, or HUD,
- expected/current/diff captures for deterministic scenes with no automatic
  baseline acceptance,
- complete parent/output hashes, generator and service records, model-component
  licenses, postprocess configuration, reviewer identity, manifest entry, and
  attribution duties.

No generated output can promote itself into `assets/`. Failed or exhausted
iterations remain quarantined.

## Clean-Room Reference Loop

Only a reference-observer role may inspect Sorcerers. It produces a
behavior-only record with observable inputs, outputs, transitions, and timing.
The implementation worker cannot access Sorcerers or its quarantine and uses
only the frozen record, the MIT Turtle base, and independent sources. A separate
reviewer may compare both sides but returns only bounded contamination findings.

The import gate is supporting evidence, not proof that GPL expression was not
copied. Completion also requires the clean-room record, implementation
declaration, similarity review, and relevant behavioral tests.

## Mobile Touch Reference Protocol

WP-009 uses two pinned MIT source references plus current standards documents.
They provide implementation ideas, not a UI to copy unchanged.

### Pinned Sources

**Phaser examples**

- Repository: `https://github.com/phaserjs/examples`
- Commit: `6d23cdeb99c956ce72993904ad0f869c06fc6b3b`
- License evidence: the pinned README declares example source code MIT and
  explicitly excludes its assets from reuse.
- Approved paths:
  - `public/3.86/src/input/dragging/drag horizontally.js`
  - `public/3.86/src/input/multitouch/two touch inputs.js`
  - `public/3.86/src/scalemanager/orientation check.js`
  - directly required Phaser source/API documentation only.

Use these examples to confirm Phaser's interactive drag events, axis clamping,
additional pointers, `Phaser.Scale.FIT`, and orientation-change lifecycle. The
examples target Phaser 3.86; verify every API against the project's Phaser 3.90
types and documentation before implementation. Do not use their images, audio,
fonts, skins, or other example assets.

**Rex Rainbow Phaser notes and plugins**

- Repository: `https://github.com/rexrainbow/phaser3-rex-notes`
- Commit: `12d1ed131105e47515fc429ef0ba8abc93fb025f`
- License evidence: the pinned repository `LICENSE` is MIT.
- Approved paths:
  - `examples/virtualjoystick/float.js`
  - `examples/virtualjoystick/drag-vector.js`
  - `examples/virtualjoystick/virtualjoystick+button.js`
  - `plugins/utils/input/VectorToCursorKeys.js`
  - `plugins/input/virtualjoystick/VirtualJoyStick.js`
  - `plugins/input/toucheventstop/TouchEventStop.js`
  - directly required helper source only.

Use these sources to understand floating control anchoring, horizontal-only
direction modes, distance thresholds, normalized vector force and angle,
enable/disable cleanup, and stopping control events from reaching the
battlefield. Do not import the plugin or its visual assets by default. Prefer a
small typed product-owned adapter; a dependency or copied fragment requires a
separate package/license decision and source-manifest update.

**Last One Flying applied game**

- Repository: `https://github.com/colinkiama/last-one-flying`
- Commit: `f1e7501d47777621aab67da4db166b2e59c25987`
- License evidence: the pinned `LICENSE.md` and `package.json` declare MIT.
- Approved paths:
  - `src/scenes/Battle.js`
  - `src/systems/touchControlsSystem.js`
  - `src/systems/movementSystem.js`
  - `src/systems/combatSystem.js`
  - `src/scenes/HUD.js`
  - `src/constants/touch.js`
  - directly required source-only helpers.

This is the primary applied-game reference. It demonstrates dual joystick
creation inside a real battle scene, a small touch-control abstraction consumed
by movement and combat systems, runtime touch-control visibility, a parallel HUD
scene, pause/resume events, and scene-shutdown unsubscription. Use those
ownership and lifecycle boundaries as design evidence.

Do not copy its fixed joystick coordinates, continuous real-time control model,
`up&down` movement mapping, vendored Rex build, visual/audio assets, or
pointerdown/pointerup-only pressed-state logic. It does not establish the
release-outside, `pointercancel`, safe-area, orientation-reflow,
server-authority, aim-lock, or explicit-fire guarantees required here. These
gaps become regression cases rather than inherited behavior.

**Acquati focused integration**

- Repository:
  `https://github.com/Acquati/touchscreen-joystick-for-phaser-3`
- Commit: `9a535e3a2fc5feb1d15e24d730682188ace194b3`
- License evidence: the pinned `LICENSE` and `package.json` declare MIT.
- Approved paths:
  - `src/scenes/MainScene.ts`
  - `package.json`
  - directly required TypeScript configuration only.

This is the focused integration reference. It demonstrates retrieving the Rex
plugin from a Phaser scene, creating a fixed visual pad, reading its cursor-key
projection, applying a force threshold, and feeding ordinary Phaser movement.
Use it to understand the smallest integration surface and TypeScript boundary.

Do not copy its demo assets, fixed 8-direction layout, old Phaser 3.55/Rex
versions, per-direction keyboard-state mutation, debug text, or frame-by-frame
velocity ownership. NIMble Knots translates pointer vectors into typed,
quantized gameplay intent and keeps keyboard fallback separate from touch state.

### Applied Reference Hierarchy

Use reference material in this order:

1. Current Phaser 3.90 API, W3C Pointer Events, and WebKit safe-area behavior.
2. The NIMble Knots control contract and server-authoritative command model.
3. Phaser and Rex focused source examples for individual mechanics.
4. Last One Flying for complete scene/system ownership and lifecycle lessons.
5. Acquati for the smallest TypeScript joystick integration surface.

An applied project never overrides a newer API or product invariant. The worker
must record which exact files were inspected and which lessons were adopted,
modified, or rejected. By default no reference code is copied. Any copied MIT
fragment requires an exact-path source-manifest update, preserved notice,
similarity review, and focused test proving why a local implementation was not
preferable.

**Authoritative API and browser behavior**

- Phaser 3.90 Input:
  `https://docs.phaser.io/phaser/concepts/input`
- Phaser 3.90 Input Events:
  `https://docs.phaser.io/api-documentation/3.90.0/namespace/input-events`
- Phaser Scale Manager:
  `https://docs.phaser.io/phaser/concepts/scale-manager`
- W3C Pointer Events:
  `https://www.w3.org/TR/pointerevents/`
- WebKit safe-area guidance:
  `https://webkit.org/blog/7929/designing-websites-for-iphone-x/`

The API and standards sources override an older example when behavior differs.
Use scoped `touch-action` to prevent browser panning/zooming on the game control
surface; canceling pointer events alone is not sufficient. Use safe-area insets
for control placement and support orientation reflow rather than forcing the
user to rotate.

### NIMble Knots Adaptation

The reference patterns are adapted into a turn-based single-pointer control
model:

1. **Movement zone:** a floating horizontal pad can anchor only inside the
   lower-left control zone. Its radius is layout-relative, its dead zone starts
   at 18% of radius, and its x force is normalized to `[-1, 1]`. The client
   quantizes that value into bounded movement intent; it never sends pointer
   coordinates or client-owned position.
2. **Aim zone:** a lower-right pad owns one pointer from down through release or
   cancellation. Vector angle controls trajectory and clamped vector magnitude
   controls power. Shared deterministic simulation renders the preview.
3. **Aim release:** ordinary release freezes the selected angle/power. It does
   not fire. Release outside, `pointercancel`, lost focus, hidden document,
   scene pause/shutdown, resize, or orientation change cancels the gesture.
4. **Fire:** a separate minimum 48 CSS-pixel button submits one idempotent Fire
   command only from the `aim_locked` state. Duplicate taps, stale turns, or a
   suspended scene cannot submit another command.
5. **Relics and commands:** Relic selection, pause, retry, and confirmations use
   large tap targets. Swipe, pinch, long-press, hover, and multi-finger chords
   are not required for the competition release.
6. **Camera:** automatic active-Knotkin and projectile framing is the default.
   Optional battlefield panning can be added only when no control owns the
   pointer and it cannot alter simulation state.
7. **Lifecycle:** the input adapter has explicit `idle`, `moving`, `aiming`,
   `aim_locked`, and `suspended` states. Every cancellation path clears vectors,
   visual pressed states, timers, and pointer ownership before returning to a
   safe state.
8. **Wallet interruption:** opening a Nimiq Pay approval dialog suspends input
   and turn timing. Resume requires a fresh pointer-down; a pre-dialog contact
   can never continue or fire afterward.

The implementation may tune the 18% dead zone or layout-relative control radius
only through recorded phone-emulation evidence. It must not tune by copying
constants from a reference implementation.

### Reference Verification

Playwright coverage must exercise:

- touch-only completion at 360x640, 390x844, 412x915, and 844x390,
- movement below, at, and above the dead-zone threshold,
- minimum and maximum aim/power clamps and deterministic preview agreement,
- release inside, release outside, pointer cancellation, duplicate tap, blur,
  hidden/resume, resize, and orientation changes,
- no shot on aim release or any cancellation path,
- exactly one command from one valid Fire activation,
- no browser scrolling, zooming, text selection, or control-event leakage into
  the battlefield,
- safe-area separation, minimum target sizes, and no overlap between movement,
  aim, Fire, Relic, wallet, and HUD surfaces,
- mouse input only as a development fallback; no hover or keyboard dependency.

Store traces and screenshots as test evidence outside `assets/`. Physical
Android/iOS validation remains outside the autonomous cycle.

## Plan Change Protocol

If implementation shows that the plan is wrong or risky:

1. Stop expanding scope.
2. State the issue plainly.
3. Classify the risk:
   - import-boundary risk,
   - asset-license risk,
   - dependency-license risk,
   - build/runtime architecture issue,
   - gameplay/scope change,
   - test strategy gap.
4. Update the relevant source-of-truth document before or in the same commit as
   the implementation.
5. Ask the user before continuing if the change would import new GPL/unclear
   material, change the project license, or materially expand scope.

## Subagent Coordination

Use `.codex/agents/` roles as scoped workers. They coordinate through repo
artifacts:

- planning docs define work slices,
- manifests record source and license evidence,
- commits preserve reviewed changes,
- completion summaries name affected future roles.

No role may override the Turtle/Sorcerers boundary.

## Definition Of Done

A slice is done when:

- it matches the requested behavior or documented plan,
- the import boundary still passes,
- relevant manifests/docs are current,
- planned checks have run,
- `npm run build` passes for source/tooling changes,
- final reporting names remaining risks.
