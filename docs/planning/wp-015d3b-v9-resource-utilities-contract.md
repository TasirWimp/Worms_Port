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

### B5. Authoritative-foundation closure — 2026-09-05

V9B is complete. The implementation remains injected-only: it adds V9 state,
strict replay/protocol envelopes and a coordinator test seam in the B1 closed
allowlist. The public combat selector remains V7; no Socket.IO, runtime,
client, reward, asset, dependency or deployment path changed.

The final read-only Astra review passed after adversarial checks of shield
health isolation, per-tick batch equivalence, counter terminalization,
Threadleap pause/resume lifecycle safety and B4's V8-r1 parity/collision
fixtures. The focused three-module command passes 35 tests. Change-selected
verification from `d41df456696326f737e526e59f43aeae865a5681` passed its
selected type, source, build, smoke, security/bundle and Chromium phone suite;
the latter passed 50 tests with three PostgreSQL skips because
`WP014_TEST_DATABASE_URL` is unavailable.

The daily 21:00 Europe/Berlin release gate remains required and separate.
V9C needs a new bounded entry amendment before any lifecycle, presentation,
AI, balance or public activation work.

## C. V9C resource touch presentation and engineering preview entry — 2026-09-05

Status: **independently approved entry.** The owner requested starting V9C after
V9B closed. An independent Astra/high read-only review approved C1--C5 on
2026-09-05. V9C is a local engineering preview of the
already-authoritative V9B state, not normal match creation or a public V9
launch. Its source base is commit
`7435d5a63a5f0bbc4860b12a25bad8977989f34d`.

### C1. Product boundary

The sole entry is `?combat-preview=v9`, alongside the existing explicit
engineering preview query. It must start a local V9 fixture and label the
surface `V9 resource engineering preview · local-only`. It must never call
Socket.IO, create a Session, access wallet/reward code, change the ordinary
Practice/Daily selector, or make V9 selectable by a normal URL, room, reward,
or runtime configuration. With no exact preview query, public play remains
V7.

The preview renders only authority facts from `SimulationStateV9`:

- each actor's `Thread` bank as `n/9`, selected Relic cost, and affordability;
- Threadguard's active shield and expiry turn;
- Threadleap's current facing-direction action and authoritative airborne
  state; and
- each accepted `damage_resolved` receipt as raw damage, absorbed shield and
  Stitching lost, so shield expiry is never presented as a hit.
- the existing touch movement, aim, Relic, Fire, pause and camera controls.

Guard and Leap are explicit touch buttons. Guard submits only `threadguard`;
Leap submits only `threadleap` with the currently displayed facing direction.
The UI derives disabled state from the latest local V9 state and never locally
debits Thread, invents a shield, predicts an accepted utility, advances a turn,
or supplies Loomkeeper actions. Cost and resource copy are presentation, not
new balance rules. Existing approved runtime assets and generic renderer are
reused; V9C adds no pixels, atlas, asset-manifest entry, third-party source, or
dependency.

### C2. Closed source boundary and locks

The following are the maximum V9C source/test paths. New files have no entry
blob. Existing files are mutable only after review; V8 and V9B authoritative
modules stay read-only.

| Path | SHA-256 at entry | Git blob at entry | Purpose |
| --- | --- | --- | --- |
| `client/src/scenes/combat.ts` | `8668B5DFEE7FB0B40CCA3D052F2A573B3C9F3B2E3371D8321856985A2F9D53E0` | `a1432ceff0e0a7ece79a9e53e213df9649207cae` | exact query dispatch only |
| `client/src/combat/contracts.ts` | `78B3B78AE9EA92BA24CC1B69051B9217984BC5EE7A3E30C5D1615DFC2C238330` | `6410247e44829bb5352a71a2b0fb43ce51e11bfd` | local V9 scene contract |
| `client/src/combat/presentation.ts` | `9AB1DD699435931FD001664ED5554C1056F7703DC6C02BAE060B06A73AFD422E` | `52e6b4b9e68fb2c2c28cffc913ca74bc36629435` | pure V9 render projection only |
| `client/src/style.css` | `F68A64F4C1FDD8B83E3E94B0DC31B2C7E5AEEF3C78C21D2A433E06AFD728AECF` | `0ff8bb78708e1d3ea17b6d491395798a50ed576c` | preview resource-control styling |
| `client/src/combat/resource-turns-v9-fixture.ts` | new | new | local fixture, no transport |
| `client/src/combat/resource-turns-v9-controls.ts` | new | new | V9 resource touch controls |
| `client/src/combat/resource-turns-v9-scene.ts` | new | new | V9 local presentation adapter |
| `tests/combat/resource-turns-v9.test.ts` | new | new | unit/fixture/control proof |
| `tests/browser/combat.spec.ts` | `8C974286701C8880D23D2E3DA9EFB5B85C09E243A4C182571E58B1FB638E12B3` | `11aa3af2f4c63942427e5b1552b39d28d5d4fb8a` | `?combat-preview=v9` phone proof |

Only this contract, `docs/evidence/wp-015d3b.json`, and
`docs/planning/implementation_plan.md` may change as V9C documentation
carriers. `shared/simulation-v9.ts` is a read-only dependency: the fixture may
import its existing `forceSimulationLimitV9` only for the C3 enumerated
safety-terminal paths. `shared/protocol-v9.ts`, every server path,
`client/src/combat/action-turns-scene.ts`, V8 controls/client/transport,
runtime, Socket.IO, assets, packages, manifests and public selector are
explicitly excluded. A needed change to an excluded path stops for a new Astra
reviewed amendment.

### C3. Interaction and authority rules

The fixture may call only `createSimulationV9`, `applySimulationIntentV9`,
`applySimulationBarrierV9`, `advanceSimulationTicksV9`, and the existing
`forceSimulationLimitV9`. It must publish a deep-cloned state after an accepted
transition and preserve the state returned for every ordinary rejection. It
does not simulate AI, rewards, sessions, tickets, identities, wall-clock match
expiry, replay persistence, or a normal lifecycle.

