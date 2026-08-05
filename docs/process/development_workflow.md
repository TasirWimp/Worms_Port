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

### Work-Package Evidence

Every autonomous package has a tracked JSON record under `docs/evidence/` that
conforms to `legal/work-package-evidence.schema.json`. Create it before the
first edit and record the starting commit, branch, initial worktree state,
dependency-lock SHA-256, owning roles, scope, non-goals, planned checks,
deterministic seeds or an empty list, and whether Sorcerers observation was
used. `npm run check:work-packages` validates these records.

Before marking a record complete, add every check result, independent review,
skipped check, and residual risk. Generated traces, videos, reports,
screenshots, caches, and raw logs stay in ignored `test-results/` or
`playwright-report/`. Only compact sanitized facts belong in the tracked
record; never persist secrets, wallet material, device identifiers, or raw
quarantine content.

Never auto-approve screenshot baselines, asset licenses, attribution omissions,
brand permissions, payment exceptions, security exceptions, or real-fund
activation.

## Verification Funnels

The planned scripts may evolve during WP-005, but their responsibilities are:

```text
verify:fast
  compliance -> types -> unit -> deterministic simulation

verify:runtime
  clean build -> built smoke

verify:quality
  fresh build -> bundle/identity/reward security -> full browser matrix -> performance

verify:full
  verify:fast -> verify:runtime -> verify:quality -> explicit PostgreSQL status -> audit
```

Built smoke tests must rebuild or prove that output metadata matches the current
source and lockfile. Passing against stale ignored build output is not evidence.

Browser automation covers phone-sized Chromium and WebKit, portrait and
landscape, touch input, safe areas, resize, slow/offline networking,
background/resume, fake-wallet approval/rejection, and deterministic visual
states. Real Android and iOS testing is outside the autonomous cycle. Every
completion summary must state that it was not run rather than imply device
coverage from emulation.

### Validated Session Protocol

WP-006 establishes the versioned Socket.IO boundary used by later simulation,
identity, and reward work:

- `v1:session.open` creates or resumes a session with a rotated 32-byte
  base64url bearer token. The server stores only SHA-256 digests; a bounded
  previous-token recovery window protects reconnects whose rotation
  acknowledgement was lost, and only while no replacement socket is active.
  Socket.IO IDs never authorize a player.
- `v1:challenge.create`, `v1:command.submit`, `v1:challenge.pause`, and
  `v1:challenge.leave` accept one strict object plus a required acknowledgement
  callback. Responses carry protocol version, server time, request ID, and
  typed success/error data.
- Practice creation and the separate WP-013 Daily Challenge lifecycle are
  available. Rewards remain `disabled` by default; enabled modes require
  verified WP-012 identity and a durable PostgreSQL ledger.
- Per-session sequence and request-ID replay caches make exact duplicates
  idempotent and reject conflicts, stale commands, and gaps before WP-007 adds
  simulation semantics.
- Socket.IO transport payloads are capped at 16 KiB and event payloads at
  8 KiB. Origin, event-rate, invalid-input, unauthenticated-open, reconnect,
  challenge, and session timeouts fail closed.
- Transient disconnects preserve lobby/game membership through the reconnect
  grace period. Expiry performs authoritative cleanup, while challenge expiry
  emits one typed terminal result and retains a bounded closed tombstone.

The browser keeps the bearer token in `sessionStorage`, never cookies or URLs.
This avoids ambient cookie authority but remains readable to same-origin
script, so CSP/XSS hardening remains a deployment and later quality-harness
concern. The legacy lobby UI is a temporary strict adapter bound to the server
session; its old caller-supplied game identity endpoint is removed.

### Complete Practice Lifecycle

WP-011 makes the default phone journey a live server-backed Practice Clash.
The deterministic `combat-preview` route remains a test fixture and is not an
offline product mode. Calling onboarding, protocol/session ownership, combat,
and result presentation remain separate typed responsibilities.

- The live adapter serializes one mutation at a time and owns request IDs,
  acknowledgement correlation, the server-provided sequence cursor, strict
  schema parsing, listener cleanup, and bounded retry of an identical request
  after acknowledgement timeout.
- Challenge snapshot revision is monotonic across simulation and lifecycle
  changes. The client rejects stale or conflicting same-revision snapshots;
  local previews and delayed events cannot replace newer authority.
- Disconnect suspends all combat input. Session resume consumes the complete
  snapshot and next sequence without replaying speculative commands. Initial
  resume snapshots/results are buffered during bootstrap so a reload cannot
  miss authority emitted alongside token rotation.
- Retry consumes an orderly leave when the challenge is active, suppresses its
  expected delayed `left` event, and creates a fresh challenge. Terminal results
  are deduplicated by challenge, revision, and outcome.
- `v1:challenge.pause` is practice-only, idempotent, session-authorized, and
  sequence checked. It is accepted only during the player's
  `awaiting_command` phase. Accepted pause state appears in every challenge
  snapshot, suspends coordinator tick advancement, persists over reconnect,
  and rejects gameplay commands until resume. Overall expiry remains active.
- A process restart may lose the in-memory match. A replacement session clears
  the old active marker and exposes a fresh-Practice recovery action; durable
  restart recovery remains outside WP-011.

### Real-device Gameplay Presentation

WP-011A keeps protocol truth and presentation state separate. The newest valid
snapshot is accepted immediately for sequencing and reconnect correctness, while
a bounded client queue presents accepted revisions in causal order. Presentation
may interpolate an authoritative movement or reveal an authoritative projectile
trace progressively; it must never invent a command, collision, damage value,
terrain mutation, result, or replay hash. Gameplay controls stay disabled until
the queued presentation reaches the accepted state. Reconnect may cancel the
queue and snap to the newest complete authoritative snapshot.

Each new challenge must reset scene-local transition, result, acknowledgement,
aim, projectile, and presentation state. A terminal result waits until its final
snapshot has been presented, then appears exactly once for that challenge. This
rule applies equally to the first match, Play Again, and in-scene Retry.

Movement drag strength maps to at most four ordinary authoritative movement
commands; it does not introduce a new simulation command or change replay rules.
Accepted movement clears the locked aim and requires a new aim before Fire.
Advisory trajectories exist only for the current legal player aim and clear on
movement, Fire, turn change, disconnect, result, and challenge replacement.

Phone layout uses the current `visualViewport` dimensions plus safe-area insets,
not a minimum synthetic viewport height. Compact landscape must keep battlefield,
HUD, movement, aim, Relics, Fire, Pause, and Retry visible and non-overlapping
when embedded browser chrome reduces the usable height. Resize, rotation, and
visual-viewport changes cancel transient pointer ownership.

### Embedded Full-screen And Sideways Presentation

Landscape combat may offer a standard Fullscreen API request from an explicit
player tap. Request `navigationUI: 'hide'`, but do not request an orientation
lock. Never auto-enter full screen and never make Practice depend on it.
Capability absence or rejection must preserve the compact `visualViewport`
layout and provide truthful feedback.

CSS, viewport metadata, and PWA display settings do not control Nimiq Pay's
native URL ribbon or Android system bars. A physical Nimiq Pay device check is
therefore the acceptance authority for WP-011B; if native chrome remains, record
the host limitation and raise a Nimiq Pay feature request rather than adding an
undocumented bridge or browser-specific spoof.

WP-011B device acceptance established an additional supported-browser rule:
full-screen entry must not lock landscape. Physical rotation must continue to
select the existing portrait or landscape composition. Because document full
screen survives Phaser scene transitions, every terminal result screen reached
while it is active must expose a visible **Exit full screen** action; returning
to default browser mode cannot depend on a combat-scene control that no longer
exists. WP-011C owns these corrections.

WP-011C introduced `sideways` as a host-compatibility mode. It is active only
when the browser reports a portrait viewport and must use
swapped logical game dimensions, rotate the complete game surface, remap
safe-area edges, and inverse-map pointer coordinates. `sideways=1` and
`sideways=right` rotate clockwise; `sideways=left` rotates counter-clockwise.
If the browser becomes landscape, the transform must disengage immediately to
avoid double rotation.

WP-011D makes clockwise sideways the temporary default when no `sideways`
query is present. `sideways=off` must retain the normal responsive composition
for accessibility, diagnostics, other hosts, and future migration. Keep the
default workaround clearly documented with its prerequisite (disable Android
auto-rotate while portrait), alternate direction, opt-out, and removal trigger.
Remove the default only after a documented Nimiq Pay full-screen game mode or
reliable standard/native capability is verified to remove host chrome. Viewport
orientation still does not reveal physical device attitude, and the web app
must not claim it can change Android auto-rotate or Nimiq Pay chrome.

### Arena-first Contextual Combat HUD

WP-011E replaces permanently reserved status and control bands with a
maximum-area 16:9 arena and predictable overlays. The battlefield consumes the
mathematical maximum rectangle inside the safe `visualViewport`; no persistent
HUD row or control column may reduce its renderer dimensions.

The implementation target at the 844 by 390 Samsung acceptance viewport is at
least 660 by 370 CSS pixels; the delivered candidate computes approximately
665 by 374 compared with the prior approximately 534 by 301 arena.

Keep only the turn/timer pill, actor-local exact Stitching bars, selected Relic,
Pause, and the phase-relevant touch actions visible. Movement and aim use stable
left/right activation zones with floating pad art at the touch origin. Fire
stays a separate explicit button after aim lock. Relic selection expands from a
single selected-Relic chip, and Retry belongs in the Pause sheet rather than the
live-fire surface.

Visibility follows presentation state: player decision exposes command inputs;
aim lock emphasizes explicit Fire; player and Loomkeeper presentations fade and
disable all command inputs; pause and reconnect use modal state; terminal state
destroys the combat overlay in favor of the result scene. Controls may fade or
expand at fixed anchors but must not jump between phases. Reduced motion removes
the fade while retaining the same state sequence.

This is a presentation and input-geometry change only. It must preserve current
simulation commands, replay hashes, server authority, pointer cancellation,
safe-area handling, full-screen behavior, all three sideways modes, at least
48-pixel buttons, at least 96-pixel pad activation diameter, non-color-only
state, and accessible exact values. The detailed wireframe, phase table, target
metrics, implementation slices, and verification matrix live in
`docs/planning/implementation_plan.md` under **WP-011E Arena-first Contextual
Combat HUD**.

### Deterministic Artillery Ruleset

WP-007 establishes `nimble-knots-artillery-v1` as a replay ABI. Later balance
changes must introduce a new ruleset identifier rather than silently changing
the constants used by existing replay evidence.

- The shared model is Phaser-independent. Positions, velocities, Stitching,
  terrain cells, tick cursors, aim, power, movement budgets, and damage are
  bounded integers. Authoritative transitions do not use `Math.random`,
  wall-clock timestamps, floating deltas, or Phaser physics.
- A uint32 seed deterministically generates a 128 by 72 packed terrain mask.
  Decorative terrain pixels never define collision. Threadball deformation
  only clears cells inside a bounded integer circle.
- Movement resolves one bounded quantum. Aim locks integer angle and power;
  Fire then resolves every swept projectile step, first collision, terrain
  deformation, radial damage, settling, victory, and turn transition before
  acknowledging the command.
- One central coordinator advances timeout ticks. Replay records store those
  tick advances and accepted commands, never wall time, Socket.IO IDs, bearer
  tokens, request IDs, or presentation data.
- SHA-256 hashes cover canonical simulation state, including seed/RNG cursor,
  tick, turn, actors, terrain, aim, projectile summary, and terminal state.
  Server timestamps and challenge expiry metadata are excluded.
- The protocol sequence is the transport order. `expectedTurn` is the gameplay
  precondition that prevents a delayed command from executing during a later
  turn. A well-formed but illegal gameplay command consumes its transport
  sequence while leaving simulation state and replay unchanged.
- Reconnect emits the complete current authoritative snapshot and state hash.
  Independent replay reconstruction must match that hash at every committed
  checkpoint.
- Turn-limit completion, projectile lifetime, replay length, terrain work, and
  snapshot size all have hard bounds. WP-007 supplies the Loomkeeper's legal
  deterministic actor boundary.

### Deterministic Loomkeeper Policy

WP-008 establishes `nimble-knots-loomkeeper-v1` as an independently designed,
Phaser-free decision policy layered on `nimble-knots-artillery-v1`.

- Candidate evaluation calls only `applySimulationCommand` on detached state
  clones. It does not mutate authoritative state, consume its RNG cursor, or
  write speculative candidates to replay.
- Gentle, standard, and sharp profiles disclose fixed candidate and aim-error
  limits. All share the same movement, Threadball, physics, health, damage,
  collision, and turn rules as the player. Practice is fixed to standard until
  a later UI explicitly scopes difficulty selection.
- Canonical enumeration and strictly-greater integer scoring provide the tie
  break. Policy entropy derives only from seed, RNG cursor, turn, and fixed
  salts; wall time and ambient randomness are forbidden.
- A decision evaluates at most 256 candidates and 3,072 public transitions,
  then emits at most eight movement commands, one Threadball selection, one
  aim, and one final fire command.
- The session registry rechecks challenge status, state hash, revision, active
  actor, and turn before committing a plan. Per-challenge pending/running guards
  make duplicate requests and timeout scheduling idempotent.
- Player turns accept at most sixteen mutating commands, and Fire is rejected
  unless replay capacity can reserve the full eleven-command Loomkeeper bound.
  The selected plan is capacity-checked before its first authoritative command,
  so replay exhaustion cannot strand a partially committed AI turn.
- Configurations that enable automated Loomkeeper turns require at least 512
  replay records. Smaller caps are accepted only when automation is explicitly
  disabled for isolated replay-limit tests.
- Every selected Loomkeeper command is stored in the normal coordinator replay.
  Reconstruction uses those records and never needs to rerun historical policy
  search.

The turn driver remains in-process with the WP-007 coordinator. A durable
multi-instance deployment still requires shared state, exactly-once turn
leases, and cross-instance event delivery.

### Relic Ruleset V2

