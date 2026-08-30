# WP-015D2W — Lane G Player-Visible Formation And Credible Response Timing Contract

Status: source-bound documentation/preregistration complete for review; no
player observation, timing collection, browser/device session, instrumentation,
telemetry, or Lane G execution is authorized or performed.

Date: 2026-08-30.

Owner: Worms_Port. Coordination/review vocabulary: CRPM L4+ only. Parent:
[WP-015D2V parent re-entry](wp-015d2v-parent-reentry-and-dual-lane-handoff.md).
Earlier question registry:
[WP-015D2P V4 observation pressure](wp-015d2p-v4-observation-pressure-contract.md).
Evidence carrier: [WP-015D2W](../evidence/wp-015d2w.json).

## 1. Authorization, Target, And Present State

This document implements only the separately versioned Lane G documentation
contract requested after WP-015D2V. Its protected target and method are fixed:

```yaml
target: player_visible_formation_and_credible_response_timing
method: separately_bound_player_observation_and_timing_contract
```

The contract asks whether a player can see and identify a Loomkeeper spell
formation and submit an existing, effective V4 gameplay response before that
specific incoming shot becomes authoritative and unavoidable. It does not
assume the answer is positive. In particular, current source order may make the
immediate response set empty; that remains a licensed negative result rather
than a reason to move the window or target after observation.

Current facts remain:

```yaml
Lane_G_identity_recorded: true
Lane_G_current_evidence: none
Lane_G_execution_open: false
D2O_player_information_timing_gate: unsatisfied
active_execution_pointer: WP-015D2A
aggregate_debt: interrupted_no_tap
ProductAuthority: none
mathematical_placement_implication: none
gameplay_change: false
P5_open: false
landfall_claim: false
```

`pilot_activation: not_required`. This pass preregisters a Worms-owned
observation boundary, accepts no material cross-world witness, and changes no
CRPM or Worms verdict. If a later pass accepts a witness or changes a verdict,
it must reevaluate the CRPM pilot at its own bound HEAD.

## 2. Rebound Source And Carrier Audit

The contract is bound to the clean entries verified after fetching both
remotes:

| Repository | Entry branch | Entry commit | Entry tree |
| --- | --- | --- | --- |
| CRPM | `codex/wp-015d2r-parent-reentry-v0-r2` | `e14b661ff521cbc398b0bd6245e8f54f0388a37b` | `ae2d50f96745c163b924edd1b2b1fe76a569626f` |
| Worms_Port | `codex/wp-015d2v-parent-reentry-v0-r2` | `7f8fe6108ae26a0e25bb3ca185dab6c1f86c662f` | `07c5d8ace8e0c604ad1d27745797a17e6cf10640` |

Relevant immutable Git-byte sources are:

| Source | Blob | SHA-256 |
| --- | --- | --- |
| CRPM parent successor note | `10bfe714ec56327476f53e3d5c4833d93af1582a` | `dbdca548183fcb863bec9a7b231df016e7f86dfd772ef2583f59e720e22eee73` |
| CRPM parent return | `d54bafe1dd019cb41cc91261d556f4592211159e` | `2869afac730240faa0866badb5eccc77dcbf4ea814847be45c59d1867d539373` |
| Worms WP-015D2V parent handoff | `348f11c9a6fce16f710d23b40f0572f5a5eedebd` | `140c6d6573f5051231caba64460d664d84451573911d21929fd4e9bb1c8c1dcf` |
| Worms WP-015D2V terminal evidence | `0820425f34b11a0f21099fda86f324dc63f1627c` | `58bd3883fd7ac7eacd95d00c373c2794a4a68a048a0736247809cb2958fe2d64` |
| Worms WP-015D2P question registry | `c7b5d1adf6759f8f1ca0a26ccce49009ba03fa19` | `d060aa18c0ee575ec87ed53c1e90f83feed1517eca7068a054aae24afea325f5` |
| V4 presentation planner | `54be1878d1df4afaae25c7ef865665e20b3072fa` | `974ce2977f68bad3011eb4884ea4e6b5b306a857968545403587ac33ec770334` |
| Combat presentation scene | `20134c4c12d006b91b5f9b2021be8fae56c02bf5` | `8a0ab059cc48e2b541126ccb0c681a2fbe37bfc00e5417a4e475aabfebc0295c` |
| Public combat controls | `2225f3d91ec5f4aa7835519bfac0552fd51b2581` | `f3517583cc05108491d9b3f12de8bce6e04990d47890a86e900bd1adcb89d760` |
| Protocol/snapshot boundary | `721c7435873bbcc1e5a5b80d16f95f3b513ea41d` | `cd22ca1b08355a24006363b6ade446c8eb322f86ec59a4e5a4aacf63d0ec7d86` |
| Package lock | `ff3987b1224d4160a0b25fffe7952cce3364b880` | `d4dac6ae09a3d2f6c5a7eaa11520bac43f1628320c5331575bcf1e1857073d73` |

