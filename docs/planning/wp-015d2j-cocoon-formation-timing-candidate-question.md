# WP-015D2J Cocoon Formation-Timing Candidate Question Review

Status: withdrawn before contract after the cheapest read-only falsifiers on
2026-08-24.

- **Candidate lifecycle:** `proposed -> withdrawn`; no `contracted` or
  `implemented` state was entered.
- **Operational class:** Gate 1 candidate-question review. The temporary
  counterfactuals were read-only probes, not registered Lane 1 candidates.
- **Parent:** completed WP-015D2I Cocoon Formation and Ordered Transport Voyage
  Audit.
- **Worms_Port base:**
  `ad54310397675a4923104b6f8cb6d059fcfdd6b6`.
- **Working branch:**
  `codex/wp-015d2j-cocoon-order-candidate-question`.
- **CRPM method lock:**
  `053c6fc0a90ed48d8667016b18a1d10106a7a2bc` on clean `main`.
- **Execution Pointer:** remains WP-015D2A.
- **ProductAuthority:** `none`.

## Purpose

WP-015D2I isolated an exact production-spawn route in the fixed
`short_approach` mirror:

```text
second actor prepares
  -> first actor counter-prepares
    -> second actor releases into the newer Cocoon for zero damage
      -> first actor releases after the older Cocoon expires
        -> first actor wins on turn nine
```

D2I returned `advance_to_candidate_question`, not permission to change the
model. The owner opened this review to determine whether one coherent,
reversible Cocoon formation/expiry rule was sufficiently specified to become a
Lane 1 candidate.

The bounded question was:

> Can a local change to the formation/expiry interface reorganize the exact
> interleaved preparation route around production spawn 640 while preserving
> F4's ordinary response window, convergence, explicit residue, and
> role-neutral rules?

The question makes no sole-cause claim. A negative answer returns knowledge to
the navigation carrier rather than requiring another mechanic.

## Source bindings

The review re-entered:

- D2I result digest
  `ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0`;
- D2I raw D2H digest
  `5ff3ed7d77acf29a55da422f9f7e02f8ad875349a8104f08076890179746f60f`;
- tactical model SHA-256
  `AF0B0EC8D9893E992BDC95123A915E24A2305EE2B9FFF32BCE95D27CDB4C8C08`;
- F4 config SHA-256
  `5E519B09EA5E5684185BCD527600705825BA75DF8F01E310ADB027D09D4F54E0`;
- returned I2 comparator config SHA-256
  `B6F409A3A31F8BBFEE2FAC7C4234312CDC61333E4141285695FF2CF0F9124A79`;
- D2I assessor SHA-256
  `B2F1C26E3C42A2BBF5F9D785F775C3C17D8DEB37829B62A2AFAA1B8442E34AAD`;
  and
- D2I evidence SHA-256
  `54DEE26F97FD598F177EE4C3D2FAE16D8C95090411FF754CBE7412D8AD12BE83`.

No CRPM source, tactical-model source, config, registered adapter, cut, schema,
or production file was edited for these probes.

## Protected family and fixed frame

The review protected:

- F4 as the gameplay home carrier and I2 only as a correlated comparator;
- production spawn 640 together with adjacent 639/641 boundary witnesses;
- both first actors, both mirrors, and all 25 ordered base-policy pairs in the
  four-orientation probe;
- F4's existing preparation, one-hit Cocoon, Threadback Unweave, damage,
  movement, resource, terminal, and recurrence meanings;
- explicit route, policy, actor, distance, Cocoon, preparation, Escape-Slack,
  terminal, and completed-turn residue;
- unchanged V1-V4 TypeScript authority and unchanged analytical history; and
- no automatic scalar balance threshold.

Remote distances remain warnings rather than optimization targets, but a rule
cannot be declared coherent around spawn by observing 640 and hiding the
one-unit 639/641 transition.

## Gameplay-dimension declaration

