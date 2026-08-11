# WP-015D2B — CRPM Game-World Profile and Offline World Design Port Seed

## Status

- **State:** owner-requested, in progress, evaluation gate complete
- **Relationship:** analysis-only child of the active WP-015D2A tactical-game-model decision line
- **Current carrier maturity:** `M2 local use` for the core contracts, bounded adapters, offline design port, and evaluation lens; no `M3` claim
- **Current product authority:** `authority-adapter parity` for declared, tested V4 transition witnesses only; D2A evidence remains `none`
- **Worms_Port base:** `af23717e61fea6995bf3b7209211ae1aaa2bb855` on `codex/wp-015d2b-crpm-world-design-port`
- **CRPM source lock:** `995236df60924f790506cf5badec3c102abf3fd1` on `main`
- **Contract date:** 2026-08-10

This document licenses bounded implementation gates. It does not claim that
WP-015D2A is closed, and it does not move the Execution Pointer away from
WP-015D2A. The core TypeScript contracts, a read-only historical simulation
authority adapter, a closed cut registry, a finite quotient-transport checker,
and witnessed voyage/composition/return kernels now exist under
`analysis/crpm_world/` with focused tests. A closed Python D2A export adapter
now emits deterministic, TypeScript-validated evidence for F2, F3, F4, H2, and
H3 without changing the tactical model. A closed offline library/CLI now
admits only the V4 authority and D2A tactical adapters and writes deterministic
results only below ignored test output. No UI, network endpoint, runtime
service, M3 landfall, ruleset approval, production activation, or broad
simulation-equivalence result exists at this gate. The primary v2 diagnostic
surface now keeps qualitative, witness-linked axes separate from scalar probes
and applies six explicit false-closure rules plus deterministic maturity gates.

## Strongest Licensed Claim

WP-015D2B may define an L4+ Worms_Port application profile and offline
design/evidence port that re-expresses source-locked V4 transitions and D2A
analytical traces under declared cuts, admissible domains, protected families,
typed edge packets, witness/residue/re-entry contracts, quotient-transport
diagnostics, return distinctions, and a cut-indexed non-scalar profile. It may
produce bounded evidence about those declared inputs. It cannot establish a
CRPM schema or ontology, activate gameplay, or acquire production authority.

The CRPM vocabulary in this document is a bounded Worms_Port application
profile. The proposed TypeScript object names and game-specific port names are
local contract vocabulary, not CRPM doctrine, a universal graph schema, or a
graph-safe writeback format.

## Problem and Protected Family

The open problem is not merely numerical balance. The analytical layer must
make visible:

- support-complete world carriers for a named target and bounded domain;
- observer and design cuts;
- context, action, response, evidence, support, and return ports;
- typed transition edges and edge-scoped roles;
- visible residue, obligations, and reopening conditions;
- ordered voyage composition;
- projection aliasing;
- recurrence, continuation, invariant, finite-return, and route-return
  distinctions;
- cut-indexed non-scalar evaluation; and
- product-authority boundaries.

For this package, **support-complete** means sufficient for a named target
claim, cut, admissible action/domain family, and support package: a repository
reviewer can recover the source, witness, decoder, carrier, path, residue, and
reopening condition needed to reproduce or re-inspect that claim. It never
means globally complete state, complete source recovery, a unique or minimal
carrier, or production sufficiency.

The protected family is:

1. `shared/simulation.ts` remains the sole deterministic production gameplay
   authority, with V1–V4 transition result, event ordering, and replay semantics
   unchanged.
2. D2A remains analytical only; its exact configuration, policy, scenario,
   seed, trace, report, and accepted/rejected/historical status remain
   recoverable and unchanged.
3. Exact Worms_Port and CRPM source lineage remains visible.
4. Every claim retains its cut, scenario, action, policy, and seed domain.
5. Source, witness, decoder, carrier, path position, residue, exclusions, and
   reopening support survive result projection.
6. Current-readout equality, recursive continuation congruence, invariant-set
   membership, finite return, composed-route return, and D2A recurrence remain
   distinct.
7. Carrier maturity remains separate from product authority.
8. Bounded checker success cannot be promoted into global gameplay, balance,
   empirical, or CRPM-doctrinal truth.

## Source Binding and Evidence Status

