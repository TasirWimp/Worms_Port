# CRPM Game-World Contracts

`analysis/crpm_world` is the analysis-only WP-015D2B contract layer. It defines
strict, versioned JSON records for the bounded Worms_Port Game-World Profile and
offline World Design Port. It includes one read-only simulation-authority
adapter, but it is not a server, gameplay system, or candidate implementation.
WP-015D2B completed on 2026-08-11 after its implementation, adversarial,
sealing, and final external reviews. Completion preserves the analysis-only
boundary, `M2 local use` ceiling, and `ProductAuthority: none`.

Operational use and admission of any later gameplay hypothesis are governed by
[`docs/process/crpm-world-operational-governance.md`](../../docs/process/crpm-world-operational-governance.md).
The current registry is sealed to its named historical cases; that process
explains when a new candidate requires a separately versioned admission layer.

## Authority and dependency boundary

- `shared/simulation.ts` remains the sole deterministic production gameplay
  authority.
- Production paths under `shared/`, `client/`, and `server/` must not import
  this package.
- CRPM commit `995236df60924f790506cf5badec3c102abf3fd1` is a read-only
  methodological source lock, not a package or runtime dependency.
- These schemas are a Worms_Port L4+ application profile, not a CRPM schema,
  graph-safe format, ontology, or doctrine.
- Nothing in this package activates V5, a candidate, gameplay, replay, protocol,
  Loomkeeper, reward, UI, or asset behavior.

## Implementation and source identity

- Worms_Port implementation base:
  `af23717e61fea6995bf3b7209211ae1aaa2bb855`.
- Frozen dependency-repair implementation commit:
  `ca7bce03f132da6344b9b46c1743d055f65cba07`.
- Frozen implementation tree:
  `029fb669cb1fee85eed322163d951aec5614d135`.
- Canonical 25-file implementation-bundle digest:
  `ab843f2d35d6814b6837c7ae037f64d59cac00e19dfa57099538545a75742010`.
- Approved direct-child implementation lock commit:
  `b7937615ca72b7ac74de038c74ef78a64c0e1962`.
  The named lock JSON is machine evidence authenticated by the evaluator, not
  a second work-package record; the work-package checker excludes only that
  exact filename while continuing to validate all 24 package records.
- Read-only CRPM source lock:
  `995236df60924f790506cf5badec3c102abf3fd1`.
- CRPM port/flow, cut-transition, edge/re-entry, voyage, evaluation, and local-
  subsystem documents supply bounded L4+ methodology. `observer.py` supplies
  only the purpose of the generic finite quotient-transport check, which is
  independently implemented in TypeScript. The dynamic-return source supplies
  distinctions between readout, recursive-carrier, invariant, finite, and
  composed-route return.
- No CRPM code or repository content is vendored or copied, and CRPM is not a
  runtime, Python, npm, or package dependency. Exact paths and Git blob
  identities are recorded in the work-package contract, and the separate
  reference-only upstream pin is recorded in `legal/source-manifest.json`.

## Architecture

```text
strict offline request
  -> closed adapter/config/cut validation
    -> V4 TypeScript authority adapter OR D2A Python evidence exporter
      -> witnessed edges, cuts, projection and voyage/return kernels
        -> v2 qualitative evaluation + separate scalar probes
          -> digest-bound WorldDesignResult and evaluation bundle
```

The V4 route calls the existing TypeScript authority directly. The D2A route
reruns the registered analytical model and crosses into TypeScript only as
deterministic JSON. Both share an evidence envelope, not state ontology,
dynamics, empirical weight, or product authority.

## Files

- `canonical.ts` validates deterministic JSON, deep-copies object content in
  sorted-key order, serializes canonical JSON, and produces lowercase SHA-256
  content digests.
- `schemas.ts` contains the strict versioned Zod contracts, digest builders,
  and closed catalog validation for design requests.
