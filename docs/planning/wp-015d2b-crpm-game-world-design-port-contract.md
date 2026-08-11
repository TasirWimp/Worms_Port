# WP-015D2B — CRPM Game-World Profile and Offline World Design Port Seed

## Status

- **State:** in progress; reopened for the external implementation-review repairs
- **Relationship:** analysis-only child of the active WP-015D2A tactical-game-model decision line
- **Current carrier maturity:** `M2 local use` for the core contracts, bounded adapters, offline design port, and evaluation lens; no `M3` claim
- **Current product authority:** `none`; tested V4 adapter parity is authority-derived witness/support provenance only
- **Worms_Port base:** `af23717e61fea6995bf3b7209211ae1aaa2bb855` on `codex/wp-015d2b-crpm-world-design-port`
- **Implementation tip before documentation integration:** `f34317c5008e3171718705a9d8277437aae8d00d`
- **Documentation/evidence closure predecessor before adversarial hardening:** `7655b1c27b54ce6d6ee0a2279beaba8ec1939811`
- **CRPM source lock:** `995236df60924f790506cf5badec3c102abf3fd1` on `main`
- **Contract date:** 2026-08-10
- **Documentation/evidence closure date:** 2026-08-11

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
and applies seven explicit false-closure rules plus source-bound maturity gates.

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

No CRPM source code was copied. The small generic quotient-transport purpose
from `observer.py` was independently reimplemented in TypeScript against local
Worms_Port types and tests; all other CRPM use is bounded methodological
translation and source attribution.

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
- The existing V4 export/fixture/test and implemented V4 adapter are all derived
  from `shared/simulation.ts`. Adapter parity is a correlated authority witness,
  not a new gameplay authority or an independent experiment.
- The D2A adapter and F2/F3/F4/H2/H3 cases reuse one deterministic analytical
  harness and related scenario, policy, and model assumptions. Distinct cuts,
  rows, rerenders, scalar probes, adapters, or reviewer agreement do not
  multiply their empirical weight.
- F2–H3 are counterfactual model candidates, not player-behavior, live
  ballistics, or production evidence.
- Independent review improves governance coverage only.

Implemented `TransitionWitness` and `WorldDesignResult` records declare an
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

The analysis-only package under `analysis/crpm_world/` defines local types,
strict validation schemas, cuts, edge packets, voyage traces, projection
checks, and evaluation records. Its only production-facing dependency direction
is the read-only V4 adapter to `shared/simulation.ts`; the strengthened import-
boundary check forbids reverse dependencies from `shared/`, `client/`, or
`server/`.

### 3. V4 authority adapter

`analysis/crpm_world/adapters/v4-authority-adapter.ts` directly invokes the
existing exported `applySimulationCommand`, clones caller data, and normalizes
the exact transition into witnesses without changing its result. It retains
before-state, actor, command, expected turn,
accepted/mutated status, after-state, ordered events, error, ruleset, seed,
scenario, and source digest information required by its declared parity cut.

Direct parity tests cover accepted movement in V1 and V4, wrong-actor movement,
Relic selection, aim, deterministic fire, fire without aim, terminal rejection,
input immutability, and repeatable edge/witness digests. The older V4 fixture
still proves only authoritative constants plus one eight-step movement
transcript. Neither test family establishes general transition or replay
parity outside its named scenarios and command domains.

### 4. D2A analytical adapter

`analysis/crpm_world/adapters/d2a_export.py` exposes only registered existing
Python model configurations, policies, traces, reports, recurrence, and
opening-search results through the same `WorldDesignResult` envelope. It
transfers back to the exact D2A
configuration/report/trace carrier, never to a TypeScript gameplay state. A
common output envelope does not imply a common state ontology, dynamics, or
authority.

### 5. Offline World Design Port

The closed registry, validator, executor, and CLI under
`analysis/crpm_world/design-port/` and `scripts/run-crpm-world-design.ts` accept
only sealed baseline references, registered adapters, bounded
scenario domains, declared cuts, protected families, bounded seed sets, and
registered declarative candidate configurations. It emits deterministic
traces, witnesses, residues, diagnostics, scalar annotations, and blocked
claims. The current closed registry admits exactly seed `3237998097` and the
`witnesses` output-detail level for both execution families; other seed sets
or output-detail levels fail closed until separately implemented and tested.
It cannot activate gameplay.

