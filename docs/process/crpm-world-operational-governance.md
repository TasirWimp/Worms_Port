# CRPM World Operational Governance

Status: active Worms_Port process, version 1.

Scope: analysis-only operation of `analysis/crpm_world` and admission of later
gameplay-world hypotheses.

Current executable ceiling: `M2_local_use`; `ProductAuthority: none`.

## Purpose

This document governs how Worms_Port uses the completed WP-015D2B Game-World
Profile and offline World Design Port. It covers two different operations:

1. reproducing and comparing evidence that the closed D2B registry already
   admits; and
2. admitting a new tactical hypothesis through a separately versioned analysis
   package.

The second operation is not an arbitrary request to the existing port. D2B is a
sealed historical-analysis carrier. A new candidate must declare its change,
domain, cuts, witnesses, falsifiers, implementation impact, and promotion
boundary before any registry or model change.

This is a Worms_Port L4+ application of source-locked CRPM methods. It is not a
universal CRPM operating doctrine, graph-safe schema, scientific method, or
claim that the tactical game is solved.

## Authority order

When two surfaces conflict, use this order:

1. The project owner supplies gameplay meaning, scope, value judgment, and any
   product-promotion decision.
2. `shared/simulation.ts` is the sole deterministic production gameplay and
   historical replay authority.
3. `analysis/tactical_model/model.py` is the authority only for its declared
   abstract tactical model and its deterministic analytical reports.
4. The D2B contracts validate, transport, compare, and evaluate bounded
   evidence. They do not create gameplay truth or authority.
5. CRPM supplies methodological source material only. It supplies no Worms
   state ontology, game evidence, balance threshold, or product decision.

The assistant may map alternatives, implement an owner-bounded analysis
candidate, and compile evidence. It must not silently substitute for owner
meaning or promotion authority. A result requiring a new gameplay meaning or a
choice between materially different mechanics stops for owner direction.

## Protected family

Every operation under this process preserves all of the following unless a
separate owner-approved package explicitly changes the relevant member:

- unchanged V1-V4 production state, command results, event ordering, replay
  semantics, and protocol behavior;
- `shared/simulation.ts` as the only production gameplay authority;
- no dependency from `shared/`, `client/`, or `server/` into `analysis/`;
- exact Worms_Port and CRPM source lineage, including config, model, adapter,
  cut, scenario, policy, seed, trace, and report identities;
- the analytical-only status and recorded outcome of every historical D2A
  candidate;
- explicit protected, forgotten, newly visible, residual, return, and reopening
  surfaces for every claimed transition;
- separation of recurrence, continuation congruence, visible equality,
  protected equivalence, invariant membership, finite exact return, and route
  mismatch; and
- separation of carrier maturity, analytical disposition, owner review,
  ruleset approval, and production activation.

## Operational lanes

Classify the request before editing. If a request fits more than one lane, use
the highest-numbered lane. An unclassified request fails closed into Lane 4.

| Lane | Operation | What it may change | Required decision |
| --- | --- | --- | --- |
| 0 - registered observation | Re-run a registered V4 transcript or F2/F3/F4/H2/H3 case | Ignored output below `test-results/crpm-world/` only | None beyond the declared registered request |
| 1 - analytical candidate | Add a config, policy, action, state, response, scenario, or comparator inside the D2A abstraction | Tactical-model/config/test and a new versioned design-port admission layer | Owner accepts the candidate contract before implementation |
| 2 - profile/tooling migration | Change schemas, cuts, adapters, canonicalization, evaluation rules, registries, or evidence envelopes | `analysis/crpm_world`, focused tests, locks, docs, and evidence | Owner accepts the migration and its backward-compatibility policy |
| 3 - product proposal | Translate an accepted analytical result into a versioned TypeScript ruleset proposal | A separate future production work package only | Separate owner-reviewed ruleset decision; D2B cannot perform it |
| 4 - external-scope escalation | Add live terrain, aim, ballistics, splash, hidden information, player skill, networking, rewards, UI, assets, or another authority | Outside this process until separately contracted | Stop and route to the owning production/research work package |

