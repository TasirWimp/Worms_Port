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
| Radius, precision, falloff, ammo, cooldown, status effects, Calling modifiers, obstacles, destructible terrain, rewards | excluded unless separately versioned and authorized; Candidates B/B2/C/D1/E/F1/F2/F3/F4/G1/H1 authorize only analysis-only Needlepoint tether/cooldown, Escape Slack, rejected Brace/self-backlash, prepared-Spoolburst/Threadball/Cocoon/Threadback response hypotheses, pre-hit Threadstep, and second-actor opening compensation, never a live rule |

All model transitions must be deterministic. An experiment may sample a policy
or a listed starting scenario, but given its configuration, policy choice, and
seed it must reproduce the same trace and result.

## Tactical voyage recurrence gate - 2026-08-09

This is a bounded L4+ CRPM-inspired analytical lens, adapted under the
project's existing method-only CRPM reference boundary. It is not a runtime
dependency, player model, balance proof, or production rule. Each simulated
state is viewed through a fixed tactical cut consisting of the active actor,
both positions, Stitching, temporary tactical states, and bounded reserves.
Completed-turn count is intentionally excluded: reaching the turn limit does
not count as tactical progress.

The protected family is intentionally narrow:

1. a visible commitment has a credible response;
2. that response leaves a changed tactical state rather than a free
   non-terminal return; and
3. the fixed policy witness reaches Unraveling instead of relying on a turn
   limit.

The model records the first repeated non-terminal state for every match. A
candidate fails this recurrence gate whenever one appears in its declared
fixed-policy witness. This is a deterministic diagnostic for the stated
state-cut and policies only; it does not prove absence of loops in real play or
in unmodelled terrain/aim scenarios. It makes F2's prior trace diagnosis
machine-checkable and requires any later response candidate to leave visible
residue in a bounded state carrier such as position, Stitching, Escape Slack,
or another explicitly versioned finite resource.

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

## Candidate E Spoolburst backlash result - 2026-08-09

Candidate E tests whether the short-range heavy Relic can counter the remaining
opening residue by committing its caster to a visible cost, rather than adding a
new defensive action. Each schema-version 6 candidate keeps C4's 128-unit
Escape Slack and forward-only Needlepoint Seam Pin. A legal Spoolburst cast
deals its existing ideal 80 direct damage and then pays its own caster either
10 (E1), 20 (E2), or 30 (E3) Stitching. It is unavailable at or below that
cost, so the model never creates a same-action self-Unraveling or tie. The cost
is still paid when the target is Unraveled. No Threadball change, rule-order
change, cooldown, UI, replay field, or runtime behavior is included.

All three costs remove the depth-three direct Spoolburst forced actions at the
448/512/576 centered starts. That local result is not sufficient: E1 produces
2 turn-limit outcomes in each distance scenario (10/250 overall) and a 63.2%
cross-band first-actor rate. E2 and E3 finish all 250 cross-band matches, but
their first-actor rates rise to 70.4% and 67.2% respectively, versus C4's
63.0%. At the canonical 640 spawn, E2 and E3 still have 56% first-actor wins
and 6.00 mean turns; E1 rises to 64% and has 2/50 turn limits. The corresponding
448/512/576/640/704 first-actor rates are 64%/60%/64%/64%/64% for E1,
76%/72%/80%/56%/68% for E2, and 68%/64%/72%/56%/76% for E3.

Therefore **E1, E2, and E3 are rejected negative evidence**. A self-cost can
remove a formal forced opening while making ordinary policy outcomes less fair
or less convergent. Do not combine it with a Threadball effect yet: that would
confound this result. Any future Threadball control or defense candidate needs
its own narrow hypothesis and must be compared against the C4 baseline rather
than inheriting Candidate E.

## Candidate F1 prepared Spoolburst / Threadball disruption result - 2026-08-09

F1 separately tests the first version of an answerable weapon commitment. It
keeps C4's values, forward-Seam-Pin, and Escape Slack, and discards Candidate
E's self-cost entirely. Spoolburst is unavailable as an immediate cast. While
in its normal 512-unit launch band, an actor instead spends one full turn on a
visible preparation; the charge survives exactly the opposing action and can be
cast only as a stationary release on the preparer's immediately following turn
if the target remains in range. A direct Threadball hit while a charge is active clears it and still
deals the normal 45 ideal damage. This is a rule-order model only, with no UI,
animation, projectile, replay, or runtime claim.