### 6. Production boundary

`shared/`, `client/`, `server/`, protocol, replay, Loomkeeper, reward, and asset
paths must not import the analysis package. This package must not change V1–V4
behavior or add or activate V5. It must not become a runtime or network service.

## Implemented Paths and Results

| Surface | Implemented paths | Bounded result |
| --- | --- | --- |
| Canonical contracts | `analysis/crpm_world/canonical.ts`, `schemas.ts`, `types.ts`, `tsconfig.json` | Strict versioned JSON records, canonical key sorting with array-order preservation, and SHA-256 digests; unsafe numeric/non-JSON/timestamp content fails closed |
| V4 authority adapter | `analysis/crpm_world/adapters/v4-authority-adapter.ts` | Exact direct transition parity for the declared V1/V4 scenarios without a `shared/` edit |
| Cuts and projection | `analysis/crpm_world/cuts/`, `kernel/project-cut.ts`, `kernel/assess-quotient-transport.ts` | Seven closed versioned cuts, explicit authority-to-projection bridge edges, and an independently written finite quotient-transport checker with explicit alias pairs |
| Voyage and return | `kernel/compose-edges.ts`, `trace-voyage.ts`, `residual-ledger.ts`, `assess-return.ts` | Schema/profile-aware composition, explicit migration edges, referentially closed typed world obligations, and six separate return classes |
| D2A adapter | `analysis/crpm_world/adapters/d2a_export.py` and `adapters/tests/` | Exact registered F2/F3/F4/H2/H3 report-digest checks and compact deterministic evidence; `analysis/tactical_model/model.py` is unchanged |
| Offline design port | `analysis/crpm_world/design-port/`, `analysis/crpm_world/examples/`, `scripts/run-crpm-world-design.ts` | Closed `v4_authority@1` and `d2a_tactical@1` execution only; output confined below ignored `test-results/crpm-world/` |
| Evaluation | `analysis/crpm_world/evaluation/` | V2 witness-linked qualitative profile, seven false-closure rules, mandatory evidence separated from optional display, and a source-bound historical evaluator capped at M2/ProductAuthority none |
| Verification and boundary | `tests/crpm-world/`, `scripts/check-import-boundary.js`, `package.json`, `legal/source-manifest.json` | 71 focused tests plus existing simulation/tactical/build/compliance gates; the exact reference-only CRPM method pin is manifest-recorded and production imports from analysis remain forbidden |

The reviewed example artifacts after the current in-progress
implementation-review repairs are:

| Example | Request digest | Result digest | Maturity / authority |
| --- | --- | --- | --- |
| V4 four-command transcript | `d40a4dcbeb0a59ed5a52cd340315dd9ae962ebf2455dd57863333ba6656dc98f` | `209a6813201ea7b0db53919f8b68b17a7b5bbefac7116ec3ce4f80ca90490187` | `M2_local_use` / `none` |
| D2A F3 pressure request | `8d2fc97e2fe8576b72c417d303bd4e3e5160de90b0eea2a1947dd8a161703cda` | `11f83e1512dff94287181bdf25d76eeb5ec34595cc1818237a4a8697ee776c55` | `M2_local_use` / `none` |

### Recorded deviations from the provisional design

- Core contracts remain at the package root rather than a nested `contracts/`
  directory because `schemas.ts`, `types.ts`, and `canonical.ts` are already a
  cohesive local source surface.
- Compatibility-bearing records evolved through discriminated v1/v2 schemas:
  v2 adds explicit edge port bindings, complete projection transition rows,
  voyage attempts/re-entry, and witness-linked qualitative diagnostics without
  invalidating checked v1 D2A source records.
- The D2A adapter is Python rather than a TypeScript model rewrite. It invokes
  stable public tactical-model functions and emits deterministic JSON for Zod
  validation; production TypeScript never invokes Python.
