# WP-015D2R Stage C Independent Reconstruction And Chart Revision Report v1

## Bound result

- Stage B result commit: `d340a2286598a1fd399dfa23ba55426185f0e96d`
- Stage B result digest: `db073dfe67e0687253fe284832b45fad051b463edfd2e8ac9d3fb862b86c3a11`
- Stage C source commit: `e09b253356843342bd8077403668911cad539b46`
- Stage C source digest: `1981a2340ce9c9fde6c8146c2f092c41874c548234696af870d046f5dd7a8ef5`
- Stage C result digest: `fce3bbdb8061d6fc758973eb0bc7d51b5ca579cc0048f920dbb564c55993cbd4`
- Semantic reconstruction readiness: `ready_for_committed_review`
- Implementation path: `reconstruction_independent`
- Mathematical evidence: `correlated_reuse`

Stage C read only the committed Stage B result blob. It did not enumerate routes, call the authority simulation, read ignored raw outputs, or import the Stage B semantic builder.

## Exact reconstruction

- Endpoints: 274
- Thin source classes: 9; aliased classes: 7
- Pair identities: 7378; exact predecessor-row matches: 7378
- Target-relevant pairs: 1113
- Target-relevant pairs with unequal pre-command `movementRemaining`: 1113
- Target-relevant pairs with equal pre-command `movementRemaining`: 0
- Same-depth target-relevant pairs: 0
- Cross-tab digest: `5247cba5743f97aa05a4e60b4bfed3426d5de2446b1bcdb903e3a518fd64e293`

- `frame_support_failure`: 0
- `command_semantic_split`: 1099
- `continuation_support_split`: 14
- `provenance_exact_state_only_split`: 2983
- `no_target_relevant_split`: 3282

| depth pair | relation | pre-budget pair | post-budget pair | outcome | count |
| --- | --- | --- | --- | --- | ---: |
| 2/4 | cross_depth | 48/32 | 40/24 | continuation_support_split | 7 |
| 2/8 | cross_depth | 48/0 | 40/0 | command_semantic_split | 113 |
| 4/2 | cross_depth | 32/48 | 24/40 | continuation_support_split | 7 |
| 4/8 | cross_depth | 32/0 | 24/0 | command_semantic_split | 416 |
| 8/2 | cross_depth | 0/48 | 0/40 | command_semantic_split | 68 |
| 8/4 | cross_depth | 0/32 | 0/24 | command_semantic_split | 502 |
| 4/4 | same_depth | 32/32 | 24/24 | no_target_relevant_split | 12 |
| 4/4 | same_depth | 32/32 | 24/24 | provenance_exact_state_only_split | 15 |
| 8/8 | same_depth | 0/0 | 0/0 | no_target_relevant_split | 3270 |
| 8/8 | same_depth | 0/0 | 0/0 | provenance_exact_state_only_split | 2968 |

## Candidate carriers

- `Q_support = (thin_visible_duel_v0@2, pre-command movementRemaining)`: 6265 equality pairs, 0 complete-target counterexamples; `sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique`.
- `Q_command = (thin_visible_duel_v0@2, next-move admissibility)`: 6279 equality pairs, 0 command-semantic counterexamples, and 14 separate continuation-support counterexamples.
- Thin-only: 1113 complete-target counterexamples.
- Admissibility-only: `insufficient_without_thin_source_context`.

The finite result licenses no causal, unique-minimal, global, all-seed, public-formation, or recursive-continuation inference. Route depth, movement budget, admissibility, and revision are co-formed in the observed strata.

## Witness re-entry

- execution witness: `present`
- evidence class: `correlated_reuse`
- navigator admission: `pending`
- candidate sufficiency: `sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique`
- `W`: `present`
- `Omega_W`: `evaluated_exact`
- observed `P_W`: `observed`
- observed `N_W`: `observed`
- `J_W`: `complete_for_bounded_registered_one_command_audit`
- `J_W` state-material ledger: `2816591a3e6a5188971bab0cd63b9404378812751e92b1a59413cb3be5a7d6a6`; live recursive state `absent_not_established`
- thin-cut completeness: `intentionally_incomplete`

The bounded audit is complete. The thin cut is not.

## D2Q protected-core recovery