Before every submit or pause request, the fixture accrues elapsed credit and
processes due ticks first, one `advanceSimulationTicksV9(state, 1)` at a time,
with at most six ticks in that callback. If more than 30 ticks are due, it calls
`forceSimulationLimitV9` once, clears local hold/preview state, publishes that
terminal result, and rejects the original gesture. A submit never races an
unprocessed due tick: if one or more due ticks remain after the six-tick work
cap, it publishes the catch-up result and rejects the original gesture. It uses
only the post-catch-up turn/phase/epoch facts. If an intent returns
`INTENT_LIMIT`, the fixture applies exactly one `intent_limit` barrier using
the same actor/turn/epoch; if that barrier returns `LIFECYCLE_LIMIT`, or if any
fixture barrier returns `LIFECYCLE_LIMIT`, it calls `forceSimulationLimitV9`
once instead of leaving a saturated active local preview. All other rejected
intent/barrier paths leave authority state, Thread, shield and input epoch
unchanged and expose the returned authority message.

The pause button uses only V9 barriers. `setPaused(value)` is idempotent when
`value` equals the local paused flag and sends no barrier in that case. For a
state change, it first completes the due-clock rule above, then applies exactly
one `pause` or `resume` barrier with current actor/turn/epoch. Pause requires
the current player action, while resume requires the locally paused preview;
the exact committed Threadleap interruption shape is delegated to the existing
V9 barrier. It flips the local paused flag only when that barrier is both
accepted and mutated. Accepted-but-unmutated, stale, wrong-actor, phase or
identity requests leave it unchanged and are reported as an authority refusal.
A successful pause or resume reanchors elapsed credit to the current fixture
clock, so paused wall time and the first resumed callback cannot create due
ticks. A paused preview makes no tick progress; an invalid pause/resume leaves the
displayed state unchanged and exposes the authority message. Interrupt, blur,
hidden document and resize clear transient touch/aim presentation and issue at
most the fixture's existing neutral barrier. Destruction first cancels the
animation callback/timer, removes every listener and prevents a later async
publish, then may issue its one neutral barrier. These paths cannot spend Thread
or create a utility action.

### C4. Red-first acceptance fixtures

Before client source implementation, the new combat test must fail because the
V9 fixture/controls/scene do not exist. It then covers:

1. exact `combat-preview=v9` dispatch and explicit local-only label while no
   preview keeps normal V7 Practice;
2. Thread `n/9`, all three Relic costs and disabled unaffordable Fire;
3. authoritative Guard/Leap submission, single utility use, shield expiry and
   no local debit on rejection;
4. latest-snapshot action enablement across aim, cast, airborne, pause,
   interruption and terminal states;
5. fixture batch/repeated tick parity, due-clock-before-input ordering,
   idempotent pause/resume, no activity while paused, `INTENT_LIMIT` barrier
   translation, lifecycle-limit safety terminalization, clock-debt safety,
   full pause--resume--landing, counter exhaustion and stale async teardown;
   plus partial/full absorbed `damage_resolved` receipt versus shield expiry;
   and
6. a `chromium-390x844` browser case using touch to open the V9 preview, read
   the resource controls, use Guard and Leap in separate fresh fixtures,
   verify sideways touch usability and zero socket/session activity, and confirm
   ordinary V7 Practice still starts without V9 selection.

Run focused red/green checks:

```powershell
node --import tsx --test tests/combat/resource-turns-v9.test.ts
node scripts/run-playwright.js --reuse-build --project=chromium-390x844 --grep "V9 resource engineering preview" tests/browser/combat.spec.ts
```

After implementation, run the selected verification based on the C1 diff,
types, a production build, built smoke and the selected phone browser suite.
`npm run verify:daily` remains the 21:00 Europe/Berlin release gate.

### C5. Entry review and handoff

The entry reviewer must confirm that the path list is sufficient, the preview
cannot become normal V9 selection, the fixture owns no lifecycle/AI authority,
and the utility labels never imply a local outcome. A PASS authorizes a fresh
Terra/high client implementer only within C2. Final source review remains
Astra/high. The configured Astra/high entry review passed on 2026-09-05 after
checking the closed paths, query-only boundary, ordering/terminalization,
pause-clock reanchoring, async teardown and phone proof. V9D's deterministic AI, shared-mode lifecycle and assessment, and
any public V9 promotion remain separately contracted work.

### C6. Initial implementation record — superseded by continuity review

The initial implementation within C2 mounted only a local,
query-gated V9 fixture with mobile resource/utility presentation; ordinary
V7 selection remains unchanged. The fixture preserves V9 authority ordering,
terminalization, pause timing, receipt history and destruction safety. Its
controls use authoritative state, remain usable in sideways phone layout, and
do not create a transport, session, reward, AI or public-selector path.

The first source review passed after direct regressions for reentrant
publication, sustained movement, utility/offensive gating, damage receipts,
stale callbacks and listener cleanup. It is superseded by the independent
continuity review under the expanded Astra mandate: despite passing selected
checks, the preview fails product continuity. The review reproduced stale input
across authority boundaries, overlapping phone controls, absent movement/cast
presentation, absent actor HUD/camera journey, and unexplained waiting/terminal
states. AI and complete shared lifecycle remain deferred to V9D; the preview
must explain that deferral.

V9C is therefore **not complete**. Before source edits, C7 must register a
bounded correction scope and tests for the review findings, including the
owner's contextual action hierarchy. The historical branch
`codex/wp-015d3b-v9b-authoritative-foundation-v0` remains the V9B foundation
carrier and contains the V9C commits; branch naming does not imply V9C closure.
The daily 21:00 Europe/Berlin release gate and real-device testing remain
separate.

## C7. V9C continuity correction entry — 2026-09-05

Status: **entry in preparation; no source edit is authorized by this section
until independent Astra review passes.** This correction carries forward the
accepted V8 phone journey where C6 regressed it. It keeps `?combat-preview=v9`
local-only; V9D remains the sole owner of deterministic AI and complete shared
lifecycle. V9C must visibly explain opponent waiting and preview terminal
states rather than simulate AI.