- No shared pure helper was needed. `shared/simulation.ts` and
  `shared/protocol.ts` were not edited.
- The CLI persists `WorldDesignResult`; the library additionally returns a
  separately digested evaluation bundle. Its v2 primary profile contains no
  scalar probes, while retained v1 source diagnostics preserve analytical
  provenance and allow probes to be extracted beside the profile.
- External implementation review replaced caller-declared acceptance,
  re-entry, owner-decision, and authority inputs with closed source/report/
  witness verification. Current result/evaluation schema versions cannot emit
  M3, owner-reviewed, approved, or production-active authority.
- Cut ids on edges, frames, voyages, composition, return, and evaluation were
  replaced by versioned references. Ordinary authority command edges cannot be
  silently retyped as thin-cut edges; authority projection uses a separate
  bridge edge. Carrier continuation includes schema/profile identity and any
  version change requires an explicit migration edge.
- Mandatory evidence probes are fixed by the adapter/config registry and always
  evaluated before optional scalar display selection. World support obligations
  are typed separately from return assessments and validated across their full
  lifecycle.
- Terrain remains digest-backed rather than expanded into every report, and
  compact aggregate cases retain report/source references rather than checking
  all 250 traces into Git.
- Existing Zod, TypeScript, tsx, Node test/crypto, and Python standard-library
  surfaces were sufficient. No Ajv, code generator, package dependency, CRPM
  vendor copy, or broad `verify:full` integration was added.

## Implemented Worms_Port Contract Objects

These names are implemented as strict local Zod schemas in
`analysis/crpm_world/schemas.ts` with inferred types in `types.ts`. They remain
Worms_Port vocabulary; CRPM does not prescribe these names or this
serialization.

### `WorldCarrierReference`

Stores schema/profile version, carrier kind, adapter id/version, ruleset or config id,
baseline and state digests, revision or step, and an optional opaque source
reference. Domain, decoder, witness, path, residue, and reopening data remain
edge/voyage-scoped instead of being duplicated into every carrier. No carrier
field licenses an unqualified support-complete claim.
Exact continuation and finite exact return compare both schema and profile
versions. A version change requires an explicit `carrier-profile-migration`
edge; it is never accepted as equality by a matching state digest alone.

### `WorldCutDefinition`

Stores cut id/version, source carrier kind, projection description, admissible
scenario/action/policy/seed domain, protected family, included support,
intentionally forgotten distinctions, excluded claims, and continuation class
`complete`, `bounded`, `relational`, or `none`. Reopening and decoder data are
carried by witnessed edges/voyages. A cut is not an intrinsic CRPM node role.

### `PortContract`

Declares versioned context, action, response, evidence, support, and return
channels; their observed, actuated, output, and forbidden bindings; registered
catalogs; determinism rules; validation; and failure behavior. Unknown fields,
adapters, candidates, cuts, or domain widening fail closed.

### `WorldTransitionEdge`

Declares an edge id/version, versioned `sourceCut` and `targetCut` references, a mandatory Worms-local
`edgeKind`, a mandatory Worms domain motif, and an
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
The authority adapter accepts only registered versioned authority cuts. A
projection to `thin_visible_duel_v0` or `bounded_command_support_v1` is a
separate `authority-cut-projection` edge and cannot relabel an ordinary command
edge.

### `TransitionWitness`

Carries edge id, source and decoder references, input/output digests, optional
ordered-events digest, evidence origin, covariance group, deduplication
identity, exact/mismatch/not-tested status, optional mismatch residual, and
excluded claims. Edge and voyage records carry the cut/path/reopening route. A
projection-alias witness separately names at least two source items with the
same source-cut key and different target-transition keys.

### `ResidualLedger`

Stores structured position, resource, health, status, terrain, and authority
deltas; expired rights; opened, carried, discharged, and unresolved obligations; and
excluded/unmodelled residue. Edge/path identity, support status, blocked claims,
and reopening conditions remain on their owning records. An empty ledger over
a finite sample is not a global no-residue claim.

### `WorldObligation` and `ReturnAssessment`