CRPM is a read-only sibling reference checkout. It must not be edited, copied,
vendored, imported at runtime, or added as a package dependency. All CRPM
methodological readings in this contract are bound to commit
`995236df60924f790506cf5badec3c102abf3fd1` and the following paths and Git blob
identities:

| CRPM path | Blob at source lock | Bounded use |
| --- | --- | --- |
| `docs/architecture/Start_Here_Canonical.md` | `490bd3fad6d6adaeafe6f709c631436b9203bf35` | Deterministic navigation projection only; not a source of truth or independent support |
| `docs/architecture/CRPM_Port_Flow_Mapping_Note_v0.md` | `23964ae74beed39aec8ba75cfd91b1ed7b316ffe` | L4+ port/flow mapping discipline |
| `docs/architecture/CRPM_Port_Flow_Boundary_Interface_Run_v0.md` | `9f9a49ea5f3b17f0471cc1bfcec3d913f87e8bd5` | Bounded port/interface/run discipline |
| `docs/architecture/CRPM_Cut_Transition_Translation_Note_v0.md` | `0263f6b03816f006927ee8530eebab912649955e` | Typed cut-transition packet |
| `docs/architecture/CRPM_Edge_Scoped_Cut_Roles_Reentry_Protection_v0.md` | `6bdf61f9eff87f0a5888acb63f7018b38093d9ca` | Edge-scoped roles and re-entry protection |
| `docs/architecture/CRPM_Edge_Anatomy_Reentry_Graph_Relation_v0.md` | `52fe1b277015ee3331d55ffc20e613a017618b48` | Source/witness/carrier/path/residue support and maturity heuristic |
| `docs/architecture/CRPM_Typed_Reentry_Edge_Tooling_Playbook_v0.md` | `d59d990740cb774a8e095c3b521677c0f2d76635` | Typed re-entry tooling guardrails |
| `docs/architecture/voyage_graphs/research_notes/CRPM_Voyage_Edge_Graph_Recursive_Cut_Transition_Dynamics_Design_Note_v0.md` | `25a5ad5c3c0ed32409e425419d0b152948af2290` | Voyage composition as architecture/design reference only |
| `docs/architecture/CRPM_Evaluation_Language_Operational_Note_v0.md` | `762e37030c234d547957a74fb57d372f6ea4a6f2` | Non-scalar evaluation and false-closure checks |
| `docs/case_studies/Ported_Local_Subsystem_Case_Template.md` | `5746e42e31c5dd61400e859a601048618528e75f` | Bounded local subsystem and transfer-back pattern |
| `emergence_lab_crpm/observer.py` | `4dbcfde422b16a83eec9604fbe2d0e3df1780f03` | Generic finite quotient-transport algorithm reference |
| `tests/automation/test_observer.py` | `12315059339e72b40ef7de41f3e4fe2156fe06cc` | Executable behavior reference for that generic checker |
| `emergence_lab_crpm/dynamic_return_obligation_crosswalk_source.py` | `fdae980e594658c52bcce0e3ec6d7de635fbbb53` | Return-obligation distinctions, not a game ontology |

`docs/architecture/Start_Here_Now.md` was inspected only as a compatibility
pointer. The canonical start-here document is itself a deterministic
projection and retains an earlier embedded source commit; neither its row count
nor its generated presentation adds independent support to the bound source
artifacts above.

The Worms_Port implementation evidence remains rooted in the base commit and,
in particular, these existing sources:

- `shared/simulation.ts` and `shared/protocol.ts`;
- `analysis/tactical_model/model.py`, `run.py`, tests, registered JSON configs,
  and recorded reports;
- `scripts/export-tactical-v4-baseline.ts`;
- `analysis/tactical_model/fixtures/v4-authoritative-baseline-v1.json`;
- `tests/tactical-model/authoritative-v4-baseline.test.ts`; and
- `docs/planning/wp-015d2a-tactical-game-model-contract.md` and
  `docs/evidence/wp-015d2a.json`.

The external plan and owner request authorize this gate; they are not evidence
for its analytical claims.

### Evidence covariance

- The CRPM architecture notes form a linked methodological cluster, not
  independent confirmations and not Worms gameplay evidence.
- `observer.py` and its tests support a small generic finite checker. An
  independent TypeScript implementation provides code independence, not new
  empirical evidence.
