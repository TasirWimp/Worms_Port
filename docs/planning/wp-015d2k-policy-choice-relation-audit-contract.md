# WP-015D2K Mechanics-Fixed Policy-Choice Relation Audit Contract

Status: complete; mechanics-fixed relation retained and policy question
refined on 2026-08-24.

- **Operational lane:** Lane 2 observation/tooling extension. No candidate
  mechanic or policy change.
- **Navigation route:** D2G R2 policy-choice relation.
- **Parents:** completed WP-015D2I Cocoon voyage audit and withdrawn-before-
  contract WP-015D2J timing question.
- **Worms_Port base:**
  `5b6233a202f3a2fa8c06515d2c8f794736c77b02`.
- **Working branch:** `codex/wp-015d2k-policy-choice-relation-audit`.
- **CRPM method lock:**
  `053c6fc0a90ed48d8667016b18a1d10106a7a2bc` on clean `main`.
- **Execution Pointer:** remains WP-015D2A.
- **ProductAuthority:** `none`.

## Purpose and directional wager

D2I established that the responding/later preparer wins the exact
`short_approach` interleaving at spawn 640. D2J then showed that reversing
Cocoon priority only reverses the winner, while existing paid Unweave still
preserves a winning responder route. The result cannot distinguish a gameplay
defect from a fixed-policy selection artifact by changing mechanics again.

D2K therefore holds F4 mechanics fixed and asks:

> At every existing interleaved preparation response carrier around
> 639/640/641, what legal response support exists, what do the five policies
> select from the same full carrier, and how stable are the forced response
> voyages under the declared continuation-policy family?

The directional wager is bounded: restoring the complete response relation may
show whether a policy-selected action is locally dominated, one of several
meaningfully distinct routes, or inseparable from the limited continuation
model. No sole-cause or balance claim is required.

## Authority and change boundary

F4 remains the only gameplay home carrier:

`analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json`

The audit must not change:

- `analysis/tactical_model/model.py` or any tactical config;
- action generation, policy selection, transition/expiry order, search,
  recurrence, terminal, or report behavior;
- the sealed D2B or D2E design-port paths and locks;
- TypeScript production authority, V1-V4 behavior, protocol, replay, client,
  server, rewards, wallet, Loomkeeper, UI, assets, or package dependencies;
- any historical candidate disposition; or
- the CRPM checkout.

The permitted implementation is a strict Python export over public D2A
functions, a parallel TypeScript validation/assessment layer, a fixed offline
runner, focused tests, documentation, and evidence. Python must not be invoked
from production code.

## Source bindings

The implementation must fail closed on:

- Worms_Port base
  `5b6233a202f3a2fa8c06515d2c8f794736c77b02`;
- CRPM method commit
  `053c6fc0a90ed48d8667016b18a1d10106a7a2bc`;
- D2I result digest
  `ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0`;
- D2J documentation carrier and its `proposed -> withdrawn` disposition;
- unchanged tactical-model SHA-256
  `AF0B0EC8D9893E992BDC95123A915E24A2305EE2B9FFF32BCE95D27CDB4C8C08`;
- unchanged F4 config SHA-256
  `5E519B09EA5E5684185BCD527600705825BA75DF8F01E310ADB027D09D4F54E0`;
- F4 schema version 11, seed `3237998097`, and 16-turn horizon; and
- existing public model functions only, without copying model logic into
  TypeScript.

## Fixed domain

The complete domain is:

- F4 only;
- starting distances `639`, `640`, and `641`;
- first actor `player | loomkeeper`;
- mirrored `false | true` independently, producing four orientations per
  distance;
- baseline route policy `short_approach` versus `short_approach`;
- every nonterminal state on those routes where the active actor has no live
  Spoolburst preparation, the opponent has live preparation, and
  counter-preparation is legal;
- every legal action at each such response carrier, preserving direction and
  Relic identity;
- the five unchanged base policies evaluated as selectors over the same
  carrier; and
- every ordered pair of the same five base policies as a forced-action
  continuation context through the inherited terminal/recurrence horizon.

The exporter must discover response carriers from authoritative transitions;
it must not assume a fixed transition number or silently discard later low-
Stitching interleavings. Expected counts become hard locks only after the first
complete execution reconciles them to D2I.

No other distance, config, policy, seed, horizon, reaction, candidate overlay,
or arbitrary operator is admitted.

## Carrier, edge, and voyage records

Each response carrier must retain:

- distance, first actor, mirror, completed turn, active responder, original
  preparer, and preparation-cycle index;
- full tactical state and recurrence key;
- player/loomkeeper policies that generated the path;
- exact path prefix and digest;
- legal action list and digest;
- preparation, Cocoon, Stitching, Escape-Slack, position, Seam-Pin/cooldown,
  status, and terminal support; and
- a reversible carrier/path reference.