The correction may change only the current V9C carriers below. The entry locks
are recovery evidence and must match when the fresh implementer begins.

| Path | SHA-256 at C7 entry | Git blob at C7 entry | Purpose |
| --- | --- | --- | --- |
| `client/src/combat/contracts.ts` | `EDC11B542E38990B40EA46EB64A23275B895CC07F20FA34946F65D35573A10C5` | `f96e077387ec11b6742a07e360cd5ce5dd826558` | local V9 scene contract and presentation facts |
| `client/src/combat/presentation.ts` | `17658AD6AD670751C4B89DC7BAEE63BF20BC5E313605BFE575BDCC9AFF2BAFF1` | `9fc387e4eb717f1df9b25469eba256d99313c500` | pure V9 render projection and trace adaptation |
| `client/src/style.css` | `C45B3A0DB4F05D46D377C7B956AEC4822469118ABAB49724F7381FEEC1767653` | `b25799eb98d907629a22a6e3aeb18a641620d735` | preview layout, hierarchy and actor-card styling |
| `client/src/combat/resource-turns-v9-fixture.ts` | `4715509E32998CAB3FD79813CDB597A8B642AA5E389E41B319070D98AD4F8998` | `7a816783a736c8e4b29ca440b06edac5f49961b0` | local fixture and authority-boundary notifications |
| `client/src/combat/resource-turns-v9-controls.ts` | `337630523FDFC740F105FDB05E55FC30CB05BF8345E4B23D8D80B157DE80B9B6` | `0440e2cb320b55f41dbbba9a493ae7057ca0579e` | V9 touch controls and contextual copy |
| `client/src/combat/resource-turns-v9-scene.ts` | `04918BC4EDF364D10C69C72A9C4C2BD163C82BED71A53F0C82DA32175F7E5010` | `160cde6e13cea666836ade2c7dda611bea909e31` | V9 local presentation adapter and camera use |
| `tests/combat/resource-turns-v9.test.ts` | `C346724F3A215F26AA44107534F1A7BF2BF830BDF0C7A4E95C7D79166A55BEE5` | `7d199563bcee56dc1a4a287d025efdf0c2e270cc` | direct authority/control/presentation proof |
| `tests/browser/combat.spec.ts` | `9DE0BEAA93B093C53B40D625DA6C1AD72E827680FFDCBE2E47E1FBAF894C06DE` | `52d2a31cde72c737975bcb45abf985e84b027930` | V9 phone journeys and V7 regression proof |

It may read but not edit V8 `controls.ts`, `action-turns-scene.ts`, its V8
projection helpers, input/camera/renderer modules, or V9 shared/server modules.
No assets, packages, transport, session, reward, normal selector, or AI
implementation changes are admitted.

Required behavior and proof:

1. Clear every local gesture/aim ownership on authority boundary
   (turn/phase/input epoch/paused/terminal/utility acceptance); old pointer
   release or polling cannot create a command, while a fresh touch can.
2. Restore a phone-first hierarchy: lower-middle starts with a yellow Actions
   button and adjacent red Use button; Actions unfolds contextual Attack and
   Defense groups, then the chosen Relic/action. Only controls needed for the
   current authority state are shown. Pause returns to the upper-left and no
   visible control, heading, or status text overlaps at maintained phone sizes
   and sideways modes.
3. Reuse the established renderer/input/presentation seams so V9 displays aim
   trajectory, movement/airborne/cast/projectile/impact feedback, and current
   player/Loomkeeper Stitching and resource status above their actors. Reuse
   V8E camera/focus behavior where its existing local client helpers apply.
4. Explain actor, phase, remaining turn time, opponent-wait/V9D deferral, and
   terminal/re-entry state accessibly. Relic selection must show name, cost,
   affordability, and unavailable reason.
5. Add direct regressions and canonical browser journeys for all above,
   including overlap hit-target tests across sideways left/right/off and safe
   areas; stale pointers across every authority boundary; unfolding Actions /
   Attack / Defense / Use flow; visual movement/shot/impact feedback; actor
   cards/camera; waiting/terminal copy; and unchanged ordinary V7 launch.

Run the selector as inventory, then all checks independently chosen by Astra.
The entry reviewer must provide a correction brief naming reuse points, data
flow, authority constraints, and acceptance cases before Terra/high source work.

### C7.1 Astra entry review and Terra/high correction brief

The independent Astra/high reviewer passed C7 at commit `0ab038a` on
2026-09-05: all eight entry SHA-256/blob locks matched, the change-selector
inventory and execution passed, and the existing direct V9 suite passed 12/12.
This pass authorizes a fresh Terra/high client worker only within the C7 table;
it does not accept the existing preview or relax the final Astra review.

The worker must follow this correction brief:

1. In `resource-turns-v9-controls.ts` and `resource-turns-v9-scene.ts`, reuse
   `input.ts` boundary synchronization and movement ownership. Compare turn,
   active actor, phase, input epoch, paused, terminal and utility facts on each
   snapshot; retire aim, movement, chooser and pending-preview ownership on a
   genuine boundary. Guard asynchronous acknowledgements with a generation.
   Existing uninterrupted walking may retain its epoch; it must keep working.
2. In controls and `style.css`, position Pause directly from `pauseZone`, not
   inside the action grid. Reuse the V8 chooser interaction as evidence: yellow
   Actions plus red Use initially; explicit Attack/Defense expansion; selected
   Relic/utility submits only through Use. Keep fresh, reachable tap-to-face
   movement and collapse choices on boundary. Test physical target rectangles,
   clipping and `elementFromPoint`, including sideways left/right/off, safe
   areas and WebKit.
3. In the V9 scene and pure `presentation.ts` carrier, feed the renderer's
   existing preview, trace and visual-phase arguments from V9 authority facts.
   Use clone-only V9 trajectory generation, never a V8 simulation disguise;
   cancel obsolete results on aim/state/pause/teardown. Presentation cannot
   delay ticks, authority, resource debits or outcomes.