- Status: `recovered_from_immutable_provenance_without_replay`
- Source commit: `85f6ea945bd2b5b2aacb6b61cc2af52fe0c09ebb`
- Result digest: `b538f5b6da82dc3b6655a9c0d89404e3b20592191886a9bb4280d6fe481d1615`
- Return blob: `f992202b2be4d8e47e293a81325537ee28474f47`
- Complete case-row digest: `2202151c88d85e922b303bebd61d43c52279d571f1fe2087260ec27c31a9129d`
- Complete actor/turn ablation-row digest: `675b829933fc5e20ed893eacdfb718a928ba5397d438be3181922b1fa1b53a7c`
- Matched readouts: 4

- `CMD-ACTOR-01`: accepted `false`, mutated `false`, error `NOT_YOUR_TURN`, events `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`, movementRemaining `64`, playerX `512`, revision `0`, pre/post `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d` / `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d`; row controls inputUnchanged `true`, evidence `correlated_reuse`, placement `none`, verdict `matched_source_prediction`, source match `true`.
- `CMD-PRECEDENCE-01`: accepted `false`, mutated `false`, error `LATE_TURN`, events `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`, movementRemaining `64`, playerX `512`, revision `0`, pre/post `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d` / `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d`; row controls inputUnchanged `true`, evidence `correlated_reuse`, placement `none`, verdict `matched_source_prediction`, source match `true`.
- `CMD-TURN-01`: accepted `false`, mutated `false`, error `LATE_TURN`, events `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`, movementRemaining `64`, playerX `512`, revision `0`, pre/post `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d` / `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d`; row controls inputUnchanged `true`, evidence `correlated_reuse`, placement `none`, verdict `matched_source_prediction`, source match `true`.
- `CMD-VALID-01`: accepted `true`, mutated `true`, error `null`, events `ba0d81ab95b73d737e68d70ba9a074ce74bf4b0e2125151d83fe3169c8902785`, movementRemaining `56`, playerX `520`, revision `1`, pre/post `f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d` / `c046a4e1a93d27ce98860541048d43289e78f68f8857697784a68430902061be`; row controls inputUnchanged `true`, evidence `correlated_reuse`, placement `none`, verdict `matched_source_prediction`, source match `true`.

- `ABL-ACTOR` / `actor`: full `b54ff53965a4fcf93e019f5df9eca03304407c1be89a6e1071e911789b09097b`, ablated `b9ac2377eb541f4b240f8a2f8508ce2ac95d35f08dbb183043cdc5516de1895a`, restored `b54ff53965a4fcf93e019f5df9eca03304407c1be89a6e1071e911789b09097b`; primary `target_relevant_on_declared_V4_command_gate`, equality `no_omission_witness_found`, error-only `not_applicable`, derived `target_relevant_on_declared_V4_command_gate`.
- `ABL-EXPECTED-TURN` / `expectedTurn`: full `b54ff53965a4fcf93e019f5df9eca03304407c1be89a6e1071e911789b09097b`, ablated `d46146209bd2ce5258763b4f3c25bd7326fc5c1b329a285300d0d21a3671eb53`, restored `b54ff53965a4fcf93e019f5df9eca03304407c1be89a6e1071e911789b09097b`; primary `target_relevant_on_declared_V4_command_gate`, equality `not_applicable`, error-only `target_relevant_on_declared_V4_command_gate`, derived `target_relevant_on_declared_V4_command_gate`.

- `actor`: `target_relevant_on_declared_V4_command_gate`
- `expectedTurn`: `target_relevant_on_declared_V4_command_gate`

## Carrier role split

- `movementRemaining`: `live_carrier` — Pre-command movementRemaining added to the thin projection is sufficient for the complete registered one-command target on this finite domain.
- `move admissibility`: `target_relative_support` — Next-move admissibility added to the thin projection preserves command semantics but leaves fourteen continuation-support splits.
- `route history`: `provenance` — Exact route history recovers endpoint provenance but makes equality testing vacuous.
- `revision`: `provenance` — Revision is co-formed with depth and budget on this finite domain.
- `exact state digest`: `re_entry_support` — Exact state digests authenticate re-entry and retained result identity.

## State-material separation

- Audit predecessor provenance: `authenticated` (15 exact bindings).
- Domain-transition provenance: `route_history_and_revision_only`.
- Re-entry material: `exact_state_digest_only`.
- Live recursive state: `absent_not_established`.
- Pre-command budget: `bounded_one_command_live_carrier`; recursive state `false`.

## TAU-WPV4-RETURN-01A

