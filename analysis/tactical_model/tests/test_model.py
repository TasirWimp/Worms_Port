from __future__ import annotations

from dataclasses import replace
import hashlib
import json
from pathlib import Path
import unittest

from analysis.tactical_model.model import (
    Action,
    ActorState,
    action_key,
    apply_action,
    choose_action,
    distance,
    initial_state,
    legal_actions,
    load_config,
    movement_created_direct_cast_relics,
    policy_names,
    run_experiment,
    run_range_entry_boundary_sweep,
    run_starting_distance_sweep,
    simulate_match,
    validate_world_against_authority_fixture,
)


ROOT = Path(__file__).resolve().parents[3]
CONFIGS = ROOT / "analysis" / "tactical_model" / "configs"


class TacticalModelTests(unittest.TestCase):
    def test_v4_baseline_derives_its_shared_structural_facts_from_authority(self) -> None:
        config = load_config(CONFIGS / "v4-baseline-abstract-v1.json")
        validate_world_against_authority_fixture(config)
        state = initial_state(config)
        self.assertEqual((state.player.x, state.loomkeeper.x, state.active_actor), (512, 1152, "player"))

    def test_v4_ideal_direct_projection_exposes_needlepoint_dominance_and_initiative(self) -> None:
        config = load_config(CONFIGS / "v4-baseline-abstract-v1.json")
        report = run_experiment(config)
        self.assertEqual(report, run_experiment(config), "the analysis must be repeatable byte-for-byte as data")
        self.assertEqual(report["aggregate"]["directCastDominance"], [
            {"dominator": "needlepoint", "dominated": "threadball", "basis": "ideal_direct_cast_only"},
            {"dominator": "threadball", "dominated": "spoolburst", "basis": "ideal_direct_cast_only"},
            {"dominator": "needlepoint", "dominated": "spoolburst", "basis": "ideal_direct_cast_only"},
        ])
        player_first = simulate_match(
            config, "range_pressure", "range_pressure", first_actor="player", mirrored=False
        )
        loomkeeper_first = simulate_match(
            config, "range_pressure", "range_pressure", first_actor="loomkeeper", mirrored=True
        )
        self.assertEqual((player_first["winner"], player_first["turns"]), ("player", 1))
        self.assertEqual((loomkeeper_first["winner"], loomkeeper_first["turns"]), ("loomkeeper", 1))
        forced = report["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"]
        self.assertTrue(any(key.startswith("cast:needlepoint:") for key in forced))

    def test_exploratory_v5_candidate_has_three_non_dominated_ideal_direct_roles(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-candidate-a.json")
        report = run_experiment(config)
        self.assertEqual(report["analysisStatus"], "exploratory")
        self.assertEqual(report["aggregate"]["directCastDominance"], [])
        self.assertEqual(report["aggregate"]["matchCount"], 50)
        self.assertIn("turn_limit", report["aggregate"]["terminalReasons"])

    def test_action_key_keeps_trace_actions_readable_and_stable(self) -> None:
        config = load_config(CONFIGS / "v4-baseline-abstract-v1.json")
        action = next(action for action in legal_actions(initial_state(config), config)
                      if action.kind == "cast" and action.relic_id == "needlepoint" and action.direction == 0)
        self.assertEqual(action_key(action), "cast:needlepoint:stay")

    def test_seam_pin_candidate_breaks_the_equal_retreat_step_without_removing_the_target_turn(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-seam-pin-candidate-b.json")
        self.assertIn("seam_pin_pressure", policy_names(config))
        report = run_experiment(config)
        self.assertEqual(report["aggregate"]["matchCount"], 50, "primary reports remain comparable to Candidate A")
        self.assertEqual(len(report["candidatePolicyProbes"]), 4)
        self.assertEqual(report["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"], [])
        self.assertEqual(report["aggregate"]["openingSearch"]["loomkeeper"]["forcedWinActionsWithinDepth"], [])
        state = initial_state(config)
        opening = choose_action("seam_pin_pressure", state, config)
        self.assertEqual(action_key(opening), "cast:needlepoint:right")
        state = apply_action(state, opening, config)
        self.assertEqual(distance(state), 576)
        self.assertEqual(state.loomkeeper.seam_pin_turns, 1)
        self.assertEqual(state.player.seam_pin_cooldown, 1)
        self.assertIn(Action("cast", 0, "needlepoint"), legal_actions(state, config),
                      "the tethered target keeps its full option to answer with a cast")

        retreat = Action("relocate", 1)
        self.assertIn(retreat, legal_actions(state, config))
        state = apply_action(state, retreat, config)
        self.assertEqual(distance(state), 608, "the tether caps the 64-unit retreat at 32 units")
        self.assertEqual(state.loomkeeper.seam_pin_turns, 0, "the target retains its full action, then the one-turn tether ends")
        self.assertFalse(any(
            action.kind == "cast" and action.relic_id == "needlepoint"
            for action in legal_actions(state, config)
        ), "the caster's immediately following turn observes the configured cooldown")

    def test_forward_seam_pin_requires_advance_and_forbids_retreating_needlepoint(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-forward-seam-pin-candidate-b2.json")
        stationary = apply_action(initial_state(config), Action("cast", 0, "needlepoint"), config)
        self.assertEqual(stationary.loomkeeper.seam_pin_turns, 0)
        self.assertEqual(stationary.player.seam_pin_cooldown, 0)

        in_range = replace(initial_state(config), player=ActorState(576, config.maximum_stitching))
        self.assertIn(Action("cast", 0, "needlepoint"), legal_actions(in_range, config))
        self.assertNotIn(Action("cast", -1, "needlepoint"), legal_actions(in_range, config))

        advancing = apply_action(in_range, Action("cast", 1, "needlepoint"), config)
        self.assertEqual(advancing.loomkeeper.seam_pin_turns, 1)
        self.assertEqual(advancing.player.seam_pin_cooldown, 1)

    def test_escape_slack_is_equal_non_refilling_and_charges_only_actual_retreat(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-192-candidate-c1.json")
        state = initial_state(config)
        self.assertEqual((state.player.escape_slack_remaining, state.loomkeeper.escape_slack_remaining), (192, 192))

        state = apply_action(state, Action("cast", 1, "needlepoint"), config)
        self.assertEqual(distance(state), 576, "the forward cast closes distance without spending Escape Slack")
        self.assertEqual(state.player.escape_slack_remaining, 192)
        self.assertEqual(state.loomkeeper.escape_slack_remaining, 192)

        state = apply_action(state, Action("relocate", 1), config)
        self.assertEqual(distance(state), 608, "the tether still caps the first retreat at 32 units")
        self.assertEqual(state.loomkeeper.escape_slack_remaining, 160,
                         "only the actual tether-capped separation increase spends Escape Slack")

        state = apply_action(state, Action("relocate", 1), config)
        self.assertEqual(distance(state), 544, "approaching with the player does not spend its reserve")
        self.assertEqual(state.player.escape_slack_remaining, 192)

        exhausted = initial_state(config)
        for _ in range(3):
            exhausted = apply_action(exhausted, Action("relocate", -1), config)
            exhausted = apply_action(exhausted, Action("relocate", -1), config)
        self.assertEqual(exhausted.player.escape_slack_remaining, 0)
        self.assertNotIn(Action("relocate", -1), legal_actions(exhausted, config),
                         "an exhausted actor cannot gain additional separation")

    def test_escape_slack_candidates_load_with_their_declared_equal_reserves(self) -> None:
        candidates = {
            "v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json": 128,
            "v5-range-damage-forward-seam-pin-escape-slack-192-candidate-c1.json": 192,
            "v5-range-damage-forward-seam-pin-escape-slack-256-candidate-c2.json": 256,
            "v5-range-damage-forward-seam-pin-escape-slack-320-candidate-c3.json": 320,
        }
        for filename, amount in candidates.items():
            config = load_config(
                CONFIGS / filename
            )
            state = initial_state(config)
            self.assertIsNotNone(config.escape_slack)
            self.assertEqual(config.escape_slack.per_actor, amount)
            self.assertEqual((state.player.escape_slack_remaining, state.loomkeeper.escape_slack_remaining), (amount, amount))

    def test_retreat_kite_casts_when_escape_slack_prevents_a_real_retreat(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json")
        self.assertEqual(action_key(choose_action("retreat_kite", initial_state(config), config)), "relocate:-:left")

        no_escape_state = replace(
            initial_state(config),
            player=ActorState(512, config.maximum_stitching, escape_slack_remaining=0),
            loomkeeper=ActorState(1152, config.maximum_stitching, escape_slack_remaining=0),
        )
        self.assertEqual(
            action_key(choose_action("retreat_kite", no_escape_state, config)),
            "cast:needlepoint:stay",
            "the policy must cast rather than label an approach as a retreat",
        )

    def test_c4_centered_starting_distance_sweep_is_repeatable_and_keeps_authority_spawn_separate(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json")
        centered = initial_state(config, starting_distance=448)
        mirrored = initial_state(config, mirrored=True, starting_distance=448)
        self.assertEqual((centered.player.x, centered.loomkeeper.x, distance(centered)), (800, 1248, 448))
        self.assertEqual((mirrored.player.x, mirrored.loomkeeper.x, distance(mirrored)), (1248, 800, 448))

        distances = (448, 512, 576, 640, 704)
        report = run_starting_distance_sweep(config, distances)
        self.assertEqual(report, run_starting_distance_sweep(config, distances))
        self.assertEqual(report["startingDistances"], list(distances))
        self.assertEqual(report["aggregate"]["matchCount"], 250)
        self.assertEqual(
            [scenario["startingScenario"] for scenario in report["scenarioReports"]],
            [{"kind": "centered_distance", "startingDistance": value} for value in distances],
        )

    def test_one_use_brace_reduces_one_hit_then_expires_on_the_opponent_turn(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-brace-candidate-d1.json")
        state = initial_state(config)
        self.assertIn("brace_counter", policy_names(config))
        self.assertIn(Action("brace"), legal_actions(state, config))

        state = apply_action(state, Action("brace"), config)
        self.assertEqual((state.player.brace_turns, state.player.brace_uses_remaining), (1, 0))
        state = apply_action(state, Action("cast", -1, "needlepoint"), config)
        self.assertEqual(state.player.stitching, 85, "Brace halves the 30-damage Needlepoint hit")
        self.assertEqual(state.player.brace_turns, 0)
        self.assertNotIn(Action("brace"), legal_actions(state, config), "Brace is a one-use candidate action")

        expiry = apply_action(initial_state(config), Action("brace"), config)
        expiry = apply_action(expiry, Action("relocate", 1), config)
        self.assertEqual(expiry.player.brace_turns, 0, "a non-cast opposing turn consumes the public Brace window")

    def test_brace_counter_uses_brace_only_when_it_turns_a_lethal_hit_nonlethal(self) -> None:
        config = load_config(CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-brace-candidate-d1.json")
        threatened = replace(
            initial_state(config),
            player=ActorState(800, 45, escape_slack_remaining=128, brace_uses_remaining=1),
            loomkeeper=ActorState(1248, config.maximum_stitching, escape_slack_remaining=128, brace_uses_remaining=1),
        )
        self.assertEqual(action_key(choose_action("brace_counter", threatened, config)), "brace:-:stay")

    def test_spoolburst_backlash_variants_load_with_a_non_terminal_cost(self) -> None:
        candidates = {
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-10-candidate-e1.json": 10,
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-20-candidate-e2.json": 20,
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-30-candidate-e3.json": 30,
        }
        for filename, cost in candidates.items():
            config = load_config(CONFIGS / filename)
            self.assertIsNotNone(config.spoolburst_backlash)
            self.assertEqual(config.spoolburst_backlash.self_stitching_cost, cost)

    def test_spoolburst_backlash_is_paid_on_a_lethal_cast_and_blocks_a_terminal_self_cost(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-backlash-20-candidate-e2.json"
        )
        lethal_target = replace(
            initial_state(config, starting_distance=512),
            loomkeeper=ActorState(1248, 80, escape_slack_remaining=128),
        )
        resolved = apply_action(lethal_target, Action("cast", 0, "spoolburst"), config)
        self.assertEqual((resolved.player.stitching, resolved.loomkeeper.stitching), (80, 0))
        self.assertEqual((resolved.winner, resolved.finish_reason), ("player", "unravelled"))

        exhausted = replace(
            initial_state(config, starting_distance=512),
            player=ActorState(800, 20, escape_slack_remaining=128),
        )
        self.assertNotIn(
            Action("cast", 0, "spoolburst"),
            legal_actions(exhausted, config),
            "Spoolburst must never make its caster unravel in the same action",
        )

    def test_spoolburst_preparation_requires_a_visible_turn_and_threadball_can_disrupt_it(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadball-disruption-candidate-f1.json"
        )
        opening = initial_state(config, starting_distance=448)
        self.assertNotIn(Action("cast", 0, "spoolburst"), legal_actions(opening, config))
        self.assertIn(Action("prepare_spoolburst", 0), legal_actions(opening, config))

        prepared = apply_action(opening, Action("prepare_spoolburst", 0), config)
        self.assertEqual(prepared.player.spoolburst_preparation_turns, 1)
        disrupted = apply_action(prepared, Action("cast", 0, "threadball"), config)
        self.assertEqual(disrupted.player.spoolburst_preparation_turns, 0)
        self.assertEqual(disrupted.player.stitching, 55)
        self.assertNotIn(Action("cast", 0, "spoolburst"), legal_actions(disrupted, config))

        unanswered = apply_action(opening, Action("prepare_spoolburst", 0), config)
        unanswered = apply_action(unanswered, Action("relocate", 1), config)
        self.assertIn(
            Action("cast", 0, "spoolburst"),
            legal_actions(unanswered, config),
            "The charge remains available only through the caster's immediately following turn",
        )

        escaped = apply_action(initial_state(config, starting_distance=512), Action("prepare_spoolburst", 0), config)
        escaped = apply_action(escaped, Action("relocate", 1), config)
        self.assertNotIn(
            Action("cast", 0, "spoolburst"),
            legal_actions(escaped, config),
            "A prepared Spoolburst cannot chase a one-step retreat on its release turn",
        )

    def test_spun_cocoon_absorbs_one_non_threadball_hit_and_threadball_unweaves_without_damage(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json"
        )
        opening = initial_state(config, starting_distance=448)
        prepared = apply_action(opening, Action("prepare_spoolburst", 0), config)
        self.assertEqual((prepared.player.spoolburst_preparation_turns, prepared.player.spoolburst_cocoon_hits_remaining), (1, 1))

        guarded = apply_action(prepared, Action("cast", 0, "needlepoint"), config)
        self.assertEqual((guarded.player.stitching, guarded.player.spoolburst_cocoon_hits_remaining), (100, 0))
        self.assertEqual(guarded.player.spoolburst_preparation_turns, 1)

        struck = apply_action(prepared, Action("cast", 0, "threadball"), config)
        self.assertEqual((struck.player.stitching, struck.player.spoolburst_preparation_turns), (55, 1))
        self.assertEqual(struck.player.spoolburst_cocoon_hits_remaining, 1,
                         "Threadball Strike is damage-only and does not collapse the Cocoon")

        prepared_again = apply_action(opening, Action("prepare_spoolburst", 0), config)
        self.assertIn(Action("unweave_spoolburst", 0, "threadball"), legal_actions(prepared_again, config))
        unwoven = apply_action(prepared_again, Action("unweave_spoolburst", 0, "threadball"), config)
        self.assertEqual((unwoven.player.stitching, unwoven.player.spoolburst_preparation_turns, unwoven.player.spoolburst_cocoon_hits_remaining), (100, 0, 0))
        self.assertEqual(unwoven.loomkeeper.stitching, 100, "Unweave trades Threadball damage for cancellation")

        charged = apply_action(prepared_again, Action("relocate", 1), config)
        resolved = apply_action(charged, Action("cast", 0, "spoolburst"), config)
        self.assertEqual((resolved.winner, resolved.loomkeeper.stitching), ("player", 0))
        self.assertEqual(resolved.player.spoolburst_cocoon_hits_remaining, 0,
                         "The Cocoon is gone when its owner releases or abandons the charge")

    def test_f2_recurrence_gate_exposes_the_non_terminal_prepare_unweave_return(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json"
        )
        match = simulate_match(
            config,
            "medium_hold",
            "short_approach",
            first_actor="player",
            mirrored=False,
            starting_distance=576,
        )
        self.assertEqual((match["winner"], match["finishReason"]), ("draw", "turn_limit"))
        recurrence = match["nonterminalRecurrence"]
        self.assertIsNotNone(recurrence)
        assert recurrence is not None
        self.assertEqual(recurrence["cycleTurns"], 2)
        self.assertEqual(recurrence["state"]["activeActor"], "player")
        self.assertEqual(recurrence["state"]["player"]["escapeSlack"], 128)
        self.assertEqual(recurrence["state"]["loomkeeper"]["escapeSlack"], 128)

    def test_threadback_unweave_reorganizes_the_board_using_existing_escape_slack(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json"
        )
        opening = initial_state(config, starting_distance=448)
        prepared = apply_action(opening, Action("prepare_spoolburst", 0), config)
        self.assertIn(Action("unweave_spoolburst", 0, "threadball"), legal_actions(prepared, config))
        self.assertIn(Action("cast", 0, "threadball"), legal_actions(prepared, config))

        struck = apply_action(prepared, Action("cast", 0, "threadball"), config)
        self.assertEqual((struck.player.stitching, struck.player.spoolburst_preparation_turns), (55, 1),
                         "F3 isolates Threadback: a normal Threadball Strike must not also cancel preparation")

        unwoven = apply_action(prepared, Action("unweave_spoolburst", 0, "threadball"), config)
        self.assertEqual(distance(unwoven), 512)
        self.assertEqual(unwoven.loomkeeper.escape_slack_remaining, 64)
        self.assertEqual(unwoven.player.escape_slack_remaining, 128)
        self.assertEqual(unwoven.player.spoolburst_preparation_turns, 0)
        self.assertEqual(unwoven.loomkeeper.stitching, 100)

        no_slack = replace(prepared, loomkeeper=replace(prepared.loomkeeper, escape_slack_remaining=0))
        self.assertNotIn(Action("unweave_spoolburst", 0, "threadball"), legal_actions(no_slack, config),
                         "A Threadback cannot become a zero-cost cancellation after Escape Slack is exhausted")

    def test_f4_cocoon_preserves_the_charge_while_threadback_unweave_pays_the_residue(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json"
        )
        opening = initial_state(config, starting_distance=448)
        prepared = apply_action(opening, Action("prepare_spoolburst", 0), config)
        self.assertEqual(
            (prepared.player.spoolburst_preparation_turns, prepared.player.spoolburst_cocoon_hits_remaining),
            (1, 1),
        )

        guarded = apply_action(prepared, Action("cast", 0, "needlepoint"), config)
        self.assertEqual(
            (guarded.player.stitching, guarded.player.spoolburst_preparation_turns,
             guarded.player.spoolburst_cocoon_hits_remaining),
            (100, 1, 0),
        )

        struck = apply_action(prepared, Action("cast", 0, "threadball"), config)
        self.assertEqual(
            (struck.player.stitching, struck.player.spoolburst_preparation_turns,
             struck.player.spoolburst_cocoon_hits_remaining),
            (55, 1, 1),
            "a normal Threadball Strike remains damage-only in the F4 recombination",
        )

        unwoven = apply_action(prepared, Action("unweave_spoolburst", 0, "threadball"), config)
        self.assertEqual(distance(unwoven), 512)
        self.assertEqual(unwoven.loomkeeper.escape_slack_remaining, 64)
        self.assertEqual(
            (unwoven.player.spoolburst_preparation_turns, unwoven.player.spoolburst_cocoon_hits_remaining),
            (0, 0),
        )

        no_slack = replace(prepared, loomkeeper=replace(prepared.loomkeeper, escape_slack_remaining=0))
        self.assertNotIn(Action("unweave_spoolburst", 0, "threadball"), legal_actions(no_slack, config))

    def test_f4_preserves_the_f2_defensive_window_without_its_recurrence_loop(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json"
        )
        report = run_starting_distance_sweep(config, (448, 512, 576, 640, 704))
        self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 250})
        self.assertEqual(report["aggregate"]["firstActorWinRate"], 0.632)
        self.assertEqual(report["aggregate"]["averageTurns"], 7.304)
        self.assertEqual(
            [scenario["aggregate"]["firstActorWinRate"] for scenario in report["scenarioReports"]],
            [0.6, 0.56, 0.6, 0.6, 0.8],
        )
        for scenario in report["scenarioReports"]:
            self.assertEqual(scenario["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"], [])
            self.assertEqual(scenario["aggregate"]["openingSearch"]["loomkeeper"]["forcedWinActionsWithinDepth"], [])
            self.assertTrue(scenario["tacticalVoyage"]["recurrenceGate"]["passesFixedWitness"])

    def test_h1_opening_weave_is_public_to_the_second_actor_and_expires_after_the_response_turn(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-second-actor-candidate-h1.json"
        )
        opening = initial_state(config)
        self.assertEqual((opening.player.opening_weave_hits_remaining, opening.loomkeeper.opening_weave_hits_remaining), (0, 1))

        absorbed = apply_action(opening, Action("cast", 0, "needlepoint"), config)
        self.assertEqual((absorbed.loomkeeper.stitching, absorbed.loomkeeper.opening_weave_hits_remaining), (100, 0))

        mirrored = initial_state(config, first_actor="loomkeeper", mirrored=True)
        self.assertEqual((mirrored.player.opening_weave_hits_remaining, mirrored.loomkeeper.opening_weave_hits_remaining), (1, 0))

        unanswered = apply_action(opening, Action("relocate", -1), config)
        self.assertEqual(unanswered.loomkeeper.opening_weave_hits_remaining, 1)
        expired = apply_action(unanswered, Action("relocate", 1), config)
        self.assertEqual(expired.loomkeeper.opening_weave_hits_remaining, 0,
                         "the guard cannot be carried after its owner receives the first normal response turn")

    def test_h1_opening_weave_is_part_of_the_tactical_state_cut_and_report(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-second-actor-candidate-h1.json"
        )
        report = run_experiment(config)
        self.assertEqual(report["tacticalCore"]["openingWeave"], {
            "beneficiary": "second_actor",
            "absorbedHits": 1,
            "expiry": "after_beneficiary_first_action",
            "absorbedRelics": ["threadball", "needlepoint", "spoolburst"],
        })
        self.assertTrue(any(
            step["openingWeaveAbsorbedFor"] is not None
            for match in report["matches"]
            for step in match["trace"]
        ))

    def test_h1_removes_openings_without_recurrence_but_overcompensates_the_second_actor(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-second-actor-candidate-h1.json"
        )
        report = run_starting_distance_sweep(config, (448, 512, 576, 640, 704))
        self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 250})
        self.assertEqual(report["aggregate"]["firstActorWinRate"], 0.44)
        self.assertEqual(report["aggregate"]["averageTurns"], 6.152)
        self.assertEqual(
            [scenario["aggregate"]["firstActorWinRate"] for scenario in report["scenarioReports"]],
            [0.4, 0.36, 0.4, 0.36, 0.68],
        )
        for scenario in report["scenarioReports"]:
            self.assertEqual(scenario["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"], [])
            self.assertEqual(scenario["aggregate"]["openingSearch"]["loomkeeper"]["forcedWinActionsWithinDepth"], [])
            self.assertTrue(scenario["tacticalVoyage"]["recurrenceGate"]["passesFixedWitness"])

    def test_h2_opening_weave_makes_a_priced_choice_between_stitching_and_future_retreat(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json"
        )
        close_opening = initial_state(config, starting_distance=512)

        accepted = apply_action(close_opening, Action("cast", 0, "spoolburst"), config)
        self.assertEqual(
            (accepted.loomkeeper.stitching, accepted.loomkeeper.escape_slack_remaining,
             accepted.loomkeeper.opening_weave_hits_remaining),
            (20, 128, 1),
        )

        woven = apply_action(
            close_opening,
            Action("cast", 0, "spoolburst"),
            config,
            target_reaction_policy="opening_weave_counter",
        )
        self.assertEqual(
            (woven.loomkeeper.stitching, woven.loomkeeper.escape_slack_remaining,
             woven.loomkeeper.opening_weave_hits_remaining),
            (100, 64, 0),
        )

        needle_opening = initial_state(config)
        needle = apply_action(
            needle_opening,
            Action("cast", 0, "needlepoint"),
            config,
            target_reaction_policy="retreat_kite",
        )
        self.assertEqual(
            (needle.loomkeeper.stitching, needle.loomkeeper.escape_slack_remaining,
             needle.loomkeeper.opening_weave_hits_remaining),
            (70, 128, 1),
            "the recorded policy preserves mobility against the low-damage Needlepoint opening",
        )

        needle_countered = apply_action(
            needle_opening,
            Action("cast", 0, "needlepoint"),
            config,
            target_reaction_policy="opening_weave_counter",
        )
        self.assertEqual(
            (needle_countered.loomkeeper.stitching, needle_countered.loomkeeper.escape_slack_remaining,
             needle_countered.loomkeeper.opening_weave_hits_remaining),
            (100, 64, 0),
            "the opening search must retain the costly response as a legal player choice",
        )

        insufficient_slack = replace(
            close_opening,
            loomkeeper=replace(close_opening.loomkeeper, escape_slack_remaining=32),
        )
        unavailable = apply_action(
            insufficient_slack,
            Action("cast", 0, "spoolburst"),
            config,
            target_reaction_policy="opening_weave_counter",
        )
        self.assertEqual((unavailable.loomkeeper.stitching, unavailable.loomkeeper.opening_weave_hits_remaining), (20, 1))

    def test_h2_opening_search_includes_spending_the_optional_opening_weave(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json"
        )
        report = run_experiment(config, starting_distance=512)
        self.assertIn("opening_weave_counter", report["policySets"]["candidateOnlyProbe"])
        self.assertEqual(len(report["candidatePolicyProbes"]), 8,
                         "H2 retains C4 Seam-Pin probes and adds four optional-Opening-Weave probes")
        self.assertEqual(report["tacticalCore"]["openingWeave"]["escapeSlackCost"], 64)
        self.assertEqual(report["tacticalCore"]["openingWeave"]["counterPolicyMinimumDamage"], 45)

    def test_h2_paid_opening_weave_closes_openings_but_leaves_distance_band_imbalance(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json"
        )
        report = run_starting_distance_sweep(config, (448, 512, 576, 640, 704))
        self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 250})
        self.assertEqual(report["aggregate"]["firstActorWinRate"], 0.488)
        self.assertEqual(report["aggregate"]["averageTurns"], 5.928)
        self.assertEqual(
            [scenario["aggregate"]["firstActorWinRate"] for scenario in report["scenarioReports"]],
            [0.44, 0.4, 0.44, 0.4, 0.76],
        )
        for scenario in report["scenarioReports"]:
            self.assertEqual(scenario["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"], [])
            self.assertEqual(scenario["aggregate"]["openingSearch"]["loomkeeper"]["forcedWinActionsWithinDepth"], [])
            self.assertTrue(scenario["tacticalVoyage"]["recurrenceGate"]["passesFixedWitness"])

    def test_h3_paid_partial_opening_weave_leaves_a_counterable_needlepoint_window(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json"
        )
        opening = initial_state(config, starting_distance=512)
        woven = apply_action(
            opening,
            Action("cast", 0, "spoolburst"),
            config,
            target_reaction_policy="opening_weave_counter",
        )
        self.assertEqual(
            (
                woven.loomkeeper.stitching,
                woven.loomkeeper.escape_slack_remaining,
                woven.loomkeeper.opening_weave_hits_remaining,
                woven.loomkeeper.frayed_seam_source,
                woven.loomkeeper.frayed_seam_turns,
            ),
            (60, 64, 0, "player", 1),
            "H3 halves the opening hit, spends one full Escape-Slack step, and leaves public residue",
        )

        reply = apply_action(woven, Action("cast", 0, "needlepoint"), config)
        self.assertEqual(reply.active_actor, "player", "the Frayed Seam survives one normal intervening reply")
        bound = apply_action(reply, Action("cast", 1, "needlepoint"), config)
        self.assertEqual(
            (
                bound.loomkeeper.stitching,
                bound.loomkeeper.seam_pin_turns,
                bound.loomkeeper.seam_pin_maximum_separation_increase,
                bound.loomkeeper.frayed_seam_turns,
            ),
            (30, 1, 0, 0),
            "an advancing Needlepoint consumes the Frayed Seam window and applies the tighter pin",
        )
        self.assertNotIn(
            Action("relocate", 1),
            legal_actions(bound, config),
            "the zero-increase H3 pin prevents the exposed target from retreating on that response turn",
        )

        report = run_experiment(config, starting_distance=512)
        self.assertEqual(report["tacticalCore"]["openingWeave"]["damageReductionPercent"], 50)
        self.assertEqual(
            report["tacticalCore"]["frayedSeam"]["needlepointBindingMaximumSeparationIncrease"], 0,
        )
        self.assertIn("frayed_seam_pressure", report["policySets"]["candidateOnlyProbe"])
        self.assertEqual(len(report["candidatePolicyProbes"]), 10)
        self.assertTrue(any(
            step["frayedSeamBoundFor"] is not None
            for match in report["candidatePolicyProbes"]
            for step in match["trace"]
        ), "the dedicated H3 probe must exercise the attacker-side Needlepoint counterplay")

    def test_h3_counterable_weave_still_leaves_short_range_forced_openings(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json"
        )
        report = run_starting_distance_sweep(config, (448, 512, 576, 640, 704))
        self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 250})
        self.assertEqual(report["aggregate"]["firstActorWinRate"], 0.632)
        self.assertEqual(report["aggregate"]["averageTurns"], 5.336)
        self.assertEqual(
            [scenario["aggregate"]["firstActorWinRate"] for scenario in report["scenarioReports"]],
            [0.64, 0.6, 0.64, 0.52, 0.76],
        )
        for scenario in report["scenarioReports"]:
            self.assertTrue(scenario["tacticalVoyage"]["recurrenceGate"]["passesFixedWitness"])
        self.assertTrue(
            report["scenarioReports"][0]["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"],
            "H3's partial reduction cannot answer the 448 short-range opening",
        )
        self.assertEqual(
            report["scenarioReports"][3]["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"],
            [],
        )

    def test_threadback_candidate_passes_the_fixed_recurrence_gate_but_still_reports_its_initiative_risk(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json"
        )
        report = run_starting_distance_sweep(config, (448, 512, 576, 640, 704))
        self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 250})
        self.assertEqual(report["aggregate"]["firstActorWinRate"], 0.688)
        for scenario in report["scenarioReports"]:
            gate = scenario["tacticalVoyage"]["recurrenceGate"]
            self.assertTrue(gate["passesFixedWitness"])
            self.assertEqual(gate["nonterminalRecurrenceMatchCount"], 0)

    def test_cast_threadstep_spends_existing_escape_slack_only_to_evade_a_declared_cast(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-cast-threadstep-reaction-candidate-g1.json"
        )
        opening = initial_state(config)
        self.assertIn("threadstep_counter", policy_names(config))

        unanswered = apply_action(opening, Action("cast", 0, "needlepoint"), config)
        self.assertEqual((distance(unanswered), unanswered.loomkeeper.stitching), (640, 70))

        evaded = apply_action(
            opening,
            Action("cast", 0, "needlepoint"),
            config,
            target_reaction_policy="threadstep_counter",
        )
        self.assertEqual(distance(evaded), 704)
        self.assertEqual((evaded.loomkeeper.stitching, evaded.loomkeeper.escape_slack_remaining), (100, 64))
        self.assertEqual(evaded.loomkeeper.seam_pin_turns, 0,
                         "a cast that misses after Threadstep cannot attach Seam Pin")

        no_full_step = replace(
            opening,
            loomkeeper=replace(opening.loomkeeper, escape_slack_remaining=32),
        )
        constrained = apply_action(
            no_full_step,
            Action("cast", 0, "needlepoint"),
            config,
            target_reaction_policy="threadstep_counter",
        )
        self.assertEqual((distance(constrained), constrained.loomkeeper.stitching), (640, 70))

    def test_cast_threadstep_rewrites_the_opening_search_without_hiding_move_and_cast_openings(self) -> None:
        config = load_config(
            CONFIGS / "v5-range-damage-forward-seam-pin-escape-slack-cast-threadstep-reaction-candidate-g1.json"
        )
        report = run_experiment(config, starting_distance=512)
        expected_forced = [
            "cast:needlepoint:right",
            "cast:spoolburst:right",
            "cast:threadball:right",
        ]
        self.assertEqual(report["aggregate"]["openingSearch"]["player"]["forcedWinActionsWithinDepth"], expected_forced)
        self.assertEqual(report["aggregate"]["openingSearch"]["loomkeeper"]["forcedWinActionsWithinDepth"], expected_forced)
        self.assertEqual(len(report["candidatePolicyProbes"]), 8,
                         "G1 retains C4's Seam-Pin probes and adds four Threadstep probes")
        self.assertEqual(
            report["tacticalCore"]["castThreadstep"]["resolutionWindow"],
            "after declared caster movement and before direct damage",
        )

    def test_i1_splits_only_movement_created_direct_cast_legality(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json"
        )

        at_704 = initial_state(config, starting_distance=704)
        self.assertEqual(movement_created_direct_cast_relics(at_704, 1, config), ("needlepoint",))
        self.assertNotIn(Action("cast", 1, "needlepoint"), legal_actions(at_704, config))
        self.assertIn(Action("relocate", 1), legal_actions(at_704, config))

        at_640 = initial_state(config, starting_distance=640)
        self.assertIn(Action("cast", 0, "needlepoint"), legal_actions(at_640, config))
        self.assertIn(Action("cast", 1, "needlepoint"), legal_actions(at_640, config))
        self.assertEqual(movement_created_direct_cast_relics(at_640, 1, config), ("threadball",))
        self.assertNotIn(Action("cast", 1, "threadball"), legal_actions(at_640, config))

        at_511 = initial_state(config, starting_distance=511)
        self.assertNotIn(Action("cast", 0, "spoolburst"), legal_actions(at_511, config))
        self.assertEqual(movement_created_direct_cast_relics(at_511, 1, config), ())

        at_705 = initial_state(config, starting_distance=705)
        self.assertEqual(movement_created_direct_cast_relics(at_705, 1, config), ())
        self.assertFalse(any(action.kind == "cast" for action in legal_actions(at_705, config)))

    def test_i1_does_not_double_wrap_spoolburst_preparation(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json"
        )
        state = initial_state(config, starting_distance=513)
        self.assertIn(Action("prepare_spoolburst", 1), legal_actions(state, config))
        self.assertEqual(movement_created_direct_cast_relics(state, 1, config), ())

        prepared = apply_action(state, Action("prepare_spoolburst", 1), config)
        self.assertEqual(prepared.player.spoolburst_preparation_turns, 1)
        self.assertEqual(distance(prepared), 449)

    def test_i1_trace_exposes_entry_then_an_ordinary_opponent_turn(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json"
        )
        match = simulate_match(
            config,
            "range_pressure",
            "range_pressure",
            first_actor="player",
            mirrored=False,
            starting_distance=704,
        )
        entry, response = match["trace"][0:2]
        self.assertEqual(entry["action"], "relocate:-:right")
        self.assertEqual(entry["rangeEntryCommitmentRelics"], ["needlepoint"])
        self.assertEqual(entry["rangeEntryCommitmentStartedBy"], "player")
        self.assertEqual(entry["directCastRelicsLegalBefore"], [])
        self.assertEqual(entry["directCastRelicsLegalAfterMovement"], ["needlepoint"])
        self.assertEqual(response["actor"], "loomkeeper")
        self.assertEqual(response["turn"], entry["turn"] + 1)
        self.assertIsNone(response["rangeEntryCommitmentStartedBy"])

    def test_f4_parent_keeps_its_existing_combined_range_entry_cast(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json"
        )
        state = initial_state(config, starting_distance=704)
        self.assertIn(Action("cast", 1, "needlepoint"), legal_actions(state, config))

    def test_i1_boundary_sweep_rejects_aggregate_false_closure_and_timeouts(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json"
        )
        distances = (511, 512, 513, 575, 576, 577, 639, 640, 641, 703, 704, 705)
        report = run_range_entry_boundary_sweep(config, distances)
        canonical = json.dumps(
            report,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")

        self.assertEqual(hashlib.sha256(canonical).hexdigest(),
                         "1dbefbedf8aa55e68002b91b6ed6c743085f5edbe5655a97f146d8161b053fa4")
        self.assertEqual(report["aggregate"]["matchCount"], 1200)
        self.assertEqual(report["aggregate"]["terminalReasons"], {
            "unravelled": 1196,
            "turn_limit": 4,
        })
        self.assertEqual(report["aggregate"]["nonterminalRecurrenceMatchCount"], 0)
        self.assertEqual(report["aggregate"]["forcedOpeningScenarioCount"], 0)
        self.assertEqual(report["aggregate"]["firstActorWins"], 652)
        self.assertEqual(report["aggregate"]["rangeEntryCommitments"], {
            "total": 1188,
            "byRelic": {"threadball": 536, "needlepoint": 652, "spoolburst": 0},
            "routeResults": {
                "later_direct_cast": 508,
                "later_alternative_action": 468,
                "later_cast_unavailable": 212,
                "terminal_before_actor_return": 0,
                "missing_opponent_response": 0,
            },
        })
        self.assertEqual(
            [scenario["firstActorWinRate"] for scenario in report["scenarioReports"]],
            [0.6, 0.6, 0.56, 0.56, 0.56, 0.68, 0.68, 0.68, 0.32, 0.32, 0.32, 0.64],
        )
        self.assertEqual(report["scenarioReports"][-1]["terminalReasons"], {
            "unravelled": 96,
            "turn_limit": 4,
        })
        self.assertFalse(any(
            step["action"].startswith("relocate:") and
            "spoolburst" in step["directCastRelicsLegalAfterMovement"]
            for scenario in report["scenarioReports"]
            for match in scenario["matches"]
            for step in match["trace"]
        ))

    def test_i1_boundary_comparators_are_locked_to_the_same_frame(self) -> None:
        distances = (511, 512, 513, 575, 576, 577, 639, 640, 641, 703, 704, 705)
        cases = (
            (
                "v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json",
                "65a7e4f9300f9bcc51715a670760d0e74d5a25f09c1b70e5ff061b118d0e7dac",
                720,
                6,
                0.76,
            ),
            (
                "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json",
                "8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd",
                732,
                0,
                0.8,
            ),
            (
                "v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json",
                "e99091ad9a75104c16136d55d73d95dc92dcca1d266369455efeb73c9316f2fe",
                584,
                0,
                0.76,
            ),
        )
        for filename, expected_digest, first_actor_wins, forced_scenarios, rate_at_704 in cases:
            with self.subTest(config=filename):
                report = run_range_entry_boundary_sweep(load_config(CONFIGS / filename), distances)
                canonical = json.dumps(
                    report,
                    sort_keys=True,
                    separators=(",", ":"),
                    ensure_ascii=False,
                ).encode("utf-8")
                self.assertEqual(hashlib.sha256(canonical).hexdigest(), expected_digest)
                self.assertEqual(report["aggregate"]["matchCount"], 1200)
                self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 1200})
                self.assertEqual(report["aggregate"]["nonterminalRecurrenceMatchCount"], 0)
                self.assertEqual(report["aggregate"]["firstActorWins"], first_actor_wins)
                self.assertEqual(report["aggregate"]["forcedOpeningScenarioCount"], forced_scenarios)
                scenario_704 = next(
                    scenario for scenario in report["scenarioReports"]
                    if scenario["startingDistance"] == 704
                )
                self.assertEqual(scenario_704["firstActorWinRate"], rate_at_704)

    def test_i2_suppresses_only_entry_generated_needlepoint_seam_pin(self) -> None:
        f4 = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json"
        )
        i2 = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json"
        )
        entry_state = initial_state(i2, starting_distance=704)
        entry_action = Action("cast", 1, "needlepoint")

        self.assertEqual(legal_actions(entry_state, i2), legal_actions(initial_state(f4, starting_distance=704), f4))
        f4_after = apply_action(initial_state(f4, starting_distance=704), entry_action, f4)
        i2_after = apply_action(entry_state, entry_action, i2)
        self.assertEqual(i2_after.player.x, f4_after.player.x)
        self.assertEqual(i2_after.loomkeeper.stitching, 70)
        self.assertEqual(f4_after.loomkeeper.stitching, i2_after.loomkeeper.stitching)
        self.assertEqual(f4_after.loomkeeper.seam_pin_turns, 1)
        self.assertEqual(f4_after.player.seam_pin_cooldown, 1)
        self.assertEqual(i2_after.loomkeeper.seam_pin_turns, 0)
        self.assertEqual(i2_after.player.seam_pin_cooldown, 0)

        already_in_band = initial_state(i2, starting_distance=576)
        ordinary_advance = apply_action(
            already_in_band,
            Action("cast", 1, "needlepoint"),
            i2,
        )
        self.assertEqual(ordinary_advance.loomkeeper.stitching, 70)
        self.assertEqual(ordinary_advance.loomkeeper.seam_pin_turns, 1)
        self.assertEqual(ordinary_advance.player.seam_pin_cooldown, 1)

    def test_i2_trace_binds_the_suppressed_pin_without_hiding_damage_or_response(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json"
        )
        match = simulate_match(
            config,
            "range_pressure",
            "range_pressure",
            first_actor="player",
            mirrored=False,
            starting_distance=704,
        )
        entry, response = match["trace"][0:2]
        self.assertEqual(entry["action"], "cast:needlepoint:right")
        self.assertEqual(entry["distanceBefore"], 704)
        self.assertEqual(entry["distanceAfter"], 640)
        self.assertEqual(entry["damage"], 30)
        self.assertEqual(entry["entrySeamPinSuppression"], {
            "target": "loomkeeper",
            "relicId": "needlepoint",
        })
        self.assertIsNone(entry["seamPinAppliedTo"])
        self.assertEqual(entry["loomkeeperSeamPinTurns"], 0)
        self.assertEqual(entry["playerSeamPinCooldown"], 0)
        self.assertEqual(response["actor"], "loomkeeper")
        self.assertEqual(response["turn"], 1)

    def test_i2_boundary_sweep_survives_the_declared_phase_a_gates(self) -> None:
        config = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json"
        )
        distances = (511, 512, 513, 575, 576, 577, 639, 640, 641, 703, 704, 705)
        report = run_range_entry_boundary_sweep(config, distances)
        canonical = json.dumps(
            report,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")

        self.assertEqual(hashlib.sha256(canonical).hexdigest(),
                         "31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d")
        self.assertEqual(report["aggregate"]["matchCount"], 1200)
        self.assertEqual(report["aggregate"]["terminalReasons"], {"unravelled": 1200})
        self.assertEqual(report["aggregate"]["nonterminalRecurrenceMatchCount"], 0)
        self.assertEqual(report["aggregate"]["forcedOpeningScenarioCount"], 0)
        self.assertEqual(report["aggregate"]["firstActorWins"], 684)
        self.assertEqual(report["aggregate"]["entrySeamPinSuppressions"], {
            "total": 416,
            "byRelic": {"threadball": 0, "needlepoint": 416, "spoolburst": 0},
            "openingRouteResults": {
                "total": 120,
                "firstActorWins": 84,
                "secondActorWins": 36,
                "turnLimitResults": 0,
            },
        })
        self.assertEqual(
            [scenario["firstActorWins"] for scenario in report["scenarioReports"]],
            [56, 56, 60, 60, 60, 60, 60, 60, 56, 56, 56, 44],
        )
        for starting_distance in (641, 703, 704):
            scenario = next(
                item for item in report["scenarioReports"]
                if item["startingDistance"] == starting_distance
            )
            self.assertEqual(
                scenario["entrySeamPinSuppressions"]["openingRouteResults"],
                {
                    "total": 40,
                    "firstActorWins": 28,
                    "secondActorWins": 12,
                    "turnLimitResults": 0,
                },
            )
        for scenario in report["scenarioReports"]:
            for match in scenario["matches"]:
                for step in match["trace"]:
                    if step["entrySeamPinSuppression"] is None:
                        continue
                    self.assertIsNone(step["seamPinAppliedTo"])
                    actor_cooldown = (
                        step["playerSeamPinCooldown"]
                        if step["actor"] == "player"
                        else step["loomkeeperSeamPinCooldown"]
                    )
                    self.assertEqual(actor_cooldown, 0)

    def test_i2_extended_horizon_witness_stays_outside_the_declared_gate(self) -> None:
        f4 = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json"
        )
        i2 = load_config(
            CONFIGS /
            "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json"
        )
        f4_report = run_range_entry_boundary_sweep(f4, (768, 769))
        i2_report = run_range_entry_boundary_sweep(i2, (768, 769))

        self.assertEqual(
            [scenario["terminalReasons"] for scenario in f4_report["scenarioReports"]],
            [{"unravelled": 100}, {"unravelled": 96, "turn_limit": 4}],
        )
        self.assertEqual(
            [scenario["terminalReasons"] for scenario in i2_report["scenarioReports"]],
            [{"unravelled": 100}, {"unravelled": 92, "turn_limit": 8}],
        )
        i2_timeouts = [
            match
            for match in i2_report["scenarioReports"][1]["matches"]
            if match["finishReason"] == "turn_limit"
        ]
        self.assertEqual(sum(
            match["playerPolicy"] == "retreat_kite" and
            match["loomkeeperPolicy"] == "retreat_kite"
            for match in i2_timeouts
        ), 4)
        self.assertEqual(sum(
            any(step["entrySeamPinSuppression"] is not None for step in match["trace"])
            for match in i2_timeouts
        ), 4)


if __name__ == "__main__":
    unittest.main()