Lane 0 never widens its request. Lane 1 never edits production authority. Lane
2 never smuggles in a candidate. Lane 3 never treats analysis acceptance as
activation. Lane 4 never gets approximated silently inside D2A.

## Candidate lifecycle

The candidate lifecycle and ProductAuthority are orthogonal. A candidate may
finish its analytical lifecycle while ProductAuthority remains `none`.

### Lifecycle states

| State | Meaning | Permitted next state |
| --- | --- | --- |
| `proposed` | A gameplay-world question exists, but semantics or scope may still be open | `contracted`, `withdrawn` |
| `contracted` | Parent, hypothesis, domain, protected family, change class, falsifiers, and implementation impact are frozen | `implemented`, `withdrawn` |
| `implemented` | Analysis code/config exists and the parent regression is unchanged | `registered`, `reopened` |
| `registered` | Exact IDs, versions, cuts, source locks, probes, and request domain are fail-closed in the new port layer | `executed`, `reopened` |
| `executed` | Deterministic evidence and re-entry records exist for the complete declared domain | `evaluated`, `reopened` |
| `evaluated` | The non-scalar profile, scalar probes, false-closure checks, and acceptance cases have run | one terminal analytical disposition |
| `rejected` | The candidate failed a declared gate; its evidence remains historical and immutable | a new child candidate only |
| `structural_reference` | Some protected structural target passed, but important residue blocks broader acceptance | a new child candidate or separate owner review |
| `accepted_for_analysis` | The candidate passed the declared analytical scope and may become a comparator | separate Lane 3 proposal or further analysis |
| `residualized` | The question remains useful but the present model/cut cannot decide it | narrowed contract, repaired cut, or Lane 4 escalation |
| `withdrawn` | The owner closes the proposal without an evidentiary result | a new proposal if later reopened |

No state may be skipped in the durable record. A failed or rejected candidate is
never edited in place to make it pass. Create a child candidate with a new ID,
version, and parent relationship.

These lifecycle labels are Worms_Port process vocabulary, not fields already
implemented by the sealed D2B schemas. A follow-on executable admission schema
must version and validate them rather than treating this prose as runtime state.

### Product-authority path

The only permitted progression is:

```text
none
  -> owner-reviewed
    -> versioned-ruleset-approved
      -> production-active
```

Each arrow requires a separate, source-bound decision record. `M3`, adapter
parity, analytical acceptance, a clean report, or an attractive win rate cannot
advance this path. The current D2B evaluator emits at most `M2_local_use` and
ProductAuthority `none`.

## Operational gates

### Gate 0 - Orient and classify

Before an edit:

- check the Execution Pointer, Git branch/status, and recent commits;
- record the immutable parent candidate and comparators;
- classify the request into one operational lane and one or more change
  classes from the use-case matrix below;
- identify the cheapest discriminating failure test; and
- state whether the question is source-supported, Worms-specific
  interpretation, or still speculative.

Stop if the worktree contains overlapping user changes, a required source lock
cannot be recovered, or the requested operation crosses lanes without an
explicit package boundary.

### Gate 1 - Contract the candidate

Freeze a Candidate Admission Record before implementation. It must answer:

- What exact gameplay-world question is being tested?
- What parent and comparator set make the result interpretable?
- What changes, and what must remain unchanged?
- What scenario, distance, mirror, first-actor, policy-pair, action-family,
  seed, and horizon domain is admissible?
- Which cut is used at each edge, and which support makes continuation legal?
- Which distinctions are intentionally forgotten and therefore unavailable to
  later claims?
- What residue, obligations, return notions, and re-entry route remain?
- What result would falsify the hypothesis first?
- What structural gates and owner-defined judgment questions determine its
  analytical disposition?

No implementation begins while the candidate's meaning could still select
between materially different state transitions.

The record must mark each gameplay dimension as `unchanged`, `changed`,
`excluded`, or `unknown`: actors and turn ownership; initial state and world
geometry; action declaration and resolution order; movement and range;
Relics/damage/Stitching and terminal rules; resources, statuses, cooldowns, and
expiry; information and response windows; terrain/aim/trajectory/splash;
randomness and seed handling; policy/search behavior; persistence/replay and
networking; live AI/player control; and protocol/UI/reward/asset effects. An
`unknown` dimension that can alter the result blocks implementation or narrows
the admissible claim.

