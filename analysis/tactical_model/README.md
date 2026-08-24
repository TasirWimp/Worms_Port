# WP-015D2A Tactical Analysis

This directory is a deterministic, project-owned **analysis tool**. It is not
part of the Phaser client, server authority, Socket.IO protocol, replay ABI,
Loomkeeper, reward path, or product build. The authoritative game remains the
TypeScript simulation under `shared/`.

The checked-in V4 fixture is regenerated from `shared/simulation.ts` by
`scripts/export-tactical-v4-baseline.ts` and verified by the TypeScript test.
The Python model validates the shared V4 arena, spawn, Stitching, turn, and
movement facts before a configuration runs. Its level-ground direct-hit model
does not claim terrain or ballistic parity.

Run the complete D2A harness:

```powershell
npm run test:tactical-model
```

Run the fixed C4 cross-band starting-distance sweep:

```powershell
python -m analysis.tactical_model.run `
  --config analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json `
  --starting-distances 448 512 576 640 704 `
  --output test-results/tactical-model/v5-range-damage-forward-seam-pin-escape-slack-128-c4-starting-distance-sweep-report.json
```

Each supplied distance creates a centered, open-ground analytical scenario,
then mirrors actor positions and first actor. These scenarios are not altered
V4 spawns and do not claim TypeScript replay parity; they are controlled
counterfactuals that test how the candidate behaves at the Spoolburst,
Threadball, Needlepoint, and out-of-range boundaries.

Run the complete I1 boundary frame over both first actors and both mirrors:

```powershell
python -m analysis.tactical_model.run `
  --config analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json `
  --starting-distances 511 512 513 575 576 577 639 640 641 703 704 705 `
  --range-entry-boundary-sweep `
  --output test-results/tactical-model/i1-range-entry-boundary-sweep-report.json
```

This report intentionally differs from the historical paired-orientation
sweep: it crosses both first actors with both spatial mirrors and all 25
ordered primary-policy pairs, producing 100 matches per distance. It does not
alter any historical report or digest.

Write an ignored, reproducible report for one configuration:

```powershell
python -m analysis.tactical_model.run `
  --config analysis/tactical_model/configs/v4-baseline-abstract-v1.json `
  --output test-results/tactical-model/v4-baseline-report.json