The loop occurs in ordinary policy traces: at the canonical 640 start, the
50-match matrix contains 36 preparations, 12 Threadball disruptions, and 14
completed Spoolburst casts. All 50 matches Unravel, with no bounded direct
forced opening, a 56% first-actor rate, and a 7.20-turn mean. Across the
448/512/576/640/704 centered sweep it has 46/48/46/36/30 preparations and
16/16/16/12/10 disruptions. It resolves all 250 matches and has no bounded
opening action, but the respective first-actor rates are
72%/68%/72%/56%/76%: 68.8% overall and 6.784 mean turns, worse than C4's 63.0%
and 5.336.

Therefore **F1 is rejected as a values/activation candidate**, while retaining
one useful design finding: telegraphing a strong action and giving the opponent
a distinct medium-range response produces genuine observable counterplay.
That alone does not solve initiative in the ideal-hit model. Do not add a live
charge, disruption, status field, UI, or Threadball effect. Any later candidate
must make the defender's response materially alter the damage race, not merely
erase one option from the attacker's future turn.

## Candidate F2 Spun Cocoon / Threadball Unweave result - 2026-08-09

F2 tests the next, still analytical response contract. It retains C4's forward
Seam Pin and Escape Slack, but treats a prepared Spoolburst as a decisive
100-damage threat. Preparation stays one turn and releases stationary on the
caster's next turn. It also creates one Spun Cocoon hit: the next incoming
Needlepoint or Spoolburst direct damage is absorbed completely without clearing
the charge. Threadball has two deliberately separate effects. A normal Strike
deals 45 damage through the Cocoon but leaves the charge intact; a distinct
zero-damage Unweave uses the Threadball range to clear both Cocoon and charge.
This makes the counter a real choice rather than F1's combined damage-plus-
disruption result.

The headline moves in the desired direction but does not converge. At the
canonical 640 spawn, F2 has a 56% first-actor rate and 7.52 average turns, but
4/50 turn-limit results. Its primary traces contain 46 preparations, 28
Unweaves, 38 Cocoon absorptions, and 16 released Spoolbursts. In the fixed
448/512/576/640/704 sweep it reaches 56%/52%/56%/56%/72% first-actor rates:
58.4% overall, lower than C4's 63.0%, but with 20/250 turn limits and a 6.968-
turn mean. All five distance scenarios have the same four draws.

Trace inspection identifies the exact residue: every draw is a mirrored
medium-hold versus short-approach pairing. Once in Threadball range, the trace
repeats `prepare_spoolburst` then zero-damage `unweave_spoolburst`; neither
action spends Escape Slack or Stitching, so neither combatant is forced toward
a terminal state. F2 is therefore **rejected negative evidence**, despite the
improved initiative headline. A later candidate must price, limit, or otherwise
make a successful Unweave alter the board/health state without reinstating an
immediate first-shot race. No live Cocoon, Unweave, 100-damage Spoolburst,
status/UI/replay field, or V5 rule is approved.

## Candidate F3 Threadback Unweave result - 2026-08-09

F3 is the narrow recurrence-gate follow-up. It returns to C4's 80-damage
prepared Spoolburst and removes F2's Cocoon entirely, so Cocoon absorption
cannot confound the result. A normal 45-damage Threadball Strike leaves a
preparation intact. The separate zero-damage Threadball Unweave clears the
preparation only when the counter-caster can take one full 64-unit step away
from the prepared opponent. That forced Threadback spends exactly 64 of the
counter-caster's existing Escape Slack; with less than one full legal step,
Unweave is unavailable. It introduces no fresh meter, damage, reaction timing,
or live action-economy claim.

F3 passes the declared fixed recurrence gate: every 448/512/576/640/704
scenario has zero repeated non-terminal tactical states and all 250 matches
end by Unraveling. The corresponding first-actor rates are
72%/68%/72%/56%/76%, or 68.8% overall with a 7.072-turn mean. This is worse
than C4's 63.0% and F2's 58.4%, even though it repairs F2's 20 turn-limit
results.

