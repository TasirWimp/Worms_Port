# WP-027 Objective-Aware Gemini Loomkeeper

Status: **queued after WP-026; planning contract only**  
Required predecessor: completed WP-026 R8 objective-mode canary

## Product outcome

WP-027 lets a server-only Gemini adapter select among the exact legal R8
complete-turn plans already generated and simulated by WP-026. Gemini supplies
tactical preference and variation across Defend, Collect and Claim. It never
owns movement, collision, item physics, terrain mutation, scoring, terminal
results, replay verification or reward eligibility.

The deterministic R8 Loomkeeper remains fully playable and is the permanent
fallback. Gemini failure may change which legal plan is selected; it must never
break or extend a match. After shadow and live Practice gates pass, the exact R8
identity can replace R7 in both standard Practice and PEI-gated Daily.

## Authority boundary

At the start of each Loomkeeper turn, the server:

1. snapshots the exact authoritative R8 state;
2. supplies the current terrain/objective ASCII plus structured objective facts;
3. deterministically enumerates and simulates bounded complete-turn candidates;
4. reduces them to a diverse shortlist of at most 24 stable candidate IDs;
5. asks Gemini to select one ID and report a tactic label; and
6. accepts only an ID present in that exact shortlist before executing the
   candidate through ordinary authoritative intents.

The payload includes objective mode, score, remaining objects and turns, object
positions/statuses, actor state, terrain and objective revisions/hashes, and
candidate consequences. Derived consequences include route reachability, cover,
support and bottom threats, objective distance, collection/capture/denial,
health, ring-out, final positions and the strongest bounded reply considered by
the deterministic evaluator.

Gemini never supplies coordinates, velocities, input sequences, crater edits,
scores or arbitrary commands. Every request is stateless and contains a fresh
complete snapshot. Chat history and `previous_interaction_id` are not battlefield
memory.

## Structured response

The response uses a strict schema equivalent to:

```json
{
  "candidateId": "r8-candidate-id",
  "tactic": "capture_chest|guard_chest|collect_coin|deny_coin|open_route|deny_route|ring_out|damage|self_preserve"
}
```

`candidateId` is an enum of the current shortlist. Both fields are required,
additional properties are rejected, output count is one and the output token
ceiling remains small. `tactic` is bounded audit metadata and cannot alter the
chosen operations. The server still size-bounds, parses and semantically
validates the response.

The policy pins an exact stable model name. `latest`, preview and experimental
aliases are prohibited for Daily. Temperature is zero to reduce variation;
the package makes no deterministic-output claim about Gemini.

## Replay and verification

Each automated selection record adds:

- turn, objective mode and R8 policy identity;
- provider: `gemini` or `deterministic-fallback`;
- exact stable model and prompt-contract revision;
- basis state hash plus terrain and objective revision/hash;
- candidate-set hash, selected candidate ID and tactic label; and
- canonical structured-response hash.

The fresh verifier recreates R8, regenerates the candidate set, validates every
hash and confirms that the recorded ID was legal before replaying its operations.
It never calls Gemini. This proves the chosen operation and resulting match; it
does not claim a later model call would make the same choice.

A match captures its provider and policy revision at creation. Configuration or
model changes cannot switch an active match. Reconnect and server recovery retain
the already selected plan record.

## Availability, latency and cost

Missing keys, timeout, quota/rate limit, network failure, invalid JSON, unknown
ID, stale basis hash or rejected output selects the deterministic WP-026 plan at
the same decision boundary. Candidate generation or simulation failure still
fails closed and cannot be presented as an external-model success.

There is one request per Loomkeeper turn, no provider retry inside the turn, one
in-flight request per match and a deployment-wide concurrency cap. With the
16-turn match limit, a match can make at most eight requests. The plan releases
at one fixed logical boundary, initially no later than 90 ticks or three seconds;
a late response is ignored. Measured provider work cannot become scheduler debt
for other matches.

