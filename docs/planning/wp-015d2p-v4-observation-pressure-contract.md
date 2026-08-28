# WP-015D2P V4 Observation and External-Pressure Contract

Status: documentation/preregistration complete, pending review; no new observation request, pressure implementation, instrumentation or playtest is authorized or executed.

Date: 2026-08-28.

Owner: Worms_Port. Coordinator: the existing cross-repository task, sole writer. Parent route: [D2G navigation review](wp-015d2g-relational-gameplay-navigation-review.md) and [D2O return](wp-015d2o-f4-natural-matched-twin-reachability-contract.md). Governance: [operational lanes](../process/crpm-world-operational-governance.md) and [development workflow](../process/development_workflow.md). Documentation evidence: [WP-015D2P record](../evidence/wp-015d2p.json).

## Question And Authority

Can unchanged V4 supply a source-bound observation/response boundary for a Worms-owned decision question, without importing F4's analytical phase or mistaking an intentionally thin projection for what a player can see?

The owner authorized this documentation-only sidecar to WP-015D2A, not a new active executable package. D2O calibrated bounded F4 axes and left a V4/playtest authority-horizon review gate. This contract names that next review; it does not satisfy the gate by existing. `ProductAuthority: none` applies to this package and does not revoke V4's separately accepted production status.

Worms owns gameplay meaning and acceptable observation targets. `shared/simulation.ts` remains the sole deterministic gameplay authority; client presentation and server lifecycle each retain their own existing responsibilities. CRPM supplies optional L4+ question-forming distinctions, not game evidence, a state ontology, balance criteria, a runtime dependency or a product decision. Its referenced placement units are not transplanted into Worms.

The current operation is the existing owner-authorized documentation-only pre-candidate navigation route. A later registered unchanged request is Lane 0 only within its existing boundary; new cuts/adapters/requests require separate Lane 2 approval; player observation, real timing, UI or other external authority requires separate Lane 4 ownership. Any product proposal remains a separately authorized Lane 3 route. No lane is opened by a case-family row below.

## Two Protected Targets, Not One

- **T_COMMAND / T_AUTHORITY_TIME:** exact command acceptance, rejection, event order and declared next-state readout under explicit V4 inputs, actor, expected turn and a priced tick horizon. Simulation tick time is not wall-clock/player time.
- **T_PLAYER_OBSERVATION:** the actual public information and legal response opportunity at declared visible times on a specified device/browser/session. This needs its own observation boundary and evidence. Reading privileged state or a client source file cannot establish what a player observed.

T_RETURN_COORDINATES and T_FORMATION_RECOVERY are separate diagnostic questions, not a stronger combined target. A source-only inspection cannot answer T_PLAYER_OBSERVATION. Source familiarity and the shared CRPM-inspired lineage prevent calling these contracts empirically independent validation.

## Bound Source And Question Registry

All Worms `source_bindings` below resolve at `worms_entry_head`. Blob IDs and SHA-256 values use canonical committed bytes. The CRPM contract resolves at its own exact commit, which is durable locally but deliberately not pushed. Existing CRPM method pins, D2B/D2E implementation locks and D2O reports remain immutable historical lineage; the new source-manifest record is additional, not a repin.

These are six documentation case families, not six registered executable cases. Their IDs and source roles are fixed for review, but unresolved exact inputs/environment block execution. Every row is `not_tested`; a retrospective source fact is not a fresh result. `method_question_refs` merely names a question prompted by a CRPM unit; it does not assert matching worlds, fibres, dynamics or transferred placement. Empty refs are intentional. The complete registry can be rejected or narrowed.