F3 is therefore **rejected negative evidence**. The recurrence gate correctly
distinguishes the repaired convergence carrier from an acceptable balance
landfall: a visible, bounded residue is necessary, but alone does not repair
initiative fairness. No Threadback, forced movement, charge state, UI, replay
field, or V5 rule is approved.

## Candidate F4 Spun Cocoon / Threadback Unweave recombination - 2026-08-09

F4 is the owner-approved narrow recombination of the useful, separately tested
parts of F2 and F3. It does **not** revive either rejected candidate unchanged:
it retains C4's 80-damage Spoolburst rather than F2's 100-damage value, and it
retains F3's compulsory 64-unit Escape-Slack Threadback rather than F2's free
Unweave. The single question is whether F2's one-hit Spun Cocoon can improve
the defended charge's initiative behavior when F3 prevents the
prepare/Unweave non-terminal return.

The rule-order contract is fixed before measurement:

1. An in-range actor spends one whole turn preparing its normal 80-damage
   stationary Spoolburst release.
2. Preparation creates one Cocoon that absorbs the next Needlepoint or
   Spoolburst direct hit, but a normal 45-damage Threadball Strike passes
   through it and leaves preparation intact.
3. A separate zero-damage Threadball Unweave clears both Cocoon and
   preparation only if its caster can take one full legal 64-unit step away,
   spending that actor's existing Escape Slack. The target's Cocoon cannot be
   cleared for free, and a normal Threadball Strike is never secretly also an
   Unweave.

F4 adds no new meter, reaction timing, action-economy exception, UI, replay
field, server rule, or V5 authority. It is schema version 11 and must pass the
existing recurrence gate, have no analytical turn-limit result, and remove
bounded direct openings before its first-actor rate can be considered. Its
results are recorded below only after the canonical and centered cross-band
sweeps complete.

### Candidate F4 result - 2026-08-09

F4 passes every structural gate that F2 and F3 could not satisfy together. At
the canonical 640 spawn, all 50 matches Unravel with no bounded forced opening,
no repeated non-terminal state, a 60% first-actor rate, and a 7.88-turn mean.
Across the centered 448/512/576/640/704 sweep, all 250 matches Unravel and
there are zero recurrence witnesses or bounded opening actions at every start.
The recombined loop is genuinely exercised rather than dead configuration:
the primary traces contain 212 preparations, 130 Cocoon absorptions, 36
Unweaves, 36 matching Threadbacks, and 154 released Spoolbursts.

The required Threadback is the decisive convergence repair. Each cancellation
spends an existing 64 Escape Slack and changes separation, so it cannot return
to F2's protected-equivalent prepare/Unweave cut. The Cocoon also supplies a
real defensive window that G1's one-step pre-hit retreat could not provide at
close range.

F4 is nevertheless **not promoted as a balance candidate**. Its cross-band
first-actor rate is 63.2% (60%/56%/60%/60%/80% by ascending start), fractionally
worse than C4's 63.0% and with an unacceptable-looking 80% residue at the 704
long-distance start. Its 7.304-turn mean is also slower than C4's 5.336. The
project has deliberately not declared a final numerical acceptance threshold,
so this is not a claim that 63.2% proves a live rule invalid. It does prove
that the F2/F3 recombination solves forced-openings and recurrence without yet
repairing initiative across the full distance family. Retain it as the leading
structural reference, but authorize no Cocoon, preparation, Unweave,
Threadback, UI, replay, or V5 rule.

## Candidate H1 second-actor Opening Weave - 2026-08-09

H1 tests an explicit, public initiative compensation rather than attempting to
make every Relic independently erase first-actor tempo. It returns to plain C4
and therefore does not combine with F4's preparation, Cocoon, or Threadback.
The actor assigned the second normal turn begins with exactly one Opening
Weave. A cast on the first actor's opening action deals no direct damage to
that actor and consumes the Weave. If the first actor instead relocates, holds,
or otherwise declines a cast, the Weave expires when its owner completes that
owner's first normal action. The owner has then received the promised response
opportunity and cannot carry the protection into later combat.

