# WP-027 Strategic-Voyage Gemini Loomkeeper

Status: **in progress; Waypoint 1 deterministic boundary implemented**
Required predecessor: completed WP-026 R8 objective-mode canary

## Product outcome

Give the Loomkeeper a coherent multi-turn strategy across Defend, Collect and
Claim through one bounded Gemini decision per turn. The practical question is:

> Given what happened, which legal action best continues or justifiably changes
> our route toward winning, and what uncertainty remains?

The server prepares legal complete-turn candidates. Gemini sees those concrete
possibilities together with the battlefield, current strategy and recent
changes, then selects a candidate and proposes strategic continuation in one
response. Target decision latency is 3–6 seconds, with a six-second whole-window
deadline and permanent deterministic R8 fallback. Faster valid answers execute
immediately; there is no artificial minimum wait.

This contract supersedes the earlier separate narrator/choice passes and large
model-facing calibration schema. CRPM alignment is expressed through observed
change, continuity, future possibilities and retained uncertainty. Gemini does
not have to reproduce CRPM terminology or operate a governance framework.

## Authority and mutable world

`MatchAuthorityKernel` owns rules, physics, objectives, terminal semantics,
legal operations, execution, replay, rewards and operational budgets. Each match
binds its kernel and policy revisions at creation. `WorldSurface` is the mutable
authoritative terrain, actors, objects, score, resources and turn state.
`WorldSurfaceProjection` is a bounded, data-only view supplied to Gemini.

Gemini can return a current candidate ID; a server-owned resolver converts it
into an internal `CandidateCapability`. Only trusted code can construct that
capability and submit it to the Loomkeeper executor. Model-facing modules cannot
import executor capabilities, operation constructors, persistence mutation or
reward/replay authority. No response can patch state, invent commands or change
the rules. Unknown, stale, cross-match or already-consumed IDs cannot execute.

Hashes and revisions identify records, bind replay and reject stale inputs.
Containment comes from this authority boundary, rather than hash comparison.
The trusted simulator, resolver and persistence path still need direct tests.

## Compact decision brief

Each stateless request contains five sections:

| Section | Content |
| --- | --- |
| Objective | Mode, winning condition, score, resources and remaining turns. |
| Battlefield | Compact ASCII overview plus actor/object locations and explicit route, support and objective relationships. |
| Current strategy | Target, next milestone, due own-turn, accepted temporary cost and conditions that would invalidate the plan. |
| Recent changes | Last executed action and its result, separately attributed player/system changes, and a few unresolved concerns. |
| Legal candidates | Stable IDs, exact immediate effects, future opportunities opened or closed, material risks and uncertainty. |

The ASCII map is a server-derived strategic overview of the live destructible
terrain. It reuses the existing terrain serialization/compiler lineage, but the
model-facing resolution may be coarser than exact replay state. Its legend and
relationship summary must preserve routes and support facts needed for choice.
Gemini does not simulate collision or infer exact landing legality from ASCII.

The server can retain detailed `WorldTransition`, pressure-envelope and
`CycleCalibration` evidence, but the request compresses it into concrete facts.
Do not build extra score systems, registries or classifications solely to fill
these records. No wallets, PEI receipts, reward identities, secrets or
player-authored prompt text enter the brief.

## Candidates connect local actions to global possibilities

Generate and simulate candidates before calling Gemini, using the previous
committed strategy while retaining alternatives from these applicable families:

- objective progress, collection and capture;
- defence, interception and denial;
- terrain opening and route creation or closure;
- survival, recovery and immediate threat response; and
- combat pressure and ring-out opportunities.

The provisional final atlas target is 8–12 meaningfully different candidates,
including the deterministic baseline. Fewer are allowed when fewer distinct
legal options exist. Waypoint 1 freezes proposal, simulation and atlas caps
from profiling; mandatory alternative coverage survives strategy bias and
pruning. Do not discard a preparatory move solely because its immediate damage
or score is lower. A candidate ID belongs to one frozen match/turn/basis atlas.

Every candidate exposes:

- exact simulated immediate consequences and irreversible effects;
- routes, support or objective opportunities it creates or removes;
- relation to the current milestone, including temporary cost;
- material opponent-response exposure and recoverable alternatives; and
- which future consequences are supported possibilities, estimates or unknown.