```

`v4-baseline-abstract-v1.json` records the ideal-direct-hit consequences of
the accepted V4 values. `v5-range-damage-candidate-a.json` is a comparison
candidate only: it has no ruleset identifier, runtime path, replay authority,
or approval to become V5. Reports name their assumptions and policy limits;
they are design evidence, not a prediction of real-player behavior.

`v5-range-damage-seam-pin-candidate-b.json` is a separately schema-versioned
exploratory tactical-core candidate. It keeps Candidate A's range/damage table,
then lets a direct Needlepoint hit cap only the target's next
distance-increasing movement at 32 units, for one target turn. The target may
still cast, hold, or move toward the caster; its caster has a one-own-turn
Needlepoint cooldown. This is analysis-only, uses ideal direct hits, and does
not authorize a status effect, production ruleset, replay field, UI, or asset.

The report's `aggregate` always uses the original five-policy mirrored 50-match
matrix, so its metrics remain comparable between configurations. Candidate-only
policies appear separately in `candidatePolicyProbes` rather than silently
changing the headline sample.

`v5-range-damage-forward-seam-pin-candidate-b2.json` tests the narrower
forward-stitch rule: a stationary Needlepoint cast still deals its low ideal
direct damage but creates no tether, a cast after movement away from the target
is unavailable, and only an advancing cast can apply Seam Pin. It preserves the
same no-post-shot-movement turn economy as every other model configuration.
Candidate B2 has no production authority and is evaluated against the same
primary five-policy matrix as Candidates A and B.

The four schema-version 4 Candidate C configurations add an equal,
non-refilling **Escape Slack** reserve to Candidate B2:

- `v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json`
- `v5-range-damage-forward-seam-pin-escape-slack-192-candidate-c1.json`
- `v5-range-damage-forward-seam-pin-escape-slack-256-candidate-c2.json`
- `v5-range-damage-forward-seam-pin-escape-slack-320-candidate-c3.json`

Each actor begins with the declared reserve for the whole match. Only the
actual portion of a move that increases separation spends that actor's own
reserve; approaching, holding, and casts cost none. Once it is exhausted, the
actor can still approach and cast but cannot increase separation. This is a
soft, symmetric arena-convergence hypothesis rather than a total movement
budget: it never freezes a pursuer merely because they have already moved.
Seam Pin applies first, so a tethered 32-unit retreat consumes exactly 32
Escape Slack, not the attempted 64. Candidate C remains analytical only and
does not authorize a live meter, rule, UI, replay field, or status effect.

The `retreat_kite` policy is deliberately constrained to label only a real
separation-increasing relocation as a retreat. If Escape Slack prevents such a
move, it chooses its best legal cast instead of moving toward the opponent
under a misleading retreat label. This keeps policy traces useful as bounded
strategy evidence; it does not claim a human or production Loomkeeper will
make the same choice.

`v5-range-damage-forward-seam-pin-escape-slack-brace-candidate-d1.json` is a
separate schema-version 5 defensive probe. Each actor has one public `brace`
action: it ends the turn and reduces the next opposing direct hit by 50%; it
expires if that opponent instead relocates. It has no healing, damage return,
turn-order change, opening protection, runtime path, or production authority.
Its `brace_counter` probe policy spends the action only when that reduction
makes the opponent's currently legal hit nonlethal. D1 is recorded as rejected
negative evidence: a post-hit, damage-only Brace does not counter the
first-actor direct-hit race in this model.

The three schema-version 6 Candidate E configurations keep C4's forward Seam
Pin and 128-unit Escape Slack, then make **Spoolburst** pay a self-Stitching
cost. A cast is legal only when the caster has more Stitching than the cost, so
it always leaves the caster at one or more Stitching and cannot create a
simultaneous self-Unraveling:

- `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-10-candidate-e1.json`
- `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-20-candidate-e2.json`
- `v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-30-candidate-e3.json`

The compact trace now records `actorBacklashDamage` independently from the
target's `damage`; the report declares the candidate under
`tacticalCore.spoolburstBacklash`. Candidate E is rejected analysis-only
evidence: each cost removes the bounded direct Spoolburst forced actions, but
10 reintroduces timeouts and 20/30 increase the cross-band first-actor rate.
It does not authorize a live self-damage rule, Threadball effect, UI, replay
field, or V5 ruleset.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadball-disruption-candidate-f1.json`
is the separate schema-version 7 follow-up to that rejected result. It restores
Spoolburst's full direct damage, but a caster must spend one full in-range turn
on `prepare_spoolburst`; the charge is usable only on that caster's immediately
following turn as a stationary release, so a one-step retreat really can escape
the threat. A direct Threadball hit during the window clears the charge and
still deals its ordinary 45 direct damage. Compact traces record the charge,
its start, and disruption separately. F1 proves that the telegraphed
preparation/disruption loop occurs in the fixed policy matrix, but it is also
rejected analysis-only evidence: it removes bounded forced openings and
timeouts while worsening cross-band first-actor bias. It authorizes no live
charge state, Threadball status, UI, replay field, or V5 ruleset.

