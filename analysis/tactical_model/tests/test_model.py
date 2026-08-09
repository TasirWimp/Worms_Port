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


if __name__ == "__main__":
    unittest.main()