The carrier search found no `WP-015D2W` collision and no existing exact Lane G
contract. D2P deliberately leaves its public-observation environment, timing,
tolerance, privacy, and stopping rule unbound. D2V records only Lane G identity
and evidence `none`. A new planning/evidence pair is therefore justified by a
distinct purpose, lifecycle, review surface, and future execution gate.

## 3. Exact Current Output Allow-List

This documentation pass may change only:

### Worms_Port

1. add this contract;
2. add `docs/evidence/wp-015d2w.json`;
3. narrowly append `docs/planning/implementation_plan.md`; and
4. narrowly append
   `docs/planning/wp-015d2g-relational-gameplay-navigation-review.md`.

### CRPM

5. add
   `docs/architecture/definition_target_admission/returns/DTAP-WP015D2W_Lane_G_Documentation_Review_Return_2026-08-30_v0.yaml`;
6. narrowly append
   `docs/architecture/definition_target_admission/README.md`; and
7. add one current entry immediately after the append marker in
   `logs/CRPM-Work-Log.md`.

`legal/source-manifest.json` must remain byte-identical to Worms entry blob
`8d6ab2cae64a13f367bd3d7fef59368c13888c91`, SHA-256
`ab3da23b9d25f18cd128cb932df6f1038231b3f81f8031d770aaca1547ff5328`.
The existing parent-return row already binds the CRPM method source; the new
review return is not a runtime or method import. All source-bound parent notes,
returns, compact parity records, gameplay, assets, dependencies, schemas,
executors, and the active pointer are outside the allow-list.

## 4. Environment, Build, Client, Device, And Display Boundary

The future pilot identifier is `LG-SGS22-NIMIQPAY-SIDEWAYS-RIGHT-v0`. A trial
is usable only when all of these values are frozen before the participant sees
the game:

| Dimension | Frozen value |
| --- | --- |
| Runtime source | Worms commit `7f8fe6108ae26a0e25bb3ca185dab6c1f86c662f`, tree `07c5d8ace8e0c604ad1d27745797a17e6cf10640` |
| Dependency boundary | exact package-lock blob/SHA-256 above; clean `npm ci` plus `npm run build`; deployed client/server artifact digests must be captured in a later activation record |
| Host | the ordinary deployed Render service opened inside the Nimiq Pay Mini Apps WebView; no wallet or reward route |
| Client route | `/`, Practice mode, Wizard Calling, standard Loomkeeper, `nimble-knots-artillery-v4` |
| Physical device | the same project-owner-operated Samsung Galaxy S22 device class used by earlier acceptance; one fixed device instance for all trials |
| Device setup | Android auto-rotate off while portrait; phone held with top/earpiece on the left; no incoming call, notification, battery saver, split screen, or accessibility zoom |
| App/display | Nimiq Pay host chrome included; reported portrait `visualViewport` exactly `390x844` CSS pixels; default `sideways=right`; logical game surface `844x390`; browser zoom 100%; text scale 100%; motion preference `no-preference` |
| Input | single-finger touch only; no keyboard, mouse, stylus, controller, automation, or precision pointer |
| Network | one stable Wi-Fi connection; any reconnect, transport retry visible to the participant, or host-network switch interrupts the trial |
| Measurement overlay | Android screen recording at 60 frames/s with system touch indicators enabled; no face camera, microphone, or gameplay overlay |