- `implementation-lock.ts` derives a receipt from the newest Git commit that
  touched the closed implementation-path inventory, verifies every working
  implementation file against its recorded blob, and binds the commit, tree,
  per-file blob OIDs, bundle digest, versions, source locks, and request/result
  digests into each result.
- `types.ts` exports TypeScript types inferred from the Zod contracts so the
  runtime validator and compile-time surface cannot drift independently.
- `adapters/v4-authority-adapter.ts` clones and validates caller inputs, calls
  exported `applySimulationCommand` directly, returns its exact transition, and
  renders a compact authority-edge/witness projection for historical V1 through
  V4 states. Its name records the gate that introduced it; its adapter identity
  explicitly covers the versioned simulation authority rather than pretending
  V4 is the only historical ruleset.
- `adapters/d2a_export.py` invokes only the existing public tactical-model
  functions, verifies exact registered whole-report digests, and emits compact
  action witnesses plus non-scalar pressure diagnostics as a strict
  `WorldDesignResult`. Python remains the analytical source; TypeScript only
  validates the deterministic JSON boundary.
- `cuts/v4-cuts.ts` defines six bounded historical/V4/offline cuts,
  `cuts/d2a-cuts.ts` defines the registered analytical cut, and
  `cuts/registry.ts` exposes detached copies from one closed versioned registry.
- `kernel/project-cut.ts` provides non-mutating generic projection plus V4
  authority, thin-visible, and movement-support projections.
- `kernel/assess-quotient-transport.ts` implements the small finite-sample
  quotient-transport check independently in TypeScript. CRPM
  `emergence_lab_crpm/observer.py` is a read-only method reference only.
- `kernel/compose-edges.ts`, `residual-ledger.ts`, and `trace-voyage.ts`
  compose witnessed paths without discarding rejected or incompatible attempts,
  accumulate residue/obligations, and support deterministic authority re-entry.
- `kernel/derive-voyage-evidence.ts` is the sole canonical derivation of voyage
  edges, residue, obligation history, final carrier, and compatibility, and it
  also derives the result ledger from all contained traces.
- `kernel/assess-return.ts` evaluates six separate return classifications
  without collapsing them into one loop flag.
- `design-port/registry.ts` is the closed offline registry for only
  `v4_authority` and `d2a_tactical`; it contains no dynamic module or executable
  operator registration.
- `design-port/validate-request.ts` defines the strict offline request envelope
  and rejects undeclared domains, incompatible cuts/configs, forbidden ports,
  live activation, malformed seeds, and arbitrary fields.
- `design-port/execute-request.ts` executes the registered V4 transcript or the
  fixed D2A Python exporter boundary, validates the result, and restricts file
  output to ignored `test-results/crpm-world/` JSON files.
- `evaluation/schemas.ts` defines the strict, digest-bound historical-pressure
  declaration, seven false-closure detections, maturity assessment, and
  evaluation bundle.
- `evaluation/evaluate.ts` renders the v2 witness-linked qualitative profile,
  keeps scalar probes in the bundle beside rather than inside that profile,
  and applies source-bound M1/M2 gates without accepting caller-authored pass,
  re-entry, owner-decision, M3, or product-authority assertions.

The core records are `WorldCarrierReference`, `WorldCutDefinition`,
`PortContract`, `WorldTransitionEdge`, `TransitionWitness`, `ResidualLedger`,
`WorldObligation`, `ReturnAssessment`, `VoyageTrace`, `ProjectionTransportAssessment`,
`DiagnosticProfile`, `WorldDesignRequest`, and `WorldDesignResult`. Carrier
maturity and product authority remain separate enums.

Carrier continuation and finite exact return include schema/profile identity.
Cross-profile transport requires an explicit `carrier-profile-migration` edge.
Edges, fixed frames, voyage cut changes, composition bridges, return rows, and
evaluation frames use versioned cut references; matching cut names with
different versions do not compose.

## Deterministic artifact rules

