"""Focused WP-015D2E analytical-export regression tests."""

from __future__ import annotations

import unittest

from analysis.crpm_world.adapters.d2e_i2_export import (
    CONFIG_REGISTRATIONS,
    EXCLUDED_START_DISTANCE,
    ENTRY_WITNESS_DISTANCES,
    STARTING_DISTANCES,
    export_i2_admission_evidence,
    sha256_digest,
)


class D2EI2ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = export_i2_admission_evidence()

    def test_export_is_digest_bound_to_the_complete_fixed_domain(self) -> None:
        result = self.result
        digest = result["exportDigest"]
        payload = {key: value for key, value in result.items() if key != "exportDigest"}
        self.assertEqual(digest, sha256_digest(payload))
        self.assertEqual(result["domain"]["startingDistances"], list(STARTING_DISTANCES))
        self.assertEqual(result["domain"]["totalMatchCount"], 1200)
        self.assertEqual(
            result["domain"]["excludedInitialCarrierDistances"],
            [EXCLUDED_START_DISTANCE],
        )

    def test_all_comparator_reports_reproduce_the_d2d_bindings(self) -> None:
        self.assertEqual(
            [row["caseId"] for row in self.result["reportBindings"]],
            ["c4", "f4", "h2", "i1", "i2"],
        )
        for row in self.result["reportBindings"]:
            with self.subTest(case=row["caseId"]):
                registration = CONFIG_REGISTRATIONS[row["caseId"]]
                self.assertEqual(row["reportDigest"], registration["reportDigest"])
                self.assertEqual(row["matchCount"], 1200)
        i2 = self.result["reportBindings"][-1]
        self.assertEqual(i2["firstActorWins"], 684)
        self.assertEqual(i2["terminalReasons"], {"unravelled": 1200})
        self.assertEqual(i2["forcedOpeningScenarioCount"], 0)
        self.assertEqual(i2["nonterminalRecurrenceMatchCount"], 0)
        self.assertEqual(i2["entrySeamPinSuppressions"]["openingRouteResults"], {
            "total": 120,
            "firstActorWins": 84,
            "secondActorWins": 36,
            "turnLimitResults": 0,
        })

    def test_entry_response_and_in_band_control_witnesses_remain_distinct(self) -> None:
        witnesses = self.result["transitionWitnesses"]
        self.assertEqual(
            [row["matchIdentity"]["startingDistance"] for row in witnesses[:3]],
            list(ENTRY_WITNESS_DISTANCES),
        )
        for witness in witnesses[:3]:
            with self.subTest(witness=witness["witnessId"]):
                entry = witness["entry"]
                self.assertGreater(entry["sourceCarrier"]["distance"], 640)
                self.assertLessEqual(entry["targetCarrier"]["distance"], 640)
                self.assertEqual(entry["residual"]["damageToTarget"], 30)
                self.assertEqual(entry["residual"]["targetSeamPinTurns"], 0)
                self.assertEqual(entry["residual"]["casterSeamPinCooldown"], 0)
                self.assertEqual(witness["matchedF4"]["residual"], {
                    "damageToTarget": 30,
                    "targetSeamPinTurns": 1,
                    "casterSeamPinCooldown": 1,
                })
                self.assertEqual(
                    entry["targetCarrier"]["fullSnapshotDigest"],
                    witness["opponentResponse"]["sourceCarrier"]["fullSnapshotDigest"],
                )
        control = witnesses[3]
        self.assertEqual(control["sourceCarrier"]["distance"], 576)
        self.assertEqual(control["residual"]["targetSeamPinTurns"], 1)
        self.assertEqual(control["residual"]["casterSeamPinCooldown"], 1)
        self.assertIsNone(control["residual"]["entrySeamPinSuppression"])

    def test_horizon_warning_is_blocking_evidence_not_an_admitted_start(self) -> None:
        warning = self.result["horizonWarning"]
        self.assertFalse(warning["admissibleInitialCarrier"])
        self.assertEqual(warning["excludedStartingDistance"], 769)
        self.assertEqual(
            warning["terminalResults"]["f4"][1]["terminalReasons"],
            {"unravelled": 96, "turn_limit": 4},
        )
        self.assertEqual(
            warning["terminalResults"]["i2"][1]["terminalReasons"],
            {"unravelled": 92, "turn_limit": 8},
        )
        self.assertEqual(len(warning["additionalI2TimeoutPaths"]), 4)
        self.assertTrue(all(
            row["entrySuppressionTurns"] == [10]
            for row in warning["additionalI2TimeoutPaths"]
        ))

    def test_repeated_export_has_the_same_digest(self) -> None:
        repeated = export_i2_admission_evidence()
        self.assertEqual(repeated["exportDigest"], self.result["exportDigest"])
        self.assertEqual(repeated, self.result)


if __name__ == "__main__":
    unittest.main()