4. Reuse existing layout/camera seams to place authority-derived Stitching,
   Thread and shield cards above each actor, hide offscreen cards, provide focus
   controls, track a projectile and restore the saved view. Clean up pan and
   focus work on interruption and resize while respecting reduced motion.
5. Show actor, readable phase, `phaseDeadlineTick - tick` remaining time,
   selection/cost and exact unavailable reason. State that Loomkeeper behavior
   is deferred to V9D rather than implying an imminent response. Explain pause,
   terminal and lifecycle-limit states, and provide local re-entry that destroys
   old listeners/timers before the new fixture. Tests must prove no duplicate
   callbacks or socket/session activity.

The final direct and browser cases must cover stale aim/walk across every
boundary, fresh gesture recovery, compact hierarchy/Use flow, overlap targets,
visual movement/projectile/impact, actor-card/camera behavior, accurate waiting
and terminal copy, re-entry teardown, and ordinary V7 launch.

### C7.2 Final-review correction brief

The independent Astra/high final review failed the first C7 implementation at
`591e266`. Its direct, built and existing browser checks passed, but read-only
injected-clock and Chromium/WebKit probes found authority and continuity gaps.
The same eight C7 carriers remain sufficient; a fresh Terra/high worker may
correct them only as follows before another final review.

1. `resource-turns-v9-fixture.ts` must call its existing due-clock fence before
   **every** intent, including Fire. A catch-up, deadline or lifecycle terminal
   invalidates the stale aim and rejects that gesture without a debit or
   projectile. Direct injected-clock tests must cover ordinary and over-six
   due ticks, excessive debt and crossed action deadline.
2. Scene neutralization must clear its own pending request after an accepted
   snapshot advances the authority generation, without allowing an older
   completion to clear a newer request. Test two successive aim/walk then
   blur/visibility/resize/cancel cycles through real scene/fixture wiring.
3. Authoritative projectile state, current trace/end point and camera must
   drive the complete full- and reduced-motion flight. Cast and impact feedback
   may accompany it but cannot erase flight or freeze camera. Test short and
   long flight movement, follow/restore and impact; a cast-only assertion is
   insufficient.
4. The V9 actor-card CSS must honor `[hidden]`; hidden cards have no rectangle,
   while visible 32px cards remain anchored to actors through pan/focus across
   sideways left/right/off, safe areas and WebKit.
5. Derive Actions/Use legality and copy from current authoritative phase,
   grounded/movement, cast/utility usage, selection and Thread. After Guard,
   unaffordable Threadball must be disabled with an accurate reason. Cover
   utility spent, retreat, walking/airborne and fresh-turn recovery.
6. Keep current lifecycle guidance visible independently from retained damage
   receipts. After damage, waiting must disclose V9D deferral; terminal copy
   must state the authoritative outcome. Add terminal/re-entry teardown proof:
   one fresh fixture, no duplicate timer/listener, socket or session activity.

The final reviewer also found that the broad selector was stopped before its
quality-browser phase. It remains incomplete, not a pass; the next reviewer
chooses the required verification freely. V9C remains unaccepted until this
brief passes final Astra review.

### C7.3 Second final-review correction brief

The independent Astra/high review failed C7.2 at `5c29461`. It confirmed the
due-clock and repeated-neutral fixes, but found four remaining blockers. They
remain within the eight C7 carriers; do not amend outer dispatch, shared
authority, selector or bundle limits.

1. Make local **Start fresh preview** remount the V9 adapter within
   `resource-turns-v9-scene.ts`: fully retire the old subscription, RAF,
   listeners and fixture, then mount exactly one new local V9 fixture/adapter.
   Do not pass V9 arguments into the legacy outer combat scene initializer.
   Browser proof must cover paused and terminal re-entry, zero errors, fresh
   tick/Thread, subsequent input and zero session/socket activity.
2. Construct a presentation-only projectile trace that retains the
   authoritative trace but ends at the current `xFp/256,yFp/256`. It must
   follow every short/long, full/reduced-motion flight position while camera
   follows/restores; never mutate authority or replay traces.
3. Remove V9 simulation computation from the eager ordinary-combat
   `presentation.ts` import path. Keep clone-only trajectory work behind the
   V9 lazy preview seam in an allowed V9 carrier or guarded asynchronous import;
   preserve cancellation ownership. Do not raise bundle limits. Fresh build,
   bundle inspection and complete selected verification must pass.
4. Apply selected-Relic affordability to the armed Use branch and show its
   visible specific reason. Compact the upright actor-card value text to fit
   its reserved box while preserving full accessible labels. Test Guard then
   aim Use; utility/movement/retreat/fresh-turn variants; actor text containment
   across focus/pan, safe areas and sideways/upright modes.

The prior review independently passed all five maintained V9 profiles and
confirmed V7/network/AI/public-selector boundaries. Its selector failed only
at the mandatory bundle budget before remaining selected browsers; that failure
must be resolved rather than bypassed. V9C remains unaccepted pending final
Astra review.

### C7.4 Final guidance correction

The C7.3 final Astra review failed `735c861` only because affordable selected
actions displayed unavailable guidance while their Use button was enabled.
Within the same C7 carriers, a fresh Terra/high worker must make
`armedUseReason()` return no unavailable reason for `choiceLegal(choice)` and
show positive action name/cost/Use guidance instead. It must reuse the current
authority predicates and retain specific disabled reasons. Add direct/browser
proof for affordable Guard, Leap, Threadball and Needlepoint, including an
authority tick after selection; preserve insufficient-Thread armed Use proof.
No other scope changes are authorized. The final reviewer otherwise passed all
selected verification, live-flight, remount, due-clock, card and boundary
checks; V9C remains unaccepted until this correction is re-reviewed.

### C7.5 Carry-over selection guidance correction

