# WP-027 Strategic-Voyage Model Loomkeeper

Status: **in progress; expanded Mistral high-reasoning shadow gate failed, live selection blocked**
Required predecessor: completed WP-026 R8 objective-mode canary

## Product outcome

Give the Loomkeeper a coherent multi-turn strategy across Defend, Collect and
Claim through one bounded external-model decision per turn. The practical question is:

> Given what happened, which legal action best continues or justifiably changes
> our route toward winning, and what uncertainty remains?

The server prepares legal complete-turn candidates. The provider sees those concrete
possibilities together with the battlefield, current strategy and recent
changes, then selects a candidate and proposes strategic continuation in one
response. Target decision latency is 3–8 seconds, with an eight-second whole-window
deadline and permanent deterministic R8 fallback. Faster valid answers execute
immediately; there is no artificial minimum wait.

This contract supersedes the earlier separate narrator/choice passes and large
model-facing calibration schema. CRPM alignment is expressed through observed
change, continuity, future possibilities and retained uncertainty. The model does
not have to reproduce CRPM terminology or operate a governance framework.

## Authority and mutable world

`MatchAuthorityKernel` owns rules, physics, objectives, terminal semantics,
legal operations, execution, replay, rewards and operational budgets. Each match
binds its kernel and policy revisions at creation. `WorldSurface` is the mutable
authoritative terrain, actors, objects, score, resources and turn state.
`WorldSurfaceProjection` is a bounded, data-only view supplied to the provider.

The provider can return a current candidate ID; a server-owned resolver converts it
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
The model does not simulate collision or infer exact landing legality from ASCII.

The server can retain detailed `WorldTransition`, pressure-envelope and
`CycleCalibration` evidence, but the request compresses it into concrete facts.
Do not build extra score systems, registries or classifications solely to fill
these records. No wallets, PEI receipts, reward identities, secrets or
player-authored prompt text enter the brief.

## Candidates connect local actions to global possibilities

Generate and simulate candidates before calling the provider, using the previous
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

One provider call combines strategic continuation and candidate selection:

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
alone never disables external reasoning. Operational failures, invalid output, unusable
inputs, circuit state and spend limits govern fallback.

Record the actual decision source. Deterministic fallback outcomes do not count
as failures of an unexecuted provider proposal. Resume external reasoning when
operational conditions permit; fallback need not improve the score first.
The first turn has explicit empty prior history and current world facts.

This is match-local feedback, not model training. Porous patience is implemented
through retained feasible commitments and bounded horizons; no additional
patience controller or governance-health subsystem is required for this slice.

## Authoritative decision cycle and recovery

1. Snapshot current surface, committed voyage and match policy.
2. Derive recent changes, compact feedback and the decision brief.
3. Generate/simulate the diverse atlas within the total planning budget.
4. Make one provider request, or bypass it when operational policy requires.
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
predicted/observed transition and committed voyage without the provider. Evidence
retains actual selected source, policy/model/prompt versions, basis and record
identities, operational outcome, latency, and bounded response diagnostics.
Replayed legality and results govern Daily eligibility; explanation quality
never authorizes a payout.

## Timing, failure and provider policy

The provisional budget is:

- one request per Loomkeeper turn, with no in-turn retry;
- approximately 3,500–5,500 input tokens, including the map, candidate atlas and deltas;
- approximately 150–250 visible output tokens;
- target 3–8 seconds from decision-window start to validated selection; and
- an eight-second whole-window deadline covering preparation, provider latency,
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
p50/p95 latency, useful valid-answer rate before eight seconds, timeout/fallback
frequency and cost. Deployed shadow must establish the achievable latency;
never claim the target from local fakes alone. Changing the eight-second limit
requires an explicit contract change and phone review.

Pin an exact stable model and prompt version; do not use floating, preview or
experimental aliases for Daily. Use supported low-variance sampling settings
without claiming deterministic provider output. Keep server-only credentials,
one in-flight window per match, a deployment concurrency cap, cancellation,
circuit breaker and spend limit. Match policy stays fixed across reconnect.

```text
LOOMKEEPER_PROVIDER=deterministic
LOOMKEEPER_PROVIDER=mistral-shadow
MISTRAL_MODEL=mistral-small-2603
MISTRAL_API_KEY=<server-side secret; required only for Mistral shadow>
```

Provider modes are `deterministic`, `mistral-shadow`, `gemini-shadow` and the
pre-existing `gemini`. Mistral is shadow-only until its fixed gate passes;
Gemini remains for historical replay and evidence continuity. Incomplete
external-mode configuration fails startup. The small server adapter owns each
direct REST transport; any SDK addition requires dependency/license/audit review.

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

Implementation status, 2026-09-18: complete under automated acceptance. A
data-only local-fake adapter now owns one strict request, the remainder of the
six-second whole-window deadline, response-byte validation, abort, concurrency,
request-budget and circuit-breaker bounds. It never receives an executor,
replay authority, session capability or secret. The R8 coordinator stops
logical time while the call is pending, validates the response against the
current brief and activates only a current-basis one-use capability. Candidate
selection and the pending voyage are retained together before execution; the
record becomes committed only after the resulting turn has an observed state.
Abstention, invalid output, timeout, provider failure and every open guard use
the same deterministic fallback with explicit source attribution and no retry.