```yaml
v4_observation_pressure_contract:
  contract_id: "WP-015D2P"
  milestone_id: "DTAP-WP-DOC-01"
  status: "documentation_complete_pending_review"
  owner_repository: "Worms_Port"
  current_operation: "owner_authorized_documentation_only_pre_candidate_navigation"
  active_execution_pointer: "WP-015D2A"
  ProductAuthority: "none"
  crpm_placement_verdict: "not_issued"
  mathematical_placement_implication: "none"
  p5_authoring_open: false
  gates:
    documentation_preregistration: "authorized"
    new_pressure_execution: "not_authorized"
    new_v4_request_execution: "not_authorized"
    playtest_execution: "not_authorized"
    instrumentation_changes: "not_authorized"
    product_proposal: "closed"
  worms_entry_head: "224b6b8af6f63308d653ba20b6ddeabc1783460d"
  source_branch: "codex/wp-015d2o-f4-natural-matched-twin-search"
  implementation_branch: "codex/wp-015d2p-v4-observation-contract"
  crpm_contract:
    blob: "7b672e603d86e9d85bf7b95dcc80dcdb9b6ffbae"
    commit: "b66036e9184612ee7b70d2412e0620ba16665093"
    path: "docs/architecture/definition_target_admission/CRPM_Definition_Target_Placement_Unit_Contract_v0.md"
    sha256: "c38a3b9908e427e68d499be1e8b2d8661b8c45585c7aa45c594e3e2d68821508"
    contract_digest: "8c0aa73cada3ade3f0adc1b1636d346291addb1f8d7e74eb4e77e1360270baf4"
  historical_crpm_method_pins:
    - "995236df60924f790506cf5badec3c102abf3fd1"
    - "7eee60e1e5bfb5d46e975c6df36ec107f43cbb19"
    - "053c6fc0a90ed48d8667016b18a1d10106a7a2bc"
  inherited_d2o:
    raw_digest: "edafdd5c3a7f094eb522a29b4994b40d3b7de0ce0abce0e4589cea565bb6213f"
    result_digest: "bc131d3fa0065cb8e1a93790d297813c243744124dad7bb079ccf0ffb851162e"
    disposition: "d2a_axes_calibrated_authority_horizon_review_required"
    new_execution: false
  source_bindings:
    -
      id: "D2O_CONTRACT"
      path: "docs/planning/wp-015d2o-f4-natural-matched-twin-reachability-contract.md"
      blob: "575cea28e304d39dbe2a095491b342f1d8bf6cdd"
      sha256: "75da7e8c545a97ce21b8f96b1ec1e3a4990ac7066983fb13d5229d78b530fe18"
    -
      id: "D2O_EVIDENCE"
      path: "docs/evidence/wp-015d2o.json"
      blob: "d2b121e9045f46b58423c5c7c222630518749f4b"
      sha256: "17956c46cef5d57ef697989466bc8eaa64f72d96fb38567803348365b0ee42d8"
    -
      id: "OPERATIONAL_GOVERNANCE"
      path: "docs/process/crpm-world-operational-governance.md"
      blob: "7e95b14b8d07e608d83c7716026c61330370ebc6"
      sha256: "146c28c871a990aa4b88b30fa653591f18ed81dcc28f66a3b9cd0bc8d42e1152"
    -
      id: "V4_AUTHORITY"
      path: "shared/simulation.ts"
      blob: "c9279c6f3b5d708ad0e54d32d2dca6d97234b4c0"
      sha256: "4f559090e41ef0428e9a6e5795f5ad666dbb780981283ebdc34dd7b93e392fb2"
    -
      id: "V4_ADAPTER"
      path: "analysis/crpm_world/adapters/v4-authority-adapter.ts"
      blob: "c7a7179ed49ab7c81ebb8da6ee7004ae7c15eee0"
      sha256: "ebc2b7019e5005973102bf99b841efe841a7899c2eac4e02ee47f892ee52a782"
    -
      id: "V4_CUTS"
      path: "analysis/crpm_world/cuts/v4-cuts.ts"
      blob: "769d6fc2ca689eeedfe9bba680b9d24aa37fc67e"
      sha256: "0e404a6316630ee12203889bf9c2ea97357865a12832a1252f5b1c2274f2a3f2"
    -
      id: "V4_FIXTURE"
      path: "analysis/tactical_model/fixtures/v4-authoritative-baseline-v1.json"
      blob: "f21120b3ca6faee696a54b59aa9210b5b4d34116"
      sha256: "4a7b1c1dd11c6c43b285a6da5e3e37f3b9bfeb2f153ae3f752e069d07f0ffaee"
    -
      id: "V4_REQUEST"
      path: "analysis/crpm_world/examples/v4-transcript-request.json"
      blob: "561974fbc753a9b3016b69a55f4b27bf04ec30db"
      sha256: "6f5265b593230a004b4b6b3b370d235bd5bd622b0ab73c16406c30ff0968011a"
    -
      id: "MOVEMENT_TEST"
      path: "tests/crpm-world/cuts-and-transport.test.ts"
      blob: "f79ffe6a9c502120811b61bf92708cde03f9ec71"
      sha256: "6975338b0d12b14ad31b868d2f7fd0d7980e4c7fd56b106194ebd98cf69dd990"
    -
      id: "RETURN_TEST"
      path: "tests/crpm-world/voyage-composition.test.ts"
      blob: "7e65ec77e21343c9d1ef0be3247652d7c4b8a294"
      sha256: "d7872c9f59e36c70468fbc1038897beac927da3410f1fa5159aed75ec0af924e"
    -
      id: "TIMING_TEST"
      path: "tests/simulation/mechanics.test.ts"
      blob: "3da9e4520a53c537c665711ec187fce412e31db3"
      sha256: "f019c5765ca48ef5cbf3a2dcc0032c053c5f1051498c0279e5a7c1c4a1e97a7f"
    -
      id: "REPLAY_TEST"
      path: "tests/simulation/coordinator.test.ts"
      blob: "6dc0ab6b35518ef1a0d4d44d029127f619c26cce"
      sha256: "6933863c4538ced7aeac58821d1fd46fa63e4781461266ea97e4454848d66de4"
    -
      id: "PUBLIC_CONTROLS"
      path: "client/src/combat/controls.ts"
      blob: "2225f3d91ec5f4aa7835519bfac0552fd51b2581"
      sha256: "f3517583cc05108491d9b3f12de8bce6e04990d47890a86e900bd1adcb89d760"
    -
      id: "D2B_LOCK"
      path: "docs/evidence/wp-015d2b-implementation-lock.json"
      blob: "d80cf2f792088bc78eeaa947564e4cc967bec61c"
      sha256: "a716fd453e5e670e9055e52227d62c5059ebd8d2e6c9c8d57c288ffde706f9cc"
    -
      id: "D2E_LOCK"
      path: "docs/evidence/wp-015d2e-implementation-lock.json"
      blob: "d0668988d445f1bc7c31b9277fb07e19b919c60c"
      sha256: "8a3fe9a2bca9348f3635721001c92fafcd154d9a878cc030f3c20ba69a26bbd3"
  case_set:
    identity: "WP-015D2P:documentation-case-families:v0"
    declared_complete: false
    execution_registration: false
    cases:
      -
        case_id: "WPV4-MOVE-01"
        registration_kind: "retrospective_calibration"
        source_ids:
          - "MOVEMENT_TEST"
          - "V4_AUTHORITY"
          - "V4_CUTS"
        target_id: "T_COMMAND"
        cut: "Existing thinVisibleDuel versus movement-support cut; not the player's HUD."
        domain: "Exactly the two source-registered V4 states after one and four accepted right/left cycles, seed 0xC0FFEE11, calling wizard."
        routes: "Source-registered right/left cycles followed by the same right-move command with the actual actor and expected turn."
        horizon: "One next command; no tick advancement."
        support:
          - "bound V4 ruleset"
          - "current actor and expectedTurn"
          - "movementRemaining"
        method_question_refs:
          - "DPU-03-W0-NEXTQ"
          - "DPU-04-TRANSPORT"
          - "DPU-08-W0-NEXTQ"
        governance_field_refs:
          - "DTF-10"
        first_falsifier: "A claimed collision disappears once actual protected readout/support or a legitimate public input is held fixed."
        reopening_condition: "New state pair, cut, command, support, input family or horizon requires a separate exact execution contract."
        execution_status: "not_authorized"
        evidence_class: "not_tested"
        current_verdict: "not_tested"
        mathematical_placement_implication: "none"
      -
        case_id: "WPV4-RETURN-01"
        registration_kind: "retrospective_calibration"
        source_ids:
          - "RETURN_TEST"
          - "MOVEMENT_TEST"
          - "V4_AUTHORITY"
        target_id: "T_RETURN_COORDINATES"
        cut: "Position/visible equality versus declared protected continuation and exact state identity."
        domain: "Only the registered position-returning V4 movement traces; not a full-state loop."
        routes: "Bound accepted movement cycles; keep trace, budget and revision."
        horizon: "At the declared return endpoint and one next command only."
        support:
          - "source trace"
          - "movementRemaining"
          - "turn and actor"
          - "revision/state hash provenance"
        method_question_refs:
          - "DPU-07-RETURN"
        governance_field_refs:
          - "DTF-10"
          - "DTF-12"
        first_falsifier: "A return claim is supported only by coordinates intentionally forgotten by the proposed cut, or the claimed closed route is not closed in its own state space."
        reopening_condition: "A genuinely closed full-state route or a different protected return coordinate must be independently registered."
        execution_status: "not_authorized"
        evidence_class: "not_tested"
        current_verdict: "not_tested"
        mathematical_placement_implication: "none"
      -
        case_id: "WPV4-COMMAND-01"
        registration_kind: "prospective_source_pressure"
        source_ids:
          - "V4_AUTHORITY"
          - "V4_ADAPTER"
        target_id: "T_COMMAND"
        cut: "Proposed actor/expectedTurn/aim-lock readout versus exact authority transition; no new cut exists yet."
        domain: "Explicit V4 only; exact seeds, commands, actors and naturally reached prefix states must be frozen in a later execution contract."
        routes: "Compare permitted public command sequences involving wrong actor, stale expectedTurn and aim before fire; never set hidden state to manufacture a witness."
        horizon: "One submitted command and its returned events/state; synchronous simulation resolution only."
        support:
          - "explicit V4 initialization"
          - "actor and expectedTurn"
          - "declared aim command if present"
          - "unmodified applySimulationCommand"
        method_question_refs:
          - "DPU-03-W0-NEXTQ"
          - "DPU-08-W0-NEXTQ"
        governance_field_refs:
          - "DTF-00"
          - "DTF-10"
        first_falsifier: "A proposed omitted coordinate has no exact same-frame legal-source split, or restoration needs new hidden information."
        reopening_condition: "Owner-approved Lane 2 contract with exact cases and unchanged production authority; this row is not that authorization."
        execution_status: "not_authorized"
        evidence_class: "not_tested"
        current_verdict: "not_tested"
        mathematical_placement_implication: "none"
      -
        case_id: "WPV4-TIME-01"
        registration_kind: "prospective_source_pressure"
        source_ids:
          - "V4_AUTHORITY"
          - "TIMING_TEST"
          - "V4_REQUEST"
        target_id: "T_AUTHORITY_TIME"
        cut: "Proposed simulation-tick boundary and command ordering, distinct from wall-clock/HUD timing."
        domain: "Explicit V4 initialization required; existing default-ruleset mechanics tests are source pointers, not an executed V4 observation cut."
        routes: "A later contract may price before/at/after the first turnDeadlineTick with unchanged advanceSimulationTicks and explicit command order."
        horizon: "First timeout boundary only; no inferred F4 16-turn phase."
        support:
          - "bound turnDeadlineTick and SIM_RULES"
          - "accepted command/tick order"
          - "exact current actor/turn"
        method_question_refs:
          - "DPU-07-RETURN"
        governance_field_refs:
          - "DTF-00"
          - "DTF-10"
          - "DTF-18"
        first_falsifier: "An apparent phase split is only the imposed horizon, or depends on a clock/observer not included in the frame."
        reopening_condition: "Separate Lane 2 simulation-cut approval; real timing additionally needs Lane 4 ownership and measurement protocol."
        execution_status: "not_authorized"
        evidence_class: "not_tested"
        current_verdict: "not_tested"
        mathematical_placement_implication: "none"
      -
        case_id: "WPV4-PUBLIC-01"
        registration_kind: "prospective_source_pressure"
        source_ids:
          - "PUBLIC_CONTROLS"
          - "V4_AUTHORITY"
          - "OPERATIONAL_GOVERNANCE"
        target_id: "T_PLAYER_OBSERVATION"
        cut: "Proposed actual displayed information and input/response opportunity at specified observation times; source access is not player visibility."
        domain: "Unbound device/browser/session/participant domain; execution blocked until the owner freezes it, including privacy and timing tolerance."
        routes: "Observe ordinary unchanged V4 actions, aim-lock, fire and turn handoff only if separately authorized; no Cocoon/Unweave/Threadback or invented response phase."
        horizon: "Predeclared visible decision-to-authoritative-result interval; currently unmeasured."
        support:
          - "owner-specified device/browser and input mode"
          - "public screens/events actually available at each time"
          - "declared clock alignment and tolerance"
          - "consented sanitized observation record"
        method_question_refs:
          []
        governance_field_refs:
          - "DTF-00"
          - "DTF-10"
          - "DTF-13"
          - "DTF-17"
        first_falsifier: "The supposed hidden distinction is already public, the response opportunity does not exist, or an observer used privileged simulation state."
        reopening_condition: "Separate Lane 4 observation/playtest authorization with exact environment, measures, stopping rules and data handling."
        execution_status: "not_authorized"
        evidence_class: "not_tested"
        current_verdict: "not_tested"
        mathematical_placement_implication: "none"
      -
        case_id: "WPV4-PROVENANCE-01"
        registration_kind: "prospective_source_pressure"
        source_ids:
          - "REPLAY_TEST"
          - "V4_REQUEST"
          - "V4_AUTHORITY"
        target_id: "T_FORMATION_RECOVERY"
        cut: "Proposed public formation/replay inputs versus live carrier, retained audit references and domain-transition provenance."
        domain: "Exact accessible V4 input and trace boundary still to be registered; server replay records are not presumed public to a player."
        routes: "A later reconstruction must use only declared available seed/ruleset/commands/ticks; payload omission may be considered only after its own witnessed transition."
        horizon: "Declared reconstruction and continuation interval; no universal history recovery or expiry."
        support:
          - "explicit access boundary for every replay/input item"
          - "retained source and transition provenance"
          - "separate reopening trigger"
        method_question_refs:
          []
        governance_field_refs:
          - "DTF-10"
          - "DTF-11"
          - "DTF-12"
          - "DTF-13"
          - "DTF-16"
          - "DTF-18"
        first_falsifier: "Reconstruction requires hidden executor state, or removing the actual payload loses continuation, provenance or a reopening trigger."
        reopening_condition: "Exact public-formation or post-transition omission contract; absence of a witness remains underdetermined or not_applicable."
        execution_status: "not_authorized"
        evidence_class: "not_tested"
        current_verdict: "not_tested"
        mathematical_placement_implication: "none"
  allowed_outputs:
    - "docs/planning/wp-015d2p-v4-observation-pressure-contract.md"
    - "docs/evidence/wp-015d2p.json"
    - "docs/planning/implementation_plan.md"
    - "docs/planning/wp-015d2g-relational-gameplay-navigation-review.md"
    - "legal/source-manifest.json"
  first_governed_stop: "Documentation contracts and source-bound coordination return are durable; review before any new executable pressure case or playtest."
```