The C7.4 final review failed `8990170` only for a later-turn carry-over state:
when a legal pending replacement choice exists, guidance must resolve that
choice completely and never fall through to the previously selected Relic.
In `armedUseReason()`, a non-null choice returns no unavailable reason when
legal, or its own `choiceReason` when illegal; selected-Relic affordability is
consulted only when there is no pending choice. Add direct and browser proof
for player-turn-two Spoolburst → Guard → aim → affordable Threadball/Needlepoint
after an authority tick, plus no-choice Spoolburst insufficient-Thread copy.
The same control/test scope remains authorized; final Astra review is required.

### C7.6 Final C7 result

The independent Astra/high review passed C7.5 at `c713203`: pending legal
actions now supersede carried Relic affordability, while no pending choice
retains specific insufficient-Thread guidance. Direct and canonical browser
proof cover turn-two Spoolburst → Guard → aim → Threadball/Needlepoint after an
authority tick, plus preserved ordinary V7/V8 behavior and closed boundaries.
The original serial baseline had one host `ERR_NO_BUFFER_SPACE` navigation
failure before an unchanged V7 camera test began; its isolated rerun passed.
Record the selector aggregate as incomplete rather than a clean pass, while
retaining the individual passing required evidence. C7 is complete as a local
V9C preview correction; V9D remains the separately bounded AI/shared-lifecycle
work. Daily, performance, PostgreSQL, Ubuntu visual and physical-device gates
remain separate.

## D. V9D deterministic Loomkeeper and shared candidate lifecycle entry

Status: **in progress and blocked by fresh final review.** The independent
configured Astra/high final review `/root/v9d_final_reviewer` failed at HEAD
`121954e`. It is not V9 approval, activation, release, deployment, payout
activation, balance approval, or a replacement for the 21:00 Europe/Berlin
daily gate.

V9D adds the deterministic Loomkeeper and complete candidate-only Practice and
reward lifecycles. It preserves V9A's finite rules and V9B's injected
foundation. V9C remains a completed local `?combat-preview=v9` correction:
its existing touch hierarchy, authority-boundary neutralization and truthful
copy must be preserved while live V9 state replaces only the former
Loomkeeper-deferral presentation. The public selector remains V7.

### D1. Ownership, closed paths and entry locks

A fresh Terra/high core/network lifecycle worker owns the runtime and test
paths below; a fresh Terra/high `worms_port_test_worker` is the named
verification owner and exclusively controls shared build, output, browser and
PostgreSQL runs. They must preserve each other's edits. The final Astra/high
reviewer must not have advised, implemented or tested the solution.

New V9D files have no entry blob. V9D may change only these paths plus the
three documentation/evidence carriers named in this amendment:

```text
shared/loomkeeper-v9.ts
client/src/practice/resource-turns-v9.ts
tests/loomkeeper/resource-turns-v9.test.ts
tests/loomkeeper/resource-turns-v9.assessment.ts
tests/practice/resource-turns-v9-client.test.ts
tests/reward/resource-turns-v9.test.ts

shared/combat-version.ts
shared/protocol-v9.ts
server/src/simulation/coordinator-v9.ts
server/src/simulation/versioned-coordinator.ts
server/src/session/registry.ts
server/src/protocol/socket.ts
server/src/runtime.ts
server/src/reward/service.ts
server/src/reward/types.ts
client/src/practice/client.ts
client/src/scenes/practice.ts
client/src/scenes/combat.ts
client/src/scenes/result.ts
client/src/combat/contracts.ts
client/src/combat/resource-turns-v9-scene.ts
client/src/combat/resource-turns-v9-controls.ts
tests/simulation/resource-turns-v9-replay.test.ts
tests/protocol/resource-turns-v9.test.ts
tests/combat/resource-turns-v9.test.ts
tests/protocol/runtime.test.ts
tests/protocol/schemas.test.ts
tests/practice/practice-client.test.ts
tests/reward/runtime.test.ts
tests/reward/service.test.ts
tests/browser/combat.spec.ts
tests/browser/practice.spec.ts
tests/browser/reward.spec.ts
tests/browser-postgres/reward-postgres.spec.ts
package.json
docs/planning/wp-015d3b-v9-resource-utilities-contract.md
docs/evidence/wp-015d3b.json
docs/planning/implementation_plan.md
```

The fresh worker must stop for amendment if any existing path differs from its
entry lock. The principal authority, transport, reward and client seams are:

| Path | SHA-256 | Git blob |
| --- | --- | --- |
| `shared/protocol-v9.ts` | `64F822D4978FD59BF4CDE076744E6E637AC7915CC90FF0D905C3BB1886D00952` | `d48f35fa7bf9976a06f2ad5d4606d4940f643b1d` |
| `server/src/simulation/coordinator-v9.ts` | `411C28C87B17EA1479E5BEF3AA214F0448130F4330ABA01FE03A459FF4A1D285` | `14cd51868187cbb26a9540975775abc07e8cfb3b` |
| `server/src/simulation/versioned-coordinator.ts` | `CE75BF9396A28F550CFD89C83778B95844B41E2AC51F5ED6D0CC3E8558A21658` | `8ced81edc9d5ba694529ea7a4459f05a4c9e5aa2` |
| `server/src/session/registry.ts` | `88F388B381CEAB2583D874FECAAD37C4E6FBB0746CD81B691407F2776760EEF3` | `06fd4b477438142561d1b775b4402da9d0f00dbe` |
| `server/src/protocol/socket.ts` | `5C2ED61111BEB73EC6E997B2D7F97CCCAD65B77DC146563623164BB2FDEA03FB` | `d5013a2c4d3f4f3c1d49e70f85e6f82bc5e2f0ef` |
| `server/src/reward/service.ts` | `054A9C417BED510B97F052E0F45EAC65606845D53A2B61332C483E46D3CAA867` | `9a474dafe2d7665302674c3635c7223f756fb643` |
| `client/src/practice/client.ts` | `1A620173C009F0764238FB05E45DA9251308A19BBB4CD245DBC4E8AC794FCE0D` | `2c8e177428799e458485d00f1a8733d5b6f813dc` |
| `client/src/scenes/combat.ts` | `378041D6D0B6F4A8933C3C1A63913A4E4769D75709A7CBFA97A879DA72DC20DA` | `5bcaa5c248e84041858d39ea6dcd70ba4777f96f` |
| `client/src/combat/resource-turns-v9-scene.ts` | `B4BC38FB81E72690B5A13AFC5333CE03AE33327F808C827E9F11A82100C7DF22` | `8fd442f04ccf6bbceb2dd33f819e1ee2fc808861` |
| `client/src/combat/resource-turns-v9-controls.ts` | `DE1F57E3C35FB965ADC0754F06A0B76002A3C20E63252A419DCE66F085A9CA5E` | `ee784c2491e48d10f879a7b8c8fbe5b1b151850b` |
| `package.json` | `2B98AD4B711022C4D784ED013C15641C613E4FB8322B58B876D1649A37F8D37F` | `1df30ee796ea637e567ad48d1bc5fce65342154b` |