Before any observation, a private activation row must bind the exact Android
build, Nimiq Pay app version, WebView user-agent/version, Render deployment
identifier, deployed artifact digests, measured viewport/DPR/safe-area values,
screen-recorder format/frame rate, device clock state, and reviewer workstation
clock. Those values may not be filled from memory after a session. Missing or
mismatching values classify the attempt as
`unusable_environment_or_build_unbound`; they do not license a substitute
device, browser, viewport, build, or host. The private row is an activation
prerequisite, not a current output, and requires separate owner authorization.

## 5. Participant, Reviewer, Consent, Privacy, And Retention Boundary

- The pilot is limited to one consenting adult participant: the project owner
  operating the fixed Galaxy S22. No child, recruited public participant,
  wallet holder, or paid participant is admitted by this version.
- The participant receives only the declared public instructions and support
  below. They may not inspect source, protocol frames, replay data, devtools,
  expected timing, or the source-derived expectation that a response window
  may be absent before the session ends.
- Two non-participant reviewers independently mark event frames and classify
  trials from pseudonymized captures. They reconcile only after both records
  are frozen. The coordinator may audit source/parity but may not replace a
  missing participant or manufacture a timing mark.
- Written informed consent must precede activation and state the exact screen-
  only capture, passive protocol-frame capture, purposes, retention, right to
  stop, and absence of payment, wallet use, audio, face, biometrics, advertising,
  or product-authority consequence.
- Raw data may contain only the screen recording, touch indicators, passive
  copies of existing Socket.IO frames, and activation metadata. Never collect
  a wallet address/proof, device identifier, IP address, face, voice, contacts,
  notifications, free-form chat, recovery material, or Nimiq funds data.
- Raw data stays outside Git in encrypted project-owner storage under a random
  session ID. Delete it 30 days after the source-bound review return or within
  72 hours of withdrawal, whichever occurs first. Retain only a sanitized
  derived event ledger and aggregate classification for 180 days, then keep
  only the durable report/return if separately authorized.
- Consent and private activation records are not committed. A withdrawal before
  de-identification removes that trial; the removal itself remains as a count
  `withdrawn_not_analyzed` without timing or participant detail.

No consent is requested and no raw or derived participant data exists in this
documentation milestone.

## 6. Public Inputs And Declared Support

The participant may use only the ordinary Practice start control and the
existing touch gameplay controls: movement pad, Relic selector, aim/power pad,
Fire, and Pause. Pause, camera pan, Retry, and changing a Relic are not by
themselves effective responses to an already incoming shot. Wallet, Daily
Challenge, browser navigation, developer tools, and operating-system controls
other than the pre-session orientation setup are excluded.

Declared support available before play is exactly:

1. the README instruction to disable Android auto-rotate, keep the viewport
   portrait, and hold the phone top-left for default clockwise sideways mode;
2. the Practice start-card setup text;
3. one neutral explanation that movement, Relic choice, aim, and Fire are
   separate touch actions and that Pause is not a gameplay response; and
4. the existing on-screen turn/status text, Stitching values, selected-Relic
   label, timer, battlefield, units, trajectories, cast stages, impacts, and
   enabled/disabled control states.

No source-derived threat label, hidden state, `serverTimeMs`, seed, AI choice,
projectile trace payload, expected answer, replay, or coaching is public input.
Reviewers may inspect passive protocol frames only for clock/authority coding
after the participant-facing record is frozen.

## 7. Exact Formation, Threat, And Response Events

The included scenario is the first naturally occurring **damaging** Loomkeeper
shot in each newly created Practice Clash. The relevant threat is the exact
Stitching/terrain consequence of that shot, not a later possible shot, match
loss, generic initiative pressure, or an F4 Cocoon/Unweave/Threadback event.

