from __future__ import annotations

import unittest

from analysis.tactical_model.policy_closure_audit import (
    EXPECTED_REPORT_DIGESTS,
    STARTING_DISTANCES,
    _validated_output_path,
    build_policy_closure_audit,
    canonical_digest,
)


class PolicyClosureAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.audit = build_policy_closure_audit()

    def test_report_bindings_and_domain_are_exact(self) -> None:
        self.assertEqual(
            [binding["caseId"] for binding in self.audit["reportBindings"]],
            ["F4", "I2"],
        )
        self.assertEqual(
            {
                binding["caseId"]: binding["reportDigest"]
                for binding in self.audit["reportBindings"]
            },
            EXPECTED_REPORT_DIGESTS,
        )
        self.assertEqual(
            [binding["matchCount"] for binding in self.audit["reportBindings"]],
            [1200, 1200],
        )
        self.assertEqual(
            self.audit["domain"]["startingDistances"],
            list(STARTING_DISTANCES),
        )
        self.assertEqual(self.audit["domain"]["orderedPolicyPairs"], 25)

    def test_policy_contributions_reconcile_and_expose_mixed_direction(self) -> None:
        aggregate = self.audit["aggregateComparison"]
        self.assertEqual(aggregate["f4"]["firstActorWins"], 732)
        self.assertEqual(aggregate["i2"]["firstActorWins"], 684)
        self.assertEqual(aggregate["deltaFirstActorWins"], -48)
        rows = self.audit["firstActorPolicyRows"]
        self.assertEqual(
            [row["firstActorPolicy"] for row in rows],
            [
                "range_pressure",
                "medium_hold",
                "short_approach",
                "retreat_kite",
                "best_response",
            ],
        )
        self.assertEqual(
            [row["deltaFirstActorWins"] for row in rows],
            [-36, 8, 8, -36, 8],
        )
        self.assertEqual(
            sum(row["deltaFirstActorWins"] for row in rows),
            aggregate["deltaFirstActorWins"],
        )

    def test_same_policy_mirrors_and_exact_spawn_block_initiative_claim(self) -> None:
        same_policy = self.audit["samePolicyRows"]
        self.assertEqual(len(same_policy), 5)
        self.assertTrue(all(row["deltaFirstActorWins"] == 0 for row in same_policy))
        best = next(
            row for row in same_policy
            if row["firstActorPolicy"] == "best_response"
        )
        self.assertEqual(best["f4"]["firstActorWins"], 44)
        self.assertEqual(best["i2"]["firstActorWins"], 44)
        self.assertEqual(best["f4"]["matches"], 48)

        spawn = self.audit["exactSpawnAssessment"]
        self.assertEqual(spawn["comparison"]["deltaFirstActorWins"], 0)
        self.assertEqual(
            spawn["i2EntrySeamPinSuppressions"]["openingRouteResults"]["total"],
            0,
        )
        self.assertEqual(spawn["i2EntrySeamPinSuppressions"]["total"], 28)

    def test_matched_entry_routes_bind_action_selection_and_outcome_shift(self) -> None:
        shifts = self.audit["postEntryActionShifts"]
        self.assertEqual(sum(row["routes"] for row in shifts), 120)
        self.assertEqual(
            sum(
                row["routes"]
                for row in shifts
                if row["f4NextAction"] != row["i2NextAction"]
            ),
            72,
        )
        self.assertEqual(
            sum(
                row["routes"]
                for row in shifts
                if row["f4FirstActorWon"] and not row["i2FirstActorWon"]
            ),
            36,
        )
        self.assertEqual(
            sum(
                row["routes"]
                for row in shifts
                if row["firstActorPolicy"] == "range_pressure"
            ),
            60,
        )
        self.assertEqual(
            sum(
                row["routes"]
                for row in shifts
                if row["firstActorPolicy"] == "best_response"
            ),
            60,
        )

    def test_disposition_findings_and_digest_are_deterministic(self) -> None:
        self.assertEqual(self.audit["analyticalDisposition"], "residualized")
        self.assertEqual(self.audit["dispositionReason"], "policy_fragile")
        self.assertEqual(self.audit["productAuthority"], "none")
        self.assertTrue(all(finding["triggered"] for finding in self.audit["findings"]))
        digest = self.audit["auditDigest"]
        without_digest = {
            key: value
            for key, value in self.audit.items()
            if key != "auditDigest"
        }
        self.assertEqual(digest, canonical_digest(without_digest))
        self.assertEqual(
            digest,
            "476735407135b11f1d3805a7b7a4b22c5d7c8a46a1f6ac972f2d134fb3ff1657",
        )
        self.assertEqual(build_policy_closure_audit(), self.audit)

    def test_output_path_is_confined_to_ignored_json_root(self) -> None:
        target = _validated_output_path(
            "test-results/tactical-model/i2-policy-closure-audit.json"
        )
        self.assertEqual(target.name, "i2-policy-closure-audit.json")
        with self.assertRaisesRegex(ValueError, "below test-results/tactical-model"):
            _validated_output_path("analysis/tactical_model/model.py")
        with self.assertRaisesRegex(ValueError, "must be a JSON file"):
            _validated_output_path("test-results/tactical-model/audit.txt")


if __name__ == "__main__":
    unittest.main()