R8 replay now carries the policy identity and at most eight strategic-turn
records. It reconstructs exact local-fake choices from retained evidence
without a provider, rejects changed evidence, and accepts a final replay prefix
whose provider call had not committed before deletion so recovery can replan.
The next brief receives separately attributed player and system changes while
continuation preserves the original milestone deadline and declared temporary
cost. Current R7 Practice and Daily behavior remain unchanged. No Gemini SDK,
API key, external request, provider configuration or public R8 promotion exists
in this waypoint. Waypoint 3 is the next implementation slice.

### Waypoint 3 - deployed shadow and bounded strategy probes

In shadow, the deterministic Loomkeeper acts. Measure schema/factual validity,
candidate plausibility, brief sufficiency, latency and cost. The provider's proposed
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

Original provider implementation status, 2026-09-19: the server-only Waypoint 3
path was implemented for the exact stable
`gemini-3.6-flash` model through direct `generateContent` REST, structured JSON
output and `low` thinking. It adds no SDK dependency. The API key exists only in
the server process; quality runs reject external-provider activation and the
client-bundle security scan rejects both the key name and Google provider
endpoint. Current R7 Practice and Daily never enter this adapter. Only private
R8 objective matches consult it.

`gemini-shadow` retains the validated proposal, model identity, source,
preparation/provider/validation times, token usage and estimated
[documented cost](https://ai.google.dev/gemini-api/docs/pricing)
while authorizing only the deterministic candidate and voyage. The sanitized
observation is emitted as soon as validation succeeds, so closing a match before
execution cannot hide an incurred call or make the proposal claim an observed
result. Prompt prose,
wallet/session identity, raw errors and credentials never enter operational
logs. Replay reconstructs the retained shadow proposal without calling Gemini.
The one-call adapter keeps the eight-second total deadline, two-request deployment
concurrency, 250-request process budget, cancellation, no retry and a
three-failure/60-second circuit breaker. Google documents the pinned model as
[stable](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash), the
[structured-output contract](https://ai.google.dev/api/generate-content), and
the supported [`low` thinking level](https://ai.google.dev/gemini-api/docs/generate-content/thinking).

The first ad hoc deployed Collect trace on 2026-09-18 was diagnostic rather
than the fixed five-probe gate. Its six observations retained deterministic
authority throughout, but produced only one valid selection alongside two
timeouts, one provider error, one invalid response and one circuit-open
fallback. The trace exposed that `timingMs.total` omitted preparation whenever
provider time was longer, and that a generic provider-error label could not
separate a rate limit, HTTP rejection, network failure or abort. The corrected
adapter now requires total time to equal preparation plus provider plus
validation, emits only allowlisted operational categories, and still discards
provider bodies, raw exceptions and credentials. This trace does not satisfy
shadow acceptance; collect a fresh fixed probe artifact after deploying the
correction.

Operational refinement, 2026-09-19: the first follow-up deployment using
`gemini-3.8-flash` returned two `provider_http_unavailable` results and one
timeout across three calls. This points to provider availability rather than a
free-tier quota response, which Google reports separately as HTTP 429. The
bounded next candidate is stable `gemini-3.6-flash`, selected for its documented
speed, token efficiency and agentic-loop fit while retaining structured output
and `low` thinking. The exact-model startup guard now rejects 3.8. The prompt,
five fixtures, thresholds, six-second deadline, no-retry rule, circuit breaker
and deterministic shadow authority are unchanged, so the next fixed artifact
measures only the provider-model replacement. `gemini-3.5-flash-lite` remains a
possible later latency candidate and is not admitted by this implementation.

The five fixtures and acceptance thresholds are frozen in
`loomkeeper-strategy-probes-v10-r8.ts` before any deployed result is collected:

- exactly five one-call probes, with no retry;
- at least four schema- and fact-valid responses and four useful choices;
- at least four responses inside eight seconds, p95 no greater than eight seconds,
  and at most one operational provider fallback;
- zero shadow authority violations; every executed choice remains the matched
  deterministic baseline; and
- at most USD 0.10 estimated total cost for the next five-call set. Earlier
  artifacts retain their frozen USD 0.05 threshold and are not rescored.

The report includes the fixed basis/brief/atlas hashes, matched deterministic
candidate, proposed candidate, bounded reason/watch text, strategy, source,
timings and usage for direct review. It does not score explanation style. Run it
only with one complete shadow configuration through
`node --import tsx scripts/run-wp027-shadow-probes.ts`; the sanitized artifact is
written to `test-results/wp027-shadow-probes.json`. Passing local-fake coverage
proves the harness, while only this real deployed run can establish latency,
cost and model strategy quality.

Deployed gate result, 2026-09-19: the exact five-call `gemini-3.6-flash` run
failed without retry. The captured [sanitized result](../evidence/wp-027-shadow-gate-gemini-3.6-v1/result.json)
recorded 2/5 valid responses, 0/5 useful choices, three provider fallbacks, 5/5
responses inside the recorded deadline, zero authority violations, 3,548 ms p95
and USD 0.009801 estimated cost. The valid temporary-cost response chose the
immediate coin-scoring fallback rather than a candidate carrying the rubric's
short-term cost. The valid future-option response acknowledged terrain risk but
chose the 32-cell-damage fallback rather than the one-cell-damage candidate.
One response failed strict validation and two ended as provider errors.

Direct review also found that this artifact cannot yet substantiate two of its
operational claims. The probe result omits the allowlisted diagnostic, so its
provider errors cannot be classified. The runner constructs the fixtures before
calling the adapter and passes preparation as zero, so the reported p95 excludes
the 2.4-2.7 second preparation observed in live phone traces. Treat the latency
and failure-category fields as incomplete evidence. Before another paid or free
provider run, carry diagnostics into the sanitized probe result, measure the
whole preparation/provider/validation window, align the provider JSON schema's
text bounds with the strict 160-character runtime contract and directly review
whether the temporary-cost fixture actually exposes a defensible delayed
benefit. Do not change the frozen thresholds, rerun this gate or enable live
Gemini until those measurement and fixture issues are corrected.

Measurement refinement, 2026-09-19: the next runner version now retains the
record's sanitized diagnostic beside each probe result. It constructs the fixed
world and narrative context before the decision window, then measures the same
planner and strategic-boundary work counted as preparation in live R8 matches;
that duration reduces the provider's remaining six-second budget and contributes
to total and p95 time. The temporary-cost fixture now carries a committed
`coin-1` route, an explicit accepted distance cost and facts explaining why
taking the nearby coin closes the only later route. Its usefulness check also
requires continuing or refining that same target and milestone. Google supports
only a subset of JSON Schema string constraints, so the transport uses supported
property descriptions plus the system instruction to state the 160-character
limit while the server retains strict validation. Thresholds, no retry,
deterministic shadow authority and the preserved failed artifact are unchanged.
Because the system instruction changed, the exact prompt identity advances to
`v10-r8-strategic-prompt-r2`. The preserved failed artifact remains immutable
`r1` evidence; private `r1` replay is not promoted across the policy change.
Focused and change-selected verification passed once with zero retries. No
provider call is authorized until this refinement is deployed.

Corrected deployed gate result, 2026-09-19: exact prompt `r2` ran once with
zero retries and preserved deterministic authority. The captured
[sanitized result](../evidence/wp-027-shadow-gate-gemini-3.6-v2/result.json)
records 4/5 valid responses, 1/5 useful choices, 5/5 on-time results, one
provider fallback, zero authority violations, 5,999 ms p95 and USD 0.013213
estimated cost. Validity, on-time count, fallback count, authority, p95 and cost
meet the frozen thresholds; usefulness does not meet its required 4/5.

The temporary-cost call used 3,461 ms for preparation and exhausted the
remaining provider window at 5,999 ms. The continuation response switched from
the still-feasible committed `coin-1` route to immediate `coin-3` scoring. The
destroyed-route response correctly repaired. The future-option response claimed
to preserve the route while choosing a higher-destruction action, and the
information-gap response ignored the stated missing support fact. All four
valid responses selected `c01`, which is both first in the candidate list and
explicitly marked as the deterministic fallback.

Treat this as a boundary-design finding rather than evidence to strengthen the
prompt or change models immediately. The operational fallback designation is
server authority metadata, but its model-facing position and label confound the
strategy test. The candidate atlas also reports generic terrain opportunities
and risks instead of an evidenced strategy-relative consequence such as route
preserved, route closed or unknown because support evidence is missing. Review
those two inputs and the one-millisecond p95 margin before authorizing another
five-call artifact. Do not rerun the unchanged gate; live Gemini remains blocked.

Candidate-delta and neutral-presentation refinement, 2026-09-20: the owner
authorized bundling the two boundary corrections and widening the previous
six-second ceiling to eight seconds. Exact prompt identity advances to
`v10-r8-strategic-prompt-r3` and brief revision to
`v10-r8-strategic-brief-r2`; private older-policy R8 matches are not migrated.
The current 64x36 battlefield remains the shared before-state. Every legal
candidate now adds a bounded `worldDelta` with compact changed-row spans encoded
as `y:xStart-xEnd:before>after`, structured actor/object after-facts and the
committed target's resulting status, support, position and Loomkeeper distance.
The server reports only simulated facts; it does not invent a route-preserved or
route-closed label when reachability has not been computed. Each candidate's
ASCII delta is capped at 512 bytes with an explicit truncation flag, and the
whole brief is capped at 24,576 bytes.

The model-facing candidate no longer contains `deterministicFallback`. Candidate
ID assignment and presentation order use separate basis-derived deterministic
orders, so neither a stable identifier nor first position reveals fallback
identity. The server boundary alone retains the fallback candidate ID and still
mints the same current-basis one-use capability. Shadow authority, no retry,
concurrency, request budget, circuit breaker and strict response validation are
unchanged. The eight-second deadline and p95 threshold are the only timing-policy
changes. Local diagnostics across the five probes produced 16.2-18.7 KB briefs,
1-7 ASCII delta rows per candidate with no truncation, varied first/fallback IDs
and roughly 1.1-1.3 seconds of preparation on the development host. A new real
five-probe artifact is required before Phone Gate A; no provider call occurs in
local verification.

Dynamic gameplay-contract refinement, 2026-09-20: prompt identity advances to
`v10-r8-strategic-prompt-r4`; brief revision remains `v10-r8-strategic-brief-r2`.
Every request now explains the shared world before asking for a decision:
NIMble Knots is a turn-based 2D tactics game, the player and Loomkeeper
alternate turns, each candidate is one complete server-simulated Loomkeeper
turn, terrain destruction changes support/routes/landings, actors can lose
stitching or fall out, and physical coins/chests fall with their support but
cannot be destroyed by weapons. The contract identifies the battlefield as the
before-state and each `worldDelta` as one candidate's predicted after-state. It
also tells Gemini that a temporary local cost can support a stronger multi-turn
route.

The mode clause is derived solely from `brief.objective.mode`. A Collect request
explains only the coin race, a Defend request only the Loomkeeper attack on the
player's chest, and a Claim request only the Loomkeeper defence of its chest.
The two unselected mode descriptions are absent. The brief still carries the
specific winning condition and live score/state. Candidate generation,
fallback authority, timing, thresholds and response validation are unchanged.
The next deployed five-probe artifact must therefore use exact prompt r4; r3
must not be deployed or measured as the current prompt.

Deployed r4 gate result, 2026-09-20: exact prompt r4 ran once with zero retries.
The [sanitized result](../evidence/wp-027-shadow-gate-gemini-3.6-v3/result.json)
records 2/5 valid responses, 1/5 useful choices, three provider fallbacks, 5/5
on-time results, zero authority violations, 7,358 ms p95 and USD 0.010722
estimated cost. It fails the minimum-valid, minimum-useful and
maximum-provider-fallback thresholds. All three invalid calls are classified
`provider_http_unavailable`; the bounded diagnostic identifies an unavailable
HTTP response but cannot distinguish upstream capacity, account tier or another
provider-side cause. Do not infer a free-tier cause from this artifact alone.

The two returned decisions show mixed strategy evidence. Destroyed-route repair
selected a low-destruction jump that ends adjacent to the active chest and meets
the repair rubric. Temporary-cost preparation continued the named strategy but
selected `c08`, which gains one coin and ends 67 distance units closer to the
objective; it therefore does not accept the fixture's explicit immediate cost.
Its prose claims route preservation, but the supplied facts do not establish
that route claim. Because three fixtures produced no model decision, this gate
cannot measure the gameplay contract's overall strategy effect. Preserve the
failed artifact and do not rerun the unchanged gate. Resolve the provider
reliability decision before another strategy or prompt change.

Mistral replacement implementation, 2026-09-20: the next provider comparison
uses exact stable `mistral-small-2603` as `mistral-shadow`. Its server-only
direct Chat Completions REST transport sends the same prompt-r4 dynamic game
contract, bounded brief and strict selected-or-abstain JSON schema with
`reasoning_effort=high` and a 4,096-token completion cap. The adapter parses one complete structured answer, Mistral token
usage and the current USD 0.15 input/USD 0.60 output per million-token cost
estimate. It keeps the shared eight-second deadline, no retry, cancellation,
two-request concurrency limit, request budget and circuit breaker. The Bearer
credential and `api.mistral.ai` endpoint are rejected by the client-bundle
security scan.

`mistral-shadow` has its own explicit replay/provider identity and cannot receive
execution authority. The five-probe runner now takes the exact model identity
from the configured shadow adapter, so Gemini and Mistral artifacts cannot be
mislabelled. Gemini remains available for historical evidence continuity. No
live Mistral mode is implemented; one zero-retry deployed Mistral five-probe
gate must meet the existing frozen thresholds before live authority is added.
Focused transport/authority/security coverage and the full change-selected gate
passed with no real provider call. The first selector attempt correctly stopped
at a supported-test inventory assertion after discovering the new Mistral test;
the inventory was corrected and only that failed tooling case was rerun before
one full selector pass on the changed fingerprint.

Deployed Mistral operational evidence, 2026-09-20: the first fixed gate
[artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v1/result.json) records
0/5 valid and useful calls, 5/5 on time, five fallbacks, zero authority
violations and no charged tokens. Its first three requests were classified
`provider_http_rate_limited`, after which the circuit opened. The account's
direct response reported a zero-request allowance, so this run reached no
model inference and provides no strategy evidence.

After pay-as-you-go was enabled, the second unchanged gate
[artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v2/result.json) again
records 0/5 valid and useful calls, 5/5 on time, five fallbacks, zero authority
violations and no charged tokens. This time the first three requests were
classified `provider_http_request_rejected`, followed by the circuit opening.
A minimal direct request then succeeded against exact `mistral-small-2603` and
reported 100 requests and 100,000 tokens per minute. That separates account
capacity from the full request rejection: the credential, model and paid
allowance work, while the structured request contract does not.

Mistral compatibility correction, 2026-09-20: strict structured output now
receives a provider-specific top-level `object` schema with
`additionalProperties: false`, all seven properties required and the five
selection fields plus `watchFor` nullable. This matches Mistral's strict schema
shape while remaining only a wire-format superset. The shared server validator
still requires either all five selection fields plus a reason, or all five
selection fields and `watchFor` null plus an abstention reason; any mixed form
is rejected and the deterministic fallback remains authoritative. The dynamic
prompt-r4 gameplay contract, brief-r2 content, exact model, eight-second
window, no-retry rule, probe thresholds and candidate authority do not change.
The two failed artifacts remain immutable. Once this correction passes local
verification and is deployed, one new five-probe gate is allowed because the
provider request input has changed.

Local correction verification passed with zero retries and no external call:
types; 29/29 focused Mistral, Gemini, provider and voyage cases; all 299
selected server units; fresh build, built smoke, identity/reward security and
bundle limits; and 19/19 canonical Chromium phone journeys. PostgreSQL retained
its expected missing-local-URL prerequisite skip. Performance, visual, retired
legacy, daily and release coverage were not selected. The next action is to
deploy this commit and run the changed-input five-probe Mistral gate once.

Deployed schema-correction result and exact diagnostic, 2026-09-20: the
[third artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v3/result.json)
again records 0/5 valid and useful calls, 5/5 on time, five fallbacks, zero
authority violations and no token cost. The first three requests were rejected
in 136-215 ms, followed by the circuit opening. A separate request built from
the exact first-probe body returned provider code 3051: `reasoning_effort=low`
is unsupported for exact `mistral-small-2603`; its accepted values are `none`
and `high`. The schema correction was therefore not exercised by inference.

The transport now selects supported `high` reasoning. `none` would optimize
latency by removing the deliberate reasoning that this strategic gate is meant
to assess. The frozen eight-second whole-window threshold remains the
operational constraint: if `high` cannot return at least four useful valid
answers within it, Mistral Small 4 does not qualify. Prompt r4, brief r2,
schema, probes, thresholds, no-retry policy and deterministic authority remain
unchanged. The third artifact is immutable; one new deployed gate is allowed
only after this parameter correction is verified and deployed.

Focused local verification passed with zero retries and no external request:
types, 5/5 Mistral transport cases, all 74 work-package records and repository
housekeeping. The broad selector, build, browser and PostgreSQL paths were not
repeated because the immediately preceding full selector covers the unchanged
runtime and the correction changes only the asserted request literal.

Deployed high-reasoning result, 2026-09-20: the preserved
[v4 artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v4/result.json)
records 0/5
valid and useful calls, 3/5 on time, five fallbacks, zero authority violations,
8,001 ms p95 and no captured token cost. A separate exact first-probe request
proved that the schema and request are accepted with HTTP 200. It consumed
6,378 prompt tokens and all 2,048 completion tokens, returned
`finish_reason=length`, and contained a closed thinking block without a final
text answer. The provider therefore performed extensive analysis but supplied
no decision that the server could validate or execute.

The bounded correction uses the only remaining supported setting,
`reasoning_effort=none`. Raising the completion budget or deadline for `high`
would work against the operational 3-8 second decision envelope and still
would not guarantee a final answer. Direct mode removes the provider reasoning
trace while retaining the r4 strategic instructions, full brief, candidate
after-states, strict validator and deterministic fallback. The same five
usefulness probes must establish whether those inputs are sufficient for
multi-turn judgment. Thresholds, model, prompt, schema, no-retry policy and
authority remain unchanged. The full high-gate artifact was recovered before
the next deployment. The planned `none` gate was superseded by the owner's
expanded high-reasoning trial below.

Focused local verification passed with zero retries and no external request:
types, 5/5 exact Mistral transport cases, all 74 work-package records and
repository housekeeping. Broad product coverage was not repeated because the
only runtime change is the asserted provider request literal and the preceding
full selector covers all unchanged paths.

Owner-authorized bounded trial, 2026-09-22: restore supported `high` reasoning
and double Mistral's completion cap from 2,048 to 4,096 tokens. Double the
five-probe estimated-cost acceptance ceiling from USD 0.05 to USD 0.10. This
supersedes the preceding direct-answer recommendation for the next gate; the
earlier high result remains a failed historical observation. The eight-second
whole-window deadline, five fixtures, validity/usefulness thresholds, one-call
no-retry rule, strict server validator and deterministic shadow authority are
unchanged. The cost figure is a post-run acceptance ceiling, not a billing
stop; a timed-out provider request may incur tokens without returning usage.
Only one changed-input deployed gate is planned after local verification.

That gate ran once on the live Render deployment of commit `45a5c47` on
2026-09-22. The [sanitized v5 artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v5/result.json)
failed at 2/5 valid, 0/5 useful and three provider deadline fallbacks. Both
completed replies fit the expanded token budget and the captured estimated
cost was USD 0.002732, below USD 0.10; the three timed-out calls returned no
usage. The repair proposal selected `refine` where the destroyed route called
for repair or switch. The preserve-option proposal removed more terrain than
the least destructive legal candidate. All five probes retained deterministic
shadow execution and zero authority violations. Timed-out calls count as on
time at the inclusive eight-second bound, so the 5/5 on-time field does not
mean five usable replies. Do not repeat this unchanged gate or promote Mistral
to live authority on this evidence.

Owner-authorized expanded Mistral trial, 2026-09-22: give the provider a full
60 seconds after deterministic preparation, retain supported `high` reasoning,
and omit the explicit completion-token field. Remove the Mistral process-wide
request budget, concurrency ceiling and failure circuit, plus the Mistral
five-probe p95 and estimated-cost acceptance ceilings. The transport no longer
rejects a response solely because its reasoning payload exceeds the previous
64 KB body limit. Keep the fixed five distinct probes, strict selected-or-
abstained validation, one request per decision without automatic retry,
same-match deduplication, cancellation and deterministic shadow authority.
Record actual preparation and provider time, including totals beyond one
minute. This is a changed-input Mistral-only experiment; Gemini retains its
existing envelope. The provider and hosting platform may still impose their
own context, rate and connection limits. Review the new five-probe result
before considering live authority or a player-facing wait this long.

The single changed-input deployed gate ran on Render deployment
`dep-dap0u2jtqb8s73eu8kj0` from commit `d59fa54`. Its
[sanitized v6 artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v6/result.json)
records 5/5 valid replies, 2/5 useful choices, 5/5 completed before the new
provider deadline, zero provider fallbacks, zero authority violations, 31,603
ms p95 total decision time and USD 0.013502 captured estimated cost. Continuing
through a feasible setback and switching after route destruction passed. The
temporary-cost proposal moved 100 units farther from its committed `coin-1`
(500 to 600), although `objectiveDistanceDelta` increased by 100 toward the
different, nearer `coin-6`; it also removed 32 terrain cells. The
preserve-option proposal removed 32 cells when a legal one-cell option existed.
The information-gap reply neither acknowledged the missing fact nor selected
the hidden deterministic fallback. The v6 gate therefore fails the 4/5 usefulness
requirement despite solving v5's response-completion failure. Do not repeat
this unchanged gate or promote Mistral to live authority on this evidence.

The owner-authorized visual-grounding comparison renders only the current
server-owned 64x36 battlefield ASCII as a deterministic high-contrast PNG,
with one cell per 16x16 pixels and distinct terrain, actor and objective
markers. Send it as a base64 image part alongside the unchanged structured
brief and candidate after-state facts in Mistral's shadow request. The short
image legend explains that the PNG repeats the coarse ASCII view; exact
positions, support, outcomes and legality still come from the structured
brief. Record the visual-input version separately from the unchanged shared
`r4` prompt identity so Gemini and existing private replay remain unaffected.
It renders neither game art nor candidate after-state images. The locally
inspected [battlefield preview](../evidence/wp-027-shadow-gate-mistral-small-4-v7/battlefield-preview.png)
shows the full coarse arena and distinct actor/objective markers.

The single deployed comparison ran on Render deployment
`dep-dap3mk5g1s2s739aate0` from commit `717b226`. The
[sanitized v7 artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v7/result.json)
has the same five fixture identities and thresholds as v6. It records 5/5
valid responses, 1/5 useful choices, 5/5 responses before the 60-second
provider deadline, zero provider fallbacks, zero authority violations,
20,543 ms p95 total decision time and USD 0.010369 captured estimated cost.
The only useful choice switched after route destruction. The temporary-cost
reply again said it moved away from the committed `coin-1`, which its selected
`c01` did (500 to 600), while also moving 100 units closer to the different
nearest coin and removing two terrain cells. The feasible-setback reply
switched to immediate coin scoring instead of continuing the commitment.
The future-option reply claimed route preservation but selected `c02`, which
removed 32 terrain cells where a legal one-cell option existed. The
information-gap reply selected immediate scoring without acknowledging the
missing support fact. The image did not improve the fixed usefulness count.
It reduced this sample's p95 by 11,060 ms
and captured estimated cost by USD 0.003133, but five non-randomized calls
cannot establish an image-caused latency or cost improvement. Preserve this
failed gate; do not repeat unchanged inputs or promote live authority.

Owner-authorized candidate-path comparison: the v7 image repeated the whole
before-state terrain but left each selectable turn's motion implicit. Capture
small, ordered actor waypoints and exact projectile impact from the same
detached complete-turn rollout that supplies the legal candidate after-facts.
Render one sparse lane per candidate: start/end and motion path, shot vector,
impact, active objective markers, player position and terrain-removal marks.
Mistral receives the matching structured path atlas and exact candidate
consequences. Remove the full battlefield ASCII and changed-row spans from
its model-facing presentation while retaining structured actor/object facts,
strategy, recent changes and the active mode contract. The server makes no
uncomputed claim that a future route is preserved or reachable. First prove
every displayed waypoint belongs to the authoritative rollout, inspect the
rendered sheet, and run the same five deployed shadow probes once as a new
input version. Gemini's original brief/prompt and all server execution/replay
authority remain unchanged. A passing gate would still require a separate
live Practice authorization.

The candidate-path implementation passed local types, focused authoritative
turn/request tests, change-selected build and smoke, and all 19 supported
Chromium phone journeys. A deterministic [path-sheet preview](../evidence/wp-027-shadow-gate-mistral-small-4-v8/candidate-path-preview.png)
was visually inspected. Render deployed `4aa1976` as
`dep-dap4v0f40ujc73bj8lig`, then the unchanged five scenarios ran once.
The [v8 artifact](../evidence/wp-027-shadow-gate-mistral-small-4-v8/result.json)
matches the deployed SHA-256
`F46AE2F56AE2A090C2066F564F8B1279F3C51B333B0D9C67CD22A4AE90029AF0`.
It failed strategic acceptance at 2/5 useful against the prospective 4/5
threshold, although all five responses were valid and on time with zero
fallbacks and authority violations. Setback continuation and destroyed-route
switching passed. The temporary-cost choice did move farther from its
committed `coin-1` (500 to 600); the positive 100-unit `objectiveDistanceDelta`
refers to the different nearest coin. Future-option preservation again
selected 32 removed terrain cells while a one-cell alternative existed; and
the information-gap answer neither acknowledged the missing support fact nor
abstained or selected the hidden deterministic fallback. The same fixture identities
made v6 2/5 and v7 1/5 useful. These five non-randomized calls do not show a
causal improvement. Mistral input tokens rose from 34,908 across v7 to 39,449
across v8, so the visual simplification did not reduce request token use.
Keep Mistral shadow-only; do not repeat these unchanged inputs or promote live
authority on this result.

Cross-gate scoring correction, 2026-09-22: the v6, v7 and v8 artifacts share
exactly the same five fixture identities and thresholds. Their recorded useful
counts are 2/5, 1/5 and 2/5. The scorer marks temporary-cost preparation false
in all three, but its `temporaryCost` predicate checks `objectiveDistanceDelta`,
which `targetFor` computes against the nearest active coin rather than the
committed target. All three selected turns end 100 units farther from the
committed `coin-1`, matching the accepted distance cost; the earlier
interpretation that they moved closer to that coin was wrong. The artifacts
omit provider target/milestone fields, so this review cannot reconstruct all
remaining predicates or upgrade a recorded result. Nor does a distance loss
prove that the future route survives. The preserve-option scorer uses minimum
terrain removal as a proxy, without computing whether removed cells sever the
route; its selected `c02` consistently removes 32 cells versus a one-cell
alternative, gains 39 units toward the chest and reduces player stitching by
seven. The information-gap responses never acknowledge the missing support
fact, but the hidden deterministic fallback is not identifiable to the model;
abstention remains the available conservative response. The two frequently
passing rules are narrower: repair accepts any `repair`/`switch` label (v8's
passing choice removed 61 cells while another candidate reached the same chest
distance with two), and setback continuation checks strategy/target/milestone
without grading the selected turn's tactical consequences. These scores are
useful diagnostics, not a measured 40-percent strategic success rate. The
visual changes have not resolved the route-witness and uncertainty problems.

Probe rubric `v10-r8-probe-r2` corrects the local harness before any further
shadow comparison. Temporary-cost preparation now measures before/after
distance to the *committed* target and retains the required target and
milestone match. Each new probe row records the proposed target and milestone
for review. The preserve-option fixture names a witnessed upper ledge
(terrain cells x120-134, y26-27); the scorer reads those exact cells from each
candidate's authoritative completed terrain and accepts only a selection that
keeps all 30 cells. This is a bounded physical support witness, not proof that
the whole future route is reachable or that the selected strategy is globally
best. Its own before/after cell counts appear in each new probe row. The old
v6-v8 artifacts and their 2/5, 1/5 and 2/5 scores retain their original rubric;
they are not retrospectively rescored or directly comparable to a new rubric
result. The remaining repair, continuation and information-gap probes keep
their existing checks; a passing five-probe gate remains necessary but cannot
alone establish multi-turn live quality.
Mistral's current path sheet shows removed-terrain horizontal positions but
not their exact source rows; a failed ledge choice can therefore expose a
presentation gap as well as a strategy error. Inspect the selected candidate's
witness count before attributing such a failure to model reasoning.

### Diagnostic micro-decision experiment (not a live-authority gate)

The v9 result suggests three separable causes: a required fact is absent, an
available fact is lost inside a large decision, or the final strategy label
does not express the move's consequence. Test these causes on the same five
frozen probe worlds without changing their physics, provider authority or
release threshold. This experiment does not retry or rescore v9.

For each world, construct one small evidence card from its authoritative
recent-change record and two legal completed-turn alternatives. Include exact
committed-target distances, immediate effects and (where relevant) the 30-cell
ledge witness. State the evidence boundary explicitly: the simulation ends
after this Loomkeeper turn and does not compute the next player response or
future route reachability. Candidate A/B ordering varies by case. Freeze each
case's present-tense claim, future-tense claim, two alternatives, conservative
decision rule and expected answer in source before calling Mistral.

Run four independent, no-retry calls per case with `mistral-small-2603`, high
reasoning and the current 60-second provider window: one compact one-shot
choice that also classifies both claims; then separate present-fact and
future-fact classifications; then a narrow choice given the same card and
the *deterministically certified* claim statuses. Alternate one-shot-first
and microtasks-first order across cases. Each classification must return
`supported`, `refuted` or `unknown` plus one cited evidence ID. The choice is
only `A`, `B` or `abstain`; no model-authored action, map or policy is applied.
The 20 calls are diagnostic, not a replacement five-probe acceptance gate.

The assembler checks both microclassifications against exact source facts and
their cited evidence IDs. An error or unavailable response yields abstention.
Otherwise it accepts a narrow Mistral preference only if it satisfies the
case's frozen rule. A missing necessary future fact forces abstention even if
Mistral proposes a locally attractive move. A destroyed route maps to
`repair` in the assembled strategy, avoiding a free-form `refine` label.
The experiment reports one-shot versus narrow-choice accuracy, present/future
claim calibration, premature future certainty, deterministic vetoes, latency,
usage and cost per call. The predeclared expected actions are: abstain for
unproved temporary-route benefit; continue the currently feasible commitment
with the advancing alternative; provisionally repair with the less destructive
same-distance alternative; preserve the witnessed ledge; and abstain when
hidden support cannot be distinguished. These are bounded probe rules, not a
claim that any future route is reachable or a production Loomkeeper policy.

Interpret the result by stage. Wrong classification of an explicit fact points
to grounding; accurate classifications followed by a bad one-shot choice point
to decision compression; accurate microclassifications but a bad narrow choice
point to local policy application; a correct assembled choice with a vetoed
model answer demonstrates safety, not model competence. Five worlds with one
sample per condition can identify concrete failure modes but cannot estimate a
stable win rate or justify live authority.

The preregistered diagnostic ran once on live Render deployment
`dep-dap6iq6gekts73fvn6bg` at commit `05c2642` on 2026-09-22. The exact
[sanitized 20-call result](../evidence/wp-027-mistral-micro-decisions-r1/result.json)
has SHA-256 `cbc6287aae2eab6807ce2eca6903da0e01f7a7ae45e19d0fdbba58274b3f6fa7`.
All 20 requests returned complete structured answers with no retries; the
captured estimated cost was USD 0.008093. Both the compact one-shot and the
three-stage path chose the frozen action in all five worlds. Both paths
classified the present fact correctly in five of five and the future
consequence as unknown in five of five by status. There was no premature
future-certainty answer on these cards.

The frozen exact evidence-ID scorer accepted only three of five separate
future classifications. In the temporary-cost card Mistral cited option `B`
instead of `limit`; in the hidden-support card it cited `event` instead of
`limit`. Each answer explicitly recognized the uncomputed future fact and
cited relevant supplied evidence. The deterministic assembler consequently
accepted three preferences and guardedly abstained twice; its final actions
still matched all five expected actions. Preserve those strict scores rather
than retroactively widening the guard. They expose a separate implementation
problem: a single canonical citation ID can reject a semantically correct
uncertainty judgment. A later contract should certify factual status from
server facts and allow all deterministically valid provenance IDs, without
letting prose or the model establish missing reachability.

Sequential provider time summed to 23.649 seconds for the five one-shot calls
versus 42.351 seconds for the fifteen staged calls; captured estimated costs
were USD 0.002892 and USD 0.005201 respectively. This is diagnostic call time,
not production end-to-end latency. Since one-shot was also perfect on these
small, explicit two-option cards, the run does **not** demonstrate that extra
model calls improve decisions. It is consistent with the broader v9 failures
arising from buried evidence, many candidates, open-ended strategy labels or
missing computed consequences; this design changes those factors together and
cannot isolate their causal contribution. The next bounded comparison should
cross card size/evidence explicitness with one-shot versus staged reasoning
over the same legal alternatives, while independently varying whether a
future fact is computable. Repeated randomized order and exact server
consequence checks would distinguish presentation from decomposition. Do not
promote this diagnostic to the failed five-probe release gate or live model
authority; Render remains on deterministic Loomkeeper selection.

### Follow-up evidence-load and decomposition diagnostic (preregistered)

Keep the first micro-decision artifact and its exact-ID scores immutable. In a
versioned diagnostic assembler, the server-certified status of each claim and
the frozen A/B decision rule gate an action. Check that a cited ID is present
in the supplied evidence and record whether it is the canonical ID, but do
not let a single citation string override a correct certified status. The
model still cannot authorize a move when the necessary future fact is unknown.
No gameplay or release-gate code changes in this slice.

Use the same five fixture worlds, the same A/B completed turns, current and
uncomputed-future claims, and frozen action rule. Cross two presentations with
two decision methods. The **compact** presentation is the original evidence
card. The **crowded** presentation retains that card and adds the complete
server brief, battlefield ASCII and other legal candidate summaries as
background, while the selectable actions remain exactly A/B/abstain. Both
methods receive identical content within each presentation: **one-shot**
classifies both claims and chooses an action in one response; **staged** asks
present and future claims separately, then chooses with the independently
certified statuses. Alternate arm order deterministically across worlds and
presentations. This is 5 worlds x 2 presentations x (1 + 3 calls) = 40 calls.

Add one independent computed-fact classification for each world and
presentation (10 more calls). Its claim concerns an exact after-this-turn
candidate metric from the authoritative rollout, so the expected status is
`supported`; the existing next-player-turn route claim remains `unknown`.
This checks whether the model distinguishes known completed-turn consequences
from genuinely uncomputed future consequences. It does not invent a future
reachability oracle. Freeze the five computed claims and all expected answers
in source before the first API request. Use the same exact model, high
reasoning, strict JSON response, 60-second deadline and zero-retry rule: 50
calls total, no live authority and no retrospective v9/r1 rescore.

Report action/status accuracy by paired arm, unsupported future certainty,
computed-fact recognition, canonical versus alternate citations, assembler
acceptance/veto, provider time, tokens and estimated cost. The primary
comparison is whether crowding changes one-shot accuracy and whether staging
recovers any crowded-card misses. If both presentations remain at ceiling,
candidate-set size and open-ended strategy output remain unresolved causes.
If computed facts fail while unknowns pass, information extraction is the
leading issue. One sample per arm per world is diagnostic, not a stable model
quality estimate or a new five-probe acceptance gate.

### Phone Gate A - live accepted-provider Practice

After a shadow provider passes and its live authority mode is explicitly added,
enable it only in the R8 Practice canary. Across Defend, Collect and Claim,
verify:

1. coherent pursuit of the objective over several turns;
2. preparation and continuation through a reasonable temporary cost;
3. repair/switch after a player action invalidates a necessary route;
4. legal world-shaping actions with visible consequences matching simulation;
5. decision waits within the eight-second bound, with smooth controls/presentation;
6. close/reopen preserves the same match, selected action and committed strategy;
7. controlled provider failure falls back and finishes the match; and
8. operational recovery permits external reasoning to resume without requiring fallback to
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
PostgreSQL, deployed-provider, phone and Ubuntu visual gates remain separate.

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
the prospectively declared criteria; replay and reconnect work without a provider;
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

## Mistral references

- https://docs.mistral.ai/getting-started/models/models_overview/
- https://docs.mistral.ai/capabilities/structured_output/structured_output_overview/
- https://docs.mistral.ai/api/
- https://mistral.ai/pricing
