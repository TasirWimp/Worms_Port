# WP-015D2R Stage B One-Next-Command Search — Preregistration Contract v1

Status: source-only preregistration; Stage B execution is closed.

Date: 2026-08-29.

Package: `WP-015D2R`. Support evidence: `WP-015D2S`. Child: `WPV4-NAVIGATOR-01B`.

Owner: Worms_Port. Coordinator: the current cross-repository task, sole writer. Machine source of truth: [Stage B v1 registration](../../analysis/crpm_world/navigation/wp-015d2r-stage-b-one-next-command-search-registration-v1.json). Historical Stage A: [contract](wp-015d2r-residue-driven-round-trip-navigator-contract.md) and [terminal return](../evidence/wp-015d2r/review-return.json).

## Authorization And Governed Cut

This pass may only bind and commit a separately versioned Stage B source/preregistration contract, obtain read-only review, and stop. It may not enumerate a route, call the search, execute a pressure case, replay the calibration sentinel, create a result/report placeholder, change gameplay, open player observation or timing, modify a sealed executor, issue ProductAuthority or placement, open P5 or Stage C, create a PR, or push.

`pilot_activation: not_required`: this pass preregisters one Worms-owned L4+ question. It accepts no witness, return, cross-world transfer, placement, promotion, ProductAuthority, or P5 claim.

Stage A is rebound without mutation to:

- source commit `b2b1822c6714c992c95776d8a6440a667ba72f5d`, tree `dd8bd11749064734de514f4e08b75fe53570d864`;
- terminal commit `4bcb213c9a1a2619d8699f3fed275e6afa71f03e`, tree `8921a538dacdabe688e7ddbe3b4d7770cadb8316`;
- source digest `5de6b5caa9cb2db3c0c875f5bb910b927e68476b37f4127f2f170451f214e6ea`; and
- terminal range digest `1e67f1af5a68074b5b06d04b7068a48024c62ffe6c95b9a050a5c2d2c3b4612a`.

Every Stage A and D2P/D2Q byte remains immutable. The machine registration lists their exact modes, blobs, and Git-byte SHA-256 values. No existing path is an allowed output of this pass.

## Two Different Charts

The alias-producing observation cut is `thin_visible_duel_v0@2`. It is not the D2Q command-gate anchor.

The thin cut retains exactly:

```ts
{
  activeActor: state.activeActor,
  units: state.units.map(unit => ({
    id: unit.id,
    x: unit.x,
    y: unit.y,
    stitching: unit.stitching
  }))
}
```

`activeActor` is the authority-state actor, not the actor submitted with the next command. Source `state.units` order is retained; units are not sorted by ID. Object keys are recursively sorted by canonical rules, arrays retain order, and the class key is:

```text
cut-${sha256(canonicalJson({cutId, cutVersion, projectedValue}))}
```

Exact projected values must be retained and compared in addition to their hashes. Submitted actor, expected turn, next command, route identity, case/verdict labels, omission provenance, movement budget, revision, and full-state digest do not enter the class key.

The source definition labels this cut `player-public`, but that label and the word “visible” do not establish actual HUD or player visibility. D2P keeps this authority-side projection distinct from the player's HUD. Public formation and actual player observation remain untested.

The immutable D2Q anchor instead uses `authority_v4@2` with child observation `d2q-command-declaration@1`. Its observation carries world, initial-state digest, command, submitted actor, and expected turn. D2Q source commit `85f6ea945bd2b5b2aacb6b61cc2af52fe0c09ebb`, result digest `b538f5b6da82dc3b6655a9c0d89404e3b20592191886a9bb4280d6fe481d1615`, return blob `f992202b2be4d8e47e293a81325537ee28474f47`, and report blob `0f42af7a539c5dc2d2c85072189da2d02cc021c6` remain correlated structural lineage only. D2Q cases and verdicts cannot form Stage B equivalence classes or count as new evidence.

## Exact Source Bytes

All Stage B mechanics are bound to Git bytes at terminal commit `4bcb213c9a1a2619d8699f3fed275e6afa71f03e`:

