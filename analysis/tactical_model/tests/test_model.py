from __future__ import annotations

from dataclasses import replace
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
    policy_names,
    run_experiment,
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


if __name__ == "__main__":
    unittest.main()
