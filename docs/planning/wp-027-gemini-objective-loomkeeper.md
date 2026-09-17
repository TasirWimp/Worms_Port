# WP-027 Strategic-Voyage Gemini Loomkeeper

Status: **queued after WP-026; refined planning contract only**
Required predecessor: completed WP-026 R8 objective-mode canary

## Product outcome

WP-027 gives the Loomkeeper a coherent multi-turn strategy across Defend,
Collect and Claim. Gemini acts as a bounded strategist and narrator: it carries
an explicit strategic voyage across turns, revises that voyage when observed
results or threats justify a transition, and selects one server-proven
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

The decision boundary has three separate layers:

1. **Local validity:** deterministic generation and simulation establish which
   complete-turn plans are legal and what each plan actually changes.
2. **Transition legitimacy:** deterministic transition packets describe which
   accepted commitments a candidate advances, preserves, violates, opens or
   closes. A model claim that contradicts those facts is rejected.
3. **Voyage coherence:** Gemini decides whether the multi-turn strategy should
   continue, refine, repair, switch or complete, then chooses a candidate that
   fits the accepted strategy transition.

Global consistency means recoverable continuity rather than repeating one plan
forever. Strategy changes are valid when a named observed condition warrants
them. This prevents both rigid adherence to a failed route and ungrounded
turn-by-turn tactic switching.

## Server-owned strategic voyage

An active match stores a compact, structured `StrategicVoyage`. It is ordinary
authoritative match state, survives reconnect and server recovery, and is sent
explicitly in each stateless Gemini request. Provider chat history and
`previous_interaction_id` are never game memory.

The voyage contains:

- voyage and prompt-contract revisions plus the previous carrier hash;
- objective mode, primary focus, target object or region and approach;
- phase and bounded planning horizon;
- protected commitment IDs and the next milestone ID;
- accumulated residue IDs: threats, failed assumptions and unresolved costs;
- explicit reopen conditions for repair or strategy change;
- status: `in_flight`, `strained`, `blocked` or `achieved`;
- age, switch count and last transition reason; and
- the previous candidate's predicted consequences and observed result.

Gemini composes a strategy only from bounded semantic values and exact IDs
supplied by the server. Focus values cover objective progress, objective
defence, denial, terrain access, combat pressure and survival. Approaches cover
direct action, interception, holding, left/right flanking and terrain change.
Targets, milestones, commitments, residue and reopen conditions are current
request enums. No free-form plan becomes authority.

The server derives the observation delta after execution. Gemini may propose
the next carrier, but the server accepts only a schema-valid carrier that
references current IDs and does not contradict authoritative facts. Accepted
carriers and rejected proposals are bounded audit records.

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
- objective, terrain, health, position and resource deltas;
- commitments advanced, preserved and violated;
- milestones approached or completed;
- routes and future options opened or closed;
- irreversible consequences and accepted residue created;
- final positions and strongest bounded reply considered; and
- available recovery after that reply.

These facts are computed from the accepted voyage and simulation; Gemini does
not author them. Dominance pruning may remove structurally duplicate or strictly
worse candidates, but cannot erase all representatives of an applicable cut
merely because they disagree with the current strategy.

## Two-pass Loomkeeper turn

At the start of each Loomkeeper turn, the server performs one bounded reasoning
window:

1. snapshot the exact authoritative R8 state and derive the observation delta;
2. build a coarse opportunity catalogue from objective, topology, threat,
   support, resource and reachable-region facts;
3. run the **narrator pass**, which accepts or revises the strategic voyage;
4. validate and freeze the accepted voyage for this turn;
5. generate, simulate and refine the multi-cut candidate atlas under that
   voyage while retaining mandatory exploration and fallback coverage;
6. run the **choice pass**, which selects one candidate ID and identifies its
   strategic function and explicitly accepted residue;
7. validate the selected ID, basis, response and claimed strategic fit; and
8. execute only the candidate's ordinary authoritative intents, then record the
   observed result for the next reasoning window.

The narrator is evaluated every Loomkeeper turn because one full player turn is
the natural observation window. It may retain the carrier unchanged. A strategy
switch requires one current reason code such as `route_blocked`,
`protected_commitment_failed`, `terminal_threat`, `objective_phase_changed` or
`decisive_opportunity`. The server validates that the referenced condition is
present, but does not replace Gemini's strategic preference with a hidden score.

The choice validator checks factual consistency. For example, a candidate
cannot claim to preserve chest support if its simulated result removes that
support. Preference among factually valid candidates remains Gemini's role.

## Structured responses

The narrator response uses a strict schema equivalent to:

