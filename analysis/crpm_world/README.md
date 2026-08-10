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
- `schemas.ts` contains the strict Zod v1 contracts, digest builders, and closed
  catalog validation for design requests.
- `types.ts` exports TypeScript types inferred from the Zod contracts so the
  runtime validator and compile-time surface cannot drift independently.
- `adapters/v4-authority-adapter.ts` clones and validates caller inputs, calls
  exported `applySimulationCommand` directly, returns its exact transition, and
  renders a compact authority-edge/witness projection for historical V1 through
  V4 states. Its name records the gate that introduced it; its adapter identity
  explicitly covers the versioned simulation authority rather than pretending
  V4 is the only historical ruleset.
- `cuts/v4-cuts.ts` defines five bounded V4/offline cut declarations, while
  `cuts/registry.ts` exposes detached copies from a closed versioned registry.
- `kernel/project-cut.ts` provides non-mutating generic projection plus V4
  authority, thin-visible, and movement-support projections.
- `kernel/assess-quotient-transport.ts` implements the small finite-sample
  quotient-transport check independently in TypeScript. CRPM
  `emergence_lab_crpm/observer.py` is a read-only method reference only.

The core records are `WorldCarrierReference`, `WorldCutDefinition`,
`PortContract`, `WorldTransitionEdge`, `TransitionWitness`, `ResidualLedger`,
`ReturnObligation`, `VoyageTrace`, `ProjectionTransportAssessment`,
`DiagnosticProfile`, `WorldDesignRequest`, and `WorldDesignResult`. Carrier
maturity and product authority remain separate enums.

## Deterministic artifact rules

Top-level seed contracts use `schemaVersion: 1`, reject unknown fields, and are
JSON-serializable. `WorldTransitionEdge` retains its accepted v1 shape and adds
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

## Deliberately deferred

- D2A analytical adapter and F2/F3/F4/H2/H3 reconstruction;
- concrete production or candidate catalogs;
- voyage/report generation and the offline CLI; and
- any product-authority change above bounded `authority-adapter-parity`.

Those require their separately named implementation gates. A common result
shape will not make V4 and D2A share authority or dynamics.

## Focused checks

```powershell
npm run check:crpm-world-types
npm run test:crpm-world
```

The focused scripts are intentionally not part of `verify:full` at this seed
gate. The work-package evidence record and repository-level compliance/build
checks still govern completion of the implementation slice.