### Gate 2 - Declare implementation and version impact

List every expected changed path before editing. Apply the version rules below.
The sealed WP-015D2B evidence, implementation lock, historical report digests,
and historical candidate statuses are never rewritten to pretend that the new
candidate was part of D2B.

A follow-on package may reuse D2B code, but it must bind its own base commit,
current implementation paths/blobs, new registry versions, and new evidence.

### Gate 3 - Implement and preserve the parent

Implement only the contracted analytical delta. Before and after results for
the parent and every historical comparator must remain byte/digest identical
unless the contract explicitly classifies a bug and authorizes a historical
correction. A correction does not silently retain the old evidence claim; it
creates a migration record explaining the break.

New model state must appear in:

- immutable tactical state;
- legal action generation;
- transition application and expiry order;
- readable state snapshots;
- recurrence/support keys where continuation can depend on it;
- action traces and residual extraction;
- obligation open/carry/discharge/expiry accounting when rights persist; and
- focused tests for both use and non-use paths.

### Gate 4 - Register fail-closed execution

The design port accepts only compiled, named registrations. Register exact:

- candidate/config ID and schema version;
- source path and digest;
- adapter, cut, profile, request, result, voyage, obligation, and evaluation
  versions affected by the change;
- scenario IDs, policies, actions, seeds, mirrors, first actors, and horizons;
- mandatory probes and their units/scopes;
- parent/comparator report bindings; and
- output/detail modes actually implemented.

No dynamic module path, arbitrary Python, shell command, `eval`, dynamic import,
user-supplied operator, undeclared seed, or ignored request field is allowed.

### Gate 5 - Execute the whole declared domain

Run every registered domain member. Do not advertise a seed, policy, distance,
mirror, action, or output mode that execution ignores. Preserve rejected
attempts and incompatible edges without letting them advance the carrier.

Every output must be deterministic, canonical, digest-bound, confined to an
ignored output root unless deliberately reviewed as a compact fixture, and
re-enterable from committed sources rather than from a temporary file alone.

### Gate 6 - Evaluate without false closure

The primary surface is the structured `DiagnosticProfile` over path pressure,
residue visibility, local reorganization, cut fidelity, return strength, and
closure risk. Scalar probes remain separate observations.

Evaluation must cover:

- every predeclared structural hard gate;
- every boundary and negative-control scenario;
- parent and comparator results on the same domain;
- use rate and non-use behavior for every new mechanic;
- recurrence and all separately relevant return classes;
- obligation timing and response-window order;
- aggregate and per-port/per-distance splits;
- covariance and evidence deduplication; and
- all blocked claims.

There is no generic 45-55% balance threshold. The owner may judge an observed
profile only after the structural gates and false-closure checks remain visible.

### Gate 7 - Decide and close

Record exactly one analytical disposition: `rejected`,
`structural_reference`, `accepted_for_analysis`, `residualized`, or `withdrawn`.
The decision record must state what passed, what failed, what remains unknown,
which evidence is correlated, and the exact next permitted action.

Only a separate Lane 3 package may propose product promotion. That package must
reimplement the selected behavior in TypeScript authority, define replay and
protocol consequences, run production/browser/device verification appropriate
to its scope, and obtain the independent authority decisions above.

## Required operational records

Names and storage may follow the owning work package, but the following content
is mandatory.

### Candidate Admission Record

```text
record version
candidate id and version
lifecycle state
parent and comparator ids
one-sentence hypothesis
change classes and operational lane
Worms_Port base/source locks and CRPM method lock
authority and analysis source paths
protected family
fixed frame and admissible domain
source and target cuts
expected edge sequence and domain motifs
state/support fields and obligations
intentionally forgotten distinctions
residual and excluded claims
mandatory structural gates and scalar probes
cheapest falsifier
acceptance questions and no-automatic-threshold statement
evidence covariance/deduplication key
implementation/version impact
stop, reopen, and transfer-back conditions
ProductAuthority (must start at none)
```