- `AUTHENTICATE_EXACT_SOURCE_BINDINGS`: pass (`546cabafbedac3ffa0bae484430e9446bec33f2f0e7567192ddfa455e89919c7`)
- `INDEPENDENT_EXACT_RECONSTRUCTION`: pass (`93623752748f00ff46070e52e7812f9489136c4ad34307c324814b5198dce321`)
- `DERIVE_TARGET_RELEVANT_CONSTRAINTS`: pass (`96371bb775b6b4e6f925c5b211c2dbd2cc0c75fe54bf144a935badc575fc9013`)
- `D2Q_PROTECTED_CORE_RECOVERED_WITHOUT_REPLAY`: pass (`4072b5c0fd8cc9436e8d3515fda9e89f0ef19615aa705ccaad3b4974e802cde0`)
- `PRESERVE_ONE_COMMAND_RESULT_AND_SPLIT_ROLES`: pass (`038d08205555eb7448e736113a511446251382086e4ece34a21fbaada1a6b0c5`)
- `WITNESS_BOUNDARY_REPAIRED`: pass (`2dce30dfee9f01af17688d2512a3cb37ee897afb9750bba0fba62177c22ba0dc`)
- `STATE_MATERIAL_ROLES_SEPARATED`: pass (`2816591a3e6a5188971bab0cd63b9404378812751e92b1a59413cb3be5a7d6a6`)
- `NONVACUOUS_CARRIER_CONTROLS_PASS`: pass (`e6e571cfe3d0e94f8bc1b39e33caca3a4aa4980574cd2f1b2081fcd591667f27`)
- `NEGATIVE_RESIDUE_RETAINED`: pass (`1464e8ceaeb5f03751b6158c56e6536b2c8cbc4c91e2f01abe700e40abed3003`)
- `GOVERNED_OUTPUT_AND_ANTI_PROMOTION_BOUNDARY_PRESERVED`: pass (`22ca5d182b06dfb95ad09cdf9456196d0939fdfb991f30b4ce0b0add5fc8b521`)
- `DURABLE_RESULT_REVIEW_RANGE_PARITY_AND_PILOT`: fail (`7c01b072b9040c2db6c7135a6316769e842af249feca6bb71b855832dd3ddf1b`)

Status: `candidate_unlicensed`. All semantic obligations passed, but durable result review, range/parity authentication, and final navigator admission remain pending. ProductAuthority and mathematical placement remain `none`.

## Chart revision and residue

The initial chart does not strengthen `TAU-WPV4-RETURN-01A` before durable review. It strengthens only semantically ready candidate routes and demotes thin-only, admissibility-only, exact-route, revision-proxy, and exact-state-as-live-carrier routes according to their recorded failure modes. The residue-derived successor recommendation is `TAU-WPV4-QSUPPORT-LONGER-HORIZON-01`, status `recommended_for_separate_preregistration_only`. It is not an opened execution.

- strengthened `Q_SUPPORT_THIN_PLUS_PRE_COMMAND_MOVEMENT_REMAINING`: `sufficient_for_complete_registered_one_command_target_on_finite_domain_nonunique`
- strengthened `Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY_COMMAND_SEMANTIC_SUBTARGET`: `sufficient_for_registered_command_semantics_only_not_continuation_support`
- demoted `TAU-WPV4-RETURN-01A`: `candidate_unlicensed`
- demoted `Q_COMMAND_THIN_PLUS_NEXT_MOVE_ADMISSIBILITY_COMPLETE_K_TARGET`: `demoted_insufficient_for_complete_continuation_support_target`
- demoted `THIN_VISIBLE_DUEL_ONLY`: `demoted_insufficient_for_registered_target`
- demoted `NEXT_MOVE_ADMISSIBILITY_ONLY`: `demoted_without_thin_source_context`
- demoted `EXACT_ROUTE_HISTORY_AS_LIVE_CARRIER`: `demoted_vacuous`
- demoted `REVISION_AS_SEMANTIC_CARRIER`: `demoted_coformed_proxy`
- demoted `EXACT_STATE_DIGEST_AS_LIVE_CARRIER`: `demoted_overthick_reentry_only`

Residue remains longer horizons, other seeds/routes/commands, public formation, player observation and timing, aim/fire, global minimality, gameplay authority, and ProductAuthority.

## Governed stop

ProductAuthority: `none`. Mathematical placement implication: `none`. Player observation/timing: `closed`. Gameplay change: `false`. P5: `closed`. Successor world execution: `closed`.

No successor world execution opened.

WP-015D2R Stage C reconstruction stopped for durable result review;
witness re-entry remains pending.
