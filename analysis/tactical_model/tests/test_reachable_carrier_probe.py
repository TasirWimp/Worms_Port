from __future__ import annotations

import unittest

from analysis.tactical_model.policy_closure_audit import canonical_digest
from analysis.tactical_model.reachable_carrier_probe import (
    EXPECTED_REPORT_DIGESTS,
    OUTPUT_ROOT,
    PRODUCTION_SPAWN,
    _validated_output_path,
    build_reachable_carrier_export,
)


class ReachableCarrierProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.export = build_reachable_carrier_export()

    def test_historical_bindings_and_domain_are_exact(self) -> None:
        self.assertEqual(self.export["domain"]["startingDistances"], [PRODUCTION_SPAWN])
        self.assertEqual(self.export["domain"]["caseIds"], ["F4", "I2"])
        self.assertEqual(self.export["domain"]["orderedPolicyPairCount"], 25)
        self.assertEqual(self.export["domain"]["seed"], 3237998097)
        self.assertEqual(self.export["domain"]["maximumTurns"], 16)
        bindings = self.export["reportBindings"]
        self.assertEqual(
            {binding["caseId"]: binding["reportDigest"] for binding in bindings},
            EXPECTED_REPORT_DIGESTS,
        )
        self.assertEqual([binding["fullReportMatchCount"] for binding in bindings], [1200, 1200])
        self.assertEqual([binding["spawnMatchCount"] for binding in bindings], [100, 100])
        self.assertEqual([binding["spawnResult"]["firstActorWins"] for binding in bindings], [60, 60])

    def test_every_transition_is_reenterable_and_digest_bound(self) -> None:
        items = self.export["items"]
        self.assertGreater(len(items), 0)
        self.assertEqual(len({item["itemRef"] for item in items}), len(items))
        self.assertEqual(
            [sum(item["caseId"] == case_id for item in items) for case_id in ("F4", "I2")],
            [binding["transitionItemCount"] for binding in self.export["reportBindings"]],
        )
        for item in items:
            self.assertEqual(item["domain"]["startingDistance"], PRODUCTION_SPAWN)
            self.assertEqual(item["pathPrefixDigest"], canonical_digest(item["pathPrefixActions"]))
            self.assertEqual(item["sourceCarrierDigest"], canonical_digest(item["sourceCarrier"]))
            self.assertEqual(item["targetCarrierDigest"], canonical_digest(item["targetCarrier"]))
            self.assertEqual(
                item["analyticalTraceStepDigest"],
                canonical_digest(item["analyticalTraceStep"]),
            )
            self.assertIn(item["selectedAction"]["actionKey"], item["legalActionKeys"])
            self.assertEqual(item["transitionIndex"], len(item["pathPrefixActions"]))

    def test_export_digest_is_canonical_and_repeatable(self) -> None:
        without_digest = {
            key: value for key, value in self.export.items() if key != "exportDigest"
        }
        self.assertEqual(self.export["exportDigest"], canonical_digest(without_digest))
        self.assertEqual(build_reachable_carrier_export(), self.export)

    def test_output_is_confined_to_ignored_d2h_root(self) -> None:
        target = _validated_output_path(f"{OUTPUT_ROOT}/carrier-export.json")
        self.assertEqual(target.name, "carrier-export.json")
        with self.assertRaisesRegex(ValueError, "below"):
            _validated_output_path("analysis/tactical_model/model.py")
        with self.assertRaisesRegex(ValueError, "JSON"):
            _validated_output_path(f"{OUTPUT_ROOT}/carrier-export.txt")


if __name__ == "__main__":
    unittest.main()