`client/src/combat/resource-turns-v9-fixture.ts` is a read-only V9C lock.
Controls may change only to project current authoritative mode, connection,
challenge/generation, pause/status/result and retry/exit facts. They must use
the scene's existing `boundaryFor`/`retireOwnership` seam to retire held
movement, aim, chooser, polling, previews and late acknowledgements on
disconnect or challenge replacement. Input returns only after a current owned
snapshot; Practice pause reflects server acceptance and reward pause remains
unavailable. Do not redesign layout, recalculate resources or authority
locally, invent granular AI progress, regress continuous movement, pending
choice affordability, receipts, camera or the corrected touch hierarchy.
No V8/legacy simulation module, asset, legal manifest, dependency lock,
reward amount/eligibility/ledger/schema/migration/signer, deployment setting,
normal selector or Sorcerers material is in scope.

### D2. Automated replay and lifecycle boundary

Keep V9 state/replay version `9` and the exact B foundation
`CoordinatorReplayV9Schema` unchanged. Add a separate strict automated V9
envelope with only `automationId: 'wp-015d3b-v9d-v1'`, ruleset
`nimble-knots-artillery-v9`, policy `nimble-knots-loomkeeper-v4` and profile
`standard-v9-0`. The numeric replay version is not widened. Foundation labels
or a stripped automation field must never become automated or reward evidence.

The automated replay records each turn's utility prefix and selected ordinal,
or exact `no_legal_plan`/`work_failure` status. Reconstruction regenerates the
prefix, planning schedule and committed operation sequence. It rejects changed
prefixes, ordinals, operation timing, identities, ownership, truncation or
caps. A work failure is neutral until ordinary timeout and can never prove a
reward result. The policy search remains Phaser-free, bounded to the frozen
180 plans, 30 charged planning ticks, eight operations per tick, 1,050 ticks
per rollout and 189,000 total rollout ticks; it may not add retries,
utility-only fallback, extra time, hidden input or mode advantage.

V9D creates candidate-only Practice and reward matches through strict tagged
creation, snapshot, input, pause, leave, result and acknowledgement envelopes.
Both modes use the same V9 authority and automated replay; reward policy stays
separate. Completion/forfeit settlement is once-only and separate from socket
delivery. Disconnect, expiry, leave and runtime close settle before replay or
session deletion; reconnect receives the one terminal result. Practice
pause/resume remains available only where authoritative V9 rules permit it;
reward pause stays separately rejected. Normal V7 creation remains unchanged.

### D3. Red-first fixtures and assessment

Before AI or lifecycle edits, freeze direct tests for: Thread bank `3/4`,
Stitching `45/46`, separation `640/641`, both-prefix predicate Guard priority,
post-utility banks `4/5/7`, and tie direction from facing. Cover clear floor
and inherited wall, ceiling, actor and ledge Threadleap fixtures: utility at
charged tick 30, landing wait, fresh epoch/aim, 15-tick dwell, and no
speculative debit. Detached rollout timing/state hashes must equal scheduled
authority and regenerated replay.

Charge all 180 candidate slots even when a plan is rejected or unaffordable.
Prove no-plan and injected work-failure neutral timeout, no duplicate income or
prefix, no extra search, and no reward proof. Compare single and batched ticks
across planning tick 29/30, handoff and catch-up over six due ticks; cover stale
Fire after a utility epoch, disconnect/reconnect while planning or leaping,
Practice pause/resume, expiry/leave/terminal races, one result publication and
one settlement. A genuine player-win automated replay must give one
record-only recoverable idempotent claim; every forged proof leaves entitlement
state unchanged.

Assessment-only mirrored, threshold and first-actor fixtures must use a
canonical V9 opening transform: reset both Thread banks, credit only the
selected opening actor, and restore phase, epoch, utility, shield and support
invariants. Never merely change `activeActor`; that would leave creation income
on the wrong actor. Such synthetic fixtures are not production replay or reward
proof. A genuine AI-first route reaches the Loomkeeper action through ordinary
create-to-play history. Add explicit `assess:v9` wiring only for the bounded
non-default assessment; record CPU/search caps, utility usage, expensive-cast
starvation, no-plan/work-failure and first-actor outcomes. Do not inherit V8
outcome thresholds without a V9-specific approved assessment contract.

The finite `assess:v9` domain is fixed as follows. Group A runs ten seeds
`[1,2,3,4,17,42,1337,65535,2147483648,4294967295]` across two horizontal
reflections and Wizard/Thief/Warrior: 60 canonical AI-opening correctness
states, each twice (120 executions). Group B runs those ten seeds, two
reflections, player/Loomkeeper opening actor and three frozen Wizard scripted
profiles: 120 full matches once. Profiles use V8 ordinals/scripts `0`
stationary, `1` toward-90 and `4` toward-90-jump only as assessment labels;
the player has its restricted 30-candidate lattice, one slot for each of 30
charged ticks, while production Loomkeeper planning remains the full 180
candidate/six-slots-per-tick policy. Group C runs bank `[3,4,5,7]`, own
Stitching `[45,46]` and separation `[640,641]`: 16 clear-floor seed-1 Wizard
threshold states, each twice (32 executions). Its roots, facing, support and
zero-velocity setup use the named V9 clear-floor test fixture; the canonical
opening transform then establishes only the selected actor's income. Expected
prefix is Guard at bank at least 4 and Stitching 45, otherwise Leap +1 at bank
at least 4 and separation 641, otherwise none. The total is exactly 196
scenarios and 272 executions. Prefix/work-failure/geometry/reward probes not
in these groups remain named direct tests, not hidden assessment rows.