WP-009 introduces `nimble-knots-artillery-v2`; v1 constants and canonical
replay hashes remain unchanged. A replay without an explicit ruleset identifier
is interpreted as legacy v1. New practice challenges explicitly use v2.

The v2 Relic constants are part of the replay ABI:

| Relic ID | Tactical role | Crater radius | Damage radius | Maximum damage |
| --- | --- | ---: | ---: | ---: |
| `threadball` | balanced | 40 | 64 | 70 |
| `needlepoint` | precision | 16 | 32 | 120 |
| `spoolburst` | terrain/control | 64 | 88 | 45 |

Radii and damage use integer world units. Every Relic uses the same fixed-point
flight, gravity, swept collision, aim/power bounds, movement, turn, and victory
rules. Relic selection is an accepted authoritative command, has no inventory
or cooldown, and persists until changed. V1 accepts only Threadball.

The Loomkeeper treats Relic ID as one bounded candidate dimension and evaluates
every candidate only through the public simulation API. Search caps do not
increase: the existing deterministic sampler selects from the enlarged stable
candidate lattice, and only the chosen plan enters replay.

WP-009 identifies the v2 policy as `nimble-knots-loomkeeper-v2`. Its coprime
stride sampler covers every declared movement, Relic, angle, and power axis
within each fixed profile cap. Legacy v1 simulations retain the exact v1 policy
identifier and sampling order so their decisions and golden evidence do not
change.

### Planned Basic Relic Ruleset V3

WP-015 prepares `nimble-knots-artillery-v3` for the first production-asset
vertical slice. V1 and v2 constants, identifiers, replay hashes, and policy
behavior remain immutable. A stored replay must always select the ruleset that
created it.

| Relic ID | Range tier | Direct Stitching damage tier |
| --- | --- | --- |
| `threadball` | medium | medium |
| `needlepoint` | highest | lowest |
| `spoolburst` | lowest | highest |

Range is expressed through one deterministic per-Relic launch-speed band while
gravity, angle and power inputs, flight lifetime, collision authority,
movement, and turn completion remain common. WP-015 initially keeps damage
radius, terrain radius, collision radius, precision, falloff, ammo, cooldowns,
secondary effects, and Calling modifiers on one shared basic baseline. These
dimensions are deferred so the first real-device evaluation measures the
assembled artillery loop rather than a large balance matrix.

The implementation slice freezes exact integer values and deterministic
fixed-shot tests before v3 becomes a challenge default. The tier ordering is a
product identity, not final balance. The Loomkeeper receives the same public
range and damage model as the player; visuals never provide simulation
authority. A later precision mechanic must be deterministic and disclosed and
requires another versioned ruleset if it changes replay outcomes.

### Hosting Contract

The selected competition-release host is one **Render Starter Web Service** in
the Frankfurt region. The existing Node process serves the built client and
owns Socket.IO, sessions, simulations, Loomkeeper scheduling, and replay state
together. This is the simplest deployment consistent with the current
single-process authority boundary.

- Render Free is permitted only for private development and preview because an
  idle service may sleep and cold-start. The public release uses the always-on
  Starter instance.
- Deploy one instance. Do not enable horizontal autoscaling while sessions,
  simulations, AI turns, and replays remain in memory.
- A process restart or deploy may end active practice matches. The client must
  fail clearly and offer a fresh practice match rather than imply recovery.
- WP-013 reward reservations, claims, immutable policy, match replay/evidence,
  payout intent, signed bytes/hash, and transition events live in PostgreSQL.
  Render's filesystem and in-memory state are never monetary authority.
- Multiple instances require shared durable snapshots/replays, exactly-once
  turn and payout leases, and cross-instance Socket.IO delivery before they can
  be considered safe.
- Production configuration must include HTTPS, the Render public origin in
  `ALLOWED_ORIGINS`, health checks, secret separation, spending alerts, rollback
  evidence, and rewards disabled by default.
- Render's shallow, remote-less build checkout sets
  `ALLOW_SHALLOW_WORK_PACKAGE_EVIDENCE=true`. The evidence checker accepts that
  opt-in only when Git confirms a shallow repository; it still validates every
  evidence field and current compliance gate. GitHub Actions uses full history
  and remains the authoritative historical starting-lock verification.

#### Reward activation and incident procedure

Keep `REWARD_MODE=disabled` until a separate Render PostgreSQL database is
attached and `record-only` acceptance proves reservation expiry/cancellation,
one consumed attempt per verified wallet/UTC day, authoritative loss and win
handling, claim recovery, deploy/restart persistence, and daily budget
enforcement. The application applies its idempotent migration at startup, but
the runtime database user should own only this application schema and must not
be a Render/database administrator.

Before `testnet`, create a dedicated low-funded automated wallet, mount its
private key as a Render secret file, set the expected signer address and HTTPS
RPC explicitly, and verify balance plus fee reserve. Approve one tiny canary,
record its stored hash, restart the service, and prove that reconciliation
reaches macro-block finality without creating a second transaction. Mainnet
activation is not part of autonomous WP-013 acceptance.

If a user-approved payout canary needs more than one same-day run, scope the
temporary exception to the dedicated test wallet with
`REWARD_TEST_WALLET_ADDRESS` and `REWARD_TEST_DAILY_ATTEMPT_LIMIT` (maximum
five). This is the authorized player/recipient wallet, not the payout signer.
Mainnet additionally requires
`REWARD_TEST_REPEAT_ACKNOWLEDGEMENT=I_UNDERSTAND_REPEAT_MAINNET_REWARDS`.
Attempt slots remain separate immutable ledger records and all budget, replay,
claim, signing, reconciliation, and finality controls still apply. Remove the
override settings after the canary; do not reset or delete existing
entitlements to regain eligibility.

WP-013's bounded operational acceptance completed on 2026-08-01. The
user-operated MainAlbatross canary produced exactly one 1 NIM transaction,
`f3f40995754b708f2ae2586888d74688d8a5bf218fe07f80d49d1fe255e0c3e6`,
which was included in block 57732455 and observed beyond its macro-block
finality threshold at block 57732480. A subsequent redeployment did not create
a duplicate transaction. The repeat-attempt settings were removed and
`REWARD_PAUSED=true` was restored and deployed. Keep payouts paused until the
remaining quality and release gates explicitly approve public activation.

For an outage or suspected incident:

1. set `REWARD_PAUSED=true` and redeploy; this blocks new reservations, claims,
   signing, and first/repeat broadcasts while retaining read-only hash
   reconciliation;
2. preserve the PostgreSQL ledger and `reward_events`; do not delete, replay,
   edit, or manually reset an ambiguous entitlement;
3. if key exposure is suspected, remove the secret from the service, transfer
   remaining hot-wallet funds with an independently operated recovery process,
   rotate to a fresh dedicated key, and leave affected payouts in
   `manual_review`;
4. restore database/RPC service and reconcile stored hashes before considering
   any manually approved replacement; and
5. keep the Daily entry paused or disabled while confirming that ordinary
   Practice still works.

Never scale the web service above one instance during this release. The
PostgreSQL advisory lock limits active signers, but in-memory sessions,
simulations, and Socket.IO delivery still require the single-instance hosting
contract.

Hosting choice checked 2026-07-12 against Render's official pricing, WebSocket,
free-service, and region documentation:
`https://render.com/pricing`,
`https://render.com/articles/building-real-time-applications-with-websockets`,
`https://render.com/docs/faq`, and `https://render.com/docs/regions`.

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

WP-005 provides browser launch and application smoke coverage. WP-014 expands
that foundation into the full viewport, visual-regression, network, resume,
fake-wallet, performance, PostgreSQL, and isolated multi-context matrix.
Multi-context means separate sessions and wallets exercising isolation and
contention against one server; it does not add PvP or matchmaking.

### WP-014 Quality Harness Protocol

WP-014 is the automated competition-candidate gate. Its normative scope,
matrix, budgets, slices, and acceptance criteria live in
`docs/planning/implementation_plan.md`. Apply these operational rules while
implementing or running it:

- Use only a freshly built loopback service, deterministic fake wallets,
  record-only rewards, fake signer/RPC adapters, and a disposable PostgreSQL
  database. Quality-test startup must reject chain reward modes, external RPC
  targets, and any configured payout key file. Never point an autonomous suite
  at Render, Nimiq Pay, a real wallet, or a public chain.
- Use one Playwright worker per CI job. Every test starts with a fresh browser
  context unless the named purpose is multi-context isolation or contention.
  Test keys are fixed synthetic fixtures. Real/external wallet secrets,
  signatures, device identifiers, database credentials, and environment dumps
  cannot enter reports, traces, screenshots, logs, or tracked evidence.
  Playwright traces may retain only short-lived synthetic loopback session
  authority; it expires with the test server, stays under bounded CI retention,
  and never enters tracked evidence.
- The maintained projects are Chromium 360x640, 390x844, 412x915, and 844x390
  plus WebKit 390x844. Keep one reviewed allowlist for scenario-specific
  project exclusions. Fail the quality gate on an unexpected skip, focused
  test, empty critical project, or retry-only pass.
- Required gates use zero retries. Preserve the first failure and classify it
  before a manual diagnostic rerun. Never hide nondeterminism with a retry,
  larger screenshot tolerance, longer timeout, broader skip, or weakened
  assertion.
- Generate screenshot baselines and compare them only in the pinned Linux CI
  browser environment. Freeze UTC, seeds, device scale, motion mode, color
  scheme, fonts, and fake-wallet state. Use `maxDiffPixelRatio=0.005` and
  per-pixel threshold `0.2`. Baseline updates are explicit reviewed changes;
  ordinary CI never writes expected snapshots.
- For initial or intentional baseline updates, push the implementation branch
  and open or update its pull request. **Visual baseline candidates** produces
  a 14-day artifact for that PR; after the workflow reaches the default branch,
  it can also be dispatched manually for an exact ref. Inspect every PNG and
  add only approved files under `tests/browser/visual.spec.ts-snapshots/`. The
  workflow has read-only repository permission and cannot commit. A Windows
  update, artifact upload, or `--update-snapshots` pass alone is not evidence;
  the committed images must pass the ordinary Ubuntu 24.04 comparison job
  afterward.
- Chromium may use supported deterministic bandwidth/latency control. Chromium
  and WebKit both cover offline/resume. Model Socket.IO acknowledgement loss,
  duplicate/stale delivery, and ordering faults through typed fixtures instead
  of claiming arbitrary WebSocket packet-loss emulation.
- PostgreSQL CI uses a reviewed digest-pinned PostgreSQL 16 service image,
  unique disposable databases, migrations from zero, and at least two
  independent connections for contention. Broad visual/state coverage may use
  the memory store, but one record-only built-browser Daily journey and all
  concurrency/restart authority checks use PostgreSQL.
- Measure the clean production client bundle exactly and gzip it in the gate;
  inspect the ordinary Practice network log to prove the Mini App SDK remains
  lazy. Timing uses one discarded warm-up plus five samples on the pinned
  Chromium CI project with one worker. Both median and maximum must meet the
  budgets recorded in the implementation plan.
- `verify:full` must become a truthful aggregate of fast checks, clean build,
  built smoke, every maintained browser suite, quality/security checks,
  identity-bundle separation, and `npm audit`. It cannot silently skip the
  PostgreSQL or browser quality jobs because a local prerequisite is missing;
  report the prerequisite and run the authoritative job in CI.
- On failure retain the HTML report, trace, screenshot, video, visual diff,
  sanitized bundle/timing JSON, and deterministic seeds for 14 days. Generated
  artifacts remain ignored under `test-results/` or `playwright-report/` and
  outside `assets/`. Track only reviewed expected screenshots and compact
  sanitized facts in the applicable `docs/evidence/wp-014a.json` through
  `docs/evidence/wp-014e.json` slice record.

WP-014A delivered the five maintained projects, `test:browser:matrix`, one
worker, zero retries, executable critical-suite/expected-skip accounting,
synthetic safe-area fixtures, all-suite CI routing, and the existing 14-day
failure-artifact upload. The authoritative local run accounted for all 105
project results (78 passed and 27 reviewed exclusions). It also corrected
ordinary pointer mapping when the capped game surface is centered inside a
larger viewport. WP-014B owns committed visual baselines and layout-state
captures; do not add them retroactively to WP-014A.

WP-014B completed with deterministic, visibly labeled result/reward
preview states with fake in-memory transitions only, a visual test covering
start/combat/result geometry and recovery on all five projects, canonical
combat presentation and Daily states, compact-landscape Pause/full-screen
fallback, and executable touch/scroll/zoom/selection assertions. The
pre-baseline zero-retry logic run passed 125 project results (86 passed, 39
reviewed exclusions). All 35 reviewed Ubuntu baselines were independently
reproduced, and ordinary Verify run 30739075679 passed the final comparison.

WP-014C completed with `test:browser:resilience` covering supported constrained
Chromium loading, Chromium/WebKit offline and same-authority resume, hidden/background
input cleanup, viewport change, delayed synthetic provider settlement,
truthful lost-session recovery, and two-context storage/identity/challenge/
control isolation. Deterministic client fixtures separately cover lost and
delayed acknowledgements, exact-request retry, stale/conflicting/foreign
events, and terminal deduplication; they do not claim arbitrary WebSocket
packet-loss emulation. The local zero-retry logic matrix accounts for 150
project results (94 passed, 56 reviewed exclusions). Initial Ubuntu Verify run
30741922105 exposed one test-only classification of Chromium's expected
`net::ERR_INTERNET_DISCONNECTED` WebSocket diagnostic during the deliberately
offline context. The correction excludes only that exact expected diagnostic;
every other console error remains actionable. Ordinary Ubuntu Verify run
30742976205 then passed all 150 results with the same totals, one worker, zero
retries, and unchanged visual thresholds in 22m22s.