The sealed executable envelope uses profile, adapter, request, cut, and
evaluation version 2; result version 3; `VoyageTrace` version 4; and
`ResidualLedger` and `WorldObligation` version 2. Pre-sealing v1/v2 results and
v1 request/profile/adapter/cut
records are unsupported pre-release artifacts and are rejected by the current
closed registry. Lower-level stable seed records that still say
`schemaVersion: 1` retain their narrow original meaning; they are not alternate
v1 design-port envelopes. `WorldTransitionEdge` v2 requires explicit
context/action/response/evidence/support/return bindings, and
`ProjectionTransportAssessment` v2 requires complete observed target rows and
explicit alias witnesses. Canonicalization:

- sorts object keys lexicographically at every depth;
- preserves array order;
- never mutates caller data;
- rejects `NaN`, infinities, negative zero, unsafe integers, `undefined`,
  `bigint`, functions, symbols, sparse arrays, cycles, accessors, non-plain
  objects, and prototype-sensitive keys; and
- rejects conventional wall-clock artifact keys such as `createdAt`,
  `generatedAt`, `timestamp`, and `now`.

Current wall-clock values therefore cannot enter a canonical request or result.
Simulation ticks, revisions, bounded seeds, and declared expiry/discharge
conditions remain explicit deterministic fields instead.

`buildWorldDesignRequest` and `buildWorldDesignResult` compute their digest over
the strict payload before adding `requestDigest` or `resultDigest`; the digest
field is not self-referential. Parsing rejects a mismatched digest.

`parseRegisteredWorldDesignRequest` additionally checks the request's adapter,
ruleset/configuration, and cut against the supplied strict `PortContract`
catalog. The core package intentionally has no ambient global registry and no
runtime registration or activation path. Contract tests use a local synthetic
catalog only.

## Simulation authority adapter

The adapter is source-locked to Worms_Port gate base
`0ca98ac32f9f7a265888ae342a3f3254269d61d9` and
`shared/simulation.ts` blob `c9279c6f3b5d708ad0e54d32d2dca6d97234b4c0`.
It performs no shared, protocol, replay, client, or server mutation.

Each invocation returns the exact `SimulationTransition` alongside canonical
pre/post state JSON and digests, an ordered-event digest, a v2
`WorldTransitionEdge`, a `TransitionWitness`, and deterministic edge/witness
digests. The edge response retains exact authoritative events and result flags
but references the full states through authority carrier digests, so packed
terrain words are not flattened into the human-readable residual ledger.
Rejected commands use `rejected_command` plus a rejected-witness edge kind;
they are not represented as successful state edges. Domain motifs never imply
a CRPM cut-effect interpretation.

Exact authority-adapter parity is carried only as authority-derived witness and
support provenance. Every current edge, result, and evaluation retains
`productAuthority: none`; parity creates no ruleset, production activation,
gameplay authority, replay parity, or balance claim.

## Cut registry and quotient transport

The closed registry contains:

- `authority_v4`, a complete canonical-state digest reference bounded to the
  declared V4 authority domain;
- `authority_historical_v1_v4`, a source-referenced V1-through-V4 parity
  carrier for the registered historical seed;
- `thin_visible_duel_v0`, an intentionally incomplete destructive control;
- `bounded_command_support_v1`, a movement-only support cut;
- `replay_v4`, a declared-transcript replay support cut; and
- `world_design_v0`, an offline evidence/identity cut with no live mutation
  channel.
- `d2a_tactical_recurrence_v1`, the source-bound analytical pressure cut for
  the five registered historical D2A cases.

Every cut declares its scenario and action domain, protected family, included
support, forgotten distinctions, excluded claims, and continuation strength.
Projection functions clone caller data before use and bind class keys to the
cut ID/version plus projected content.
Ordinary V4 command edges remain on the registered authority cut. Projection
to a thin/player-public or repaired readout is emitted as its own
`authority-cut-projection` edge with an authority re-entry reference.