For example: opening a passage may enable a later chest approach while removing
an escape shelf. The immediate terrain change is exact; reaching the chest on
a later turn is conditional on the player's response. No candidate description
may present an uncertain continuation as a guaranteed result.

Internal transitions retain the operations and evidence needed for exact replay.
The model sees causal summaries rather than operation lists or every evidence ID.

## One decision and a small response

One Gemini call combines strategic continuation and candidate selection:

```json
{
  "candidateId": "c7",
  "strategy": "continue",
  "targetId": "chest",
  "milestoneId": "lower_passage_open",
  "horizonOwnTurns": 2,
  "reason": "Opening the passage enables the chest approach next turn.",
  "watchFor": "The player may destroy the landing shelf."
}
```

`strategy` is `continue`, `refine`, `repair`, `switch` or `complete`. Candidate,
target and milestone IDs come from the current request; horizons are bounded by
remaining own turns and the versioned policy. Short reason/watchFor text is
bounded diagnostic explanation, never execution authority. It is not a required
reasoning transcript. The server validates structured facts and candidate fit;
it does not pretend arbitrary prose can be fully semantically verified.

An explicit `candidateId: null` abstention variant with a bounded reason is
allowed when the provided brief is insufficient. It triggers deterministic
fallback, records the observation gap and cannot commit a strategy proposal.
Other required fields and nullability for this variant are frozen in Waypoint 1.
There are no model tools, additional provider passes or refinement-request loops.

## Patient strategy and feedback

Keep a compact `CommittedStrategicVoyage`: target, milestone, original due turn,
accepted temporary cost, invalidation conditions and bounded unresolved concerns.
The next brief carries this state explicitly; provider chat history is not
memory. Detailed logs need not be copied into each request.

Observe every turn, but preserve a feasible plan through its declared horizon.
Temporary deterioration during preparation is allowed. A contradicted route,
imminent terminal threat, missed milestone or material new opportunity provides
evidence for reconsideration. A continued or revised strategy must fit the
selected candidate's actual consequences. A justified revision retains the
original deadline/outcome in evidence instead of erasing failure.

The server separates four feedback questions without requiring a large model
response schema:

1. Did the action execute as simulated?
2. Does the brief contain the distinctions needed for a useful decision?
3. Are the strategy's necessary conditions still feasible?
4. Is its milestone progressing, not yet due, completed, unknown or failed?

Immediate execution mismatch is an integrity fault. A player destroying a route
on the subsequent turn is a new strategic fact. A setback or missed milestone
alone never disables Gemini. Operational failures, invalid output, unusable
inputs, circuit state and spend limits govern fallback.

Record the actual decision source. Deterministic fallback outcomes do not count
as failures of an unexecuted Gemini proposal. Resume external reasoning when
operational conditions permit; fallback need not improve the score first.
The first turn has explicit empty prior history and current world facts.

This is match-local feedback, not model training. Porous patience is implemented
through retained feasible commitments and bounded horizons; no additional
patience controller or governance-health subsystem is required for this slice.

## Authoritative decision cycle and recovery

1. Snapshot current surface, committed voyage and match policy.
2. Derive recent changes, compact feedback and the decision brief.
3. Generate/simulate the diverse atlas within the total planning budget.
4. Make one Gemini request, or bypass it when operational policy requires.
5. Validate the response and resolve its ID into a current internal capability;
   otherwise resolve the deterministic fallback capability.
6. Execute the capability and derive the observed world transition.
7. Reconcile the immediate prediction, then atomically commit the resulting
   surface, transition and server-validated strategic continuation.
8. Carry the observed result and subsequent player changes into the next brief.

The response's strategic update remains pending until execution witnesses it.
Fallback produces its own server-derived continuation, not the abandoned model
proposal. Once execution begins, never execute a second candidate over partially
mutated state.

Persist the selected plan and explicit pending/executing/committed status under
an idempotent turn identity. Recovery before selection uses the last committed
boundary and deterministic fallback without a provider call. Recovery after
selection reconstructs and resumes the same authorized plan from durable
progress; it never reselects or doubles its effects. A half-committed voyage
cannot become authoritative. Existing live movement/presentation must remain
smooth; atomic turn completion does not imply hiding the entire turn until it
finishes. Waypoint 1 binds this to the existing session persistence model.