The adapter enforces input byte/token ceilings, a small output ceiling, a circuit
breaker and a deployment spend budget. Shadow evidence records latency, valid-ID
rate, fallback reason, input/output tokens, estimated cost, selected tactic and
candidate comparison across all three objective modes. Live activation requires
recorded operational thresholds and budget; they cannot be silently relaxed in
configuration.

## Security and configuration

The adapter lives only in the server. Requests contain no wallet address, PEI
receipt, transaction hash, reward reservation, session bearer, IP address or
device data, and accept no player-authored prompt text. Logs contain bounded
policy/model IDs, hashes, latency, token counts, tactic and error classes without
the API key or wallet identity.

Safe defaults are:

```text
LOOMKEEPER_PROVIDER=deterministic
GEMINI_API_KEY=<server-side secret; absent while deterministic>
GEMINI_MODEL=<exact stable model ID; required for shadow or live Gemini>
```

Allowed providers are `deterministic`, `gemini-shadow` and `gemini`. Incomplete
Gemini configuration fails startup for the requested external mode. The first
implementation should use a small server transport adapter. Adding an SDK
requires ordinary dependency, license, audit and bundle review.

## Waypoints and gates

### Waypoint 1 - shortlist and replay boundary

Freeze the R8 tactical summary, stable shortlist and selection record. Prove
unknown/stale IDs, response changes, reconstruction and deterministic fallback
with local fakes before any deployed request.

### Waypoint 2 - deployed shadow mode

Run Gemini in shadow mode across Defend, Collect and Claim. The deterministic
Loomkeeper acts while operational evidence measures validity, latency, cost and
whether the model distinguishes the three objectives. Shadow output cannot alter
gameplay or reward truth.

### Phone Gate A - live Gemini Practice

Enable live Gemini only for the R8 Practice canary. Play several turns in each
mode after moving or dropping objectives and changing routes. Confirm selected
turns remain legal, visibly pursue the current objective, release at a stable
pace and resume exactly after closing the app. Then disable or misconfigure the
provider in a controlled deployment and confirm deterministic fallback finishes
all three modes.

### Final promotion and Phone Gate B

After replay, fallback and operational evidence pass, promote the exact R8
ruleset and WP-027 automation/policy identity to both standard Practice and
Daily. The player chooses Defend, Collect or Claim before Daily creation; the
choice is immutable and one started Daily/consumed PEI receipt applies across
all choices.

Phone Gate B completes one Practice match in every mode, resumes a changed
objective match, verifies one deterministic-fallback journey, and completes
eligible Daily wins covering chest and coin results under the temporary approved
development repeat override. The final deployment restores the safe one-Daily
limit, helper state, provider/budget configuration and fixed 1 NIM reward path.

## Automated acceptance

Coverage must prove shortlist bounds/diversity, mode-specific consequences,
strict schema and semantic rejection, basis/candidate/response hashes, fixed
decision timing, timeout/quota/circuit fallback, request redaction, server-only
key separation, exact network-free replay, reconnect, R8 Practice/Daily browser
journeys, reward settlement, build, security, bundle and current server smoke.
Routine CI uses local fakes and never calls Gemini. PostgreSQL, deployed shadow,
physical-phone and Ubuntu visual evidence remain separately reported gates.

## Explicit deferrals

WP-027 does not change R8 physics, objective layouts, terminal rules, reward
amount, PEI admission, one-Daily policy, actor lives or art. It adds no model-
authored commands, maps, objects, dialogue or persistent model memory.

## Definition of done

WP-027 closes only when the deterministic fallback, shadow evidence, live
Practice Phone Gate A and final Practice/Daily Phone Gate B pass; exact replay
verification reconstructs every selected plan without Gemini; safe deployment
settings are restored; change-selected checks pass; evidence is complete; and
housekeeping agrees with the execution pointer.

## Primary references

- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/rate-limits
