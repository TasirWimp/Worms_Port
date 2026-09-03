# WP-015D3A V8 Action-Turn Preparation And Contract

Date: 2026-09-02. Status: V8A v0 finite rules contract complete and independently
reviewed; V8B authoritative foundation complete and independently reviewed,
with live V7 unchanged. V8C touch presentation is complete as a bounded
engineering slice, verified and independently reviewed.
2026-09-03: V8C.1 combined-control/traversal correction is complete as a bounded,
verified engineering slice, with original V8 identity and replay preserved.
WP-015D3A remains `in_progress`; its reference record is only `observed`.
V8B/C delivered candidate-only engineering implementation, not player observation
or production activation. Source-bound review returns are in sections B/C/C.1.

## Purpose and source boundary

Prepare the owner-approved, Sorcerers-inspired action-turn migration on the
existing MIT game, preserving a practical V7 fallback and the analytical route.
This is an intermediate playable-candidate plan, not a balance proof or a port
of Sorcerers. V8A's finite contract and V8B's authoritative foundation are
complete; V8C and V8C.1 touch/traversal implementation is verified. V8D AI and
full lifecycle are next but not started; production promotion remains deferred until
all implementation and activation gates pass.

- Product base: `dc66d2ac0f02b1b7c47f6949816a7cbc6e48e286`, freshly verified
  clean on `codex/wp-015d2z-v7-tactical-arena-v0`; `git fetch origin` confirmed
  the matching remote-tracking HEAD before preparation.
- Preparation branch: `codex/wp-015d3a-v8-preparation-v0`.
- Product predecessor: [V7 contract](wp-015d2z-v7-tactical-arena-contract.md)
  and [V7 evidence](../evidence/wp-015d2z.json), retained unchanged.
