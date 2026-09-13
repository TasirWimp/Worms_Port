"""Deterministic policy-conditioned closure audit for F4 and I2.

This module consumes the existing public tactical-model report function.  It
does not change policy selection, candidate mechanics, configs, or historical
reports.  Generated JSON belongs only below ignored test-results.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from .model import BASE_POLICY_NAMES, load_config, repository_root, run_range_entry_boundary_sweep


AUDIT_SCHEMA_VERSION = 1
AUDIT_ID = "wp-015d2f-i2-policy-conditioned-closure"
SOURCE_COMMIT = "9da87c9aeec8d9d34cfbb2ff053f69e4cf035d40"
SEED = 3237998097
STARTING_DISTANCES = (511, 512, 513, 575, 576, 577, 639, 640, 641, 703, 704, 705)
PRODUCTION_SPAWN_REFERENCE = 640
ENTRY_PRESSURE_DISTANCES = (641, 703, 704)

F4_CONFIG_PATH = (
    "analysis/tactical_model/configs/"
    "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-"
    "spun-cocoon-threadback-unweave-candidate-f4.json"
)
I2_CONFIG_PATH = (
    "analysis/tactical_model/configs/"
    "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-"
    "spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json"
)
EXPECTED_REPORT_DIGESTS = {
    "F4": "8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd",
    "I2": "31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _first_actor_policy(match: dict[str, Any]) -> str:
    return (
        match["playerPolicy"]
        if match["firstActor"] == "player"
        else match["loomkeeperPolicy"]
    )


def _second_actor_policy(match: dict[str, Any]) -> str:
    return (
        match["loomkeeperPolicy"]
        if match["firstActor"] == "player"
        else match["playerPolicy"]
    )


def _first_actor_won(match: dict[str, Any]) -> bool:
    return match["winner"] == match["firstActor"]


def _result_counts(matches: list[dict[str, Any]]) -> dict[str, Any]:
    first_actor_wins = sum(_first_actor_won(match) for match in matches)
    second_actor_wins = sum(
        match["winner"] not in {match["firstActor"], "draw", None}
        for match in matches
    )
    terminal_reasons: dict[str, int] = {}
    for match in matches:
        reason = match["finishReason"]
        terminal_reasons[reason] = terminal_reasons.get(reason, 0) + 1
    return {
        "matches": len(matches),
        "firstActorWins": first_actor_wins,
        "secondActorWins": second_actor_wins,
        "draws": len(matches) - first_actor_wins - second_actor_wins,
        "firstActorRate": round(first_actor_wins / len(matches), 12),
        "terminalReasons": terminal_reasons,
    }


def _flatten_matches(report: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        match
        for scenario in report["scenarioReports"]
        for match in scenario["matches"]
    ]


def _match_key(match: dict[str, Any]) -> tuple[Any, ...]:
    return (
        match["startingDistance"],
        match["firstActor"],
        match["mirrored"],
        match["playerPolicy"],
        match["loomkeeperPolicy"],
    )


def _comparison_row(
    identity: dict[str, Any],
    f4_matches: list[dict[str, Any]],
    i2_matches: list[dict[str, Any]],
) -> dict[str, Any]:
    f4 = _result_counts(f4_matches)
    i2 = _result_counts(i2_matches)
    return {
        **identity,
        "f4": f4,
        "i2": i2,
        "deltaFirstActorWins": i2["firstActorWins"] - f4["firstActorWins"],
    }


def _is_opening_entry_needlepoint(match: dict[str, Any]) -> bool:
    if not match["trace"]:
        return False
    step = match["trace"][0]
    action_kind, relic_id, direction = step["action"].split(":", 2)
    return (
        action_kind == "cast"
        and relic_id == "needlepoint"
        and direction != "stay"
        and step["distanceBefore"] > 640
        and step["distanceAfter"] <= 640
        and step["actor"] == match["firstActor"]
    )


def _next_action_for_entry_actor(match: dict[str, Any]) -> dict[str, Any]:
    actor = match["trace"][0]["actor"]
    later = next(
        (step for step in match["trace"][1:] if step["actor"] == actor),
        None,
    )
    if later is None:
        return {"action": "terminal_before_return", "damage": 0}
    return {"action": later["action"], "damage": later["damage"]}


def _build_report_binding(case_id: str, path: str, report: dict[str, Any]) -> dict[str, Any]:
    digest = canonical_digest(report)
    expected = EXPECTED_REPORT_DIGESTS[case_id]
    if digest != expected:
        raise RuntimeError(
            f"{case_id} report drifted: expected {expected}, observed {digest}"
        )
    return {
        "caseId": case_id,
        "configId": report["configId"],
        "configPath": path,
        "configSchemaVersion": 11 if case_id == "F4" else 16,
        "reportDigest": digest,
        "matchCount": report["aggregate"]["matchCount"],
    }


def build_policy_closure_audit() -> dict[str, Any]:
    root = repository_root()
    f4_report = run_range_entry_boundary_sweep(
        load_config(root / F4_CONFIG_PATH),
        STARTING_DISTANCES,
    )
    i2_report = run_range_entry_boundary_sweep(
        load_config(root / I2_CONFIG_PATH),
        STARTING_DISTANCES,
    )
    f4_matches = _flatten_matches(f4_report)
    i2_matches = _flatten_matches(i2_report)
    f4_by_key = {_match_key(match): match for match in f4_matches}
    i2_by_key = {_match_key(match): match for match in i2_matches}
    if set(f4_by_key) != set(i2_by_key) or len(f4_by_key) != 1200:
        raise RuntimeError("F4/I2 policy audit carriers are not exactly matched")

    aggregate = _comparison_row({}, f4_matches, i2_matches)
    per_distance = [
        _comparison_row(
            {"startingDistance": starting_distance},
            [match for match in f4_matches if match["startingDistance"] == starting_distance],
            [match for match in i2_matches if match["startingDistance"] == starting_distance],
        )
        for starting_distance in STARTING_DISTANCES
    ]
    first_actor_policy_rows = [
        _comparison_row(
            {"firstActorPolicy": policy},
            [match for match in f4_matches if _first_actor_policy(match) == policy],
            [match for match in i2_matches if _first_actor_policy(match) == policy],
        )
        for policy in BASE_POLICY_NAMES
    ]
    ordered_policy_pair_rows = [
        _comparison_row(
            {
                "firstActorPolicy": first_policy,
                "secondActorPolicy": second_policy,
            },
            [
                match for match in f4_matches
                if _first_actor_policy(match) == first_policy
                and _second_actor_policy(match) == second_policy
            ],
            [
                match for match in i2_matches
                if _first_actor_policy(match) == first_policy
                and _second_actor_policy(match) == second_policy
            ],
        )
        for first_policy in BASE_POLICY_NAMES
        for second_policy in BASE_POLICY_NAMES
    ]
    same_policy_rows = [
        row
        for row in ordered_policy_pair_rows
        if row["firstActorPolicy"] == row["secondActorPolicy"]
    ]

    opening_entry_rows = []
    entry_keys = [
        key for key in f4_by_key
        if _is_opening_entry_needlepoint(f4_by_key[key])
        and _is_opening_entry_needlepoint(i2_by_key[key])
    ]
    for starting_distance in ENTRY_PRESSURE_DISTANCES:
        for first_policy in BASE_POLICY_NAMES:
            for second_policy in BASE_POLICY_NAMES:
                keys = [
                    key for key in entry_keys
                    if key[0] == starting_distance
                    and _first_actor_policy(f4_by_key[key]) == first_policy
                    and _second_actor_policy(f4_by_key[key]) == second_policy
                ]
                if not keys:
                    continue
                opening_entry_rows.append(_comparison_row(
                    {
                        "startingDistance": starting_distance,
                        "firstActorPolicy": first_policy,
                        "secondActorPolicy": second_policy,
                    },
                    [f4_by_key[key] for key in keys],
                    [i2_by_key[key] for key in keys],
                ))

    action_shifts: dict[tuple[Any, ...], int] = {}
    for key in entry_keys:
        f4_match = f4_by_key[key]
        i2_match = i2_by_key[key]
        f4_next = _next_action_for_entry_actor(f4_match)
        i2_next = _next_action_for_entry_actor(i2_match)
        shift_key = (
            _first_actor_policy(f4_match),
            f4_next["action"],
            f4_next["damage"],
            i2_next["action"],
            i2_next["damage"],
            _first_actor_won(f4_match),
            _first_actor_won(i2_match),
        )
        action_shifts[shift_key] = action_shifts.get(shift_key, 0) + 1
    post_entry_action_shifts = [
        {
            "firstActorPolicy": key[0],
            "f4NextAction": key[1],
            "f4NextDamage": key[2],
            "i2NextAction": key[3],
            "i2NextDamage": key[4],
            "f4FirstActorWon": key[5],
            "i2FirstActorWon": key[6],
            "routes": count,
        }
        for key, count in sorted(action_shifts.items())
    ]

    best_response_row = next(
        row for row in same_policy_rows
        if row["firstActorPolicy"] == "best_response"
    )
    exact_spawn_row = next(
        row for row in per_distance
        if row["startingDistance"] == PRODUCTION_SPAWN_REFERENCE
    )
    exact_spawn_i2_summary = next(
        scenario["entrySeamPinSuppressions"]
        for scenario in i2_report["scenarioReports"]
        if scenario["startingDistance"] == PRODUCTION_SPAWN_REFERENCE
    )
    policy_deltas = [row["deltaFirstActorWins"] for row in first_actor_policy_rows]
    findings = [
        {
            "findingId": "aggregate_delta_is_policy_mixed",
            "triggered": any(delta < 0 for delta in policy_deltas) and any(delta > 0 for delta in policy_deltas),
            "reason": "I2 lowers some first-actor policy rows while increasing others.",
            "witnessReferences": ["firstActorPolicyRows", "aggregateComparison"],
        },
        {
            "findingId": "best_response_mirror_unchanged",
            "triggered": best_response_row["deltaFirstActorWins"] == 0,
            "reason": "Best-response versus best-response first-actor wins do not improve from F4 to I2.",
            "witnessReferences": ["samePolicyRows:best_response"],
        },
        {
            "findingId": "all_same_policy_mirrors_unchanged",
            "triggered": all(row["deltaFirstActorWins"] == 0 for row in same_policy_rows),
            "reason": "Every same-policy mirror has the same outcome counts for F4 and I2.",
            "witnessReferences": ["samePolicyRows"],
        },
        {
            "findingId": "post_entry_action_selection_changes",
            "triggered": any(
                row["f4NextAction"] != row["i2NextAction"]
                for row in post_entry_action_shifts
            ),
            "reason": "Removing the caster cooldown changes later Relic selection on matched entry routes.",
            "witnessReferences": ["postEntryActionShifts"],
        },
        {
            "findingId": "exact_spawn_opening_non_use",
            "triggered": (
                exact_spawn_i2_summary["openingRouteResults"]["total"] == 0
                and exact_spawn_row["deltaFirstActorWins"] == 0
            ),
            "reason": (
                "I2 does not alter the opening edge or aggregate outcome at exact production "
                "spawn 640; later separation and re-entry suppressions remain explicit."
            ),
            "witnessReferences": ["exactSpawnAssessment"],
        },
    ]
    if sum(policy_deltas) != aggregate["deltaFirstActorWins"]:
        raise RuntimeError("Policy contributions do not reconcile to the aggregate delta")
    if len(entry_keys) != 120:
        raise RuntimeError(f"Expected 120 matched opening entry routes, observed {len(entry_keys)}")
    missing_findings = [
        finding["findingId"]
        for finding in findings
        if not finding["triggered"]
    ]
    if missing_findings:
        raise RuntimeError(
            "I2 policy-fragility closure conditions did not reproduce: "
            + ", ".join(missing_findings)
        )

    result: dict[str, Any] = {
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "auditId": AUDIT_ID,
        "sourceCommit": SOURCE_COMMIT,
        "reportBindings": [
            _build_report_binding("F4", F4_CONFIG_PATH, f4_report),
            _build_report_binding("I2", I2_CONFIG_PATH, i2_report),
        ],
        "domain": {
            "startingDistances": list(STARTING_DISTANCES),
            "productionSpawnReference": PRODUCTION_SPAWN_REFERENCE,
            "entryPressureDistances": list(ENTRY_PRESSURE_DISTANCES),
            "firstActors": ["player", "loomkeeper"],
            "mirrored": [False, True],
            "policies": list(BASE_POLICY_NAMES),
            "orderedPolicyPairs": 25,
            "matchesPerConfig": 1200,
            "seed": SEED,
            "maximumTurns": 16,
        },
        "aggregateComparison": aggregate,
        "perDistanceRows": per_distance,
        "firstActorPolicyRows": first_actor_policy_rows,
        "orderedPolicyPairRows": ordered_policy_pair_rows,
        "samePolicyRows": same_policy_rows,
        "openingEntryRows": opening_entry_rows,
        "postEntryActionShifts": post_entry_action_shifts,
        "exactSpawnAssessment": {
            "startingDistance": PRODUCTION_SPAWN_REFERENCE,
            "i2EntrySeamPinSuppressions": exact_spawn_i2_summary,
            "comparison": exact_spawn_row,
        },
        "findings": findings,
        "analyticalDisposition": "residualized",
        "dispositionReason": "policy_fragile",
        "productAuthority": "none",
        "blockedClaims": [
            "I2's aggregate first-actor reduction is not robust initiative repair.",
            "Cross-policy matchup redistribution cannot be reported as same-policy initiative repair.",
            "The five deterministic policies are not evidence of optimal play or player skill.",
            "I2 does not repair the exact production-spawn opening edge; later re-entry uses do not change the aggregate result there.",
            "The in-memory cooldown-retention ablation is hypothesis-forming only and is not admitted evidence.",
            "This audit does not approve V5, a gameplay mechanic, or production activation.",
        ],
        "excludedClaims": [
            "Terrain, aim, trajectory, splash, and projectile physics are unmodelled.",
            "Player skill and live Loomkeeper behavior are unmodelled.",
            "UI, replay, reward, protocol, networking, assets, and runtime mutation are excluded.",
        ],
    }
    result["auditDigest"] = canonical_digest(result)
    return result


def _validated_output_path(value: str) -> Path:
    root = (repository_root() / "test-results" / "tactical-model").resolve()
    target = Path(value)
    if not target.is_absolute():
        target = repository_root() / target
    target = target.resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise ValueError("Policy-closure audit output must stay below test-results/tactical-model") from error
    if target.suffix != ".json":
        raise ValueError("Policy-closure audit output must be a JSON file")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    target = _validated_output_path(args.output)
    result = build_policy_closure_audit()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote deterministic policy-closure audit: {target.relative_to(repository_root())}")
    print(f"Audit digest: {result['auditDigest']}")
    print(f"Disposition: {result['analyticalDisposition']} ({result['dispositionReason']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
