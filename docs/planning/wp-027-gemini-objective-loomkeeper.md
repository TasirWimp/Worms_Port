# WP-027 Strategic-Voyage Gemini Loomkeeper

Status: **queued after WP-026; refined planning contract only**
Required predecessor: completed WP-026 R8 objective-mode canary

## Product outcome

WP-027 gives the Loomkeeper a coherent multi-turn strategy across Defend,
Collect and Claim. Gemini acts as a bounded strategist and narrator: it carries
an explicit strategic voyage across turns, revises that voyage when observed
results or threats justify a transition, declares the bounded battlefield
transformation that the strategy now needs, and selects one server-proven
complete-turn candidate that advances or repairs it.

The server remains the only authority for legal moves, physics, objectives,
terrain mutation, scoring, terminal results, replay and reward eligibility.
Gemini can choose and explain a transition between legal possibilities; it
cannot invent a command or make an invalid move valid.

The deterministic R8 Loomkeeper remains fully playable and is the permanent
fallback. Gemini failure may change which legal plan is selected; it must never
break, extend or invalidate a match. After shadow and live Practice gates pass,
the exact R8 identity can replace R7 in standard Practice and PEI-gated Daily.

## Operational reasoning model

The decision boundary has four separate layers:

1. **Local validity:** deterministic generation and simulation establish which
   complete-turn plans are legal and what each plan actually changes.
2. **World transformation:** deterministic world-transition packets describe
   the future affordances each candidate creates, preserves or destroys.
3. **Transition legitimacy:** deterministic transition packets describe which
   accepted commitments a candidate advances, preserves, violates, opens or
   closes. A model claim that contradicts those facts is rejected.
4. **Voyage coherence:** Gemini decides whether the multi-turn strategy should
   continue, refine, repair, switch or complete, then chooses a candidate that
   fits the accepted strategy and desired world transition.

Global consistency means recoverable continuity rather than repeating one plan
forever. Strategy changes are valid when a named observed condition warrants
them. This prevents both rigid adherence to a failed route and ungrounded
turn-by-turn tactic switching.

## Coupled world and voyage state

The battlefield and the strategic voyage evolve together:

```text
(WorldState_t, StrategicVoyage_t)
  -- authoritative turn; selected candidate when Loomkeeper -->
(WorldState_t+1, StrategicVoyage_t+1)
```

`WorldState` remains deterministic authority. It includes terrain and objective
revisions/hashes, topology and support, reachable regions, objective objects,
actor positions and health, resources, score, turn state and terminal facts.
`StrategicVoyage` records why a permitted transformation of that world belongs
to a recoverable multi-turn route.

The voyage changes the game world only through the ordinary server execution of
its selected candidate. Gemini cannot write a world state, terrain edit, object
position or score. It chooses among authorized transformations whose predicted
results were produced by the deterministic simulator.

The server derives a first-class `WorldTransition` for every completed
authoritative turn. Loomkeeper candidates also carry a predicted transition
before selection; player turns carry their observed transition into the next
narrator window. Each transition contains:

- source-world and result-world revisions/hashes, with a predicted result hash
  on simulated Loomkeeper candidates;
- cause: Loomkeeper candidate, player turn or terminal/system transition;
- terrain, topology, support and reachable-region deltas;
- objective-object position, support, collection, capture and loss deltas;
- actor position, health, resource, score and terminal deltas;
- affordance IDs created, preserved and removed;
- irreversible effect IDs and recoverable alternatives; and
- the exact operation and candidate IDs that cause the transition.

After Loomkeeper execution, the server derives the observed `WorldTransition`
from the same canonical projection and compares it with the prediction. The
observed world is authoritative. A mismatch is recorded as integrity residue,
strains the voyage, disables further Gemini choices for that match and uses
deterministic fallback. The next narrator pass also receives the observed
player-turn transition since the previous Loomkeeper result, so player-created
terrain, objective and affordance changes can legitimately reopen the strategy.
Existing replay verification still decides Daily reward eligibility, so an
unreconstructable world transition cannot qualify a payout.

## Server-owned strategic voyage

