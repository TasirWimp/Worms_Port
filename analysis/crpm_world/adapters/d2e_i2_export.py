"""Deterministic WP-015D2E I2 admission evidence.

This analysis-only exporter re-enters the exact schema-16 I2 tactical model at
the WP-015D2D commit.  It emits a compact candidate-evidence record for the
versioned D2E World Design Port admission layer.  It does not alter or replace
the sealed WP-015D2B adapter and it has no production import path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence

from analysis.crpm_world.adapters.d2a_export import canonical_json, sha256_digest
from analysis.tactical_model.model import (
    Action,
    TacticalConfig,
    TacticalModelError,
    TacticalState,
    action_key,
    actor_state,
    apply_action,
    choose_action,
    distance,
    initial_state,
    load_config,
    other_actor,
    repository_root,
    run_range_entry_boundary_sweep,
    simulate_match,
    tactical_state_key,
    tactical_state_snapshot,
)


EXPORT_SCHEMA_VERSION = 1
ADAPTER_ID = "d2e_i2_analytical_export"
ADAPTER_VERSION = 1
PROFILE_VERSION = 3
SOURCE_COMMIT = "9da87c9aeec8d9d34cfbb2ff053f69e4cf035d40"
CRPM_METHOD_COMMIT = "995236df60924f790506cf5badec3c102abf3fd1"
SEED = 3_237_998_097
MAXIMUM_TURNS = 16
STARTING_DISTANCES = (511, 512, 513, 575, 576, 577, 639, 640, 641, 703, 704, 705)
ENTRY_WITNESS_DISTANCES = (641, 703, 704)
EXCLUDED_START_DISTANCE = 769
POLICIES = (
    "aggressive_damage",
    "range_pressure",
    "retreat_kite",
    "deny_strongest",
    "preserve_spoolburst",
)

CONFIG_ROOT = "analysis/tactical_model/configs"
MODEL_PATH = "analysis/tactical_model/model.py"
RUN_PATH = "analysis/tactical_model/run.py"
CONFIG_REGISTRATIONS: dict[str, dict[str, Any]] = {
    "c4": {
        "path": f"{CONFIG_ROOT}/v5-range-damage-forward-seam-pin-escape-slack-128-candidate-c4.json",
        "schemaVersion": 4,
        "reportDigest": "65a7e4f9300f9bcc51715a670760d0e74d5a25f09c1b70e5ff061b118d0e7dac",
        "historicalDisposition": "value_baseline",
    },
    "f4": {
        "path": f"{CONFIG_ROOT}/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json",
        "schemaVersion": 11,
        "reportDigest": "8e0605617d63b25474da6df059455d0c365b93f657bf0260295788a854cd17dd",
        "historicalDisposition": "structural_reference",
    },
    "h2": {
        "path": f"{CONFIG_ROOT}/v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json",
        "schemaVersion": 13,
        "reportDigest": "e99091ad9a75104c16136d55d73d95dc92dcca1d266369455efeb73c9316f2fe",
        "historicalDisposition": "rejected_false_closure_reference",
    },
    "i1": {
        "path": f"{CONFIG_ROOT}/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-range-entry-commitment-candidate-i1.json",
        "schemaVersion": 15,
        "reportDigest": "1dbefbedf8aa55e68002b91b6ed6c743085f5edbe5655a97f146d8161b053fa4",
        "historicalDisposition": "rejected",
    },
    "i2": {
        "path": f"{CONFIG_ROOT}/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-entry-seam-pin-candidate-i2.json",
        "schemaVersion": 16,
        "reportDigest": "31e341944d0490d531e989463804f8402c32c191e7dd1d4fe205081ef0ce099d",
        "historicalDisposition": "bounded_structural_survivor",
    },
}

UNMODELLED_PORTS = (
    "Terrain geometry and collision are unmodelled.",
    "Aim, trajectory, splash, and projectile physics are unmodelled.",
    "Player skill and live Loomkeeper behavior are unmodelled.",
    "UI, replay, reward, protocol, networking, assets, and runtime mutation are unmodelled and forbidden.",
)


class D2EI2ExportError(RuntimeError):
    """Raised when the fixed D2E I2 export cannot be reproduced exactly."""


def _tactical_report_digest(report: dict[str, Any]) -> str:
    """Match the tactical-model report contract's exact JSON number spelling."""

    canonical = json.dumps(
        report,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repository_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def _verify_source_blob(path: str) -> dict[str, str]:
    committed_blob = _git("rev-parse", f"{SOURCE_COMMIT}:{path}")
    current_blob = _git("hash-object", path)
    if current_blob != committed_blob:
        raise D2EI2ExportError(
            f"D2E tactical source drifted from {SOURCE_COMMIT}: {path}"
        )
    return {"path": path, "blobOid": committed_blob}


def _read_config(case_id: str) -> tuple[TacticalConfig, dict[str, Any]]:
    registration = CONFIG_REGISTRATIONS[case_id]
    path = repository_root() / registration["path"]
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema_version") != registration["schemaVersion"]:
        raise D2EI2ExportError(
            f"{case_id.upper()} schema drifted: expected "
            f"{registration['schemaVersion']}, got {raw.get('schema_version')}"
        )
    config = load_config(path)
    if config.seed != SEED or config.maximum_turns != MAXIMUM_TURNS:
        raise D2EI2ExportError(
            f"{case_id.upper()} seed or turn horizon is outside the registered domain"
        )
    return config, raw


def _replay_match(
    config: TacticalConfig,
    match: dict[str, Any],
) -> list[tuple[TacticalState, Action, TacticalState, str, str, dict[str, Any]]]:
    reproduced = simulate_match(
        config,
        match["playerPolicy"],
        match["loomkeeperPolicy"],
        first_actor=match["firstActor"],
        mirrored=match["mirrored"],
        starting_distance=match["startingDistance"],
    )
    if reproduced != match:
        raise D2EI2ExportError("Selected I2 match did not reproduce through simulate_match")
    state = initial_state(
        config,
        first_actor=match["firstActor"],
        mirrored=match["mirrored"],
        starting_distance=match["startingDistance"],
    )
    replay = []
    for trace_step in match["trace"]:
        actor = state.active_actor
        policy = match["playerPolicy"] if actor == "player" else match["loomkeeperPolicy"]
        target = other_actor(actor)
        target_policy = match["playerPolicy"] if target == "player" else match["loomkeeperPolicy"]
        action = choose_action(policy, state, config)
        if action_key(action) != trace_step["action"]:
            raise D2EI2ExportError("Selected I2 action path drifted during public-policy replay")
        after = apply_action(state, action, config, target_reaction_policy=target_policy)
        replay.append((state, action, after, policy, target_policy, trace_step))
        state = after
    return replay


def _compact_actor(state: TacticalState, actor: str) -> dict[str, Any]:
    value = actor_state(state, actor)
    snapshot = tactical_state_snapshot(state)[actor]
    return {
        "x": value.x,
        "stitching": value.stitching,
        "escapeSlack": value.escape_slack_remaining,
        "seamPinTurns": value.seam_pin_turns,
        "seamPinCooldown": value.seam_pin_cooldown,
        "spoolburstPreparationTurns": value.spoolburst_preparation_turns,
        "spoolburstCocoonHits": value.spoolburst_cocoon_hits_remaining,
        "snapshotDigest": sha256_digest(snapshot),
    }


def _compact_state(state: TacticalState) -> dict[str, Any]:
    snapshot = tactical_state_snapshot(state)
    return {
        "completedTurns": state.completed_turns,
        "activeActor": state.active_actor,
        "distance": distance(state),
        "player": _compact_actor(state, "player"),
        "loomkeeper": _compact_actor(state, "loomkeeper"),
        "winner": state.winner,
        "finishReason": state.finish_reason,
        "recurrenceKeyDigest": sha256_digest(tactical_state_key(state)),
        "fullSnapshotDigest": sha256_digest(snapshot),
    }


def _action_record(action: Action, actor: str, policy: str) -> dict[str, Any]:
    return {
        "actor": actor,
        "policy": policy,
        "kind": action.kind,
        "direction": action.direction,
        "relicId": action.relic_id,
        "actionKey": action_key(action),
    }


def _selected_opening_match(report: dict[str, Any], starting_distance: int) -> dict[str, Any]:
    scenario = next(
        item for item in report["scenarioReports"]
        if item["startingDistance"] == starting_distance
    )
    for match in scenario["matches"]:
        if match["trace"] and match["trace"][0].get("entrySeamPinSuppression") is not None:
            return match
    raise D2EI2ExportError(
        f"Required opening entry-Seam-Pin witness is absent at distance {starting_distance}"
    )


def _match_identity(match: dict[str, Any]) -> dict[str, Any]:
    return {
        "startingDistance": match["startingDistance"],
        "firstActor": match["firstActor"],
        "mirrored": match["mirrored"],
        "playerPolicy": match["playerPolicy"],
        "loomkeeperPolicy": match["loomkeeperPolicy"],
    }


def _find_same_match(report: dict[str, Any], identity: dict[str, Any]) -> dict[str, Any]:
    scenario = next(
        item for item in report["scenarioReports"]
        if item["startingDistance"] == identity["startingDistance"]
    )
    for match in scenario["matches"]:
        if _match_identity(match) == identity:
            return match
    raise D2EI2ExportError(f"Comparator match is absent: {identity}")


def _entry_witness(
    starting_distance: int,
    i2_config: TacticalConfig,
    i2_report: dict[str, Any],
    f4_config: TacticalConfig,
    f4_report: dict[str, Any],
) -> dict[str, Any]:
    i2_match = _selected_opening_match(i2_report, starting_distance)
    identity = _match_identity(i2_match)
    f4_match = _find_same_match(f4_report, identity)
    i2_replay = _replay_match(i2_config, i2_match)
    f4_replay = _replay_match(f4_config, f4_match)
    i2_before, i2_action, i2_after, policy, target_policy, i2_step = i2_replay[0]
    f4_before, f4_action, f4_after, _, _, f4_step = f4_replay[0]
    if action_key(i2_action) != action_key(f4_action):
        raise D2EI2ExportError("Matched F4/I2 entry actions differ")
    target = other_actor(i2_before.active_actor)
    if not (
        distance(i2_before) > i2_config.relic("needlepoint").maximum_range
        and distance(i2_after) <= i2_config.relic("needlepoint").maximum_range
        and i2_step.get("entrySeamPinSuppression") == {
            "target": target,
            "relicId": "needlepoint",
        }
    ):
        raise D2EI2ExportError("Selected I2 witness is not the registered movement-created entry edge")
    if len(i2_replay) < 2:
        raise D2EI2ExportError("Selected I2 entry lacks the opponent response edge")
    response_before, response_action, response_after, response_policy, _, response_step = i2_replay[1]
    if response_before.active_actor != target:
        raise D2EI2ExportError("Selected I2 entry does not transfer to the target response")
    target_after = actor_state(i2_after, target)
    caster_after = actor_state(i2_after, i2_before.active_actor)
    f4_target_after = actor_state(f4_after, target)
    f4_caster_after = actor_state(f4_after, f4_before.active_actor)
    if (
        i2_step["damage"] != 30
        or target_after.seam_pin_turns != 0
        or caster_after.seam_pin_cooldown != 0
        or f4_target_after.seam_pin_turns != 1
        or f4_caster_after.seam_pin_cooldown != 1
    ):
        raise D2EI2ExportError("Matched entry witness does not preserve the expected I2/F4 residual")
    payload = {
        "witnessId": f"d2e-i2-entry-response-{starting_distance}",
        "witnessVersion": 1,
        "motifs": [
            "outside_range_to_enter_range",
            "enter_range_to_opponent_response",
        ],
        "matchIdentity": identity,
        "entry": {
            "sourceCarrier": _compact_state(i2_before),
            "action": _action_record(i2_action, i2_before.active_actor, policy),
            "targetPolicy": target_policy,
            "targetCarrier": _compact_state(i2_after),
            "analyticalTraceStep": i2_step,
            "residual": {
                "movementByActor": {
                    "player": i2_after.player.x - i2_before.player.x,
                    "loomkeeper": i2_after.loomkeeper.x - i2_before.loomkeeper.x,
                },
                "damageToTarget": actor_state(i2_before, target).stitching - target_after.stitching,
                "targetSeamPinTurns": target_after.seam_pin_turns,
                "casterSeamPinCooldown": caster_after.seam_pin_cooldown,
                "entrySeamPinSuppression": i2_step["entrySeamPinSuppression"],
            },
        },
        "opponentResponse": {
            "sourceCarrier": _compact_state(response_before),
            "action": _action_record(response_action, response_before.active_actor, response_policy),
            "targetCarrier": _compact_state(response_after),
            "analyticalTraceStep": response_step,
        },
        "matchedF4": {
            "sourceCarrierDigest": _compact_state(f4_before)["fullSnapshotDigest"],
            "action": _action_record(f4_action, f4_before.active_actor, policy),
            "targetCarrier": _compact_state(f4_after),
            "analyticalTraceStep": f4_step,
            "residual": {
                "damageToTarget": actor_state(f4_before, target).stitching - f4_target_after.stitching,
                "targetSeamPinTurns": f4_target_after.seam_pin_turns,
                "casterSeamPinCooldown": f4_caster_after.seam_pin_cooldown,
            },
        },
        "terminalOutcome": {
            "winner": i2_match["winner"],
            "finishReason": i2_match["finishReason"],
            "turns": i2_match["turns"],
        },
        "sourceReference": {
            "reportDigest": CONFIG_REGISTRATIONS["i2"]["reportDigest"],
            "traceIndex": 0,
        },
        "excludedClaims": list(UNMODELLED_PORTS),
    }
    return {**payload, "witnessDigest": sha256_digest(payload)}


def _in_band_control(i2_config: TacticalConfig) -> dict[str, Any]:
    before = initial_state(i2_config, starting_distance=576)
    action = Action("cast", 1, "needlepoint")
    after = apply_action(before, action, i2_config)
    target = other_actor(before.active_actor)
    target_after = actor_state(after, target)
    caster_after = actor_state(after, before.active_actor)
    if target_after.seam_pin_turns != 1 or caster_after.seam_pin_cooldown != 1:
        raise D2EI2ExportError("Already-in-band I2 Needlepoint control no longer retains Seam Pin")
    payload = {
        "witnessId": "d2e-i2-later-in-band-resolution-576",
        "witnessVersion": 1,
        "motifs": ["later_in_band_cast_to_resolution"],
        "sourceCarrier": _compact_state(before),
        "action": _action_record(action, before.active_actor, "declared_control"),
        "targetCarrier": _compact_state(after),
        "residual": {
            "damageToTarget": actor_state(before, target).stitching - target_after.stitching,
            "targetSeamPinTurns": target_after.seam_pin_turns,
            "casterSeamPinCooldown": caster_after.seam_pin_cooldown,
            "entrySeamPinSuppression": None,
        },
        "sourceReference": {
            "configId": i2_config.identifier,
            "declaration": "initial_state(distance=576); Action(cast, advance, needlepoint)",
        },
        "excludedClaims": list(UNMODELLED_PORTS),
    }
    return {**payload, "witnessDigest": sha256_digest(payload)}


def _report_summary(case_id: str, report: dict[str, Any]) -> dict[str, Any]:
    aggregate = report["aggregate"]
    relic_uses = {"threadball": 0, "needlepoint": 0, "spoolburst": 0}
    escape_slack_spent = 0
    for scenario in report["scenarioReports"]:
        for match in scenario["matches"]:
            for step in match["trace"]:
                parts = step["action"].split(":")
                if parts[0] == "cast" and parts[1] in relic_uses:
                    relic_uses[parts[1]] += 1
            if match["trace"]:
                final = match["trace"][-1]
                escape_slack_spent += 256 - final["playerEscapeSlack"] - final["loomkeeperEscapeSlack"]
    return {
        "caseId": case_id,
        "configId": report["configId"],
        "configPath": CONFIG_REGISTRATIONS[case_id]["path"],
        "configSchemaVersion": CONFIG_REGISTRATIONS[case_id]["schemaVersion"],
        "reportDigest": CONFIG_REGISTRATIONS[case_id]["reportDigest"],
        "historicalDisposition": CONFIG_REGISTRATIONS[case_id]["historicalDisposition"],
        "matchCount": aggregate["matchCount"],
        "firstActorWins": aggregate["firstActorWins"],
        "firstActorWinRate": aggregate["firstActorWinRate"],
        "firstActorWinRateByDistance": [
            {
                "startingDistance": scenario["startingDistance"],
                "rate": scenario["firstActorWinRate"],
            }
            for scenario in report["scenarioReports"]
        ],
        "terminalReasons": aggregate["terminalReasons"],
        "forcedOpeningScenarioCount": aggregate["forcedOpeningScenarioCount"],
        "nonterminalRecurrenceMatchCount": aggregate["nonterminalRecurrenceMatchCount"],
        "relicUses": relic_uses,
        "escapeSlackSpent": escape_slack_spent,
        **({"entrySeamPinSuppressions": aggregate["entrySeamPinSuppressions"]}
           if case_id == "i2" else {}),
    }


def _horizon_warning(f4_config: TacticalConfig, i2_config: TacticalConfig) -> dict[str, Any]:
    reports = {
        "f4": run_range_entry_boundary_sweep(f4_config, (768, EXCLUDED_START_DISTANCE)),
        "i2": run_range_entry_boundary_sweep(i2_config, (768, EXCLUDED_START_DISTANCE)),
    }
    terminal = {
        case_id: [
            {
                "startingDistance": scenario["startingDistance"],
                "terminalReasons": scenario["terminalReasons"],
            }
            for scenario in report["scenarioReports"]
        ]
        for case_id, report in reports.items()
    }
    if terminal != {
        "f4": [
            {"startingDistance": 768, "terminalReasons": {"unravelled": 100}},
            {"startingDistance": 769, "terminalReasons": {"unravelled": 96, "turn_limit": 4}},
        ],
        "i2": [
            {"startingDistance": 768, "terminalReasons": {"unravelled": 100}},
            {"startingDistance": 769, "terminalReasons": {"unravelled": 92, "turn_limit": 8}},
        ],
    }:
        raise D2EI2ExportError("The registered 768/769 horizon warning drifted")
    i2_769 = reports["i2"]["scenarioReports"][1]
    additional_paths = []
    for i2_match in i2_769["matches"]:
        if i2_match["finishReason"] != "turn_limit":
            continue
        f4_match = _find_same_match(reports["f4"], _match_identity(i2_match))
        if f4_match["finishReason"] == "turn_limit":
            continue
        suppression_turns = [
            step["turn"] for step in i2_match["trace"]
            if step.get("entrySeamPinSuppression") is not None
        ]
        additional_paths.append({
            "matchIdentity": _match_identity(i2_match),
            "i2FinishReason": i2_match["finishReason"],
            "f4FinishReason": f4_match["finishReason"],
            "entrySuppressionTurns": suppression_turns,
        })
    if len(additional_paths) != 4 or any(row["entrySuppressionTurns"] != [10] for row in additional_paths):
        raise D2EI2ExportError("The four additional I2 start-769 timeout paths drifted")
    payload = {
        "witnessId": "d2e-i2-excluded-start-769-horizon-warning",
        "witnessVersion": 1,
        "admissibleInitialCarrier": False,
        "productionSpawnReference": 640,
        "excludedStartingDistance": EXCLUDED_START_DISTANCE,
        "terminalResults": terminal,
        "additionalI2TimeoutPaths": additional_paths,
        "blockedClaims": [
            "The twelve-distance start domain cannot be generalized to every full-resource starting distance.",
            "A distance of 769 reached after elapsed turns and resource expenditure is not this excluded initial carrier.",
            "The bounded I2 result is not design landfall or product authority.",
        ],
    }
    return {**payload, "witnessDigest": sha256_digest(payload)}


def export_i2_admission_evidence() -> dict[str, Any]:
    """Execute the complete fixed comparator domain and return compact evidence."""

    source_paths = [MODEL_PATH, RUN_PATH, *(
        registration["path"] for registration in CONFIG_REGISTRATIONS.values()
    )]
    source_blobs = [_verify_source_blob(path) for path in source_paths]
    loaded = {case_id: _read_config(case_id) for case_id in CONFIG_REGISTRATIONS}
    reports: dict[str, dict[str, Any]] = {}
    summaries = []
    for case_id in CONFIG_REGISTRATIONS:
        config = loaded[case_id][0]
        report = run_range_entry_boundary_sweep(config, STARTING_DISTANCES)
        actual_digest = _tactical_report_digest(report)
        expected_digest = CONFIG_REGISTRATIONS[case_id]["reportDigest"]
        if actual_digest != expected_digest:
            raise D2EI2ExportError(
                f"{case_id.upper()} report drifted: expected {expected_digest}, got {actual_digest}"
            )
        reports[case_id] = report
        summary = _report_summary(case_id, report)
        summary["configDigest"] = sha256_digest(loaded[case_id][1])
        summaries.append(summary)

    i2_config = loaded["i2"][0]
    f4_config = loaded["f4"][0]
    transition_witnesses = [
        _entry_witness(
            starting_distance,
            i2_config,
            reports["i2"],
            f4_config,
            reports["f4"],
        )
        for starting_distance in ENTRY_WITNESS_DISTANCES
    ]
    transition_witnesses.append(_in_band_control(i2_config))
    horizon_warning = _horizon_warning(f4_config, i2_config)
    source_binding = {
        "repositoryId": "worms-port",
        "commit": SOURCE_COMMIT,
        "paths": source_paths,
        "fileBlobs": source_blobs,
        "bundleDigest": sha256_digest({
            "repositoryId": "worms-port",
            "commit": SOURCE_COMMIT,
            "fileBlobs": source_blobs,
        }),
    }
    payload = {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "exportId": "wp-015d2e-i2-spawn-pressure",
        "adapter": {"id": ADAPTER_ID, "version": ADAPTER_VERSION},
        "profileVersion": PROFILE_VERSION,
        "sourceBinding": source_binding,
        "methodBinding": {
            "repositoryId": "crpm",
            "commit": CRPM_METHOD_COMMIT,
            "paths": [
                "docs/architecture/CRPM_Evaluation_Language_Operational_Note_v0.md",
                "emergence_lab_crpm/dynamic_return_obligation_crosswalk_source.py",
            ],
            "relationship": "read-only methodological source; no runtime dependency",
        },
        "domain": {
            "productionSpawnReference": 640,
            "startingDistances": list(STARTING_DISTANCES),
            "firstActors": ["player", "loomkeeper"],
            "mirrored": [False, True],
            "policies": list(POLICIES),
            "orderedPolicyPairCount": 25,
            "seed": SEED,
            "maximumTurns": MAXIMUM_TURNS,
            "matchCountPerDistance": 100,
            "totalMatchCount": 1200,
            "excludedInitialCarrierDistances": [EXCLUDED_START_DISTANCE],
        },
        "reportBindings": summaries,
        "transitionWitnesses": transition_witnesses,
        "horizonWarning": horizon_warning,
        "diagnosticEvidence": {
            "pathPressure": "I2 changes affected F4 entry routes from 40/0 to 28/12 per registered target distance without deleting movement-created casts.",
            "residueVisibility": "Position, distance, damage, Stitching, Seam Pin, cooldown, response, terminal, resource, and excluded-world residue remain explicit.",
            "localReorganization": "The affected route set reorganizes partially; aggregate and route changes do not prove initiative fairness.",
            "cutFidelity": "Evidence is bounded to twelve full-resource starting carriers around production spawn and declared range seams.",
            "returnStrength": "Exact commit, config, domain, report, match, trace, and witness digests support deterministic re-entry.",
            "closureRisk": "The start-769 horizon warning and policy/distance conditioning block design-landfall closure.",
        },
        "blockedClaims": [
            "M2 adapter execution does not prove gameplay quality, player fun, initiative fairness, or global starting-distance coverage.",
            "I2 analytical survival does not approve or activate V5.",
            "No compact rendered witness is the full tactical relation; exact report and carrier references remain required.",
            "The start-769 excluded-carrier warning cannot be removed by narrowing the registered spawn-pressure domain.",
        ],
        "analyticalDisposition": "structural_reference",
        "maturity": "M2_local_use",
        "productAuthority": "none",
        "excludedClaims": list(UNMODELLED_PORTS),
    }
    return {**payload, "exportDigest": sha256_digest(payload)}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export the fixed WP-015D2E I2 World Design Port admission evidence."
    )
    parser.parse_args(argv)
    try:
        result = export_i2_admission_evidence()
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        return 0
    except (D2EI2ExportError, TacticalModelError, subprocess.CalledProcessError) as error:
        print(f"D2E I2 export failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
