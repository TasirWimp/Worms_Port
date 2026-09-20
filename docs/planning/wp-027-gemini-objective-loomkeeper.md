# WP-027 Strategic-Voyage Model Loomkeeper

Status: **in progress; Mistral Small 4 compatibility correction locally verified, deployed gate pending**
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
- at most USD 0.05 estimated total cost for the five-call set.

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
contract, bounded brief and strict selected-or-abstain JSON schema with `low`
reasoning. The adapter parses one complete structured answer, Mistral token
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