## Retrospective Calibration And Deliberate Absences

The existing movement test constructs two naturally reachable V4 states using seed `0xC0FFEE11`: one versus four right/left cycles. Actor, positions and Stitching agree; budgets are 48 versus 0 and revisions 2 versus 8. The same next right move succeeds versus fails. That is a known thin-cut continuation collision and a bounded movement-support repair, not a new prospective discovery, global carrier minimum or claim that the real HUD hides movement budget.

The existing voyage test likewise separates visible return from recursive/exact return. A position-returning trace spends movement and changes revision; it is not a closed full-state loop or a realized group action/holonomy witness. `relation_or_kernel` is a checker recommendation for an insufficient map, not an implemented probabilistic kernel or a measured randomness model.

V4 has move, select_relic, aim and fire commands. Its simulation fire resolves synchronously and hands over the turn; a new observation protocol may not invent an intervening defensive response. Cocoon, Unweave, Threadback, preparation and Escape Slack belong to abstract F4 analysis, not current V4 mechanics. The D2O 16-turn phase result must not be repaired by adding a gameplay phase.

The registered V4 transcript excludes tick advancement/network scheduling and is not a complete aim/fire/public-observation suite. Several existing mechanics/coordinator examples use their default ruleset; source similarity is not an executed V4-specific result. Any future V4 case must name V4 explicitly and freeze its own input domain.