`assessQuotientTransport` groups a supplied finite domain by source projection,
advances detached full items, records observed target classes, and emits one
explicit witness pair for every source class that splits. Any split recommends
`relation_or_kernel`; a clean finite sample recommends `map` only while retaining
an explicit warning that the sample does not prove transport over an undeclared
world.

The destructive-control fixture uses the V4 seed `0xC0FFEE11`. States after one
and four position-returning right/left movement cycles have the same active
actor, positions, and Stitching, but movement budgets 48 and 0. The same right
move is therefore accepted versus rejected. The thin cut aliases those states;
the movement-support cut distinguishes them. This is not state return,
recurrence, or global carrier completeness.

## Voyage composition and return

Two edges compose only when carrier state/support references, revision and turn
ordering, ruleset/adapter identity, cut transitions, ports, forbidden-port
policy, obligations, and residue all remain compatible. Context ports may carry
forward after their carrier/frame checks pass; command/action ports must be
listed as externally supplied rather than silently produced by the prior edge.
Failure returns a structured composition witness plus the valid prefix and
attempted edge.

`VoyageTrace` version 4 records ordered accepted, rejected, and incompatible
attempts; command history; explicit cut changes; edge and v2 composition witnesses;
initial obligations; derived residue and obligation history; final carrier;
terminal status; exclusions; and re-entry instructions. Pre-sealing voyage v1/v2
and reduced-composition v3 records are unsupported by the sealed result schema.
Every trace carries a versioned composition contract with declared external
inputs, forbidden ports, and cut-bridge policy. Validation recomputes first-edge
admission and every later edge boundary through the same pure compatibility
function used by `composeEdges`, checks exact edge digests and witness issues,
and admits only v2 edges with explicit port bindings. Rejected attempts are
part of the compatible transition path only when their carrier remains
unchanged. Incompatible attempts remain visible but do not advance that path.

The return kernel always reports six independent rows:
`visible_equal`, `protected_equivalent`, `recursive_carrier_return`,
`invariant_region_return`, `finite_exact_return`, and `route_mismatch`.
Visible, recursive-key, exact-carrier, and paired-route comparisons execute
directly. Protected equivalence and invariant-region classification also
execute when a caller supplies a declared decoder or region-membership result;
this gate does not invent domain-specific decoders or invariant predicates.
Recurrence keys are caller-supplied under a named cut/domain, so elapsed turn,
tick, and revision fields are never removed globally.

`WorldObligation` is separate from those return rows. Version 2 uses a
discriminated `edge` or `initial_carrier` origin, scenario/voyage/origin-scoped
unique IDs, and type-specific owner, bearer, beneficiary, originator, eligible
responder, legal-response, expiry, and discharge semantics. The closed types
cover Spoolburst preparation, Spun Cocoon, Opening Weave, Frayed Seam, Seam Pin,
and Brace. Every opened, carried, unresolved, discharged, or expired id in a
result must resolve to one such record and a valid origin/support carrier.
Expiration is an explicit closure distinct from discharge. Canonical derivation
rejects closure before opening, carrying after closure, simultaneous discharge
and expiration, or a compatible edge that neither carries nor closes a live
obligation.

## D2A analytical exporter

The closed export registry contains only the existing F2, F3, F4, H2, and H3
configuration files at schema versions 8, 9, 11, 13, and 14. Every export
reruns the unchanged public `run_starting_distance_sweep` function over 448,
512, 576, 640, and 704, then rejects any whole-report digest drift before
rendering evidence. No tactical-model function, policy, action generator,
transition, opening search, recurrence rule, aggregate, or candidate status is
reimplemented by the adapter.