An active match stores a compact, structured `StrategicVoyage`. It is ordinary
authoritative match state, survives reconnect and server recovery, and is sent
explicitly in each stateless Gemini request. Provider chat history and
`previous_interaction_id` are never game memory.

The voyage contains:

- voyage and prompt-contract revisions plus the previous carrier hash;
- objective mode, primary focus, target object or region and approach;
- bounded `WorldIntent`: desired effect, targets, protected affordances and
  accepted irreversible effects;
- phase and bounded planning horizon;
- protected commitment IDs and the next milestone ID;
- accumulated residue IDs: threats, failed assumptions and unresolved costs;
- explicit reopen conditions for repair or strategy change;
- status: `in_flight`, `strained`, `blocked` or `achieved`;
- age, switch count and last transition reason; and
- the previous candidate's predicted/observed result plus intervening observed
  player/system world transitions.

Gemini composes a strategy only from bounded semantic values and exact IDs
supplied by the server. Focus values cover objective progress, objective
defence, denial, terrain access, combat pressure and survival. Approaches cover
direct action, interception, holding, left/right flanking and terrain change.
World effects cover preserve, open, close, collapse, relocate, collect,
intercept and deny. Targets, affordances, irreversible effects, milestones,
commitments, residue and reopen conditions are current request enums. No
free-form plan becomes authority.

The server derives the observed world and voyage deltas after execution. Gemini
may propose the next carrier and desired `WorldIntent`, but the server accepts
only schema-valid values that reference current IDs and do not contradict
authoritative facts. Accepted carriers and rejected proposals are bounded audit
records.

## Candidate cuts and transition packets

WP-027 must not preserve the inherited fixed combat lattice as the only search
space. Deterministic proposal generation uses a versioned family of candidate
cuts that covers at least:

- direct objective progress and capture/collection;
- objective defence, interception and denial;
- terrain opening, route creation and route denial;
- immediate threat response, recovery and self-preservation; and
- direct combat pressure and ring-out opportunities.

The narrator pass may bias refinement budget toward the accepted strategy, but
each applicable cut retains a fixed minimum exploration allocation and the
existing deterministic baseline retains a slot. This stops an early strategy
from hiding every alternative. Proposal, simulation, refinement and final-atlas
limits are versioned constants frozen in Waypoint 1 after profiling. The final
Gemini atlas remains bounded to at most 24 stable candidate IDs.

Every final candidate carries a deterministic `CandidateTransition` packet:

- candidate ID, origin cut, operation hash and basis-state hash;
- legality and exact simulated immediate consequences;
- the complete predicted `WorldTransition` and its hash;
- commitments advanced, preserved and violated;
- milestones approached or completed;
- fit or conflict with the accepted `WorldIntent`;
- irreversible consequences and accepted residue created;
- final positions and strongest bounded reply considered; and
- available recovery after that reply.

These facts are computed from the accepted voyage, world intent and simulation;
Gemini does not author them. Dominance pruning may remove structurally duplicate
or strictly worse candidates, but cannot erase all representatives of an
applicable cut merely because they disagree with the current strategy or world
intent.

## Two-pass Loomkeeper turn

At the start of each Loomkeeper turn, the server performs one bounded reasoning
window:

1. snapshot the exact authoritative R8 `WorldState` and previous accepted
   `StrategicVoyage`;
2. reconcile the previous Loomkeeper candidate's predicted/observed transition
   and derive the observed player/system transitions since that result;
3. build a coarse opportunity catalogue from objective, topology, threat,
   support, resource, affordance and reachable-region facts;
4. run the **narrator pass**, which accepts or revises the strategic voyage and
   declares the desired `WorldIntent`;
5. validate and freeze the voyage and world intent for this turn;
6. generate, simulate and refine the multi-cut candidate atlas, including a
   predicted `WorldTransition` for each final candidate, while retaining
   mandatory exploration and fallback coverage;
7. run the **choice pass**, which selects one candidate ID and identifies its
   strategic function and explicitly accepted residue;
8. validate the selected ID, basis, response, strategic fit and world-intent
   fit;
9. execute only the candidate's ordinary authoritative intents; and
10. derive the observed world transition, compare it with the prediction and
    carry the result into the next reasoning window.