WP-014D completed on 2026-08-02. The focused
`test:reward:postgres` suite creates a fresh database per case, runs repository
migrations from zero, and exercises two-connection budget, wallet, claim,
expiry, rollover, advisory-lease, and restart/reconciliation boundaries. The
`test:browser:reward:postgres` runner creates one additional disposable
database, runs a built Chromium Daily loss in record-only mode, verifies the
durable entitlement and event sequence, and drops the database. Both runners
accept only a loopback `WP014_TEST_DATABASE_URL`; quality startup refuses chain
modes, payout RPC/key/recovery settings, and non-`nimble_knots_wp014_*`
databases. The CI service is PostgreSQL `16.10-bookworm`, pinned to reviewed
multi-architecture digest
`sha256:38471f330eb885e04de130b768d6db4e10469e2311879c7e5c699f6d2d8a1c74`.
The first PostgreSQL CI run retained failures caused by a concurrency fixture
that expected two successful starts despite the consumed-eligibility contract
and by an invalid synthetic address. The corrected second run passed its six
scenario assertions but exposed an uncaught idle-client `pg` pool error during
forced database teardown. Production now handles that pool event with a
credential-free message while active query errors still reject, and the unit
suite covers the boundary. Final GitHub Actions run 30749716477 passed
`test:reward:postgres` (six real-database cases), the built Chromium
`test:browser:reward:postgres` journey, 24 reward tests, identity-bundle and
reward-security checks, and the audit in the 2m13s dedicated job. The separate
ordinary Verify job passed all 150 zero-retry browser results (94 passed, 56
reviewed exclusions) in 21m7s. No physical Android/iOS, real Nimiq Pay wallet,
external RPC, sponsor key, or public-chain transfer was used.

WP-014E completed on 2026-08-02. A
fresh Vite manifest now identifies the initial static client graph, and
`check:bundle-budget` records exact raw plus level-9 gzip bytes under ignored
`test-results/`. Dynamic imports are excluded from initial transfer only when
the manifest classifies them as such. The pinned 390x844 Chromium performance
gate runs full motion with one discarded warm-up and five measured fresh
contexts; browser-relative marks cover actionable Practice, legal combat input,
visible projectile presentation, and the complete Loomkeeper response. It also
fails if ordinary Practice requests the identified lazy Mini App SDK chunk.
`verify:quality` and `verify:full` now cover the complete maintained browser
matrix; `verify:full` reports the missing local PostgreSQL prerequisite instead
of implying database evidence, while the separate `verify:postgres` job remains
mandatory. GitHub Actions partitions fast, three reviewed browser project
shards, PostgreSQL/reward-security, and performance/bundle work under the
documented 20-minute per-job and 30-minute complete-workflow ceilings. Failed
jobs retain browser evidence for 14 days, while the performance job retains
sanitized successful or failed bundle/timing JSON for the same period. The
final local and Ubuntu production build measured 1,436,262 raw bytes for the
largest initial JavaScript chunk and 398,415 gzip bytes for initial JavaScript
plus CSS. Authoritative Ubuntu full-motion timing medians/maxima were 463.9/718.2 ms
to actionable Practice, 346.3/352.7 ms from Start to legal input,
241.3/283.4 ms from Fire to a visible projectile, and 5,289.5/5,548.1 ms
through the complete response. The SDK request count, page-error count, and
console-error count were zero. Local `verify:full` passed in 7m10s with all 150
browser results accounted for and its Linux/PostgreSQL omissions explicit.
Authoritative run 30752850448 then passed the fast job in 1m11s, PostgreSQL and
reward security in 2m05s, performance/bundle in 2m46s, WebKit in 3m05s, and
both Chromium shards in 9m06s or less. The shards accounted for 94 passes and
56 reviewed exclusions with zero retries; the complete workflow finished in
9m09s. Visual candidate run 30752850445 also passed in 3m54s. The Linux Fire
median retains only 8.7 ms of budget headroom and must be monitored rather than
normalized by raising the threshold. Evidence is closed in
`docs/evidence/wp-014e.json`, WP-014 is complete, and the execution pointer
advances to WP-015.

Official implementation references reviewed on 2026-08-01:
`https://playwright.dev/docs/test-projects`,
`https://playwright.dev/docs/ci`,
`https://playwright.dev/docs/test-snapshots`,
`https://playwright.dev/docs/test-retries`,
`https://playwright.dev/docs/trace-viewer-intro`,
`https://playwright.dev/docs/network`,
`https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow`, and
`https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers`.

## Asset Generation Loop

Production art follows this fail-closed sequence:

```text
approved brief -> quarantined concept master -> controlled refinement
  -> deterministic master normalization -> art/IP/provenance/master approval
  -> animation/export -> deterministic runtime normalization
  -> in-engine phone captures -> derivative review and manifest approval
  -> assets/ promotion
```

All Knotkin production briefs use
`docs/images/art-direction/knotkin-class-lineup-concept.png` as the canonical
Calling, palette, material, costume-vocabulary, and world-language reference.
WP-015B2G supersedes its angular anatomy with the rounded crochet-doll family.
The image remains documentation-only: it cannot be cropped, traced, or shipped
directly. It may be supplied to an approved production tool as the user-selected
creative conditioning reference only when the tracked path and SHA-256 are
recorded in the generation evidence. This does not resolve rights to official
Nimiq brand files. WP-015B0 separately records the project owner's attestation
of Nimiq team/foundation encouragement and historical approval to explore the
inspired body geometry; it is not a continuing geometry requirement. A brief
must record all other inputs and explicitly block Sorcerers, Worms/Team17,
realistic firearms, unlicensed logos, and recognizable third-party characters.

Only a separately approved generation profile may produce a quarantined concept
master or refinement. The current rounded Wizard direction came from the
reviewed local FLUX.2 Klein profile; that does not automatically approve the
same profile for a different purpose. AutoSprite is only a planned animation
route until B3B establishes its current availability, commercial terms,
input-retention/privacy behavior, output rights, export behavior, and evidence
surface. Record prompts, negative constraints, workflow JSON and hash, seeds,
model and custom-node versions and licenses, service/job IDs, parent/output
hashes, postprocess configuration, and reviewer identity.

### WP-015A Local ComfyUI Re-entry

The verified workstation stack is external tooling, not part of the MIT
product. Its reviewed inventory lives in
`legal/generation-component-manifest.json`; the bridge's exact Windows Python
environment lives in `scripts/comfy-mcp-requirements.lock`. The pinned stack is
ComfyUI 0.27.1 at `c2638ce6c00e3426c48d56a775bc46e9a8464094`, the
Apache-2.0 MCP bridge at
`e0101b2312f30501664dabe4a74c1283c4268eb8`, and the Comfy-Org archived
SD 1.5 FP16 checkpoint with SHA-256
`E9476A13728CD75D8279F6EC8BAD753A66A1957CA375A1464DC63B37DB6E3916`.
The GPL-3.0 ComfyUI program, Apache bridge, model, virtual environment, logs,
and outputs remain outside this repository.

Normal re-entry is five commands from the Worms_Port root:

```powershell
git status --short --branch
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Prepare
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Status -VerifyHashes
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Start
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Smoke
```

`Prepare` copies only the exact-hashed project img2img graph into the external
MCP workflow directory and is safe while the services are stopped. `Status` is
safe after that preparation. `Start` also prepares the graph, then refuses an
unreviewed Git revision, changed Python package set, broken dependency
environment, unexpected checkpoint, or unrelated process occupying either
port. It starts hidden loopback-only processes and writes PID state plus logs
under `%LOCALAPPDATA%\Worms_Port\comfy-pipeline`. `Smoke` uses seed 1 and a bounded
256x256, four-step workflow; it proves transport, checkpoint loading, GPU
execution, and output retrieval, not visual quality or production approval.
`Stop` terminates only listener processes whose command ancestry matches the
reviewed external paths. Use the same script with `-Action Stop` before moving
or updating either checkout.

The verified default machine layout is:

```text
E:\ComFy\TasirWimp\                         Comfy Desktop/ROCm root
E:\ComFy\TasirWimp\ComfyUI\                pinned ComfyUI checkout
E:\ComFy\TasirWimp\Worms_Port-models\      reviewed FLUX component root
C:\Users\jensb\Desktop\Projects\comfyui-mcp-server\  pinned bridge checkout
%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Shared\models\checkpoints\
%USERPROFILE%\.config\comfy-mcp\config.json
%USERPROFILE%\.codex\config.toml
```

If those paths move, set `WORMS_COMFY_ROOT`, `WORMS_COMFY_MCP_ROOT`,
`WORMS_COMFY_SHARED_ROOT`, `WORMS_COMFY_MCP_CONFIG`, or
`WORMS_CODEX_CONFIG` before invoking the script. Do not edit the manifest merely
to accept local drift. Review the new source revision, license, model terms,
and hashes first.

For a clean-machine restoration:

1. Install official Comfy Desktop (the verified setup used desktop 1.0.28),
   choose the AMD ROCm environment, and place its workspace at
   `E:\ComFy\TasirWimp`. Confirm the generated `start-comfy-api.bat` binds only
   to `127.0.0.1:8188`.
2. Check out ComfyUI at the manifest revision. Do not update to the fetched
   default branch until a new component review changes the pin.
3. Clone `https://github.com/joenorton/comfyui-mcp-server.git`, check out its
   manifest revision, create a Python 3.10.6 virtual environment at `.venv`,
   and install only `scripts/comfy-mcp-requirements.lock` into that external
   environment. Run `python -m pip check`.
4. Download the exact checkpoint URL from the generation-component manifest
   into the shared `models\checkpoints` directory. Let `Status -VerifyHashes`
   verify its size and SHA-256; never bypass a mismatch.
5. Set `%USERPROFILE%\.config\comfy-mcp\config.json` so
   `defaults.image.model` is `v1-5-pruned-emaonly-fp16.safetensors`.
6. Register `[mcp_servers.comfyui]` with
   `url = "http://127.0.0.1:9000/mcp"` in Codex config, run `Prepare`, and run
   `Start`. Because the bridge registers workflow-specific tools when its server
   starts, use `Stop` then `Start` after adding or changing a reviewed graph if
   it was already running. Restart Codex only after that server restart so its
   next task imports the live tool schema.

WP-015B0 approves the exact archived SD 1.5 checkpoint and pinned text-to-image
`workflows/generate_image.json` graph for quarantined production-candidate
generation. The pipeline entry point verifies that workflow's
`968A5B78766549BBAF374C1C27BE80B75E6BB389A01CCC237639DFB4EFCF3CD5`
SHA-256 on every status/start/smoke preflight.

The project-owned
`scripts/comfy-workflows/generate_image_conditioned.json` graph adds ordinary
VAE img2img: `LoadImage` and `VAEEncode` provide the initial latent while the
same reviewed checkpoint, positive/negative CLIP text, KSampler, VAE decode,
and SaveImage path remain deterministic. `Prepare` verifies its
`C21BD9224D08E1708073C3C11BFF749E4B901F5BE20EFE32245DAE6B489D3060`
SHA-256 and copies those exact bytes to the external MCP workflow directory.
`StageInput` accepts only an explicit PNG/JPEG/WebP below tracked
`docs/images/`, ignored `assets-quarantine/`, or the external ComfyUI output
directory; it copies exact bytes under the external `input/wormsport/` folder
and returns the safe relative `reference_image` value.

The workflow-specific MCP tool is `generate_image_conditioned`. Its parameters
include `reference_image`, positive and negative prompts, seed, steps, CFG,
sampler, scheduler, denoise, and model. The generic `run_workflow` endpoint
remains a fallback, but normal re-entry should use the dedicated tool so the
reviewed parameter schema is visible before execution.

This graph is not IP-Adapter, ControlNet, style transfer, or reference-only
conditioning. Denoise controls how much input composition survives. For the
production character path, first create and review an isolated 512x512 master,
then stage that master for controlled refinement. Feeding the complete lineup
directly into VAE img2img preserves its multi-character landscape composition
and is not a substitute for master isolation.

The MCP bridge exposes generic `publish_asset` behavior, but that path is
blocked for Worms_Port: untouched outputs stay in external quarantine until
the explicit review and promotion sequence below copies one exact approved
file.

### WP-015B2A Gate 1 Component-Only State

Gate 1 admitted three exact external FLUX.2 files on 2026-08-03. They are
installed on E: and registered as extra Comfy model directories as follows:

```text
E:\ComFy\TasirWimp\Worms_Port-models\diffusion_models\flux-2-klein-4b-fp8.safetensors
  97ED34FE0567E436200F2FAEE3939B88F2B5D99F8AF2A4DC16532C4245C0CCB6
E:\ComFy\TasirWimp\Worms_Port-models\text_encoders\qwen_3_4b_bfl_apache.safetensors
  AD65083F0B6561CC84B9B6A42FF397EE749171E367C28D800C4A6FD612ABC169
E:\ComFy\TasirWimp\Worms_Port-models\vae\flux2-vae.safetensors
  D64F3A68E1CC4F9F4E29B6E0DA38A0204FE9A49F2D4053F0EC1FA1CA02F9C4B5
```

The ignored local file
`E:\ComFy\TasirWimp\ComfyUI\extra_model_paths.yaml` retains the Desktop
shared root and registers only the E: `diffusion_models`, `text_encoders`, and
`vae` paths above. Its required SHA-256 is
`D03C5A366C7291F161B30DDB6CF5002800B67380E6D32D7DCC410AEFD1B4A00D`.
`Prepare`, `Status`, `Start`, and `Smoke` fail closed if that config drifts.

Source/comparison evidence remains outside the repository at
`E:\ComFy\TasirWimp\component-evidence\wp-015b2a`. The encoder is a
deterministic single-file merge of the two exact BFL Apache-2.0 shards; its
inputs and byte-preserving merge recipe are recorded in
`legal/generation-component-manifest.json`. Rebuild only from those exact
inputs and require the recorded output hash.

Do not use the official Comfy guide's pre-release
`qwen_3_4b.safetensors` mirror. Its bytes differ from canonical BFL/Qwen in two
final-layer tensors, and its repository does not provide exact license or
provenance linkage. It is retained only as rejected evidence.

