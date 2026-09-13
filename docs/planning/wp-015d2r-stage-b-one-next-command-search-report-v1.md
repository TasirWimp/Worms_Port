# WP-015D2R Stage B One-Next-Command Search — Execution Report v1

Status: durable deterministic execution result; stopped for review. Stage C is not opened.

Source commit: `439bba3d92a4b4ab3216ad3fa987e90b983dd2c0` (tree `aab7b66ea4646c557b31542347ae1f693463d8ae`). Preregistration source: `65b2153714f237964354da3791fe4af4694a0594`; terminal: `6e88418a6a90281976dd5f6dcf2e6db55d9e4009`. Result digest: `db073dfe67e0687253fe284832b45fad051b463edfd2e8ac9d3fb862b86c3a11`.

## Exhaustive Domain Result

The executor attempted all 276 registered shortlex words. It excluded 2 exact calibration occurrences before initialization or authority use, retained 0 first rejections and 0 pruned extensions, decoded 274 eligible endpoints once each, and compared all 7378 unordered exact-cut alias pairs. It did not stop at a positive.

| Primary outcome | Pair count |
| --- | --- |
| `frame_support_failure` | 0 |
| `command_semantic_split` | 1099 |
| `continuation_support_split` | 14 |
| `provenance_exact_state_only_split` | 2983 |
| `no_target_relevant_split` | 3282 |

Post-command `movementRemaining` inequality is called only a **continuation-support-coordinate split**. It is not recursive continuation closure. Revision, state-digest, or route inequality alone remains provenance/exact-state pressure and cannot certify a continuation-bearing carrier.

## Non-Authoritative Descriptive Cross-Tab

This cross-tab is descriptive only. Every depth, pre-budget, and post-budget pair retains the same canonical route-ID left/right endpoint ordering. The known route-length/movement-budget pattern is marked only when endpoint depth and pre-command budget vary in opposite directions. It distinguishes recurrence of that pattern from pressure not explained by it; it does not add or alter a primary outcome.

Using only the displayed axes, 1113 target-relevant pair(s) recur across different route depths with different pre-command movement budgets. 0 target-relevant pair(s) are not explained by that registered route-depth/budget pattern. These are descriptive counts, not causal or placement verdicts.

| Depth pair (L/R) | Depth relation | Pre budget pair (L/R) | Post budget pair (L/R) | Known route/budget pattern | Primary outcome | Pairs |
| --- | --- | --- | --- | --- | --- | --- |
| 2/4 | cross_depth | 48/32 | 40/24 | observed | `continuation_support_split` | 7 |
| 2/8 | cross_depth | 48/0 | 40/0 | observed | `command_semantic_split` | 113 |
| 4/2 | cross_depth | 32/48 | 24/40 | observed | `continuation_support_split` | 7 |
| 4/8 | cross_depth | 32/0 | 24/0 | observed | `command_semantic_split` | 416 |
| 8/2 | cross_depth | 0/48 | 0/40 | observed | `command_semantic_split` | 68 |
| 8/4 | cross_depth | 0/32 | 0/24 | observed | `command_semantic_split` | 502 |
| 4/4 | same_depth | 32/32 | 24/24 | not_observed | `no_target_relevant_split` | 12 |
| 4/4 | same_depth | 32/32 | 24/24 | not_observed | `provenance_exact_state_only_split` | 15 |
| 8/8 | same_depth | 0/0 | 0/0 | not_observed | `no_target_relevant_split` | 3270 |
| 8/8 | same_depth | 0/0 | 0/0 | not_observed | `provenance_exact_state_only_split` | 2968 |

## Durable And Raw Retention

Every raw ledger is mirrored by its complete array in the machine result. Digests bind both the array and exact canonical JSONL bytes.

| Raw path | Rows | Records digest | File SHA-256 |
| --- | --- | --- | --- |
| `test-results/crpm-world/wp-015d2r-stage-b-v1/route-attempts.jsonl` | 276 | `92d0fcc6f7e8209c298e77f286de8e014c1cf970fee29aa8e308b519a32c939b` | `d460cd5d5599ce41803cf62ce3e343f92281c51d7e1ed56767d6f06b8a9eccdc` |
| `test-results/crpm-world/wp-015d2r-stage-b-v1/rejected-prefixes.jsonl` | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `test-results/crpm-world/wp-015d2r-stage-b-v1/eligible-endpoints.jsonl` | 274 | `7665869819cd5626d599e22ae73953b95dccd797d321ecdcca430eb5aa4526e9` | `9310fb77d5db57e1d54bed81542a214004970865198671ab9981c401908c251b` |
| `test-results/crpm-world/wp-015d2r-stage-b-v1/alias-pairs.jsonl` | 7378 | `93623752748f00ff46070e52e7812f9489136c4ad34307c324814b5198dce321` | `57fe83ebf091d4134029e7e2b06be87993fd96b64d47f9374e592f561a1950ba` |
| `test-results/crpm-world/wp-015d2r-stage-b-v1/frame-support-failures.jsonl` | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Governed Stop

`TAU-WPV4-RETURN-01A` remains `candidate_unlicensed`; decodability across the move is not evaluated. Target-relevant pair rows, if any, remain candidate results: `W` is absent and `Omega_W`, `P_W`, and `N_W` remain not evaluated until separate review. This execution selects no successor carrier, revises no chart, claims no landfall, issues no ProductAuthority or placement, and does not perform Stage C or open P5. Evidence remains `correlated_reuse`.

> WP-015D2R Stage B execution stopped for review; Stage C not opened.

<!-- STAGE_B_EXECUTION_PARITY_JSON_BEGIN -->
```json
{
  "resultId": "wp-015d2r-stage-b-one-next-command-search-v1",
  "sourceCommit": "439bba3d92a4b4ab3216ad3fa987e90b983dd2c0",
  "sourceTree": "aab7b66ea4646c557b31542347ae1f693463d8ae",
  "preregistrationSourceCommit": "65b2153714f237964354da3791fe4af4694a0594",
  "preregistrationTerminalCommit": "6e88418a6a90281976dd5f6dcf2e6db55d9e4009",
  "resultDigest": "db073dfe67e0687253fe284832b45fad051b463edfd2e8ac9d3fb862b86c3a11",
  "primaryOutcomeCounts": {
    "frame_support_failure": 0,
    "command_semantic_split": 1099,
    "continuation_support_split": 14,
    "provenance_exact_state_only_split": 2983,
    "no_target_relevant_split": 3282
  },
  "targetRelevantPairCount": 1113,
  "witnessInterface": {
    "W_status": "absent",
    "candidateResultStatus": "present",
    "candidatePairCount": 1113,
    "candidatePairIdsDigest": "02b4c88d0aeeeffdbd2effae782180464e514d73c740f9f58d561825fe2a8ee1",
    "Omega_W_status": "not_evaluated",
    "P_W_status": "not_evaluated",
    "N_W_status": "not_evaluated",
    "J_W": "not_applicable"
  },
  "hardGatesPass": true,
  "analyticalDisposition": "stopped_for_review",
  "tauStatus": "candidate_unlicensed",
  "stageC": "not_opened",
  "productAuthority": "none",
  "mathematicalPlacementImplication": "none",
  "stopStatement": "WP-015D2R Stage B execution stopped for review; Stage C not opened."
}
```
<!-- STAGE_B_EXECUTION_PARITY_JSON_END -->