| Role | Path | Blob | Git-byte SHA-256 |
| --- | --- | --- | --- |
| cut definition/domain | `analysis/crpm_world/cuts/v4-cuts.ts` | `769d6fc2ca689eeedfe9bba680b9d24aa37fc67e` | `0e404a6316630ee12203889bf9c2ea97357865a12832a1252f5b1c2274f2a3f2` |
| cut lookup | `analysis/crpm_world/cuts/registry.ts` | `1da5c43710ad1a42b07122640fe0bd41f3a148ba` | `cfd39dbb396ffd226478051daa7209493090f43ee17ef99c39f90a1806064dfb` |
| exact projector/class key | `analysis/crpm_world/kernel/project-cut.ts` | `228844df7d1544091e3007e706c51316be185ba2` | `700d21899e7d65b65143033630d5744cc885c7cca3d86d401c7fbc7c3c59467c` |
| canonical JSON/hash | `analysis/crpm_world/canonical.ts` | `f52effc9560d9cc2fb2227080208f4e99a58ca52` | `df093ac1934f4ed88ba02986399b09276c2a696e55c8f415a3bd6018767d5e67` |
| cut schema boundary | `analysis/crpm_world/schemas.ts` | `2c385a784d775bbb4e9bb50d0aeaf47e6bbab086` | `9ffd7826bc125b7a7800b43499479d8ed00088778d87859c29b73a7f3fcbf75e` |
| V4 authority | `shared/simulation.ts` | `c9279c6f3b5d708ad0e54d32d2dca6d97234b4c0` | `4f559090e41ef0428e9a6e5795f5ad666dbb780981283ebdc34dd7b93e392fb2` |
| calibration exclusion source | `tests/crpm-world/cuts-and-transport.test.ts` | `f79ffe6a9c502120811b61bf92708cde03f9ec71` | `6975338b0d12b14ad31b868d2f7fd0d7980e4c7fd56b106194ebd98cf69dd990` |

The exact cut-definition canonical digest is `8323c4051e5e56e92852a0a2930e55c977d3493d1560b8403c4ca979cca6d8b1`. Git blob bytes, not checkout line endings, define every source digest.

## Fixed Frame

The protected target remains `T_RETURN_COORDINATES/K_WP_ONE_NEXT_COMMAND_RETURN`: determine whether naturally reached endpoints that are equal under the declared thin cut can differ under one exact next authority command.

The frame is fixed as follows:

- **world:** ruleset `nimble-knots-artillery-v4`, ruleset/format version 4, authority `shared/simulation.ts` at the bound bytes;
- **cut:** `thin_visible_duel_v0@2` exact source equality versus one-next-command authority readout;
- **target:** command semantics plus post-command `movementRemaining`, with exact-state/provenance differences retained but non-promoting;
- **domain and routes:** the complete attempted-word definition and accepted natural-route subset below;
- **horizon:** exactly one `applySimulationCommand` call after each eligible endpoint and zero tick, network, UI, browser/device, or playtest calls;
- **support:** fresh deterministic initialization, accepted and mutated prefixes, exact actor/turn derivation, immutable input, and complete retention;
- **tolerance:** exact canonical equality, numeric tolerance zero; and
- **oracle/input boundary:** authority state may establish reachability, class, and protected readout, but calibration labels, D2Q case IDs, expected results, reviewer knowledge, and selected-pair labels cannot enter generation, classing, decoding, or outcome choice.

## Finite Natural-Route Domain

Registration identity: `WP-015D2R:stage-b-natural-move-words:v1`.

The definition is complete and finite; its observed reachable endpoint set is `not_evaluated` until a separately authorized run.

| Coordinate | Frozen value |
| --- | --- |
| seed set | `[3237998097]` (`0xC0FFEE11`) |
| calling | `wizard` |
| initialization | `createSimulation(3237998097, 'wizard', V4_RULESET_ID)` |
| direction alphabet/order | `[-1, +1]`, `-1` before `+1`; direction `0` forbidden |
| eligible endpoint depths | `{2, 4, 8}` |
| word order | shortlex: depth 2, then 4, then 8; lexicographic within depth |
| theoretical word count | `2^2 + 2^4 + 2^8 = 276` before legality/holdout |
| next command | `{type: 'move', direction: +1}` |
| actor/expected turn | current endpoint `activeActor` / current endpoint `turn`; required here to remain `player` / `0` |
| stopping | exhaust the registered domain; no early positive stop |

The future generator must:

1. Construct the 276 words without consulting outcomes.
2. Skip simulation for any word extending a previously retained rejected prefix, recording `pruned_by_rejected_prefix`.
3. Otherwise start that word from a fresh initialization and replay directions in order.
4. At each step derive the actor and expected turn from the current state and call the exact MOVE command.
5. Retain the first ordinary command rejection and stop that word. Such rows are domain-formation negatives, not pair outcomes or frame failures.
6. Require every accepted prefix to be mutated and to preserve the registered frame. An accepted-but-nonmutated transition or source/frame drift is `frame_support_failure`.
7. Admit a source item only at depth 2, 4, or 8 after every prefix passed. The empty/D2Q prefix and other depths are never source items.
8. Apply the calibration exclusions before source projection or next-command decoding.
9. Project remaining endpoints, group by exact thin value, and form every unordered pair of distinct route occurrences in ascending route-ID order.
10. Decode each eligible endpoint once and compare every pair, retaining every negative and failure.