- The existing V4 export/fixture/test and a future V4 adapter are all derived
  from `shared/simulation.ts`. Adapter parity is a correlated authority witness,
  not a new gameplay authority or an independent experiment.
- The D2A adapter and F2/F3/F4/H2/H3 cases reuse one deterministic analytical
  harness and related scenario, policy, and model assumptions. Distinct cuts,
  rows, rerenders, scalar probes, adapters, or reviewer agreement do not
  multiply their empirical weight.
- F2–H3 are counterfactual model candidates, not player-behavior, live
  ballistics, or production evidence.
- Independent review improves governance coverage only.

Future `TransitionWitness` and `WorldDesignResult` records must declare an
evidence origin, covariance group, and deduplication identity derived from the
source commit, adapter/configuration, scenario, seed, trace, and witness index.

## Layered Architecture

### 1. Authoritative deterministic TypeScript simulation

`shared/simulation.ts` remains unchanged in authority. It owns
`SimulationState`, `SimulationCommand`, `SimulationTransition`, V1–V4 rules,
ordered events, and deterministic state evolution. The port may observe and
compare its outputs; it may not replace, wrap into a second server, or mutate
them.

### 2. CRPM Game-World Profile

A future analysis-only TypeScript package may define local types, validation
schemas, cuts, edge packets, voyage traces, projection checks, and evaluation
records. Its dependency direction may be analysis-side adapter to `shared/`.
No reverse dependency is permitted.

### 3. V4 authority adapter

A future read-only adapter may invoke or consume existing V4 TypeScript
transitions and normalize their shape into witnesses without changing their
result. It must retain exact before-state, actor, command, expected turn,
accepted/mutated status, after-state, ordered events, error, ruleset, seed,
scenario, and source digest information required by its declared parity cut.

The present V4 fixture proves authoritative constants and one eight-step
movement transcript. It is structural authority linkage, not general
transition or replay parity. Generalized parity is not claimed; every future
parity test must name an exact scenario and command domain.

### 4. D2A analytical adapter

The implemented separate read-only adapter exposes registered existing Python model configurations,
policies, traces, reports, recurrence, and opening-search results through the
same `WorldDesignResult` envelope. It must transfer back to the exact D2A
configuration/report/trace carrier, never to a TypeScript gameplay state. A
common output envelope does not imply a common state ontology, dynamics, or
authority.

### 5. Offline World Design Port

The port accepts only sealed baseline references, registered adapters, bounded
scenario domains, declared cuts, protected families, bounded seed sets, and
registered declarative candidate configurations. It emits deterministic
traces, witnesses, residues, diagnostics, scalar annotations, and blocked
claims. It cannot activate gameplay.

### 6. Production boundary

`shared/`, `client/`, `server/`, protocol, replay, Loomkeeper, reward, and asset
paths must not import the analysis package. This package must not change V1–V4
behavior or add or activate V5. It must not become a runtime or network service.

## Required Worms_Port Contract Objects

These names describe future local contracts. They do not assert that the
objects already exist or that CRPM prescribes these names or one universal
serialization.

### `WorldCarrierReference`

References a versioned carrier together with its source commit, path/blob or
content digest, target claim, cut, admissible domain, action/policy family,
decoder, witness references, path position, exclusions, support status,
residue, and reopening condition. `supportCompleteFor` must name the bounded
target; an unqualified `supportComplete` claim is forbidden.

### `WorldCutDefinition`

Declares a cut id/version, observer or design stance, source carrier kind,
visible fields/projection key, intentionally hidden fields, admissible
scenario/action/policy/seed domain, protected family, target readout/decoder,
known residue, and reopening conditions. A cut is not an intrinsic CRPM node
role.

### `PortContract`

Declares versioned context, action, response, evidence, support, and return
channels; their observed, actuated, output, and forbidden bindings; registered
catalogs; determinism rules; validation; and failure behavior. Unknown fields,
adapters, candidates, cuts, or domain widening fail closed.

### `WorldTransitionEdge`

Declares an edge id/version, `fromCutId`, `toCutId`, a mandatory Worms-local
`edgeKind` from the closed profile catalog, an optional domain motif, and an
optional bounded CRPM transition interpretation. If the latter is present, it
must be justified as exactly one source-locked primitive—`refine`, `compress`,
`decompress`, `reorganize`, or `overlap-move`—and must not be inferred from the
domain motif. Every edge contains the following mandatory packet:

- **typed identity:** local `edgeKind` plus any separately justified optional
  CRPM interpretation;
- **fixed frame:** exact source lock, baseline/configuration and adapter,
  scenario world, cut pair, actor/command or policy family, seed/domain, and
  expected turn or trace position;
- **preserved:** the declared protected family and decoder/readout used to test
  survival;
- **forgotten:** intentionally projected distinctions, without calling them
  irrelevant;
- **newly visible:** target-cut distinctions and diagnostics;
- **residual:** ambiguity, unsupported domain, alias/null-space, model limits,
  and authority limits; and
- **reversibility/reopening:** one of exact, protected-equivalent,
  repair-dependent, or one-way, with a concrete trigger and transfer-back
  route; and
- **re-entry support:** explicit `sourceRefs`, `witnessRefs`, `decoderRefs`,
  `carrierRefs`, ordered `pathPosition` or prior-edge context, and a scoped
  `supportStatus` for the named target and domain.

Source, witness, decoder, carrier, path, residue, and reopening roles are
edge-scoped mandatory data, not prose-only metadata. Cuts and domain entities
must not acquire timeless intrinsic roles. A domain motif such as `move`,
`cast`, or `impact` is not automatically a CRPM transition interpretation; any
such interpretation requires this full packet.

### `TransitionWitness`

Carries exact source references and indices, before/input/after/output values or
digests, ordered events where applicable, decoder and cut ids, evidence origin,
covariance group, deduplication identity, parity/status, mismatch residue, and
reopening trigger. A projection-alias witness must name at least two source
items with the same source-cut key and different target-transition keys.

### `ResidualLedger`

Records visible loss, ambiguity, unsupported cases, exclusions, obligations,
blocked claims, responsible edge/path position, severity/status, and the
specific evidence or domain change that reopens the item. An empty ledger over
a finite sample is not a global no-residue claim.

### `ReturnObligation`

Represents separately typed and separately evaluated obligations:

1. current/public readout equality;
2. recursive carrier sufficiency or continuation congruence under a fixed
   continuation family;
3. invariant-set membership;
4. finite state/carrier return under a declared equality or decoder and a
   bounded horizon; and
5. composed-route return or route mismatch under paired paths, a decoder, and
   accumulated residue.

No one obligation implies another. A base/readout return is not carrier or
support return. D2A recurrence—repetition of `tactical_state_key` in one
nonterminal fixed-policy trace—is recorded separately and is not a proof of
finite return, convergence, or voyage return.

### `VoyageTrace`

Stores an ordered list of licensed edge ids and versions; compatible boundary
cuts and protected families; carried source, witness, decoder, and path history;
accumulated residue; return obligations; and reopening conditions. Composition
must fail closed on incompatible frames or protected families. This package
does not claim CRPM voyage-v2/v3 implementation, global recovery geometry,
holonomy, or a graph-safe schema.

### `ProjectionTransportAssessment`

Groups finite supplied source witnesses by a declared source-cut key, advances
them through a registered transition/operator, and compares declared target
keys. It records the sampled domain and explicit alias pairs. A split source
class yields `relation_or_kernel`; it must never be forced into a representative
or deterministic map. A non-splitting finite assessment yields only a bounded
`map` candidate for that declared support.

Projection descent and recurrence are independent questions: absence of
recurrence does not establish descent, and descent does not establish absence
of recurrence, balance, or global convergence.

### `WorldDesignRequest`

Contains only registered baseline, adapter, transition/operator, cut,
candidate/configuration, and evaluation ids; bounded scenario/action/policy and
seed domains; protected family; requested witnesses; deterministic ordering and
serialization version; and exclusions. The canonical request produces the
compiled request digest. Arbitrary executable overlays are forbidden.

### `WorldDesignResult`

Contains the request digest, source locks, adapter/config/cut ids, sampled
domain, ordered trace and witness references, projection and return
assessments, residue ledger, diagnostic profile, scalar probes, blocked claims,
evidence origin/covariance/deduplication information, carrier maturity, product
authority, deterministic result digest, and transfer-back status. A unified
shape never unifies the authority of its inputs.

### `DiagnosticProfile`