```json
{
  "transition": "continue|refine|repair|switch|complete",
  "transitionReason": "progress|route_blocked|protected_commitment_failed|terminal_threat|objective_phase_changed|decisive_opportunity",
  "focus": "objective_progress|objective_defence|denial|terrain_access|combat_pressure|survival",
  "targetIds": ["current-request-id"],
  "approach": "direct|intercept|hold|flank_left|flank_right|terrain_change",
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
rejected. Output count is one and output ceilings remain small. Strategy and
function labels are audit and continuity metadata. They cannot alter the
candidate's operations.

The policy pins exact stable model names. `latest`, preview and experimental
aliases are prohibited for Daily. Temperature is zero to reduce incidental
variation; WP-027 makes no deterministic-output claim about Gemini.

## Replay and verification

Each reasoning-window record adds:

- turn, objective mode and exact R8 automation/policy identities;
- provider outcome for narrator and choice independently;
- exact stable model and prompt-contract revisions;
- basis state, terrain, objective and previous-carrier hashes;
- canonical narrator request/response hashes and accepted voyage hash;
- cut-family allocation, proposal-set and final-atlas hashes;
- selected candidate ID, operation hash and transition-packet hash;
- canonical choice request/response hash; and
- fallback stage and reason when external reasoning was not used.

The fresh verifier recreates R8, reconstructs the voyage chain from accepted
records, regenerates the deterministic opportunity catalogue and candidate
atlas, validates every hash and confirms that the recorded candidate was legal
before replaying its operations. It never calls Gemini. This proves the accepted
strategy carrier, legal choice and resulting match; it does not claim that a
later model call would make the same strategic or tactical choice.

A match captures its provider, model, prompt, voyage, candidate-cut and fallback
policy revisions at creation. Configuration changes cannot switch an active
match. Reconnect and server recovery retain the accepted carrier and every
already selected plan record.

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
  selects the deterministic fallback candidate from the same frozen atlas; and
- if the current voyage has no fitting legal candidate, the fallback acts and
  the next turn enters with `blocked` residue that requires repair or switch.

The adapter enforces input byte/token ceilings, small output ceilings, a circuit
breaker and a deployment spend budget. Shadow evidence records both-pass
latency, schema and semantic validity, fallback reason, input/output tokens,
estimated cost, voyage transitions, cut coverage, selected function and
candidate comparison across all three objective modes. Live thresholds and
budget are explicit evidence and cannot be silently relaxed in configuration.

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

Freeze the strategic-voyage schema, observation delta, opportunity catalogue,
candidate-cut registry, exploration allocation, transition packets, final-atlas
bounds and replay records. Prove that each mode exposes objective, terrain,
threat and recovery alternatives; exact reconstruction uses no provider.

No external Gemini request is permitted in this waypoint.

### Waypoint 2 - two-pass adapter with local fakes

Implement the narrator and choice contracts behind the server-only adapter.
Prove carrier continuation, justified repair/switch, contradiction rejection,
unknown/stale IDs, separate stage failure, deterministic fallback, reconnect
and circuit/spend limits with network-free local fakes. Profile request sizes
and define the provisional local deadline allocation.

### Waypoint 3 - deployed shadow mode

Run both Gemini passes in shadow across Defend, Collect and Claim. The
deterministic Loomkeeper acts while evidence measures voyage stability, valid
strategy switches, cross-cut choice, factual consistency, latency and cost.
Compare selected candidates with fallback and confirm that Gemini distinguishes
objective modes and changes strategy when observed conditions warrant it.
Freeze the live canary deadline and sub-deadlines from this evidence before
Phone Gate A.

Shadow output cannot alter gameplay, replay or reward truth.

### Phone Gate A - live Gemini Practice

Enable live Gemini only for the R8 Practice canary. In every mode, create one
turn where the existing strategy remains useful and one where terrain, object
movement or a threat justifies repair or switching. Confirm that:

1. the Loomkeeper visibly pursues a coherent objective over several turns;
2. a strategy transition follows the changed battlefield rather than arbitrary
   turn-by-turn switching;
3. every selected turn remains legal and matches its visible consequences;
4. the bounded reasoning wait preserves the turn-based flow;
5. close/reopen resumes the same match and strategic voyage; and
6. controlled narrator and choice failures each fall back and finish the match.

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

Coverage must prove voyage-chain validity, transition reason evidence,
candidate-cut coverage and bounds, mandatory exploration, mode-specific
consequences, strict schemas, cross-level contradiction rejection,
basis/carrier/atlas/response hashes, bounded timing, independent narrator and
choice failure, quota/circuit fallback, request redaction, server-only key
separation, exact network-free replay, reconnect, R8 Practice/Daily browser
journeys, reward settlement, build, security, bundle and current server smoke.

Routine CI uses local fakes and never calls Gemini. PostgreSQL, deployed shadow,
physical-phone and Ubuntu visual evidence remain separately reported gates.

## Explicit deferrals

WP-027 does not change R8 physics, objective layouts, terminal rules, reward
amount, PEI admission, one-Daily policy, actor lives or art. It adds no
model-authored commands, maps, objects, dialogue, player-facing prose or hidden
provider memory. It does not train or fine-tune a model and does not claim that
Gemini globally optimizes the full match tree.

## Definition of done

WP-027 closes only when the deterministic voyage/candidate boundary, two-pass
fake gate, deployed shadow evidence, live Practice Phone Gate A and final
Practice/Daily Phone Gate B pass; exact replay reconstructs every carrier and
selected plan without Gemini; safe deployment settings are restored;
change-selected checks pass; evidence is complete; and housekeeping agrees with
the execution pointer.

## Design provenance

The three-layer interpretation is an L4+ architectural transfer from CRPM, not
a claim that CRPM doctrine prescribes this game implementation. It uses the
distinction between local cut-transition validity, change across transitions
and recoverable global voyage composition. `pilot_activation: not_required`.

Primary CRPM references, pinned at `64f49017976d3fab9225954d141a6866a544ce61`:

- [Level 3 Methodology](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/methodology/CRPM_Level3_Methodology.md)
- [Voyage/Landfall Operational Translation](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/CRPM_Voyage_Landfall_Operational_Translation_Note_v0.md)
- [Cut, Voyage and Recoverability](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/Cut_Voyage_Recoverability_Note.md)
- [Recursive Cut-Transition Dynamics](https://github.com/TasirWimp/CRPM/blob/64f49017976d3fab9225954d141a6866a544ce61/docs/architecture/voyage_graphs/research_notes/CRPM_Voyage_Edge_Graph_Recursive_Cut_Transition_Dynamics_Design_Note_v0.md)

## Gemini references

- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/rate-limits