The narrator is evaluated every Loomkeeper turn because one full player turn is
the natural observation window. It may retain the carrier unchanged. A strategy
switch requires one current reason code such as `route_blocked`,
`protected_commitment_failed`, `terminal_threat`, `objective_phase_changed` or
`decisive_opportunity`. The server validates that the referenced condition is
present, but does not replace Gemini's strategic preference with a hidden score.

The choice validator checks factual consistency. For example, a candidate
cannot claim to preserve chest support if its simulated world transition
removes that support. Preference among factually valid candidates remains
Gemini's role.

## Structured responses

The narrator response uses a strict schema equivalent to:

```json
{
  "transition": "continue|refine|repair|switch|complete",
  "transitionReason": "progress|route_blocked|protected_commitment_failed|terminal_threat|objective_phase_changed|decisive_opportunity",
  "focus": "objective_progress|objective_defence|denial|terrain_access|combat_pressure|survival",
  "targetIds": ["current-request-id"],
  "approach": "direct|intercept|hold|flank_left|flank_right|terrain_change",
  "worldIntent": {
    "effect": "preserve|open|close|collapse|relocate|collect|intercept|deny",
    "targetIds": ["current-request-id"],
    "protectedAffordanceIds": ["current-request-id"],
    "acceptedIrreversibleEffectIds": ["current-request-id"]
  },
  "horizonOwnTurns": 2,
  "protectedCommitmentIds": ["current-request-id"],
  "nextMilestoneId": "current-request-id",
  "reopenConditionIds": ["current-request-id"]
}
```

The choice response uses a separate strict schema equivalent to:

```json
{
  "candidateId": "r8-candidate-id",
  "strategicFunction": "advance|preserve|repair|convert|explore",
  "acceptedResidueIds": ["candidate-transition-id"]
}
```

All referenced IDs are enums from the exact current request. Required fields,
array bounds and horizon bounds are enforced; additional properties are
rejected. Output count is one and output ceilings remain small. Strategy,
world-intent and function labels are audit and continuity metadata. They cannot
alter the candidate's operations or predicted world transition.

The policy pins exact stable model names. `latest`, preview and experimental
aliases are prohibited for Daily. Temperature is zero to reduce incidental
variation; WP-027 makes no deterministic-output claim about Gemini.

## Replay and verification

Each reasoning-window record adds:

- turn, objective mode and exact R8 automation/policy identities;
- provider outcome for narrator and choice independently;
- exact stable model and prompt-contract revisions;
- basis state, terrain, objective and previous-carrier hashes;
- canonical narrator request/response hashes, accepted voyage hash and accepted
  world-intent hash;
- cut-family allocation, proposal-set and final-atlas hashes;
- selected candidate ID, operation hash, candidate-transition hash and predicted
  world-transition hash;
- canonical choice request/response hash;
- observed result-world hash, observed world-transition hash and exact
  prediction-reconciliation status;
- intervening player/system world-transition hashes; and
- fallback stage and reason when external reasoning was not used.

The fresh verifier recreates R8, reconstructs the coupled world/voyage chain
from accepted records, regenerates the deterministic opportunity catalogue and
candidate atlas, validates every hash, confirms that the recorded candidate was
legal and reproduces its predicted and observed world transitions before
replaying its operations. It never calls Gemini. This proves the accepted
strategy carrier, authorized world transformation, legal choice and resulting
match; it does not claim that a later model call would make the same strategic
or tactical choice.

A match captures its provider, model, prompt, voyage, candidate-cut and fallback
policy revisions at creation. Configuration changes cannot switch an active
match. Reconnect and server recovery retain the accepted carrier, current world
revision and every already selected plan/world-transition record.

## Failure, latency and cost policy

There are at most two external requests per Loomkeeper turn and no provider
retry inside the turn. With the 16-turn match limit, one match can make at most
16 requests. One in-flight reasoning window is permitted per match and a
deployment-wide concurrency cap applies.

The initial deployed canary uses one versioned whole-window deadline rather
than treating the old three-second single-call limit as a product invariant.
Waypoint 2 sets a provisional narrator, deterministic-planning and choice
allocation from local fake profiling. Waypoint 3 freezes the live canary
deadline from deployed-shadow measurements before live Practice. The phone gate
then decides whether the bounded wait preserves game flow. A late response is
ignored, and provider time cannot become scheduler debt for other matches.

