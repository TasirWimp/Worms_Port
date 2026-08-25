# WP-015D2O F4 Natural Matched-Twin Reachability Contract

Status: complete with disposition
`d2a_axes_calibrated_authority_horizon_review_required` on 2026-08-25.

- **Operational lane:** Lane 2 mechanics-fixed observation and cut calibration.
- **Navigation route:** D2N bridge covariance returned through D2G.
- **Parent:** completed WP-015D2N F4 bridge calibration.
- **Gameplay carrier:** unchanged F4 analytical mechanics and existing policies.
- **Worms_Port base:**
  `3a1d844fce9be09ed8ec51e39fe0f94632f43fe5`.
- **Working branch:** `codex/wp-015d2o-f4-natural-matched-twin-search`.
- **CRPM method lock:**
  `053c6fc0a90ed48d8667016b18a1d10106a7a2bc` on clean `main`.
- **Execution Pointer:** remains WP-015D2A.
- **ProductAuthority:** `none`.

## Purpose

D2N found one target-congruent carrier partition shared by responder phase,
completed turns, path-kind history, and route plus current formation. It could
not select one bridge axis because the baseline F4 routes co-formed all four
coordinates. D2O asks the next bounded question without changing mechanics:

> Can naturally reachable F4 preparation-response carriers decorrelate route
> history, responder phase, completed-turn position, and geometry, and which
> distinctions actually change the protected continuation relation?

“Natural” means every carrier is reached from `initial_state` only through an
ordered sequence returned by `legal_actions` and applied by `apply_action`.
D2O may not construct, replace, patch, or deserialize a tactical state to force
a twin.

## Authority and change boundary

D2O may add one analysis-only Python export, strict TypeScript schemas and
assessment, one fixed runner, focused tests, and bounded planning/evidence
updates. It must not:

- edit `analysis/tactical_model/model.py`, F4, any config, action, policy,
  transition/expiry order, recurrence key, seed, horizon, or historical result;
- add a candidate mechanic, synthetic state, learned policy, random search,
  optimizer, arbitrary operator, or wider gameplay simulation;
- claim exhaustive F4 reachability beyond the declared four-action prefix;
- modify `shared/`, `client/`, `server/`, protocol, replay, rewards, wallets,
  assets, Loomkeeper, package metadata, or production behavior; or
- import, vendor, edit, or depend on CRPM or Sorcerers.

The Python probe is analytical authority only for its deterministic traversal
of the existing public model functions. TypeScript validates and interprets
the emitted evidence. Production authority remains `shared/simulation.ts`.

## Source bindings

D2O must fail closed on:

- Worms_Port base `3a1d844fce9be09ed8ec51e39fe0f94632f43fe5`;
- D2N result digest
  `5c554344271e2543cc6811fa579b28d85054da19b067acb8d12e7c60bed03dc8`;
- model SHA-256
  `af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08`;
- F4 config SHA-256
  `5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0`;
- F4 schema 11, seed `3237998097`, and 16-turn horizon; and
- the exact public functions `initial_state`, `legal_actions`, `apply_action`,
  `choose_action`, `tactical_state_key`, and `tactical_state_snapshot`.

The package-lock Git blob must remain
`ff3987b1224d4160a0b25fffe7952cce3364b880`.

## CRPM methodological boundary

The clean read-only CRPM commit contributes review grammar only:

| Path | Blob | Bounded role |
| --- | --- | --- |
| `docs/architecture/CRPM_Candidate_Mathematical_Spine_Calibration_Report_v0.md` | `8abf4a12442ab656c3a70b0b387da43eec99b03b` | Keep assembly, dynamic descent, target-relative fibre relevance, route order, and palette choice separate. |
| `docs/architecture/spectral_theory_of_residue/Unknown_Source_Ocean_Navigation/Null_Space_Guided_Cut_Transition_Search_Protocol_v0.md` | `15c431dda12688c1368809345d6080dab510ca8a` | Use matched controls to reduce a declared null space; a failed route remains a negative landmark. |
| `docs/architecture/spectral_theory_of_residue/Unknown_Source_Ocean_Navigation/Witness_Probe_Carrier_Generalization_v0.md` | `d89b9741162f12af77b92f762f52676cc14db245` | Record probe wake, suppressed distinctions, carrier status, and return path. |
| `emergence_lab_crpm/operational_memory_compatibility_fibre.py` | `4584b57499cbd90948d8d07557e5b01ede894906` | Read-only positive/negative refinement-control pressure; no Python import or code copy. |