Gate 1 remained component-only. At Gate 2 close, the two exact source workflows
described below were still absent from the runtime and the pipeline still
described only SD 1.5. Gate 3 subsequently added the separate fail-closed
profile; the historical Gate 1 boundary does not authorize changing the bridge
default model or handing an arbitrary FLUX graph to `run_workflow`.

### WP-015B2A Gate 2 Runtime-Disabled Workflow State

The two project-owned Comfy API graphs are:

```text
scripts\comfy-workflows\generate_flux2_klein_text.json
  626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28
scripts\comfy-workflows\generate_flux2_klein_reference_edit.json
  A2BF8CD3C015D36646E73F2FA87F22741E4410D27B26D562331057B49CFF6C8E
```

They translate the official Comfy workflow templates pinned at
`cebdebc9fc2febcb97a5db0dd291f59f5300b176` and use only core nodes available
in the pinned ComfyUI 0.27.1 schema. Both bind the exact reviewed Gate 1 model
filenames, four steps, CFG 1, Euler, and batch size one. The text route is fixed
at 1024x1024. The edit route accepts one staged reference, bounds it to one
megapixel, and derives the canvas size from that reference.

At Gate 2 close, `legal/generation-component-manifest.json` intentionally
recorded both with `runtime_enabled: false`; their `runtime_path` values only
documented the proposed Gate 3 copy targets. Gate 3 subsequently switched the
same exact-hashed records to profile-owned runtime installation. They still
must not be copied manually or invoked through generic `run_workflow`; the named
profile owns exact installation, removal, and drift rejection while leaving the
SD 1.5 smoke profile unchanged.

### WP-015B2A Gate 3 Closed Profile Re-entry

Gate 3 defines exactly two runtime profiles in
`legal/generation-component-manifest.json`:

- `sd15` preserves the archived checkpoint, generic text workflow, and
  project-owned VAE img2img workflow. It remains the default when `-Profile`
  is omitted.
- `flux2-klein` binds the three exact Gate 1 model components and the two exact
  Gate 2 workflows. It starts ComfyUI with `--lowvram --preview-method none`,
  which places the pinned runtime in LOW_VRAM mode and keeps the text encoder
  offloaded when the runtime does not use dynamic VRAM.

The PowerShell parameter uses an exact `ValidateSet`; the manifest compliance
gate also rejects any third profile, component substitution, workflow
substitution, tool-name drift, or launch-argument drift. The pipeline invokes
that compliance gate before copying a workflow. Project workflow bytes are
then copied only to their reviewed external MCP runtime names and rehashed.
Model files are size-checked on every action and SHA-256 checked by `Prepare`,
`Start`, `Smoke`, or `Status -VerifyHashes`.

Re-enter the FLUX profile without inference:

```powershell
Set-Location "C:\Users\jensb\Desktop\Projects\Worms_Port"
.\scripts\comfy-asset-pipeline.ps1 -Action Prepare -Profile flux2-klein -Json
.\scripts\comfy-asset-pipeline.ps1 -Action Start -Profile flux2-klein -Json
.\scripts\comfy-asset-pipeline.ps1 -Action Status -Profile flux2-klein -VerifyHashes -Json
```

`Prepare` installs and exact-hashes the two reviewed workflow copies but does
not restart services. `Start` safely restarts only a reviewed loopback ComfyUI
process when the required low-VRAM/no-preview arguments are absent, and only a
reviewed loopback MCP process when the profile tools are not registered.
`Status` reports the selected model/workflow chain, launch readiness, and MCP
registration. The SD route can be rechecked independently with:

```powershell
.\scripts\comfy-asset-pipeline.ps1 -Action Status -Profile sd15 -VerifyHashes -Json
```

Do not use `-Action Smoke -Profile flux2-klein` during Gate 3: it deliberately
submits the fixed Gate 4 technical prompt. Do not invoke the generic MCP
`run_workflow` tool, hand-edit the external workflow copies, change the MCP
default checkpoint, or add model/path overrides. A reference for a later
approved diagnostic may be staged with `StageInput -Profile flux2-klein`; that
action returns the reviewed single-reference workflow ID and never generates
by itself.

Gate 3 passed locally with both exact profile chains, ComfyUI 0.27.1 on the AMD
Radeon RX 7600, LOW_VRAM startup, both FLUX MCP tools registered, an empty
Comfy queue, and no new output file. Gate 4 then supplied the separately
recorded first FLUX inference below.

### WP-015B2A Gate 4 Technical-Smoke Re-entry

Gate 4 passed on 2026-08-03 with exactly one fixed-seed request through
`generate_flux2_klein_text`. Comfy terminal history for prompt
`54eb2c85-54dc-44a9-a036-07f4fa2f8bd0` reported success in 254.42 seconds on
the native AMD Radeon RX 7600. The reviewed low-VRAM/no-preview launch partially
loaded the diffusion model, offloaded 918.00 MB, and completed without OOM,
node error, retry, or model fallback.

The exact external evidence file is:

```text
C:\Users\jensb\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output\WormsPortFlux2KleinText_00001_.png
1024x1024, 423534 bytes
CFCDDB3E74B1B3B2E1082571BA54F0F37F603E563902B6DDB8397DEA7C1516F4
```

Do not rerun `-Action Smoke -Profile flux2-klein` merely to re-enter this
state; that action submits a new image. Re-enter read-only with:

```powershell
Set-Location "C:\Users\jensb\Desktop\Projects\Worms_Port"
.\scripts\comfy-asset-pipeline.ps1 -Action Status -Profile flux2-klein -VerifyHashes -Json
python .\scripts\comfy-mcp-smoke.py --profile flux2-klein --probe
```

The bridge can return an interim `running` result after its own 30-second
history window even though Comfy is healthy. `comfy-mcp-smoke.py` now retains
the same prompt ID, polls Comfy history until terminal success/error/timeout,
and collects system telemetry for the complete wait. It reports `pass` only
after terminal success. A timeout does not retry or cancel the prompt; inspect
the queue and history before considering any subsequent request.

Gate 4 is hardware admission only. Gate 5 must proceed sequentially: document
one short FLUX-specific Wizard structure prompt/seed, submit one text output,
and review it before documenting or submitting the Threadball structure pass.
Only after both primary reviews may a single controlled reference edit be
considered, and only when a failed primary gives a specific testable correction.
Do not queue Loomkeeper, Patch, animation, roster, or promotion work.

### WP-015B2A Gate 5/6 Visual Decision Re-entry

Gate 5 completed on 2026-08-03 with the exact sequential maximum: one Wizard
text primary, one Threadball text primary after Wizard review, and one
controlled Wizard edit after both primary reviews. The queue returned to zero
running and zero pending after each request. No retry, alternate seed, prompt
rewrite, second edit, or batch ran.

| Purpose | Seed | External output | SHA-256 | Decision |
| --- | ---: | --- | --- | --- |
| Wizard text primary | `15025001` | `WormsPortFlux2KleinText_00002_.png` | `D097705B08A4895ACCCA9D91B34B64039CACE893857E0BF688D54CA326481962` | reject |
| Threadball text primary | `15025002` | `WormsPortFlux2KleinText_00003_.png` | `2BAE664F7E5A862BCB53B55A68071580485CE040A89650C68EC6FA398F4089EB` | pass for bounded structure only |
| Wizard controlled edit | `15025003` | `WormsPortFlux2KleinReferenceEdit_00001_.png` | `9ACE9858AA1D81C5381548DF7473857C13EE83E4B90D9D8D6B5E8638B0B5A1CD` | reject |

The text Wizard followed isolation, side bias, two eyes, hood identity, and
separated feet, but added a mouth and produced rounded doll anatomy without a
usable forward hand. `StageInput` exact-copied those rejected bytes as
`wormsport/wizard-gate5-primary.png`. The one native FLUX reference edit removed
the mouth but retained the rounded anatomy and unusable hand. Threadball alone
passed its round blue/gold yarn-object structure at 28 pixels.

Gate 6 therefore marks the `flux2-klein` profile
`technical_only_visual_rejected`: it remains executable only so exact technical
evidence can be inspected, but it is not an adopted B2 candidate route. Do not
run `Smoke`, either FLUX MCP generation tool, or a generic workflow during
ordinary re-entry. Use read-only status and the B2 review record:

```powershell
Set-Location "C:\Users\jensb\Desktop\Projects\Worms_Port"
.\scripts\comfy-asset-pipeline.ps1 -Action Status -Profile flux2-klein -VerifyHashes -Json
python .\scripts\comfy-mcp-smoke.py --profile flux2-klein --probe
```

All full-size outputs remain under the external Comfy output root. Exact 48px
Wizard and 28px Threadball review derivatives remain under
`E:\ComFy\TasirWimp\component-evidence\wp-015b2a\gate5`. None is a product
asset. Re-entry returns to planning a character-master route that can enforce
the anatomy and socket contract. A possible Relic-only FLUX route requires its
own later scope decision; Threadball's pass does not authorize more generation.

### WP-015B2B Structure-Reference Wizard Recovery

The B2A Wizard edit used the already-rounded rejected Wizard as its only
reference. That test was useful evidence but could not establish whether the
native FLUX edit model can follow a clean anatomy guide. BFL's official FLUX.2
guidance recommends clean pose, edge, or layout references for structural
control, explicit reference roles, positive descriptions, and a prompt that is
not overloaded with simultaneous structural constraints. The pinned ComfyUI
`ReferenceLatent` node already provides this single-reference mechanism; no
ControlNet, custom node, ComfyUI update, larger model, or new workflow is
required for the first recovery diagnostic.

The exact project-owned input is:

```text
docs/images/art-direction/knotkin-wizard-structure-guide.png
1024x1024 opaque PNG, 15044 bytes
SHA-256 5A8F1C1D0942755F113327467462D47812A22A64BAF3DF2C5CD2E0F491FA9AA1
generator scripts/generate-wizard-structure-guide.js
generator SHA-256 695B499E67794692BFEB248C22CA24C24C2D0091107B4EAAE247D29830FCAF63
```

The generator uses project-authored geometry only. It scales the B1 baseline
and held-Relic socket by exactly two to `y=902` and `(682,586)`, draws one
angular body with separate feet, two eye locations, and a protruding forward
mitten, and reads no image input. The guide is documentation conditioning, not
finished art or a product asset.

Rebuild, verify, and stage it without inference:

```powershell
Set-Location "C:\Users\jensb\Desktop\Projects\Worms_Port"
node .\scripts\generate-wizard-structure-guide.js
Get-FileHash .\docs\images\art-direction\knotkin-wizard-structure-guide.png -Algorithm SHA256
.\scripts\comfy-asset-pipeline.ps1 -Action Prepare -Profile flux2-klein -Json
.\scripts\comfy-asset-pipeline.ps1 -Action Status -Profile flux2-klein -VerifyHashes -Json
.\scripts\comfy-asset-pipeline.ps1 -Action StageInput -Profile flux2-klein -InputImage .\docs\images\art-direction\knotkin-wizard-structure-guide.png -StagedName wizard-structure-guide-v1.png -Json
python .\scripts\comfy-mcp-smoke.py --profile flux2-klein --probe
```

Only after the manifest, guide hash, model/workflow hashes, low-VRAM launch,
both MCP tools, staged hash, empty Comfy queue, and latest-output baseline are
recorded may one request run through `generate_flux2_klein_reference_edit`.
Its exact seed is `15026001`. Its exact prompt is:

```text
Image 1 defines the exact silhouette and pose. Preserve its flat-crowned angular head-and-torso, chamfered shoulders, narrow lower bridge, two separate rectangular feet, and forward arm ending in a simple mitten. Render that shape as a blue crochet Wizard with a dark-blue felt hood and restrained gold stitching. The face consists solely of two glossy black bead eyes. One complete right-facing character centered on an unbroken white field.
```

The prompt deliberately does not name unwanted face parts, props, scenery, or
other negative concepts. The unchanged graph bounds the reference to one
megapixel and uses batch one, four FLUX.2 scheduler steps, CFG 1, Euler, and no
inline preview. The candidate command is:

```powershell
python .\scripts\comfy-mcp-smoke.py --profile flux2-klein --reference-image wormsport/wizard-structure-guide-v1.png --seed 15026001 --timeout 600 --prompt 'Image 1 defines the exact silhouette and pose. Preserve its flat-crowned angular head-and-torso, chamfered shoulders, narrow lower bridge, two separate rectangular feet, and forward arm ending in a simple mitten. Render that shape as a blue crochet Wizard with a dark-blue felt hood and restrained gold stitching. The face consists solely of two glossy black bead eyes. One complete right-facing character centered on an unbroken white field.'
```

Review the full output and an exact 48-pixel-tall derivative before any next
decision. The diagnostic passes structure only when it retains one broad
continuous angular head-and-torso with a flat crown and chamfered sides, a
narrow lower bridge, two separate block-like feet, two bead eyes with an
otherwise unmarked face, right-facing side bias, and a visibly protruding
forward hand that can normalize to the B1 socket without covering an eye. A
removable background shadow or opaque white field does not by itself fail this
structure experiment, but neither is accepted product alpha.

One terminal result closes the authorization. Do not change the seed or prompt,
submit a second attempt, reuse either rejected Wizard, condition on the
canonical lineup, add multi-reference nodes, queue Loomkeeper/Patch/animation,
or promote output. A pass permits a separately documented route-adoption and
exact-output review decision. A failure returns to planning; the next possible
experiment is a separately reviewed two-reference structure/style graph, not
an automatic retry.

The one authorized request completed on 2026-08-03 as prompt
`6fede7ab-3de4-4d67-9a24-d3de5ea3ca1f` in 298.33 seconds. Its untouched external
output is `WormsPortFlux2KleinReferenceEdit_00002_.png`, 1024x1024 opaque PNG,
1,163,317 bytes, SHA-256
`FD24C8CD494FD9631BE2BC589067BE8477C67026DC24ED9BA9A9A3A07920570B`.
The exact 48x48 HighQualityBicubic review derivative remains external at
`E:\ComFy\TasirWimp\component-evidence\wp-015b2b\gate1\wizard-structure-15026001-48px.png`,
3,467 bytes, SHA-256
`192209CC0D7121AEDF0CC25CCDD0C807E314A6C0E65E459A83192B7A33D3E925`.
Comfy reported 2,808.00 MB of the diffusion model loaded, 1,074.02 MB offloaded,
a 324.00 MB buffer, and terminal success without a queued duplicate.

