# WP-015D2Q V4 Actor/Turn Command-Gate Pressure Contract

Status: contracted for the owner-authorized full child run; result pending.
Date: 2026-08-28.
Owner: Worms_Port. Coordinator: the existing cross-repository task.
Parent: [WP-015D2P](wp-015d2p-v4-observation-pressure-contract.md), family `WPV4-COMMAND-01`.
Evidence: [work-package record](../evidence/wp-015d2q.json).
Governance: [operational lanes](../process/crpm-world-operational-governance.md) and [development workflow](../process/development_workflow.md).

## Authorization And Source Boundary

The external review accepted the documentation milestone but did not authorize execution. The owner subsequently requested the full run: contract, implementation, execution and report. This contract opens only `WPV4-COMMAND-01A`, a Lane 2, mechanics-fixed request/observation registration. It does not open the umbrella COMMAND family, aim/fire, timing, UI, playtests, product proposals or CRPM integration.

`pilot_activation: not_required`: Worms-local command-support pressure with no new cross-world acceptance or mathematical placement. Level: L4+ bounded diagnostic. Stance: exact source-authority response under one declared command, not player perception or a preferred state ontology. The protected family is command acceptance/mutation, exact error presence/code/message, ordered events, and the bound next-state readout.

The entry worktree is clean at Worms `3a3cca8c720f89251cad56029b9f7b1c69d87146`, tree `6faac9c6ac1a045280aa263de1d086527b8fd958`. Work uses `codex/wp-015d2q-v4-command-gate-pressure`. CRPM remains wholly read-only at `c9bf511f67ffbe518cd9f9603916bb26e1527736`; its placement-unit contract at `b66036e9184612ee7b70d2412e0620ba16665093` is frozen question-forming source, not a validation target or runtime dependency. All D2B/D2E and D2G–D2O historical identities remain unchanged.

The reviewed attachment has SHA-256 `fef9cf091eb853a8c3c012a7cc353c8a20ff1a0750cb587ac2c692e60c808501`. Its necessary cut is preserved: actor, expected turn, aim-lock and fire resolution are not interchangeable witnesses. This child tests only the first two.

The documentation branches were subsequently pushed at CRPM `c9bf511` and Worms `3a3cca8`. That publication has semantic effect `none` and evidence effect `none`. Earlier unpushed/local statements remain historical; do not rewrite them.

## Executable Preregistration

The [registration](../../analysis/crpm_world/navigation/v4-command-gate-registration.json) is the source of truth for the common request template, four case declarations, canonical fixed context, source blobs/SHA values, output allow-list and negative controls. Its common template plus each case's request ID and single step reconstructs one complete existing-schema request. No CLI field may widen or override it.

```json
{
  "packageId": "WP-015D2Q",
  "childId": "WPV4-COMMAND-01A",
  "wormsBaseCommit": "3a3cca8c720f89251cad56029b9f7b1c69d87146",
  "crpmFrozenCommit": "c9bf511f67ffbe518cd9f9603916bb26e1527736",
  "registrationDigest": "3afc8dd6cb51f825fc912f9247e139a14c46c27e9c3feae72b1fc4e830c5aef4",
  "contextDigest": "4e9e3c1bc006c17562edd74e92927fb709a31cac249d75f00c478ae1c799865a",
  "caseSetDigest": "38a8c2ce4e97a122e6473221d53328a5277cf08057a0d638a6eaf45f8e1986f4",
  "sourceDigest": "4dd6911a99a55521aec4512927379eb3d27a6e0fe83d07caeb5fb4dfac0cb907",
  "requests": [
    {
      "requestId": "d2q-cmd-valid-01",
      "requestDigest": "fa49c031d24229b353e644cbc50ec443948b5f97f400746d2543f4cfb0f08ec6"
    },
    {
      "requestId": "d2q-cmd-turn-01",
      "requestDigest": "07e846dd187260f1cef8fdc447388e6de120f35fd7a8dcb433997bf1022462f8"
    },
    {
      "requestId": "d2q-cmd-actor-01",
      "requestDigest": "1a61bd958905f4c08dee31b63452c0ec0722639a4fde14bbbb981aa83dee008e"
    },
    {
      "requestId": "d2q-cmd-precedence-01",
      "requestDigest": "c2c0e7f7aea2a05eec927d9b041077d8baf1d12b8be6c8b1ad8ba84fb7d420ef"
    }
  ],
  "executionAuthorization": "Owner explicitly requested contract, implementation, run and report after the documentation review.",
  "firstGovernedStop": "Bounded source-bound result review; no successor execution."
}
```

