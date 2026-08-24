# WP-015D2F I2 Policy-Conditioned Closure Audit Contract

Status: complete and residualized on 2026-08-24.

- **Operational lane:** Lane 1 analytical audit; no gameplay candidate change.
- **Object under review:** unchanged I2 entry Seam-Pin exclusion.
- **Parent/comparator:** unchanged F4 structural reference.
- **Worms_Port base:** `9865d265526ed87ea96ea4810d1272080ba1c5f1`.
- **Working branch:** `codex/wp-015d2f-i2-policy-closure-audit`.
- **Execution Pointer:** remains WP-015D2A.
- **Maximum maturity:** bounded analytical audit.
- **ProductAuthority:** `none`.

## Question

Does I2's lower aggregate first-actor rate represent a continuation change that
survives the declared policy cut, or is it produced mainly by particular
policies selecting weaker follow-up actions after I2 removes the caster's
Seam-Pin cooldown?

This package answers that question before another gameplay mechanic is
invented. It does not reopen, edit, or reclassify the sealed WP-015D2D or
WP-015D2E artifacts. It may add a new durable audit disposition that treats I2
as policy-fragile evidence for future candidate selection.

## Discovery witness and epistemic status

A read-only exploratory run exposed the pressure case that motivates this
contract:

- F4 records 732 first-actor wins in the twelve-distance frame; I2 records 684;
- when grouped by the first actor's policy, I2 reduces `range_pressure` and
  `retreat_kite` by 36 wins each but adds eight wins each to `medium_hold`,
  `short_approach`, and `best_response`;
- best-response versus best-response remains 44 first-actor wins in 48 matches
  for both F4 and I2; and
- on the exact production-spawn opening carrier at distance 640, I2 cannot
  trigger because Needlepoint is already in range; later separation and
  re-entry remain distinct carriers where suppression may occur.

An uncommitted in-memory counterfactual further suggested that retaining the
caster cooldown forces a 45-damage Threadball follow-up where cooldown-free I2
permits another 30-damage Needlepoint. That counterfactual is hypothesis-forming
only. It is not accepted evidence, is not a candidate, and must not appear as a
source-bound result unless separately contracted later.

The source-supported claim is limited to the deterministic F4/I2 reports and
their traces. The interpretation that an aggregate improvement is
policy-fragile remains a Worms_Port analytical judgment tested by this package.

## Authority and change boundary

`shared/simulation.ts` remains the sole production gameplay authority. The
Python tactical model remains authoritative only for its declared ideal-direct
abstraction. WP-015D2F must not change:

- `analysis/tactical_model/model.py`;
- any tactical config or historical report semantics;
- any WP-015D2B or WP-015D2E implementation, lock, request, result, or digest;
- shared, client, server, protocol, replay, Loomkeeper, reward, wallet, asset,
  package, or V1-V4 behavior; or
- CRPM sources or dependencies.

The implementation may add one deterministic audit module, focused tests, an
ignored-output CLI path through that module, and bounded README/planning/evidence
updates.

## Frozen domain and carrier cut

Run the exact existing F4 and I2 configs over:

```text
511 512 513
575 576 577
639 640 641
703 704 705
```

For each config and distance, retain both first actors, both mirrors, all 25
ordered pairs of `range_pressure`, `medium_hold`, `short_approach`,
`retreat_kite`, and `best_response`, seed 3237998097, and the existing 16-turn
horizon. This is 1,200 matches per config and 2,400 matched audit carriers.

The audit cut retains config/report identity, distance, first actor, mirror,
ordered policies, winner/terminal cause, recurrence, forced-opening evidence,
entry-cast identity, entry suppression, caster cooldown, opponent response,
the first actor's next action, and the complete source trace reference needed
to reproduce each summary. Terrain, aim, trajectory, splash, player skill,
live Loomkeeper behavior, UI, replay, networking, rewards, assets, and
production state remain excluded.

## Required deterministic surfaces

Emit a strict versioned JSON audit containing:

1. exact F4 and I2 canonical report digests;
2. reconciled aggregate and per-distance results;
3. results grouped by the first actor's policy;
4. results for all ordered policy pairs;
5. same-policy mirrors, including best-response versus best-response;
6. the 641/703/704 movement-created Needlepoint entry routes grouped by first-
   actor and second-actor policy;
7. matched F4/I2 post-entry action choices for the original caster;
8. exact-spawn distance-640 non-use evidence;
9. policy-contribution deltas whose sum equals the aggregate F4-to-I2 delta;
10. blocked claims, disposition, ProductAuthority, and a canonical SHA-256
    audit digest.

Arrays are ordered by the declared distance and policy order. Object keys are
canonicalized for hashing. No wall-clock value or generated output path enters
digested content.

## Closure rules

Classify I2 as `residualized` with reason `policy_fragile` if any of the
following holds:

- I2 lowers the aggregate first-actor result but does not lower
  best-response-versus-best-response first-actor wins;
- every same-policy mirror remains outcome-identical while only cross-policy
  matchups redistribute;
- the aggregate delta is dominated by one or more declared policies while
  another declared policy becomes more first-actor-favorable;
- the matched entry paths show that removing cooldown changes later action
  selection in a way that explains the result without providing a robust
  defender continuation; or
- I2 does not change the opening edge or aggregate result at exact production
  spawn 640, even if later separation and re-entry create suppression edges.

The audit cannot produce `accepted_for_analysis`, M3, a generic balance score,
or ProductAuthority. A residualized result means I2 remains useful historical
structure evidence but is not a sound base for a Lane 3 gameplay proposal.

## Stop gates

1. **Contract:** freeze this record before code.
2. **Implementation:** add only deterministic derivation/tests; stop if model,
   config, D2E lock, or historical digest changes.
3. **Execution:** run both complete reports and reconcile every summary.
4. **Closure:** record one bounded audit disposition and preserve blocked
   claims.
5. **Handoff:** review the full candidate history before selecting another
   mechanic or policy family.

## Completion result

The audit reproduces F4 report digest
`8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd`
and I2 report digest
`31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d`.
Its deterministic audit digest is
`476735407135b11f1d3805a7b7a4b22c5d7c8a46a1f6ac972f2d134fb3ff1657`.

The complete 2,400-carrier result records:

- F4 732/1,200 and I2 684/1,200 first-actor wins;
- first-actor-policy deltas `-36/+8/+8/-36/+8` in the declared policy order;
- zero F4/I2 outcome delta for every same-policy mirror, including
  best-response versus best-response at 44/48 first-actor wins;
- 72/120 matched entry routes with a changed next action and 36/120 with an
  outcome change;
- exact spawn 640 unchanged at 60/40, with zero opening suppression and 28
  later separation/re-entry suppressions; and
- all five closure findings triggered with ProductAuthority none.

I2 is therefore `residualized` with reason `policy_fragile`. This is a new
audit disposition over unchanged historical evidence, not a rewrite of D2D or
D2E. The next permitted action is a cross-candidate review that distinguishes
mechanic failures from policy-model and abstraction failures before proposing
another rule.