Binds the evaluation object, fixed frame/cut, protected family, scope,
excluded claims, and these non-scalar axes:

- `path_pressure`;
- `residue_visibility`;
- `local_reorganization`;
- `cut_fidelity`;
- `return_strength`; and
- `closure_risk`.

The v2 implementation gives every axis a closed qualitative value, reason,
digest-bearing witness references, visible residue, and structured blocked-
claim references. Scalar probes remain outside that profile in the evaluation
bundle. Aggregate parity, stability, cleanliness, or low visible residue cannot
independently prove preservation, balance, sufficient return, or landfall, and
the evaluator does not encode a generic balance-rate threshold.

### `CarrierMaturity`

A Worms_Port-local L4+ heuristic, not universal CRPM maturity doctrine:

- `M0 appearance` — a suggestive form without an explicit contract;
- `M1 declaration` — a versioned contract and bounded intended support;
- `M2 local use` — a tested carrier used within its declared local scope; and
- `M3 bounded design landfall` — a reviewed, reproducible local carrier with
  declared support, residue, and transfer-back for its target.

The contracts, bounded adapters, offline design port, and evaluation lens are
now `M2 local use`: they are tested within their declared analysis-only scope.
This does not establish `M3 bounded design landfall`, complete carrier support,
broad replay equivalence, or production sufficiency. M3 requires all declared
acceptance pressure cases to pass with re-enterable evidence and no active
false-closure rule; it still leaves ProductAuthority `none` without a separate
owner-approved versioned-ruleset decision.

### `ProductAuthority`

A separate Worms_Port governance status:

- `none`;
- `authority-adapter parity`;
- `owner reviewed`;
- `versioned ruleset approved`; and
- `production active`.

`authority-adapter parity` means a checked relationship to existing authority,
not newly created authority. Owner review, versioned ruleset approval, and
production activation require separate recorded decisions. M3 design landfall
never activates production by itself. The current D2B status is
`authority-adapter parity` only for the declared, tested historical simulation
transition domain; it does not change the authority in `shared/simulation.ts`.

## Required Cuts

Each cut must define an exact projection key, decoder/readout, admissible
scenario/action/policy/seed family, protected family, visible fields, forgotten
fields, residue, and reopening condition.

| Cut | Bounded purpose | Required guardrail |
| --- | --- | --- |
| Authority cut | Full authoritative V4 state, actor, command, expected turn, transition result, ordered events, and error | Source of production truth; adapter cannot rewrite it |
| Replay cut | Exact existing replay-record operations, state hashes, and reconstruction semantics for a declared replay/version domain | No ABI or replay change; existing records do not serialize ordered events, although a separate transition-parity witness may compare recomputed ordered events under its own cut |
| Player-public cut | State and outcomes legitimately visible to the player at a declared UI/ruleset cut | Hidden authority distinctions remain residue; no UI change is licensed |
| Presentation cut | Existing presentation-consumable event/readout information | Visual equivalence cannot establish gameplay-state equivalence |
| Tactical-analysis cut | Exact D2A tactical state, policy, action, trace/report fields, scenario/configuration, and model assumptions | Analytical only; cannot claim live simulation or empirical parity |
| World-design cut | Normalized request/result references, edge/voyage evidence, diagnostics, residue, and blocked claims | Shared envelope does not imply shared ontology or dynamics |

A cut may claim deterministic continuation only over its declared admissible
action/domain family. If one projected source class contains states that produce
different target classes under the declared transition, the projection is an
aliasing `relation_or_kernel` candidate, not a complete deterministic state
map.

### Required thin and repaired V4 pressure cuts

The implementation gate must construct an exact reachable V4 witness pair
under one sealed seed/scenario on terrain that permits a position-returning
right/left two-command movement sequence:

- the deliberately thin source cut retains the continuation-relevant V4
  identity, turn, active actor, phase, unit/terrain, selection, and aim readout
  but deliberately omits `movementRemaining` and observational `revision`;
- at the locked source, the intended acceptance witness uses V4 seed
  `0xC0FFEE11` after one versus four position-returning right/left pairs: the
  thin keys must match while authoritative movement budgets and revisions
  remain different; and
- the same bounded `move` command must then produce distinct target classes,
  such as accepted movement versus `COMMAND_REJECTED` for exhausted movement.

