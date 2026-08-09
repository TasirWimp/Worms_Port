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
| Defense state and its cost | optional candidate only; Candidate D1 models one public one-use, damage-only Brace as rejected analytical evidence; no live Brace mechanic is approved |
| Overtime/convergence state | optional candidate only; Candidate C models equal non-refilling Escape Slack as an analytical soft-boundary hypothesis; no live Loom Tightening, timeout rule, or meter is approved |
| Radius, precision, falloff, ammo, cooldown, status effects, Calling modifiers, obstacles, destructible terrain, rewards | excluded unless separately versioned and authorized; Candidates B/B2/C/D1 authorize only analysis-only Needlepoint tether/cooldown, Escape Slack, and rejected Brace hypotheses, never a live rule |

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
- Candidate B/B2/C-only Seam-Pin pressure (advance while applying the configured
  Needlepoint tether, then prefer the strongest currently legal cast),
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
| `v5-range-damage-seam-pin-candidate-b` | Candidate A's values plus one ideal direct Needlepoint Seam Pin: the target's next distance-increasing movement is capped at 32, and the caster cannot immediately reapply it. No bounded forced opening appears. | 56% | 6.88 | 40 Unraveling / 10 turn-limit draws |
| `v5-range-damage-forward-seam-pin-candidate-b2` | Candidate B's tether only after the Needlepoint caster advances; a stationary shot deals low direct damage only, and retreat-plus-Needlepoint is unavailable. No bounded forced opening appears. | 48% | 7.12 | 40 Unraveling / 10 turn-limit draws |
| `v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4` | Candidate B2 plus 128 equal non-refilling Escape Slack per actor. No ideal direct-cast dominance or bounded forced opening appears. | 52% | 6.12 | 50 Unraveling / 0 turn-limit draws |
| `v5-range-damage-forward-seam-pin-escape-slack-192-candidate-c1` | Candidate B2 plus 192 equal non-refilling Escape Slack per actor. No ideal direct-cast dominance or bounded forced opening appears. | 52% | 6.60 | 50 Unraveling / 0 turn-limit draws |
| `v5-range-damage-forward-seam-pin-escape-slack-256-candidate-c2` | Candidate B2 plus 256 equal non-refilling Escape Slack per actor. No ideal direct-cast dominance or bounded forced opening appears. | 52% | 6.84 | 46 Unraveling / 4 turn-limit draws |
| `v5-range-damage-forward-seam-pin-escape-slack-320-candidate-c3` | Candidate B2 plus 320 equal non-refilling Escape Slack per actor. No ideal direct-cast dominance or bounded forced opening appears. | 52% | 7.08 | 46 Unraveling / 4 turn-limit draws |

Candidate A is not a V5 proposal or an approved values table. Its short-range
approach versus retreat/kite trace repeatedly oscillates between 576 and 640
units until the 16-turn limit. That is useful negative evidence: values alone
can remove direct-cast dominance and still leave the current move-and-cast
economy unable to resolve a pursuit/retreat loop. The next D2A decision is
therefore whether to test a separately versioned tactical-core candidate before
authorizing any values-only V5 implementation.

## Candidate B Seam Pin result â€” 2026-08-09

Candidate B is a schema-versioned, exploratory tactical-core experiment. It
keeps Candidate A's 640/576/512 range and 30/45/80 direct-damage table exactly,
so its only changed analytical variable is a Needlepoint control effect:

- an ideal direct Needlepoint hit gives the target one Seam-Pinned target turn;
- that target may still cast, hold, or move toward the caster, but may increase
  its separation by at most 32 units instead of the ordinary 64;
- the effect clears after that target turn; and
- the caster cannot use Needlepoint on its immediately following own turn.

The canonical anti-kite probe has the Seam-Pin pressure policy advance from
640 to 576 while casting Needlepoint. The retreat/kite reply may still move,
but reaches 608 rather than restoring 640. The next two actions are a
Threadball advance to 544 and one ordinary retreat to 608; the next advancing
Needlepoint cast returns to 544 and resolves the probe in five turns. When the
evader acts first, the same direct-hit probe resolves in eight turns. The four
mirrored role/initiative probes all give the Seam-Pin user a win, rather than
the old indefinitely repeatable 576/640 movement loop.

