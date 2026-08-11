"""Regression tests for the deterministic D2A analytical exporter."""

from __future__ import annotations

import copy
import unittest

from analysis.crpm_world.adapters.d2a_export import (
    D2AExportError,
    REGISTERED_CASES,
    export_pressure_suite,
    load_registered_config,
    sha256_digest,
)


def diagnostic(result: dict, case_id: str) -> dict:
    return next(item for item in result["diagnostics"] if item["diagnosticId"] == f"d2a-{case_id}-pressure-diagnostic")


def probes(result: dict, case_id: str) -> dict[str, float | int]:
    return {
        item["probeId"]: item["value"]
        for item in diagnostic(result, case_id)["scalarProbes"]
    }


class D2AExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = export_pressure_suite()

    def test_registered_configs_and_schema_versions_fail_closed(self) -> None:
        self.assertEqual(load_registered_config("f2").identifier, "v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2")
        with self.assertRaisesRegex(D2AExportError, "Unknown D2A candidate config"):
            load_registered_config("unregistered-candidate")
        with self.assertRaisesRegex(D2AExportError, "Unknown D2A candidate config"):
            export_pressure_suite(("f2", "unknown"))

        original = REGISTERED_CASES["f2"]["schema_version"]
        try:
            REGISTERED_CASES["f2"]["schema_version"] = 999
            with self.assertRaisesRegex(D2AExportError, "schema version drifted"):
                export_pressure_suite(("f2",))
        finally:
            REGISTERED_CASES["f2"]["schema_version"] = original

    def test_result_digest_is_deterministic_and_input_order_is_meaningful(self) -> None:
        first = export_pressure_suite(("f2",))
        second = export_pressure_suite(("f2",))
        self.assertEqual(first, second)
        payload = {key: value for key, value in first.items() if key != "resultDigest"}
        payload["executionReceipt"] = {
            key: value for key, value in payload["executionReceipt"].items() if key != "resultDigest"
        }
        self.assertEqual(first["resultDigest"], sha256_digest(payload))
        self.assertEqual(first["executionReceipt"]["resultDigest"], first["resultDigest"])
        reversed_cases = export_pressure_suite(("h2", "f4"))
        forward_cases = export_pressure_suite(("f4", "h2"))
        self.assertNotEqual(reversed_cases["resultDigest"], forward_cases["resultDigest"])

    def test_f2_exact_prepare_unweave_cycle_is_recursive_carrier_return(self) -> None:
        voyage = next(item for item in self.result["traces"] if item["voyageId"] == "d2a-f2-pressure-voyage")
        self.assertEqual(
            [edge["commandOrDeclaration"]["actionKey"] for edge in voyage["transitionEdges"]],
            ["prepare_spoolburst:-:stay", "unweave_spoolburst:threadball:stay"],
        )
        self.assertEqual(
            voyage["transitionEdges"][0]["response"]["preRecurrenceKey"],
            voyage["transitionEdges"][-1]["response"]["postRecurrenceKey"],
        )
        self.assertEqual(len(voyage["recurrenceWitnesses"]), 1)
        assessment = self.result["returnAssessments"][0]
        self.assertEqual(assessment["satisfiedClassifications"], ["recursive_carrier_return"])
        self.assertEqual(diagnostic(self.result, "f2")["returnStrength"]["assessment"], "recursive_carrier_return")
        self.assertEqual(probes(self.result, "f2")["f2.recurrence_matches"], 20)

    def test_f3_threadback_spends_visible_support_and_does_not_return(self) -> None:
        voyage = next(item for item in self.result["traces"] if item["voyageId"] == "d2a-f3-pressure-voyage")
        threadback = voyage["transitionEdges"][-1]
        response = threadback["response"]
        self.assertEqual(threadback["commandOrDeclaration"]["actionKey"], "unweave_spoolburst:threadball:stay")
        self.assertEqual(response["distanceAfter"] - response["distanceBefore"], 64)
        before = response["preTacticalCarrier"]
        after = response["postTacticalCarrier"]
        self.assertEqual(before["player"]["escapeSlack"] - after["player"]["escapeSlack"], 64)
        self.assertNotEqual(voyage["transitionEdges"][0]["response"]["preRecurrenceKey"], response["postRecurrenceKey"])
        self.assertEqual(probes(self.result, "f3")["f3.first_actor_win_rate"], 0.688)
        self.assertIn("does not establish initiative fairness", diagnostic(self.result, "f3")["closureRisk"]["assessment"])

    def test_f4_preserves_structural_reference_and_initiative_residue(self) -> None:
        values = probes(self.result, "f4")
        self.assertEqual(values["f4.forced_opening_actions"], 0)
        self.assertEqual(values["f4.recurrence_matches"], 0)
        self.assertEqual(values["f4.turn_limit_results"], 0)
        self.assertEqual(values["f4.first_actor_win_rate"], 0.632)
        self.assertEqual(values["f4.distance_704_first_actor_win_rate"], 0.8)
        self.assertIn("Structural reference only", diagnostic(self.result, "f4")["closureRisk"]["assessment"])
        self.assertEqual(self.result["productAuthority"], "none")

    def test_h2_aggregate_parity_does_not_hide_distance_conditioning(self) -> None:
        values = probes(self.result, "h2")
        self.assertEqual(values["h2.aggregate_first_actor_win_rate"], 0.488)
        self.assertEqual(
            [values[f"h2.distance_{distance}_first_actor_win_rate"] for distance in (448, 512, 576, 640, 704)],
            [0.44, 0.4, 0.44, 0.4, 0.76],
        )
        self.assertIn("false-closure", diagnostic(self.result, "h2")["closureRisk"]["assessment"])

    def test_h3_counter_port_opens_after_the_immediate_edge(self) -> None:
        voyage = next(item for item in self.result["traces"] if item["voyageId"] == "d2a-h3-pressure-voyage")
        self.assertEqual(
            [edge["commandOrDeclaration"]["actionKey"] for edge in voyage["transitionEdges"]],
            ["cast:spoolburst:stay", "cast:needlepoint:stay", "cast:needlepoint:right"],
        )
        woven = voyage["transitionEdges"][0]["response"]["postTacticalCarrier"]["loomkeeper"]
        self.assertEqual(
            (woven["stitching"], woven["escapeSlack"], woven["openingWeaveHits"], woven["frayedSeamSource"], woven["frayedSeamTurns"]),
            (60, 64, 0, "player", 1),
        )
        reply = voyage["transitionEdges"][1]["response"]["postTacticalCarrier"]
        self.assertEqual((reply["activeActor"], reply["loomkeeper"]["frayedSeamTurns"]), ("player", 1))
        typed = next(
            item for item in self.result["worldObligations"]
            if item["obligationType"] == "frayed_seam" and
            item["origin"] == {"kind": "edge", "edgeId": voyage["transitionEdges"][0]["edgeId"]}
        )
        obligation = typed["obligationId"]
        first_residual = voyage["transitionEdges"][0]["residual"]
        reply_residual = voyage["transitionEdges"][1]["residual"]
        bound_residual = voyage["transitionEdges"][2]["residual"]
        self.assertIn(obligation, first_residual["openedObligations"])
        self.assertIn(obligation, first_residual["unresolvedObligations"])
        self.assertNotIn(obligation, reply_residual["openedObligations"])
        self.assertIn(obligation, reply_residual["carriedObligations"])
        self.assertIn(obligation, reply_residual["unresolvedObligations"])
        self.assertIn(obligation, bound_residual["dischargedObligations"])
        self.assertNotIn(obligation, bound_residual["unresolvedObligations"])
        self.assertNotIn(obligation, voyage["accumulatedResidual"]["unresolvedObligations"])
        self.assertEqual(typed["origin"], {"kind": "edge", "edgeId": voyage["transitionEdges"][0]["edgeId"]})
        self.assertEqual(typed["supportCarrier"], voyage["transitionEdges"][0]["targetCarrier"])
        self.assertEqual(typed["lifecycleStatus"], "discharged")
        self.assertEqual(typed["roles"]["originator"], "player")
        opening_weave = next(
            item for item in self.result["worldObligations"]
            if item["obligationType"] == "opening_weave" and item["obligationId"] in voyage["initialObligationIds"]
        )
        self.assertEqual(opening_weave["origin"]["kind"], "initial_carrier")
        self.assertEqual(opening_weave["lifecycleStatus"], "discharged")
        self.assertEqual(voyage["compatibilityResult"], {
            "compatible": True,
            "checkedEdgeIds": [edge["edgeId"] for edge in voyage["transitionEdges"]],
            "issues": [],
        })
        bound = voyage["transitionEdges"][2]["response"]["postTacticalCarrier"]["loomkeeper"]
        self.assertEqual((bound["stitching"], bound["seamPinTurns"], bound["seamPinMaximumSeparationIncrease"], bound["frayedSeamTurns"]), (30, 1, 0, 0))
        values = probes(self.result, "h3")
        self.assertGreater(values["h3.distance_448_forced_opening_actions"], 0)
        self.assertGreater(values["h3.distance_512_forced_opening_actions"], 0)
        self.assertGreater(values["h3.distance_576_forced_opening_actions"], 0)
        self.assertIn("already completed", diagnostic(self.result, "h3")["closureRisk"]["assessment"])

    def test_export_does_not_share_mutable_result_state(self) -> None:
        detached = copy.deepcopy(self.result)
        detached["blockedClaims"].append("caller mutation")
        fresh = export_pressure_suite(("f4",))
        self.assertNotIn("caller mutation", fresh["blockedClaims"])


if __name__ == "__main__":
    unittest.main()
