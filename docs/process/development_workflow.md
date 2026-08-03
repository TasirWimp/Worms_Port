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
  -> animation/export -> deterministic normalization -> in-engine phone captures
  -> art/IP/provenance review -> manifest approval -> assets/ promotion
```

All Knotkin production briefs use
`docs/images/art-direction/knotkin-class-lineup-concept.png` as the canonical
visual reference. The image remains documentation-only: it cannot be cropped,
traced, or shipped directly. It may be supplied to an approved production tool
as the user-selected creative conditioning reference only when the tracked path
and SHA-256 are recorded in the generation evidence. This does not resolve
rights to official Nimiq brand files. WP-015B0 separately records the project
owner's attestation of Nimiq team/foundation encouragement and project approval
of the inspired body geometry. A brief must record all other inputs and
explicitly block Sorcerers, Worms/Team17, realistic firearms, unlicensed logos,
and recognizable third-party characters.

Built-in image generation is used for rights-safe concept masters, ComfyUI for
reproducible controlled refinement after every model component passes license
review, and AutoSprite for animation/export from an approved master. Record
prompts, negative constraints, workflow JSON and hash, seeds, model and custom
node versions and licenses, service/job IDs, parent/output hashes, postprocess
configuration, and reviewer identity.

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

Gate 1 remains component-only. Gate 2 added the two exact source workflows
described below, but the current `Prepare`, `Status`, `Start`, and `Smoke`
actions still describe and verify the approved SD 1.5 route; they do not yet
admit or verify FLUX.2. Do not change the bridge default model, hand an
arbitrary FLUX graph to `run_workflow`, or generate an image. Gate 3 must first
add the separate fail-closed pipeline profile.

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

`legal/generation-component-manifest.json` intentionally records both with
`runtime_enabled: false`. Their `runtime_path` values document the later Gate 3
copy targets; the files must not yet exist in the external bridge `workflows`
directory. Do not copy them manually or use generic `run_workflow`. Gate 3 must
make exact-hash installation and removal part of a named FLUX profile and must
fail closed on any component, path-config, workflow, or profile drift while
leaving the SD 1.5 smoke profile unchanged.

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
Comfy queue, and no new output file. Gate 4 remains the first FLUX inference.

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
  plus the owner's approval of that project direction, without authorizing
  official Nimiq brand files or an official-product claim,
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
`docs/asset-briefs/wp-015b1-vertical-slice.md`. They freeze exact positive and
negative prompts, primary seeds, approved workflow settings, character pivot,
baseline, held-Relic socket, projectile-origin offset, animation frame counts
and triggers, environment decomposition, and family acceptance checks before
candidate generation. B1 generates and promotes no media.

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
  held-Relic socket, and projectile-origin contracts,
- only the animation states currently triggered by the playable loop,
- one icon, held sprite, projectile, simple trail, and simple impact for each
  of Threadball, Needlepoint, and Spoolburst,
- shared basic Stitching-damage, Unraveling, victory, and reward effects,
- one Patch with a scalable fill, one cotton-cloud or distant layer, and
  repeatable terrain top and interior materials,
- Calling portraits and Relic icons while touch controls and essential status
  text remain accessible HTML/CSS, and
- a small combat/result audio set after the visual loop works end to end.

Production starts with Wizard, Loomkeeper, Threadball, and one Patch as a
single vertical slice. It must pass in-engine phone review before the remaining
Callings and Relics are produced in batch. Additional Patches, foreground
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
scenery, text, framing, or second character. Exactly two bead eyes, no mouth,
Calling costume topology, body proportions, palette, lighting direction, and
handedness must remain stable. Every pose also obeys a common held-Relic socket
and projectile-origin contract so the same separate Relic assets can attach
consistently without becoming collision authority.

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
3. **Master review:** reject anatomy, eye count, mouth, silhouette, costume,
   lighting, perspective, equipment, alpha, or third-party similarity drift.
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

### Basic Animation Contract

Every WP-015 character atlas uses the same basic state names and baseline. The
frame ranges are intentionally small so integration feedback arrives before a
large animation batch is produced:

| State | Frames | Loop | Required behavior |
| --- | ---: | --- | --- |
| `idle` | 4-8 | yes | Minimal breathing/thread motion; no silhouette drift |
| `move` | 6-8 | yes | Stable baseline and readable short stride |
| `aim_low` | 1 | holdable | Low trajectory pose with stable held-Relic socket |
| `aim_mid` | 1 | holdable | Mid trajectory pose with stable held-Relic socket |
| `aim_high` | 1 | holdable | High trajectory pose with stable held-Relic socket |
| `fire` | 4-6 | no | Names the exact projectile release frame and origin |
| `hit` | 3-4 | no | Cotton compression without anatomy mutation |
| `unravel` | 6-8 | no | Non-graphic defeat ending in thread and fluff |
| `victory` | 6-8 | yes | Compact celebration that stays inside padding |

`jump_start` is deferred because the current command model has no jump action.
Dedicated `fall` and `land` states remain reserved until the presentation layer
has a visible deterministic settling trigger. A later animation expansion must
update this contract before production and cannot be inferred from unused
placeholder state names.

Generate right-facing source frames. Runtime mirroring is allowed only after a
handedness and costume-asymmetry review. Otherwise produce and track a separate
left-facing derivative. Start from 512x512 masters and normalize the first
runtime candidate to 192x192 RGBA frames with a pivot at 50% horizontal and 88%
vertical. Changing frame size, pivot, or baseline requires recorded in-engine
phone-readability evidence and an update to the asset-family brief.

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

Atlas frame names follow `<calling>/<state>/<zero-padded-frame>`. The atlas
records frame rectangles, pivots, durations, loop hints, the held-Relic socket,
the projectile origin, and the release frame for `fire`. Source masters,
service downloads, rejected outputs, videos, workflows, and intermediate
frames remain in ignored quarantine rather than the runtime tree.

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