For each of the five policies, record its selected legal action from that exact
carrier. All five policies receive the same `TacticalState`; D2K must not invent
different observation ports merely because their heuristic priorities differ.

For every legal forced response under every declared continuation-policy pair,
record:

- immediate target carrier and explicit response residue;
- ordered continuation actions and path digest;
- final carrier, winner, finish reason, completed turns, and recurrence
  witness;
- responder-relative terminal result;
- final position, Stitching, Escape-Slack, preparation/Cocoon, and status
  residue; and
- source, response edge, voyage, and re-entry references.

Rejected/illegal attempts are outside this domain because the action set is
enumerated directly from `legal_actions`. Their absence must not be interpreted
as a production command-acceptance claim.

## Evaluation language

The primary assessment must keep these relations separate:

1. **selection coverage:** which legal actions/actions families the five fixed
   policies select;
2. **immediate reorganization:** damage, motion, cancellation, formation,
   Cocoon consumption, and Escape-Slack residue after the forced response;
3. **continuation sensitivity:** whether the same response reaches different
   terminal/recurrence classes under different declared continuation pairs;
4. **terminal-outcome dominance:** componentwise responder win/draw/loss
   comparison only across identical continuation contexts;
5. **resource/path incomparability:** responses that differ in resource,
   position, timing, or route remain non-equivalent even when terminal counts
   match;
6. **boundary transport:** whether a normalized response relation survives
   639/640/641 when preparer/responder phase changes; and
7. **policy-selected regret witness:** only a bounded witness that another
   legal response has a strictly better terminal vector under the complete
   declared continuation set—not a claim about optimal play.

Terminal-only dominance must never be called gameplay dominance. Turns,
resources, position, hidden information, human adaptation, and omitted
production ports remain explicit residue. No scalar average may select a
policy or mechanic.

## Mandatory falsifiers and stop gates

Stop or return the route when any of these occurs:

- a response carrier cannot be replayed exactly from F4;
- the exporter misses a later interleaving present in the baseline route;
- a policy selection is not in the legal action set;
- a forced response mutates its input carrier;
- identical response/context inputs produce different voyages or digests;
- a claimed dominance comparison uses different continuation contexts;
- a conclusion requires treating the five policies as optimal/player models;
- the useful distinction vanishes after actor/phase normalization;
- the result only restates win-rate aggregates; or
- terrain, aim, execution, or human adaptation becomes necessary to rank the
  surviving routes.

Possible navigation returns are:

- `retain_mechanics_refine_policy_question` when existing support is rich but
  one or more fixed selections are boundedly dominated or systematically miss
  a distinct route;
- `retain_mechanics_no_policy_defect` when multiple non-dominated choices
  remain and no fixed selection failure survives normalization;
- `escalate_authority_playtest_cut` when the declared model cannot rank the
  relevant alternatives without excluded ports; or
- `return_to_navigation_chart` when no stable response relation survives.

None authorizes a new policy, mechanic, V5 rule, or production proposal.

## Executed result

The strict exporter reproduces raw digest
`47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769`.
The TypeScript assessment emits result digest
`5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832`
with navigation return `retain_mechanics_refine_policy_question` and
ProductAuthority `none`.

The complete domain contains:

- 12 baseline routes: three starts, two first actors, and two independent
  mirrors;
- two discovered interleaved response carriers per route, for 24 carriers and
  six distance/cycle motifs;
- ten legal responses and five policy selections per carrier;
- every one of 25 continuation-policy contexts per legal response; and
- 6,000 deterministic response voyages.

All 6,000 voyages terminate, 4,292 for the responder, 1,696 for the preparer,
and 12 as turn-limit draws. None has a nonterminal recurrence witness. These
are continuation-context counts, not independent matches or a policy-weighted
balance sample.

Every carrier exposes five different policy-selected response families:
Needlepoint, Threadball, counter-preparation, paid Unweave, and relocation. The
relation therefore contains existing choice support; the D2I route is not
caused by an absent legal response.

Across identical continuation contexts, the terminal-only comparison produces
752 raw dominance witnesses and 84 carrier/policy regret witnesses. All five
policies appear in at least one regret witness. These counts retain fourfold
actor/mirror covariance and multiple action-direction witnesses; they are not
independent evidentiary weight. Turn count, path, position, Escape Slack,
status, and excluded authority ports remain outside the dominance claim.

The two preparation cycles separate sharply:

- **Cycle 1, both actors at 100 Stitching:** the `short_approach`
  counter-preparation is not terminally dominated across all 25 contexts.
  Removing it would erase a distinct supported branch rather than repair an
  obvious selection failure. Other selected actions do have bounded regret
  witnesses, but their alternatives carry different position/resource
  residue.
- **Cycle 2, preparer at 20 Stitching:** all three legal Threadball directions
  immediately unravel the preparer and win in all 25 contexts; paid Unweave
  also eventually wins all 25. `range_pressure`, `retreat_kite`, and
  `short_approach` nevertheless select Needlepoint, relocation, or another
  preparation on these carriers. This is a policy/pacing question, not missing
  gameplay support.