| Dimension | Review status |
| --- | --- |
| Actors and turn ownership | unchanged; actor-specific compensation is forbidden |
| Initial geometry | unchanged; 639/640/641 are the mandatory local boundary |
| Action declaration/resolution order | observed; any change would require a contracted Lane 1 child |
| Movement and range | observed in the entry probe; no model change |
| Relics, damage, Stitching, terminal rules | unchanged |
| Resources, status, cooldown, expiry | observed; no persistent state added |
| Information and response windows | unchanged in the probes |
| Terrain, aim, trajectory, splash | excluded |
| Randomness and seeds | unchanged deterministic D2A model |
| Policy/search behavior | unchanged; fixed-policy sensitivity remains explicit |
| Replay, networking, live control | excluded |
| Protocol, UI, rewards, assets | excluded |

## Air map: candidate meanings considered

The phrase "change Cocoon timing" was not implementation-ready. It contained
several materially different transitions:

1. **Delay every Cocoon until the preparer's next turn.** This removes the
   ordinary immediate response protection that made F4 structurally useful.
   It was rejected by construction before execution.
2. **Retain every Cocoon through its owner's release.** This can absorb both
   sides of an interleaved exchange and points back toward F2-style denial or
   recurrence pressure. It was rejected by construction before execution.
3. **Contested formation.** If an actor prepares while the opponent already
   has live preparation, the responding preparation receives no Cocoon. This
   preserves ordinary uncontested F4 formation and was the cheapest local
   timing falsifier.
4. **Preparation-entry commitment.** If an actor begins outside Spoolburst
   range, movement may enter the band but cannot also declare
   `prepare_spoolburst` on that action. Direct casts and established Cocoon
   resolution remain unchanged. This tests the edge immediately before
   formation rather than changing Cocoon absorption.

Items 3 and 4 were applied only through temporary in-memory function wrappers
against the unchanged model. They are counterfactual screening results, not
new model authorities or checked-in candidate semantics.

## Fire result 1: contested formation

### Exact local domain

The exhaustive local comparison covered F4 at 639, 640, and 641, both first
actors, both mirrors, and all 25 ordered base-policy pairs: 100 matches per
distance for each side of the comparison.

| Start | F4 first-actor wins | Contested-formation wins | Changed traces | Changed outcomes | Recurrence | Terminal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 639 | 60/100 | 56/100 | 4 | 4 | 0 | 100/100 |
| 640 | 60/100 | 56/100 | 4 | 4 | 0 | 100/100 |
| 641 | 80/100 | 84/100 | 4 | 4 | 0 | 100/100 |

Every changed local route was a `short_approach` versus `short_approach`
orientation. At 639/640 the second actor prepares first, so contested formation
makes the older preparation win and changes those four matches from the first
actor to the second actor. At 641 the first actor prepares first, so the same
rule changes four matches in the opposite direction.

The result does not remove an order privilege. It swaps the current
later-preparer privilege for an earlier-preparer privilege, while the identity
of that preparer changes across the one-unit range-entry boundary.

### Existing response witness

At the response carrier for 639/640, the first actor can already choose paid
Threadback Unweave instead of counter-preparation and still wins under the
unchanged following `short_approach` continuation. At 641 the same is true for
the second actor. The fixed policies expose these selections:

| Policy | Existing response at the interleaved carrier |
| --- | --- |
| `range_pressure` | Needlepoint |
| `medium_hold` | paid Threadback Unweave |
| `short_approach` | counter-preparation |
| `retreat_kite` | retreat |
| `best_response` | Threadball |

Consequently the contested-formation scalar change is not evidence that the
responder lost all winning support. It makes the fixed `short_approach` policy
select a losing branch while an existing winning Unweave branch remains. A
60-to-56 result at spawn would therefore be policy-overfit false closure if
presented as a mechanical repair.

### Historical-band warning

As a secondary warning, the existing five-start/two-orientation sweep changed:

- F4 aggregate `63.2% -> 65.6%`, with
  `[60,56,60,60,80] -> [64,60,64,56,84]` percent by distance; and
- I2 aggregate `58.4% -> 60.8%`, with
  `[60,56,60,60,56] -> [64,60,64,56,60]` percent by distance.