### Execution Evidence Record

```text
request/result/profile/adapter/cut versions and digests
implementation commit/tree/path blobs
config/model/report digests
complete scenario/policy/seed manifest
edge, witness, carrier, voyage, residual, obligation, and return references
parent/comparator outputs on the same domain
non-scalar diagnostic profile and separate scalar probes
false-closure detections and blocked claims
test/check commands and results
skipped checks and reason
re-entry instructions
```

### Decision Record

```text
candidate and evidence digests reviewed
analytical disposition
passed and failed gates
owner judgments, if any
remaining residue and model limits
historical statuses preserved
ProductAuthority before and after
exact next permitted action
reopening triggers
```

Human prose may explain these records, but it cannot replace the deterministic
IDs, versions, digests, domain, and witness references.

## Version and source-lock rules

Use the narrowest sufficient version change, but never preserve a version when
the old identifier could decode to different meaning.

| Change | Minimum required impact |
| --- | --- |
| Numeric/config-only candidate using existing semantics | New config ID and schema-supported config; new registration and report/probe digests |
| New config field with no new state meaning | New config schema version and parser/test coverage; register exact source digest |
| New persistent state, right, resource, status, or expiry | New config schema version, model state/recurrence/snapshot changes, adapter residual/obligation support, and affected cut/version review |
| New action, action economy, or reaction order | Model/action trace changes, explicit edge sequence, policy coverage, adapter/version review, and new negative tests |
| New scenario, distance, policy, mirror, first actor, seed, or horizon | New scenario-domain registration and cut-domain review; rerun comparators on the identical expanded domain |
| Projection support added/removed | New cut version; rerun quotient transport and every dependent return/evaluation claim |
| Adapter output meaning or evidence envelope changes | New adapter/profile/result version and execution lock; migration tests for old artifacts |
| Evaluation rule or mandatory probe changes | New evaluation version and probe-bundle digest; prior decision remains historical |
| Refactor intended to be behavior-neutral | Same external version only if exact report/fixture/digest regression proves no semantic change; source lock still advances |
| Source lock, dependency, or security change | New implementation/source receipt and affected verification; do not rewrite old lock evidence |

Any historical artifact remains decoded under its original versions. A new
reader must never need the current working tree to guess old semantics.

## Domain, cut, and witness rules

### Domain construction

- Declare the full Cartesian scope actually executed: scenario, distance,
  mirror, first actor, policy pairing, action family, seed, and horizon.
- For a discrete legality or range boundary `b`, include `b-1`, `b`, and `b+1`
  whenever representable. If movement step `m` can create legality, also test
  the relevant pre-entry band around `b+m`.
- Include at least one negative control outside the hypothesized effect.
- Parent and comparators must run on the same domain; old aggregate rows are not
  comparable to a newly expanded boundary suite by themselves.
- Narrowing after failure creates a new declared scope; it does not erase the
  failed broader claim.

### Cut sufficiency

- A cut may be complete only for its exact carrier and declared action family.
- Every field that changes legal continuation belongs in support or visible
  residue: position, movement, range support, selected Relic, aim, terrain,
  health/Stitching, status, resource, expiry, actor, phase, policy, and any
  open obligation relevant to that domain.
- If two full states share one projected key but advance to different target
  keys, emit the explicit alias pair and classify the projection as
  `relation_or_kernel`.
- A repaired cut removes only the witnessed split over the rerun domain. It
  proves neither global completeness nor a unique/minimal carrier.

### Edge and voyage sufficiency

- A domain motif such as move, cast, or impact is not automatically a CRPM
  transition kind.
- Every edge declares fixed frame, local edge kind, source/target carrier and
  cuts, ports, command/declaration, response timing, protected/forgotten/newly
  visible distinctions, residue, witness, support, reversibility/reopening,
  path position, and ProductAuthority.
- A compound tactical action must be decomposed when the hypothesis concerns
  ordering inside it. For example, movement-created cast legality requires a
  pre-move carrier, post-entry carrier, response window, and later resolution;
  one opaque `move+cast` row is insufficient.