These sources do not supply Worms evidence, a search algorithm, universal
ontology, graph-safe schema, or gameplay authority.

## Fixed reachable prefix domain

The search domain is exactly:

```text
config:             unchanged F4
starting distance:  639 | 640 | 641
first actor:        player | loomkeeper
mirrored:           false | true
initial scenarios:  12
path generation:    every action returned by legal_actions
transition:         apply_action without a synthetic target reaction
maximum prefix:     4 completed actions
collection gate:    first naturally reached preparation-response carrier
branch behavior:    stop a branch when that carrier or a terminal state appears
```

Four actions are a priced interface cut, not a completeness claim. It contains
the D2N two-/three-action seam plus one reversible two-turn detour capable of
forming route-order and elapsed-turn controls. The unrestricted all-action tree
is explicitly outside scope.

At every collected carrier, evaluate every legal response and all 25 ordered
base-policy continuation pairs until terminal. Preserve responder-relative
outcome, finish reason, completed turns, recurrence, immediate residue, and a
digest of the complete continuation relation.

## Carrier and twin coordinates

Normalize each current carrier actor-relatively while retaining:

- completed turns and remaining horizon;
- separation;
- responder/preparer Stitching and Escape Slack;
- preparation, Cocoon, Seam Pin, cooldown, tether, and other configured public
  tactical support;
- legal response relation;
- first/second responder phase as derived scenario context; and
- exact path actions plus path-kind prefix as trace support, not hidden state.

Assess four matched-pair families:

1. `geometry_control`: same phase, path kinds, non-position support, and
   completed turns; different separation.
2. `route_order_control`: same phase, separation, non-position support, and
   completed turns; different path-kind order.
3. `phase_horizon_control`: same separation and non-position support;
   different first/second responder phase and therefore different turn parity.
4. `completed_turn_control`: same phase, separation, and non-position support;
   different completed-turn count.

For each family, report pair count, continuation-equal versus continuation-split
count, explicit deterministic witness pairs, public formation/support burden,
and excluded claims. Preserve finish-reason differences so a finite turn-limit
split cannot be promoted into a gameplay initiative mechanism.

## Expected bounded wake and required controls

The implementation must reproduce or fail closed on the exploratory census:

- 2,100 natural carrier occurrences;
- 1,520 distinct full tactical states;
- 319 actor-relative current-carrier classes;
- 122 protected continuation target classes;
- 37,232 geometry-control pairs: 12,816 equal and 24,416 split;
- 1,728 route-order pairs: all continuation-equal;
- 2,288 phase/horizon pairs: 1,984 equal and 304 split;
- 32 completed-turn pairs: all continuation-equal.

Every phase/horizon outcome split must involve at least one `turn_limit`
terminal. If any split changes an unravelled outcome without turn-limit
involvement, the expected interpretation fails closed and the package returns
the stronger unresolved result.

The expected bounded reading is:

- route history is required for re-entry but is not required as recursive
  continuation state once current support, geometry, phase, and horizon are
  held fixed in this domain;
- geometry is conditionally target-relevant because both equal and split
  natural twins exist;
- exact completed-turn count is over-fine for the 32 same-phase controls;
- responder phase remains structurally tied to turn parity; its observed target
  splits are finite-horizon pressure rather than a witnessed gameplay rule; and
- current formation/resources alone remain insufficient.

## Stop gates and allowed disposition

D2O must stop with one of:

- `d2a_axes_calibrated_authority_horizon_review_required`;
- `f4_natural_domain_retains_unresolved_covariance`;
- `unexpected_non_horizon_phase_split`;
- `no_natural_matched_twins_found`; or
- `source_or_topology_drift`.