Replay reconstructs the brief, candidate atlas, validated selection, immediate
predicted/observed transition and committed voyage without Gemini. Evidence
retains actual selected source, policy/model/prompt versions, basis and record
identities, operational outcome, latency, and bounded response diagnostics.
Replayed legality and results govern Daily eligibility; explanation quality
never authorizes a payout.

## Timing, failure and provider policy

The provisional budget is:

- one request per Loomkeeper turn, with no in-turn retry;
- approximately 2,000–3,000 input tokens, including the map and candidate atlas;
- approximately 150–250 visible output tokens;
- target 3–6 seconds from decision-window start to validated selection; and
- a six-second whole-window deadline covering preparation, provider latency,
  reasoning and validation. Valid faster responses execute immediately.

The token ranges and candidate count are profiling targets, not measured
performance claims. Explicit byte/token/output and simulation caps are frozen
in Waypoint 1. Configure model-supported thinking controls separately from the
visible response budget; short output does not guarantee short internal work.
Leave sufficient output capacity for valid structured responses.

Prepare a usable deterministic fallback before optional search/provider work.
Search is bounded and yields to the deadline. At expiry or invalid/absent output,
execute fallback and ignore late responses. Provider work cannot become debt for
other matches. A trusted failure that prevents even valid fallback is a server
fault, not a successful model-failure recovery.

Measure preparation, provider and validation times separately, plus total
p50/p95 latency, useful valid-answer rate before six seconds, timeout/fallback
frequency and cost. Deployed shadow must establish the achievable latency;
never claim the target from local fakes alone. Changing the six-second limit
requires an explicit contract change and phone review.

Pin an exact stable model and prompt version; do not use floating, preview or
experimental aliases for Daily. Use supported low-variance sampling settings
without claiming deterministic provider output. Keep server-only credentials,
one in-flight window per match, a deployment concurrency cap, cancellation,
circuit breaker and spend limit. Match policy stays fixed across reconnect.

```text
LOOMKEEPER_PROVIDER=deterministic
GEMINI_API_KEY=<server-side secret; absent while deterministic>
GEMINI_MODEL=<exact stable model ID; required for shadow or live Gemini>
```

Providers remain `deterministic`, `gemini-shadow` and `gemini`. Incomplete
external-mode configuration fails startup. The small server adapter owns the
transport; any SDK addition requires dependency/license/audit review.

## Waypoints and gates

### Waypoint 1 - deterministic brief and candidate boundary

Freeze the compact brief/response/abstention schema, voyage and milestone
semantics, ASCII projection, diverse candidate generation, causal summaries,
authority boundary, deadlines, size/search caps, persistence and replay records.
Implement deterministic production of these inputs without external calls.

Use paired worlds with similar summaries but different necessary routes to
check projection sufficiency. Correct missing distinctions in the server brief;
do not build a generic refinement protocol. Retain delayed-benefit candidates
and meaningful alternatives rather than ranking only immediate reward.

Implementation status, 2026-09-18: complete under automated acceptance. The
server-owned boundary projects the complete arena to a 64 by 36 `#`/`+`/`.`
map with structured actor, object and support facts; binds state, voyage and
recent changes to a stable basis; and emits 8-12 legal candidates including the
existing deterministic fallback. Current-basis IDs resolve only to one-use
internal capabilities. Selected and abstention responses, byte/search caps and
pending/executing/committed evidence are strict. The optimized detached atlas
reuses current R7 combat mechanics while applying R8 objective motion/contact;
its immediate fields match an authoritative R8 complete turn in regression.
Local preparation measured about 1.4 seconds, which is feasibility evidence,
not a deployed latency claim. No coordinator path or provider calls this module
yet. Waypoint 2 owns that integration.

### Waypoint 2 - single-call adapter with local fakes

Implement the bounded call and strict response validation. Verify current/stale/
cross-match IDs, abstention, malformed and malicious output, late responses,
no retries, deadline fallback, circuit/spend limits and forbidden dependencies.
Cover pending versus committed voyage, original milestone deadlines, temporary
costs, player counteractions, correct fallback attribution, crash recovery,
reconnect and exact provider-free replay. Profile local preparation and request
sizes. Fakes prove behavior, not deployed latency or model strategy quality.

