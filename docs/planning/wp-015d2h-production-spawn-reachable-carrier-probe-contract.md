# WP-015D2H Production-Spawn Reachable Carrier Probe Contract

Status: proposed for owner review on 2026-08-24; implementation is blocked
until this exact contract is accepted.

- **Operational lane:** Lane 2 observation-cut/tooling extension; no tactical
  candidate or policy change.
- **Parent navigation carrier:** completed WP-015D2G R1 direction.
- **Worms_Port base:** `d683515a6229d14b807d2bac06a3fe95481f4321`.
- **Working branch:** `codex/wp-015d2h-production-spawn-carrier-probe`.
- **CRPM method lock:** `053c6fc0a90ed48d8667016b18a1d10106a7a2bc`.
- **Execution Pointer:** remains WP-015D2A.
- **Maximum maturity:** bounded deterministic navigation evidence.
- **ProductAuthority:** `none`.

## Decision and question

The owner selected D2G direction R1: inspect route-reachable carriers around
the existing production spawn before changing another gameplay rule or
policy.

The bounded question is:

> Within the unchanged F4 and I2 distance-640 traces, which thin projections
> group together source carriers that have different declared actions or
> successors, and which currently available tactical support repairs those
> splits over the exact sampled domain?

This is a quotient-transport and re-entry probe, not a search for one root
cause. It may show that a projection is too thin, that policy identity explains
some splits, that resource/status/time support explains others, that the
sample contains no useful repeated carrier twins, or that D2A lacks the ports
needed for the next distinction. Every outcome is a valid navigational wake.

## Repository-specific adjustment

`analysis/tactical_model/model.py` is a deterministic Markov model. Once the
complete current `TacticalState`, config, acting/response policies, and action
support are fixed, earlier path history must not be promoted into an
additional hidden gameplay variable. The path prefix remains necessary for
provenance, re-entry, and explaining accumulated residue, but not as a causal
input to `choose_action` or `apply_action`.

The probe therefore distinguishes:

1. **current support**, which may determine the next transition;
2. **route provenance**, which recovers how that support was reached; and
3. **starting-distance summaries**, which are useful coordinates but are not
   support-complete continuation carriers.

A passing finite transport assessment also does not establish sufficiency when
every source class is a singleton. The result must report repeated-class and
singleton counts and classify an unexercised repaired cut separately from a
cut tested by actual support twins.

## Frozen source bindings

The probe consumes, without editing:

- F4 config schema 11 at
  `analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json`;
- I2 config schema 16 at
  `analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json`;
- F4 report digest
  `8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd`;
- I2 report digest
  `31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d`;
- WP-015D2F audit digest
  `476735407135b11f1d3805a7b7a4b22c5d7c8a46a1f6ac972f2d134fb3ff1657`;
- public `initial_state`, `simulate_match`, `legal_actions`, `choose_action`,
  `apply_action`, `action_key`, `tactical_state_snapshot`, and
  `tactical_state_key` behavior from `analysis/tactical_model/model.py`; and
- the frozen generic TypeScript `assessQuotientTransport` implementation and
  canonical helpers from the sealed WP-015D2B CRPM-world profile.

The complete F4/I2 reports must reproduce their expected digests before any
spawn-640 item is accepted. Existing D2B and D2E implementation locks remain
unchanged and authoritative for their own closed surfaces.

## Frozen finite domain

The first probe uses exactly:

- starting distance 640 only;
- F4 and I2 as separate, unchanged config carriers;
- seed 3237998097;
- the inherited 16-turn horizon;
- both first actors;
- both spatial mirrors;
- all 25 ordered pairs of `range_pressure`, `medium_hold`, `short_approach`,
  `retreat_kite`, and `best_response`; and
- every transition in the resulting 100 matches per config.

Adjacent starts, remote boundaries, candidate-only policies, altered action
selection, counterfactual cooldown retention, exhaustive legal state search,
randomized play, and alternate horizons are excluded. Expansion requires a
new chart revision triggered by this probe's wake.