Route identity is `route-${sha256(canonicalJson({seed, calling, rulesetId, directions}))}` with the unhashed route payload retained.

### Calibration Holdout

Exclude both exact occurrences individually:

- `[+1, -1]`; and
- `[+1, -1, +1, -1, +1, -1, +1, -1]`.

Neither occurrence may become a source item, receive the registered next-command readout, occur in an eligible pair, count as a witness, or run separately as a sentinel. The two-step route may be traversed only as an internal prefix required by another longer registered word. After the two exclusions, at most 274 endpoint occurrences remain before legality filtering.

The committed calibration artifacts do not publish endpoint-state digests. A state-equivalence holdout cannot be preregistered without the forbidden replay; exact route-occurrence exclusion is therefore the strongest source-bound holdout. Other routes at the cut's sole admitted seed remain `correlated_reuse`, never empirically independent.

## Held Fixed And Allowed To Vary

The contract fixes source bytes, ruleset/version/format, seed/calling/initialization, cut and canonicalization, route alphabet/order/depth/generator, actor/turn rule, next command, horizon, decoder, zero tolerance, holdout, stop/retention rules, oracle boundary, and output paths.

MOVE-only legal history must hold fixed terrain, seed/RNG state, unit identity/order, active actor `player`, turn/tick `0`, phase `awaiting_command`, selected Relic, aim, projectile/terminal coordinates, alive, and Stitching. Unexpected drift is a frame/support failure.

Allowed natural variation is the ordered route and registered length, position across source classes, facing, `movementRemaining`, revision, full-state digest, and exact route provenance. Active actor plus ordered unit IDs, positions, and Stitching must agree inside any one thin source class.

## Decoder And Outcome Rules

At each eligible endpoint the future executor must invoke exactly:

```ts
applySimulationCommand(
  endpointState,
  endpointState.activeActor,
  { type: 'move', direction: 1 },
  endpointState.turn
)
```

It records route payload/ID, pre-state digest/revision/budget, exact thin value/class key, derived actor/turn, accepted, mutated, exact error or null, ordered authoritative events and digest, post-state digest/revision/budget, post thin value, and proof that the endpoint input was not mutated.

The command-semantic tuple is exactly `{accepted, mutated, error:null|{code,message}, authoritativeEvents:ordered exact array}`. The continuation-support coordinate is post-command `movementRemaining`. Hashes identify retained bytes but never replace exact decoded comparison.

Every eligible pair receives exactly one primary outcome in this precedence order:

1. `frame_support_failure`: a registered source, frame, legality, completeness, actor/turn, support, decoder, tolerance, holdout, oracle, immutability, or retention condition failed. Ordinary rejected prefixes are not this outcome.
2. `command_semantic_split`: the frame passes and command-semantic tuples differ.
3. `continuation_support_split`: command semantics agree but post-command `movementRemaining` differs.
4. `provenance_exact_state_only_split`: semantics and continuation support agree, but revision, canonical state digest, or exact route provenance differs.
5. `no_target_relevant_split`: protected readouts agree; distinct route history alone does not elevate the result.

Component equality flags are retained independently. Revision inequality, state-digest inequality, route inequality, or their combination alone never sets `targetRelevant: true`, certifies a continuation-bearing carrier, or licenses the selected transition. A command-semantic or continuation-support split is only a candidate result for later review.

The normal stop is exhaustive, never first-positive. The future run must retain rejected-prefix/pruned rows, no reachable endpoint, no eligible alias class, all-target-equal aliases, provenance-only splits, exact equalities, and all frame failures. Source or frame drift fails closed with partial records retained. Any change to a frozen coordinate requires preregistration version 2 before execution.

## Prospective Witness And Transition State

There is no Stage B witness before execution:

```json
{
  "W": null,
  "W_status": "absent",
  "Omega_W": null,
  "Omega_W_status": "not_evaluated",
  "P_W": null,
  "P_W_status": "not_evaluated",
  "N_W": null,
  "N_W_status": "not_evaluated",
  "J_W": "not_applicable"
}
```

The planned observation, admissible boundary, support, and frame live separately in the machine registration. They are not observed values.

The separately named **desired protected family** is exact one-next-command command semantics, post-command movement support, and recoverable route/state provenance without provenance-only promotion.

The separately named **anticipated residue** is state-equivalent calibration-neighborhood exclusion, player visibility/public formation, credible response/timing, aim/fire/projectile/tick/network/UI/device/playtest behavior, global minimality, ProductAuthority, mathematical placement, and P5.

`TAU-WPV4-RETURN-01A` remains `candidate_unlicensed`. Its decodability across the move and witness support are `not_evaluated` and `absent`. Even a target-relevant split cannot automatically license it. A later, separate review must establish D2Q readout recovery, continuation decodability, provenance, re-entry, and residue.