- Rejected attempts remain visible and do not mutate the composed carrier.
- Live obligations must be carried or explicitly discharged/expired on every
  subsequent compatible edge. A later counter cannot be projected backward as
  an immediate response.

## Evidence and evaluation rules

### Evidence identity and covariance

Deduplicate evidence by the strongest available tuple:

```text
source commit/blob
+ model/config version and digest
+ scenario/mirror/first actor
+ policy pairing
+ seed
+ trace or witness identity
+ cut/adapter/evaluation version
```

The following do not add independent empirical weight:

- rerunning or rerendering the same deterministic trace;
- viewing one result through multiple cuts or scalar probes;
- wrapping authority with an adapter;
- related F2/F3/F4/H2/H3 configurations sharing one model and policy family;
- multiple reviewers agreeing; or
- independently reimplementing a checker over the same source evidence.

These activities may improve verification or interpretation, but their
covariance group remains explicit. D2A is model evidence, not player-behavior,
live-ballistics, or empirical balance evidence.

### Mandatory false-closure checks

Reject or block any claim with one of these forms unless the missing evidence is
supplied:

1. aggregate parity masks a distance, policy, first-actor, or response-port
   split;
2. recurrence repair is claimed as initiative or balance repair;
3. structural success is claimed as initiative repair;
4. a delayed response is claimed as an immediate counter;
5. adapter parity is claimed as design landfall or gameplay quality;
6. a compact/rendered trace is claimed as the full relation;
7. a passing boundary sample is claimed as global continuation support;
8. one policy family is claimed as strategy robustness;
9. movement-created legality is hidden inside a single cast outcome;
10. parent and candidate aggregates are compared over different domains;
11. declared seeds, detail levels, or actions are ignored by execution;
12. a configured mechanic is called effective although policies never use it;
13. only successful actions are retained, hiding rejected or impossible
    responses;
14. low visible residue is caused by a cut omitting future-relevant support;
15. correlated cases, rows, reruns, adapters, or reviews are counted as
    independent confirmation; or
16. M2/M3, analytical acceptance, or owner review is treated as production
    activation.

## Gameplay use-case routing matrix

This matrix is deliberately broader than the first proposed candidate. A future
case not represented here uses Lane 4 until its authority and failure surface
are classified.

