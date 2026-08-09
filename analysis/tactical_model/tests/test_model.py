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
        for amount in (192, 256, 320):
            config = load_config(
                CONFIGS / f"v5-range-damage-forward-seam-pin-escape-slack-{amount}-candidate-c{(amount - 128) // 64}.json"
            )
            state = initial_state(config)
            self.assertIsNotNone(config.escape_slack)
            self.assertEqual(config.escape_slack.per_actor, amount)
            self.assertEqual((state.player.escape_slack_remaining, state.loomkeeper.escape_slack_remaining), (amount, amount))


if __name__ == "__main__":
    unittest.main()