The emitted result keeps one covariance group for the shared model/policy/
scenario family. It includes compact action voyages for F2's exact
prepare/Unweave recurrence, F3's 64-unit Threadback and 64 Escape-Slack residue,
and H3's opening/partial-response/intervening-action/later-counter order. The
H3 residual ledger starts from an initial-carrier Opening Weave obligation,
opens a scenario/voyage/edge-scoped Frayed Seam obligation, carries it across
the intervening edge, records its later discharge, and then opens the resulting
Seam Pin obligation, so voyage compatibility cannot hide delayed-response
support. F2 exposes preparation and Spun Cocoon support obligations while its
recurrence remains a separate `ReturnAssessment`, not a gameplay-support
obligation. F4 and H2 remain digest-bound aggregate diagnostics
rather than checked-in copies of all 250 traces. The exporter records
`productAuthority: none`; exact analytical
re-entry is not simulation parity, empirical evidence, candidate approval, or
gameplay activation.
The standalone request digest binds the tactical cut id/version, profile,
protected-family digest, every requested config/schema/report identity, seed,
distance set, and output mode. Both standalone and design-port results preserve
the exact execution chain `d2a_tactical@2 -> d2a_analytical_export@2`; consuming
the Python result no longer erases the exporter stage.

The module writes no file by default. Its stdout is deterministic JSON, and
callers may place transient output only under ignored test-results paths:

```powershell
python -m analysis.crpm_world.adapters.d2a_export
npm run test:d2a-adapter
```

### Registered pressure cases

| Case | Bound result | Blocked promotion |
| --- | --- | --- |
| F2 | Exact prepare-Spoolburst/Unweave nonterminal `tactical_state_key` recurrence; 20 recurrence-bearing/turn-limit matches | Recursive-carrier return is negative evidence, not a harmless loop or convergence proof |
| F3 | Threadback moves 64 units and spends 64 Escape Slack, breaking the selected F2 carrier; 68.8% first-actor rate remains | Recurrence repair is not initiative balance |
| F4 | No bounded opening, recurrence, or turn-limit result in the 250-match sweep; 63.2% aggregate and 80% at distance 704 | Structural reference is not initiative repair or production approval |
| H2 | 48.8% aggregate with 44/40/44/40/76% distance bands | Aggregate parity cannot hide the distance-conditioned port split |
| H3 | Later Frayed Seam counter follows a partial response and intervening normal action; forced openings remain at 448/512/576 and aggregate is 63.2% | Delayed counterplay cannot repair an already completed forced edge |

The bound whole-report SHA-256 digests are respectively
`6a2ac3a1b8bc13c299ebf20a926eb5af0ac5e3fb057a841febc2f13fcb5ffbea`,
`9f5cd9574cc88fb2e885b631a7f9119a105ccdeb323eae1b1f0299e989a30332`,
`414e42735e97717f36b7583ffa80cb8130bf812259d598084416c4fd192247a6`,
`f47fa00f6731254c62a115214e370ebdc363429499b9d2891b1c3cf0c0bc705c`,
and `4f148ce8ec2d50598ca7638b9cd74c820eb3cb3b7b2934a09867df51f2745d14`.
These cases share one deterministic harness and related policy/domain
assumptions; five reports are not five independent experiments.

## Offline World Design Port

The offline port is an analysis CLI/library boundary. It is not a UI, server
route, Socket.IO event, network endpoint, protocol message, or production
simulation API. Its registry admits only `v4_authority@2` and
`d2a_tactical@2`. Requests are declarative strict JSON: no request field can
select a module path, shell command, script, callback, `eval`, or executable
operator.

The V4 executor creates the registered V4 baseline, wraps every declared
command through `adaptSimulationCommand`, composes a voyage, and emits bounded
analysis-side replay/re-entry and authority-cut projection evidence. The D2A
executor invokes only `python -m analysis.crpm_world.adapters.d2a_export` with
a registry-derived F2/F3/F4/H2/H3 case id, then validates and rebinds its strict
`WorldDesignResult`; user input never supplies the executable, module, config
path, or command line.

This version registers exactly one seed (`3237998097`) for both reviewed
execution families and exactly one output-detail mode (`witnesses`). Requests
that declare extra or different seeds, `summary`, or `full` fail closed rather
than claiming execution or disclosure behavior the adapter did not perform.