## Output Contracts

This preregistration pass may add exactly three regular `100644` paths:

1. `docs/evidence/wp-015d2s.json`;
2. `docs/planning/wp-015d2r-stage-b-one-next-command-search-contract-v1.md`; and
3. `analysis/crpm_world/navigation/wp-015d2r-stage-b-one-next-command-search-registration-v1.json`.

No existing path may change.

The separately authorized future execution pass may add only:

1. `docs/evidence/wp-015d2t.json`;
2. `analysis/crpm_world/navigation/assess-wp-015d2r-stage-b-one-next-command-search-v1.ts`;
3. `scripts/run-wp-015d2r-stage-b-one-next-command-search-v1.ts`;
4. `tests/crpm-world/wp-015d2r-stage-b-one-next-command-search-v1.test.ts`;
5. `docs/planning/wp-015d2r-stage-b-one-next-command-search-report-v1.md`; and
6. `docs/evidence/wp-015d2r-stage-b-v1/result.json`.

Its only allowed ignored raw outputs are the five exact JSONL paths under `test-results/crpm-world/wp-015d2r-stage-b-v1/` named in the machine registration. Authorization is currently false. The v1 preregistration files would remain immutable, and Stage C review/return is outside the execution allow-list.

## Validation And First Governed Stop

Validation must reject duplicate JSON keys/IDs/rows; compare the human contract, machine registration, and work evidence; reproduce all source modes/blobs/Git-byte hashes and the cut digest; prove Stage A and every listed D2P/D2Q artifact unchanged; audit every changed path/status/mode/blob from Stage A terminal through each preregistration commit; run `npm run check:compliance` and `git diff --check`; and obtain identified read-only review of the committed source.

No build, typecheck, simulation, route, pressure, calibration, browser/device, or playtest command is evidence in this pass.

The first governed stop is reached only after the three source artifacts are committed, exact audits pass, read-only review is recorded, and the work evidence closes without execution:

> WP-015D2R Stage B preregistration stopped; Stage B execution not opened.

At that stop `W` is absent, Tau is candidate/unlicensed, Stage C remains closed, ProductAuthority and mathematical placement implication remain `none`, and P5 remains closed.

## Human/Machine Parity Block

The validation audit parses this block and compares it with the machine registration and work evidence.

<!-- STAGE_B_PARITY_JSON_BEGIN -->
```json
{
  "packageId": "WP-015D2R",
  "supportWorkPackageId": "WP-015D2S",
  "childId": "WPV4-NAVIGATOR-01B",
  "registrationId": "WP-015D2R:stage-b-one-next-command-search:v1",
  "stageASourceCommit": "b2b1822c6714c992c95776d8a6440a667ba72f5d",
  "stageATerminalCommit": "4bcb213c9a1a2619d8699f3fed275e6afa71f03e",
  "cut": "thin_visible_duel_v0@2",
  "d2qAnchorCut": "authority_v4@2",
  "routeDomainIdentity": "WP-015D2R:stage-b-natural-move-words:v1",
  "seedSet": [3237998097],
  "calling": "wizard",
  "alphabet": [-1, 1],
  "depths": [2, 4, 8],
  "attemptedWordCount": 276,
  "excludedCalibrationRoutes": [[1, -1], [1, -1, 1, -1, 1, -1, 1, -1]],
  "nextCommand": {"type": "move", "direction": 1},
  "actorRule": "current state.activeActor",
  "expectedTurnRule": "current state.turn",
  "horizonAuthorityCalls": 1,
  "numericTolerance": 0,
  "outcomes": ["frame_support_failure", "command_semantic_split", "continuation_support_split", "provenance_exact_state_only_split", "no_target_relevant_split"],
  "W_status": "absent",
  "Omega_W_status": "not_evaluated",
  "P_W_status": "not_evaluated",
  "N_W_status": "not_evaluated",
  "J_W": "not_applicable",
  "tauStatus": "candidate_unlicensed",
  "evidenceClass": "correlated_reuse",
  "currentAllowedOutputs": [
    "docs/evidence/wp-015d2s.json",
    "docs/planning/wp-015d2r-stage-b-one-next-command-search-contract-v1.md",
    "analysis/crpm_world/navigation/wp-015d2r-stage-b-one-next-command-search-registration-v1.json"
  ],
  "futureExecutionAuthorized": false,
  "stageBExecution": "not_authorized",
  "stageC": "not_authorized",
  "productAuthority": "none",
  "mathematicalPlacementImplication": "none",
  "p5Open": false,
  "stopStatement": "WP-015D2R Stage B preregistration stopped; Stage B execution not opened."
}
```
<!-- STAGE_B_PARITY_JSON_END -->
