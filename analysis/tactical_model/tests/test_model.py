from __future__ import annotations

from pathlib import Path
import unittest

from analysis.tactical_model.model import (
    Action,
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


if __name__ == "__main__":
    unittest.main()