Generated output defaults below the ignored `test-results/crpm-world/` root.
The writer rejects non-JSON output paths, every path outside that root, and
symbolic-link or junction traversal; request reads receive the same link check.
It therefore cannot redirect output onto a source, configuration, protocol,
reward, client, or server file. The two reviewed example requests can be run
with:

```powershell
npm run analyze:crpm-world -- --request analysis/crpm_world/examples/v4-transcript-request.json --output test-results/crpm-world/v4-transcript-result.json
npm run analyze:crpm-world -- --request analysis/crpm_world/examples/d2a-f3-pressure-request.json --output test-results/crpm-world/d2a-f3-pressure-result.json
```

An abridged, non-executable field map shows the deterministic request boundary;
use the checked example files above for complete input:

```json
{
  "schemaVersion": 2,
  "profileVersion": 2,
  "adapter": { "id": "v4_authority", "version": 2 },
  "baseline": { "kind": "ruleset", "id": "nimble-knots-artillery-v4", "version": 4, "calling": "wizard" },
  "scenarioDomain": { "schemaVersion": 1, "scenarioIds": ["v4-authority-c0ffee11"], "actionFamilies": ["move", "select_relic", "aim", "fire"], "policyFamilies": ["declared-command-sequence"], "seeds": [3237998097], "constraints": ["One reviewed transcript."] },
  "cut": { "id": "authority_v4", "version": 2 },
  "activation": "offline_only"
}
```

The complete request example also requires protected family, ordered sequence,
the registered `witnesses` output detail, the complete mandatory evidence-probe
family, optional displayed scalar probes, requested ports, and explicit
exclusions; unknown fields
fail closed. Results carry the canonical request digest, source locks, traces,
witnesses, projection/return evidence, the primary v2 diagnostic, retained
source diagnostics, residual ledger, blocked claims, maturity, authority,
covariance/deduplication identity, a closed Git-derived execution receipt, and
result digest. The receipt binds the exact implementation commit/tree, closed
25-path inventory (including `package.json`, `package-lock.json`, and the
analysis TypeScript configuration), per-file blobs, bundle digest, exact
adapter chain, profile/request/result versions, source locks, and request/result
digests. `verifyRegisteredExecutionReceipt` authenticates those values against
the committed machine-readable
`docs/evidence/wp-015d2b-implementation-lock.json`, the actual Git commit/tree/
blob graph, and the current same-repository authority/model/config blobs. A
self-consistent invented receipt therefore remains structural data and cannot
earn source-bound M2 evaluation.

Final reviewed example artifacts:

| Example | Request digest | Result digest |
| --- | --- | --- |
| V4 transcript | `2af351b11b8ca0e438035a3309f6b88b9d383cc9601f916f5ccacf7106209b36` | `6e19b56da202d4a6006289fd01db1ffe5412de48a312ffb1ee2b72b2a4856fb6` |
| D2A F3 pressure | `b1f2dcd40d6ae24495738499a7254a90372fc6af79276616f8b30f1d6460609d` | `65e25fbedf35fee738f479cf1ddc835b78991e87d7041bc156c6ef8e4337028d` |

Omit `--output` to use
`test-results/crpm-world/<request-id>-result.json`. Identical request content
produces identical request/result digests; object-key order is irrelevant and
command/policy list order remains meaningful.

## Evaluation lens

Every v2 diagnostic declares the evaluated transition, voyage, or candidate
design result; active frame and cut; admissible scenario scope; protected
family; and excluded claims. Its six axes use closed qualitative values with a
reason, digest-bearing witness references, visible residue, and references to
structured blocked claims:

- `pathPressure` distinguishes viable/mixed routes, forced-route pressure, and
  blocked continuation;
- `residueVisibility` keeps resource, position, status, damage, timing,
  authority, and unmodelled residue explicit;
- `localReorganization` distinguishes material reorganization from partial,
  delayed, or same-line continuation;
- `cutFidelity` records whether the conclusion remains within the declared
  terrain, aim, policy, distance, information, and authority boundary;