Every full planning pass charges exactly 180 slots/30 ticks, at most 1,050
logical ticks per rollout and 189,000 total; rejected slots consume 1,050.
Restricted player work is 30 slots/30 ticks and at most 31,500 rollout ticks.
Retain at most eight operations per tick, 512 intents per turn, inherited
barrier bounds, 1,050 actual ticks per turn, 16 turns and 16,800 combat ticks
per match. Group A/C repetitions must equal prefix/status/ordinal, committed
operation timing and per-tick hashes; detached selected rollout must equal
scheduled execution. Missing/duplicate rows, unequal repetitions, invalid
opening resources/support, wrong prefix/affordability, illegal operation,
excess work, nontermination/simulation limit, no-plan fallback or trace/hash
divergence fail the assessment. Deterministic no-legal-plan is descriptive
only when neutral timeout/handoff is correct. Work failure is expected only in
named injected-negative tests; any uninjected assessment work failure stops.

Write `test-results/wp-015d3b-v9-assessment.json` on success and on the first
correctness failure. Bind the assessment/automation ID, source commit and
available runtime/host metadata. Record planned/completed counts, failing row
and phase; row seed/reflection/Calling/opening/script/bank/HP/distance;
initial/final hashes; prefix/ordinal/status; Thread spent/banked; cast count by
Relic; utility opportunities/use; unaffordable/no-plan/work-failure counts;
turns/ticks, damage, winner/reason, planning total/max six-slot CPU batch and
rollout counts. Group observations include reflection/opening/script outcomes,
draw/win/first-actor bias and CPU. Spoolburst starvation is descriptive:
affordable opportunities and selected/fired casts versus unaffordable
candidates, with no invented minimum, balance, latency, deployment or V8
threshold claim.

### D4. Verification and support disposition

Run the selector dry run before edits, then the selected full product funnel:
compliance, work-package evidence, types, product unit families, build outputs,
built smoke, identity/reward/bundle checks, canonical phone browser suites,
performance, audit and PostgreSQL when `WP014_TEST_DATABASE_URL` is present.
Run the explicit V9 assessment separately. The daily/release `npm run
verify:daily` remains the 21:00 Europe/Berlin full gate; Ubuntu visual and real
Android/iOS evidence remain separate.

SUP-V9D-01 was reopened after the first independent entry review found the
missing controls seam, finite assessment matrix and socket-lock correction; it
is now reduced after reciprocal support. It distinguishes four claims:
valid V9 combat history, automated-policy proof, synthetic assessment and
durable reward lifecycle. Reopen support at writer handoff to reconcile actual
charged-prefix scheduling, snapshot/ack barriers and replay proof, or earlier
if lifecycle facts cross controls/contracts/scene boundaries, recovery lacks a
fresh owned snapshot, matrix/fixture semantics or counts change, a carrier or
lock is omitted/malformed, automation can be stripped/downgraded, or
simulation, clock, version, budget or normal selector behavior is proposed to
change. Broader control layout or granular AI-progress facts require explicit
entry reconciliation. The support advisor gave no approval and did not edit
code or run tests.

### D5. Final-review failure and bounded correction amendment — 2026-09-06

The fresh final reviewer `/root/v9d_final_reviewer` found V9D unapproved. Its
P1 findings are: V7 reward reservation is consumed before V9 admission;
disconnected settlement can be lost; real-clock planner cadence fails; there
is no live V9 candidate journey; the D3 assessment has semantic/evidence
failure; and required proof carriers are absent. The review also found a P2
foreign-cursor leak and retained the inherited npm-audit advisory.
The browser result is separate evidence: actual browser execution was 54
passed with 3 expected landscape skips, and the separate three-browser check
was 3/3 passed. The assessment reported 196 scenarios / 272 executions and `failure: null`;
review nevertheless found its semantics inadequate, and its report was
overwritten by Playwright. Counts alone did not establish a pass. The
entry PASS by `/root/v9d_final_entry_reviewer` at `1a9e08a` had been absent
from package evidence and is now retained there. These facts do not make any
unrun or failed proof pass.

The correction scope is exclusively `shared/simulation-v9.ts` and
`tests/simulation/resource-turns-v9.test.ts`, owned by the gameplay correction
worker. Docs owns only the three existing documentation/evidence carriers.
No V8 file, general kernel, clock-debt threshold, planner search/cap, public
API, lifecycle, reward, selector, or source-boundary change is authorized.
`advanceSimulationTicksV9` remains unchanged as the differential oracle.

The permitted purpose is a trusted detached-rollout advance seam that may
remove repeated V9 Zod validation while preserving adapter mechanics for
mechanics-bearing ticks. An optional inert-tick path is allowed only behind a
strict closed predicate. Candidate and logical work charges remain intact; an
invalid detached result is `work_failure`. The correction must prove a full
per-tick state/event/hash differential matrix and real-clock cadence through
30 batches, cast, handoff and replay at the unchanged debt. If that proof is
insufficient, return a measured profile before seeking broader scope.

Fresh correction support is a configured `gpt-6-astra` / `high` read-only
support-advisor episode, opened because the temporal planner/authority seam
failed independent review. Runtime-served metadata is unavailable. Reopen
support if the strict inert predicate, differential matrix, real-clock
cadence, work accounting, or any proposed scope expansion is uncertain. N and
G remain active owners; advisory support is not final review authority.

### V9D direct closure amendment - 2026-09-07