Full-source public formation, player information sufficiency, live-payload expiry and stronger-target recovery remain unresolved. Caller-supplied decoder/support Booleans in historical sealed tools remain declarations, not new derived witnesses. No existing expiry ledger or game-status timeout substitutes for removing a concrete payload after a witnessed transition.

## Prospective Execution Admission Requirements

Before any later implementation or observation, obtain a separate explicit owner decision and freeze a child execution boundary. This contract intentionally stops before that boundary is complete. Required items are:

1. Exact current source commit/tree and path/blob manifest, ruleset, case IDs and complete priced command/tick/seed/actor/initialization domain. Natural source states must come from admitted public transitions; no hidden state mutation to manufacture an omission witness.
2. A case-local fixed frame containing world, cut, protected target, domain, routes, horizon, support, tolerance and oracle/input boundary. Distinguish simulation authority, client presentation, server/replay access and actual public inputs.
3. Full, ablated and restored contexts and actual target readouts. Derive frame equality, held-fixed unrelated support, changed readout and restoration recovery from those records; never substitute self-attested success flags. Related but non-omitted fields stay coupled.
4. Explicitly incomplete candidate/comparator identity and target obligations. If a carrier/burden claim is requested, derive adequacy from obligation readouts and per-axis comparable/equal/unknown/incommensurable/not-applicable relations. Unknown axes cannot support dominance; do not introduce a scalar winner or an unrequested minimality claim.
5. Any lifecycle/expiry claim needs an actual before/transition/after record, separate field work, removal of the proposed live payload, preserved continuation, recoverable domain provenance and a reopening trigger. Keep DTF-13 governance, concrete trace payload, live state, audit predecessor and re-entry material separate.
6. A cheapest falsifier, matched no-change controls, duplicate/covariance key and lawful null outcomes. Retain no-witness, coupled, underdetermined, not-applicable and blocked-source/domain outcomes. Do not force a Worms witness for every CRPM field, a holonomy claim, or a successful transfer.
7. For T_PLAYER_OBSERVATION: owner-selected device/browser and display/input mode; observation times and clock alignment; actor-visible information and available actions; measurement tolerance; participant consent if people are involved; sanitized data retention and stop rules. Physical-device testing and playtests remain outside this authorization.
8. Separate allowed outputs and baseline/regression checks, historical-lock preservation, exact range/status/mode/blob audit, and executor/report/return parity if new execution is later authorized. Any necessary adapter/schema migration must be a new governed package, never an edit to sealed executors.

