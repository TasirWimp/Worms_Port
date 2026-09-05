# WP-015D3B — V9 Resource and Utilities

Date: 2026-09-05. Status: V9A finite design contract complete and independently reviewed;
V9 runtime is not implemented. Contract identity: `wp-015d3b-v9a-rules-v0`.

## Entry, authority and source boundary

The owner reports completing V8E phone acceptance with everything working as
expected and explicitly requests starting V9. This package starts from clean
`da1e7a9c1a1c19bcfa4385e3db28cb530f660ebb` on
`codex/wp-015d3b-v9a-rules-contract-v0`. The
[execution pointer](implementation_plan.md) and
[V9 evidence](../evidence/wp-015d3b.json) own its current state. V8 acceptance is
recorded in [the predecessor contract](wp-015d3a-v8-action-turns-contract.md#e1-owner-phone-acceptance-and-v9-handoff--2026-09-05).

V9A freezes the first bounded design slice. Fresh no-history designer
`/root/v9_contract_planner` uses only operating documents and local MIT product
sources. Root transcribes the design and owns acceptance/navigation/evidence;
a distinct reviewer checks it. No new external reference observation, source
lookup, asset generation or quarantine access is part of V9. V8's inherited
clean-room obligations and outstanding public release gates remain applicable.
The empty V9 clean-room record list means no new observation, not clearance of
the inherited V8 lineage. Future runtime implementers must be fresh no-history
agents given only this contract, the approved behavior handoff if needed and
MIT product sources/tests; never observer conversation or quarantine material.

Search found no existing V9 contract/evidence carrier. These two new files have
a distinct ruleset and package lifecycle. V9A may edit exactly these six files:

- `docs/planning/wp-015d3b-v9-resource-utilities-contract.md`
- `docs/evidence/wp-015d3b.json`
- `docs/planning/implementation_plan.md`
- `docs/planning/wp-015d3a-v8-action-turns-contract.md`
- `docs/evidence/wp-015d3a.json`
- `README.md`

The numbers below are product-authored candidate decisions, not observed
reference constants or validated balance. V10 terrain/starts and V11 teams
remain separate. Public selection, the existing V8 development profile,
deployments, payouts, assets, dependencies and analytical execution do not
change in V9A. Ordinary owner phone acceptance is not Lane G evidence.

## A1. Identity and retained rules

Reserve combat identity `nimble-knots-artillery-v9`, state/replay version `9`,
policy `nimble-knots-loomkeeper-v4`, profile `standard-v9-0` and automation
provenance `wp-015d3b-v9d-v1`. These labels describe future implementations,
not currently available routes. New mechanics or policy changes after the
candidate is frozen require a new versioned identity and reviewed amendment.

Retain V8-r1 movement/collision, combined controls, 30 ticks/s, 450-tick action,
60-tick movement-only retreat, one offensive cast, projectile/settling bounds,
16-turn limit, V7 terrain/starts, one actor per side, 100 Stitching and equal
Calling statistics. Maximum turn remains 1050 ticks; projectile is capped at
300 ticks, each settling phase at 120 and a match at 16800 combat ticks. Retain
V8's replay caps of 32768 records, 16 MiB total and 512 bytes per operation;
strict V9 encoding must fit these bounds. Utilities add no clock
pause, phase, extra action, cast or turn. V8E focus and D.3 defeat presentation
remain presentation behavior. Legacy V1–V8/r1 identities, schemas, hashes,
recorded matches and replay verification remain available unchanged.

Both Practice and rewarded candidates use the same V9 combat rules and AI.
Eligibility, wallet and reward policy remain separate. Public activation is a
later shared selection decision after its gates; B/C use injected candidates.

## A2. Resource and Relic costs

The visible resource is **Thread**, a non-monetary combat resource with no
wallet, reward or transfer relationship. Each actor has an integer bank `0..9`.
Initialize both banks to zero, then credit the first active actor on entry to
its first action. Every own action entry credits `min(9, bank + 3)` exactly
once; the other bank is unchanged. Unspent Thread carries over. Store the
last credited global turn (`-1..15`) per actor in authoritative state to make creation/replay/resume
idempotent. Pause, reconnect, duplicate input, snapshot application and result
handling never grant income. No income follows a terminal transition.

| Relic | Thread cost | Maximum damage | Launch speed min..max (fixed units) | Crater / damage radius |
| --- | --- | --- | --- | --- |
| Threadball | 2 | 45 | 1459..4864 | 40 / 64 |
| Needlepoint | 3 | 30 | 1536..5120 | 40 / 64 |
| Spoolburst | 5 | 80 | 1373..4576 | 40 / 64 |

Ballistics are the existing V5 tables already used by V8-r1, including launch
interpolation, gravity, direct-hit geometry and damage falloff. Needlepoint's
existing reach and Spoolburst's damage are their initial costly distinctions;
there is no simultaneous ballistic retuning. Retain self-damage and terrain
deformation rules.

Selection/aim is free, including selecting an unaffordable Relic. Accepted Fire
atomically checks normal legality and affordability, subtracts its exact cost
and consumes the one cast. An unaffordable or otherwise rejected Fire changes
no combat state, bank, cast flag or deadline. Duplicate acknowledged commands
do not debit again. No negative balance, debt, fractional cost, refund, bonus
income for hits/kills or payout coupling. Existing request-cursor rules remain
separate from whether a rejected intent mutates combat state.

Examples: first action has 3 Thread; basic Fire leaves 1 and the next own action
begins with 4. Passing preserves 3 and the next own action begins with 6.
At bank 9, later income remains 9. Spending a utility and Threadball requires
4, so the first action cannot combine them. Saving for Spoolburst is deliberate.

## A3. One shared utility slot

Each own action begins with `utilityUsed=false`. Exactly one of the two
utilities below may be accepted during that action, before Fire, by its live
active actor. Each costs 2 Thread. Neither consumes the offensive cast. They
cannot be used in projectile, settling, retreat, terminal or paused states.
Both actors must be grounded and motionless, with no held walk, for either
utility to be admitted. Acceptance clears aim and held movement and advances
the input epoch; a later Fire requires fresh acknowledged aim. Neither utility
advances simulation time or resets the action deadline. Normal walking/jumping
remains free. All intent, stale epoch, lease, identity
and command-budget checks still apply. Acceptance is atomic; rejection costs
nothing and leaves the slot available. Reset the slot only at a new own action.

**Threadguard (defense).** Strict intent `{type:'threadguard'}`. On acceptance,
set the actor's shield to 24 points with expiry global turn `currentTurn+2`.
For each existing projectile damage event (enemy or self), first compute normal
integer damage `d`; absorb `a=min(shield,d)`, subtract `a` from the shield and
apply `d-a` to Stitching. Compute both actors' raw damage using the ordinary
pre-settling roots, apply absorption independently, then mark all deaths.
Terrain damage is unchanged. A shield cannot save an out-of-world actor or
alter support, collision, fall movement or a non-damage terminal cause. It
expires at the start of that actor's next action, before credit and new input,
even if unspent. No stacking, refresh within the same action, healing or
transfer. Dead actors retain no active shield. Depletion/death clears the
expiry marker. Shield range is `0..24`, expiry is null or `0..17`; zero damage
consumes nothing. Presentation must distinguish absorbed damage from Stitching
lost. Only damage absorption changes HP loss.

**Threadleap (mobility).** Strict intent
`{type:'threadleap',direction:-1|1}`. A grounded actor with valid support may
launch a reinforced directed hop: set facing to direction,
`vxFp=direction*512`, `vyFp=-2048`, using the existing
V8-r1 vertical arc, gravity, support/collision handling and 120-tick airborne
cap. Initialize `grounded=false`, `support=null`, `airTicks=0`, clear the held
lease and set a distinct V9 committed-leap marker. Landing/death clears the
marker. The command has no target coordinate or distance input. It sweeps the whole horizontal displacement
through the existing collision solver, never teleports or skips walls/actors.
The accepted hop persists through ordinary release as an ordinary committed
hop does; explicit cancel/disconnect/interruption and phase boundaries stop
horizontal motion while gravity continues. Use horizontal then vertical swept
collision. Obstacles clip actual displacement but preserve the committed
horizontal impulse while airborne, allowing travel after rising above a wall.
Retain V8-r1's same-tick retry of only the remaining horizontal displacement
after actual vertical rise; never apply the full horizontal distance twice.
No airborne stepping. Landing clears velocity/airborne state; ordinary grounded
walking requires a fresh hold. No air use, second utility, buffered launch,
coyote extension or refunded cost for a blocked/short hop. Invalid support or
airborne admission rejects before debit. Under unobstructed same-height
geometry the inherited 63-tick arc travels 126 units instead of 63; actual
terrain/collision acceptance must be tested rather than inferred from this
arithmetic. The per-turn horizontal path upper bound is 630 units: 450 ordinary
action units plus at most 120 extra airborne units plus 60 retreat units.
Existing free jump remains available under its normal rules.

At a tick boundary, finish the inherited tick/phase transition first. An
intent at the expired action deadline therefore rejects. At entry to a live
actor's new action, expire its shield, credit its bank, reset its utility slot
once, then allow input. Timeout or early terminal state never creates an extra
utility opportunity. Persist bank, credit identity, utility slot, shield and
reinforced-hop mode/velocity in strict V9 snapshots, hashes and replay records.

## A4. Bounded deterministic Loomkeeper

Use the existing 180-plan lattice (six movement scripts, three Relics, five
angles, two powers), six slots per tick over 30 charged planning ticks.
Retain the 1050-tick per-rollout and 189000-tick total bounds. Rejected or
unaffordable plans consume their slot; no expanded search or retry lottery.

Before enumeration, choose one utility prefix from public action-entry state:
Threadguard if bank is at least 4 and own Stitching is at most 45; otherwise
Threadleap toward the opponent if bank is at least 4 and horizontal centre
separation exceeds 640; otherwise none. The 4-Thread threshold reserves the
basic cast. Apply the same chosen prefix in each simulated candidate and the
eventual execution; it is not a separately searched axis. Direction follows
root separation, with current facing on an exact tie. Every clone includes
the 30 planning ticks, utility prefix and leap landing wait before its normal
movement script. Discarded slots consume their full reserved work allowance.
Candidate Fire must
be affordable after that debit. Retain deterministic aim error, 15-tick aim
dwell, lease refresh, ordinary retreat and hard-neutralization semantics from
the pinned V8 policy. No utility during retreat.

Rank legal candidates lexicographically by outcome (win 3, ongoing 2, draw 1,
loss 0), opponent damage minus
twice self-damage, own remaining bank, horizontal separation capped at 640,
negative scripted movement ticks, then negative ordinal. Utility policy is a
bounded initial heuristic; it is not claimed optimal. Policy execution and
replay must derive the same prefix, schedule and affordability from the same
state, seed and policy identity. Emit at most eight operations per tick within
inherited intent/barrier budgets. If no legal complete candidate exists or a
work cap fails, remain neutral until ordinary timeout: no fallback search,
utility-only fallback, extra time or hidden cast. Replay records bind prefix,
chosen ordinal and policy/profile/automation identities. No hidden player input,
extra currency or mode-specific advantage. D preregistration must bind exact
assessment fixtures before AI source edits.

## A5. Implementation sequence and review gates

V9A is contract-only. **V9B authoritative foundation is the next runtime
slice.** Its closed maximum source/test allowlist is below. Before its first
source edit, bind starting source hashes, strict state/protocol layout,
immutable hash encoding, replay operation caps,
utility collision/lease semantics and acceptance fixtures in this carrier.
A fresh core implementer proposes those interfaces from this contract and MIT
sources; a distinct reviewer must approve that entry amendment. Do not silently
widen V8 state or patch its mechanics in place.

V9C adds resource/cost/utility touch presentation and an explicit engineering
preview. V9D adds deterministic AI and complete shared-mode candidate lifecycle
and assessment. C/D each require their own exact path preregistration before
source edits. Reuse existing scene/transport/test carriers when suitable;
separate version-specific simulation/protocol/coordinator/AI modules have a
distinct replay lifecycle. No source paths are authorized by V9A's six-document
allowlist.

| V9B ownership | Exact future source/test paths |
| --- | --- |
| Fresh core/network implementer — new versioned modules | `shared/simulation-v9.ts`; `shared/protocol-v9.ts`; `server/src/simulation/coordinator-v9.ts` |
| Fresh network implementer — existing additive dispatch | `shared/combat-version.ts`; `server/src/simulation/versioned-coordinator.ts`; `server/src/session/registry.ts`; `server/src/protocol/socket.ts`; `server/src/runtime.ts` |
| Core/network implementer with distinct test review — new coverage | `tests/simulation/resource-turns-v9.test.ts`; `tests/simulation/resource-turns-v9-replay.test.ts`; `tests/protocol/resource-turns-v9.test.ts` |

B also updates this contract, V9 evidence and the execution pointer. The three
new source modules separate strict V9 simulation, wire and scheduler/replay
lifecycles; the three test modules cover corresponding boundaries under existing
test globs. No V8 module, dependency, asset, deployment configuration or reward
storage/signing path is in B. A missing integration path requires a reviewed
amendment before editing; this list never implicitly authorizes C/D.

Required runtime proofs: income once per own turn including creation and
pause/resume; cap/carry-over; costs and insufficient funds; duplicate/stale
intents; shared utility slot; all phase boundaries; shield expiry, partial/
complete absorption, self-damage and terminal causes; leap wall/ceiling/actor/
ledge collision, lease loss, interruption and landing; replay corruption and
mixed-version rejection; preserved legacy golden hashes; exact Practice/reward
parity. C must prove phone affordability labels, touch targets and command
routing in the retained sideways layout. D must report utility usage, expensive
cast starvation, CPU/search caps, outcome/first-actor bias and no-legal-plan
cases under predeclared fixtures. Balance conclusions require assessment.

For each slice, inspect `npm.cmd run verify:changes -- --dry-run`, then run
the selected gates, adding focused new behavior tests. V9A needs documentation/
evidence and independent design checks only; no game build or browser matrix.
Keep the full suite at the existing 21:00 Europe/Berlin daily checkpoint and
explicit release boundaries. Public release still needs dependency, PostgreSQL,
performance/deployment-capacity, human similarity and applicable device gates.

## A6. Completion record

V9A's fresh designer `/root/v9_contract_planner` returned a finite product
proposal and passed its transcription self-review. Distinct read-only reviewer
`/root/v9a_contract_review` found no blocking contract, arithmetic, source-boundary
or acceptance/release-status issue. Review precision items are included above:
explicit leap initialization/lease reset, replay/tick caps, numeric outcome
ranking and residual-displacement-only wall retry.

Change-selector dry run chose only `check:work-packages`, with no browser,
PostgreSQL, performance or fallback tasks. Selected verification passed all 51
evidence records and diff checks. Local inspection validated the exact six-file
documentation scope, all three V9 contract navigation links/anchors, canonical
Git lock hash and unchanged Windows checkout lock hash. No runtime, approved
asset, legal manifest or frozen observation record changed.

Game build, unit/browser/full daily suite, dependency audit, PostgreSQL,
deployment and new device testing were not run for this documentation-only
slice. The owner's V8E phone report is recorded separately from automated
results. V9 values remain unassessed balance hypotheses.

Next: V9B entry amendment and authoritative foundation under A5. The overall
WP-015D3B evidence remains `in_progress`; completing A does not claim V9 gameplay
or activation is complete.

## B. V9B authoritative foundation entry amendment — 2026-09-05

Status: entry designed by fresh `/root/v9b_entry_designer` on
`gpt-5.6-terra` / `high` and independently approved by
`/root/v9b_entry_reviewer` on `gpt-6-astra` / `high`. This amendment opens V9B from clean
`d41df456696326f737e526e59f43aeae865a5681` on
`codex/wp-015d3b-v9b-authoritative-foundation-v0`. Requested/configured model
selection is recorded here; runtime-served model metadata is unavailable. The
designer read only the contract, operating documents and local MIT product
sources/tests, made no edits and did not access an external source or quarantine.
The reviewer found and the coordinator corrected source-edit blockers for
intent-limit neutralization, canonical hashing, closed mutable paths and V8-r1
parity/collision fixtures. Review grants only B1's closed injected foundation;
implementation correctness still needs red/green tests and final review.

### B1. Closed source boundary and starting locks

V9B may change only the three new source modules, these **three existing mutable
dispatch paths**, and three new test modules listed in A5, plus this contract,
`docs/evidence/wp-015d3b.json` and `docs/planning/implementation_plan.md`.
`server/src/protocol/socket.ts` and `server/src/runtime.ts` are explicitly
**excluded**: V9B has no Socket.IO, normal lifecycle, client, reward or runtime
profile surface. A type-only change to either still needs an Astra-reviewed
amendment before edit. No V8 source module, asset, dependency, package script,
legal manifest, public selector or deployment configuration is in scope.

The three mutable integration files must exactly match these source SHA-256
values when their fresh implementer begins; otherwise stop for a reviewed
amendment. The V8 source/test blobs below are **read-only predecessor locks**,
not V9B paths. They are recovery evidence and never permission to modify files
outside the closed list.

| Mutable V9B path | SHA-256 at entry | Git blob at entry |
| --- | --- | --- |
| `shared/combat-version.ts` | `2FCF7770F318B55B9BAF486C45AB6BF3E312F6B10CB5E9D4C479843B8B4FA164` | `838598ff14306aaffdd0e5224d77573143fa4201` |
| `server/src/simulation/versioned-coordinator.ts` | `E0B2827D884F8230A52A2BDBC026D6DB36A836D9DCAA245349FBBF6B38A0777E` | `13a78e4105fc0e6ed8672d332a0b8c81342779c6` |
| `server/src/session/registry.ts` | `E546605FDA8E6D675D0495CE772F8BC06A04DF2303B02CA1F05F5493EEA22B59` | `947e907e41fd60dc58cd50b470d2b1e0d4e9b96d` |

The V9 test files do not exist at entry. Read-only V8 source/test blobs are
`shared/simulation-v8.ts` `0125fd4c7ea2e8d122531b55ebb07765aa6385ad`,
`shared/protocol-v8.ts` `651777a08488dbd0fbdea867c94864d5ff746b2c`, and
`server/src/simulation/coordinator-v8.ts`
`d793a3927dbf4bb9e10a370d11aa1f27e2bd2b4e`; V8 regression test blobs are
`e2ab6f08dde9e2f67815d0fceaadfa3873a01e95`,
`9449b3de2f453099bf5c6d1827bd4853ecb0c6d0` and
`c3cd6fa882cbbe7ab6ca6a5eaf455f6788cda569`. V9 must not widen their types,
schemas, implementation or expected assertions.

### B2. Strict V9 state, intent and replay contract

Create only `V9_RULESET_ID = 'nimble-knots-artillery-v9'`,
`V9_RULESET_VERSION = 9`, `SimulationStateV9`, `SimulationUnitV9` and V9-only
schemas. There is no V9 family/r1 alias. The V9 state retains V8-r1 fields and
adds exactly `utilityUsed` at state level; each unit adds integer `thread`
`0..9`, `lastCreditedTurn` `-1..15`, `shield` `0..24`,
`shieldExpiresTurn` null or `0..17`, and boolean `reinforcedLeap`. Keep
`airDrive` unchanged. The marker is true only during an accepted airborne
Threadleap and clears on landing, death and phase boundary. Invariants require
`shield === 0` exactly when expiry is null; dead actors have zero/null shield
and no reinforced leap.

Creation's player action is already credited and hashes as
`thread=3,lastCreditedTurn=0`; Loomkeeper starts `thread=0,lastCreditedTurn=-1`.
This is initial state, never a forgeable replay operation. At a later action
entry, after the tick's preceding phase transition, expire that actor's shield
when its expiry equals the new turn, credit once if not already credited, reset
the one shared utility slot, then admit fresh input. Resolve death/turn limit
before entry, so no nonexistent action can credit Thread. Pause, snapshots,
reconnects, retries and result handling do not mint Thread.

`SimulationIntentV9` is the strict V8-r1 intent set plus exactly
`{type:'threadguard'}` and `{type:'threadleap',direction:-1|1}`. Keep
`walk_stop` and existing V8-r1 barrier reasons. V9 protocols must use strict
discriminated snapshot, intent, barrier, replay-operation, record and replay
schemas under format/version 9, exact V9 ruleset, policy
`nimble-knots-loomkeeper-v4` and profile `standard-v9-0`; no automation field.
They define no Socket.IO event, creation/lifecycle envelope or client ack in B.
Replay operations remain only intent, barrier, ticks, automatic lease/phase and
safety. Income, expiry and utility reset are reconstructed state effects.

`canonicalSimulationJsonV9` first validates the entire exact V9 state, then
serializes recursively: arrays retain their current order; every object key is
lexicographically sorted and JSON-escaped; primitive values use JSON encoding.
`hashSimulationStateV9` is the lowercase hexadecimal SHA-256 digest of those
canonical UTF-8 bytes. It includes every V9 state field listed above, inherited
simulation field, tuple order, terrain word and projectile trace; it excludes
socket/session/wall-clock metadata, request cursors, UI and reward facts. The
initial V9 state hash and one post-credit/utility/checkpoint hash for seed 1
must be frozen as literals in V9 tests before green implementation. The V8
canonical JSON and hash functions stay unmodified.

V9 keeps all V8 replay limits and pre-parse checks: 32,768 records, 16 MiB
JSON, 512 bytes per operation/record, 16,800 summed ticks and 512-byte terminal
reserve. Preserve contiguous indexes, coalesced tick records, automatic-boundary
regeneration and fail-closed safety terminalization. Mixed format/ruleset/
policy/automation fields reject before reconstruction.

### B3. Authoritative ordering

Normal identity, active actor, turn, epoch, phase, deadline, intent budget and
grounded checks precede a utility. It additionally needs action, no cast, unused
utility, zero held walk and both live actors grounded/motionless. Validate all
ordinary legality before affordability. Rejected, stale or duplicate actions
do not debit Thread or change utility/cast state. Preserve the existing separate
intent-limit rule: a validated request at the exhausted accepted-intent budget
may append its canonical `intent_limit` barrier and perform its recorded input
neutralization/epoch effects, including while airborne; it still must not debit,
use a utility/cast, mint Thread or change a shield. Accepted utility costs two
Thread, uses the slot, clears
aim/lease/held input, increments epoch and consumes one intent; it leaves cast
and deadline intact. A later Fire needs fresh acknowledged aim. Fire atomically
checks `{threadball:2,needlepoint:3,spoolburst:5}` then debits and uses its cast.

Threadguard sets shield 24 and expiry `turn+2`; it neither stacks nor refreshes.
At projectile impact, calculate V5/V8 raw damage for both actors from the
unmodified pre-settling roots, absorb independently, apply residual Stitching
loss, then update every alive/dead result. Keep terrain deformation unchanged.
Emit stable tuple-order `damage_resolved` events with raw, absorbed, residual
Stitching loss, resulting Stitching and shield; this is authoritative evidence
for later presentation, not a B client change.

Threadleap first validates support, then debits and sets facing, `vxFp` to
direction times 512, `vyFp=-2048`, unsupported/airborne state, zero air ticks,
`airDrive='jump'` and `reinforcedLeap=true`. It uses V8-r1 horizontal/vertical
sweeps and only the residual horizontal retry after actual upward movement.
While marked, a clipped obstacle preserves the 512 impulse; soft walk-stop
preserves it, while cancel/disconnect/reconnect/pause/resume/intent-limit and a
phase transition zero it while gravity continues. Landing/death clear it.

`SimulationCoordinatorV9` mirrors only V8's non-automated bounded API:
creation, get, apply, barrier, advance, pump/catch-up, safety, replay,
reconstruction/verification, deletion and disposal. It excludes planner,
automated creation, chosen-plan records and automation provenance. The combat
facade adds exact V9 dispatch while current selection stays V7 and every
historical reconstruction path remains exact. Registry may expose explicitly
test-only injected V9 creation/apply/advance/snapshot/replay seams behind a
`v9TestOnly` option; no normal selection or reward settlement changes.

### B4. Red-first acceptance fixtures

Before runtime implementation, the three new V9 test modules must fail for the
absent V9 modules, then cover: first credit and pause/resume; nine cap and
carry-over; atomic Fire across unaffordable/stale/duplicate paths; shared utility
and fresh aim; Threadguard partial/full/self damage and death/expiry; 63-tick
126-unit clear-floor leap; wall/ceiling/actor/ledge and residual-rise retry;
soft release/interruption/landing; deadline handover ordering; strict unknown/
fractional/mixed-version rejection; replay corruption/cap reconstruction;
injected Practice/reward parity; and exhausted-budget airborne-leap barrier
neutralization without a debit. Use the existing frozen ten V8 seeds
`1,2,3,4,17,42,1337,65535,2147483648,4294967295`, each Calling and unchanged
V7 start/terrain/RNG generators for creation/parity coverage. For retained
free-action behavior, normalize out only V9 resource fields and the intentional
`formatVersion`, `rulesetId` and `rulesetVersion` identity fields, then compare V9
against V8-r1 for the same seed/history through ordinary face/walk/reversal,
lease, 8/16-unit step and 63-tick free-jump fixtures; V8-r1 remains the
read-only oracle. Bind V9 geometry fixtures explicitly: clear level floor at
root `x=800,y=308`; a wall occupying terrain cells `x=104..107,y=34..39`; the
clipped-wall/residual-retry case starts player root at `x=820,y=308`, flush to
the wall's left face at 832 after the 12-unit body radius; a
ceiling `x=96..111,y=23..25`; and a 16-unit ledge `x=104..111,y=37..38`.
Place the opposing root outside the swept test rectangle except in the named
actor-collision case, which puts Loomkeeper at root `x=840,y=308`. Retain all
V8 golden/hash assertions unchanged.

Focused red/green command:

```powershell
node --import tsx --test tests/simulation/resource-turns-v9.test.ts tests/simulation/resource-turns-v9-replay.test.ts tests/protocol/resource-turns-v9.test.ts
```

After implementation, inspect the change-selected dry run and execute it with
base `d41df456696326f737e526e59f43aeae865a5681`, plus types, clean build,
built smoke, compliance, security/bundle and relevant canonical browser checks
as selected/required. Full daily remains the 21:00 Europe/Berlin release gate;
do not replace it with a V9B pass.