Legal response support and forced continuation relations are actor/mirror
equivariant. Policy selection is not fully equivariant: the second-cycle
`best_response` tie chooses literal `cast:threadball:left` in all 12 carriers.
Depending on orientation, that identical key either approaches without cost or
retreats and spends 64 Escape Slack. The terminal result remains an immediate
win, but position/resource residue changes. D2K records 12 mirror-sensitive
`best_response` selections.

The normalized immediate legal relation survives 639/640/641 for both cycles,
while the complete continuation vector changes at 641. Exact carriers remain
unequal and the responder phase changes from first actor at 639/640 to second
actor at 641. The response options are stable; downstream phase, completed-turn
horizon, and policy paths are not.

The next permitted action is owner review of a separate Lane 1 analytical
policy-probe contract. The narrowest candidate would make response selection
actor-relative and avoid passing over an immediate non-spending lethal action,
while leaving the non-dominated first-cycle Cocoon choice intact. D2K itself
does not authorize that policy, any Loomkeeper change, or a gameplay mechanic.

The owner opened that question as WP-015D2L. Its complete transport falsifier
preserves the first cycle and repairs the local second-cycle omission, but the
guard raises F4 first-actor wins from 158/250 to 166/250 because the benefit
follows responder phase. The global control rises to 184/250. D2L therefore
rejects the lethal-first direction and returns its exact witnesses to D2G; this
does not revise D2K's source relation or authorize a policy.

## Expected implementation surface

New parallel paths may include:

- `analysis/tactical_model/policy_choice_relation_probe.py`;
- `analysis/crpm_world/navigation/policy-choice-schemas.ts`;
- `analysis/crpm_world/navigation/assess-policy-choices.ts`;
- `scripts/run-policy-choice-relation-audit.ts`;
- `tests/crpm-world/policy-choice-relation-audit.test.ts`; and
- `docs/evidence/wp-015d2k.json` after complete deterministic execution.

Existing files may change only for bounded discoverability, planning,
governance, and evidence truth. `package.json` should remain unchanged because
the existing TypeScript, tsx, Node test runner, Python, and Zod surfaces are
sufficient.

## Phases

### Phase 0 - documentation and source lock

Status: complete.

### Phase 1 - pre-implementation regression

Status: complete; the TypeScript authority fixture and all 41 Python tactical
tests passed before implementation.

Run the complete existing tactical suite and stop on any failure.

### Phase 2 - strict export and schema

Status: complete; strict raw schema version 1 binds 12 routes, 24 carriers, 240
legal responses, 120 policy selections, and 6,000 voyages.

Implement deterministic, versioned, strict raw records without modifying the
model/config. Verify complete carrier/action/context enumeration and caller
non-mutation.

### Phase 3 - relation assessment

Status: complete; the assessment keeps exact carrier, normalized legal
support, policy selection, terminal vector, dominance, residue, and boundary
relations separate.

Implement normalized selection, residue, continuation, dominance, boundary,
and false-closure summaries. The assessment may only consume the fixed raw
export and must preserve witness/re-entry references.

### Phase 4 - execution and navigation decision

Status: complete with `retain_mechanics_refine_policy_question`.

Execute the complete domain, record exact counts/digests, choose one declared
navigation return, and update the D2G chart. Stop before any policy or mechanic
implementation.

### Phase 5 - evidence and verification

Status: complete; exact checks and skipped runtime tests are recorded in
`docs/evidence/wp-015d2k.json`.

Run focused and complete CRPM-world/tactical tests, simulation tests, type
checks, compliance, build, and `git diff --check`. Browser/device tests remain
unnecessary unless runtime-facing code changes, which this contract forbids.

## Re-entry

From a fresh session:

1. Follow `AGENTS.md`; inspect status, recent commits, and the Execution
   Pointer.
2. Read D2A, D2G, D2I, D2J, this contract, and CRPM World Operational
   Governance.
3. Verify Worms_Port base
   `5b6233a202f3a2fa8c06515d2c8f794736c77b02` and clean CRPM method commit
   `053c6fc0a90ed48d8667016b18a1d10106a7a2bc`.
4. Reproduce D2I result digest
   `ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0`.
5. Treat F4 as the only home carrier and preserve the full 639/640/641,
   orientation, legal-action, and continuation-policy domain.
6. Resume from the first incomplete phase. Do not substitute a policy edit,
   Cocoon rule, or scalar recommendation for the relation audit.

The fixed reproduction command is:

```powershell
npx tsx scripts/run-policy-choice-relation-audit.ts --output test-results/crpm-world/d2k-policy-choice/policy-choice-relation-result.json
```

Generated raw/result JSON remains ignored. Re-entry must begin from committed
sources and the two digests above rather than from disposable output.