## Carrier and transition extraction

Replay every selected report match from `initial_state` through the public
policy and transition functions. The replay must equal the existing report's
ordered action trace and terminal result.

Each source/target item must retain:

- config ID/schema/path and report digest;
- start, seed, horizon, first actor, mirror, and ordered policies;
- completed turn, active actor, and exact path-prefix digest;
- complete player and Loomkeeper `ActorState` fields, positions, separation,
  winner, and finish reason;
- sorted legal action keys at the source;
- acting policy and target reaction policy;
- selected action and the existing analytical trace step;
- exact pre/post tactical recurrence keys;
- canonical pre/post carrier digests;
- terminal/recurrence relation; and
- a stable item reference sufficient to replay the transition.

Caller objects must not be mutated. Arrays with semantic order remain ordered;
sets such as legal-action support are explicitly sorted. Digested content must
reject or avoid wall-clock values, output paths, unstable traversal, NaN,
Infinity, negative zero, and unsafe integers.

## Declared cuts

### `spawn640_visible_pressure_v0`

Retain only active actor, positions/current separation, and both Stitching
values. Intentionally forget config, policies, turn/horizon progress,
Escape Slack, Seam Pin/cooldown, preparation, Cocoon, and other active support.
It is a destructive control with a `relational` continuation claim.

### `spawn640_policy_visible_pressure_v1`

Retain the visible-pressure fields plus config identity and both declared
policies. Intentionally forget turn progress and tactical resource/status
support. This cut asks whether splits survive after the obvious policy/config
distinction is restored. It also has a `relational` continuation claim.

### `spawn640_bounded_tactical_support_v1`

Retain config identity, completed turns, active actor, the complete current
tactical state, both policies, and the sorted legal-action set. Protect the
selected action, exact one-step successor, terminal result, and explicit
resource/status residue for this finite domain. Its continuation claim is
`bounded`, never global or minimal.

### `spawn640_route_provenance_v0`

Retain match identity, ordered path prefix, source trace reference, and
pre/post carrier digests so every aliasing witness can be re-entered. It makes
no deterministic-continuation claim and must never substitute path identity
for current tactical support.

For transport assessment, the target projection includes the selected action,
exact successor carrier, and terminal/recurrence relation. Assessments run per
config as well as over the combined declared domain so config-dependent splits
cannot be mistaken for within-config hidden support.

## Planned implementation surface

Prefer new, parallel files so sealed D2B/D2E implementation paths remain
byte-identical:

- `analysis/tactical_model/reachable_carrier_probe.py`;
- `analysis/tactical_model/tests/test_reachable_carrier_probe.py`;
- `analysis/crpm_world/navigation/reachable-carrier-schemas.ts`;
- `analysis/crpm_world/navigation/assess-reachable-carriers.ts`;
- `scripts/run-reachable-carrier-probe.ts`; and
- `tests/crpm-world/reachable-carrier-probe.test.ts`.

The Python layer reconstructs and exports strict raw carrier/transition items.
The TypeScript layer validates those items, projects the declared cuts, calls
the existing generic quotient-transport assessor, classifies class coverage,
and emits the final navigation result. The fixed runner may invoke only
`python -m analysis.tactical_model.reachable_carrier_probe`; it may not accept
a module, config, operator, command, or import path from input.

No package dependency is needed. `package.json` and `package-lock.json` must
remain unchanged because they are part of the sealed D2B implementation
surface. Run the Python module and focused TypeScript test/runner directly.

The exact new filenames may change only if repository inspection exposes a
conflict and this contract is revised before implementation. Existing files in
the D2B or D2E implementation-lock path sets must not be edited.

## Required result

Emit strict versioned deterministic JSON below
`test-results/crpm-world/d2h-reachable-carriers/` containing:

1. source, config, report, model, cut, seed, horizon, and domain bindings;
2. total matches and transition items per config;
3. the four cut definitions and explicit exclusions;
4. source-class, repeated-class, singleton, and target-class counts;
5. deterministic-map eligibility and `map | relation_or_kernel` recommendation
   from the existing generic assessor;