These digests are preregistration identities, not evidence of an executed command or an earned field verdict.

## Fixed Frame And Four Cases

Use `createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID)` independently for every case: explicit `nimble-knots-artillery-v4`, turn 0, active actor player, phase awaiting_command, revision 0. No synthetic state, earlier movement, retained state from another case, or tick advancement is admitted.

Every request has exactly one `move` command with direction 1, `authority_v4@2`, the existing `v4_authority@2` adapter, profile/request versions 2/2, scenario `v4-authority-c0ffee11`, action family `["move"]`, and the existing mandatory protected/probe families. Output is witnesses and activation is offline_only.

| Case | Submitted actor | expectedTurn | Source prediction, not result |
| --- | --- | --- | --- |
| CMD-VALID-01 | player | 0 | accepted move |
| CMD-TURN-01 | player | 1 | LATE_TURN, unchanged rejection |
| CMD-ACTOR-01 | loomkeeper | 0 | NOT_YOUR_TURN, unchanged rejection |
| CMD-PRECEDENCE-01 | loomkeeper | 1 | LATE_TURN, unchanged rejection |

At current turn 0, expectedTurn 1 is a future-turn mismatch, not a stale/past turn, despite the error code's name. Actor pressure is conditional on a matching turn. The both-invalid declaration must expose the earlier turn guard rather than treat the two checks as unordered labels.

The continuation horizon is one adapter-mediated authority call per case. Repeated test/replay runs are correlated verification of the same four declarations, not additional independent cases. There is no network, tick, wall-clock, human or device authority.

Protected target `T_COMMAND` is the exact tuple: accepted, mutated, optional error normalized to explicit null or its exact code/message, pre-state digest, post-state digest, ordered authoritative events, event digest, revision, player x and movementRemaining. Event order is preserved even though these four cases produce at most one event. Source state and request snapshots are retained in ignored raw evidence; the report prints only compact readouts and identities.

## Implementation And Non-Vacuity Controls

1. Validate each assembled request with the unchanged strict offline request parser, then call the unchanged authority adapter once on that case's fresh public state. Do not call the legacy multi-step executor and claim its post-state quotient answers T_COMMAND. Emit a separately versioned child result envelope.
2. Authenticate the reused sealed component against the approved D2B lock, not just its latest Git identity. A legacy-format component/source authentication proof may use profile/request/result versions 2/2/3 and the actual edge source locks. It is explicitly not the child v1 result receipt or a claim that the legacy result-envelope pipeline ran.
3. Capture canonical before/after caller state, command declarations, complete transition, edge and witness. Derive input non-mutation, equal initial states, exact rejection values, state/event digests, source linkage and all case verdicts. Do not supply frame/support/adequacy verdict Booleans as input evidence.
4. Build full observations from world, initial-state digest, command, actor and expectedTurn. For actor ablation remove only actor from the decoder observation; for expected-turn ablation remove only expectedTurn. Keep both actual authority inputs and their provenance intact. Case/request IDs, request digests, witnesses and omitted-coordinate provenance are not available to the observational decoder or used in class keys.
5. Carry full, ablated and restored contexts containing world, cut, target, domain, routes, horizon, support, tolerance and oracle/input boundary. Derive all held-fixed checks from actual records. Restoration reinserts the actual declared coordinate and recomputes classes; it never flips a verdict flag.
6. Emit both positive and nonforcing controls. Actor omission may split valid/wrong-actor declarations at turn 0; the turn-mismatch pair is the actor no-witness control. Expected-turn omission may split player success/rejection and the two different wrong-actor errors. Keep equal post-state/different-error evidence visible.
7. Derive finite projection classes, all within-class target splits, restoration recovery and the guard-precedence observation. Preserve a verdict for each of the four cases and each ablation/control. Never emit `WPV4-COMMAND-01 survived`. No global minimality, hidden-state discovery or all-command necessity follows.
8. Freeze explicit incomplete candidate/domain identity. No richer carrier, burden ordering, lifecycle, public formation, expiry, holonomy or recovery verdict is requested. Such fields remain not_tested/not_applicable; do not manufacture an omission witness.
9. Preserve lawful no-witness, coupled, underdetermined, not-applicable and blocked-source/domain outcomes. A source/target discrepancy must become a failed gate or scoped residue, never revised expectations chosen to match execution.