- `returnStrength` records deterministic re-entry support without inferring a
  stronger return class; and
- `closureRisk` blocks local coherence from becoming design landfall while
  distance, timing, support, policy, or authority residue remains.

The evaluator implements the named F2 recursive-return-versus-landfall, H2 aggregate-port-split, F3
recurrence-versus-balance, F4 structural-versus-initiative, H3 delayed-response,
V4 parity-versus-landfall, and rendered-trace-versus-full-relation rules. It
does not average axes or encode a general win-rate threshold. First-actor and
distance rates, forced openings, recurrence, turn limits, mean turns, action or
Relic frequency, resource use, and policy-pair results remain independent
scalar probes.
For V4, accepted, rejected, and mutated command counts and authoritative-event
count are re-derived from contained edge responses and compared as exact
id/value/unit/scope records. Altering a displayed value while retaining its id,
receipt, and result digest downgrades evaluation to M1 just as a D2A probe-bundle
mismatch does.

Maturity is source-bound and non-promotional. The current evaluator accepts only
registered historical pressure results, verifies exact source locks, report or
transition witnesses, the approved and Git-authenticated execution receipt,
versioned cut, full
protected family, and the complete mandatory evidence family. Each D2A case
also binds the canonical probe bundleâ€”probe ID, value, unit, and scopeâ€”by
SHA-256 before false-closure evaluation. The F2/F3/F4/H2/H3 bundle digests are
respectively `6ea65264f90d72a28c769c9d590fc3803e55f89e3c4e65d6822ae1b8264ad157`,
`88c789e1d7638fecb9ce9cdbe01d3329b9e9932870ac4fc3d310ab40086aa4c3`,
`5adbe24fb3235e666c02a672a6b8e9077e5543756f845d43ead55288174098bb`,
`4774532bf4cc31a957cb7ed986752f576c7bcdec63f33ec89aa72c34202b91cd`,
and `106d21390a4453faab5d25162eed3d77b8299b08edaef981a9700879240f6a21`.
It emits at most M2. Callers cannot supply pass,
re-entry, owner-decision, M3, or authority fields. All registered D2A cases
remain historical failures or structural pressure and V4 parity remains
wrapping evidence, so no M3 acceptance registration exists. A future owner
decision requires a separate closed, source-bound record and is not an input to
this evaluator.
Such a future governance record must bind repository, commit, path, digest,
ruleset id/version, scope, and decision identity in its own reviewed schema;
an arbitrary identifier is never sufficient.

## Re-entry instructions

For a V4 result:

1. Retain the exact receipt-bound implementation commit
   `ca7bce03f132da6344b9b46c1743d055f65cba07`, tree, per-file blobs, bundle
   digest, and direct-child machine lock for the adapter/profile code. Verify the recorded
   historical `shared/simulation.ts` source/blob identity at its separate
   authority lock without checking out that pre-adapter commit to run the port.
2. Recreate the registered ruleset, seed, and Calling with `createSimulation`.
3. Replay the exact ordered actor, expected-turn, and command declarations.
4. Compare accepted/mutated/error values, canonical post-state digest, ordered
   events/digest, revision, carrier references, and voyage path.
5. Reopen the result on any source-lock, adapter, digest, event-order, cut,
   domain, or authority mismatch.

For a D2A result:

1. Retain the exact receipt-bound implementation commit
   `ca7bce03f132da6344b9b46c1743d055f65cba07`, tree, per-file blobs, bundle
   digest, and direct-child machine lock for the exporter/profile code. Verify the exact
   model and registered config/schema blobs at their separate D2A source lock;
   that historical lock predates this adapter and is not the execution checkout.
2. Run `python -m analysis.crpm_world.adapters.d2a_export --case <f2|f3|f4|h2|h3>`.
3. Verify the registered whole-report digest before consuming compact evidence.
4. Validate stdout through `WorldDesignResultSchema`, then follow config,
   report, voyage, edge, witness, trace-index, covariance, and deduplication
   references back to the Python analytical carrier.