Event definitions are fixed before observation:

- `t_authority_commit`: `serverTimeMs` in the first existing authoritative
  snapshot that contains the Loomkeeper projectile and its post-command state.
- `t_authority_receive`: passive client-receipt time for that same snapshot.
- `t_commit_visible`: the first of two consecutive captured frames in which
  the existing combat root is in `loomkeeper-cast-formation`, visual stage is
  `formation-ready`, the formed Relic is visibly present, and the status text
  reads `Loomkeeper forms <Relic> spell` for the same Relic.
- `t_response_open`: the first captured frame at or after
  `t_commit_visible` where at least one existing player gameplay control is
  both visible and enabled for an ordinary V4 command.
- `t_response_submit`: the first touch-indicator frame for a command in the
  predeclared effective-response procedure after `t_response_open`.
- `t_response_accept`: `serverTimeMs` in the existing successful command
  acknowledgement for that exact request and the paired passive receipt time.
- `t_response_close`: the earlier of `t_response_accept` for an effective
  response or `t_threat_unavoidable`.
- `t_threat_unavoidable`: `t_authority_commit` for the authoritative snapshot
  that already contains the shot outcome. If that cannot be recovered exactly,
  the trial cannot support a positive timing claim.
- `t_threat_resolution_visible`: the first captured
  `loomkeeper-impact` frame that displays the authoritative post-impact
  Stitching/terrain state for that shot.

The required order is:

```text
t_commit_visible
  <= t_response_open
  <  t_response_submit
  <= t_response_accept
  <  t_threat_unavoidable
  <= t_threat_resolution_visible
```

If source/runtime order instead places `t_authority_commit` before
`t_commit_visible`, the credible-response criterion fails for that trial. The
visible animation may still be coded, but it is not retrospectively relabeled
as an authoritative response window.

## 8. Measurement, Clock Alignment, Latency, And Tolerance

- Player-visible and touch events use the 60 fps screen-capture presentation
  timestamp clock. One frame is `16.667 ms`; frame coding tolerance is plus or
  minus one frame.
- Authority events use the existing protocol `serverTimeMs`, simulation
  revision/state hash, request ID, and passive WebSocket receipt timestamp.
  No new gameplay event, logging statement, telemetry field, or repository
  instrumentation is allowed.
- Before trials, three sacrificial Pause/Resume acknowledgement transitions
  align capture PTS, passive receipt time, and server time. The affine mapping
  must have maximum residual at most `50 ms`; otherwise the session is
  `unusable_clock_alignment`.
- Record separately: authority-to-visible formation latency, formation-to-
  response-open latency, response-open-to-submit latency, submit-to-accept
  latency, and accept-to-threat-unavoidable margin. Do not sum or average
  across missing clocks.
- Reviewer marks agree when both choose the same frame or adjacent frames. A
  disagreement greater than one frame is `ambiguous_event_boundary` unless
  resolved from the frozen capture without changing the event definition.
- Network delay, render delay, touch delay, and authority scheduling remain
  separate. No negative latency is rounded to zero; no tolerance is used to
  turn an order violation into a pass.

## 9. Exact Credible-Response Criterion

For each included state, derive the candidate response set before examining
whether the trial succeeded:

```text
legal_response_set
  = existing move/select_relic/aim/fire commands visibly enabled after formation

accepted_response_set
  = legal_response_set commands with an exact successful V4 authority ack

effective_response_set
  = accepted_response_set commands whose authoritative before/after record
    prevents or changes the declared incoming-shot Stitching/terrain consequence
    before t_threat_unavoidable, without Pause, Retry, disconnect, hidden state,
    new gameplay, or a later-threat substitution
```

A trial satisfies `credible_response` only when:

1. the participant's immediate post-trial forced-choice answer names the formed
   Relic correctly without playback or coaching;
2. all required event identities and clocks are usable;
3. the temporal order in section 7 holds; and
4. `effective_response_set` contains at least one command actually submitted
   and authority-accepted in that interval.

