# WP-015D3A V8 Action-Turn Preparation And Contract

Date: 2026-09-02. Status: preparation complete; owner's shared-ruleset
correction independently reviewed; V8 implementation not started. WP-015D3A remains
`in_progress`; its reference record is only
`observed`. This pass implements no gameplay and opens no observation session.

## Purpose and source boundary

Prepare the owner-approved, Sorcerers-inspired action-turn migration on the
existing MIT game, preserving a practical V7 fallback and the analytical route.
This is an intermediate playable-candidate plan, not a balance proof or a port
of Sorcerers. The next owner handoff is preparation review, before V8 code.

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

Tracked changes are limited to these seven paths:

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

No client/server/shared code, test, script, package, asset, schema, automation,
other legal manifest, analytical carrier, or CRPM file may change. No branch
is pushed, no PR is created, and no service is deployed in this pass.

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

### A. Freeze the rules and preserve shared activation

Before runtime edits, the independent implementer proposes and records the
finite V8 parameter/transition table and its exact source/test path allow-list
in this contract, then obtains scoped design review. The initial product
baseline is V7's 30 fixed ticks/second, 30-second action clock, three Relics,
one actor per side, and 16-turn safety cap. These are Worms_Port values, not
reference constants; the cap is a safety limit, not evidence of good pacing.

Choose and freeze product-authored horizontal speed, jump launch/gravity and
landing rules, retreat duration, input-lease/refresh limits, maximum tick
catch-up, replay capacity, command/rate limits, pause/resume semantics, and
AI work budget. Record movement per full turn and retreat alongside weapon
reach so V8 does not accidentally turn every opening into trivial contact.
No unreviewed parameter or unlimited work loop may be hidden in implementation.

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

### B. Authoritative movement, phases, and replay

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

### C. Touch controls and presentation

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

### D. Loomkeeper, full lifecycle, and candidate acceptance

Introduce a separately identified policy if the current bounded command-plan
policy cannot express V8 time/movement. The AI must obey the same time,
movement, jump, collision, offensive-cast, and retreat limits. It may not gain
extra time, hidden information, or perfect unbounded search. Keep existing
policies/replays reproducible and test deterministic tie breaks/work bounds.

Finish Practice start, retry, win/loss, timeout, pause, reconnect, and server
expiry, plus rewarded-match creation, completion and replay compatibility with
the same ruleset, before candidate activation. Ship only after the quick
feature gate, focused shared-mode parity and V8 lifecycle/security tests, and
distinct review pass. This package is not done merely because a
walking/jumping demo works.

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

For this documentation-only pass: verify V7 HEAD/tag and archive contents,
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

These facts describe this preparation pass. Lane M and Stage C execution also
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
the mode-isolation part of that historical review. The next bounded step is
V8A's finite product-authored parameter/phase table, exact implementation
allow-list, and shared Practice/reward combat-parity gate under independent
review.
Stop here: no V8 runtime implementation, Lane G/Lane M execution, observation,
push, PR, or deployment is opened by this preparation return.

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