`WorldObligation` represents a gameplay/design support duty with a typed id,
origin edge, bearer/beneficiary, support carrier, legal responses, expiry and
discharge conditions, and witnessed lifecycle. Every opened, carried,
unresolved, discharged, or expired id must resolve to one typed record; its
origin edge and support carrier must exist, discharge cannot precede opening,
and an open obligation must be carried or explicitly closed on each following
edge.

`ReturnAssessment` separately evaluates `visible_equal`,
`protected_equivalent`, `recursive_carrier_return`, `invariant_region_return`,
`finite_exact_return`, and `route_mismatch`.

No one return class implies another. A base/readout return is not carrier or
support return. D2A recurrence—repetition of `tactical_state_key` in one
nonterminal fixed-policy trace—is recorded separately and is not a proof of
finite return, convergence, or voyage return.
The executable F2 recurrence is emitted in `returnAssessments`, never in
`worldObligations`; H3 Frayed Seam support is the typed world obligation.

### `VoyageTrace`

V2 stores ordered transition edges and accepted/rejected/incompatible attempts,
command history, explicit cut changes, witness references, accumulated residue,
obligation history, replay support, terminal status, excluded claims, and
re-entry instructions. Composition fails closed with a structured witness while
retaining the valid prefix and attempted edge. This package does not claim CRPM
voyage-v2/v3 implementation, global recovery geometry, holonomy, or a graph-safe
schema.

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

The core request contract stores registered adapter, baseline/config carrier,
cut, scenario/action/policy/seed domain, protected family, ordered design steps,
output detail, exclusions, and canonical digest. The stricter offline envelope
in `design-port/validate-request.ts` additionally binds the complete mandatory
evidence-probe family, optional displayed scalar probes, requested ports, and
`offline_only` activation. Arbitrary executable overlays and user-supplied
module, script, shell, or operator paths are forbidden.

### `WorldDesignResult`

Stores request digest, source locks, voyage traces, transition witnesses,
projection assessments, typed world obligations, return assessments,
diagnostics, residual ledger,
blocked claims, maturity, product authority, evidence origin/covariance/
deduplication information, and deterministic result digest. Adapter/config/cut
and sampled-domain identities remain in the nested carriers, fixed frames,
traces, assessments, and diagnostics. A unified shape never unifies the
authority of its inputs.
V4 result parity appears only in the typed `authorityProvenance` relationship,
bound to an exact source lock and transition witnesses. It cannot change the
separate `productAuthority: none` field.

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
broad replay equivalence, or production sufficiency. The current evaluator is
restricted to a closed historical-pressure registry and emits at most M2. It
derives source binding, mandatory evidence completeness, and re-enterability;
callers cannot submit pass, owner-decision, M3, or authority assertions. A
future M3 registration requires a new source-bound, witness-verified contract
version after every required pressure case passes with no active false closure.

### `ProductAuthority`

A separate Worms_Port governance vocabulary. Current executable edge, result,
and evaluation schemas admit only `none`:

- `none`;
- `authority-adapter parity`;
- `owner reviewed`;
- `versioned ruleset approved`; and
- `production active`.

`authority-adapter parity` is retained only as a descriptive provenance/support
relationship to existing authority, not as current ProductAuthority. Owner
review, versioned ruleset approval, and production activation require separate
closed, source-bound decision records outside this evaluator. M3 design
landfall never activates production by itself. Current D2B ProductAuthority is
`none` for V4 and D2A alike.
A future governance record must be a separately versioned closed schema binding
repository, commit, repository-relative path, content digest, ruleset id and
version, admissible scope, and decision identity. No arbitrary string reference
or field on `EvaluationDeclaration` can substitute for that record.

## Implemented Cuts

`analysis/crpm_world/cuts/v4-cuts.ts` defines the following version-1 records;
`cuts/registry.ts` returns detached copies from a closed registry. Each record
declares its admissible scenario/action/policy/seed family, protected family,
included support, forgotten distinctions, excluded claims, and bounded
continuation class.