### Waypoint 3 - deployed shadow and bounded strategy probes

In shadow, the deterministic Loomkeeper acts. Measure schema/factual validity,
candidate plausibility, brief sufficiency, latency and cost. Gemini's proposed
but unexecuted action cannot claim the ensuing player's response as evidence of
its effectiveness. Trace selected-source attribution explicitly.

Use a small fixed scenario set for five behavioral probes:

1. Choose preparation with an immediate cost that enables a later objective.
2. Continue a feasible plan through its declared temporary setback.
3. Repair or switch when the player destroys a necessary route.
4. Recognize when an attractive local action closes a valuable future option.
5. Acknowledge insufficient information rather than inventing a missing fact.

For probe 5, valid observed behavior is abstention or a conservative legal
choice that explicitly acknowledges the gap in bounded diagnostic text.
Use primary direct review of choices and consequences, not explanation quality
alone. Separately labeled detached continuations under declared opponent
policies may test delayed benefits; they remain bounded counterfactual evidence.

Freeze the scenario fixtures and release thresholds for on-time useful answers,
fallback rate and strategic behavior before collecting acceptance results. Use
matched deterministic baselines. If results miss the target, simplify the brief,
fix candidate coverage or adjust supported model settings and retest the affected
probes. Do not respond by adding another conceptual layer by default.

### Phone Gate A - live Gemini Practice

Enable live Gemini only in the R8 Practice canary. Across Defend, Collect and
Claim, verify:

1. coherent pursuit of the objective over several turns;
2. preparation and continuation through a reasonable temporary cost;
3. repair/switch after a player action invalidates a necessary route;
4. legal world-shaping actions with visible consequences matching simulation;
5. decision waits within the six-second bound, with smooth controls/presentation;
6. close/reopen preserves the same match, selected action and committed strategy;
7. controlled provider failure falls back and finishes the match; and
8. operational recovery permits Gemini to resume without requiring fallback to
   improve the score.

Live Practice establishes realized multi-turn behavior. Shadow evidence cannot
substitute for this gate.

### Final promotion and Phone Gate B

After replay, latency, fallback and live Practice acceptance, promote the exact
R8 ruleset and WP-027 policy identity to standard Practice and Daily. The player
chooses Defend, Collect or Claim before Daily creation. The mode is immutable;
one started Daily and consumed PEI receipt apply across all modes.

Phone Gate B completes one Practice per mode, resumes a strategically changed
match, tests provider fallback and completes eligible Daily wins covering chest
and coin results under the approved temporary development repeat override.
Restore the safe one-Daily limit, helper state, provider/spend settings and fixed
1 NIM reward path afterward.

## Verification and scope

Automated acceptance covers the deterministic brief and candidate boundary,
causal fact derivation and uncertainty, alternative coverage, five strategy-probe
fixtures, strict response handling, deadline and circuit behavior, source-correct
feedback, atomic recovery, replay, server-only secrets, current R8 Practice/Daily
journeys and reward settlement. Runtime work retains change-selected types,
build, smoke, browser, security and bundle checks. Routine CI uses local fakes;
PostgreSQL, deployed Gemini, phone and Ubuntu visual gates remain separate.

Defer model-requested observation/search refinement, a separate narrator pass,
large model-authored commitment/pressure schemas, scalar strategy scores,
automatic strategic-divergence disable and governance-health controllers.
Reopen only when a concrete failure demonstrates the need. Preserve existing
R8 physics, objective layouts, art, PEI admission and sponsor-funded reward rules.
No model-authored commands, maps, objects or player-facing prose are introduced.

## Definition of done

WP-027 closes when the three waypoints, live Practice Gate A and final
Practice/Daily Gate B pass; the five behavioral probes show local-to-global
reasoning through choices and consequences; measured latency and fallback meet
the prospectively declared criteria; replay and reconnect work without Gemini;
the model cannot reach invariant authority; safe deployment settings are
restored; selected checks and package evidence pass; and housekeeping agrees
with the execution pointer.

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