5. Reopen on config/schema/report drift, changed policy or model behavior,
   missing residue, widened domain, or any attempted authority promotion.

Generated files below `test-results/crpm-world/` are disposable derived
artifacts. Re-entry begins from committed request/config/source carriers, not
from treating generated JSON as new authority.

## Limitations and promotion boundary

- concrete production or candidate catalogs;
- formatted human reports or interactive tooling;
- player/live-ballistics evidence or a TypeScript rewrite of the tactical
  model; and
- any product-authority change above `none`.

Those require their separately named implementation gates. A common result
shape will not make V4 and D2A share authority or dynamics.

The completed package creates no V5, new gameplay mechanic, range-entry
commitment candidate, live defense/reaction, new player status, protocol/replay
field, reward change, Loomkeeper change, client UI, server route, runtime
endpoint, or asset change. It creates no graph-safe CRPM schema and makes no
claim that the tactical game is solved. Any gameplay promotion requires a
separate owner-reviewed package, versioned TypeScript ruleset decision, and the
applicable simulation/replay/protocol/runtime verification.

## Focused checks

```powershell
npm run check:crpm-world-types
npm run test:crpm-world
npm run test:crpm-world-design
npm run test:crpm-world-evaluation
```

The focused scripts are intentionally not part of broad `verify:full`. The
completed work-package evidence record and repository-level compliance/build
checks govern this analysis-only package.

## WP-015D2E I2 admission follow-on

WP-015D2B above remains a sealed historical-analysis carrier. Its registry,
schemas, implementation lock, CLI, F2/F3/F4/H2/H3 outputs, and example digests
are not changed to pretend I2 was part of that package.

The separately contracted WP-015D2E layer lives below
`analysis/crpm_world/admissions/i2/` and adds only the registered I2
spawn-pressure request. It binds:

- D2A schema-16 source commit
  `9da87c9aeec8d9d34cfbb2ff053f69e4cf035d40`;
- production spawn authority reference 640;
- analytical starts 511/512/513, 575/576/577, 639/640/641, and
  703/704/705;
- both first actors, both mirrors, all 25 ordered base-policy pairs, seed
  3237998097, and the existing 16-turn horizon;
- C4/F4/H2/I1/I2 report digests from WP-015D2D; and
- an excluded full-resource start-769 warning, where F4 records four and I2
  eight turn-limit results.

The Python adapter is
`analysis/crpm_world/adapters/d2e_i2_export.py`. It reruns the complete
registered comparator frame and emits reviewed compact evidence for three
separate movement-entry/response voyages at 641, 703, and 704 plus one
already-in-band Needlepoint control. The TypeScript admission layer validates
that evidence, emits explicit CRPM-world transition/voyage/residual/obligation
surfaces, and applies the non-scalar profile. No Python path is called by
production TypeScript.

The request example is
`analysis/crpm_world/examples/d2e-i2-spawn-pressure-request.json`. Because the
sealed D2B implementation surface includes `package.json`, D2E intentionally
does not add or change an npm script. After its two-commit implementation/evidence
seal, invoke it with:

```powershell
npx tsx scripts/run-crpm-world-design-i2.ts --request analysis/crpm_world/examples/d2e-i2-spawn-pressure-request.json --output test-results/crpm-world/d2e-i2/i2-result.json
```

Before the implementation commit and direct-child approved lock exist, that
command fails closed before invoking Python. Working-tree contract checks use:

```powershell
python -m unittest analysis.crpm_world.adapters.tests.test_d2e_i2_export -v
node --import tsx --test tests/crpm-world/d2e-i2-admission.test.ts
npx tsc -p analysis/crpm_world/tsconfig.json
```

Successful sealed execution ends at `M2_local_use`, analytical disposition
`structural_reference`, and ProductAuthority `none`. It does not establish
global distance support, initiative fairness, player fun, V5 approval, a
runtime ruleset, or product landfall.