The expected disposition is
`d2a_axes_calibrated_authority_horizon_review_required`. It licenses an
expanded D2A relational chart only when route history remains trace/re-entry
support, geometry stays conditional, and phase is labelled analytical horizon
parity. It does not license a gameplay phase/status. Before using that chart to
design a production-facing interaction rule, open a separate V4/playtest cut
review for real timing and response ownership.

## Executed result

The fixed exporter reproduced raw digest
`edafdd5c3a7f094eb522a29b4994b40d3b7de0ce0abce0e4589cea565bb6213f`.
The exhaustive priced-domain census contains 11,188 generated transitions,
7,456 open frontier branches at the four-action cut, no terminal branch before
collection, 2,100 natural response-carrier occurrences, 1,520 distinct full
states, 319 actor-relative current-carrier classes, and 122 protected
continuation relations. Every full state inside each normalized class has the
same relation, so bounded quotient transport is map-eligible over this domain.
That does not prove a complete carrier outside the declared prefix.

The TypeScript assessment emitted result digest
`bc131d3fa0065cb8e1a93790d297813c243744124dad7bb079ccf0ffb851162e`
and the expected disposition
`d2a_axes_calibrated_authority_horizon_review_required`:

| Family | Pairs | Equal | Split | Turn-limit-only split | Tactical split | Bounded role |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| geometry | 37,232 | 12,816 | 24,416 | 192 | 24,224 | conditionally target-relevant |
| route order | 1,728 | 1,728 | 0 | 0 | 0 | trace/re-entry, not recursive state |
| phase/horizon | 2,288 | 1,984 | 304 | 304 | 0 | analytical turn-horizon parity only |
| completed turns | 32 | 32 | 0 | 0 | 0 | exact count over-fine at same phase |

Six digest-bound witnesses preserve an equal and tactical-split geometry pair,
an equal route-order pair, equal and horizon-split phase pairs, and an equal
completed-turn pair. Exact path actions and full-state digests remain available
for re-entry even where a distinction is absent from the bounded recursive
carrier.

The result licenses expansion of the D2A relational chart with these calibrated
roles. It does not license a gameplay phase, geometry threshold, candidate
mechanic, V5 rule, or product claim. A separate V4/playtest authority-cut review
of real timing, information, and response ownership is required before a
production-facing interaction proposal. ProductAuthority remains `none`.

## Expected implementation paths

- `analysis/tactical_model/natural_matched_twin_probe.py`;
- `analysis/crpm_world/navigation/natural-matched-twin-schemas.ts`;
- `analysis/crpm_world/navigation/assess-natural-matched-twins.ts`;
- `scripts/run-natural-matched-twin-search.ts`; and
- `tests/crpm-world/natural-matched-twin-search.test.ts`.

Generated JSON belongs only below ignored
`test-results/crpm-world/d2o-natural-matched-twins/`.

## Verification

Run:

```text
node --import tsx --test tests/crpm-world/natural-matched-twin-search.test.ts
npx tsx scripts/run-natural-matched-twin-search.ts --output test-results/crpm-world/d2o-natural-matched-twins/natural-matched-twin-result.json
npm run test:crpm-world
npm run test:tactical-model
npm run test:simulation
npm run check:crpm-world-types
npm run check:types
npm run check:compliance
npm run build
npm audit
git diff --check
```

Browser/device checks are not required because D2O has no runtime-facing path.

## Re-entry

From a fresh session:

1. Follow `AGENTS.md`, inspect status/recent commits, and confirm the Execution
   Pointer still names WP-015D2A.
2. Read D2G, D2M, D2N, and this contract in order.
3. Verify the Worms_Port/CRPM locks, D2N digest, model/config hashes, seed,
   horizon, and package-lock blob.
4. Regenerate the ignored raw/result artifacts and reproduce their digests.
5. Read route-order, geometry, phase/horizon, and completed-turn controls
   separately before reading the global disposition.
6. Do not turn analytical horizon parity into a gameplay phase, and do not
   drop route history from evidence/re-entry merely because it is absent from
   the bounded recursive carrier.