Failure behavior is stage-specific and recorded:

- narrator timeout, quota, transport or invalid output uses the deterministic
  R8 plan for that turn and leaves the previous valid voyage intact;
- rejected narrator semantics mark the voyage strained and use deterministic
  fallback without calling the choice pass;
- candidate generation or simulation failure fails closed and cannot be
  presented as Gemini success;
- choice timeout, invalid output, stale basis, unknown ID or semantic mismatch
  selects the deterministic fallback candidate from the same frozen atlas;
- if the current voyage has no fitting legal candidate, the fallback acts and
  the next turn enters with `blocked` residue requiring repair or switch; and
- a predicted/observed world-transition mismatch records integrity residue,
  disables Gemini for the rest of that match and leaves replay/reward
  verification to fail closed on the unreconstructable result.

The adapter enforces input byte/token ceilings, small output ceilings, a circuit
breaker and a deployment spend budget. Shadow evidence records both-pass
latency, schema and semantic validity, fallback reason, input/output tokens,
estimated cost, voyage transitions, cut coverage, selected function and
candidate comparison across all three objective modes. It also records desired,
predicted and observed world effects, affordance changes and reconciliation
status. Live thresholds and budget are explicit evidence and cannot be silently
relaxed in configuration.

## Security and configuration

The adapter lives only in the server. Requests contain no wallet address, PEI
receipt, transaction hash, reward reservation, session bearer, IP address,
device data or player-authored prompt text. Logs contain bounded policy/model
IDs, hashes, latency, token counts, enum labels and error classes without the API
key or wallet identity.

Safe defaults are:

```text
LOOMKEEPER_PROVIDER=deterministic
GEMINI_API_KEY=<server-side secret; absent while deterministic>
GEMINI_MODEL=<exact stable model ID; required for shadow or live Gemini>
```

Allowed providers are `deterministic`, `gemini-shadow` and `gemini`. Incomplete
Gemini configuration fails startup for the requested external mode. The first
implementation uses a small server transport adapter. Adding an SDK requires
ordinary dependency, license, audit and bundle review.

## Waypoints and gates

### Waypoint 1 - deterministic voyage and candidate boundary

Freeze the coupled world/voyage schema, canonical world projection,
`WorldIntent`, predicted/observed `WorldTransition`, observation delta,
opportunity catalogue, candidate-cut registry, exploration allocation,
transition packets, final-atlas bounds and replay records. Prove that each mode
exposes objective, terrain, threat, recovery and world-shaping alternatives;
player-created world changes reach the next narrator window; exact
reconstruction uses no provider.

No external Gemini request is permitted in this waypoint.

### Waypoint 2 - two-pass adapter with local fakes

Implement the narrator and choice contracts behind the server-only adapter.
Prove carrier continuation, justified repair/switch, contradiction rejection,
bounded world-intent selection, predicted/observed transition reconciliation,
response to intervening player transitions, world-effect contradiction
rejection, unknown/stale IDs, separate stage failure, deterministic fallback,
reconnect and circuit/spend limits with network-free local fakes. Profile
request sizes and define the provisional local deadline allocation.

### Waypoint 3 - deployed shadow mode

Run both Gemini passes in shadow across Defend, Collect and Claim. The
deterministic Loomkeeper acts while evidence measures voyage stability, valid
strategy switches, cross-cut choice, desired world effects, factual consistency,
prediction reconciliation, latency and cost. Compare selected candidates with
fallback and confirm that Gemini distinguishes objective modes, deliberately
changes battlefield affordances and changes strategy when observed conditions
warrant it. Freeze the live canary deadline and sub-deadlines from this evidence
before Phone Gate A.

Shadow output cannot alter gameplay, replay or reward truth.

### Phone Gate A - live Gemini Practice

Enable live Gemini only for the R8 Practice canary. In every mode, create one
turn where the existing strategy remains useful and one where terrain, object
movement or a threat justifies repair or switching. Confirm that:

1. the Loomkeeper visibly pursues a coherent objective over several turns;
2. a strategy transition follows the changed battlefield rather than arbitrary
   turn-by-turn switching;
3. a terrain or object action creates, preserves or removes a future affordance
   consistent with the declared world intent;
4. every selected turn remains legal and its predicted world transition matches
   the visible result;
5. the bounded reasoning wait preserves the turn-based flow;
6. close/reopen resumes the same match, world revision and strategic voyage;
   and
7. controlled narrator and choice failures each fall back and finish the match.

### Final promotion and Phone Gate B

After replay, fallback and operational evidence pass, promote the exact R8
ruleset and WP-027 automation/policy identity to standard Practice and Daily.
The player chooses Defend, Collect or Claim before Daily creation; the choice is
immutable and one started Daily/consumed PEI receipt applies across all modes.

Phone Gate B completes one Practice match in every mode, resumes a strategically
changed match, verifies narrator-stage and choice-stage fallback journeys, and
completes eligible Daily wins covering chest and coin results under the
temporary approved development repeat override. The final deployment restores
the safe one-Daily limit, helper state, provider/budget configuration and fixed
1 NIM reward path.

## Automated acceptance

Coverage must prove coupled world/voyage-chain validity, canonical world hashes,
world-intent and transition reason evidence, predicted/observed world-transition
reconciliation, affordance and irreversible-effect derivation, candidate-cut
coverage and bounds, mandatory exploration, mode-specific consequences, strict
schemas, cross-level contradiction rejection, basis/carrier/atlas/response
hashes, bounded timing, independent narrator and choice failure, integrity
mismatch fallback, quota/circuit fallback, request redaction, server-only key
separation, exact network-free replay, reconnect, R8 Practice/Daily browser
journeys, reward settlement, build, security, bundle and current server smoke.

Routine CI uses local fakes and never calls Gemini. PostgreSQL, deployed shadow,
physical-phone and Ubuntu visual evidence remain separately reported gates.

## Explicit deferrals

WP-027 does not change R8 physics, objective layouts, terminal rules, reward
amount, PEI admission, one-Daily policy, actor lives or art. It adds no
model-authored commands, maps, objects, dialogue, player-facing prose or hidden
provider memory. It does not train or fine-tune a model and does not claim that
Gemini globally optimizes the full match tree. `WorldIntent` cannot create a new
physics operation or bypass deterministic candidate generation and simulation.

## Definition of done

WP-027 closes only when the deterministic voyage/candidate boundary, two-pass
fake gate, deployed shadow evidence, live Practice Phone Gate A and final
Practice/Daily Phone Gate B pass; exact replay reconstructs every carrier and
selected plan plus its predicted and observed world transition without Gemini;
safe deployment settings are restored; change-selected checks pass; evidence is
complete; and housekeeping agrees with the execution pointer.

## Design provenance

The coupled world/voyage interpretation is an L4+ architectural transfer from
CRPM, not a claim that CRPM doctrine prescribes this game implementation. It
uses the distinction between local cut-transition validity, change across
transitions, frame-changing global continuity and recoverable voyage
composition. `pilot_activation: not_required`.

Primary CRPM references, pinned at `64f49017976d3fab9225954d141a6866a544ce61`:

- [Level 3 Methodology](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/methodology/CRPM_Level3_Methodology.md)
- [Voyage/Landfall Operational Translation](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/CRPM_Voyage_Landfall_Operational_Translation_Note_v0.md)
- [Cut, Voyage and Recoverability](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/Cut_Voyage_Recoverability_Note.md)
- [Recursive Cut-Transition Dynamics](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/voyage_graphs/research_notes/CRPM_Voyage_Edge_Graph_Recursive_Cut_Transition_Dynamics_Design_Note_v0.md)
- [Agent-Narrator Mode-Growth Bridge](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/voyage_graphs/research_notes/CRPM_CMB_DG_Agent_Narrator_Mode_Growth_Bridge_v0.md)
- [Voyage Source-Ocean Field Model](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/voyage_graphs/research_notes/CRPM_Voyage_Source_Ocean_Preobject_Field_Model_v0.md)

## Gemini references

- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/rate-limits