This is useful counterplay evidence, **not** an approval result. The comparable
five-policy primary matrix still records 10 turn-limit draws out of 50 matches
(Candidate A had 8), and its first-actor rate rises from 48% to 56%. Candidate
B therefore shows that a successful, low-damage control shot can counter a
specific evasion strategy without a hard stun or immediate forced opening; it
does not yet establish global convergence, final pacing, production accuracy,
or acceptable initiative balance. It has no TypeScript, replay, client,
Loomkeeper, asset, or reward path. Any playable Seam Pin remains a separately
scoped tactical-core work package after owner review.

## Candidate B2 forward-Stitch result â€” 2026-08-09

Candidate B2 tests the narrower response to Candidate B's 56% first-actor
rate. It preserves the same one target-turn, 32-unit retreat-cap, one-own-turn
cooldown, candidate-A range/damage table, and `move -> fire -> turn ends`
economy. It changes only Needlepoint's directional cast rule:

- movement that reduces separation plus a direct Needlepoint hit applies Seam
  Pin;
- a stationary direct Needlepoint hit deals its low 30 direct damage but adds
  no status or cooldown; and
- a Needlepoint cast that would increase separation is unavailable for that
  turn. The actor may instead retreat without casting, hold and cast, or
  advance and cast.

The same four mirrored Seam-Pin-pressure versus retreat/kite probes still give
the Seam-Pin user a win: five turns when that user acts first and eight when it
acts second. The key pursuit trace remains 640 -> 576 after an advancing
Needlepoint cast, then only 608 after the tethered retreat rather than the old
640 reset. However, the comparable primary matrix returns the first-actor rate
to 48%, matching Candidate A and removing Candidate B's measured 56%
initiative increase. It still has 10 turn-limit draws out of 50 and a longer
7.12-turn mean, so forward-Stitch improves the local initiative residue but
does not solve global convergence or establish final pacing. B2 remains
analysis-only and cannot become a live V5 rule without a separately scoped
tactical-core decision.

## Candidate C Escape Slack sweep result - 2026-08-09

Candidate C explores the owner's global-movement-budget goal without imposing a
total-movement cap. A total budget would eventually prevent an approaching
player from reaching a retreating player. Instead, each actor receives the same
non-refilling **Escape Slack** reserve at match start, and only an actual
increase in their current separation spends it. Moving toward the opponent,
holding, and firing are free; an actor with no remaining reserve can still
approach and cast but can no longer move farther away. The reserve is private
and symmetric, not a shared race. A Seam-Pinned 32-unit retreat consumes only
32 units because the Seam Pin cap is applied before Escape Slack accounting.

The 128, 192, 256, and 320-unit configurations correspond to at most two,
three, four, and five unpinned 64-unit separation-increasing moves per actor,
respectively. All retain B2's advance-only Needlepoint, one-turn
tether/cooldown, and `move -> fire -> turn ends` economy. They are
schema-versioned analysis configurations only; neither an on-screen reserve nor
a live combat rule has been designed or approved.

The first C sweep found two C4/C1 mutual-retreat timeouts. Trace inspection
showed that they were a policy defect, not candidate-rule evidence: once Escape
Slack was empty, `retreat_kite` selected a legal move *toward* the opponent
whenever that opponent could cast, then continued to avoid its own legal casts.
The model now permits a kite relocation only if projected separation increases;
otherwise that policy selects its best legal cast. The values below are the
fully recomputed and decision-valid sweep; the earlier two-timeout C4/C1 result
is superseded and must not inform a V5 decision.

In the corrected comparable 50-match mirrored primary matrix, C4 and C1 are
the strongest bounded samples: each finishes all 50 matches by Unraveling and
has a 52% first-actor rate. C4 is the narrower reserve and reaches terminal
results in 6.12 turns on average, versus C1's 6.60. C2 and C3 both retain four
turn-limit outcomes and longer average matches, so more escape capacity is not
better in this model. All four retain no direct-cast dominance and no
bounded-depth forced opening. The existing four Seam-Pin-pressure versus
retreat/kite probes still resolve in five or eight turns because their short
traces do not exhaust even C4's reserve.