`v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json`
is the separate schema-version 8 response-contract probe. It gives the prepared
Spoolburst a decisive 100 direct damage and a one-hit Spun Cocoon that absorbs
Needlepoint or Spoolburst damage. Threadball has a deliberately separated
choice: a normal 45-damage Strike leaves the Cocoon/charge intact, whereas the
zero-damage `unweave_spoolburst` action clears both. F2 reduces the cross-band
first-actor rate below C4, but produces a pure prepare/Unweave loop in every
medium-hold versus short-approach pairing. It remains rejected analysis-only
evidence: no Cocoon, 100-damage Spoolburst, Unweave action, UI, replay field,
or V5 ruleset is approved.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json`
is the isolated schema-version 9 follow-up. It deliberately removes F2's Cocoon
so the test asks one question only: can an Unweave remain a readable counter
without returning the duel to the same tactical state? A zero-damage Threadball
Unweave clears a prepared Spoolburst only when its caster can take one full
64-unit step away using their existing Escape Slack. Normal Threadball damage
does not clear preparation. The report's `tacticalVoyage.recurrenceGate` uses a
declared tactical-state cut—active actor, position, Stitching, temporary state,
and bounded reserves, but not elapsed turns—to surface repeated non-terminal
states in the fixed policy witness. This is an L4+ CRPM-inspired analytical
lens, not a runtime dependency, player model, or production design authority.

F3 removes F2's repeated-state witnesses and all 250 cross-band matches
Unravel, but its cross-band first-actor rate rises to 68.8%. It is therefore
rejected negative evidence: a visible residual can repair convergence without
repairing initiative fairness. No Threadback, forced movement, charge state,
UI, replay field, or V5 rule is approved.

`v5-range-damage-forward-seam-pin-escape-slack-cast-threadstep-reaction-candidate-g1.json`
is the isolated schema-version 10 opening-response probe. After an otherwise
legal cast's voluntary movement but before ideal direct damage resolves, its
target may use one full normal 64-unit movement step away. It spends that
target's existing Escape Slack and only occurs when the resulting position is
outside the declared Relic range; a successful Threadstep therefore leaves
visible position/reserve residue and the cast deals no damage or Seam Pin. The
transparent `retreat_kite`, `best_response`, and candidate-only
`threadstep_counter` policies elect the optional reaction only when it evades;
the bounded opening search instead considers both target choices so it cannot
hide a forced opening behind a heuristic.

G1 is rejected analysis-only evidence. It passes the recurrence gate and all
250 cross-band matches Unravel, with a 60.8% first-actor rate and 5.952 mean
turns. But its one-step response cannot escape a caster who first moves closer:
the 448 start keeps six forced casts and the 512 start keeps three advancing
forced casts. It authorizes no reaction timing, UI, replay field, movement
rule, or V5 change.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json`
is the schema-version 11 F2/F3 recombination. It keeps F3's prepared
80-damage Spoolburst and compulsory full-Escape-Slack Threadback Unweave, then
restores only F2's one-hit Spun Cocoon against Needlepoint and Spoolburst. A
normal Threadball Strike stays a 45-damage non-cancelling choice; the separate
zero-damage Unweave clears Cocoon plus preparation only while its caster can
take the full 64-unit Threadback. Thus it introduces neither F2's free
prepare/Unweave loop nor its 100-damage Spoolburst value.

F4 is the leading structural reference, not a production candidate. It has no
forced opening, recurrence witness, or turn-limit result across all 250
cross-band matches, but its 63.2% first-actor rate is slightly worse than C4's
63.0% and rises to 80% at the 704 start. No Cocoon, preparation, Unweave,
Threadback, UI, replay field, or V5 rule is approved.

`v5-range-damage-forward-seam-pin-escape-slack-opening-weave-second-actor-candidate-h1.json`
is the schema-version 12 second-actor compensation probe. Only the actor that
takes the second normal turn begins with one public Opening Weave. It absorbs
one direct hit from any Relic during the first actor's opening action; if that
action does not cast, it expires when its owner completes the first normal
response action. It cannot be saved, refilled, stacked, or applied after that
opening exchange, and its state is included in the recurrence cut.

H1 is rejected analysis-only evidence because the full one-hit protection
overcompensates. It has no forced opening, recurrence witness, or turn-limit
result across all 250 cross-band matches, but first-actor wins fall to 44.0%
(including 36% at the 512 and 640 starts). It proves that a public,
first-turn-only initiative compensation can close the hard structural failures,
but all-Relic full damage negation is too strong. No Opening Weave UI, replay,
server, reward, or V5 rule is approved.

`v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json`
is the schema-version 13 paid follow-up. The second actor may spend one full
64-unit Escape-Slack step to absorb one opening direct hit, rather than having
the hit cancelled automatically. The primary policy spends only against
Threadball or Spoolburst (45+ direct damage), but the bounded opening search
also evaluates the legal paid response to every Relic. This keeps the decision
and its movement-reserve residue explicit.

H2 closes forced openings, recurrence, and turn limits across the 250-match
cross-band sweep, with 48.8% first-actor wins overall. Its range bands remain
materially uneven (44%/40%/44%/40%/76% by ascending start), so it is rejected
as a live balance candidate rather than tuned further. It is useful evidence
that a priced opening response can be structurally sound, but cannot by itself
fix the long-range asymmetry. No Opening Weave UI, replay, server, reward, or
V5 rule is approved.

`v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json`
is the schema-version 14 coupled follow-up. A paid Opening Weave halves the
first direct hit and marks its user with one public Frayed Seam. After the
defender's normal intervening action, an advancing Needlepoint from the opening
caster can turn the existing one-turn Seam Pin into a zero-separation bind;
the Frayed Seam then expires. The separate `frayed_seam_pressure` probe proves
that this attacker-side counterplay is reachable without putting it into the
stable primary policy matrix.

