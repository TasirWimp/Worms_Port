# WP-015D2A Tactical Game Model and Simulation Harness Contract

Status: in progress. This is the active planning and analytical predecessor to
WP-015D2 V5. Its first deterministic analysis harness is implemented, but the
owner decision for the next versioned ruleset remains open. It does not change
a playable ruleset, client, server, protocol, replay, reward condition, or
product asset.

## Purpose

V4 established a 2048 by 576 arena with room to make distance meaningful. The
three V5 Relic identities are already product direction:

| Relic | Intended range | Intended maximum direct damage |
| --- | --- | --- |
| Threadball | medium | medium |
| Needlepoint | long | low |
| Spoolburst | short | high |

Those labels alone do not establish a good artillery duel. In a wide open
arena, a long-range player who can move and attack without a meaningful cost
can kite a short-range player indefinitely. Conversely, an unrestricted
short-range hit can make the first successful approach decide the Clash. D2A
turns those concerns into a small, testable tactical model before V5 freezes
integer values.

The desired experience is a readable sequence of commitments and responses:

```text
observe state -> choose cast / relocate / future defense candidate
              -> opponent observes that commitment
              -> opponent chooses a costly counter
              -> new state has changed tactical options
```

The player who acts first may gain tempo, but also reveals intent. The next
player must have a credible response that is not free. A player should win by
reading range, timing, and the opponent's likely response, rather than by a
dominant opening, automatic counter, or timeout draw.

## Theory as a design lens

NIMble Knots is modelled here as a finite, sequential game of perfect
information: a state exposes the same public information to both sides, one
side chooses a legal action, the state changes deterministically, and the
other side responds. This framing makes the relevant question for a Relic or
defensive mechanic *what its best observable counter is*, rather than whether
its isolated damage number looks attractive.

- Hunicke, LeBlanc, and Zubek's MDA framework separates **mechanics** from
  the runtime **dynamics** they produce and the intended player **aesthetics**.
  D2A uses this order: tactical agency, tension, and mastery are the desired
  experience; approach, retreat, pressure, survival windows, and convergence
  are the desired dynamics; action economy, tiers, and any later defense or
  overtime rule are candidate mechanics. See
  <https://www.cs.northwestern.edu/~hunicke/MDA.pdf>.
- Extensive-form perfect-information research supplies the vocabulary of
  sequential rationality and subgame-perfect responses. D2A does not attempt
  to prove a formal equilibrium for the finished game, but it uses the same
  discipline: every reachable state must be examined with its credible reply,
  not with a cooperative or absent opponent. See
  <https://arxiv.org/abs/2106.11491>.
- Forward-induction research supports treating an observed early action as a
  meaningful signal about a player's intended plan. In this game, a relocation
  toward Spoolburst range, a long-range cast, or a future Brace action should
  be legible as a commitment that the opponent can answer. This is empirical
  design guidance, not a claim that every player reasons identically. See
  <https://arxiv.org/abs/1606.07521>.

Theory supplies questions and falsifiable balance hypotheses; it does not
derive fun or the final damage constants automatically. Samsung/Nimiq Pay
acceptance remains the final usability and pacing evidence.

## Tactical model boundary

The model is deliberately smaller than the Phaser presentation and smaller
than future tactical-terrain work. It represents all values as bounded integers
and makes no rendering, network, wallet, reward, or asset decision.

| State field | D2A treatment |
| --- | --- |
| Ruleset/configuration ID, seed, turn, active actor | required; identifies an immutable scenario and whose decision it is |
| Each actor's world position, Stitching, and terminal status | required |
| Authoritative V4 terrain width, legal arena bounds, and current separation | required; no obstacle or terrain-tactic interpretation |
| Per-Relic launch band and direct-damage candidate values | required and configuration-driven |
| Movement/action budget | required; compare its consequences explicitly rather than assuming move-plus-full-cast is harmless |
| Defense state and its cost | optional candidate only; no Brace mechanic is approved or implemented by this contract |
| Overtime/convergence state | optional candidate only; no Loom Tightening or timeout rule is approved or implemented by this contract |
| Radius, precision, falloff, ammo, cooldown, status effects, Calling modifiers, obstacles, destructible terrain, rewards | excluded from D2A candidates unless separately versioned and authorized |

All model transitions must be deterministic. An experiment may sample a policy
or a listed starting scenario, but given its configuration, policy choice, and
seed it must reproduce the same trace and result.

## Analytical Python harness

The future Python implementation is an **analytical model**, not a second game
server. TypeScript remains the only authoritative source for live command
validation, simulation, AI scheduling, replay reconstruction, rewards, and
client state.

When D2A is implemented, it must:

1. live in a clearly named project-owned analysis location, separate from the
   production `client/`, `server/`, and `shared/` simulation;
2. consume versioned, schema-validated, integer-only candidate configurations
   and scenarios rather than hidden constants;
3. record a compact trace for every match: initial state, policy/action at each
   turn, transition, terminal cause, and aggregate metrics;