| Cut id | Bounded purpose | Required guardrail |
| --- | --- | --- |
| `authority_v4` | Digest-backed complete canonical V4 authority carrier for the registered command domain | No claim beyond `shared/simulation.ts` or the finite registered seed |
| `authority_historical_v1_v4` | Digest-backed V1-through-V4 parity carrier for the registered historical seed | No historical ruleset promotion or all-state claim |
| `thin_visible_duel_v0` | Active actor, positions, and Stitching only; destructive aliasing control | Explicitly relational/incomplete; matching readout is not state return or recurrence |
| `bounded_command_support_v1` | Movement-only continuation support including movement budget, terrain, occupancy, bounds, actor, and expected turn | Bounded to supplied states and `move`; no fire/aim/selection/global completeness claim |
| `replay_v4` | Initial authority support, ordered existing replay operations, state hashes, and reconstruction semantics | No replay ABI change; ordered events are not serialized in existing replay records |
| `world_design_v0` | Offline profile/adapter/config/exclusion/evidence/authority references | No live mutation channel or shared-dynamics inference |
| `d2a_tactical_recurrence_v1` | Registered F2/F3/F4/H2/H3 analytical support and recurrence carrier | Analytical only; exact config/report/domain binding and no production-state claim |

The D2A cut is part of the same closed versioned registry and remains tied to
registered config/report/trace carriers; it is not a production-state cut.

A cut may claim deterministic continuation only over its declared admissible
action/domain family. If one projected source class contains states that produce
different target classes under the declared transition, the projection is an
aliasing `relation_or_kernel` candidate, not a complete deterministic state
map.

### Thin and repaired V4 pressure result

The implemented tests construct an exact reachable V4 witness pair
under one sealed seed/scenario on terrain that permits a position-returning
right/left two-command movement sequence:

- the deliberately thin source cut retains only active actor, unit positions,
  and visible Stitching and deliberately omits all remaining authority support;
- at the locked source, the acceptance witness uses V4 seed
  `0xC0FFEE11` after one versus four position-returning right/left pairs: the
  thin keys match while authoritative movement budgets are 48 versus 0 and
  revisions are 2 versus 8; and
- the same bounded right `move` command produces accepted movement versus
  `COMMAND_REJECTED` for exhausted movement.

The movement sequence returns position, not authoritative state; its consumed
movement budget and advanced revision are the deliberately hidden residue. It
must not be described as a state return or recurrence.

The repaired movement-support cut includes `movementRemaining` and the other
declared movement inputs and passes only for the exact V4 scenario and one-step
`move` family in the acceptance test. It removes the witnessed split over that
finite support. It does not establish global completeness, minimality,
uniqueness, all-command parity, or a recursively sufficient carrier outside
that domain.

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
- versioned from/to cut references and the exact mandatory protected family;
- exact before state, actor, command, expected turn, after state, and ordered
  event/error values or digests for V4;
- exact config/report/trace-step digest and indices for D2A;
- decoder/restriction rule id;
- `exact`, `mismatch`, or `not_tested` status;
- mismatch residue and witness references;
- `authorityDefinitionMutationObserved: false`; and
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
| H3 delayed-response failure | `v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json` | Reconstruct convergence/no recurrence together with forced openings at distances 448/512/576 and 63.2% aggregate first-actor rate; carry the active Frayed Seam obligation across the intervening edge and record its later discharge; preserve `rejected`: delayed response cannot repair an already completed forced edge. |

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
- F2 recursive-carrier return into successful recurrence repair, balance, or
  design landfall;
- F4 structural strength into initiative or production landfall;
- H2 aggregate parity over its distance-conditioned imbalance;
- H3 visible counterplay into timely repair;
- low residue caused by omitted state into actual low residue;
- a common result shape into common authority or dynamics;
- correlated cases, rows, adapters, reruns, or reviewers into independent
  evidence;
- M3 or authority-adapter parity provenance into ProductAuthority or production activation; and
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

Completion therefore means: no V5; no new gameplay mechanic or range-entry
commitment candidate; no live defense or reaction; no new player status; no
protocol or replay field; no reward, Loomkeeper, client UI, server, or asset
change; no graph-safe CRPM schema; and no claim that the tactical game is
solved.

Stop and reopen the contract before any follow-on change if work would require:

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