This is a bounded side-assignment rule, not a hidden handicap: the recipient,
one-hit capacity, all-Relic coverage, and expiry are public model state. It
cannot stack, refill, convert to movement, change a later cast, or absorb a
second hit. A consumed or expired Weave is included in the tactical recurrence
cut. H1 is schema version 12, analysis-only, and introduces no UI, replay,
server, reward, or V5 authority. The experiment must demonstrate no forced
opening, no non-terminal recurrence, no turn-limit terminal result, and a
credible improvement in the mirrored first-actor family before any later owner
decision.

### Candidate H1 result - 2026-08-09

H1 cleanly closes the original opening and convergence failures: every one of
the 250 centered 448/512/576/640/704 matches Unravels, the recurrence gate has
zero witnesses, and the reaction-aware opening search reports no bounded forced
action at any start. The Opening Weave is active evidence rather than inert
configuration: it absorbs 160 first-action direct casts across the primary
cross-band traces. The canonical 640 start also has 50/50 Unraveling results,
zero recurrence witnesses, no forced opening, and a 6.76-turn mean.

It nevertheless **overcompensates and is rejected as a balance candidate**.
The cross-band first-actor rate falls to 44.0%
(40%/36%/40%/36%/68% by ascending start), which reverses the systematic side
advantage rather than bringing it toward parity. The canonical first-actor rate
is 36%. A full all-Relic absorbed hit is therefore too large an opening komi
under the ideal-direct-hit model—even though it is bounded, public, and free of
loops. The result is useful calibration: an initiative compensation can solve
the hard openings, but it must be weaker or more conditional than total damage
negation. No Opening Weave status, UI, replay field, server rule, reward change,
or V5 rule is approved.

## Candidate H2 paid second-actor Opening Weave - 2026-08-09

H2 is the narrow cost follow-up to H1. It retains plain C4 and H1's exact
second-actor assignment and first-response expiry, but makes use optional and
priced. When a direct cast hits during the first actor's opening action, the
second actor may either accept normal damage or spend one full existing
64-unit Escape-Slack step to absorb it. The Weave then consumes; if unused, it
still expires after its owner's first normal action. This creates a readable
trade: preserve current Stitching against a strong opening, or preserve later
retreat capacity after the opponent has seen the choice.

The live-player choice is not reduced to the model's heuristic. For a stable
primary matrix, every transparent policy uses the documented threshold of 45
or more direct damage: it spends against Threadball or Spoolburst but not
Needlepoint. The bounded opening search separately grants the second actor both
legal outcomes whenever the reserve permits, so the candidate cannot hide a
forced opening behind that threshold. The 64 cost exactly matches one normal
movement step and uses the existing C4 reserve; no health tax, lost turn, new
meter, or hidden handicap is introduced. H2 is schema version 13 and remains
analysis-only pending canonical and cross-band results.

### Candidate H2 result - 2026-08-09

The paid choice fixes H1's structural result without returning to an automatic
shield: all 250 centered 448/512/576/640/704 matches Unravel, the recurrence
gate records zero non-terminal witnesses, and the reaction-aware opening search
finds no bounded forced action at any start. The canonical 640 start also has
50/50 Unraveling results, zero recurrence or forced-opening witnesses, a 6.56
turn mean, and a 40% first-actor rate. The opening search now explicitly tests
both the normal policy's 45-or-more-damage choice and the legal costly response
to every direct Relic hit; the latter prevents a policy threshold from being
mistaken for a missing player option.

Its cross-band aggregate is near parity at **48.8% first-actor wins**
(44%/40%/44%/40%/76% by ascending start) with a 5.928-turn mean. That mean is
not sufficient evidence of a balanced rule: H2 trades H1's global second-actor
overcompensation for a distance-dependent result. It strongly favors the
second actor through 640, while the first actor still has a 76% advantage at
704. The one-step price is therefore useful calibration and a valid response
contract, but it does not repair the underlying range-band asymmetry. H2 is
rejected as a live balance candidate; no Opening Weave status, UI, replay
field, server rule, reward change, or V5 rule is approved.

## G0 Opening and reaction contract - 2026-08-09