All 250 matches per case remained terminal and the fixed recurrence/opening
gates remained clear. Those structural facts do not rescue the directional
split.

## Fire result 2: preparation-entry commitment

The same local 300-match-per-side F4 domain was run with only
movement-created preparation filtered from the legal action set.

| Start | F4 first-actor wins | Entry-commitment wins | Changed traces | Changed outcomes | Recurrence | Terminal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 639 | 60/100 | 64/100 | 32 | 12 | 0 | 100/100 |
| 640 | 60/100 | 64/100 | 32 | 12 | 0 | 100/100 |
| 641 | 80/100 | 76/100 | 32 | 12 | 0 | 100/100 |

This intervention affects more policy routes and improves the 641 side, but it
worsens both 639 and the exact production spawn. It therefore moves pressure
through the range-entry/action-economy relation rather than producing a stable
local formation repair.

## Candidate-admission decision

WP-015D2J stops before `contracted`.

The cheapest falsifiers reject both executable meanings that preserved the
ordinary F4 Cocoon window:

- contested formation reverses preparation priority and overfits one fixed
  policy branch; and
- preparation-entry commitment changes a broader route family while worsening
  the exact home side.

The evidence does not select another unique transition. Picking delayed
formation, persistent expiry, actor-specific compensation, simultaneous
resolution, a new cost, or a new initiative rule would add gameplay meaning
not supplied by D2I. Operational Governance therefore requires an owner choice
before any such package, and no current option warrants that choice.

The lifecycle disposition is `withdrawn`, not `rejected`: no candidate was
contracted or implemented, so there is no historical model result to reject.

## Navigation update

The D2I wake remains useful but changes chart role:

- **retained landmark:** Cocoon transport makes the responding/later preparer
  win the exact interleaved `short_approach` exchange;
- **new boundary landmark:** one unit changes which actor reaches the
  preparation-response role first;
- **negative landmark:** switching priority from later to earlier does not
  remove the discontinuity;
- **policy residue:** existing Unweave support means the cheapest patch changes
  one heuristic selection rather than removing responder continuation; and
- **reopening condition:** a later carrier must explain why one response edge
  is strategically credible, dominated, or unavailable without using a scalar
  result as its definition.

The next permitted direction is D2G's retained **R2 policy-choice relation**:
hold F4 mechanics fixed and assess what the five policies can observe, choose,
and preserve at the 639/640/641 interleaved preparation carriers. This is a
Lane 2 observation, not permission to add or tune a policy. It should compare
available response routes, one-step and voyage consequences, resource residue,
dominance only within the declared continuation model, and sensitivity to the
fixed heuristic family. If that relation cannot be made useful without human
adaptation, terrain, aim, or execution, return to R3 authority/playtest
escalation.

## Re-entry

From a fresh session:

1. Follow `AGENTS.md`; inspect Git status, recent commits, and the Execution
   Pointer.
2. Read D2A, D2G, D2H, D2I, this review, and CRPM World Operational
   Governance.
3. Verify Worms_Port base
   `ad54310397675a4923104b6f8cb6d059fcfdd6b6` and CRPM method commit
   `053c6fc0a90ed48d8667016b18a1d10106a7a2bc`.
4. Reproduce D2I digest
   `ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0`
   before interpreting the ordered route.
5. Treat the numerical counterfactuals above as bounded screening evidence,
   not registered World Design Port results or candidate authority.
6. Do not implement either screened rule. Start any continuation from R2 with
   mechanics fixed and a separate source-locked Lane 2 contract.

The owner subsequently opened that continuation as
[WP-015D2K](wp-015d2k-policy-choice-relation-audit-contract.md). D2K confirms
that first-cycle counter-preparation is a non-dominated supported branch, while
the later 20-Stitching carrier exposes immediate lethal Threadball choices that
several fixed policies pass over. That result preserves this withdrawal and
refines the next question toward analytical response selection rather than
reopening either timing rule.

No V5 rule, candidate config, action, policy, state field, status, protocol,
replay, reward, UI, asset, runtime dependency, or production authority was
created by WP-015D2J.