The Lane G pilot may report a positive witness only if at least one of its three
usable trials satisfies all four conditions. A visible formation without an
effective accepted command is not a credible response. A command after impact,
a Pause, a later retaliatory shot, or a source assertion that the player could
have acted does not qualify.

## 10. Scenario Inclusion And Exclusion

Include only a trial that:

- starts a fresh non-wallet Practice Clash with the frozen client/device setup;
- reaches its first naturally occurring damaging Loomkeeper projectile;
- presents `loomkeeper-aim`, `loomkeeper-cast-charge`,
  `loomkeeper-cast-formation`, `loomkeeper-projectile`, and
  `loomkeeper-impact` for the same Relic and authoritative revision;
- keeps the game visible, foregrounded, connected, unpaused, and at the frozen
  viewport from formation through impact; and
- has complete consent, activation, capture, protocol, and reviewer records.

Exclude from the target domain without replacement beyond the stopping cap:

- player shots, non-damaging Loomkeeper shots, later Loomkeeper shots, Daily
  Challenge, rewards, wallet prompts, results, Retry, or combat preview;
- F4 analytical preparation/Cocoon/Unweave/Threadback, Stage C endpoints,
  simulated browser projects, keyboard/mouse input, or invented response phases;
- any different device, host, viewport, orientation, sideways mode, Calling,
  difficulty, ruleset, source/deployment, reduced-motion setting, or support;
- background/resume, notification, incoming call, rotation, resize, reconnect,
  pause, expiry, or reviewer coaching during the measured interval; and
- any trial after the stopping rule has fired.

## 11. Classification And Negative-Result Retention

Every attempted trial receives exactly one top-level class:

- `usable_credible_response_observed`;
- `usable_visible_formation_no_credible_response`;
- `usable_formation_not_correctly_identified`;
- `usable_no_legal_response_window`;
- `usable_response_rejected_or_late`;
- `ambiguous_event_boundary`;
- `ambiguous_authority_or_effectiveness`;
- `interrupted_network_or_host`;
- `interrupted_participant_or_device`;
- `unusable_environment_or_build_unbound`;
- `unusable_clock_alignment`;
- `unusable_capture_or_privacy_boundary`;
- `unusable_scenario_not_reached`; or
- `withdrawn_not_analyzed`.

Secondary reasons are additive but may not replace the top-level class. Retain
every negative, ambiguous, interrupted, unusable, and withdrawn count in the
derived ledger. Do not delete a no-window trial, rerun until a positive appears,
move the threat to a later turn, substitute a source inference, or exclude a
valid negative from the usable denominator.

## 12. Stopping Rule And Analysis Boundary

Stop the future pilot at the first of:

1. three usable included trials;
2. six total attempted Practice Clashes;
3. `PT20M` from the first Practice start; or
4. consent withdrawal, privacy breach, build/source mismatch, unsafe device
   state, or inability to maintain the clock boundary.

No replacement or extension is allowed after stop. One positive trial licenses
only `observed_single_participant_bounded_witness_pending_review`; zero positive
trials license the exact retained negative classification. Three unusable or
ambiguous trials do not become evidence of absence. No inferential statistics,
population claim, balance claim, device-matrix claim, fun claim, causation,
product decision, or D2O satisfaction follows from this one-participant pilot.

## 13. Future Data And Output Boundary

This milestone creates no observation data. A later, separately authorized
execution may write only:

- private consent and activation rows outside Git;
- encrypted raw screen/protocol captures outside Git, preferably under ignored
  `test-results/wp-015d2w-lane-g-execution-v1/` during active review;
- a sanitized derived event ledger with random session/trial IDs and only the
  events, latencies, classifications, and withdrawal count declared here;
- `docs/evidence/wp-015d2w-lane-g-execution-v1/result.json`;
- `docs/planning/wp-015d2w-lane-g-execution-report-v1.md`; and
- one separately source-bound review return.