The owner requested closure without agents. The coordinator performs direct review, corrections and verification; this is not a fresh independent review. Existing admitted V9 client, planner and assessment carriers remain in scope. The closure additionally admits only the compatible transitive qs 6.15.3 to 6.16.0 lockfile repair for the inherited audit failure. Keep numeric authority versions, frozen work limits, the V7 default and candidate-only admission unchanged. The local branch is now `codex/wp-015d3b-v9d-resource-utilities`; the historical remote is unchanged. Retain historical failures and distinguish new actual live browser proof from legacy browser passes.

The direct closure additionally admits the startup branch in `client/src/script.ts`: `v9-live` must bootstrap the real session rather than be captured by the generic local-preview branch. This was reproduced by the new live browser test. Existing query values retain their behavior.

Direct review reproduced and corrected four additional gaps: the generic preview
startup swallowed `v9-live`; a retry reused the previous challenge lifecycle;
late results could terminate a replacement challenge; and paused restart could
mount the old leave result over the new scene. The existing live browser carrier
now exercises real injected creation, pause/resume, transport reconnect, an AI
cast, expiry, result retry and paused restart. The assessment now searches all
30 restricted player candidates with one charged tick each, ranks genuine
rollouts, completes retreat, records measured workload and compares detached
execution against the real coordinator at every exercised tick. Synthetic
openings remain isolated from production replay/reward proof.

The earlier D5 two-file restriction describes the first performance correction.
The owner's subsequent closure instruction also covers the already admitted V9
lifecycle/reward/protocol fixes and the client/assessment corrections above;
the only additional startup and dependency paths are explicitly listed in this
amendment. The frozen AI lattice, work/clock caps and public V7 selector remain.

#### Direct closure result

V9D engineering closure passes at `5a1bd03`. The corrected report completed
196 scenarios / 272 executions in 832.319 seconds with no failure; its source
commit, SHA-256, measured workload and observations are retained in the existing
[V9 evidence](../evidence/wp-015d3b.json). The 120 full matches produced 29 player
wins, 90 Loomkeeper wins and one draw. No Spoolburst was selected across 49
affordable opportunities; this remains a descriptive balance observation.

The selected product/tooling/build/smoke/security checks passed, followed by
final types and focused tests, a fresh build, 55 canonical phone-browser passes,
all three separately owned landscape cases and the final live-V9 journey after
the paused-restart correction. The existing ordinary Practice performance gate
passed; npm audit reports zero vulnerabilities. Documentation closure selects
only work-package checks. Historical failures are reconciled without removal.

This owner-directed contributor review used no agents and supplies no fresh
independent-review claim. Next is owner phone acceptance of the injected live
candidate; PostgreSQL, Ubuntu visual/full release, balance acceptance and public
shared Practice/reward promotion remain separate. The full daily gate stays at
21:00 Europe/Berlin. Local V9D branch naming is corrected; the remote V9B branch
and main are untouched. Overall package evidence remains `in_progress` for
those acceptance/release decisions, not for an unfinished V9D implementation.

### V9D deployed Practice admission correction — 2026-09-07

Owner phone testing on Render reproduced `The V9 candidate is unavailable`:
the client query selected live V9, but the built server entry point only exposed
V7/V8 profiles. Prior injected-browser and engineering closure evidence did not
establish deployable V9 phone readiness. This is a distinct deployment gap.

The primary task owns this correction without agents. Admit only the existing
server startup/profile parser, registry/runtime admission, built-smoke script,
profile/browser tests and these existing docs/evidence carriers. Introduce
`development-v9d-practice` under the existing production-runtime/paused-reward
safeguards. Use a distinct registry admission, fixed real clocks and the current
V9 automation; do not expose test-only clock/seed/advance seams. Reject reward
matches, reservation metadata, mixed profiles, injected runtime services and
test shortcuts. Preserve saved credentials without parsing or connecting them.
The normal V7 selector and V8 profiles remain unchanged. No payout, balance,
shared-mode promotion or physical-device acceptance is implied.

Required witnesses: red/green admission and isolation tests; built production
entry with actual V9 AI progression and DB/RPC contact tripwires; phone browser
Start Practice and paused retry through real profile admission; selected
regressions, fresh build/smoke and direct continuity review. Read the exact
[Render setup](../../README.md#v9d-phone-acceptance-on-the-existing-render-service)
before testing; publishing code alone does not change Render environment values.

Correction verification passed: all selected types/compliance/unit/tooling,
fresh build and four built profiles, including actual V9 AI cast and zero
contacts with dormant DB/RPC endpoints; phone matrix 56 passed with three
expected landscape-only exclusions. Direct review passes the code correction.
Next: redeploy the corrected V9D branch with the documented environment values
and repeat owner phone acceptance. Render settings were not changed remotely.

### V9D early-stop diagnosis (2026-09-07)

The owner now reaches Practice on Render but reports an early first-AI-turn
stop after about 20 seconds at tick 381. This reopens phone readiness. Normal
expiry is 30 minutes; supplied favicon access-log 404s do not diagnose the stop.

The bounded diagnostic correction admits the V9 coordinator, result envelope,
registry result/log bridge, existing result scene, AI/browser tests and these
existing documentation carriers. Optional `stopReason` metadata distinguishes
the existing safety reasons and `runtime_error`. Timer exceptions keep the
historical fail-closed replay operation but carry `runtime_error` operational
metadata; no replay reconstruction may treat that metadata as policy proof.
Normal outcome/settlement semantics, state hashes, replay encoding, 30-tick
debt limit and all AI work/selection rules remain unchanged. Practice deployment
logs only finite reason/state counters and batch timing, never raw exceptions
or ownership/credential values. The UI distinguishes interruption from expiry.

Controlled slow batches reproduce a timing stop, while ordinary local cadence
passes. Neither proves the owner's Render cause. Retain the deployed
`[v9-practice-stop]` diagnostic before choosing the underlying correction;
do not mark phone acceptance or the runtime failure resolved from this patch.