The analysis result is source-derived `correlated_reuse`. Requests, adapter, direct checks, reports, repeated runs and reviewers share authority facts. New registration can improve recoverability and reveal a bounded omission pressure; it is not discovery of previously unknown gameplay semantics or independent empirical validation.

## Dimensions, Authority And Residue

| Dimension | Child treatment |
| --- | --- |
| Actors/turn ownership | unchanged authority; only submitted actor and expectedTurn vary across the four declared requests |
| Initial state/world geometry | unchanged, exact public V4 initialization at one seed |
| Command/resolution order | unchanged one move; expected-turn/actor guard precedence is observed |
| Movement/range | unchanged; no alternative displacement, range or budget |
| Relics/damage/terminal rules | unchanged and not exercised by this child |
| Resources/status/expiry | movement readout only; no lifecycle or expiry claim |
| Information/response windows | actual command inputs protected; player-visible opportunity excluded |
| Terrain/aim/projectiles/splash | initial terrain retained as support; no experiment or alteration |
| Randomness/policy/search | one fixed seed; no policy or search |
| Replay/network/live control | source provenance only; no replay ABI, network or controller change |
| UI/rewards/assets/dependencies | unchanged and excluded |

CRPM provides a bounded question; Worms owns all four response records. The result must return for review before either side interprets it more broadly. D2O's real timing/information/response-edge gate remains unsatisfied. ProductAuthority is `none`; mathematical placement implication is `none`; P5 is neither authored nor opened.

## Files, Validation And Durable Closeout

The eleven allowed paths are enumerated exhaustively in the registration and work-package record. New files have distinct execution roles: frozen registration, child assessor, fixed runner, focused tests, contract, compact report and nested review receipt. The existing plan, D2G navigation carrier and analysis README receive additive discovery/re-entry notes only. No old source manifest, sealed code/lock/result, production, existing schema/registry, dependency, CRPM or unrelated file may change, even temporarily within an intermediate commit.

Publication stages:

1. Commit this contract, registration, initial evidence and current child-discovery pointer before implementation.
2. Add only the declared child assessor, fixed runner and tests; typecheck, then commit the executable source before evidentiary runs. Derive its commit/tree/path blobs independently of later report commits.
3. Run the entire four-case domain twice in separate processes. Keep full deterministic evidence and rendered report previews below ignored `test-results/crpm-world/d2q-v4-command-gates/`. No arbitrary request/operator/module/seed/output-root is accepted.
4. Run focused and destructive tests; complete CRPM-world, tactical and simulation regressions; analysis and production types; compliance and build. The tactical suite runs before and after implementation. Browser matrix, physical devices and playtests are excluded for this offline-only change; dependency audit is not required with unchanged packages.
5. Obtain ordinary read-only source/result review, then commit the compact [report](wp-015d2q-v4-command-gate-pressure-report.md), [review receipt](../evidence/wp-015d2q/review-return.json), completed work-package evidence and review-only successor.
6. Replay source/range/parity checks after the terminal commit. The receipt binds the durable source and report bytes; the terminal commit, receipt blob and final exact range digest are emitted externally to avoid circular self-hashes.

Range validation uses actual endpoint plus every intermediate Git delta with exact path, status, old/new mode and blob, rejecting every undeclared change, deletion, rename or nonregular mode. Source verification includes current worktree bytes and immutable historical identities. Strict JSON rejects duplicate keys; case/row sets reject duplicate, omitted or extra rows. Verify printed digests and executable/report/JSON-return parity, including case IDs, contexts, target readouts, projection membership, verdicts, covariance, exclusions and reopening conditions.

Negative controls mutate actual source IDs, declarations, contexts, observation membership, restoration, response/event evidence, paths, modes, row identities and printed content. They must reject an invalid input or withdraw the derived verdict. They must not manufacture production states, edit sealed source, or falsify a Boolean verdict directly.

## First Governed Stop

Stop after the source-bound child report and review receipt. If all hard gates pass, the strongest analytical disposition is `structural_reference` for these command-support distinctions only; failures may yield `residualized` or blocked evidence without forcing success. Review the four cases and conditional ablations separately before considering another child.

Reopen only for a newly authorized source, request, target, cut, support or horizon. Stop immediately on missing source, overlapping work, a needed adapter/cut/schema migration, a production/CRPM edit or an undeclared case. Do not push, create/reopen/merge a PR, authorize COMMAND-01B, conduct player observation or open P5 as part of this run.
