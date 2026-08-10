# CRPM Game-World Contracts

`analysis/crpm_world` is the analysis-only WP-015D2B contract layer. It defines
strict, versioned JSON records for the bounded Worms_Port Game-World Profile and
offline World Design Port. It is not a server, gameplay system, adapter, or
candidate implementation.

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

The core records are `WorldCarrierReference`, `WorldCutDefinition`,
`PortContract`, `WorldTransitionEdge`, `TransitionWitness`, `ResidualLedger`,
`ReturnObligation`, `VoyageTrace`, `ProjectionTransportAssessment`,
`DiagnosticProfile`, `WorldDesignRequest`, and `WorldDesignResult`. Carrier
maturity and product authority remain separate enums.

## Deterministic artifact rules

All top-level contracts use `schemaVersion: 1`, reject unknown fields, and are
JSON-serializable. Canonicalization:

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
registered production adapter. Tests use a local synthetic catalog only.

## Deliberately deferred

- V4 authority adapter and bounded transition-parity fixtures;
- D2A analytical adapter and F2/F3/F4/H2/H3 reconstruction;
- concrete production or candidate catalogs;
- thin/repaired V4 projection assessments;
- voyage/report generation and the offline CLI; and
- any product-authority change above `none`.

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