The remaining problem is now more precise than a generic “first actor
advantage.” At a declared opening cut, an actor may be able to convert a
move-and-cast into meaningful direct damage before the other actor has a
credible response. The design task is to test a response window without
quietly changing normal-turn action economy or granting a cost-free damage
negation.

For the D2A model, the cut is deliberately narrow: the attacker has already
chosen and completed the cast's permitted voluntary movement; the chosen Relic
and resulting launch band are public; direct damage has not yet resolved. The
target may either accept that cast or use a separately configured reaction. A
reaction must satisfy all of the following:

1. It is an explicit target choice, not an automatic hit cancel or a hidden
   change to the attacker's action.
2. It changes a finite state carrier already represented by the recurrence
   cut—at least world position and an existing bounded reserve—so it cannot
   recreate F2's non-terminal return.
3. It is legal only under a precise movement/bounds/tether condition and has a
   deterministic post-reaction range check.
4. The opening search quantifies the target's legal reaction as a counter:
   an opening cast is “forced” only when it wins through every available target
   response, not merely through a cooperative target.
5. The candidate is analysis-only. It cannot add a reaction button, animation,
   replay field, server rule, or V5 rule until an owner separately accepts both
   the design and an implementation work package.

G0 retains the recurrence hard gate and the existing 16-turn analytical cap.
The latter remains a diagnostic, never an acceptable terminal result for a
candidate. A later owner decision must set the acceptable initiative tolerance;
D2A will report the mirrored rate but will not invent a threshold. A candidate
also fails when it leaves bounded direct openings at the declared cross-band
starts, or when it reaches that result by free/automatic cancellation rather
than a readable residual.

### Candidate G1 Cast Threadstep hypothesis

G1 is the smallest response test under that contract. It retains C4 unchanged
and adds no new meter. Against one declared in-band direct cast, the target may
take one full ordinary 64-unit movement step away before damage resolves. The
step spends exactly 64 units of that target's existing Escape Slack, obeys
normal arena and active Seam-Pin limits, and is used only when it takes the
target fully outside the declared Relic's launch band. If the reaction cannot
make the cast miss, it is unavailable; it therefore cannot buy a partial
reduction or become a free no-op.

The transparent `retreat_kite`, `best_response`, and candidate-only
`threadstep_counter` policies elect that optional reaction when it evades the
cast. Other baseline policies decline it, preserving their stated aggressive
strategy. Separately, the bounded force search grants the target both legal
choices; this prevents a heuristic policy from hiding an opening that a
credible reaction would answer. G1 is schema version 10 and has no live
authority.

### Candidate G1 Cast Threadstep result - 2026-08-09

G1 validates the response-window machinery without creating a recurrence: all
250 centered 448/512/576/640/704 primary-matrix matches Unravel, and the fixed
recurrence gate records no repeated non-terminal state. The reaction appears
132 times in primary traces and 20 times in the candidate probes. It produces
a real visible residue—target position shifts by 64 and that target's Escape
Slack falls by 64—and a missed cast neither deals damage nor attaches Seam Pin.

It is nevertheless **rejected negative evidence**. A full Threadstep only
beats a cast already sitting at the far edge of a launch band. Under the
unchanged move-and-cast economy, the opening actor can first step 64 units
toward the target. At the 512 start, for example, a Spoolburst cast from 448
remains in range after the target's 64-unit Threadstep restores separation only
to 512. The reaction therefore cannot answer the three move-and-cast forced
openings (`needlepoint`, `threadball`, and `spoolburst`) at the 512 start; all
six stationary/advancing casts remain forced at the 448 start. The search has
made that limitation explicit rather than hiding it behind a fixed policy.

The cross-band first-actor rate is 60.8% (64%/56%/60%/52%/72% by ascending
start), better than C4’s 63.0% but still paired with the unresolved direct
opening residue. Mean duration is 5.952 turns. Thus a bounded pre-hit retreat
can improve ordinary trace fairness and convergence while failing the more
important opening-response contract. No Cast Threadstep, reaction UI, replay
field, status, forced movement, or V5 rule is approved. Any later candidate
must address the attacker’s move-and-cast compression directly rather than
making the target’s single step stronger by tuning alone.