| Gameplay-world use case | Lane | Required operational treatment |
| --- | --- | --- |
| Re-run F2/F3/F4/H2/H3 or a registered V4 transcript | 0 | Exact registered request only; output is reproduction, not new evidence |
| Damage/range/resource value-only candidate | 1 | New config/registration; compare identical domain; preserve model/report regressions |
| Change spawn positions, world width, movement step, or other initial geometry inside D2A | 1 | New config/scenario domain; recompute every affected legality boundary and negative control |
| Add a new Relic or normal tactical action | 1 | New action/config identity, legal-action and policy coverage, trace/residual fields, action-frequency and dominance probes |
| Recombine previously rejected mechanics | 1 | New child ID; parents remain rejected; test interaction residue rather than adding parent claims |
| Add a new persistent status, right, reserve, or cooldown | 1 | State, recurrence key, snapshots, residual ledger, obligation lifecycle, expiry-order tests |
| Change action economy or split move from cast | 1 | Explicit intermediate carriers and edge order; policy and legal-action regression |
| Add pre-hit, post-hit, interrupt, or delayed reaction | 1 | Declare response owner, eligibility, information, cost, timing horizon, expiry, and same-horizon test |
| Add movement-created range entry/commitment | 1 | Boundary suite, before/after legality, entry edge, response edge, later resolution, use/expenditure probes |
| Change AI policy only | 1 | Keep rules/config fixed; new policy ID; full policy-pair matrix; no rule-quality inference from one policy |
| Change opening search, recurrence detection, policy tie-breaking, or analysis horizon | 1/2 | Classify model hypothesis versus measurement-tool change; version affected evidence semantics and rerun all comparators |
| Change analytical turn limit, terminal cause, draw, or overtime rule | 1/2 | Declare whether gameplay hypothesis or measurement boundary; preserve horizon residue and rerun recurrence/return classifications |
| Add a comparator such as C4 to the port | 1/2 | Register its unchanged historical config/report as correlated comparator evidence; do not change its status |
| Widen distances, mirrors, first actors, policies, seeds, or horizon | 1/2 | Version domain/cut registration and rerun every comparator on the identical widened domain |
| Add stochastic sampling or multiple seeds | 2 | Explicit deterministic seed manifest, execute every seed, define aggregation/covariance; never use hidden randomness |
| Discover projection aliasing | 2 | Emit alias witness, downgrade to relation/kernel, repair/version cut only if support is justified |
| Change recurrence or return definition | 2 | Version cut/key/evaluation; rerun historical cases; keep all return classes distinct |
| Add or change an adapter/data source | 2 | Closed registration, source lock, parity/transfer-back tests, provenance; no common-ontology inference |
| Behavior-neutral tactical-model refactor | 2 | Exact before/after report digests and trace fixtures; source receipt advances even when semantics do not |
| Correct a historical model bug | 2 | Explicit migration; preserve old evidence as superseded, not silently still valid |
| Add terrain, aim, trajectory, splash, precision, hidden information, or player skill | 4 | Stop: D2A excludes it. Contract a new bounded model or production-authority experiment |
| Add more than two actors, teams, simultaneous actions, real-time input, or PvP interaction | 4 | Stop: the present sequential two-actor perfect-information model cannot carry the claim |
| Propose V5/live gameplay | 3 | Separate TypeScript ruleset/replay/protocol package and owner decisions; never execute through D2B |
| Change protocol, replay ABI, client, server, reward, wallet, Loomkeeper, UI, or assets | 4 | Stop and route to the owning package with its own verification and compliance gates |
| Reject, retire, or narrow a candidate | 1 | Freeze result/status/digests; preserve negative evidence; create a child for any revision |
| Publish compact evidence or generated reports | 0/1/2 | Keep generated bulk ignored; check in only reviewed compact carriers with source/digest/re-entry links |
| Dependency/security/source-lock maintenance | 2 | New receipt, audit/compliance checks, unchanged semantic evidence proof; never falsify old source locks |
| Conflicting or inconclusive evidence | 1/2 | Mark `residualized`; preserve rival readings and define the cheapest next discriminating test |

## Worked pressure cases

### Range-entry commitment around 704

Status: I1 Phase A implemented and rejected on 2026-08-23; not an approved
mechanic. The candidate contract froze commitment as a direct-cast-only path
split with no new status, resource, or special response.

The current evidence licenses this question: F4 is the strongest structural
reference but retains 80% first-actor wins at distance 704, and the current
`move_and_cast` action generator can make a cast legal after moving in the same
action. It does not yet license a causal claim that range entry is the sole
source of the initiative split.

The bounded I1 child used:

- parent: F4;
- comparators: C4 for value structure, F4 for close-band structure, and H2 for
  aggregate-parity false-closure pressure;
- boundary distances: `511/512/513`, `575/576/577`, `639/640/641`, and
  `703/704/705`; `705` is the required first-action negative control omitted by
  the initial proposal, not a whole-match no-effect promise;
- both mirrors, both first actors, the registered policy family plus any new
  response policy, the exact deterministic seed set, and the same horizon for
  every comparator;
- explicit observed support: pre-move distance, post-move distance, relevant
  Relic range boundary, cast legality before/after movement, movement spent,
  actor, policy, response right/cost/expiry, and later cast legality; and
- separate edges for `outside_range -> entry/commitment`,
  `entry/commitment -> opponent response`, and
  `later in-band cast -> resolution`.

Mandatory probes include forced openings by distance, first-actor rate by
distance, recurrence, turn-limit results, Relic/action frequency, Escape-Slack
expenditure, movement-created cast-legality counts, response eligibility/use,
and routes that enter range but never resolve into a cast.

