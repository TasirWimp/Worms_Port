# CRPM Game-World Contracts

`analysis/crpm_world` is the analysis-only WP-015D2B contract layer. It defines
strict, versioned JSON records for the bounded Worms_Port Game-World Profile and
offline World Design Port. It includes one read-only simulation-authority
adapter, but it is not a server, gameplay system, or candidate implementation.

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

## Files

- `canonical.ts` validates deterministic JSON, deep-copies object content in
  sorted-key order, serializes canonical JSON, and produces lowercase SHA-256
  content digests.
- `schemas.ts` contains the strict versioned Zod contracts, digest builders,
  and closed catalog validation for design requests.
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
- `cuts/v4-cuts.ts` defines five bounded V4/offline cut declarations, while
  `cuts/registry.ts` exposes detached copies from a closed versioned registry.
- `kernel/project-cut.ts` provides non-mutating generic projection plus V4
  authority, thin-visible, and movement-support projections.
- `kernel/assess-quotient-transport.ts` implements the small finite-sample
  quotient-transport check independently in TypeScript. CRPM
  `emergence_lab_crpm/observer.py` is a read-only method reference only.
- `kernel/compose-edges.ts`, `residual-ledger.ts`, and `trace-voyage.ts`
  compose witnessed paths without discarding rejected or incompatible attempts,
  accumulate residue/obligations, and support deterministic authority re-entry.
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
- `evaluation/schemas.ts` defines the strict, digest-bound evaluation
  declaration, six false-closure detections, maturity assessment, and
  evaluation bundle.
- `evaluation/evaluate.ts` renders the v2 witness-linked qualitative profile,
  keeps scalar probes in the bundle beside rather than inside that profile,
  and applies deterministic M0 through M3 gates without inventing a balance
  threshold.

The core records are `WorldCarrierReference`, `WorldCutDefinition`,
`PortContract`, `WorldTransitionEdge`, `TransitionWitness`, `ResidualLedger`,
`ReturnObligation`, `VoyageTrace`, `ProjectionTransportAssessment`,
`DiagnosticProfile`, `WorldDesignRequest`, and `WorldDesignResult`. Carrier
maturity and product authority remain separate enums.

## Deterministic artifact rules

Top-level seed contracts use `schemaVersion: 1`, reject unknown fields, and are
JSON-serializable. `DiagnosticProfile` retains its source-compatible v1 shape
and adds v2 for the primary structured qualitative evaluation; scalar probes
are deliberately absent from v2 and remain a separate evaluation-bundle field.
`WorldTransitionEdge` retains its accepted v1 shape and adds
v2 for mandatory explicit context/action/response/evidence/support/return port
bindings; the authority adapter emits v2. `ProjectionTransportAssessment`
retains its accepted v1 shape and adds v2 so every aliased source class carries
an observed target-class row and one explicit left/right witness pair. The
quotient checker emits v2. Canonicalization:

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

An emitted edge may carry `authority-adapter-parity`, meaning only a checked
relationship to the existing authority result. It creates no ruleset,
production activation, gameplay authority, replay parity, or balance claim.

## Cut registry and quotient transport

The closed registry contains:

- `authority_v4`, a complete canonical-state digest reference bounded to the
  declared V4 authority domain;
- `thin_visible_duel_v0`, an intentionally incomplete destructive control;
- `bounded_command_support_v1`, a movement-only support cut;
- `replay_v4`, a declared-transcript replay support cut; and
- `world_design_v0`, an offline evidence/identity cut with no live mutation
  channel.

Every cut declares its scenario and action domain, protected family, included
support, forgotten distinctions, excluded claims, and continuation strength.
Projection functions clone caller data before use and bind class keys to the
cut ID/version plus projected content.

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

`VoyageTrace` retains its accepted v1 shape and adds v2 for ordered accepted,
rejected, and incompatible attempts; command history; explicit cut changes;
edge and composition witnesses; residual and obligation history; final carrier;
terminal status; exclusions; and re-entry instructions. Rejected attempts are
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
and H3's opening/partial-response/intervening-action/later-counter order. F4 and
H2 remain digest-bound aggregate diagnostics rather than checked-in copies of
all 250 traces. The exporter records `productAuthority: none`; exact analytical
re-entry is not simulation parity, empirical evidence, candidate approval, or
gameplay activation.

The module writes no file by default. Its stdout is deterministic JSON, and
callers may place transient output only under ignored test-results paths:

```powershell
python -m analysis.crpm_world.adapters.d2a_export
npm run test:d2a-adapter
```

## Offline World Design Port

The offline port is an analysis CLI/library boundary. It is not a UI, server
route, Socket.IO event, network endpoint, protocol message, or production
simulation API. Its registry admits only `v4_authority@1` and
`d2a_tactical@1`. Requests are declarative strict JSON: no request field can
select a module path, shell command, script, callback, `eval`, or executable
operator.

The V4 executor creates the registered V4 baseline, wraps every declared
command through `adaptSimulationCommand`, composes a voyage, and emits bounded
analysis-side replay/re-entry and authority-cut projection evidence. The D2A
executor invokes only `python -m analysis.crpm_world.adapters.d2a_export` with
a registry-derived F2/F3/F4/H2/H3 case id, then validates and rebinds its strict
`WorldDesignResult`; user input never supplies the executable, module, config
path, or command line.

Generated output defaults below the ignored `test-results/crpm-world/` root.
The writer rejects non-JSON output paths and every path outside that root, so
it cannot overwrite a source, configuration, protocol, reward, client, or
server file. The two reviewed example requests can be run with:

```powershell
npm run analyze:crpm-world -- --request analysis/crpm_world/examples/v4-transcript-request.json --output test-results/crpm-world/v4-transcript-result.json
npm run analyze:crpm-world -- --request analysis/crpm_world/examples/d2a-f3-pressure-request.json --output test-results/crpm-world/d2a-f3-pressure-result.json
```

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

The evaluator implements the named H2 aggregate-port-split, F3
recurrence-versus-balance, F4 structural-versus-initiative, H3 delayed-response,
V4 parity-versus-landfall, and rendered-trace-versus-full-relation rules. It
does not average axes or encode a general win-rate threshold. First-actor and
distance rates, forced openings, recurrence, turn limits, mean turns, action or
Relic frequency, resource use, and policy-pair results remain independent
scalar probes.

Maturity is deterministic but non-promotional: M0 requires coherent output,
M1 the declared cut/family/domain/witness/residue/return package, M2 passing
bounded execution, and M3 re-enterable success across every declared acceptance
pressure case with no active false closure. Even M3 returns
`productAuthority: none` unless a separate owner-approved versioned-ruleset
decision reference is supplied.

## Deliberately deferred

- concrete production or candidate catalogs;
- formatted human reports or interactive tooling;
- player/live-ballistics evidence or a TypeScript rewrite of the tactical
  model; and
- any product-authority change above bounded `authority-adapter-parity`.

Those require their separately named implementation gates. A common result
shape will not make V4 and D2A share authority or dynamics.

## Focused checks

```powershell
npm run check:crpm-world-types
npm run test:crpm-world
npm run test:crpm-world-design
npm run test:crpm-world-evaluation
```

The focused scripts are intentionally not part of `verify:full` at this seed
gate. The work-package evidence record and repository-level compliance/build
checks still govern completion of the implementation slice.