The movement sequence returns position, not authoritative state; its consumed
movement budget and advanced revision are the deliberately hidden residue. It
must not be described as a state return or recurrence.

The repaired cut adds `movementRemaining` and is assessed only for the exact V4
scenario and one-step `move` command family declared by the acceptance test. It
must remove the witnessed split over that finite support. It does not establish
global completeness, minimality, uniqueness, all-command parity, or a
recursively sufficient carrier outside that domain. If this concrete reachable
pair cannot be produced without modifying authority, the test must fail and the
cut design must reopen.

## Offline World Design Port

### Observed ports

- sealed baseline ruleset and state;
- registered transition and operator catalogs;
- reference scenarios; and
- current D2A evidence.

### Actuated ports

- registered analysis-only declarative candidate overlay or existing candidate
  configuration;
- bounded scenario domain;
- policy family;
- evaluation cut;
- protected family; and
- bounded seed set.

### Output ports

- compiled request digest;
- transition and voyage traces;
- projection-aliasing witnesses;
- recurrence and separately typed return witnesses;
- residue ledger;
- diagnostic profile;
- scalar probes;
- blocked claims;
- carrier maturity; and
- product authority.

### Forbidden ports

- live ruleset or candidate activation;
- protocol, replay, reward, client, server, Loomkeeper, or asset modification;
- hidden randomness;
- arbitrary executable candidate code;
- undeclared domain widening;
- representative selection that hides an alias;
- source-history reconstruction; and
- automatic promotion from one scalar, one sample, one adapter, or one review.

All catalogs are closed and versioned. Unknown ids and non-canonical requests
fail closed. Outputs must be deterministically ordered and serialized so the
same registered inputs produce the same digest.

## Transfer-Back and Reopening

The port must preserve two separate re-entry routes:

1. `V4 authority -> read-only V4 adapter -> declared cut/edge/voyage -> result
   -> restriction/decoder -> exact authoritative state/command/transition`; and
2. `D2A configuration + policy + trace/report -> read-only analytical adapter
   -> result -> restriction/decoder -> exact Python evidence references`.

Every route must retain, as applicable:

- source commit, path, ruleset/configuration id, and source/content digest;
- admissible scenario/action/policy/seed family;
- from/to cut ids and protected family;
- exact before state, actor, command, expected turn, after state, and ordered
  event/error values or digests for V4;
- exact config/report/trace-step digest and indices for D2A;
- decoder/restriction rule id;
- `exact`, `mismatch`, or `not_tested` status;
- mismatch residue and witness references;
- `authorityMutationObserved: false`; and
- a concrete reopening trigger.

Reopen on source-lock or path drift, authority/fixture/config/digest mismatch,
adapter mismatch, decoder failure, alias discovery, domain widening,
candidate-status drift, missing protected fields, hidden residue,
nondeterministic output, changed support, or any attempted authority escalation.
An exact-commit reviewer must be able to reproduce or re-inspect the path.

## Acceptance Pressure Cases

The executable analysis package reproduces these bounded cases without
reopening, registering, or promoting a gameplay candidate:

| Case | Registered source | Required result and blocked inference |
| --- | --- | --- |
| V4 authority parity | `shared/simulation.ts`, exporter, authoritative fixture, and TS test | Exact declared state/actor/command/turn and accepted/mutated/state/ordered-events/error results now match in bounded V1 and V4 tests. This is not general simulation or replay parity. |
| Thin V4 projection | Required reachable movement witness pair above | Emit the explicit same-source-key/different-target-key pair and classify as `relation_or_kernel`; never select a representative. |
| Repaired V4 projection | Same witness support, repaired cut including `movementRemaining` | Remove only that witnessed split over the declared one-step movement domain; do not claim global or minimal state sufficiency. |
| F2 recurrence | `v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json` | Reconstruct the exact prepare/Unweave recurrence and preserve `rejected` status. |
| F3 residue-bearing repair | `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json` | Reconstruct removed recurrence together with visible Threadback/Escape-Slack residue and 68.8% first-actor rate; preserve `rejected`, not general repair success. |
| F4 structural reference | `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json` | Reconstruct no bounded openings, recurrence, or turn-limit results in the 250-match sweep together with 63.2% aggregate and 80% first-actor rate at distance 704; retain structural-reference-only status and initiative residue. |
| H2 aggregate-parity false closure | `v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json` | Reconstruct 48.8% aggregate together with distance bands 44/40/44/40/76%; preserve `rejected` and expose distance-conditioned closure risk. |
| H3 delayed-response failure | `v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json` | Reconstruct convergence/no recurrence together with forced openings at distances 448/512/576 and 63.2% aggregate first-actor rate; preserve `rejected`: delayed response cannot repair an already completed forced edge. |