The candidate cannot be judged from the 704 aggregate alone. It must preserve
F4's structural result or explain the lost protected member, expose any new
recurrence/obligation residue, and demonstrate that an immediate response is
available at the entry edge rather than after the forced outcome. The owner
must predeclare the intended gameplay meaning and later judge the full profile;
no generic win-rate threshold supplies acceptance.

The candidate-only Phase A implementation added the strict D2A config/model,
full-orientation boundary report, transition annotations, and regression tests.
Its 1,200-match result has no forced opening or recurrence, but four 705
retreat-kite mirrors hit the turn limit and its 54.3% aggregate hides a
68%-to-32% boundary reversal. I1 is rejected under the predeclared hard and
false-closure gates.

The following World Design Port admission work was planned but is now blocked
for I1:

- add the candidate to the tactical model/config schema without editing V4;
- register C4 and the new candidate in a new D2A registry/cut/domain version;
- add the boundary scenarios beyond the currently sealed five-distance domain;
- update the D2A exporter to preserve the decomposed entry/response/resolution
  witnesses;
- version any result or obligation shape whose meaning changes;
- create a new implementation/source lock rather than altering D2B's sealed
  lock; and
- prove every existing D2A report digest remains unchanged.

The exact admission and result record is
`docs/planning/wp-015d2c-range-entry-commitment-candidate-contract.md`. Any
revision must be a new child candidate; the failed I1 domain is not narrowed or
tuned in place.

The separately contracted I2 child performs the smallest failure-derived
ablation: retain the movement-created Needlepoint hit and 30 damage, but
suppress only the Seam Pin/cooldown created when Needlepoint was out of range
before that movement. Its declared twelve-distance frame has 1,200 terminal
results, no forced opening/recurrence, 57 percent aggregate, and 56 percent at
641/703/704. Each target distance's 40 affected openings split 28/12 rather
than F4's 40/0 or I1's full-turn reversal.

That local coherence is not promoted. A broader diagnostic scan identifies a
starting-carrier/horizon boundary at 769: F4 already has four turn limits and
I2 has eight, including four new retreat-kite mirrors whose entry edge occurs
at turn 10. Legal coordinate distance is therefore not silently treated as an
admissible full-resource starting domain. I2 remains a bounded Phase A
structural survivor with the horizon residue carried forward; Phase B and
ProductAuthority remain unopened. The exact contract/result carrier is
`docs/planning/wp-015d2d-entry-seam-pin-candidate-contract.md`.

### Config-only value candidate

A pure damage/range/resource change may reuse the existing state and edge
shapes only if no legal-action, expiry, support, or recurrence meaning changes.
It still needs a new config ID, exact parent, complete same-domain comparator
rerun, mandatory boundary probes, and separate disposition. “Only JSON changed”
does not make it evidence-free or product-safe.

### Reaction-timing candidate

A response must declare whether it occurs before movement, after entry, before
cast declaration, before damage, after damage, or on a later normal turn. The
edge at which the right opens, its eligible responder, information available,
cost, expiry, and discharge must be explicit. H3 is the destructive control: a
later Frayed Seam counter cannot repair an already completed opening edge.

### Terrain or live-ballistics question

Terrain, aim, trajectory, splash, and player precision are deliberately absent
from D2A. If one is outcome-relevant, the correct result is not an invented
flat-world proxy presented as sufficient. Mark the D2A result residualized,
state the unmodelled port, and contract a new bounded authority-side experiment
or product work package.

### Product-promotion request

An `accepted_for_analysis` candidate remains data and a design option. Product
promotion starts from a new TypeScript ruleset contract that names replay,
protocol, UI, AI, reward, and compatibility consequences. It may reuse D2A
evidence as correlated design support, but must establish production behavior
through authoritative tests and the owner-decision chain.

## Stop and reopen rules

Stop immediately and preserve the valid prefix when any of these occurs:

- source/config/report/fixture/implementation-lock drift;
- an undeclared domain, seed, action, policy, output mode, or comparator;
- an edge lacks fixed frame, support, witness, residue, obligation, path, or
  reopening data;
- a support alias is found while the result still claims a deterministic map;
- a live obligation disappears without carry, discharge, or expiry;
- current readout, recursive carrier, invariant region, exact return, and route
  return are collapsed;