The result passes isolation, side bias, two-eye face, separate feet, forward
mitten, Wizard material identity, and 48px readability. It fails the controlling
anatomy requirement: FLUX replaced the flat-crowned angular guide with a pointed
hat, round head, and oval torso. Therefore the structure-reference route is
rejected and its output remains external quarantine. Do not rerun it. Re-entry
is a planning decision between a separately reviewed two-reference
structure/style experiment and a deterministic character-master construction
route; neither is authorized by WP-015B2B.

### WP-015B2C Robot-Scaffold Knit Conversion

B2C tests whether the repeated rounded result comes from FLUX's learned
crochet/Wizard doll prior rather than the deterministic guide. It is a two-gate
experiment, not a two-image batch. Gate 1 alone is initially executable. Gate 2
is conditional and requires a recorded Gate 1 pass plus a second manifest state
transition.

The exact guide, model chain, single-reference workflow, dimensions, batch,
steps, CFG, sampler, low-VRAM mode, and no-preview mode remain unchanged. Gate 1
uses seed `15026002` and the exact prompt:

```text
Image 1 defines the exact silhouette and pose. Render its flat-crowned continuous angular head-and-torso, chamfered shoulders, narrow lower bridge, two separate rectangular feet, and forward articulated hand as a compact blue mechanical automaton. Use planar painted-metal panels, crisp beveled edges, two glossy black circular eyes, and one small neutral mouth slot. One complete right-facing character centered on an unbroken white field.
```

Before inference, rebuild and hash the guide, run `Prepare`, run
`Status -VerifyHashes`, start the closed profile, exact-stage the guide, probe
both required MCP tools, and record an empty queue plus latest-output baseline.
Then run exactly:

```powershell
python .\scripts\comfy-mcp-smoke.py --profile flux2-klein --reference-image wormsport/wizard-structure-guide-v1.png --seed 15026002 --timeout 600 --prompt 'Image 1 defines the exact silhouette and pose. Render its flat-crowned continuous angular head-and-torso, chamfered shoulders, narrow lower bridge, two separate rectangular feet, and forward articulated hand as a compact blue mechanical automaton. Use planar painted-metal panels, crisp beveled edges, two glossy black circular eyes, and one small neutral mouth slot. One complete right-facing character centered on an unbroken white field.'
```

Review the full output and exact 48x48 derivative against the Gate 1 decision
rule in `docs/asset-briefs/wp-015b2-generation-review.md`. Stop on failure. A
pass permits documentation and manifest changes only; it does not itself permit
the knit request.

Gate 1 passed on 2026-08-03 as prompt
`2dfc929f-3370-41e9-a568-4f1a86689c36`. The 1024x1024 opaque RGB output
`WormsPortFlux2KleinReferenceEdit_00003_.png` is 644,831 bytes, SHA-256
`BC6B21B74C5016504A733D5D1EC306FE7F46A8CC5E526E0FFF28EB9EABC25D38`.
Its exact 48x48 derivative is 2,799 bytes, SHA-256
`3D82FC1A55BC94AFABF1258C6E129F2421390C0FC6FEEECAB244917820A4C2BD`,
under `E:\ComFy\TasirWimp\component-evidence\wp-015b2c\gate1`. The result
retains the flat crown, chamfered chassis, narrow lower body, rectangular feet,
articulated hand, two eyes, and one mouth at both sizes. This permits the second
manifest transition; the robot remains external disposable evidence.

After those changes and a second successful preflight, Gate 2 may exact-stage
the accepted robot bytes and run seed `15026003` with this frozen prompt:

```text
Image 1 is the exact mechanical scaffold. Preserve its complete silhouette, scale, pose, planar proportions, flat crown, chamfered sides, narrow lower bridge, rectangular feet, articulated forward hand, two eyes, and small neutral mouth. Change only its materials: every visible surface becomes a closely fitted padded blue crochet shell stretched over the rigid faceted frame, with restrained dark-blue felt and gold stitching. Centered unchanged on the white field.
```

After Gate 2 completes, record the exact full-output and 48px hashes, then run
the deterministic shape comparison with the exact output paths:

```powershell
node .\scripts\compare-character-silhouettes.js --reference <robot-output.png> --candidate <knit-output.png> --threshold 32 --normalized-size 256 --minimum-iou 0.90 --maximum-baseline-drift 16
```

This reports raw-canvas IoU, foreground-bounds-normalized IoU, both bounds, and
baseline drift. `numeric_gate_pass` does not override a missing hand, rounded
crown, extra face feature, or any other visual failure.

The robot is an external disposable scaffold and remains blocked as product art.
The knit result also remains quarantined. B2C adds one small neutral mouth to the
future character contract so later expression frames can replace it; it adds no
nose, eyebrows, or other face feature. Historical mouthless prompts remain
unaltered evidence. The later B2D owner review supersedes only the eyebrow
restriction for future work: one intentional stitched eyebrow above each eye is
allowed when it supports the expression.

Gate 2 passed on 2026-08-03 as prompt
`936917b2-f182-4cfa-8960-5fccda8cbe0c`. Exact staged/source robot SHA-256 was
`BC6B21B74C5016504A733D5D1EC306FE7F46A8CC5E526E0FFF28EB9EABC25D38`.
The 1024x1024 opaque RGB knit output
`WormsPortFlux2KleinReferenceEdit_00004_.png` is 1,130,420 bytes, SHA-256
`5FF0A63DAC03E13B2A3390AD77E6929A9822412E1A1E0415E7A38125D703B246`.
Its exact 48x48 derivative is 3,394 bytes, SHA-256
`9308495013B25771F6B015AC7FD4EE3FC3B76DE4360AAF2A218ED4009D3A7B18`.
The comparator recorded raw IoU `0.951554`, normalized IoU `0.956188`, and
baseline drift `12`, passing the `0.90` / `16` numeric gate. Visual review also
passed every structural, material, face, hand, foot, and phone-scale criterion.

B2C is therefore complete. Stop the local services and return to planning. The
knit output proves the route but remains external and unapproved; do not add
Calling details, generate another character, normalize it, or promote it until
a separate route-adoption and Wizard-master contract is reviewed.

### WP-015B2D Wizard Cuteness And Calling Styling

B2D adopts only the exact B2C knit silhouette and authorizes one styling edit.
It targets the specific loss of cuteness without asking FLUX to solve alpha,
animation, socket geometry, and character-family production in the same prompt.
The normative gate and exact prompt are in
`docs/asset-briefs/wp-015b2-generation-review.md`.

Re-entry sequence:

```powershell
git status --short --branch
npm run check:compliance
npm run test:tooling
npm run build
npm audit
.\scripts\comfy-asset-pipeline.ps1 -Action Prepare -Profile flux2-klein -Json
.\scripts\comfy-asset-pipeline.ps1 -Action Status -Profile flux2-klein -VerifyHashes -Json
.\scripts\comfy-asset-pipeline.ps1 -Action Start -Profile flux2-klein -Json
.\scripts\comfy-asset-pipeline.ps1 -Action StageInput -Profile flux2-klein -InputImage "$env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Shared\output\WormsPortFlux2KleinReferenceEdit_00004_.png" -StagedName wizard-knit-proof-15026003.png -Json
python .\scripts\comfy-mcp-smoke.py --profile flux2-klein --probe
```

Before inference, verify the staged/source SHA-256 is exactly
`5FF0A63DAC03E13B2A3390AD77E6929A9822412E1A1E0415E7A38125D703B246`,
the queue is empty, and `_00004_` is still the latest FLUX reference-edit
output. Then run exactly one request with seed `15026004` and the frozen prompt:

```text
Image 1 is the exact fitted-knit structure. Preserve its angular silhouette, scale, right-facing pose, flat crown, chamfered body, narrow lower bridge, rectangular feet, and forward hand. Change only styling and expression: soft pale-blue chenille, a close-fitting deep-navy folded felt cowl inside the outline, exactly two slightly larger close-set glossy bead eyes, one tiny curved stitched smile, restrained gold stitching, a woven belt, and one wooden button. Replace rigid panel seams and the rear block with continuous crochet and a clean back. Center unchanged on white.
```

Do not retry. Create an exact 48px derivative externally, compare the untouched
output to `_00004_` with `scripts/compare-character-silhouettes.js`, perform the
full-size and phone-scale gate, record the result, close the manifest state,
and stop both services. No output enters `assets/` in B2D.

B2D completed once as prompt `c82a19fa-6be7-4a30-b193-b9c708638302`.
External output `WormsPortFlux2KleinReferenceEdit_00005_.png` is a 887,003-byte
1024x1024 opaque RGB PNG, SHA-256
`DEF9265DAA4C6F2799D16870205E2015291E3E4AAE0F61802349C9FD8D56AD00`.
Its 2,897-byte exact 48px derivative is SHA-256
`AB172F6B365B64093F5E2BE03F4AE2D24623F73E18A881033172ED0DA5A6E8E1`.
The request completed without sampling error or retry; the queue returned to
zero. Normalized silhouette IoU was `0.880098` against the `0.90` floor and
baseline drift was `0` pixels.

The initial narrow gate flagged the paired eyebrows, neck-wrap cowl, and body
narrowing. The later project-owner review accepts the eyebrows and width as
useful creative variation and accepts B2D's cuteness direction. Treat
`0.880098` as drift telemetry that may inform later width/scale compensation,
not as an automatic art rejection. The remaining protected Calling issue is a
Wizard cowl/hat that visibly rests on the head. B2D remains external and
unpromoted because normalization, alpha, socket, animation, and exact-file
product review are incomplete.

### WP-015B2E Protected-Property Masked-Edit Investigation

B2E completed its source/tooling investigation without inference, and the
project owner then approved the exact workflow and mask for one frozen request.
It selected a core-node masked latent edit and rejected the following
alternatives:

- `InpaintModelConditioning` adds model-specific concat conditioning and its
  pinned node schema warns that the noise-mask option may improve results or
  completely break them depending on the model. The installed FLUX.2 Klein edit
  model has not established that contract.
- `VAEEncodeForInpaint` intentionally replaces masked source pixels before VAE
  encoding. B2E instead needs B2D to remain the semantic reference and base
  latent while the mask only gates denoising.
- `DifferentialDiffusion` is marked experimental in the pinned ComfyUI source.
- custom inpaint/crop, segmentation, ControlNet, and IP-Adapter nodes would add
  an unreviewed component and are not needed for this bounded hypothesis.

The selected source graph is
`scripts/comfy-workflows/generate_flux2_klein_protected_edit.json`, a 23-node
project-owned derivative of the official pinned FLUX.2 Klein 4B distilled edit
template. Its SHA-256 is
`AD4D4F96AD7D7C024A1A903A440DD4FE6D9E31353ACB7E436BF7DFC787321DAA`.
It uses only pinned ComfyUI 0.27.1 core nodes:

1. load and bound the exact B2D image to one megapixel;
2. encode B2D once and use that latent as both the sole `ReferenceLatent` and
   the sampler's starting image;
3. load the exact project-owned mask, match it to the bounded base, and read its
   red channel as the edit mask;
4. attach that mask with `SetLatentNoiseMask`, then retain the existing four
   FLUX.2 steps, CFG `1`, Euler sampler, one-image batch, and low-VRAM/no-preview
   profile settings; and
5. decode, then use `ImageCompositeMasked` with B2D as destination and the same
   mask so pixels outside the reviewed region are restored before saving.

B2C remains geometry evidence, not a second model input. This avoids the extra
reference tokens and semantic competition of multi-reference conditioning on
the 8 GB GPU while still making the B2C broad angular family the human review
standard. B2D is the edit target, base latent, and only style/reference image.

The deterministic mask lives at
`docs/images/art-direction/knotkin-wizard-cowl-edit-mask.png`, is 1024x1024,
11,323 bytes, and has SHA-256
`2B6C5F51A6EA411BB8B9C40AF861A339622316CB1D9710719F7F0CDEC327425B`.
`scripts/generate-wizard-cowl-edit-mask.js`, SHA-256
`8DFD6623479D61603C046550F9184F13ADAE0C4FA3E40E9C49F2017E6F8634A1`,
regenerates it byte-for-byte. White permits edits around the crown, head
perimeter, and navy neck wrap, including enough white-background halo for the
cowl to grow above the existing silhouette. The central face island and all
pixels below the cowl boundary are black, protecting the accepted eyes,
eyebrows, mouth, body, feet, baseline, and forward Relic hand. A four-times
render and box downsample provide a narrow soft boundary without another node.