## Dimension And Support Boundary

| Dimension | Status in this milestone | Residue or later owning gate |
|---|---|---|
| Actors, turn ownership, initial geometry, movement, Relics, damage/Stitching and terminal rules | unchanged | Observation may inspect them only in an explicitly priced V4 domain. |
| Production state, command resolution, replay, seed handling and Loomkeeper policy | unchanged | No new mechanics, random search, policy or source-history recovery. |
| F4 configs, policies, preparation/status/expiry and finite horizon | unchanged historical analysis | Not present as V4 gameplay; D2O results and scope retained. |
| Public information, display timing, response windows and human adaptation | unknown for the proposed observation target | Lane 4; do not infer from a thin analytical view. |
| Terrain, aim, trajectory and splash | unchanged production; excluded from new testing | Any proposed observation adds an explicit authority/domain contract. |
| Networking, persistence, rewards, identity/wallets, UI and assets | unchanged and excluded from implementation | Their owners must authorize any later exposure or change. |
| CRPM placement and mathematical integration | excluded | No new verdict, owner edit or P5. |

Historical trace is audit provenance, not automatically live recursive state. Domain-transition provenance is whatever the exact replay/formation obligation requires and must not be thrown away with a trace payload. A separate source reference cannot conjure public access or substitute for an executed re-entry. We deliberately forget no historical source fact in this documentation milestone; future observation cuts must list their own forgotten fields.