C4 also resolves the earlier short-approach versus retreat/kite and other
pressure-versus-kite turn-limit cases in this policy sample. Its corrected
mutual-retreat trace spends both reserves, approaches only until a cast becomes
legal, then fires rather than mistaking a further approach for a retreat; no C4
primary-matrix timeout remains. This is convergence evidence for this narrow
ideal-hit, heuristic model, not proof that C4 is ready for production. The 52%
first-actor result, real aim/terrain, human strategy, and defensive-counterplay
questions remain open. A later candidate may still test a readable defensive
commitment or a later-game pressure rule, but it must demonstrate value beyond a
problem the corrected policy model has already resolved.

## C4 cross-band starting-distance result - 2026-08-09

The canonical V4 spawn remains 640 units and remains the only
TypeScript-authority-bound initial state. To test whether C4's result only held
there, the analytical harness now accepts an explicit list of starting
distances. Each is centered in the otherwise featureless 2048-unit world, then
mirrored and run through the same 50-match policy matrix. These are controlled
counterfactuals, not replay scenarios, new live spawn rules, or terrain/aim
claims. The fixed initial sweep covers 448 (inside Spoolburst range), 512
(Spoolburst boundary), 576 (Threadball boundary), 640 (Needlepoint boundary and
current spawn), and 704 (outside all direct launch bands).

| Starting distance | First-actor rate | Mean turns | Terminal results | Bounded depth-3 opening result |
| ---: | ---: | ---: | --- | --- |
| 448 | 64% | 4.48 | 50 Unraveling / 0 turn-limit | 8 direct-cast forced-win actions per mirrored side |
| 512 | 60% | 4.52 | 50 Unraveling / 0 turn-limit | 6 direct-cast forced-win actions per mirrored side |
| 576 | 64% | 4.72 | 50 Unraveling / 0 turn-limit | 3 direct-cast forced-win actions per mirrored side |
| 640 | 52% | 6.12 | 50 Unraveling / 0 turn-limit | none |
| 704 | 76% | 6.84 | 50 Unraveling / 0 turn-limit | none |

Across all 250 matches, C4 has no turn-limit result, a 63% first-actor rate,
and a 5.336-turn mean. Thus Escape Slack is useful narrow convergence evidence,
but not sufficient balance evidence. The canonical 640 spawn is the only tested
band without a bounded forced opening, and even the out-of-range 704 scenario
has an excessive 76% first-actor rate under these heuristics. The ideal-hit
assumption makes the exact rates non-predictive for mobile play, but the
direction is decisive enough to block a values-only V5 decision. The next D2A
question is initiative counterplay: a defense/brace candidate, first-turn
action restriction, or another reversible commitment mechanic must be compared
against C4 before any live tactical-core work is scoped.

## Candidate D1 basic Brace result - 2026-08-09

D1 tests the smallest conventional defense that could be read on a mobile
screen: each actor receives one public `brace` action; it spends the entire
turn and halves only the next opposing direct hit. The stance clears after that
opponent acts, whether they cast or merely relocate. D1 deliberately adds no
heal, recoil, displacement, new turn, initial guard, or change to C4's 128
Escape Slack / forward-Seam-Pin contract. Its `brace_counter` probe uses Brace
only if an opponent's currently legal hit would otherwise be lethal but becomes
nonlethal after the reduction.

This is **rejected negative evidence**. At the canonical 640 spawn D1 retains
C4's 52% first-actor rate and 50/50 Unraveling outcome, with a slightly shorter
6.04-turn mean. Only two Brace actions appear in the primary matrix. In the
448/512/576/640/704 sweep it retains exactly the same 64%/60%/64%/52%/76%
first-actor rates; its Brace policy probes do not spend Brace because the
50%-reduced hit is either already nonlethal or still lethal. D1 has no
turn-limit result, but it does not improve the identified initiative residue.

The bounded forced-opening action counts shrink because the search can now
consider a future Brace state, but forced outcomes remain at 448, 512, and 576:
Spoolburst still supplies three, two, and one direct-cast forced actions per
mirrored side, respectively. A defense selected only after the opponent's first
attack cannot resolve a deterministic direct-hit damage race. Do not tune D1's
percentage or add it to V5. Any later defense exploration must be separately
authorized as a **reaction/turn-order** mechanic (or be supported by real
aim/terrain evidence), rather than disguising a larger action-economy change as
a simple Brace button.
