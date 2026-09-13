"""Deterministic WP-015D2H carrier extraction over unchanged F4/I2 traces.

This module reconstructs the exact production-spawn subset of the historical
F4/I2 reports through public tactical-model functions.  It does not change the
model, policies, configs, reports, or candidate dispositions.  Generated JSON
belongs only below the ignored D2H test-results directory.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .model import (
    BASE_POLICY_NAMES,
    TacticalConfig,
    TacticalState,
    action_key,
    apply_action,
    choose_action,
    distance,
    initial_state,
    legal_actions,
    load_config,
    other_actor,
    repository_root,
    run_range_entry_boundary_sweep,
    simulate_match,
    tactical_state_key,
    tactical_state_snapshot,
)
from .policy_closure_audit import (
    EXPECTED_REPORT_DIGESTS,
    F4_CONFIG_PATH,
    I2_CONFIG_PATH,
    STARTING_DISTANCES,
    canonical_digest,
    canonical_json,
)


EXPORT_SCHEMA_VERSION = 1
EXPORT_ID = "wp-015d2h-production-spawn-reachable-carriers"
SOURCE_COMMIT = "d683515a6229d14b807d2bac06a3fe95481f4321"
CRPM_METHOD_COMMIT = "053c6fc0a90ed48d8667016b18a1d10106a7a2bc"
D2F_AUDIT_DIGEST = "476735407135b11f1d3805a7b7a4b22c5d7c8a46a1f6ac972f2d134fb3ff1657"
PRODUCTION_SPAWN = 640
SEED = 3237998097
OUTPUT_ROOT = "test-results/crpm-world/d2h-reachable-carriers"

CASE_REGISTRATIONS: tuple[dict[str, Any], ...] = (
    {
        "caseId": "F4",
        "configPath": F4_CONFIG_PATH,
        "configSchemaVersion": 11,
        "reportDigest": EXPECTED_REPORT_DIGESTS["F4"],
        "historicalDisposition": "structural_reference",
    },
    {
        "caseId": "I2",
        "configPath": I2_CONFIG_PATH,
        "configSchemaVersion": 16,
        "reportDigest": EXPECTED_REPORT_DIGESTS["I2"],
        "historicalDisposition": "residualized_policy_fragile",
    },
)


class ReachableCarrierProbeError(RuntimeError):
    """Raised when a frozen D2H binding or replay invariant is violated."""


def _json_value(value: Any) -> Any:
    """Detach tuples and other JSON-compatible containers deterministically."""

    return json.loads(canonical_json(value))


def _state_payload(state: TacticalState) -> dict[str, Any]:
    snapshot = tactical_state_snapshot(state)
    return {
        "schemaVersion": 1,
        "completedTurns": state.completed_turns,
        "activeActor": state.active_actor,
        "player": snapshot["player"],
        "loomkeeper": snapshot["loomkeeper"],
        "distance": distance(state),
        "winner": state.winner,
        "finishReason": state.finish_reason,
    }


def _match_ref(case_id: str, match: dict[str, Any]) -> str:
    identity = {
        "caseId": case_id,
        "startingDistance": match["startingDistance"],
        "firstActor": match["firstActor"],
        "mirrored": match["mirrored"],
        "playerPolicy": match["playerPolicy"],
        "loomkeeperPolicy": match["loomkeeperPolicy"],
    }
    return f"d2h-{case_id.lower()}-match-{canonical_digest(identity)[:24]}"


def _selected_action_payload(action: Any) -> dict[str, Any]:
    return {
        "kind": action.kind,
        "direction": action.direction,
        "relicId": action.relic_id,
        "actionKey": action_key(action),
    }


def _extract_match_items(
    case_id: str,
    config: TacticalConfig,
    config_schema_version: int,
    config_path: str,
    report_digest: str,
    match: dict[str, Any],
) -> list[dict[str, Any]]:
    reproduced = simulate_match(
        config,
        match["playerPolicy"],
        match["loomkeeperPolicy"],
        first_actor=match["firstActor"],
        mirrored=match["mirrored"],
        starting_distance=match["startingDistance"],
    )
    if reproduced != match:
        raise ReachableCarrierProbeError("Spawn-640 report match failed exact replay")

    state = initial_state(
        config,
        first_actor=match["firstActor"],
        mirrored=match["mirrored"],
        starting_distance=match["startingDistance"],
    )
    match_ref = _match_ref(case_id, match)
    path_prefix_actions: list[str] = []
    items: list[dict[str, Any]] = []

    for transition_index, trace_step in enumerate(match["trace"]):
        actor = state.active_actor
        acting_policy = (
            match["playerPolicy"] if actor == "player" else match["loomkeeperPolicy"]
        )
        target = other_actor(actor)
        target_policy = (
            match["playerPolicy"] if target == "player" else match["loomkeeperPolicy"]
        )
        action = choose_action(acting_policy, state, config)
        selected_action = _selected_action_payload(action)
        if selected_action["actionKey"] != trace_step["action"]:
            raise ReachableCarrierProbeError(
                f"{match_ref} transition {transition_index} diverged from its report action"
            )

        legal_action_keys = sorted(action_key(item) for item in legal_actions(state, config))
        if selected_action["actionKey"] not in legal_action_keys:
            raise ReachableCarrierProbeError("Selected action is absent from declared legal support")

        before = state
        after = apply_action(
            before,
            action,
            config,
            target_reaction_policy=target_policy,
        )
        source_carrier = _state_payload(before)
        target_carrier = _state_payload(after)
        path_prefix = list(path_prefix_actions)
        item_ref = f"{match_ref}-transition-{transition_index:02d}"
        items.append({
            "schemaVersion": 1,
            "itemRef": item_ref,
            "caseId": case_id,
            "configId": config.identifier,
            "configSchemaVersion": config_schema_version,
            "configPath": config_path,
            "reportDigest": report_digest,
            "matchRef": match_ref,
            "transitionIndex": transition_index,
            "domain": {
                "startingDistance": match["startingDistance"],
                "seed": config.seed,
                "maximumTurns": config.maximum_turns,
                "firstActor": match["firstActor"],
                "mirrored": match["mirrored"],
                "playerPolicy": match["playerPolicy"],
                "loomkeeperPolicy": match["loomkeeperPolicy"],
            },
            "pathPrefixActions": path_prefix,
            "pathPrefixDigest": canonical_digest(path_prefix),
            "sourceCarrier": source_carrier,
            "sourceCarrierDigest": canonical_digest(source_carrier),
            "sourceRecurrenceKey": _json_value(tactical_state_key(before)),
            "legalActionKeys": legal_action_keys,
            "actingPolicy": acting_policy,
            "targetReactionPolicy": target_policy,
            "selectedAction": selected_action,
            "analyticalTraceStep": trace_step,
            "analyticalTraceStepDigest": canonical_digest(trace_step),
            "targetCarrier": target_carrier,
            "targetCarrierDigest": canonical_digest(target_carrier),
            "targetRecurrenceKey": _json_value(tactical_state_key(after)),
            "terminalRelation": {
                "postStateFinished": after.finished,
                "winner": after.winner,
                "finishReason": after.finish_reason,
                "matchHasNonterminalRecurrence": match["nonterminalRecurrence"] is not None,
            },
        })
        path_prefix_actions.append(selected_action["actionKey"])
        state = after

    if (
        state.completed_turns != match["turns"] or
        state.winner != match["winner"] or
        state.finish_reason != match["finishReason"]
    ):
        raise ReachableCarrierProbeError(f"{match_ref} terminal carrier diverged")
    return items


def _build_case(registration: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    root = repository_root()
    config_path = root / registration["configPath"]
    config_raw = json.loads(config_path.read_text(encoding="utf-8"))
    if config_raw.get("schema_version") != registration["configSchemaVersion"]:
        raise ReachableCarrierProbeError(
            f"{registration['caseId']} config schema version drifted"
        )
    config = load_config(config_path)
    if config.seed != SEED or config.maximum_turns != 16:
        raise ReachableCarrierProbeError(
            f"{registration['caseId']} seed or horizon drifted"
        )

    report = run_range_entry_boundary_sweep(config, STARTING_DISTANCES)
    observed_report_digest = canonical_digest(report)
    if observed_report_digest != registration["reportDigest"]:
        raise ReachableCarrierProbeError(
            f"{registration['caseId']} report drifted: expected "
            f"{registration['reportDigest']}, observed {observed_report_digest}"
        )
    scenario = next(
        (item for item in report["scenarioReports"] if item["startingDistance"] == PRODUCTION_SPAWN),
        None,
    )
    if scenario is None or scenario["matchCount"] != 100:
        raise ReachableCarrierProbeError(
            f"{registration['caseId']} does not expose exactly 100 spawn-640 matches"
        )

    items = [
        item
        for match in scenario["matches"]
        for item in _extract_match_items(
            registration["caseId"],
            config,
            registration["configSchemaVersion"],
            registration["configPath"],
            observed_report_digest,
            match,
        )
    ]
    binding = {
        "caseId": registration["caseId"],
        "configId": config.identifier,
        "configPath": registration["configPath"],
        "configSchemaVersion": registration["configSchemaVersion"],
        "reportDigest": observed_report_digest,
        "historicalDisposition": registration["historicalDisposition"],
        "fullReportMatchCount": report["aggregate"]["matchCount"],
        "spawnMatchCount": scenario["matchCount"],
        "transitionItemCount": len(items),
        "spawnResult": {
            "firstActorWins": scenario["firstActorWins"],
            "firstActorWinRateNumerator": scenario["firstActorWins"],
            "firstActorWinRateDenominator": scenario["matchCount"],
            "terminalReasons": scenario["terminalReasons"],
            "nonterminalRecurrenceMatchCount": scenario["nonterminalRecurrenceMatchCount"],
        },
    }
    return binding, items


def build_reachable_carrier_export() -> dict[str, Any]:
    bindings: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    for registration in CASE_REGISTRATIONS:
        binding, case_items = _build_case(registration)
        bindings.append(binding)
        items.extend(case_items)

    item_refs = [item["itemRef"] for item in items]
    if len(item_refs) != len(set(item_refs)):
        raise ReachableCarrierProbeError("Reachable-carrier item references are not unique")

    export_without_digest = {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "exportId": EXPORT_ID,
        "sourceBindings": {
            "repositoryId": "worms-port",
            "sourceCommit": SOURCE_COMMIT,
            "crpmMethodCommit": CRPM_METHOD_COMMIT,
            "d2fAuditDigest": D2F_AUDIT_DIGEST,
            "modelPath": "analysis/tactical_model/model.py",
            "quotientTransportPath": "analysis/crpm_world/kernel/assess-quotient-transport.ts",
        },
        "domain": {
            "startingDistances": [PRODUCTION_SPAWN],
            "caseIds": [registration["caseId"] for registration in CASE_REGISTRATIONS],
            "firstActors": ["player", "loomkeeper"],
            "mirrored": [False, True],
            "policyNames": list(BASE_POLICY_NAMES),
            "orderedPolicyPairCount": len(BASE_POLICY_NAMES) ** 2,
            "seed": SEED,
            "maximumTurns": 16,
            "constraints": [
                "Only unchanged F4/I2 report matches starting at production spawn 640 are extracted.",
                "Every transition is replayed through existing public tactical-model functions.",
                "Terrain, aim, trajectory, splash, player behavior, live Loomkeeper behavior, UI, replay, networking, rewards, assets, and production state are excluded.",
            ],
        },
        "reportBindings": bindings,
        "items": items,
        "blockedClaims": [
            "The carrier sample does not establish balance, optimal play, player behavior, fun, V5 approval, or production authority.",
            "Path provenance is not an additional transition input in the deterministic tactical model.",
            "A passing finite projection does not prove minimal or globally support-complete state.",
        ],
        "productAuthority": "none",
    }
    return {
        **export_without_digest,
        "exportDigest": canonical_digest(export_without_digest),
    }


def _validated_output_path(value: str) -> Path:
    root = (repository_root() / OUTPUT_ROOT).resolve()
    target = (repository_root() / value).resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Output must stay below {OUTPUT_ROOT}") from error
    if target.suffix.lower() != ".json":
        raise ValueError("Output must be a JSON file")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        help=f"Optional JSON path below {OUTPUT_ROOT}; stdout is used when omitted.",
    )
    args = parser.parse_args()
    result = build_reachable_carrier_export()
    encoded = canonical_json(result) + "\n"
    if args.output:
        output = _validated_output_path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(encoded, encoding="utf-8", newline="\n")
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