## Documentation Checks And First Governed Stop

Only the five declared paths may change. Preserve the existing WP-015D2A pointer, complete D2O result, old method records, D2B/D2E locks and every production/analysis/test/schema/package/asset blob. Keep PR #2 closed and unmerged; no push, new PR, reopen or merge is part of this task.

Run the existing compliance/work-package gates, whitespace checks, strict JSON/YAML duplicate-key and case-row checks, source/printed-digest and cross-contract-ID checks, exact endpoint plus per-commit status/mode/blob audit, historical-content comparison, and read-only documentation review. Record those results in the work-package evidence. Its `complete` status means documentation completion only. The full build, gameplay/simulation suites, new pressure cases, browser matrix and physical-device/playtests are not run for unchanged executable surfaces; report that explicitly.

After this contract is committed, the CRPM coordinator returns a digest-bound handoff at `docs/architecture/definition_target_admission/returns/DTAP-WP_Documentation_Coordination_Return_2026-08-28_v0.yaml`, binding both contract commits, the validation/range records and the separate CRPM successor projection. The return is a coordination artifact, not Worms gameplay evidence or a placement seal.

Stop for human/chat review of both contracts. New executable pressure cases, observation requests, instrumentation and playtests remain not authorized. The next decision may narrow, revise, defer or reject these families. It may open a later execution only through explicit authorization and the exact missing boundary above; documentation review does not silently approve execution.

Rebind at any changed source/target/cut/support/horizon, missing artifact, provenance loss or ownership ambiguity. Preserve the old result as history. Do not resume the old PR or reset a checkout to a historical method pin. CRPM P5 authoring and integration remain closed.