Pinned `object_info` validation passed all 23 node classes, required inputs, and
connected edge types. This proves graph compatibility, not FLUX.2 masked-edit
quality. After the project-owner approval, the graph is `runtime_enabled: true`
inside the closed `flux2-klein` profile and may be installed only as
`generate_flux2_klein_protected_edit`. The source-validation session itself
ended with zero running / zero pending, B2D remained the newest output, and
both local services were stopped; no image or mask was staged and no prompt ran
during that gate. Current
official ComfyUI background references are the
[inpainting guide](https://docs.comfy.org/tutorials/basic/inpaint) and
[FLUX.2 Klein guide](https://docs.comfy.org/tutorials/flux/flux-2-klein);
the exact implementation authority remains the locally pinned ComfyUI revision
recorded in the generation manifest.

Protect only:

- the recognisable broad angular Knotkin family, narrow lower bridge, and
  separate feet, with moderate proportion variation allowed,
- a Wizard cowl/hat visibly resting on the head,
- a complete forward hand able to normalize to the separate-Relic socket,
- exactly two eyes and one mouth, with optional intentional paired eyebrows,
  and
- friendly/cute readability at full size and 48px.

Leave cowl point, folds, trim, stitch pattern, and local crown/neck shape to
FLUX. Eye spacing, eyebrows, mouth, body, hand, and feet happen to receive
stronger-than-semantic protection in this pass because they lie outside the
mask. Silhouette IoU, baseline, canvas position, and bounds remain diagnostic
measurements; small later normalization remains allowed.

The project-owner decision activates exactly these reviewed bytes for seed
`15026005` and this prompt:

> Change only the navy knitted neck wrap into a cute Wizard cowl that visibly
> rests on and frames the head, with a soft pointed crown and short neck drape.
> Preserve the pale chenille angular Knotkin body, full pose, complete forward
> hand, belt, button, separate feet, exactly two eyes, paired eyebrows, one
> curved mouth, white background, centered full-body framing, and friendly
> handcrafted appeal. No weapon, staff, extra limb, extra face, floating hat,
> text, logo, or rear shell.

Before that one request, activation must exact-install and register the
workflow, stage exact B2D bytes and the exact tracked mask under two safe names,
verify model/workflow/input hashes, confirm low-VRAM/no-preview launch mode, and
record an empty queue plus B2D as latest-output baseline. Human review controls
the result: the cowl must visibly rest on the head; the character must retain
exactly two eyes, optional paired eyebrows, one mouth, the complete forward
hand, separate feet, broad angular family, and cute 48px read. Pixel equality
outside every nonzero mask pixel is mandatory; variation inside the mask is
creative rather than a reason to reject. A failed result authorizes no retry,
seed shopping, mask widening, or full-canvas fallback. Alpha, animation, socket
normalization, another Calling, and product promotion remain later work.

The one activated request completed as Comfy prompt
`d023da3f-77cf-4f05-ae7b-62ce66f1f176` in `308.956` seconds. Its external
1024x1024 output is
`WormsPortFlux2KleinProtectedEdit_00001_.png`, 906000 bytes, SHA-256
`1275B2BD8021EAA5C51AA0606A6CC20BA21B15ED6CEBC4A7C1FC76308BA9D2E0`.
All `907427` zero-mask pixels equal B2D exactly, with maximum channel difference
zero. Baseline drift is zero; normalized silhouette IoU `0.840783` remains
telemetry. Preliminary full-size and 48px review passed the mechanical
protected-property purpose, but subsequent project-owner review rejected the
compact crown as no longer clearly Wizard-like and the horizontal neck wrap as
thief-like. The queue returned to zero running / zero pending and both services
were stopped. The request allowance is consumed, so B2E re-entry must not run
another prompt.

### WP-015B2F Wizard-Hood Source Review

Project-owner review rejects B2E as the next Wizard master: its compact crown
loses the Wizard calling and its horizontal neck wrap reads thief-like. B2F is
therefore a deterministic source-review gate. It must not stage an input, start
Comfy/MCP, or run inference.

Regenerate the tracked controls byte-for-byte from project-owned geometry:

```powershell
node scripts/generate-wizard-hood-structure-controls.js
```

When the exact external B2D evidence file is present, create the untracked
source-review scaffold with explicit paths:

```powershell
$base = "$env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Shared\output\WormsPortFlux2KleinReferenceEdit_00005_.png"
$scaffold = "$env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Shared\output\WormsPortWizardHoodScaffold_v1.png"
node scripts/generate-wizard-hood-structure-controls.js --base $base --scaffold-out $scaffold
```

The generator refuses any base whose SHA-256 is not
`DEF9265DAA4C6F2799D16870205E2015291E3E4AAE0F61802349C9FD8D56AD00`
and verifies that every zero-mask pixel remains exact B2D. Expected source
evidence:

- guide `08CB26CE3FAC6605859F9C9B51331351F28F40A005F6A101B2E575D8A56C6AB8`;
- mask `AC9F8F101094C5C15361FD24827C4F24B7C52ACBC652000748B209CB5483F56B`;
- generator `3B009E6F4A5908D4BAFA63426E7538F9B59DD2A4A286246FFC2604DCD7D0FB69`;
  and
- external scaffold `A048CA16B249298BBECFAD2F57552B04958E26F766D01F6577D1C6A011A0231C`.

Review the full-size guide, mask, scaffold, and the exact 48px scaffold
derivative. The garment must read as a tall asymmetric pointed Wizard hood with
an open center neck and two short separated mantle flaps, not a horizontal
scarf. The mask is intentionally generous so FLUX can form folds and remove the
old wrap; separate black islands protect the accepted upper face and mouth.
The body, forward Relic hand, feet, and baseline remain protected.

The frozen activation prompt and approval checklist live in
`docs/asset-briefs/wp-015b2-generation-review.md`. A full robe/tunic is outside
this pass. The project owner approved all four source controls. The fail-closed
activation binds seed `15026006`, base
`wormsport/wizard-hood-scaffold-v1.png`, mask
`wormsport/wizard-hood-edit-mask-v1.png`, and exactly the frozen prompt. Run at
most one request after source-side checks, full component/workflow hash
verification, low-VRAM/no-preview startup, three-tool MCP probe, staged-byte
equality, an empty queue, and newest-output baseline capture all pass. Any
mismatch closes the gate; no retry or parameter change is authorized.

The one request completed as prompt
`1f5fc569-5250-4799-a236-0bb22ba629c8` in `355.120` seconds. External output
`WormsPortFlux2KleinProtectedEdit_00002_.png` is 920934 bytes, SHA-256
`BE162B61FF38BE0EE2EA58716BDBAF5D2B38F0D8E6608953D2ECA41EFE7AD608`.
All `844934` zero-mask pixels equal the scaffold exactly, baseline drift is
zero, and the exact 48px derivative is SHA-256
`70FC1611E1F84081699B9A805E0C6A7A795B5B89CA7ABA783FC84E4AE1968B90`.
The tall knitted hood passes Wizard identity and 48px readability, but hard
polygonal face and rectangular mouth restoration boundaries are visibly
seamed at full size. The result therefore fails as a master.

The failure demonstrates that the denoise permission mask and final exact-
composite mask have different transition requirements. Do not rerun this graph
with a wider or changed mask. Future planning may investigate separate masks or
semantic regeneration of the complete face/hood region, but must create a new
source gate and request allowance. The queue ended 0/0, both services were
stopped, and re-entry is review/planning only.

### WP-015B2G Rounded-Doll Reset Re-entry

WP-015B2G supersedes the hexagonal production-anatomy requirement after the
project owner reviewed the complete B2A-B2F evidence. Do not resume the robot,
structure-guide, cowl-mask, or hood-mask routes. They remain historical controls
that demonstrate why the requirement changed.

The reset returned to the exact core-only `generate_flux2_klein_text` workflow.
Seed `15027001` tested an abstract `C-shaped grip`; output
`WormsPortFlux2KleinText_00004_.png`, SHA-256
`F5A58D589BD0624BA502D8277BF94FC7A4BD43B09BD05FF98CB184FEF6A3BE1C`,
retained a closed thumbs-up mitten and was not selected. Seed `15027002`
replaced it with an upward-facing shallow-bowl palm and produced the selected
external direction candidate:

```text
C:\Users\jensb\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output\WormsPortFlux2KleinText_00005_.png
40F9E81254A0792B967889808BD8BD8DE33DBDE5EAB7C4CBB1B336DD02BC54A5
1024x1024, 788520 bytes
```

Exact selected prompt:

```text
One isolated full-body game character centered on a pure white background with generous space around the entire silhouette. A cute blue crochet Wizard doll with a compact rounded body, short limbs, and two separate stubby feet aligned on one baseline. The character faces toward the right edge in a three-quarter view. Exactly two large glossy black bead eyes and one small curved stitched smile are visible. The arm on the image-right side reaches horizontally away from the torso. It ends in a proportionate crochet mitten hand turned upward like a small shallow bowl: the palm faces upward and remains fully visible, while the thumb and rounded mitten fingers curl upward around its edges without touching. The empty palm forms a clear unobstructed cradle. The other arm hangs naturally at the character's side. A tall pointed dark-blue felt Wizard hat with a softly folded tip and small gold stitched stars rests on the head without covering the face. Clean, readable mobile-game character with even lighting. The raised palm is empty. No text, logo, scenery, floor plane, or second character.
```

Re-entry is read-only unless a later work package explicitly authorizes product
normalization or another generation request. Confirm the external file and hash,
then start from deterministic alpha/background extraction, crop, baseline,
pivot, held-Relic socket, and phone-size review. The selected file is still
quarantine evidence; do not copy it into `assets/`, animate it, or integrate it
before exact-output IP and product-manifest approval. LoRA remains a separately
scoped fallback for a future character-consistency need, not the active Wizard
route.

### WP-015B2H Wizard Production-Normalization Re-entry

WP-015B2H completed on 2026-08-04. This re-entry contract reproduces the
deterministic normalization of exactly one source and authorizes no inference:

```text
C:\Users\jensb\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output\WormsPortFlux2KleinText_00005_.png
40F9E81254A0792B967889808BD8BD8DE33DBDE5EAB7C4CBB1B336DD02BC54A5
1024x1024, 788520 bytes
```

Required order:

1. Check Git status and confirm the external file exists with the exact size and
   SHA-256 above. A mismatch stops the slice; do not reconstruct the source from
   screenshots or another generated output.
2. Extend the existing `docs/evidence/wp-015b.json` record with the B2H starting
   commit, clean/dirty state, lock hash, scope, non-goals, and planned checks,
   then freeze a versioned normalization configuration before writing the
   normalizer. The configuration records the
   source hash, background/matte rule, edge-color decontamination rule, connected
   subject selection, crop/padding, resampling filter, target dimensions,
   baseline, pivot, palm/socket point, and output naming.
3. Review the exact output and its complete FLUX component chain for commercial
   use, redistribution, modification, attribution, official-brand implications,
   and recognizable third-party similarity. A model/component admission is not
   an output-IP approval. Record the human review separately from automated
   pixel checks.
4. Preserve the untouched opaque 1024x1024 source externally. Use the versioned
   script to remove only the plain background and faint contact shadow,
   decontaminate the deterministic edge matte, select the single connected
   character, and derive a 512x512 RGBA master. Do not manually paint, clone,
   reconstruct, generatively fill, reshape, or non-uniformly warp any body,
   costume, face, or hand pixels.
5. Use uniform scale and translation to target the retained B1 512x512 ground
   pivot `(256,451)`, held-Relic socket `(341,293)`, motion-safe bounds, and the
   visible center of the upward-facing palm cradle. Derive the 192x192 review
   candidate at pivot `(96,169)` and socket `(128,110)`, plus an exact 48px-tall
   phone-readability derivative. If one uniform transform cannot satisfy the
   baseline and visible socket without clipping or implausible metadata, stop
   and propose a reviewed coordinate amendment; never distort the character to
   make old coordinates pass.
6. Prove deterministic byte reproduction, valid real alpha, no opaque or
   disconnected background fragments, no bright/dark fringe at representative
   backgrounds, stable feet/baseline, motion-safe padding, readable eyes/mouth/
   hat/palm at 48px, and full-size preservation of the selected direction.
7. If and only if the exact-output, visual, alpha, geometry, provenance, and
   phone-size reviews pass, add the exact normalized master and complete parent/
   postprocess evidence to `legal/asset-manifest.json` and copy the reviewed
   bytes into their approved source location under `assets/`. Do not assign a
   runtime atlas path merely to close B2H; animation derivatives receive their
   own later entries and runtime paths.

B2H completion runs the normalizer determinism tests, JSON/evidence checks,
`npm run check:compliance`, `npm run build`, `npm run smoke`, and
`git diff --check`. The browser matrix is not required unless B2H changes a
browser-facing asset path or runtime code. Real-device testing is not run in
B2H because no player-visible asset is integrated. Report both omissions.

Completion record:

- frozen config
  `scripts/asset-normalization/wp-015b2h-wizard-v1.json`, SHA-256
  `2AAEF899BD9FDBE202D5D9A293F1DC971ED62AAC32ED95095AF662FE6567D644`;
- deterministic normalizer `scripts/normalize-character-master.js`, SHA-256
  `B4AEF73CC30133F622C131A8E8D0322DECF953F933FEFC4EE83940FB328CDD82`;
- first review candidate rejected before promotion because unrestricted enclosed-
  region filling retained the floor shadow as an opaque white oval;
- corrected matte freezes source-y-900 shadow-zone chroma controls, retains
  internal highlights only above that zone, and removes post-resample ringing
  islands without altering source anatomy;
- approved 195820-byte 512x512 RGBA master
  `assets/masters/characters/knotkin/wizard/knotkin-wizard-source-master-v1.png`,
  SHA-256
  `7AF4864E00C7206A05684312916092C6881127F921FA7CEA01524899093318A9`;
- exact 192px and 48px review hashes `5E5A2C9D...BC632` and
  `726550CE...9B6B3`; navy/warm-light edge sheet `D4545EEB...105D`;
- retained pivot `(256,451)` and reviewed rounded-body palm socket `(407,228)`.
  The old `(341,293)` socket is explicitly superseded for this source because
  satisfying it at the same baseline would shrink the 898-pixel shadow-free
  subject to about 297 pixels tall; no distortion was used; and
- the exact master passed product manifest review with no `runtime_path`.
  Animation, another Calling, another prompt, and gameplay integration remain
  blocked for B2H.

Reproduce external review outputs with `npm run asset:normalize:wizard`. The
command fails closed unless the exact external parent size, hash, dimensions,
and channel count still match the frozen config.

### WP-015B3 Vertical-Slice Production Re-entry

WP-015B3 begins only after B2H approves the normalized Wizard master. It closes
the asset-production prerequisites that WP-015C is not allowed to invent while
integrating.

1. **B3A shared companion masters:** keep existing external Threadball candidate
   `2BAE664F7E5A862BCB53B55A68071580485CE040A89650C68EC6FA398F4089EB`
   paused as historical structure evidence. It reads as ordinary yarn rather
   than the compressed Worldweave spell now required by the product story, so do
   not normalize, promote, delete, or use it as conditioning. Before inference,
   the B1 brief now freezes exact text-only seed `15035001`, its 77-word prompt,
   pinned 1024x1024/batch-one/four-step/CFG-1/Euler workflow, no reference input,
   one-request limit, output-baseline evidence, protected properties, rejection
   rules, and stop conditions. User-supplied Gemini concept
   `BD87405A...DA6699` remains external comparison evidence; do not copy, stage,
   or condition on it. Reverify components/workflows, low-VRAM/no-preview launch,
   tool registration, empty queue, and newest output before running exactly that
   request. The request completed successfully as prompt
   `af2f84ad-deca-4a6d-bd83-b0b88e87c696` in 272.426 seconds, producing exact
   external output `1F41AF26...F56EC`; services were stopped and the request
   allowance is consumed. The project owner accepted its direction and
   deterministic config `CF8C6301...635B` produced approved source master
   `608F490C...D9B6F`, centered at projectile origin `(128,128)`, with genuine
   strand gaps kept transparent. No retry, regeneration, animation, or runtime
   integration is authorized. The equivalent Patch-layer contract is now frozen:
   Cloud seed `15035002`, Terrain Top `15035003`, and Terrain Interior
   `15035004` use the same pinned text-only workflow/settings and no reference
   input. Cloud completed as external output `EA972B0B...FFE7`, passed
   project-owner review, and has deterministic source master `7F327B51...4B23C`
   with no runtime path. Owner-approved Terrain Top `BE5EB2E7...2B22` has
   deterministic 256x64 source master `41511E63...7897` through frozen crop,
   uniform scale, and horizontal repeat proof, with no runtime path. Terrain
   Interior candidate `98091C73...50F9` remains rejected for its directional
   quilt seam pattern. The owner separately repaired that material in four-layer
   GIMP XCF `2E94BBE4...CDBC7B`; its exact flattened export
   `6419C1E8...CF8095` deterministically produces opaque 256x256 master
   `D50C2C60...2E40E9` with zero difference at both axes of a 3x3 repeat proof.
   The original candidate remains rejected, and the recovery admits neither
   post-export painting, runtime path, terrain authority, nor retry. Those
   requests are strictly sequential, and each output must be reviewed before the
   next gate. Treat FLUX output as
   textile source imagery only; a later frozen deterministic normalizer must
   prove Cloud alpha handling and terrain repeatability. Failure pauses the
   family; it does not authorize seed shopping or a batch. Do not generate a
   distinct Loomkeeper in B3A.
2. **B3B deterministic Loomseed-presentation admission:** the approved
   empty-handed Wizard source master may not be uploaded or regenerated again.
   The two completed AutoSprite pilots are rejected external evidence: the first
   remade/lowered the raised palm and the second substituted a basket/cup-like
   object. Retain them only for traceability; do not use their pixels, poses, or
   prompts as a parent, conditioning input, normalizer target, or product asset.
   Freeze a deterministic composition contract instead: the approved Threadball
   source master is the only possible parent for a calm permanent Loomseed at
   the reviewed palm anchor, and a smaller temporary cast Threadball forms at or
   just beyond that anchor before launch. No further AutoSprite request, paid
   pose control, animation-service substitution, source re-upload, or source
   repair is authorized.
   AutoSprite's current public terms/privacy review on 2026-08-04/05 permits only
   quarantined pilots: output rights and no-training are stated, but retention is
   not fixed, non-infringement is disclaimed, and exact inference-model/vendor
   identity is not fully published. The first preset-Idle pilot fails because it
   lowers/remakes the raised cupped palm, so its exported sheet
   `6EA23DEE...4C718` remains external rejected evidence. Its sole documented
   free-tier Custom successor `Palm-preservation idle` also fails its first
   editable frame by replacing the empty palm with a large blue woven
   basket/cup-like object. Both pilots are retained temporarily in the account at
   the owner's direction, but neither is an input or product candidate. No further
   AutoSprite generation, paid pose control, or route repair is authorized. No
   pilot can promote a runtime asset without later exact-file, IP, normalization,
   and manifest review.
3. **B3C playable derivatives:** after the deterministic B3B contract is
   frozen, compose and review one Wizard root presentation for reuse by both the
   player and AI Loomkeeper. The permanent Loomseed and three static temporary
   Threadball formation-start/formation-ready/projectile derivatives are now
   exact approved source material. They are uniformly resampled only from the
   approved Threadball master and map every local visual origin to `(32,32)`;
   the Wizard root-space emission offset is `[151,-223]`. No new glow, loose
   fibers, tail, impact, animation, runtime path, or authority has been
   created. Config `wp-015b3c-threadball-effects-v1` now separately admits the
   bounded later procedural halo/gather/tail/impact route, but it remains
   unintegrated until C. Patch
   background/cloud/repeatable terrain materials, and minimum shared
   damage/result effects. The spell family shows loose fibers gathering at or
   beyond the Loomseed, a smaller temporary compressed knot, compact flight, and
   rapid non-graphic unspooling against Stitching; it must not imply fire, a
   larger damage radius, or another unimplemented effect. The intact source
   master may receive only deterministic root transforms; no generated character
   frame or hand modification is part of this route. Record pivots, Loomseed
   anchor, aim-direction emission rule, Fire phases, parent/output hashes,
   exact-file approvals, phone-size review, and media budget. Distinct
   Loomkeeper production remains deferred to WP-015D.
4. **B3C.1 deterministic runtime-copy admission:** before C, assign a
   `runtime_path` only to the existing Wizard-with-Loomseed master, three cast
   stages, Cloud, Terrain Top, and repaired Terrain Interior. The build copier
   must make exactly seven byte-identical files below `assets/product/`, totaling
   607,427 source bytes. Do not create a duplicate asset file, modify a source
   master, promote the empty-handed Wizard/raw Threadball/rejected Terrain
   Interior, generate an atlas, or add scene code. Prove the exact path
   allowlist, source/copy hashes, approved-assets inventory, media budget,
   manifest/compliance, build, and audit before C starts.

WP-015C remains blocked until B3C.1 has made that manifest-approved runtime
inventory available and it can express one
complete exchange without generation, manual source repair, or unapproved test
paths. B3 changes no gameplay rules and integrates no product media into the
combat scene.

### WP-015C First Playable Visual-Slice Re-entry

WP-015C is integration-only. Its inputs are the runtime-copy-approved B3 Wizard
presentation, Threadball derivatives, Patch layers, shared minimum effects, and
their manifest metadata. It instantiates the same Wizard presentation for the player and AI
Loomkeeper. The authoritative Loomkeeper actor, rules, labels, and team/position
cues remain distinct even though the temporary character art is shared. C may
add client asset loading, atlas/state mapping, socket attachment, decorative
composition, failure fallback, and presentation-event binding. Threadball
gathering/levitation binds only to the existing aim/fire preparation, release to
the authoritative release frame, and unspooling to the authoritative impact.
These visuals do not change physics, damage, collision, or replay truth. C may
not generate/refine art, repair source pixels, approve licenses, change
simulation/collision authority, or introduce the v3 Relic ruleset.

Acceptance requires one deterministic player-and-Loomkeeper exchange through
move, aim, fire, projectile flight, impact, Stitching damage, and result at every
maintained phone viewport and under reduced motion. Decorative Patch pixels never
define collision. V1/v2 replay truth and authoritative event timing stay intact.
Run compliance, build, the full zero-retry browser matrix, bundle/media budget,
and the Ubuntu visual-candidate workflow. Inspect the Ubuntu candidate explicitly;
never approve new baselines from Windows. A separate real-phone acceptance is
required before WP-015D batch production begins.

### WP-015B0 Approval And Canonical Baseline

WP-015B0 is the no-product-output pre-production gate. A bounded technical
smoke may write an untouched file to external quarantine to prove the reviewed
workflow; it must not create or promote a product asset. B0 records:

- the canonical baseline at
  `docs/images/art-direction/knotkin-class-lineup-concept.png`, SHA-256
  `B4B9B1E676E7DD5CD13F7ABB2B63048884D209295379FCC10347348F80D5FD46`;
  its location under `docs/images/` is deliberate because it is a generation
  and review reference, not a runtime asset,
- the project owner's report that the Nimiq team/foundation encourages the
  inspired body geometry for the Mini App competition and brand connection,
  plus the owner's historical approval to explore that direction. WP-015B2G
  later supersedes the anatomy requirement after production evidence while
  retaining the palette/textile brand connection, without authorizing official
  Nimiq brand files or an official-product claim,
- project-owner approval of the exact archived checkpoint, exact pinned
  text-to-image workflow, and project-owned image-conditioned workflow recorded
  in `legal/generation-component-manifest.json`, and
- the continuing exact-output gate: an approved model and workflow produce
  quarantined candidates, never automatically approved product assets.

The B0 technical smoke used seed `15015000`, four steps, CFG `6`, Euler/normal,
and denoise `0.35`. It produced a valid 256x256 PNG only in external quarantine
(SHA-256
`72CAC609419A83B8501B001D2E011C3D213373AC9D62B05C0C9022D4762F468D`).
This proves image-plus-text execution, not art acceptance, product approval, or
runtime integration.

The earlier `cotton-clash-battle-study.png` remains useful for material and
battlefield mood, and `knotkin-calling-lineup-study.png` remains useful for the
Calling vocabulary. Both are superseded for anatomy.

### WP-015B1 Frozen Vertical-Slice Contract

The normative Wizard, Loomkeeper, Threadball, and first-Patch briefs are in
`docs/asset-briefs/wp-015b1-vertical-slice.md`. They preserve historical
prompts, primary seeds, workflow settings, character pivot, baseline, and
projectile metadata, while the B3B Loomseed amendment supersedes the
empty-palm/held-Relic presentation rule with a palm anchor and aim-direction
emission rule. B1 generates and promotes no media.

The complete multi-character lineup is a visual and review reference, not the
ordinary VAE starting image. B2 begins with one isolated text-to-image candidate
for each registered purpose. The image-conditioned workflow may refine only an
isolated, reviewed quarantined master staged through `StageInput`. A rejected
candidate does not authorize seed shopping, prompt drift, or generic MCP
publication.

### WP-015 Basic Assembly Scope

WP-015 is an integration-first asset pass. Its purpose is to make one complete
artillery exchange readable on a phone—move, aim, fire, projectile flight,
impact, Stitching loss, result—not to finish every animation, environment
layer, effect variant, or balance dimension before anything is assembled.

The required basic inventory is:

- four character masters with common anatomy, baseline, scale, handedness,
  source focus-anchor, and projectile-origin contracts,
- only the animation states currently triggered by the playable loop,
- one icon, held sprite, projectile, simple trail, and simple impact for each
  of Threadball, Needlepoint, and Spoolburst,
- shared basic Stitching-damage, Unraveling, victory, and reward effects,
- one Patch with a scalable fill, one cotton-cloud or distant layer, and
  repeatable terrain top and interior materials,
- Calling portraits and Relic icons while touch controls and essential status
  text remain accessible HTML/CSS, and
- a small combat/result audio set after the visual loop works end to end.

Production starts with one Wizard presentation reused for both combatants,
Threadball, and one Patch as a single vertical slice. It must pass in-engine
phone review before the distinct Loomkeeper, remaining Callings, and remaining
Relics are produced through the proven pipeline. Additional Patches, foreground
dressing, high-detail VFX, full animation coverage, Calling-specific effects,
precision and radius differentiation, and final weapon tuning are explicitly
deferred.

### Production Decomposition

The lineup concept contains enough information to begin production, but it is a
composited front-facing scene. It must be decomposed through newly generated
assets rather than cropped into the game.

Character production starts with four isolated 512x512 RGBA masters: Wizard,
Thief, Warrior, and a Loomkeeper opponent variant. Each master shows one full
Knotkin facing right in an orthographic-like three-quarter side view on
transparency so both bead eyes remain visible. The feet share a stable baseline,
the entire silhouette remains inside motion-safe padding, and there is no
scenery, text, framing, or second character. Exactly two bead eyes, one small
expression-ready mouth, Calling costume topology, body proportions, palette,
lighting direction, and handedness must remain stable. One intentional stitched
eyebrow above each eye is optional when it improves friendly expression. No
nose, extra eye, duplicated mouth, or unrelated facial feature is introduced.
Every pose also obeys a common focus-anchor and projectile-origin contract so
separate visual effects can attach consistently without becoming collision
authority. The current Wizard route is the specific exception to a generic
interchangeable held-Relic model: it composes a permanent Loomseed at the
anchor and launches a distinct temporary Threadball.

Relics and effects are separate transparent asset families. Each of the three
starting Relics receives a phone-readable icon, held sprite, projectile,
simple trail, and simple impact. Stitching damage, Unraveling, victory, and
Prize Loom reward effects may use shared basic families. A Relic should remain
separate from the character atlas when practical. If a pose must bake in a
Relic, that atlas is a separately named derivative with its own parent hashes
and manifest entry.

The first Patch is not one flattened painting. Produce:

- a scalable sky or fabric fill,
- one separate cotton-cloud or distant-decoration layer,
- repeatable terrain top and interior materials.

Banners, loom structures, extra props, edge variants, and foreground dressing
are later detail passes unless the basic phone composition cannot be read
without them.

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
3. **Master review:** reject anatomy, eye count, mouth count/placement,
   silhouette, costume, lighting, perspective, equipment, alpha, or third-party
   similarity drift.
   Only a reviewed master proceeds.
4. **ComfyUI refinement:** use only when every checkpoint, VAE, LoRA,
   ControlNet, embedding, upscaler, and custom node has approved commercial-use
   evidence. Record workflow JSON and hash, seed, sampler, scheduler, steps,
   CFG, dimensions, denoise, component names, versions, licenses, and hashes.
   For image-plus-text refinement, use `StageInput` and the reviewed
   `generate_image_conditioned` graph; record the staged source hash and safe
   relative `reference_image` returned by the command.
   If the model inventory is not approved or the server is unavailable, skip
   refinement or stop; do not substitute an unrecorded local workflow.
5. **Deterministic master normalization and approval:** preserve the untouched
   generator output externally. Through a versioned script and configuration,
   produce a real-alpha isolated master with reviewed crop, padding, baseline,
   pivot, and source focus-anchor. Review exact-output IP/provenance, visual
   identity, alpha edges, and phone readability. Only the exact normalized
   master may receive source-asset manifest approval; do not assign a runtime
   path until a runtime derivative is ready.
6. **Presentation-route admission:** use the admitted deterministic root
   presentation where it is sufficient. It may compose only approved derivative
   parents at recorded anchors and may not alter source pixels. Any later
   animation service must separately pass its license, privacy, output-rights,
   identity-control, and durable-evidence review before uploading the approved
   isolated character master. AutoSprite's B3B route is closed after two failed
   pilots and cannot be retried or treated as an approved dependency.
7. **Deterministic runtime normalization:** normalize runtime frame size, pivot,
   baseline, padding, alpha, naming, timing, and atlas metadata through a
   versioned script and configuration hash. Preserve every untouched service
   download externally and keep source-master and runtime-derivative lineage
   explicit.
8. **In-engine staging:** load quarantined candidates through a test-only path,
   render deterministic gameplay states, and capture the automated phone
   viewports. Staging cannot place unapproved files in product `assets/`.
9. **Review and refinement:** run art, animation, IP, provenance, canvas,
   visual-diff, and phone-readability checks. Permit at most three scoped
   retries for one failure signature; rejection does not relax the contract.
10. **Promotion:** add exact final hashes and evidence to the manifest, update
   attribution when required, copy only approved runtime files into `assets/`,
   then run compliance, build, browser smoke, and relevant visual tests.

### Basic Animation Contract

The initial Wizard route does not require a generated character atlas. It uses
the intact approved source master with deterministic root transforms and a
separately composed permanent Loomseed; all presentation transforms inherit the
same root and cannot move authoritative actor position. A later raster-animation
route requires a separate admission gate. The initial state contract is:

| State | Frames | Loop | Required behavior |
| --- | ---: | --- | --- |
| `idle` | 1 source + root loop | yes | Minimal breathing/thread motion; Loomseed stays at its anchor |
| `move` | 1 source + root loop | yes | Presentation follows authoritative movement without position drift |
| `aim_low` | 1 source | holdable | Low trajectory pose with stable Loomseed anchor |
| `aim_mid` | 1 source | holdable | Mid trajectory pose with stable Loomseed anchor |
| `aim_high` | 1 source | holdable | High trajectory pose with stable Loomseed anchor |
| `fire` | 3 effect phases | no | Glow, temporary Threadball formation, and launch from the emission origin |
| `hit` | 1 source + root pulse | no | Cotton compression without anatomy mutation |
| `unravel` | deferred | no | Non-graphic defeat ending in thread and fluff |
| `victory` | deferred | yes | Compact celebration that stays inside padding |

`jump_start` is deferred because the current command model has no jump action.
Dedicated `fall` and `land` states remain reserved until the presentation layer
has a visible deterministic settling trigger. A later animation expansion must
update this contract before production and cannot be inferred from unused
placeholder state names.

The Fire sequence is `glow -> temporary formation -> launch`. Its temporary
projectile starts from the root-transformed Loomseed emission origin and leaves
the permanent held focus behind. Runtime mirroring is allowed only after a
handedness and costume-asymmetry review. A later atlas must start from the
512x512 master and receive its own normalized frame, pivot, baseline, and
phone-readability review; it cannot be inferred from this procedural route.

### Runtime Naming And Placement

Use stable kebab-case asset-family IDs and group approved files by role:

```text
assets/product/characters/knotkin/{wizard,thief,warrior,loomkeeper}/
assets/product/relics/<relic-id>/
assets/product/effects/<effect-id>/
assets/product/environment/patch-01/{background,props,terrain}/
assets/product/ui/{callings,relics,reward}/
assets/product/audio/{combat,result,reward}/
```

If an atlas is later admitted, frame names follow
`<calling>/<state>/<zero-padded-frame>`. The B3C presentation configuration
instead records root-transform settings, the Loomseed anchor, the
aim-direction emission rule, and the Fire phases. Source masters, service
downloads, rejected outputs, videos, workflows, and intermediate frames remain
in ignored quarantine rather than the runtime tree.

### Asset Acceptance

Before promotion, automated and reviewer evidence must establish:

- exactly two eyes, one controlled mouth expression, optional intentional
  paired stitched eyebrows, no nose/extra eye/duplicated mouth/unrelated face
  mark, and stable anatomy, costume, palette, lighting, and equipment identity across
  every character frame,
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

The client build accepts root product assets only through
`scripts/copy-approved-assets.js`. A manifest entry must be approved and name a
unique path below `assets/product/`; the copy step checks byte equality and
writes the served inventory to `/assets/approved-assets.json`. The path is
tested with isolated tooling fixtures. WP-005 intentionally assigns no runtime
path to the Pocket Robot, so it remains outside the client build.

## Clean-Room Reference Loop

Only a reference-observer role may inspect Sorcerers. It produces a
behavior-only record with observable inputs, outputs, transitions, and timing.
The implementation worker cannot access Sorcerers or its quarantine and uses
only the frozen record, the MIT Turtle base, and independent sources. A separate
reviewer may compare both sides but returns only bounded contamination findings.

Each observation is registered in `legal/clean-room-records.json` and conforms
to `legal/clean-room-record.schema.json`. The initial `observed` stage records
the observer, pinned source, viewed material, and frozen behavior-record path
and SHA-256 before implementation begins. The `complete` stage adds a separate
implementer and reviewer, the implementation declaration, passing similarity
decision, and behavioral-test evidence. A work-package record that declares
Sorcerers use must link at least one observed record and cannot complete until
that record completes.
`npm run check:clean-room` verifies hashes and role separation and fails closed
on incomplete entries.

The import gate and registry checks are supporting evidence, not proof that GPL
expression was not copied. Completion still requires human similarity review
and relevant behavioral tests.

## Nimiq Developer Capability Readiness

Checked 2026-07-21 against the official Nimiq Developer Center, published npm
metadata, and the SDK source package:

- Install the official Mini Apps Agent Skill with
  `npx skills add nimiq/developer-center --skill mini-apps`; see
  `https://nimiq.dev/mini-apps/build-with-ai`.
- The official documentation MCP endpoint is
  `https://nimiq.com/developers/mcp`; see `https://nimiq.dev/ai/mcp`.
- Mini Apps run inside the Nimiq Pay WebView. The documented Nimiq provider
  entry point is `init()` from `@nimiq/mini-app-sdk`; see
  `https://nimiq.dev/mini-apps/`.
- The implemented pre-1.0 `@nimiq/mini-app-sdk` dependency is exactly pinned at
  `0.1.0`; its npm metadata declares MIT and points to
  `nimiq/trust-web3-provider` branch `nimiq`, directory
  `packages/mini-app-sdk`. Package-license and audit gates passed with the pin.
- The documented Nimiq flow uses `listAccounts()` and `sign()`. Signing returns
  hex `publicKey` and `signature`, so server authorization must verify both the
  signature and public-key-to-address relationship against a server-issued
  canonical challenge.
- The provider contract can resolve an `ErrorResponse` instead of rejecting.
  Every adapter call must validate the resolved union before reading account or
  signature data, and user rejection must settle without an automatic retry.
- Host language is available through the SDK helper or
  `window.nimiqPay?.language`. The optional device identifier requires a reason
  and consent on first use, is scoped to the mini-app origin, identifies a
  device rather than a user, and is never an authentication credential.

The repository does not vendor the skill or configure the MCP. WP-012 used the
official primary documentation, repository, and npm metadata directly, exactly
pins the reviewed SDK, and exactly pins Apache-2.0 `@nimiq/core` `2.7.1` for
server-only verification. The server build externalizes `@nimiq/core` so its
packaged WASM resolves beside the installed dependency; the identity bundle
gate confirms that core/WASM does not enter the browser build and that the SDK
remains a lazy client chunk. Nimiq Pay allowlisting and physical WebView testing
remain external-environment checks.

WP-012 provider access is lazy and explicit. Application boot and Start
Practice must never wait for `init()`. WP-012 uses a query-gated identity
acceptance surface; WP-013 owns the production rewarded-challenge identity
entry. No wallet action belongs in the combat HUD, Pause sheet, or an active
turn. Cancel all owned pointers before native approval and resynchronize the
visual viewport, full-screen, and sideways state when it settles. A future
feature that truly requires an in-match wallet dialog must separately specify
authoritative interruption semantics; it cannot inherit Practice pause behavior
implicitly.

Real-device acceptance added one lifecycle requirement: every server-created
authorization that does not reach `identity.complete` must be explicitly
cancelled when the provider rejects, times out, or returns a malformed result.
The cancellation request is bound to the current authenticated session and
socket, consumes only its own opaque authorization ID, is idempotent from the
client's perspective, and grants no identity. A rejected signing dialog must
permit an immediate same-account retry rather than waiting for server expiry.

### Nimiq Signed-Identity Security Rules

WP-012 was cross-checked on 2026-07-21 against pinned official
`trust-web3-provider`, Hub, Keyguard, and Wallet sources plus the community
`onmax/nimiq-auth`, `Harlski/nspace`, and `Nuxt-Nimiq-Login` implementations
listed in the implementation plan. Community repositories are behavioral
review evidence only; they are not approved import sources.

- The server creates a CSPRNG challenge with a short expiry and retains the
  canonical message. A client submits only the opaque authorization ID,
  address, public key, and signature; it never chooses the verified message,
  origin, network, purpose, time, or connection binding.
- The displayed message is printable ASCII with fixed fields and LF endings.
  Keep it short enough to inspect in the wallet approval view. No JSON
  serialization, localization, arbitrary user text, or URL-carried proof is
  part of the signed format.
- Verify the official Nimiq signed-message prefix, JavaScript character length,
  SHA-256 construction, signature, and public-key-derived address through an
  exactly pinned server-only Nimiq library. Raw-message Ed25519 verification and
  Keyguard's separate Connect Challenge prefix are not equivalent.
- Atomically consume a pending attempt before proof verification. Invalid,
  expired, concurrent, replayed, disconnected, or restarted attempts fail
  closed and require a new challenge. Limit outstanding state and begin/complete
  rates by connection, anonymous session, IP, and address-derived privacy-safe
  key.
- Return uniform authorization failures and keep secrets and wallet material
  out of logs. Server diagnostics may retain only sanitized reason codes and
  opaque/hash-reduced correlation values.
- A provider account list is selection UX, not authority. The verifier derives
  the address from the signed public key and compares it with the address bound
  to the server-created attempt. Never trust a client mode/provider flag.
- Production identity mode requires explicit public-origin, allowed-origin, and
  Nimiq-network configuration. A successful proof rotates into a fresh opaque
  server session; no pending challenge, proof, public key, raw address/device
  identifier, or reusable signature belongs in that token.

The implementation gate includes official-prefix golden vectors, raw-message
and wrong-prefix negatives, canonicalization mutation tests, resolved provider
error tests, concurrent replay, consume-on-failure, server-only bundle
inspection, and a Render-built startup smoke. Prefer the official crypto
implementation over copied helpers; if package size or WASM loading blocks the
server target, stop at the dependency spike and document the compatibility
decision rather than substituting handwritten cryptography.

## Mobile Touch Reference Protocol

WP-010 uses two pinned MIT source references plus current standards documents.
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
   controls power. The advisory preview runs against a clone of the current v2
   snapshot through the shared deterministic simulation API. It cannot mutate
   authoritative state or submit a command, and the next server snapshot wins.
3. **Aim release:** ordinary release freezes the selected angle/power. It does
   not fire. Release outside, `pointercancel`, lost focus, hidden document,
   scene pause/shutdown, resize, or orientation change cancels the gesture.
4. **Fire:** a separate minimum 48 CSS-pixel button submits one idempotent Fire
   command only from the `aim_locked` state. Duplicate taps, stale turns, or a
   suspended scene cannot submit another command.
5. **Relics and commands:** Relic selection, pause, retry, and confirmations use
   large tap targets. WP-010 provides the presentation affordances; WP-011
   connects them to authoritative practice pause/resume and fresh-challenge
   retry. Rewarded challenges remain unpausable.
   Swipe, pinch, long-press, hover, and multi-finger chords are not required for
   the competition release.
6. **Camera:** automatic active-Knotkin and projectile framing is the default.
   Optional battlefield panning can be added only when no control owns the
   pointer and it cannot alter simulation state.
7. **Lifecycle:** the input adapter has explicit `idle`, `moving`, `aiming`,
   `aim_locked`, `submitting`, and `suspended` states. Every cancellation path
   clears vectors, visual pressed states, timers, and pointer ownership before
   returning to a safe state.
8. **Wallet interruption:** opening a Nimiq Pay approval dialog suspends input
   and turn timing. Resume requires a fresh pointer-down; a pre-dialog contact
   can never continue or fire afterward.

The implementation may tune the 18% dead zone or layout-relative control radius
only through recorded phone-emulation evidence. It must not tune by copying
constants from a reference implementation.

WP-010 consumes v2 `ChallengeSnapshot`, `RELIC_IDS`, and `RELIC_RULES` as its
source of gameplay truth. The fixed simulation battlefield is 128x72 cells at
8 units per cell, or 1024x576 logical units. A scene-local layout adapter maps
that world to the current camera while keeping portrait controls, landscape
reflow, safe areas, and browser chrome outside gameplay coordinates. Keep the
combat layout, snapshot renderer, touch-control state machine, command adapter,
and HUD/pause overlay as separate responsibilities; do not grow the imported
room-oriented `GameScene` into one combined lifecycle and combat controller.

### Reference Verification

WP-010 Playwright coverage uses Chromium at 360x640, 390x844, and 844x390 plus
WebKit at 390x844. WP-014 expands this to the complete 412x915,
visual-regression, network-degradation, and performance matrix. Across the
applicable matrix, coverage must exercise:

- touch-only completion at every configured WP-010 viewport,
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