Those future paths and the execution itself are **not authorized now**. A later
owner decision must rebind sources, confirm privacy/retention responsibility,
name the return path, and reopen execution explicitly. No screenshot, video,
protocol dump, device/app identifier, raw participant row, or generated report
may enter `assets/` or Git.

## 14. Source, Range, Digest, Parity, And Preservation Controls

Publication uses a non-self-referential sequence:

1. commit the four Worms source paths from section 3;
2. commit the CRPM review return/index/log bound to that Worms source commit;
3. finalize only `docs/evidence/wp-015d2w.json` with the durable source and
   review identities; and
4. verify containing commits, blobs, SHA-256 values, and exact ranges
   externally.

Required checks are strict JSON/YAML duplicate-key rejection, exact source
commit/tree/path/mode/blob/SHA-256 resolution, four-path Worms source range,
three-path CRPM review range, terminal evidence-only range, parity digest,
byte-identical source-manifest preservation, immutable parent artifact checks,
`npm run check:compliance`, and `git diff --check` in both repositories.
Documentation-only work does not run a build, simulation, Stage C aggregate,
browser/device session, or playtest.

The compact parity record is:

```yaml
lane_g_preregistration_parity:
  record_id: WP-015D2W-LANE-G-PREREGISTRATION-v0
  milestone_id: WP-015D2W
  target: player_visible_formation_and_credible_response_timing
  method: separately_bound_player_observation_and_timing_contract
  source_entry:
    crpm_commit: e14b661ff521cbc398b0bd6245e8f54f0388a37b
    worms_commit: 7f8fe6108ae26a0e25bb3ca185dab6c1f86c662f
  environment_id: LG-SGS22-NIMIQPAY-SIDEWAYS-RIGHT-v0
  build_source: 7f8fe6108ae26a0e25bb3ca185dab6c1f86c662f
  client:
    route: "/"
    mode: practice
    calling: wizard
    ruleset: nimble-knots-artillery-v4
    loomkeeper_difficulty: standard
  formation_event: first_two_consecutive_frames_of_loomkeeper_cast_formation_ready_with_matching_visible_status
  response_window_start: first_frame_after_formation_with_an_existing_player_gameplay_control_visible_and_enabled
  response_window_stop: earlier_of_authority_acceptance_of_an_effective_response_or_authoritative_threat_resolution
  credible_response: at_least_one_predeclared_effective_existing_v4_gameplay_command_authority_accepted_before_the_threatened_shot_becomes_unavoidable
  trial_domain: first_naturally_occurring_damaging_loomkeeper_shot_in_each_new_practice_clash
  stopping_rule: three_usable_trials_or_six_attempts_or_PT20M_whichever_occurs_first
  Lane_G_identity_recorded: true
  Lane_G_current_evidence: none
  Lane_G_execution_open: false
  D2O_player_information_timing_gate: unsatisfied
  active_execution_pointer: WP-015D2A
  aggregate_debt: interrupted_no_tap
  ProductAuthority: none
  mathematical_placement_implication: none
  gameplay_change: false
  P5_open: false
  landfall_claim: false
  pilot_activation: not_required
  parity_digest: 7da9340551ecae4df7a29bf7287759fd0cb655444dc3c9057456175ad065c1b1
```

The digest is SHA-256 over canonical recursively key-sorted JSON after removing
`parity_digest`. Every parity carrier must reproduce that exact object.

## 15. Relationship To D2O And Explicit Non-Claims

D2O remains a mechanics-fixed analytical return. Its calibrated axes and
authority-horizon warning are route provenance for asking this question, not
Lane G participant evidence, a player-visible carrier, or an answer. Stage C
and Lane M mathematical evidence are not inherited. The Stage C aggregate
repair is a Lane M prerequisite, not a Lane G documentation prerequisite.

This contract does not establish public formation, a legal or effective
response window, credible response, player understanding, D2O satisfaction,
gameplay authority, ProductAuthority, mathematical placement, P5, landfall, or
execution. It changes no gameplay and opens no observation.

Stop statement:

```text
Lane G documentation contract stopped for review;
no player observation or Lane G execution opened.
```