No acceptance case changes D2A history, declares a final threshold, proves live
ballistics or player balance, or activates V5.

## False-Closure and Non-Claims

The following promotions are explicitly blocked:

- contract, schema, or checker success into semantic or production truth;
- a V4 structural fixture or finite adapter sample into full simulation/replay
  equivalence;
- one non-splitting projection sample into all-domain state completeness;
- a repaired cut into unique, minimal, or globally sufficient state;
- recurrence absence into finite/global return, convergence, or balance;
- F4 structural strength into initiative or production landfall;
- H2 aggregate parity over its distance-conditioned imbalance;
- H3 visible counterplay into timely repair;
- low residue caused by omitted state into actual low residue;
- a common result shape into common authority or dynamics;
- correlated cases, rows, adapters, reruns, or reviewers into independent
  evidence;
- M3 or `authority-adapter parity` into production activation; and
- a domain motif into an undeclared CRPM transition kind.

This package makes no claim of general V4 parity beyond declared transcripts, a
globally support-complete carrier, deterministic continuation outside a
declared family, a graph-safe CRPM schema, a universal edge/return taxonomy,
source-history recovery, realized voyage/holonomy, D2A closure, or product
authority.

## Non-Goals and Hard Stops

WP-015D2B must not implement a new gameplay candidate, including a range-entry
commitment candidate. It creates only the design and evidence port needed to
test a separately authorized candidate later.

Stop and reopen the contract before implementation if work would require:

- changing `shared/`, client, server, protocol, replay, Loomkeeper, reward, or
  asset behavior;
- adding or activating V5 or changing V1–V4 results;
- importing analysis from a production path;
- editing, vendoring, or depending on CRPM;
- accepting arbitrary executable overlays or hidden randomness;
- widening scenario/action/policy/seed domains without declaration;
- treating aliasing as a deterministic map;
- collapsing return categories or evidence origins;
- changing any D2A candidate status or reconstructing its model differently;
- claiming M2/M3 or raising ProductAuthority without its own evidence and
  decision gate; or
- promoting this application profile into CRPM schema, ontology, graph safety,
  or doctrine.

## Implementation and Verification Gates

Owner acceptance was recorded before executable D2B work. Exact analysis paths,
cut fields, closed adapter/config catalogs, bounded domains, witness identities,
canonical digest rules, output confinement, and fixtures are recorded in the
implementation and `docs/evidence/wp-015d2b.json`. The implementation must
continue to pass these explicit gates:

1. **Contract/schema tests:** validate every required object, closed catalog,
   scope, mandatory transition field, evidence lineage, blocked claim, and
   fail-closed behavior.
2. **V4 adapter parity tests:** compare exact bounded authoritative
   before/command/after result and ordered events without authority mutation.
3. **Projection-aliasing tests:** produce the thin-cut alias pair, classify it
   as `relation_or_kernel`, and demonstrate only the bounded repaired descent.
4. **Edge-composition tests:** reject incompatible frames/protected families,
   preserve ordered path history, accumulate residue, and exercise
   transfer-back/reopening.
5. **D2A pressure-case tests:** reconstruct F2, F3, F4, H2, and H3 values,
   residues, and historical statuses from registered existing evidence.
6. **Deterministic CLI/output tests:** repeat an identical canonical request and
   prove byte-stable ordering and result digest; reject unknown or widened
   inputs.
7. **Repository regression checks:** run existing tactical-model tests, relevant
   TypeScript type checks, `npm run build`, work-package checks, and
   `npm run check:compliance`. Run `npm audit` only if package metadata or
   dependencies change.

Browser and physical-device tests are not required while no runtime-facing code
changes. Any later runtime-facing package must reopen the verification plan and
apply the repository's browser matrix and release-device rules.

The Execution Pointer remains on WP-015D2A. This implementation creates no
runtime import path, player-visible change, candidate activation, or product
authority.