- historical candidate status or evidence is being rewritten in place;
- evidence covariance is counted as independent support;
- nondeterminism, wall-clock content, environment-dependent digesting, ignored
  request fields, or output-path escape appears;
- arbitrary execution, dynamic registration, or a reverse production import is
  introduced;
- a required conclusion depends on terrain, aim, ballistics, skill, network,
  UI, reward, or other excluded authority;
- M3, analytical acceptance, parity, or owner review is treated as production
  authority; or
- work would edit V1-V4 behavior, protocol, replay, client, server, reward,
  wallet, Loomkeeper, or assets without a separate authorized package.

Reopen only with a new record that names the trigger, retained valid evidence,
invalidated claim, revised scope/version, cheapest new falsifier, and exact
transfer-back route. Never repair a failure by deleting its witness, selecting
one representative from an alias class, or narrowing the domain without
recording the earlier failure.

## Operational commands and verification

For a registered Lane 0 request:

```powershell
npm run analyze:crpm-world -- --request analysis/crpm_world/examples/v4-transcript-request.json --output test-results/crpm-world/v4-transcript-result.json
npm run analyze:crpm-world -- --request analysis/crpm_world/examples/d2a-f3-pressure-request.json --output test-results/crpm-world/d2a-f3-pressure-result.json
npm run test:crpm-world
```

For a Lane 1 or Lane 2 package, run the complete tactical suite before and after
implementation, then at least:

```powershell
npm run test:crpm-world
npm run test:tactical-model
npm run test:simulation
npm run check:types
npm run check:compliance
npm run build
git diff --check
```

Run `npm audit` whenever package metadata or dependencies change. Browser and
device checks are not required for an analysis/documentation-only package, and
must be reported as skipped for that reason. They become required according to
repository policy when a later package changes runtime-facing gameplay or UI.

## Current operational boundary

As of the completed D2B package, the executable offline registry admits only:

- registered V1/V4 authority transcripts; and
- registered F2, F3, F4, H2, and H3 analytical pressure cases at distances
  448, 512, 576, 640, and 704 with the one registered pressure seed and
  witness-detail output.

C4, a new range-entry candidate, new boundary distances, new policy families,
and arbitrary candidate overlays are not currently admitted. The next safe use
for the range-entry question is therefore Gate 1: freeze a candidate admission
contract and its exact semantics, followed by a separately versioned Lane 1/2
implementation package. It is not to pass a novel request to the sealed D2B
CLI.

That range-entry sequence has now produced two separately bounded packages:
rejected I1 under WP-015D2C and the I2 structural survivor under WP-015D2D.
The owner has opened WP-015D2E as the Lane 2 admission package for I2 only.
D2E does not widen the sealed D2B CLI or registry. It uses profile-v3
`d2e_i2_world_design@1 -> d2e_i2_analytical_export@1`, the exact twelve D2D
pressure starts, seed 3237998097, both first actors/mirrors, all 25 ordered base
policy pairs, and the inherited 16-turn horizon. Production spawn authority
remains 640. Full-resource start 769 remains excluded from the request and is
mandatory blocking evidence. D2E execution remains unsealed until its
implementation commit is followed directly by the reviewed machine lock;
ProductAuthority remains `none` throughout.

## Source and claim status

Source-supported methodological constraints come from the two read-only CRPM
reference pins already recorded in `legal/source-manifest.json`:

- commit `995236df60924f790506cf5badec3c102abf3fd1` for bounded port/cut/edge,
  witness, voyage, re-entry, quotient-transport, return, and non-scalar
  evaluation methods; and
- commit `7eee60e1e5bfb5d46e975c6df36ec107f43cbb19` for the L4+
  transformation-admissibility and operating-layer governance references.

The operational lanes, lifecycle labels, version-impact table, gameplay
use-case matrix, and range-entry worked profile are Worms_Port interpretations.
The precise future range-entry mechanic remains speculative until the owner
accepts its Candidate Admission Record. No CRPM code is copied, vendored, or
executed, and neither source pin supplies game evidence.