4. include a V4 baseline model before it evaluates a V5 candidate; and
5. cross-check every configuration that is proposed for production against
   fixed scenario transcripts generated by the TypeScript authoritative
   simulation. A mismatch fails the candidate; Python output never overrides
   TypeScript replay truth.

The cross-check may use shared JSON scenario fixtures, but it must not couple
the production runtime to Python or let Python parse client/browser state.
Candidate-only mechanics that TypeScript does not yet implement are labelled
exploratory and cannot claim parity.

## Policies and experiments

D2A starts with transparent, bounded policies rather than an opaque optimizer:

- range-seeking pressure (prefer the longest useful legal cast),
- medium-band hold (seek Threadball's effective band),
- short-range approach (seek Spoolburst's effective band),
- retreat/kite (increase separation when threatened),
- any approved defensive policy only when its candidate action exists, and
- a bounded-lookahead best-response policy whose evaluation function and depth
  are recorded.

Every comparison must mirror the arena and swap the starting actor. It must
also compare both players using the same policy before comparing different
policies. This distinguishes an actual first-turn/side advantage from a policy
or map asymmetry.

The harness must report at least:

| Measure | Decision it informs |
| --- | --- |
| Mirrored first-actor win-rate delta | whether initiative creates an excessive advantage |
| Win rate by policy pairing and starting distance | whether range plans have viable counterplay |
| Turns to terminal result and overtime/turn-limit rate | whether Clashes converge instead of stalling or drawing |
| Relic, move, and eligible defense action frequency by distance band | whether all intended decisions are actually used |
| Sampled-state best responses and dominated-action count | whether an option is never rational or an action is universally better |
| Opening-state forced-result search under bounded rational replies | whether the first action can decide a Clash with no credible counter |
| Deterministic trace/replay parity result | whether a production candidate preserves the authoritative contract |

The report must name policy limitations. A favorable heuristic matchup is
evidence for a candidate, not proof that no stronger player strategy exists.

## Decision gates

D2A closes only after it records:

1. the state/action/terminal model and which fields are implemented versus
   exploratory;
2. the V4 baseline scenarios and mirror protocol;
3. a reproducible candidate-configuration and policy-report format;
4. the first results for range/damage candidates and any separately selected
   action-economy, defense, or convergence candidate; and
5. an owner decision for the next versioned ruleset.

That owner decision has two safe paths:

- **Values-only V5:** retain the existing move/turn economy and proceed with
  only per-Relic range/direct-damage values in WP-015D2, if the evidence shows
  acceptable counterplay and convergence; or
- **Tactical-core follow-up:** scope a separate versioned work package before
  V5/default activation for any action-economy change, Brace-like defense, or
  Loom-Tightening-style convergence rule.

D2A must not promote its exploratory candidates automatically. In particular,
it must not silently add a defense action, movement/attack restriction,
overtime contraction, stat modifier, or tie-break into V5.

## Non-goals and verification

D2A does not change V1 through V4 behavior, create V5, alter the current
Loomkeeper, add obstacle/tactical terrain gameplay, expose a simulation UI,
change rewards, generate media, or use Sorcerers material. It makes no claim
that a heuristic has solved the game.

The later implementation must run its deterministic model tests, fixed
TypeScript/Python transcript parity checks, `npm run build`, and
`npm run check:compliance`. It must retain the planned full browser matrix and
real-device pacing acceptance for any subsequent playable ruleset change.
Documentation-only refinement of this contract requires no build or browser
run.

## Initial harness result — 2026-08-09

The project-owned implementation is under `analysis/tactical_model/`; it has
no runtime import path. `scripts/export-tactical-v4-baseline.ts` generates the
checked-in structural fixture from the current TypeScript authority, and a
TypeScript test rejects fixture drift. The Python model validates shared V4
arena, spawn, Stitching, movement, and turn facts before it runs. It deliberately
does **not** claim terrain or ballistic parity: it is a level-ground,
ideal-direct-hit range model.

The initial 50-match policy matrix, mirrored for first actor and arena side,
records two intentionally limited comparison configurations:

| Configuration | Direct-cast finding | First-actor rate | Mean turns | Terminal results |
| --- | --- | ---: | ---: | --- |
| `v4-baseline-abstract-v1` | Needlepoint directly dominates Threadball and Spoolburst under the common 640-unit ideal range; its 120 direct damage has an immediate forced opening in the bounded search. | 60% | 2.84 | 48 Unraveling / 2 turn-limit draws |
| `v5-range-damage-candidate-a` | The exploratory 640/576/512 range and 30/45/80 damage tiers have no ideal-direct-cast dominance and no bounded forced opening. | 48% | 6.72 | 42 Unraveling / 8 turn-limit draws |

Candidate A is not a V5 proposal or an approved values table. Its short-range
approach versus retreat/kite trace repeatedly oscillates between 576 and 640
units until the 16-turn limit. That is useful negative evidence: values alone
can remove direct-cast dominance and still leave the current move-and-cast
economy unable to resolve a pursuit/retreat loop. The next D2A decision is
therefore whether to test a separately versioned tactical-core candidate before
authorizing any values-only V5 implementation.