H3 is rejected analysis-only evidence. All 250 cross-band matches Unravel and
have no recurrence witness, but the candidate returns to C4's 63.2%
first-actor rate and leaves forced Spoolburst/Threadball openings at the
448/512/576 starts. A delayed, counterable vulnerability cannot repair an
immediate forced direct-cast line. No Frayed Seam, strengthened Seam Pin,
Opening Weave, UI, replay, server, reward, or V5 rule is approved.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json`
is the schema-version 15 F4 child. It removes only an ordinary direct cast that
is illegal before movement and made legal by that cast's own movement. The
actor may instead relocate, ending its turn; the opponent receives one normal
turn; and the original actor may cast later only if the later state remains in
band. Stationary and already-in-band casts, Spoolburst preparation/release,
Unweave, Threadback, values, policies, and state are unchanged. The commitment
is trace/path evidence, not a new status, right, meter, or reserved cast.

I1 is rejected analysis-only evidence. Its complete 12-distance,
four-orientation primary frame executes 1,188 entry commitments and records no
forced opening or non-terminal recurrence, but four `retreat_kite` versus
`retreat_kite` matches at 705 reach the 16-turn limit. Its superficially
attractive 54.3% aggregate first-actor rate hides a discontinuous
60/60/56/56/56/68/68/68/32/32/32/64% distance family. In particular, F4's
80% at 704 flips to 32% rather than becoming a stable repair. The deterministic
report digest is
`1dbefbedf8aa55e68002b91b6ed6c743085f5edbe5655a97f146d8161b053fa4`.
No World Design Port registration, range-entry rule, UI, replay, server,
reward, or V5 behavior is approved.

`v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json`
is the schema-version 16 F4 child. A movement-created Needlepoint entry keeps
the combined action and normal 30 damage but applies no Seam Pin and starts no
caster cooldown. Needlepoint already legal before movement retains F4's
ordinary `advance_only` behavior. I2 adds no state, resource, reaction, delayed
cast, or product authority.

I2 passes its declared twelve-distance Phase A gate. All 1,200 matches end in
Unraveling with no forced opening or non-terminal recurrence. It records 416
entry Seam-Pin suppressions; the 120 affected opening routes at 641, 703, and
704 split into 84 first-actor and 36 second-actor wins rather than F4's 120/0
or I1's full-turn reversal. Its distance family is
56/56/60/60/60/60/60/60/56/56/56/44 percent, with 57 percent aggregate. The
canonical report digest is
`31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d`.

An exploratory 333-class scan across the full legal coordinate-distance range
does not extend the accepted domain. Starts at 769 expose the inherited
16-turn horizon: F4 has four turn limits and I2 has eight, including four new
`retreat_kite` mirrors whose entry suppression occurs only at turn 10. A
post-hoc 96-class slice from 24 through 768 has 9,600/9,600 Unraveling results,
no recurrence/forced opening, and 44-to-60-percent rates, but it is supporting
diagnostic evidence rather than a promotion gate. I2 is therefore a bounded
Phase A structural survivor with explicit horizon residue. World Design Port,
V5, UI, replay, server, reward, and production registration remain unopened.

WP-015D2E later admitted that exact evidence through a sealed analysis-only
World Design Port profile. WP-015D2F then audited the unchanged F4/I2 reports
by policy rather than treating the 61-to-57-percent aggregate shift as a
single result. The deterministic audit is implemented by
`analysis/tactical_model/policy_closure_audit.py`; generated JSON remains below
ignored `test-results/tactical-model/`.

The D2F audit residualizes I2 as `policy_fragile`. Its five first-actor-policy
contributions are `-36/+8/+8/-36/+8` wins for range pressure, medium hold,
short approach, retreat kite, and best response. Every same-policy mirror is
outcome-identical between F4 and I2; best-response versus best-response remains
44 first-actor wins in 48 matches. On the 120 matched 641/703/704 opening
entries, 72 routes change the caster's next action and 36 flip to the second
actor. At exact production spawn 640 the opening rule is unused and the
aggregate stays 60/40, although 28 later separation/re-entry suppressions
remain explicit.

The canonical audit digest is
`476735407135b11f1d3805a7b7a4b22c5d7c8a46a1f6ac972f2d134fb3ff1657`.
This does not rewrite I2's historical structural result; it blocks interpreting
that result as robust initiative repair. No I2 rule or V5 behavior is approved.
The next permitted action is a review of the complete candidate history and
policy limitations before another mechanic is contracted.