6. every aliasing key and deterministic explicit left/right witness pair;
7. compact route references for representative aliases, never an unbound
   rendered summary;
8. a separate class-coverage status:
   `aliased | bounded_consistent_with_twins | unexercised_no_twins`;
9. accumulated residue categories and blocked claims;
10. an L4+ navigation wake:
    `advance | retain_and_refine | return | escalate_authority_cut` with
    witness-linked reasons;
11. ProductAuthority `none`; and
12. a canonical SHA-256 result digest excluding output path and wall clock.

The generated full carrier inventory remains ignored. A later evidence record
may retain only reviewed compact witnesses, counts, digests, commands, source
bindings, exclusions, and re-entry instructions.

## Acceptance and navigation rules

The implementation is correct only if:

- both historical reports reproduce exactly;
- all 200 match traces replay exactly through public model functions;
- every extracted transition has re-enterable pre/post carriers and path
  provenance;
- each declared cut is assessed over a non-empty exact domain;
- a thin-cut split yields explicit left/right witnesses rather than a scalar
  count alone;
- the bounded-support cut either exercises repeated twins consistently or is
  labeled `unexercised_no_twins`; singleton-only eligibility cannot be called
  cut sufficiency;
- unknown fields, configs, cuts, policies, domains, seeds, and output escapes
  fail closed; and
- repeated execution yields byte-identical canonical content and digest.

Navigation disposition is non-scalar:

- **advance** only if a compact, repeated, re-enterable support distinction
  survives more than one route and gives a bounded next observational question;
- **retain_and_refine** if useful aliases exist but policy/support distinctions
  remain entangled;
- **return** if the chart only restates individual traces or provides no
  exercised comparison class; or
- **escalate_authority_cut** if the distinguishing continuation depends on an
  excluded V4/player-facing port.

None of these outcomes approves a gameplay mechanic. Any later mechanic is a
new Lane 1 package with its own directional wager and owner-accepted contract.

## Stop gates and non-promotions

Stop and preserve the valid prefix if:

- a config, model, report, D2B lock, D2E lock, or historical digest drifts;
- carrier reconstruction requires changing `model.py` or a config;
- a projected equality is described as full-state equality;
- a finite pass is described as proof, minimal support, optimal play, balance,
  fun, or player behavior;
- path provenance is made an undeclared transition input;
- a result requires terrain, aim, trajectory, splash, execution, UI, replay,
  networking, reward, wallet, asset, or production authority; or
- arbitrary execution, dynamic import/registration, package changes, or a
  reverse production dependency appears.

This package must not create V5, a candidate rule, a policy, a status, a live
reaction, a spawn change, a protocol/replay field, a Loomkeeper behavior, UI,
reward/wallet behavior, asset, universal CRPM ontology, graph-safe schema, or
claim that the tactical game is solved.

## Verification gate

Before and after implementation run the unchanged complete tactical suite.
The final gate must include:

```powershell
python -m unittest analysis.tactical_model.tests.test_reachable_carrier_probe -v
node --import tsx --test tests/crpm-world/reachable-carrier-probe.test.ts
npm run test:crpm-world
npm run test:tactical-model
npm run test:simulation
npm run check:crpm-world-types
npm run check:types
npm run check:compliance
npm run build
git diff --check
```

Run `npm audit` only if package metadata changes; such a change is currently
blocked. Browser/device testing is not required because the package is
analysis-only and runtime-inert, and must be reported as skipped rather than
passed.

## Re-entry and owner gate

From a fresh session, follow `AGENTS.md`, inspect the Execution Pointer and Git
state, then read D2A, D2F, D2G, and this contract. Verify the two report digests,
the D2F audit digest, the D2B/D2E locks, and the CRPM method lock before
implementation.

The next permitted action is owner acceptance or revision of this exact
contract. Until then, do not create the planned analyzer, schemas, runner,
tests, result, evidence record, or gameplay candidate.