- Reference: [lorgan3/sorcerers at the quarantined pin](https://github.com/lorgan3/sorcerers/tree/0f45c4920321c0a3a14de30fe5cf44131a38da89),
  GPL-3.0 reference only, no imported code or assets. The only reference input
  for a future implementer is the
  [frozen behavior handoff](../evidence/wp-015d3a-v8-action-turns-behavior-record.md).
- Procedure: [development workflow](../process/development_workflow.md),
  including its Clean-Room Reference Loop, and
  [import boundary](../import-boundary.md).
- Review/check carrier: [WP-015D3A evidence](../evidence/wp-015d3a.json).

## Carrier search and exact preparation allow-list

Before creating these files, searches for V8, action-turn, migration, ruleset,
rollback, and WP-015D3A carriers found no existing suitable home. V7's frozen
contract/evidence describe different, completed mechanics; the implementation
plan is navigation, not a frozen reference handoff. WP-016 already owns
retention/distribution. A separate versioned contract and reference lifecycle
therefore belong in the existing planning/evidence homes.

The historical preparation changes were limited to these seven paths:

```text
.gitignore
.gitattributes
docs/planning/implementation_plan.md
docs/planning/wp-015d3a-v8-action-turns-contract.md
docs/evidence/wp-015d3a.json
docs/evidence/wp-015d3a-v8-action-turns-behavior-record.md
legal/clean-room-records.json
```

The registry change only adds the new `observed` row; it does not rewrite
the completed V7 row or change its policy. `.gitattributes` pins the new frozen
handoff to LF so its byte hash survives Windows checkout. `.gitignore` adds
only `.local-artifacts/rollback/`, a durable local archive home separate from
the disposable browser-test directories and third-party quarantine.

Only these generated files and the named local checkpoint tag are allowed:

```text
.local-artifacts/rollback/v7-dc66d2a/source.zip
.local-artifacts/rollback/v7-dc66d2a/built-runtime.zip
checkpoint/v7-before-v8-2026-09-02
```

That historical preparation pass allowed no client/server/shared code, test,
script, package, asset, schema, automation, other legal manifest, analytical
carrier, or CRPM change. It pushed no branch, created no PR and deployed no
service. V8B's later separate scope and source boundary are recorded below.

## Owner correction: shared Practice and rewarded combat rules

On 2026-09-02 the owner clarified that Practice and rewarded matches must use
the same ruleset; a mode-specific gameplay split is a bug, not a feature.
This supersedes the original proposal to activate V8 in Practice while keeping
rewarded matches on V7. The original preparation/review at `170f0bf` is retained
as history, not current authorization for that split.

Correction base: freshly fetched, clean local and remote HEAD
`170f0bf47d2fed94dd6240424e91f2ba99681f67`. The exact correction allow-list is
this contract, `docs/planning/implementation_plan.md`, and
`docs/evidence/wp-015d3a.json`; the owning roles are planning, docs, and review.
No new carrier is needed. The frozen reference handoff and its registry hash
remain unchanged. Its product-authored phrase "reward-mode pinning" now means
binding each match/replay to the shared approved version, **not** retaining
different current combat versions per mode. This owner correction takes
precedence over that historical product wording; source observations do not
change.

At this base, both modes already use `LATEST_RULESET_ID` =
`nimble-knots-artillery-v7` through the same `SessionRegistry` and both use
`standard` Loomkeeper difficulty. No current mode-specific ruleset defect was
found. Reward eligibility, daily seed selection, identity, entitlement, and
payout are mode policies around the shared combat engine. Existing Practice
pause remains a documented convenience, not a second combat ruleset. Do not
introduce different nominal turn clocks, movement budgets, Relic values,
terrain-generation rules, or AI behavior just because a match is rewarded.

## V7 recovery package

The annotated local tag `checkpoint/v7-before-v8-2026-09-02` peels to exactly
`dc66d2ac0f02b1b7c47f6949816a7cbc6e48e286`. It is not a movable V8 alias.

| Local artifact | SHA-256 |
| --- | --- |
| `source.zip` | `1125A60869BBE5D644FBA9FFBBFA1EF4911FC15BE8D985E04D53BDA2A3146BA5` |
| `built-runtime.zip` | `270C5F82E0A2B1F48237C5F878BE1D2FA4EDBD9086B7C05025439DF43D982A8C` |

`source.zip` is a Git archive of the exact V7 commit, not a working-tree dump.
It was generated with `git -c core.autocrlf=false archive`; all 524 files
match the commit's Git blob hashes exactly. The first archive attempt exposed
Windows line-ending conversion and was replaced before acceptance.
`built-runtime.zip` contains the existing `client/build`, `server/build`
(including its provenance proof), `package.json`, `package-lock.json`,
`server/migrations`, `server/data`, `LICENSE`, and `legal` from that clean
baseline. It includes 42 files, verified byte-for-byte against the originals.
It excludes `node_modules`, secrets, environment files, databases, sessions,
browser traces, and raw reference/quarantine material.

Before editing build inputs, the existing proof passed and `npm run
smoke:built` passed. The proof records Node `v23.6.0`, input digest
`6a8a78c00ed325cbad75528ee010455c4beeab17e29bed74df27596391bd8864`,
and output digest
`af3116474ad8c1baafdddf653ae500d55a7fd5f3551bebb8a3d543132beb6b2d`.
Adding the new legal registry row legitimately invalidates that old proof
against the preparation tree; do not rewrite it to pretend a build occurred.

Recovery procedure, not executed by this preparation:

1. Preserve any current work. Create a separate clean checkout/worktree from
   the exact V7 tag/commit; do not reset or overwrite an active checkout.
2. Preferred Render rollback: select that exact source commit through a
   separately authorized deployment, use `npm ci` and `npm run build`, and
   start with `npm start`. Recheck environment configuration separately.
3. For local recovery of the saved outputs, verify both archive hashes,
   extract `built-runtime.zip` into a fresh dedicated directory, install the
   locked runtime dependencies with `npm ci --omit=dev`, then `npm start`.
   This is not an offline dependency bundle or a tested Render container image.
   Source restoration/build tests must regenerate their own build proof; Git
   archive line endings need not reproduce the original working-tree digest.
4. Preserve the deployment's reward/identity configuration independently;
   never put keys or ledger data into these archives. No database downgrade,
   migration rollback, or live-session migration is authorized here.

The tag and archives are local only. A later separately requested push can
publish the tag; an off-device archive copy and a deployment rollback drill
are separate operational follow-ups. Do not delete this archive home as test
cleanup. The existing in-memory match architecture does not promise survival
across process replacement; switching a deployed ruleset needs an explicit
drain/restart policy, not an invented live-match conversion.

## Product migration and bounded versions

| Version | Product increment | Boundary |
| --- | --- | --- |
| V8 | Timed hold-to-walk, touch jump, one offensive cast, short movement-only retreat, visible turn/phase state, corresponding AI | Keep three existing Relics with V5 combat tuning, V7 terrain/opening generation, one actor per side; one shared ruleset for Practice and rewarded matches |
| V9 | Turn income/carry-over resource, affordable basic cast and differentiated costly options, one defense and one mobility utility | Separately contract economy, ballistics, stacking bounds, and AI; no copied reference tables |
| V10 | Movement-aware terrain and map-specific starts with useful exposure, cover, elevation, and reachable routes | Validate actual opening shots and replies; replace the fixed separation policy only here; first substantial marketing-preview checkpoint, not automatic release |
| V11 | Initially two actors per side, rotating active actors and shared team resources | Separately version team state, selection, elimination, UI, replay, and AI |

Each future version needs its own source-bound contract, scope and exact path
allow-list, immutable mechanics identity, tests, and review. These rows are a
sequence, not permission to batch-implement four versions now. Polish,
onboarding, pacing, sound, physical-device acceptance, and release checks follow
at a separate release checkpoint.

## V8 internal sequence

### A. V8A v0 finite product contract

Contract identity: `wp-015d3a-v8a-rules-v0`, authored on branch
`codex/wp-015d3a-v8a-rules-contract-v0` from
`f70cff9be71ea8ed47fa259ea0f6d4c5e92ac241`. Designer:
`Codex agent /root/v8a_contract_designer`, a fresh independent worker given
only the frozen behavior handoff, this contract, repository operating docs,
and MIT product code/tests. No reference source, quarantine, observer
transcript, external source, or historical agent was accessed. Values below
are product-authored candidate decisions, not observed reference constants
or validated balance. V8A edits only this existing carrier plus coordinator-
owned evidence/navigation; **B/C/D paths below are future-only**, not authority
to implement them during A. A distinct design review precedes B.

#### A1. Numerical rules and useful movement

| Item | Frozen V8 value |
| --- | --- |
| Combat identity | `nimble-knots-artillery-v8`; state/replay format and ruleset version `8` |
| World/start/Relics | Exact V7 generator, normalized seed/RNG, terrain words and opening pair; 2048 x 576 world, 8-unit cells; V5 Relic launch bands, damage, crater/damage radii and V3 direct-hit body; two actors, 100 Stitching, same Calling statistics |
| Clock | 30 ticks/s; action **450 ticks / 15 s**; retreat **60 ticks / 2 s**; projectile at most 300 ticks; each settling phase at most 120 ticks; 16 completed turns |
| Motion | Scale 256; horizontal velocity `-256`, `0`, or `256` fixed units/tick (30 world units/s); no acceleration, analog speed, sprint or movement-distance budget |
| Jump | Forward hop in current facing: `vxFp = facing * 256`, `vyFp = -2048`; gravity `+64` each airborne tick, downward velocity capped at `2048`; airborne episode cap 120 ticks; no air jump, input buffering, coyote time, jump-charge, or cooldown resource |
| Locomotion collision | Half-open 24 x 24 world-unit square about the actor root; 8-unit automatic grounded step-up; terrain and live actors block; no pushing or body penetration |
| Turn bounds | At most `450+300+120+60+120 = 1050` ticks / 35 s per turn; at most 16,800 combat ticks / 560 s per match; pause time is excluded, expiry is not |

The 15-second action candidate explicitly supersedes preparation's **initial**
30-second starting assumption; V1-V7 remain unchanged. At 30 units/s a
64-unit approach takes 64 ticks (2.13 s), leaving substantial aim time. A full
action travels at most 450 units; from the 640-unit opening, the stationary
opponent remains at least 190 centre units away (contact requires less than
24). Retreat travels at most 60 units, near the unchanged 64-unit damage
radius. V5's ideal maximum ranges remain Threadball 576, Needlepoint 640 and
Spoolburst 512: travel is meaningful beside those ranges without guaranteeing
an opening contact. Across action and earned retreat the maximum horizontal
travel is 510 units; projectile and settling add **zero horizontal travel**.
These are path-length upper bounds, not guaranteed traversable routes or
claims of fair opening damage. Camera-window speed is 30/1024 of its logical
width per second; touch feel remains untested.

On a clear level floor at `y=320` (roots `y=308`, clear overhead) the hop rises
124 units, has zero vertical velocity at tick 32, and returns on tick 63,
travelling 63 units. A canonical 80-unit
rectangular opening `[800,880)` is crossable from centre `x=807` to `x=870`: the
24-unit footprint initially overlaps the left support by 5 units and finally
the right support by 2. Merely touching the far edge is not support. This
requires a near-edge launch, not an automatic full-crater clearance from any
position. Height is useful against V7's 24-unit relief and a 40-unit-radius
crater lip; circular-crater routes still require the A8 tests, not inference
from this rectangular proof. No map or spawn rule is retuned to hide a failure.

#### A2. Integer update and collision order

`SimulationStateV8` is a separate type, not an extension that widens legacy
state validators. It keeps seed, RNG, turn, active actor, Stitching, selected
Relic, aim, terrain and terminal facts, but replaces `movementRemaining` and
`turnDeadlineTick` with phase state. Its hash includes `tick`, per-mutation
`revision`, `phase`, `phaseStartedTick`, `phaseDeadlineTick`, `settleReason`,
`castUsed`, `inputEpoch`, held direction/lease expiry, accepted-intent and
lifecycle-barrier counters, aim identifier and the
two units' `xFp`, `yFp`, `vxFp`, `vyFp`, grounded/support identity, `airTicks`
and `airDrive` (`jump`, `walk_fall` or null). A live
projectile also includes its fixed-point position/velocity, flight tick and
bounded trace. Coordinates in snapshots stay fixed-point; derived render
coordinates never overwrite them. Hash canonicalization uses sorted JSON
object keys, retained array order and integer values, followed by SHA-256.
No wall time, socket, mode, reward, input-packet cursor or animation field enters
the combat hash. Tick is bounded by 16,800, turn by 16, revision/epoch/aim ID
by 65,535; sequence exhaustion fails closed before uint32 wrap. Root x is
bounded to `[12,2036]*256`, root y to `[12,596]*256` (the final below-world
step can overshoot the death threshold by less than 8 units), and actor
velocities to `[-2048,2048]`; all must be safe integers. No silent unknown-
field acceptance or mixed identity is legal.

At state tick `t`, a validated intent changes intent state but advances no
physics. Advancing one tick performs steps 1-5, sets `tick=t+1`, then applies
step 6 and A3 against that **post-integration tick**. Increment `revision` once
for the complete tick including its zero-tick boundary transitions; accepted
mutating intents increment revision once. Thus step 449->450 is the last
action movement step, and the state at tick 450 has already timed out:

1. If finished, do nothing. Expire a lease when `t >= leaseExpiresTick`,
   clearing held input and changing its epoch before movement. It also zeros
   walking/`walk_fall` horizontal velocity, but not an accepted `jump` impulse.
   A lease accepted
   at `t` with expiry `t+9` can affect exactly steps `t` through `t+8`.
2. In action/retreat, a grounded actor uses the held direction as horizontal
   velocity. A jump sets airborne velocity immediately; it cannot jump again
   before a later landing. Airborne horizontal velocity is the take-off
   velocity: no steering or added speed from subsequent packets. A neutral/
   cancel barrier sets horizontal velocity to zero even in air; gravity remains.
3. Resolve horizontal movement first, then vertical. For each axis sweep the
   half-open body rectangle against intersecting 8-unit terrain rectangles and
   the other live body. Clip to the nearest blocking boundary exactly in
   fixed-point integers; positive-area overlap blocks, edge contact alone does
   not. No endpoint-only sampling, floating epsilon or pixel rounding. Terrain
   wins an equal-distance tie, then actor ID (`player` before `loomkeeper`).
   Inspect only cells intersecting the swept rectangle, within the 256 x 72
   mask; no unbounded search or recursive collision loop.
4. A grounded blocked horizontal move may try **one** 8-unit lift: both the
   vertical lift and the lifted horizontal sweep must be clear, and the final
   bottom must have support. Otherwise retain the ordinary clipped result.
   There is no lift in air and no downward snap. If support disappears, retain
   the last horizontal velocity with `airDrive=walk_fall` and fall. Jump uses
   `airDrive=jump`. Start either airborne episode at `airTicks=0`; each airborne
   integration increments it. For an airborne vertical step set
   `vyFp=min(vyFp+64,2048)`, then sweep by `vyFp`. Upward contact sets `vyFp=0`;
   downward contact sets `vyFp=0` and grounded only with stable support.
5. Stable support is positive horizontal overlap at exact bottom/top contact
   with terrain, or with the other live grounded actor. Process the lower
   root first, then actor ID; reevaluate supports after terrain/death changes.
   Two unsupported bodies cannot support each other in a cycle. Landing zeros
   horizontal velocity and clears airDrive/airTicks; held input can move again
   on the next tick. The live
   bodies may touch or stack, never overlap or push one another.
6. Sweeps already enforce world sides `[12,2036]` and ceiling `y>=12`.
   With `tick` now `t+1`, check below-world removal, support/death, airborne
   and phase deadlines in that order. Stable landing/death on airborne tick120
   wins over its cap; still unsupported at120 finishes draw `simulation_limit`.
   The bottom is open. A body whose top reaches `576` is removed with zero
   Stitching. There is no landing/fall damage, bounce, water or knockback.
   Apply the remaining phase/death ordering in A3; a hard phase boundary
   clears horizontal velocity, held input and aim and increments `inputEpoch`.

For unchanged V5 projectile/radial math only, project a root with
`floor(xFp/256), floor(yFp/256)`. Preserve the product's launch offset,
integer launch-speed curve, `+80` projectile gravity, per-world-unit swept
collision order, first-three-flight-tick shooter immunity, direct-hit profile,
integer-square-root damage and terrain deformation. The V8 projectile loop
performs one of those old flight iterations per authoritative tick instead of
calling V7's synchronous turn-changing resolver. Actor bodies are stationary
during flight. Motion gravity is not projectile gravity. A V7/V8 comparison
from identical integer grounded roots/aim must match projectile trace, impact,
damage and terrain, although clocks/phases/hashes deliberately differ.

#### A3. Complete phase and result table

Turn zero starts with the player, `action`, no held input/aim, `castUsed=false`,
and deadline `tick+450`. Each action/retreat phase is half-open: inputs are legal
only while `tick < phaseDeadlineTick`. A timer callback and a packet run through
one per-match serial authority; all already-due ticks precede that packet.

| Current condition/event | Deterministic result |
| --- | --- |
| Action: walk/face/jump | Legal for the living active actor; start/turn/motion clears aim. Facing costs no tick and changes no position; Jump needs ground and uses current facing, including from rest. |
| Action: select/aim/Fire | Selection and aim require both living actors grounded, neutral walk and zero velocity. Fire additionally requires the acknowledged current aim ID and `castUsed=false`; rejection never queues a future cast. |
| Accepted Fire at `t < deadline` | Set `castUsed=true`, clear input/aim after capturing launch parameters, enter projectile at `t`; first projectile integration is the next tick. No second Fire or movement is admitted during flight. |
| Projectile impact/world exit/lifetime | Terrain then damage use pre-settling roots; mark every resulting death before checking terminal state. Clear unsupported ground flags. Enter `settling(post_shot)` if any survivor lacks support; otherwise immediately apply the next row. World exit/lifetime cause no crater/damage. |
| Post-shot consequences stable | Both dead => draw; exactly one alive => its win. Otherwise the surviving caster enters a fresh 60-tick retreat. An already terminal result never creates retreat. |
| Action deadline, including airborne | Do not Fire, grant retreat, extend action, or transfer control in mid-air. Neutralize horizontal motion; enter `settling(action_timeout)` if needed, otherwise hand over. A Fire received at exactly the deadline loses to timeout. |
| Retreat | Only walk, free face and grounded jump. Aim/select/Fire reject; no buffered cast can reappear. At deadline neutralize horizontal motion and settle if needed, then hand over. |
| Settling, any reason | Vertical physics only for all unsupported survivors; no input or AI attack. Stable state applies all deaths, then either post-shot retreat or timeout handover. At tick 120, stability/deaths are checked first; still unstable => terminal draw `simulation_limit`, no snap-to-ground/teleport or endless timer. |
| Death outside shot | Finish immediately once all surviving bodies are stable (or both dead); if an unsupported survivor remains, bounded settling resolves it before awarding a winner. No dead actor acts or gets retreat. |
| Handover (zero-tick transition) | Evaluate terminal deaths first; increment completed turn count. On count 16 finish draw `turn_limit`; otherwise swap active actor, reset cast/aim/input and enter action with 450 ticks. No separate free AI turn or hidden animation time. |
| Finished | Exactly one result/hash; all later input/tick/cancel operations are inert or rejected without mutation. Terminal damage/death takes precedence over a coincident time limit. |

Horizontal motion is zero throughout both settling reasons and projectile:
jumping just before a deadline cannot buy extra travel or a mid-air attack.
Timeout on the final airborne step still resolves landing/death before the
turn-limit result. Exhausting a safety cap produces `simulation_limit`, never
a rewarded player win. There are at most two settling phases per turn.

#### A4. Input lease, packet order, scheduler and replay bounds

Use separately strict V8 input/snapshot/replay schemas and V8 event names;
legacy `v1:command.submit` retains its exact accepted meaning. Session identity,
challenge creation and reward eligibility continue through their existing
validated operations. An owned V8 match has a dedicated ordered input cursor;
it does not wait behind the legacy client's 5-second mutation acknowledgement.

| Boundary | Frozen V8 rule |
| --- | --- |
| Intent envelope | At most 1024 UTF-8 bytes; exact challenge/ruleset, expected turn, expected phase, server `inputEpoch`, uint32 input sequence and request ID; intent only (`walk_start`, `walk_refresh`, `face`, `jump`, `select_relic`, `aim`, `fire`). No position, elapsed time, target tick, duration or caller-supplied lease. |
| Lease | 9 ticks / 300 ms, server-issued. Client refresh target every 3 ticks / 100 ms; at most one lease extension per 3 simulation ticks. Refresh requires a currently live hold in the same epoch, never starts one. Release/cancel/expiry ends the hold; expired refresh must not resurrect it. |
| Neutral barrier | Separate `v8:input.cancel`, bound to player identity/challenge/current player turn and epoch but not blocked by an input sequence gap or pending acknowledgement. It clears only player-owned held/airborne horizontal motion and aim, increments that active-input epoch, and returns current cursors. Duplicate/old-epoch cancel and cancel during AI ownership are inert. It cannot jump, move, pause, aim, Fire or advance time. |
| Packet limits | V8 normal-input bucket: burst 20, refill 20/s, within existing 30-burst/20-per-second socket safeguards. Neutral-only lane: burst 2, refill 4/s, independent of the normal-input queue/bucket; excess is inert and the lease still expires. Existing authentication/origin/size protections remain. |
| Intent/replay budgets | 512 accepted normal intents per turn, including mutating refreshes, shared by player/AI; a limit rejection neutralizes only the authorized active submitter's input but grants no action/time. Identity/turn/phase checks precede that budget effect. At most 128 accepted lifecycle barriers per match; subsequent lifecycle abuse expires the match without a win. Neutralization never waits for ordinary budget. |
| Input ordering | Require exact next input sequence. Exact cached request+payload retry returns its original acknowledgement without replay, lease refresh or budget charge; changed-payload reuse rejects. Gap/stale/malformed input never applies later. Retain 256 request acknowledgements; older input remains stale. Well-formed expected-sequence rejection consumes the cursor, not a simulation tick. |
| Client pending bound | At most one normal request in flight and one coalesced unsent walk refresh; do not queue a Fire/jump for later replay. After 250 ms without acknowledgement cancel locally and best-effort send the neutral barrier, then resynchronize; no automatic movement/jump/Fire retry. Cancellation is independent of the pending request. |
| Tick scheduler | Monotonic server elapsed microseconds accrue integer credit `elapsedUs*30`; consume 1,000,000 credit per simulation tick. At most 6 ticks per callback, yield before another batch. Keep remainder/debt rather than rounding a 33 ms interval or dropping ticks. Input cannot advance the clock. |
| Catch-up failure | Debt exceeding 30 ticks / 1 s neutralizes and expires the match as unavailable, with no win. While debt is 1..30, catch up before admitting normal input. No late packet is retroactively inserted into missed ticks and no AI/planner work freezes its turn clock. |
| Replay | Format 8, exact ruleset/policy IDs, initial hash, contiguous accepted-intent/barrier/tick records with post-record hashes; maximum 32,768 records and 16 MiB UTF-8 JSON; each operation record at most 512 bytes. Adjacent ticks may coalesce, bounded by 16,800 total ticks. Reserve a terminal safety record/512 bytes. |
| Exhaustion/verification | Refuse oversized input before applying it; replay-cap failure records terminal draw `simulation_limit` in the reserve, never freezes an active match. Runtime **and** detached/reward replay verification use these same V8 caps; V1-V7 retain their existing caps and validators. |

Every accepted safety neutralization is an explicit canonical barrier; repeated
already-neutral cancels do not grow replay. Tick batching must produce the same
state/revision as the equivalent single steps; rejected packets are not replay
operations. Reconstruct from recorded authoritative operation order, not packet
arrival times, browser frames or a new latest alias. Replay format 8 cannot be
parsed as 7 or carry a V2 AI label. Budget accounting includes AI refreshes
and timeout completion; automatic phase/lease-expiry neutralizations count
toward the global replay cap but not the 128 external lifecycle barriers.
Reserve exhaustion
must be tested, not solved by silently increasing a limit during implementation.

#### A5. Pause, interruption and presentation

Practice retains an explicit convenience pause only in **player action with
both living actors grounded**, no pending projectile and no timer debt. The
server first catches up, then neutralizes and records the pause boundary;
there is no tick advancement while acknowledged paused. Resume reanchors only
wall-time credit, preserves remaining action ticks and increments the input
epoch. Pause/resume each use the lifecycle budget. Rewarded combat cannot
pause; this is the sole Practice convenience, not different combat tuning.

Hidden document, blur, pointer cancel/lost capture, resize/rotation, wallet
interruption and disconnect immediately cancel local ownership and normal
refreshes and attempt the neutral barrier. **Hidden is not automatic pause**
in either mode. Disconnection neutralizes server-side when detected; otherwise
lease expiry bounds walking/edge-fall horizontal intent to nine more steps.
A one-tap Jump is a committed impulse, not a held lease: releasing the Jump
button does not cancel it and no refresh/chord is required. It can complete
its 63-tick flat hop (at most 120 airborne ticks / 120 horizontal units before
landing, bottom removal or the airborne cap). A movement-pad release, explicit
cancel, detected disconnect or phase boundary zeros **all** horizontal motion,
including Jump; vertical physics continues. A lost connection not yet detected
can therefore finish the already accepted Jump, but cannot start another, and
never travels past the action/retreat deadline. Unpaused matches continue through
AI and timeout; an acknowledged Practice pause survives reconnect. Existing
30-minute session/challenge TTL and 2-minute reconnect grace still apply.
Player-origin cancel/disconnect/reconnect during the AI turn cannot reset its
epoch, motion, aim, selected plan or clock; only the server's AI/phase authority
can do that. Player connection bookkeeping then stays outside combat state.
Reconnect retains the match/version, advances an input epoch only while the
player owns active input and returns a
fresh snapshot/cursors; all held gestures and unsent actions are discarded.
Missing in-memory state offers a fresh match, never reconstruction as recovery.
No wallet prompt is initiated during live unpaused combat: authorization is
before creation and claiming after the result; unexpected host interruption
has the same neutralization rule, not a rewarded clock extension.

V8 walking snapshots coalesce to newest authority, not the V7 causal movement
queue. Send periodic snapshots every 3 ticks plus every phase/terminal barrier;
keep at most two interpolation samples, with at most 3 ticks of normal visual
lag. Phase/terminal changes immediately flush old samples and old shot animation;
never hide a live retreat behind a finished projectile. At more than 6 ticks
of stale authority, suspend controls/refreshes and reconcile to a new snapshot.
Owned hold survives ordinary same-epoch snapshots; interruption/phase change
requires a fresh press. No client extrapolation changes collision or health.
Walk is hold/release; a separate minimum-48-CSS-pixel Jump tap hops forward in
current facing without a chord; aim lock and explicit Fire remain separate.
Keep existing safe-area, right/left/off sideways and actual-landscape behavior.

#### A6. Bounded shared Loomkeeper policy

Pin V8 to `nimble-knots-loomkeeper-v3`, profile ID `standard-v8-0` and disclosed
difficulty `standard`; both modes and all Callings use them. V1 retains policy
v1; V2-V7 retain v2, including labels in
old snapshots/replays. No generic non-V1-to-latest policy dispatch is allowed.

At action start, freeze the public state and enumerate exactly 180 plans in
this stable order: six motion scripts x three existing Relics (Threadball,
Needlepoint, Spoolburst) x five angles `[15000,30000,45000,60000,75000]` x two
powers `[700,1000]`. Scripts are stay, toward 90 ticks, toward 180, away 90,
toward 90 with a Jump on its first movement tick, and away 90 with that Jump.
Toward means the opponent's root side at planning start; equality prefers the
current facing. At movement start, face the script direction, start its hold,
then apply its optional Jump. Movement duration includes airborne ticks; no
script grants a speed bonus. After movement, neutralize, face toward the opponent, lock aim
and dwell 15 ticks before Fire. If not grounded when the script needs aim,
wait for landing within the existing action clock; otherwise timeout, never
cast later from retreat. Every nonterminal selected cast uses the same retreat
script: walk away for at most its 60 legal ticks, no retreat jump.

Evaluate six plans per authoritative planning tick for 30 ticks; the actor
stays neutral while that **one second is charged to its action clock**. Each
detached rollout includes those 30 neutral ticks, its legal intent/refresh
schedule, the 15-tick aim dwell, and all shot/settle/retreat consequences.
Maximum 1050 rollout ticks per candidate (189,000 total), at most 512 intents
per candidate, one planning pass per AI turn and no opponent-turn lookahead.
Clones cannot consume live RNG, replay or clock. Apply deterministic aim error
before evaluation/execution: angle `((seed+97*turn)%5001)-2500`, power
`((seed+53*turn)%101)-50`, clamped to existing aim/power bounds. Rank plans
lexicographically by outcome (own win 3, ongoing 2, draw 1, loss 0),
`targetDamage-2*selfDamage`, final centre separation capped at 640, negative
movement ticks, then negative enumeration ordinal. Score is a bounded policy
decision, not a balance metric. A candidate requiring an illegal offensive
intent is discarded but still consumes its evaluation slot; if none remains,
the AI stays neutral until its ordinary deadline.

Execute only the chosen plan on later real authoritative ticks with the same
leases, validators and phase limits as human intent. No instant batch of movement
or AI-only clock advancement. Expected latest Fire is tick `30+180+15=225`
on level ground; any actual landing wait consumes the remaining action clock.
Planning/work failure yields neutral timeout, not a replacement search, extra
time or hidden shot. Record at most 16 turn-indexed chosen ordinals and
policy/profile in the V8 replay envelope; only committed legal intents mutate
the combat state. Deterministic
reconstruction validates policy identity and recomputes the chosen plan at
each AI turn before accepting its recorded intents.

#### A7. Exact future implementation paths (not V8A edits)

Inspection found the legacy one-second/30-tick registry timer, 16-command turn
cap, 2048-record coordinator, synchronous Fire/handover, immediate socket AI
driver, latest-only scene filter, and reward service's fresh legacy verifier.
Do not merely increase their global limits. Use separate V8 modules and a
versioned facade; keep `shared/simulation.ts`, `shared/protocol.ts`,
`shared/loomkeeper.ts` and `server/src/simulation/coordinator.ts` behavior and
legacy validators/hashes unchanged. The new facade owns the current shared
combat selector; existing historical exports continue to mean their old versions.

Each row is a closed source/test allow-list for that later slice. New modules
have a distinct V8 execution/validation role; existing carriers are reused for
integration. Any missing path requires a reviewed contract amendment first.

| Future slice | Exact paths | Bounded purpose |
| --- | --- | --- |
| B core (new) | `shared/simulation-v8.ts`; `shared/protocol-v8.ts`; `shared/combat-version.ts`; `server/src/simulation/coordinator-v8.ts`; `server/src/simulation/versioned-coordinator.ts` | V8 rules/types/strict schemas, tick/replay engine and discriminated dispatch; current selector remains V7 during B/C. The facade supplies common legacy/V8 snapshot/result/replay unions without widening old schemas. |
| B wiring (existing) | `server/src/session/registry.ts`; `server/src/protocol/socket.ts`; `server/src/runtime.ts` | V8-owned match creation, input/cancel lane, timer, phase dispatch, snapshots and injectable test clock; legacy operation paths remain unchanged. No automatic V8 creation for users yet. |
| B tests (new) | `tests/simulation/action-turns-v8.test.ts`; `tests/simulation/action-turns-v8-replay.test.ts`; `tests/protocol/action-turns-v8.test.ts` | A1-A5 arithmetic, phases, bounded replay and wire rejection tests using existing test globs. |
| C touch (existing) | `client/src/combat/contracts.ts`; `client/src/combat/input.ts`; `client/src/combat/controls.ts`; `client/src/combat/layout.ts`; `client/src/combat/renderer.ts`; `client/src/combat/presentation.ts`; `client/src/combat/preview.ts`; `client/src/combat/fixture.ts`; `client/src/combat/camera.ts`; `client/src/scenes/combat.ts`; `client/src/practice/client.ts`; `client/src/lib/session.ts`; `client/src/style.css` | Versioned view/command projection, fixed-point rendering, hold/Jump/Fire ownership, bounded reconciliation and legacy scene retention; explicit V8 fixture only until D. Reuse approved art unchanged. |
| C tests | New `tests/combat/action-turns-v8.test.ts`, `tests/practice/action-turns-v8-client.test.ts`; existing `tests/browser/combat.spec.ts`, `tests/browser/resilience.spec.ts`, `tests/browser/smoke.spec.ts` | Touch/phase/lease/interruption cases and V8 fixture coverage; keep legacy cases explicitly version-bound. No Windows screenshot-baseline changes. |
| D AI/lifecycle | New `shared/loomkeeper-v8.ts`; existing `shared/combat-version.ts`, `shared/protocol-v8.ts`, `server/src/simulation/coordinator-v8.ts`, `server/src/simulation/versioned-coordinator.ts`, `server/src/session/registry.ts`, `server/src/protocol/socket.ts`, `server/src/reward/service.ts`, `server/src/reward/types.ts`, `client/src/practice/client.ts`, `client/src/scenes/practice.ts`, `client/src/scenes/result.ts` | Pin policy, timed execution, joint selector promotion, old-version retention and exact ruleset-selected reward verifier/replay type only. No reward amounts, eligibility, ledger, migrations, signer or payout-policy change. |
| D tests | New `tests/loomkeeper/action-turns-v8.test.ts`, `tests/reward/action-turns-v8.test.ts`; existing `tests/protocol/runtime.test.ts`, `tests/protocol/schemas.test.ts`, `tests/practice/practice-client.test.ts`, `tests/reward/runtime.test.ts`, `tests/reward/service.test.ts`, `tests/browser/practice.spec.ts`, `tests/browser/reward.spec.ts`, `tests/browser-postgres/reward-postgres.spec.ts` | Shared-version/parity and complete lifecycle, legacy compatibility, no-fund replay-verified reward completion and database acceptance. |
| D admission assessment (new) | `tests/loomkeeper/action-turns-v8.assessment.ts` | Explicit non-default-glob entry for the 240-match paired plausibility assessment and full AI domain below; never implicitly run per ordinary feature edit. |
| D gate wiring | `package.json` | Add `assess:v8` invoking the named assessment with the existing Node/tsx test runner; add named V8 browser cases to the focused feature selector if necessary. No dependencies, removed tests, relaxed gates or expected-skip changes. |

The same new B/C tests may be extended in D for its stated purpose. Existing
golden fixtures/tests are read/run unchanged; new V8 replay tests add explicit
V7 frozen checkpoints without replacing old expected hashes. Normal evidence,
this contract and implementation-plan navigation are updated per slice; source,
asset and clean-room manifest changes are not smuggled through this source list.

#### A8. Frozen acceptance domain and stop criteria

Red tests below must be written before the corresponding runtime behavior.
At the V8A freeze, none was a V8 result; B's executed subset is now recorded
in its own review return, without claiming the remaining C/D gates. Exact seed domain is
`[1,2,3,4,17,42,1337,65535,2147483648,4294967295]`. Existing V7 read-only
generation confirms coverage of all three profile IDs. Use Wizard, Thief and
Warrior for shared-mode parity; no additional random seeds or tuned reruns.
Geometry fixtures are separate product test inputs: fill terrain from `y=320`
downward, root `y=308`, with clear space above. The openings clear columns
`[800,880)` or `[800,888)` all the way to the bottom, starting the jumper at
`(807,308)`. The ledge adds solid `[824,832)` from `y=296` down to the floor;
the 8/16-unit walking-step fixtures instead raise the floor from `x=824`
rightward to `y=312`/`304`. The crater fixture calls the unchanged product
deformation at `(832,320)` with radius40; settle the actor over its centre
before the jump-out check. All have safe world margins and enough headroom;
they are not new V7 production maps.

| Gate | Finite cases and pass boundary |
| --- | --- |
| Integer motion | Level floor holds of 1, 3, 9, 30 and 450 ticks; exact travel equals ticks in world units with lease refreshes. Repeated render conversions preserve an injected fixed-point remainder of 1/256. Mirrored movement and tick batches `[1]`, `[3]`, `[6]` agree at every common tick/hash. |
| Jump/collision | Level hop: tick 1 `vy=-1984`, tick 31 height 124, tick 32 `vy=0`, tick 63 landing/travel 63. Test the explicit 80-unit opening from x=807 (lands at870), and an 88-unit opening from x=807 (no same-height support at870); edge-only support fails. Test 8-unit step succeeds, 16-unit step blocks walking but a grounded jump crosses a 24-unit-high/8-unit-wide ledge. Use product `deformTerrain(...,40)` on a level floor for crater entry, jump out of its floor and lip landing; 0 penetration, no teleport. Test ceiling, side clamps, unsupported bottom death, live-body side block/stack and dead-body removal. |
| Phases | Cross action ticks 449/450/451, retreat 59/60/61, projectile 299/300 and settling 119/120/121 with grounded, ascending, descending, one dead and both dead fixtures. Fire at449 accepted if otherwise legal; at450 rejected; no second cast; no retreat after uncast timeout; all outcomes within1050 ticks/turn and16800/match. |
| Input safety | Lease refresh at t+2/+3/+8/+9; lost release; jump from rest with no refresh; explicit mid-jump cancel versus Jump-button release; exact retry, changed-payload retry, sequence gap, wrong turn/phase/epoch/ruleset, stale pre-pause/pre-reconnect packet. 512th accepted intent versus513th; cancel despite saturation/pending request; 256/257 cached requests; 128/129 lifecycle barriers. Player cancel/disconnect/reconnect during AI planning/walking/aim/retreat must change no AI combat field or clock. Zero extra position, time or revived input from rejected/duplicate traffic. |
| Scheduler/replay | Fake elapsed intervals of 33,333/33,334 microseconds; 6/7/30/31 due ticks; delayed input must follow catch-up. Exact caps at record32767/32768/32769, operation512/513 bytes and replay16MiB boundary, total16800/16801 ticks. Runtime and detached reward verifier agree, including legitimate replay longer than2048 entries. Reserved terminal slot always works. Tampered identity/hash/order/cap rejected; all legacy golden hashes unchanged. |
| AI | Feature correctness uses seeds1/2/3, both actor-side assignments and Wizard (six cases); explicit admission assessment extends to all ten seeds and three Callings. At most180 candidates/189000 rollout ticks, one plan/turn, charged30 planning and15 aim ticks. Repeat plan and executed hash sequence twice; every AI intent must pass human-equivalent validation. No live RNG/replay mutation by search, stale chosen plan or extra Fire. |
| Shared modes | For all ten seeds x three Callings replay identical authoritative combat operations/ticks through Practice and no-fund reward matches: compare every combat state/hash, AI plan, damage/terrain/phase/terminal field. Exercise creation, Fire/retreat, death/draw, reconnect, leave, expiry, retry and replay-verified reward result. Separately replay the same Practice pause/resume operations with 10-second versus 10-minute wall pauses: resumed state/hash must agree. Do not compare hashes from different operation histories (e.g. a Practice pause versus no rewarded pause); different mode metadata alone never changes combat. |
| Touch | Canonical phone feature gate plus focused right/left/off-sideways and actual-landscape cases: one-finger walk, release, Jump, aim/Fire; held pointer survives regular snapshots; blur/hidden/rotation/disconnect cancels; no stale Fire. At most two interpolation samples, 3-tick usual lag, suspend after6 stale ticks; retreat visible immediately on its authoritative phase. |

Bounded plausibility assessment in D: ten seeds x two map orientations
(original/reflected terrain and roots) x both starting actors x three opponent
scripts = **120 matches for V8**, paired with 120 V7 controls of the same
scenario provenance. Opponent scripts are stationary all-Relic aim lattice,
toward 90 ticks then that lattice, and toward 90 with one Jump then that lattice;
V7 controls use nearest legal V7 distance (64 units), omit unavailable Jump and
retreat, and retain the V7 action clock, explicitly recorded as version
differences. The opponent lattice and choice
rule are A6's fixed aim/Relic lattice/ranking; both starting orders apply it
to the opponent of standard Loomkeeper. These synthetic mirrored/starting-order
fixtures are assessment-only and never production map/start options. Keep this
assessment in `tests/loomkeeper/action-turns-v8.assessment.ts`, explicitly run
with `npm run assess:v8` at candidate admission and a daily/release checkpoint,
not in the normal `*.test.ts` feature glob. Outputs stay only under ignored
`test-results/`; these are engineering scenarios, not an analytical adapter or
player observation. The assessment and correctness tests use injected clocks
and deterministic tick advancement, charging the same simulation time without
real-time 15-second waits. Preserve the180-candidate/1050-tick work bounds and
stop on any invariant, cap, replay or parity failure; do not replace them with
wall-time-driven truncated search. Full assessment must not inflate every
feature edit into a daily matrix run.

Candidate promotion requires zero invalid starts, penetrations, stuck/aborted
simulations, mixed versions or illegal AI actions; all120 V8 matches terminal
within 16 turns; at most 12/120 turn-limit draws; no orientation/start/script
group of ten may have more than3 turn-limit draws. Record opening damage and
legal reply/cast availability, completed-turn counts, first-actor win/draw
splits per group and aggregate, and each policy's outcome. No preset win-rate
claim is made. A group with ten first-actor wins is a mandatory design-review
stop, not a reason to silently retune; otherwise these are bounded candidate
engineering gates, not fairness approval. Any failed numerical/playability
gate needs an explicit versioned contract amendment before changing values.

V8A checks actually run by the designer: read-only MIT source/path inspection,
V7 generation over the ten declared seeds, and arithmetic-only Node probes.
The revised hop probe computed apex 124, landing tick 63 and the stated 2-unit
far-edge overlap; full motion/collision integration is **not** implemented or
tested. The earlier 11.25-unit/s, 31-tick/11.625-unit hop arithmetic was rejected
as too narrow for useful product geometry; it is not a frozen option. No
build, V8 test suite, browser, physical-device session, observation, asset,
dependency, analytical execution or deployment ran in this documentation-only
slice. Remaining risks are touch pace, ledge/crater reach under the complete
collision solver, bounded-AI quality/CPU cost, network fairness under real
latency, and game balance; B-D's gates must resolve or report them.

#### A9. Shared activation remains one decision

Preserve one approved combat ruleset and AI configuration for both Practice
and rewarded matches. At the pinned baseline,
`server/src/session/registry.ts` correctly uses one `simulationRulesetId` for
both modes and defaults it to `LATEST_RULESET_ID`. Do not introduce per-mode
version selectors or use the reward flag to alter combat rules.

V8 promotion must update new matches in both modes together only after their
shared gameplay and reward-lifecycle compatibility gates pass. Changing a
latest alias alone is not sufficient verification. Keep each already-created
match and historical replay bound to its original identity; replay validation
uses that recorded identity, not whichever version is current later. A V7
match finishing after promotion is version preservation, not a mode split.
Candidate testing can keep payouts disabled and exercise rewarded-mode
compatibility with the existing no-fund test facilities; this does not require
different Practice combat rules or authorize real-fund activation. Do not
change reward eligibility, amounts, payout, ledger, or identity policy.

#### A10. V8A design review return

`Codex agent /root/v8_preparation_reviewer` returned `pass` against the V8A
diff from `f70cff9be71ea8ed47fa259ea0f6d4c5e92ac241`, after correction of
the out-of-world jump fixture, deadline off-by-one ambiguity, and the risk
of player cancellation affecting AI-owned input. Jump/lease semantics,
pause-history comparisons and the non-default assessment cadence were also
clarified. Reviewer and coordinator independently reproduced the arithmetic;
coordinator also verified square-body clearance for all 20 V7 starts in the
ten-seed domain. The interior fixture clears the ceiling throughout the
numerical hop. Full V8 collision integration is still untested.

Exact three-document scope, frozen reference/registry/manifests, historical
runtime/analytical paths, checkpoints/archive hashes, JSON/schema/navigation,
compliance and diff checks passed. V8A is complete **as a design contract**,
not shipped gameplay or implementation/similarity clearance. The package stays
`in_progress` and reference record `observed`. No V8B runtime edit, full suite,
browser/device session, player observation, push, PR or deployment occurred.
Detailed declarations and check facts remain in the linked package evidence.

### B. Authoritative movement, phases, and replay

Entry: owner continuation on 2026-09-02, freshly fetched clean V8A HEAD
`5025fbc7187d1aa6d57e6e16277f8be391592fbd`, isolated branch
`codex/wp-015d3a-v8b-authoritative-foundation-v0`. Only A7's B paths and the
three existing planning/evidence carriers are open. No suitable V8 source/test
carrier exists; the five new modules isolate a distinct version rather than
widening legacy behavior. Root owns documentation and verification, not V8
runtime implementation. Fresh no-history implementers and a distinct reviewer
apply the clean-room entry gate below. V8 remains injectable/test-only; C touch,
D AI/reward completion and joint promotion remain later gates. No V8 automated
opponent or reward-policy completion is claimed by this foundation.

**B integration clarification (reviewed before wiring):** an explicitly
injected internal test seam may create V8 fixtures with either mode's metadata.
Ordinary validated public challenge creation stays on shared V7 in both modes;
there is no request flag, environment switch or Practice-only rollout. Separate
V8 callbacks must not enter legacy policy-V2 snapshots or the legacy reward
verifier/payout path. Foundation replays reserve the exact A6 V3 policy/profile
identity, but contain only accepted combat operations, not an implemented AI
plan or chosen-plan verification. D still owns that verification, full public
reward lifecycle/parity and joint promotion. This is an integration boundary,
not a numerical rules change or a waiver of D's gates. Independent reviewer
`Codex agent /root/v8b_review` confirmed this B seam and the need for a neutral
lane that ordinary traffic cannot exhaust.

Fixture pause/leave also use V8-specific events and typed V8 acknowledgements;
the existing authenticated/ordered internal lifecycle operations can be reused,
but a V1 pause/leave event must not return a legacy acknowledgement wrapping a
V8 snapshot/result. Public V1 session creation, challenge creation and reward
eligibility remain unchanged. The reviewer confirmed this response boundary;
it does not add a production V8 entry point.

**B replay representation clarification:** a base intent/tick record that
neutralizes input automatically is followed by one non-mutating `automatic`
annotation per lease-expiry or phase boundary. Each annotation consumes one
of the same 32,768 record slots; it records the reason, authoritative tick,
final input epoch (and resulting phase for a phase boundary), with the same
post-operation hash. It does not represent an intermediate state or add a
physics tick/revision/external lifecycle charge. Base plus all annotations
must fit atomically while preserving the terminal reserve; boundary ticks
cannot coalesce across their annotations. Verification derives the exact
ordered annotations from the actual transition and rejects missing, extra,
duplicate or forged annotations. A self-contained terminal safety record
already records its neutralization and needs no extra annotation/reserve.
`Codex agent /root/v8b_review` approved this representation subject to these
checks. Frozen numerical limits and combat rules are unchanged.

**B clock-unit clarification:** catch-up debt means whole already-due ticks,
`floor(credit/1000000)`. Fractional credit is retained remainder, not another
due tick. Thirty due ticks plus a fraction can catch up; 31 due ticks expire.
A4's "1 s" denotes 30 ticks at the nominal rate, not an independent wall-time
cutoff that discards remainder. From zero credit, test elapsed microseconds
`1000000`, `1000001`, `1033333` (30 due) and `1033334` (31 due).
`Codex agent /root/v8b_review` confirmed this interpretation against A8's
explicit due-tick domain; the 30-due-tick cap and all phase durations stay fixed.

**Reachable replay-size bound:** at most 8192 accepted intents (16 x 512),
16800 tick base records, 128 external lifecycle barriers, 1866 lease-expiry
annotations (each requires at least nine elapsed ticks), a conservative 96 phase
annotations (six per turn, including extra allowance for entry/termination),
and one reserved terminal record give a 27083-record upper bound. With at most
512 bytes per record plus commas and a 1024-byte envelope, this is at most
13894603 bytes, below 16 MiB. These bounds
include automatic annotations and assume the frozen legal operation domain;
they are not evidence of a successful natural 32768-record/16-MiB session.
Verify the full raw-input ceilings at their exact boundaries and use lowered
test-only limits through the same live/detached code path to exercise atomic
reserve exhaustion. The distinct reviewer independently checked a tighter
80-phase-annotation bound; this return retains the implementer's larger bound.

Implement a separately identified `nimble-knots-artillery-v8` candidate and
compatible versioned transport/snapshot/replay boundaries. Preserve V1-V7
hashes, accepted command meanings, and replay reconstruction; do not widen
legacy validators globally. Current shared schemas cap the movement allowance
at 64, use two actors and the legacy phase model; they cannot silently become
V8 schemas. Snapshot and replay identities must agree and reject mixed versions.

Own phase intent: action -> shot resolution -> retreat -> handover; terminal
results take precedence. Allow no second offensive cast during retreat.
The initial shot commits damage and terrain before retreat. A killed active
actor or terminal match skips retreat; no retroactive dodge is claimed.
An action timeout hands over without an unearned retreat. Resolve what happens
to an airborne actor at timeout or handover, actor collisions, landing after
terrain destruction, and bounded failure/settling before code is accepted.

Use deterministic bounded integer ticks and server-owned held-input leases.
Store accepted intent transitions and tick advances in replay, not browser
frames, pointer positions, wall-clock deltas, or network jitter. A lost release
must expire safely server-side. Stale/duplicate/out-of-order input, timeout,
pause, reconnect, disconnect, and phase changes need explicit legal outcomes.
Old matches retain their ruleset identity; incompatible sessions are never
silently upgraded. Cross-process continuity remains outside the present design.

#### B review return — complete foundation, no activation

Source base is the freshly verified V8A commit above. The exact changed range
contains A7's eleven B implementation/test paths and the three existing
planning/evidence carriers, fourteen paths total. The source-bound SHA-256 is
`88d2fd2d919760d8dd96be0fd5a8efc516376371b8177756ad00bbb43a72814e`.
To reproduce it, lexicographically sort those eleven non-document paths,
construct rows `{path,gitBlob}` using each path's normalized
`git hash-object --path=<path> <path>`, then hash the UTF-8 bytes of
`JSON.stringify(rows)` without a trailing newline. This excludes the review
documents and their own commit identity, avoiding self-reference.

Fresh implementers `Codex agent /root/v8b_physics` and
`Codex agent /root/v8b_authority` declared only operating/product documents,
the frozen handoff and MIT product source/tests as inputs. They did not inspect
Sorcerers source, quarantine, observer transcripts, prior task history or
external sources; they changed only their two and nine assigned paths.
The coordinator made no V8 runtime implementation edits. Source/asset/package
and clean-room manifests, the frozen handoff, legacy simulation/protocol/AI/
coordinator and all analytical carriers remain unchanged.

Delivered: deterministic fixed-point walking/hopping/collisions, bounded
action/projectile/settling/retreat phases, leases and intent epochs, strict V8
transport/snapshot/replay identities, monotonic scheduler catch-up, atomic
replay reserves and detached reconstruction. Authenticated injected fixtures
cover both modes; independent cancellation survives input saturation, stale
queued packets cannot transfer through a cancel/disconnect/rebind, and player
lifecycle events do not cancel AI-owned input. Terminal results survive a
disconnect and deliver once after resume. Separate V8 callbacks do not enter
the legacy monetary verifier. AI-held test intents are not an implemented V8
Loomkeeper policy or a D reward-lifecycle result.

Checks and review:

- All 32 V8 physics tests and 35 V8 authority/protocol tests pass, zero skips.
  The focused suites include exact contract boundaries, legacy projectile
  parity, all ten seeds/three Callings/both injected modes, replay tampering
  and caps, and identical 10-second/600-second pause histories plus next tick.
  Initial red tests and regressions found during review are retained in the
  evidence record, not waived or converted into relaxed limits.
- Independent physics/test audit `Codex agent /root/v8b_test` passed 45 focused
  V8/legacy checks, 80 bounded turn probes and 360 extra V7/V8 shot comparisons.
  Distinct reviewer `Codex agent /root/v8b_review` returned final **pass**, no
  blocking findings, after fixes and independent targeted reruns. The last
  three regressions cover the bound session's failure cursor, AI input
  isolation and pause-wall-time invariance.
- Final-source `npm run verify:feature` passed: compliance, project typechecks,
  existing fast suites, production build, built-server smoke and all five
  canonical phone-browser tests (33.3 seconds for the browser portion).
  Reward-security, identity-bundle and bundle-budget checks also passed.
  The largest initial JS chunk is 1467842/1500000 bytes; initial JS/CSS gzip is
  406613/430000 bytes. Build proof matches exact declared inputs and outputs.
- Exact range, JSON duplicate keys/schema, local navigation, frozen digest,
  Git-byte legacy/manifest preservation, both checkpoint tags and archive
  hashes, and diff checks passed. Documentation finalization does not change
  the eleven-file implementation digest.

B is complete only as the injected authoritative foundation. Public creation
still uses V7 and standard AI for both modes. C touch integration, D automated
AI/full rewarded lifecycle/240-match admission assessment/shared activation,
the daily/release matrix, PostgreSQL integration, physical devices and human
similarity review remain open or deferred to their proper gates. No balance,
fairness, release or player-observation claim is made. The package stays
`in_progress` and its clean-room record stays `observed`.

### C. Touch controls and presentation

Entry: the owner separately opened V8C after pushing B. Fresh `git fetch origin`
confirmed clean local/remote HEAD `87ae3dad358f752ba64540e54d21a96b134d1e42`;
work is isolated on `codex/wp-015d3a-v8c-touch-presentation-v0`. This authorizes
only A7's C rows plus this contract, implementation-plan navigation and the
existing package evidence. Before implementation, the two new C test carriers
did not exist; search found legacy combat/Practice tests but no suitable V8-specific
ownership, interpolation or transport test carrier. No new runtime module or
document is needed. Reuse all existing C integration homes.

Exact maximum allow-list: the thirteen existing C client paths and five C test
paths named in A7, plus the three planning/evidence carriers (21 paths). No B
server/shared module, selector, legacy schema/AI, asset, manifest, package,
test harness, analytical carrier or CRPM change is authorized. If inspection
finds a missing necessary integration path, review a bounded amendment before
editing it. The explicit V8 fixture is engineering-only; ordinary Practice
and rewarded creation must remain V7. C does not implement D's AI, reward
lifecycle, candidate assessment or joint promotion.

Fresh no-history client/presentation and client-transport implementers receive
only the frozen handoff and MIT product docs/source/tests. Root owns docs and
verification, not runtime code. Write focused red tests before behavior,
then run the V8 combat/transport tests, final `verify:feature`, focused V8
phone/sideways/interruption checks, bundle/security/compliance and independent
review. Preserve A4/A5's one-request/one-refresh bound, 250-ms timeout, neutral
lane, nine-tick lease, two-sample/three-tick interpolation and six-tick stale
cutoff. Do not replace deterministic unit clocks with real-time waits or run
the full daily matrix in the feature loop. Real devices remain outside this
autonomous slice.

**C integration boundary (reviewed before wiring):** keep legacy scene/client
callers intact and add a `kind: 'v8'` scene-argument variant with strict V8
snapshot, intent, cancellation and lifecycle callbacks. A separate
`ActionTurnsV8Client` adapter lives alongside the existing `PracticeClient` in
its current carrier; C does not change the latter's public creation/reward
API. Session bootstrap may retain bounded dedicated V8 snapshots/results for
the candidate adapter, but `v1:session.open` remains schema-exact. Use the
already present combat-preview entry with explicit `?combat-preview=v8`;
default/`=1` stays legacy. No `script.ts` or new product entry point is needed.
The distinct reviewer confirmed this integration fits the existing allow-list.
Keep candidate-only imports lazy where needed to preserve the initial bundle
ceiling; no server/Node code may enter the browser bundle. Fixture-local
simulation is only an engineering adapter, not client authority for live play.

Hold to walk and release to stop; overlong drags remain clamped and usable.
Provide jump without a required two-finger chord, precision gesture, hover, or
keyboard. Retain free turning, separate aim lock and Fire confirmation, large
targets, safe areas, camera framing, and all existing sideways modes.
Replace the V7 movement counter with truthful action/retreat time and phase
feedback only for V8. Legacy presentations retain legacy semantics.

The current causal presentation queue disables controls while presenting an
accepted movement. Do not reuse that rule unchanged for continuous walking:
define input ownership, interpolation/reconciliation, and queue bounds without
client-authoritative movement, damage, or aim. Blur, hidden document, cancel,
resize, rotation, wallet interruption, disconnect, pause, and challenge/turn
replacement cancel intent and require fresh input after recovery.

#### C source-bound implementation and review return

Source base is the freshly verified V8B commit above. The changed range uses
20 of the 21 allowed paths: all listed C paths except unchanged
`client/src/combat/camera.ts`. Only the two version-specific unit-test files
are new; runtime, browser-test, planning and evidence homes are reused.
The 17 non-document implementation/test paths have source-bound SHA-256
`d19e2c120f20cd1a622021369f1b2258d9082786371b83cc08bfa8b10936f7ab`.
Reproduce it using B's lexicographically sorted `{path,gitBlob}` rows and
SHA-256 of UTF-8 `JSON.stringify(rows)` without newline. Excluding the three
review documents and their commit identity keeps the return non-self-referential.

Fresh implementers `Codex agent /root/v8c_client` and
`Codex agent /root/v8c_transport` declared only operating/product documents,
the frozen behavior handoff and MIT product source/tests. Their detailed
source declarations are in the package evidence. Neither accessed external
sources, Sorcerers/quarantine, observer transcripts or prior implementation
history. Root coordinated documentation, build/browser validation and review,
and made no runtime edits. B server/shared behavior, legacy schemas/AI,
manifests/assets/packages, test harness/baselines, frozen handoff, recovery
checkpoints/archives and analytical carriers remain unchanged.

Delivered candidate-only behavior:

- Hold/release walking survives same-epoch snapshots, clamps overlong drags,
  and stops on release. Free facing, one-tap forward Jump, separate aim lock
  and Fire use touch targets of at least 48 CSS pixels. Releasing Jump does
  not cancel an accepted impulse; an interrupted press cannot fire later.
- V8-only action/retreat time and phase feedback, fixed-point render
  projection, bounded interpolation and immediate retreat camera recentering.
  Stale authority suspends input; duplicate snapshots do not refresh its clock.
  Portrait/sideways/landscape preserve safe areas and readable Relic labels.
- Bounded dedicated V8 transport and resume buffering; one normal request,
  one coalesced refresh, independent cancellation, 250-ms timeout recovery,
  no action retries, and strict identity/revision/cursor/lifecycle binding.
  Snapshot-before-ack and lost-ack Fire cases reconcile without inventing a
  rejected or repeated cast. Old async completions cannot enter a new scene.
- Explicit `?combat-preview=v8` local engineering fixture using the unchanged
  V8 core. Its visible label states no AI policy, wallet or reward. Ordinary
  Practice/reward creation and default/`?combat-preview=1` stay V7. Hiding the
  page cancels intent but does not pause combat; only acknowledged permitted
  Practice pause freezes it. Fresh input is required after interruptions.

Focused helper/fixture tests pass 11 V8 plus 25 legacy cases; transport passes
19 V8 plus five legacy cases, including an actual injected B runtime round
trip. Project and focused test typechecks pass. Independent reviewer
`Codex agent /root/v8c_review` reran the 11 V8 combat and 24 transport/legacy
cases and checked source/preservation boundaries.

Negative results remain in the package evidence: red scaffolds, fixture debt
and freshness regressions, transport ordering/recovery races, legacy empty-
scene-argument regression, incorrect sideways test expectations, and narrow-
phone Relic clipping. Fixes preserve numerical rules and existing test policy.
An initial anchored browser grep selected no tests; it is not a behavior pass.

Final-source checks:

- `npm run verify:feature` passed the complete normal chain: compliance,
  server/client types, all fast suites, production build, built-server smoke
  and 5/5 canonical phone-browser checks (34.7 seconds), zero browser skips.
- The earlier four V8 scenarios passed across all five maintained profiles,
  20/20 in 2.2 minutes, at pre-presentation-fix implementation/test digest
  `e92039fcc44669b9215881b62f6bd0acded77ecfeeea44c5695eca5fa8ea18fe`.
  They cover hold/release/Jump/Fire/retreat, right/left/off/landscape mapping,
  interruption/fresh input and public wallet-free V7 preservation. After the
  V8-only label/message CSS correction and added readability assertions, the
  two combat scenarios passed again on Chromium 360x640 and WebKit 390x844,
  4/4 in 35.5 seconds, against the final digest above. This focused rerun is
  not a claim that all 20 cases or the full daily matrix ran on final CSS.
- Final screenshots were inspected for small-phone portrait and both WebKit
  sideways orientations. Relic text fits (wrapping on the small portrait),
  the engineering message does not overlap actions, and touch controls remain
  visible. These ignored candidate screenshots are not release baselines,
  physical-device acceptance or a player-observation record.
- Reward-security, identity-bundle and bundle-budget checks passed. Largest
  initial JS is 1492829/1500000 bytes (7171 bytes headroom); initial JS/CSS
  gzip is 412651/430000 bytes. Eleven approved runtime asset copies remain
  unchanged. Node `v23.6.0` build proof verifies inputs
  `8483205aa16fca08aec72dcc6e48f07c16e43c974488098a5189cf28189a2b0d`
  and outputs
  `9ebc430ba51d5cdd2b7f549ffa22f5df956940f0236b314e51fe7c8b7defcdf3`.
- Exact 20-path range, 23 protected source/package/legal/handoff files,
  duplicate-key/JSON Schema checks, six local contract links, frozen handoff,
  both checkpoint targets/archive hashes, compliance and diff checks pass.
  Documentation finalization does not change the implementation or build digest.

Distinct reviewer `Codex agent /root/v8c_review` returned **pass**, no remaining
findings, on the exact 20-path range and implementation digest above, including
the three review carriers. Independently reran 35/35 focused V8 combat,
transport and legacy Practice tests, zero skips; confirmed exact scope,
protected-path preservation and digest. Reviewed input/cancellation, late/lost
acknowledgements, reconnect recovery, freshness/interpolation, Jump semantics,
fixture cleanup and public V7 preservation. Final feature/browser/security
results are coordinator-owned and accurately distinguished from the earlier
20-case browser result. C is complete only as this bounded engineering slice.
V8D still owns automated V8 AI, complete rewarded lifecycle, 240-match candidate
assessment and joint public promotion. No player observation, real-device
acceptance, balance/fairness or release claim follows from C engineering tests.
The package remains `in_progress` and its clean-room record `observed`; human
similarity review is not replaced by automated source review.

### C.1. Unified movement and traversal correction

Owner authorization: 2026-09-03, after the read-only mobile-control research
and diagnosis. Fresh `git fetch origin` confirmed clean local and upstream
`abc02026ae20a95b36369fa56c039b042914492d`; isolated branch
`codex/wp-015d3a-v8c1-unified-movement-v0`. This is a reviewed B+C amendment,
not authority inferred from C's former client-only allow-list. Root owns only
the three existing documentation carriers and verification; fresh no-history
core/client implementers and a distinct read-only planning/replay reviewer
must bind exact runtime/test paths and interfaces before implementation.

Owner feedback is product input, not a preregistered Lane G observation or a
timing dataset. Read-only engineering diagnosis at the exact C base confirmed
8-unit ascent in both directions including fractional starts, but the seed-1
first right/left lips are 16/24 units. Wall-flush Jump loses its horizontal
velocity before rising and lands at its starting x; the old ledge test begins
five units away and misses that case. Existing V8 behavior remains historical
evidence, not silently corrected under the same replay identity.

The owner accepted a single pad for stationary side-tap facing, immediate
horizontal drag/hold walking, and one upward/directed-diagonal hop per gesture.
Ordinary release must end walking while preserving an accepted hop; hard
interruptions retain safe horizontal neutralization. Auto-step becomes at most
16 units by trying the smallest supported clear lift among 8 and 16; 24-unit
lips require Jump. A wall-blocked hop retains only its committed take-off drive
for later clipped sweeps as vertical clearance opens, never wall penetration
or restoration after cancellation. Exact numerical gesture thresholds,
version/release ordering, path allow-list and acceptance gates are frozen below
for independent entry review before runtime edits.

#### C.1 preregistration: identity, input and traversal

The exact new identity is `nimble-knots-artillery-v8-r1`, selected only by
`?combat-preview=v8-r1` or an explicit injected engineering creation seam.
`?combat-preview=v8`, original constructor defaults, strict original V8
schemas/types, command meaning, state hashes and replay reconstruction remain
original V8. Reuse the V8 state shape and `formatVersion: 8` /
`rulesetVersion: 8`; exact `rulesetId` is the mandatory mechanics discriminator.
Add strict r1 schemas plus explicitly named family unions without relaxing old
schema exports. Snapshot, replay, result, resume, registry and coordinator all
preserve the exact identity; reject unknown/mixed identities. The current
public combat selector stays V7.

For r1 only, Jump is exactly `{type: 'jump', direction: -1 | 1}`. Up alone
captures authoritative facing at dispatch; diagonal-up supplies its indicated
side atomically. Old V8 Jump remains exactly `{type: 'jump'}`. Accepted r1 Jump
retargets any existing held direction without extending its lease. New normal
`{type: 'walk_stop'}` clears held direction, lease, aim and non-jump horizontal
drive, preserving an accepted hop. It consumes the ordinary sequence, budget
and revision/count, not a new epoch/lifecycle transition. Center therefore
stops movement without ending pointer ownership. An opposite grounded
`walk_start` updates facing/direction immediately but retains the current live
lease timestamps when less than three ticks have elapsed since refresh; only
at that cadence may it extend the existing nine-tick lease. No air steering or
new walk action may be buffered for landing.

Actual release uses new r1-only `v8:input.release`, with strict `requestId`,
`challengeId`, `rulesetId`, `expectedTurn`, `inputEpoch` and the existing
acknowledgement/cursor shape. Its independent burst-two/refill-four lane bypasses
the normal queue. A matching-epoch release is a forced soft barrier even when
neutral: increment epoch/revision/lifecycle once, clear held/lease/aim and
non-jump drive, retain committed jump velocity, invalidate pending normal
admission tokens and fence later stale packets. Request caching/old epochs make
duplicates inert. Replay records this lifecycle barrier as `walk_stop`, distinct
from the ordinary intent of the same name. Keep the existing 128-event cap and
terminal reserve. Hard interruptions remain hard and may escalate while a soft
release is pending; an ordinary release recovery path must not implicitly call
hard cancel and truncate the accepted hop. A Jump not applied before release
is rejected; a Jump already applied finishes. A gesture that was exclusively a
stationary side tap dispatches one face intent on release and no contradictory
soft-release fence, provided no movement/up eligibility or locomotion flight
belongs to that gesture.
Acquire a pointer only when the actual transport lane is ready. For a pure tap,
clear local pointer ownership before releasing capture and submitting face,
so synthetic lost-capture cannot hard-cancel that face. Non-pure releases clear
local ownership/eligibility before the independent release fence.

Reviewed r1 cursor-fence clarification: preserve exact cached request/payload
acknowledgements and changed-payload conflict handling first. For an uncached
r1 request, stale epoch or an invalidated admission token rejects without
consuming normal cursor, intent budget, replay or combat mutation; check before
sequence handling and again after catch-up. Other expected-sequence rejection
behavior remains as declared; original V8 is untouched. Thus release-first
rejects queued or later old-epoch sequence N and allows new-epoch sequence N;
accepted-input-first yields release cursor N+1. Test both catch-up orders,
duplicates and no client cursor rewind. No reconnect is needed to reconcile
this successful release fence.

The r1 pad uses existing sideways-aware logical/CSS coordinates, a floating
origin at pointer-down and a 48px radius. Horizontal displacement of at least
10px walks immediately; upward displacement of at least 24px requests Jump,
with up taking priority in a simultaneous threshold crossing. A side tap must
stay strictly below 10px maximum displacement throughout the gesture. Its side
comes from the static pad half at pointer-down, excluding the center strip
within 8px of its midpoint. The pad stays at least 112px wide so each side is
at least 48px wide. There is no hold-duration threshold. Return to center and
grounded reversal keep the same pointer. Keep old V8's separate buttons; hide
them only for r1. Preserve pointer capture, outside-ring tracking, accessible
labels, aim/Fire separation and hard-interruption neutralization.

One narrow, explicit live-gesture admission amendment avoids losing an upward
push behind routine walking acknowledgements. Arm only the first upward
crossing while authoritative active-player state is grounded. If blocked by one
normal locomotion flight (`walk_start`, `walk_refresh` or `walk_stop`), retain
eligibility for at most 250ms from that crossing, never extended. At actual
readiness recompute intent from the still-held pointer/current vector and
authoritative facing. Require the same challenge, turn, phase and epoch, fresh
authority, still-up geometry and grounded actor. Release, lowering the stick,
any airborne authority, timeout, recovery, disconnect, hard cancellation or
boundary change permanently discards that gesture's eligibility. No stored
command/payload, retry, timer-driven dispatch, after-release/landing action or
deferral behind face/aim/Fire/lifecycle work is permitted. Allow one actual Jump
attempt per gesture. Transport readiness includes automatic walk refreshes;
notify after accepting authority and before coalesced refresh dispatch. Scene
completion also re-evaluates the live gesture without synthesizing input.
Optional scene hooks are `releaseMovement()`, `inputReady()`,
`onInputReady(listener)` and read-only `inputFlight(): 'locomotion' | 'blocked' |
null`. The flight classification distinguishes an allowed automatic walking
refresh from forbidden face/aim/Fire work; a readiness boolean alone cannot
enforce the preregistered admission boundary. Historical callers omit them.
The live adapter remains a generic `ActionTurnsV8Client` with original V8 as
its default. R1 attachment supplies its exact identity explicitly as the sixth
attach argument; validate that immutable instance identity before accepting
events, acknowledgements, resume state or results. Original typed callbacks
must remain compatible. Existing untyped session-event buffers need no change.

Auto-step attempts the smallest supported clear lift in `[8, 16]`, only from
grounded state, checking upward/horizontal clearance and destination support.
Retain ceilings, actor collision and all ordinary swept clipping. R1's blocked
hop retains only its committed take-off `vx`; after actual upward motion it may
retry the **unspent** signed horizontal displacement of that tick once. Total
horizontal travel remains at most the original one world unit per tick. Never
restore velocity from facing/input; hard cancel clears it permanently. Thus
16-unit lips walk, 24-unit lips need Jump, and wall-flush hops can clear the lip
as they rise without tunneling, a back-off requirement or extra per-tick speed.

#### C.1 output ownership and acceptance

Maximum allow-list is these 28 paths; any additional path requires a reviewed
amendment before editing. Existing runtime and documentation carriers are
reused. Search found only the original V8 combat/Practice test carriers, not
r1 carriers; the two new files deliberately isolate revision-specific gesture
and transport tests while retaining original tests unchanged. Core/replay/
protocol regressions extend existing homes; no new runtime module is needed.

- Fresh `/root/v8c1_core`: `shared/simulation-v8.ts`, `shared/protocol-v8.ts`,
  `shared/combat-version.ts`, `server/src/simulation/coordinator-v8.ts`,
  `server/src/simulation/versioned-coordinator.ts`, `server/src/session/registry.ts`,
  `server/src/protocol/socket.ts`, `tests/simulation/action-turns-v8.test.ts`,
  `tests/simulation/action-turns-v8-replay.test.ts`,
  `tests/protocol/action-turns-v8.test.ts`.
- Fresh `/root/v8c1_client`: `client/src/combat/contracts.ts`,
  `client/src/combat/input.ts`, `client/src/combat/controls.ts`,
  `client/src/combat/fixture.ts`, `client/src/combat/preview.ts`,
  `client/src/combat/presentation.ts`, `client/src/scenes/combat.ts`,
  `client/src/practice/client.ts`, `client/src/lib/session.ts`,
  `client/src/style.css`, new `tests/combat/action-turns-v8-r1.test.ts`,
  new `tests/practice/action-turns-v8-r1-client.test.ts`,
  `tests/browser/combat.spec.ts`, `tests/browser/resilience.spec.ts`,
  `tests/browser/smoke.spec.ts`.
- Root, no runtime/test authorship: this contract,
  `docs/planning/implementation_plan.md`, `docs/evidence/wp-015d3a.json`.
  Independent `/root/v8c1_planner` owns read-only entry/final review.

Workers use only this product amendment, the frozen handoff and MIT local
sources; no Sorcerers/quarantine or observer transcript. Preserve parallel
edits. Red-first tests precede implementation; retain failing baseline facts.
Required tests include tap displacement history, sideways axes, overlong
drag, immediate walk, center/reversal independent of event sampling, directed
and walking-to-hop, one-hop/no-repeat/no-air-steer/no-landing-buffer, bounded
live-up readiness and all invalidation paths; release before/after ack, neutral
late packet fencing, duplicates/rate caps and hard-after-soft escalation;
strict old/r1 dispatch/replay, fractional bidirectional 8/16 ascent, 24 blocking,
ceilings/actors, flush jumps and one-unit sweep bound. Pin original V8 operation
history hashes, not only its initial hash. Public Practice/reward V7 parity and
legacy tests must stay green.

Run the feature funnel once source is stable, then focused r1 phone/sideways
browser regressions across the applicable five projects, security/bundle gates
and exact build proof. Validate JSON duplicate keys/schema, navigation,
source/range, changed-path digest, old replay parity, untouched manifests,
frozen handoff, checkpoint/archive recovery and Git diff. The implementation
digest is SHA-256 over UTF-8 `JSON.stringify` of lexically sorted
`{path,gitBlob}` rows for changed non-document paths (`git hash-object --path`
Git bytes), with no newline. Exclude the three review documents and containing
commit identity to avoid self-reference. Record actual paths/results and
independent review before the scoped commit. Full daily/release gates and real
Android/iOS acceptance are not this feature loop; Windows screenshot candidates
must not become approved baselines.

Owner phone follow-up, only after separately deploying this candidate:

1. Open `?combat-preview=v8-r1` and confirm the separate Jump/face buttons are
   absent. Tap each side of the movement pad: facing changes, position does not.
2. Hold/drag past the ring in each direction. Return to center and reverse
   without lifting; movement stops/reverses without needing a new touch.
3. Push up from rest, then diagonally up while walking. Verify one directed
   hop; release during the hop must not truncate it or queue another hop.
4. Walk the seed-1 right 16-unit lip; jump the left 24-unit lip from flush
   contact without backing away. Larger walls must not become walkable.
5. Repeat in default clockwise, `sideways=left`, `sideways=off` and actual
   landscape as practical. Original `combat-preview=v8` must still retain its
   earlier controls; ordinary Practice remains V7. This is ordinary product
   acceptance, not preregistered Lane G observation or a balance claim.

Public Practice/reward creation and standard AI stay V7. Original V8 remains
addressable; C.1 gets an explicitly distinct recorded identity and an explicit
engineering preview. No new assets, dependencies, test-harness policy, V9-D AI,
reward activation, formal observation, analytical work, CRPM, push or deployment
is authorized. The frozen reference handoff and all legal manifests stay exact.

#### C.1 source-bound review return — 2026-09-03

C.1 is complete for engineering review on
`codex/wp-015d3a-v8c1-unified-movement-v0`, from clean, freshly fetched
`abc02026ae20a95b36369fa56c039b042914492d`. Actual range is exactly 27 of the
28 allowed paths: only `client/src/lib/session.ts` was unnecessary. The two
dedicated r1 unit-test carriers are the only new files. The 24 changed
non-document paths bind to implementation/test digest
`8ad4254ff73aca3e4ac3881781fa2e367748dccbad9b082ab5baed570cfa0325`
under the non-self-referential method above; this return and the other two
review documents are excluded.

Fresh no-history `/root/v8c1_core` and `/root/v8c1_client` implemented their
declared paths from this product contract, frozen handoff and local MIT
sources/tests only. Neither accessed external/reference/quarantine material,
observer history, assets or dependencies. Root authored only the three review
documents and ran verification. Distinct `/root/v8c1_planner` approved entry
and the final source tree, with no unresolved findings. Review corrections
retain red-first regressions for exact-expiry reversal, soft/hard release
ordering, lost acknowledgements including turn handover, and preview barrier
128/129 parity. Tests also corrected scene-completion refresh priority. These
are product correctness findings, not player-observation evidence.

Final checks:

- Core/protocol/replay: 89/89, including all 67 originals and 22 new checks.
  Selected client/transport coverage: 70/70, including 22 r1 checks. Project
  types and strict new-unit-test types pass. Original operation-history golden
  hashes remain exact; original strict schemas/defaults reject r1 operations.
- Full `npm run verify:feature` passes: fast checks, production build, built
  smoke and 5/5 canonical phone browser cases (34.0s). The first run was
  deliberately interrupted during browsers for the final handover correction;
  it is retained as incomplete evidence, not substituted for the final run.
- Targeted `V8 r1` browser run: 20/20 in 2.8 minutes, zero retries/skips,
  across all five configured projects. Covers combined controls, ordinary/hard
  release, aim/Fire separation, right/left/off/actual-landscape safe areas,
  interruptions, explicit preview identity and original V8/public V7 retention.
  Small-phone portrait, clockwise, actual-landscape and WebKit counterclockwise
  screenshots were inspected; controls fit and extra Jump/face buttons are absent.
  Candidates remain ignored test output, never approved Windows baselines.
- Reward/identity bundle security and bundle limits pass. Largest initial JS
  is 1,498,379/1,500,000 bytes; initial JS/CSS gzip is 414,242/430,000 bytes.
  Only 1,621 raw bytes of initial-chunk headroom remain; future work must
  preserve the limit, not silently increase it.
- Node `v23.6.0` build proof binds input
  `76eee1ca2fd971d217e479650aa24f15c41c108a743178b514d96f0ce4cae9ff`
  and output
  `d96436d89cfacc13b0e747f4a2d647a98afda7b25c156f515bf427fac98d1fd7`.
  Final browser checks reuse those exact outputs.
- JSON duplicate keys/Draft 2020-12 schema, 36 local navigation links, exact
  source/range/digest, 381 protected Git-byte paths, frozen handoff, both
  checkpoint targets, both rollback archive hashes, compliance and diff pass.
  All 11 approved runtime asset copies remain exact. No package, asset,
  legal-manifest, harness, analytical, frozen-record or CRPM edit occurred.

The corrected engineering URL is `?combat-preview=v8-r1`; original
`?combat-preview=v8` remains original V8. Ordinary Practice and rewarded
creation still share V7 and standard AI. C.1 adds no automated V8 AI, reward
activation, assessment, balance/fairness claim, public promotion or deployment.
The full daily/performance/release and separate PostgreSQL gates were not run;
unchanged dependencies did not require a fresh audit. Real Android/iOS touch
acceptance and distinct human similarity review remain separate. Overall
WP-015D3A stays `in_progress`, its clean-room record stays `observed`, and V8D
is next but not started. Analytical WP-015D2A, interrupted Stage C debt, closed
Lane G/Lane M, no Lane G evidence, unsatisfied D2O and no ProductAuthority remain
unchanged. No push, PR or deployment is included in this slice.

### D. Loomkeeper, full lifecycle, and candidate acceptance

#### D1. Entry, ownership and exact output boundary

The owner accepted the C.1 phone behavior and opened D on 2026-09-03. That
feedback is ordinary product acceptance, not a Lane G session or evidence.
Fresh `git fetch origin`, HEAD/upstream comparison and clean-worktree checks
bound D to `3fc33a33049a7e61bc0ab8ee7e3f340917e3b136`. Work is isolated on
`codex/wp-015d3a-v8d-loomkeeper-lifecycle-v0`. The historical package starting
commit and earlier source-bound returns remain unchanged.

D implements A6's timed standard Loomkeeper and complete Practice/reward
lifecycle on **`nimble-knots-artillery-v8-r1`**. It does not change the C.1
mechanics. Public creation stays V7 during implementation and verification.
Joint activation is a separate final decision requiring every A8/A9 gate,
including the finite assessment, CPU/scheduler evidence, release quality,
PostgreSQL compatibility and the separate human similarity gate. Missing or
failed gates leave the injected candidate unpromoted; they do not authorize a
mode split, reduced search, retuning, relaxed tests, or a claim of complete V8.

Before creating any file, path search found no dedicated V8 AI module, AI
test/assessment, automated reward test or separately loadable V8 transport.
The existing planning/evidence carriers and runtime/test directories are the
suitable homes. Five new files below have distinct policy, assessment,
automated-verification or lazy-loading roles; no new document is needed.

This reviewed D entry is an explicit additive amendment to A7, not a change
to B/C's historical ranges. Maximum **37 exact paths**; no other edits:

| Owner | Exact paths |
| --- | --- |
| Fresh no-history `/root/v8d_ai` | New `shared/loomkeeper-v8.ts`, `tests/loomkeeper/action-turns-v8.test.ts`, `tests/loomkeeper/action-turns-v8.assessment.ts`; existing `shared/combat-version.ts`, `server/src/simulation/coordinator-v8.ts`, `server/src/simulation/versioned-coordinator.ts`, `tests/simulation/action-turns-v8-replay.test.ts` |
| Fresh no-history `/root/v8d_lifecycle` — runtime | `shared/protocol-v8.ts`, `server/src/session/registry.ts`, `server/src/protocol/socket.ts`, `server/src/runtime.ts`, `server/src/reward/service.ts`, `server/src/reward/types.ts`, `client/src/practice/client.ts`, new `client/src/practice/action-turns-v8.ts`, `client/src/script.ts`, `client/src/scenes/practice.ts`, `client/src/scenes/result.ts`, `client/src/scenes/combat.ts`, `client/src/combat/contracts.ts`, `client/src/combat/controls.ts` |
| Same lifecycle owner — tests | `tests/protocol/action-turns-v8.test.ts`, `tests/protocol/runtime.test.ts`, `tests/protocol/schemas.test.ts`, `tests/practice/practice-client.test.ts`, `tests/practice/action-turns-v8-client.test.ts`, `tests/practice/action-turns-v8-r1-client.test.ts`, new `tests/reward/action-turns-v8.test.ts`, `tests/reward/runtime.test.ts`, `tests/reward/service.test.ts`, `tests/browser/practice.spec.ts`, `tests/browser/reward.spec.ts`, `tests/browser-postgres/reward-postgres.spec.ts` |
| Root coordinator — documentation/gate wiring only | This contract, `docs/planning/implementation_plan.md`, `docs/evidence/wp-015d3a.json`, `package.json` |

Root remains the reference observer and does not author runtime, tests or the
assessment. Implementers read only the frozen handoff and current MIT product
sources/operating instructions; no observer transcript, external reference or
quarantine. They preserve each other's changes. `/root/v8c1_client` performs
read-only independent D review with no D authorship; its earlier C.1 client
authorship is disclosed, not represented as fresh D implementation. The
clean-room registry stays `observed`; automated review is not the human gate.

Unchanged: both simulation modules, legacy protocol/AI/coordinator behavior,
assets, all legal manifests, frozen handoff, dependency versions/lockfile,
reward amounts/eligibility/ledger/stores/migrations/signing, analytical
carriers and checkpoints. No push, PR, deployment, funded payout, formal
observation or real-device session is part of this autonomous implementation.

#### D2. Additive identity and lifecycle contract

Original V8 and r1 foundation envelopes already contain reserved v3 AI labels;
those labels are **not automated-policy evidence**. Preserve their strict
schemas, constructors, replay semantics and hashes. Add separately named
automated r1 branches with mandatory
`automationId: 'wp-015d3a-v8d-r1-v1'`, exact v3 policy/`standard-v8-0` profile,
and strict automated snapshot/result/input/cancel/release/pause/leave/ack/replay
envelopes. Explicit runtime unions dispatch both foundation and automated
branches without silently widening old exports. A named `createAutomated`
constructor fixes r1; original `create` remains a foundation constructor.
The automation marker belongs to envelopes, not the combat-state hash.

The replay has at most 16 turn-indexed policy selection records. Verification
recomputes policy selection and checks the exact AI intent/barrier sequence
and authoritative tick of every operation, not only the selected ordinal or
terminal hash. A selected plan, no legal plan, and work failure are distinct;
work failure produces neutral timeout and cannot establish a reward proof.
Reward verification dispatches only by the recorded exact automation,
ruleset, policy/profile, challenge/session and tick/hash identities. Reserved
foundation labels alone must never authorize an automated reward result.

Add strict `v8:challenge.create` with existing mode/Calling and optional
reward-eligibility fields, request ID and session sequence, **no client
ruleset or automation selector**. Its strict versioned acknowledgement tags
legacy versus automated snapshots. One server selector governs both modes
and both creation endpoints. Under V7 the old endpoint remains unchanged;
when an automated candidate is injected, the V1-only endpoint rejects with
`FEATURE_UNAVAILABLE` before consuming eligibility. No false V1 envelope or
fallback V7 match. Request-cache identity includes the event as well as the
request; cross-endpoint ID reuse with a different payload conflicts.

Separate once-only authoritative completion/forfeit from once-only socket
delivery. Disconnected expiry and runtime close settle the challenge before
replay/session deletion; reconnect can still receive its terminal result.
Preserve idempotency under retries and repeated expiry/close. Existing reward
stores can retain the versioned replay without a schema or database migration.

The client has one authoritative session-sequence cursor across legacy
reservation and versioned creation, pause, leave and retry. Preserve the old
Practice client API and foundation adapter behavior. Move the existing V8
adapter into the new lazy module **without a runtime re-export** from the
initial client module; the two foundation transport tests change imports,
not expected behavior. An awaited connection factory and bootstrap permit
tagged creation and buffered automated resume without bundling V8 transport
into the initial download. Scenes consume actual versioned snapshots/results,
not fabricated legacy results. Retry disposes the old adapter, suppresses its
expected late leave result and starts a fresh match. A lost in-memory session
returns to fresh Practice. No CSS, assets or deployment flag is added.

Candidate browser cases use injected ephemeral loopback runtimes within the
named existing specs. Production has no new environment or URL activation
switch. PostgreSQL acceptance must use isolated existing disposable facilities;
do not broaden the runner's one-entitlement assertions or edit its harness.
An unavailable prerequisite is explicitly not run and blocks promotion.

#### D3. Exact assessment and execution clarifications

These clarify A6/A8 before implementation, without changing its work, seed or
match counts. The paired **120 V8 + 120 V7** matches use **Wizard**. Separately,
AI correctness covers ten seeds x original/reflected actor-side assignments x
three Callings, 60 cases each repeated twice; the ordinary feature subset is
the first three seeds x two sides x Wizard, repeated twice.

An assessment-only reflection reverses terrain columns (`255-x`), maps each
root to `worldWidth*FP-xFp`, negates facing, and preserves IDs and Y. Recompute
canonical support at tick zero from public terrain queries, then validate the
fixture: never mirror the old support index, because support is leftmost-first.
Starting-actor fixtures have a clean turn-zero action epoch/deadline. Initial
fixture plus operation history is reconstructed only inside the assessment;
product seed-based replay constructors/schemas accept no custom initial state.

The V8 scripted opponent has its one declared motion script and exactly the
30 Relic/angle/power lattice choices. It uses A6's same 30 charged planning
ticks (one candidate per tick), deterministic error, ranking, 15 aim ticks,
landing wait bounded by the ordinary action deadline, and away-60-tick
post-cast retreat. V7's scripted opponent uses the same shot lattice/error
and nearest legal 64-unit move, with no Jump or retreat. V7 retains its
900-tick action clock and instantaneous legal command transitions, with no
invented planning/dwell charge; its existing standard v2 AI is untouched.
These are explicit version differences, not claims of identical mechanics.

Pre-assessment API clarification, independently reviewed before any paired
run: V7 has no single 64-unit command. Its existing move accepts direction
only, advances/charges 8 units when legal, and has a 64-unit turn budget.
The scripted counterpart attempts at most eight sequential 8-unit moves
toward the direction frozen at script start. Stop at the first rejection,
retain the accepted prefix and run the unchanged 30-shot lattice from there.
No retry, reversal, alternate route or extra distance. Before select/aim,
all scripts face the current opponent, using the existing zero-direction
turn only when facing differs. A blocked legal prefix does not discard every
shot candidate. This fixes the API mapping, not an assessment-driven value.

For policy ranking, movement ticks are scheduled 0/90/180 ticks, including
blocked/airborne time, not distance moved. Separation uses fixed-point centre
distance capped at `640*FP`. An r1 Jump specifies the script direction.
At the movement boundary use hard cancellation, not r1 soft release, so a
committed hop cannot extend the selected motion duration; record a barrier
only if state actually mutates. Waiting for legal grounding still consumes
the action clock. No input is retroactively committed during planning.

Freeze public state at AI action entry T. Charged planning ticks 1..30 each
evaluate their six fixed slots, then advance one ordinary simulation tick.
After tick T+30 and its automatic annotations, commit the selection and apply
face/hold/optional Jump in that order; first displacement is T+31. At
T+30+scheduled-motion-ticks cancel, then face/select/aim if the public
offensive validators permit it; otherwise wait legal ticks for readiness.
Fire follows exactly 15 integrated aim ticks. At retreat entry R apply
face-away/hold, then move on R+1..R+60 with legal lease refreshes, never after
handover. Each zero-time intent validates the current sequential epoch/aim
identity. Only the authoritative advance/pump/catch-up path drains AI work;
packets do not add planning passes. Publish after that tick's AI drain.
An interrupted prefix before 30 charged ticks has no fabricated selection;
if still active, record its selected/no-legal/work-failure status at T+30.

Record selected ordinal or a null ordinal with `no_legal_plan`/`work_failure`
status. Recompute `no_legal_plan`; work failure is retained but never valid
reward proof. No alternate search, silent truncation or replacement plan.

Opening damage is each actor's HP loss over the first actor's complete turn,
including shot/settle/retreat. Reply availability is a living opponent with
an admitted action at the first actual handover. Cast availability uses only
detached first-handover state: test each of the 30 shot-lattice choices,
face opponent, select/aim with the same deterministic error, dwell 15 legal
ticks and attempt Fire; no movement or extra landing wait. Record whether
any Fire is legal. No handover or death before reply means both are false.
These probes never mutate match state. For V7, use the corresponding legal
legacy lattice without adding V8 dwell. Completed turns count actual
actor-changing handovers; also retain terminal reason and final turn because
a turn-limit termination need not hand over. Record per-group and aggregate
first-actor wins/losses/draws, both policies' outcomes, and A8's exact stops.

#### D4. Verification staging and retained preflight

Red tests precede their runtime behavior. Normal feature verification remains
the fast suites, production build, built-server smoke and canonical phone
smoke; focused automated lifecycle/parity/replay/security/browser checks are
additional D gates. `assess:v8` invokes only the explicit non-default-glob
assessment. Its ignored outputs retain failures and full finite-domain data.
Do not silently reduce work to accelerate a gate. Run the full daily/release
chain at activation, not after every edit; without it activation stays closed.

Before D edits, `npm run verify:fast` passed with zero skips. Existing build
proof was valid on Node v23.6.0, inputs
`76eee1ca2fd971d217e479650aa24f15c41c108a743178b514d96f0ce4cae9ff`,
outputs `d96436d89cfacc13b0e747f4a2d647a98afda7b25c156f515bf427fac98d1fd7`.
Git-byte lock SHA-256 remains
`D4DAC6AE09A3D2F6C5A7EAA11520BAC43F1628320C5331575BCF1E1857073D73`.
The prior initial-JS budget has only 1,621 bytes of headroom; genuine lazy
extraction, not a larger budget, is required.

A fixed read-only feasibility probe used seed1/Wizard/r1 and six representative
legal rollouts: 1,113 ticks, 274 intents, three hard barriers, zero rejected
intents, all six fired, 26.9ms total. Six separate 1,050-neutral-tick probes
took 67.2ms for 6,300 ticks. Source state was unchanged. Typical work narrowly
fits one 33.3ms interval while the latter exceeds it: neither proves live
scheduler debt safety, deployment CPU or concurrent capacity. Actual bounded
implementation work/cadence remains a gate; no search bound was changed.

#### D5. Source-bound assessment return (not activation)

The explicit `npm run assess:v8` completed once in 148.5 seconds, zero skips:
all 60 all-Calling/side correctness cases repeated twice and all 240 paired
scenarios completed. The 120 V8 matches terminated within 16 turns, with four
turn-limit draws (cap 12), at most one draw per ten-case group (cap three),
and no group of ten first-actor wins. No invariant, cap, reconstruction or
illegal-action failure occurred. No values were tuned or run retried.

V8 aggregate first-actor wins/losses/draws were **86/30/4**; AI outcomes were
**80/36/4**. Paired V7 outcomes were **90/30/0**, AI **48/72/0**. This passes
the frozen engineering admission thresholds, not a claim of fairness or
balanced human gameplay: first-actor wins remain common and the bounded
scripts are not player observations.

The run was bound before and verified unchanged afterward to SHA-256
`6a7c3de26e5502f0c25e4b3483aa685ecbfb82a696f86ed1f061817b308ee199`:
lexicographically sorted `{path,gitBlob}` rows for tracked `shared/` and
`server/src/simulation/`, plus new `shared/loomkeeper-v8.ts`, the two new
AI test/assessment files, `tests/simulation/action-turns-v8-replay.test.ts`
and `package.json`; hash UTF-8 `JSON.stringify(rows)` without a newline.
This 15-path assessment-input binding is distinct from the final whole-slice
source/test digest and excludes review documents/containing commit.

The first run wrote ignored `test-results/wp-015d3a-v8-assessment.json`,
17,403,641 bytes of
fixtures, legal operation histories, reconstruction/correctness hashes,
per-scenario/group metrics and outcome data, SHA-256
`cb071f37a9e14ff661bab9fa30d6c6bed0bc8a0407cab524b4cfdbeb4ffc3721`.
Its existence/hash were verified immediately, but the subsequent canonical
Playwright run cleared its configured `test-results/` output directory and
removed this first raw report. The numerical/source-bound return above is
retained; do not claim that first raw file still exists. Regenerate the
unchanged assessment after the final browser runs to leave a retained raw
artifact, recording the reason and new digest separately. This is artifact
recovery, not numerical retuning or a failed assessment retry. Local outputs
are not committed evidence schemas or off-device backups; future default
Playwright runs can clear them again.
Public V7 remains unchanged; lifecycle, release/DB/human activation gates
remain separate from this passed assessment.

After the last browser check, one unchanged artifact-recovery run passed in
145.3 seconds, again all 60 correctness cases repeated twice and all 240
scenarios, zero skips. Its before/after 15-path binding is the same
`6a7c3de26e5502f0c25e4b3483aa685ecbfb82a696f86ed1f061817b308ee199`.
The recorded outcome totals and group limits match the first summary; no
source, threshold or policy was changed. The **currently retained** ignored
report at the same path is 17,403,641 bytes, SHA-256
`66ee02f07dd560884dabf4c2782ac070a902da3c6fea750a9bf0ff7aaab4e3b1`.
Timing metadata changes its whole-file hash legitimately. No further browser
cleanup ran after this recovery.

#### D6. Implementation and review return — unpromoted candidate

V8D's injected automated r1 candidate is implemented and independently source
reviewed. The final range from C.1 contains **35 paths**, within D1's 37-path
maximum: five new files, 32 non-document paths and the three existing review
documents. `tests/protocol/schemas.test.ts` and `tests/reward/service.test.ts`
were allowed but did not need edits. Non-document source/test SHA-256 is
`ab3fccd12684aa7e3a425397c770c6decf21c44730f8e8590e6d57c0ebc3438b`:
sort changed paths lexicographically, form `{path,gitBlob}` using
`git hash-object --path=<path> <path>`, hash UTF-8 `JSON.stringify(rows)`
without newline, excluding these three review documents and containing commit.

Delivered: bounded v3 timed planning/execution, mandatory automated provenance,
exact AI-operation reconstruction, one shared version selector, strict
versioned creation, complete Practice/reward transport, pause/reload/retry and
terminal recovery, disconnected/close settlement limited to automated matches,
and replay-verified no-fund win/claim persistence. Active matches are refused
before consuming reward eligibility. V1-V7 and original V8/r1 foundations
retain their strict historical identities and behavior; both simulation files
remain byte-identical to C.1.

Final `npm run verify:feature` passed the full configured fast chain, production
build, built-server smoke and **5/5** canonical phone checks (37.6s browser
portion), zero skips. The two new candidate lifecycle cases separately passed
**10/10 across all five profiles** in 1.1 minutes, zero retries/skips. The
30 seed/Calling shared-mode cases run 60 complete matches and compare snapshots,
hashes, exact replay operations/AI selections and terminal outcomes. Genuine
legal player-win reconstruction, tampering rejection, durable record-only
claim recovery and idempotency pass. The 240-match assessment is separately
source-bound in D5; it is not implicitly run by every feature edit.

Final reward-security and identity-bundle inspections pass. Production build
proof is valid on Node v23.6.0, inputs
`bb4beec3779aa8af3432c4d2e1e757a995d17cb246d07b9be84331c17128ca9f`,
outputs `5a98ba07f43b7ea68c1bdfd3d6e9fb57ee99822d88ca254c5a28c38dde4fc84b`.
Initial raw JavaScript is **1,499,582/1,500,000 bytes**, and initial JS/CSS gzip
is **414,682/430,000**. The remaining 418 raw bytes are a future engineering
risk, not permission to raise the budget. V8 lifecycle and optional reward/
leave request bodies are genuinely lazy; no startup-eager dynamic import was
used to disguise initial work. All 11 approved runtime assets remain exact.

Retained red/review corrections include later-AI-turn stale selection,
mixed-identity legacy replay admission, interrupted/removed/shifted policy
operations, exact rollout caps, eligibility-before-active-match checking,
replacement-session acknowledgement cursors, once-only buffered results,
strict versioned error envelopes and automated-only settlement. Three early
bundle probes failed at 1,504,658, 1,501,582 and 1,500,118 bytes before the
two-file lazy corrections passed. The first live candidate browser run exposed
a Phaser CREATING/RUNNING mount race: supplied live arguments skipped a
conditional yield, unlike previews. Both paths now yield before the unchanged
generation/mounted/active guards; the failed cases then passed with explicit
visible controls and page-error checks. No gameplay constant, validation guard,
timeout, baseline, expected-skip policy or test harness was weakened.

The fresh implementers declared only the required operating/product docs,
frozen behavior handoff and local MIT product sources/tests. They accessed no
Sorcerers/quarantine, observer history or external source. The distinct D
reviewer made no implementation edits and approved the final lifecycle,
replay, packaging and mount fixes. Automated review is not the separate human
similarity gate, and the clean-room record remains `observed`.

**Activation decision: not promoted.** Shared public creation is still V7.
`npm audit` ran and failed on inherited moderate `qs@6.15.3` advisories
`GHSA-x5fp-wj9c-mxmx` and `GHSA-4mjr-xmp4-gh2g`; dependencies and lockfile
were not changed. Address that in a separately scoped dependency fix. The
isolated PostgreSQL candidate test is implemented/discoverable but was not
run because `WP014_TEST_DATABASE_URL` is unavailable. Full daily/release
quality/performance, deployment/concurrent CPU capacity, human similarity and
real-device acceptance remain outstanding. A local cadence sample completed
30 planning batches in 1,085ms, maximum derived debt three ticks and no expiry;
its 44.57ms maximum batch is host evidence, not deployment capacity proof.

Next work is closing these activation gates, not automatically starting V9 or
promoting one mode alone. Overall WP-015D3A remains `in_progress`. No push, PR,
deployment, real-fund activation or formal observation was performed. The
analytical pointer remains WP-015D2A; Stage C debt remains `interrupted_no_tap`,
Lane G evidence remains none, Lane G/M execution remains closed, D2O remains
unsatisfied, and ProductAuthority/placement/P5/landfall remain unclaimed.

## Clean-room roles and entry gate

The root coordinator is the reference observer and must not implement V8
runtime from its source-reading context. Use a fresh implementation agent with
no observer conversation inheritance; hand it only this product contract, the
frozen behavior record, and the MIT product sources/tests. Declare exact file
ownership and tell parallel workers to preserve others' changes. No worker
may fetch/open Sorcerers or the quarantine. Distinct code/compliance reviewers
receive any necessary reference access and return bounded findings rather
than code snippets to the implementer.

Preparation review is not a completed implementation/similarity review. Keep
the registry `observed` until distinct implementer/reviewer identities,
implementation declaration, passing similarity review, and behavioral tests
exist. Automated import checks support but do not replace the workflow's
human similarity review requirement. Do not label automated review as legal
clearance or silently waive owner/human review.

## Verification and balance learning

For the historical documentation-only preparation pass: verify V7 HEAD/tag and archive contents,
existing build proof and built smoke; check compliance, strict JSON duplicate
keys/schema, links, frozen-record digest, exact paths, unchanged manifest and
predecessor bytes, and Git diff; obtain independent preparation review. No new
build, feature browser session, full daily run, physical-device test, or formal
observation is required or performed here.

V8 acceptance must cover repeatable movement/jumps/collisions, phase edges,
one-cast enforcement, timeout/airborne/death/settling cases, AI parity,
lost-release expiry, stale input/version rejection, replay reconstruction,
Practice/reward combat parity, and all legacy golden hashes. For identical
seed, Calling, AI configuration, accepted commands and simulation tick
advances, both modes must produce identical simulation states and hashes;
session/reward metadata and different chosen seeds are not combat rules.
Cover shared version selection, turn/phase limits, movement/jumps, Relics,
damage, terrain, AI replies and terminal outcomes, plus historical replay
identity preservation. Run `npm run verify:feature`
for each shipped increment plus focused affected tests. Keep `verify:daily`
at end-of-day and release boundaries, with the separate PostgreSQL gate and
existing expected-skip policy; do not weaken them or rerun the full matrix
after each ordinary edit. V7's latest full daily red result and focused repair
evidence stay unchanged; the next complete daily/release gate remains due.

Assess V8 plausibility on finite preregistered deterministic scenarios, both
starting orders, mirrored map/side assignments, several disclosed bounded
policies, and reachable shot/reply routes. Retain opening damage and available
replies, first-actor win splits by map/policy, stalemates, turn-limit frequency,
and match length rather than one flattering aggregate. Compare V7 and V8 with
the same scenario provenance, not as interchangeable replay schemas. Define
counts, seeds, budgets, stop rules, and acceptance criteria before running the
candidate assessment; do not tune away failed cases afterward.

This is engineering evaluation, not player-observation evidence or proof of
fairness. Sorcerers-inspired tempo may improve choices and feel; whether it
reduces first-actor advantage is a hypothesis. Actual touch feel, accessibility,
marketing readiness, and player response remain unverified.

## Analytical return remains available, not silently extended

The pre-marketing checkpoint
`checkpoint/wp-015d2-analytical-return-2026-08-31` still peels to
`14cf9d490d7cf7b23e22918f608a694bb3028005`. The analytical execution pointer
remains WP-015D2A, separate from this product navigation. No analytical module,
config, sealed parent return, parity record, or historical evidence changes.
To resume the old analysis, use that exact checkpoint in a separate checkout
or the preserved explicitly version-bound analytical carriers. Never repoint
an old exporter at the latest gameplay alias.

Applying the analysis to V8 is a new task: build a separately versioned adapter
for time, phases, movement, and jumps; declare its domain/cuts and validate
replay parity before drawing conclusions. Preserving access to the analytical
path does not make V8 automatically fit the old model. Negative analytical
findings remain useful design warnings, not live rule or player evidence.

```yaml
Lane_G_identity_recorded: true
Lane_G_current_evidence: none
Lane_G_execution_open: false
D2O_player_information_timing_gate: unsatisfied
active_execution_pointer: WP-015D2A
aggregate_debt: interrupted_no_tap
ProductAuthority: none
mathematical_placement_implication: none
gameplay_change: false
P5_open: false
landfall_claim: false
```

These facts describe the preparation and V8A contract-only passes. Lane M and Stage C execution also
remain closed here. Stage C harness repair is a prerequisite for Lane M, not
a global prerequisite for product documentation or Lane G documentation. No
mathematical evidence transfers to Lane G, and no public formation, credible
response, or D2O satisfaction is claimed.

## Preparation review return

Historical preparation review at `170f0bf`: independent reviewer
`Codex agent /root/v8_preparation_reviewer` returned
`pass`, with no concrete findings, against the seven-path preparation diff
from `dc66d2ac0f02b1b7c47f6949816a7cbc6e48e286`. Review covered scope,
annotated V7 checkpoint and analytical checkpoint targets, rollback ignore
rules and 42-file runtime inventory, baseline timing/schema facts, the current
Practice/reward coupling, and the clean-room and analytical-return boundaries.
It is a preparation review, not implementation or similarity clearance.

Coordinator checks passed: pre-edit build proof and built smoke, all 524 source
archive Git blobs and 42 runtime archive file hashes, archive SHA-256s, seven
allowed changed paths, JSON duplicate keys and draft-2020-12 schemas, nine local
navigation links, frozen handoff hash/LF, unchanged previous registry row,
Git-byte manifest/predecessor identities, no runtime/test/analytical/asset diff,
compliance, and `git diff --check`. The earlier source-archive line-ending
failure was corrected and its complete inventory rechecked, not waived.

No restore/deployment drill, fresh build, feature/full browser run, PostgreSQL
integration, Linux visual approval, physical-device session, or player
observation was performed. Detailed check and skipped-check facts are in the
linked evidence record. The owner's later shared-ruleset correction supersedes
the mode-isolation part of that historical review. Its then-next bounded step,
V8A's finite product-authored parameter/phase table and implementation allow-list,
is now recorded in section A. At that V8A return, B/C/D runtime remained
future-only; the subsequent owner continuation separately opened B as recorded
above. Neither return opens Lane G/Lane M execution, observation, push, PR or
deployment.

Owner-correction review return: `Codex agent /root/v8_preparation_reviewer`
returned `pass` with no findings on the three-document diff from
`170f0bf47d2fed94dd6240424e91f2ba99681f67`. The coordinator also verified six
paired V7 checkpoints in an in-memory seed-1 Wizard diagnostic: creation,
movement, Relic selection, aim, fire, and Loomkeeper reply produced identical
simulation states/hashes and standard AI in both modes. This used no wallet,
reward service, real entitlement, payout, network, or browser session.
Compliance, JSON duplicate-key/schema validation, nine local links, exact
three-path scope, unchanged frozen hash/registry/manifests, runtime/analytical
preservation, and diff checks passed. No current combat-mode divergence was
found; no runtime fix, fresh build, or full-suite run was needed. V8 parity is
still a future implementation gate, not a result established by this V7 check.
