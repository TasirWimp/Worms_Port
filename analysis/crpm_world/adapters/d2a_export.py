"""Deterministic D2A evidence export for the offline CRPM-world design port.

This module is analysis-only.  It calls the existing tactical model through its
public functions, binds the resulting reports to known digests, and renders a
compact ``WorldDesignResult`` JSON record.  It neither changes nor reimplements
the tactical model and it is never imported by a production TypeScript path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
from typing import Any, Iterable, Sequence

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
    run_starting_distance_sweep,
    simulate_match,
    tactical_state_key,
    tactical_state_snapshot,
)


ADAPTER_ID = "d2a_analytical_export"
ADAPTER_VERSION = 2
PROFILE_VERSION = 2
RESULT_VERSION = 2
TACTICAL_CUT_ID = "d2a_tactical_recurrence_v1"
TACTICAL_CUT_VERSION = 2
STARTING_DISTANCES = (448, 512, 576, 640, 704)
WORMS_SOURCE_COMMIT = "af23717e61fea6995bf3b7209211ae1aaa2bb855"
CRPM_SOURCE_COMMIT = "995236df60924f790506cf5badec3c102abf3fd1"
UNMODELLED_PORTS = (
    "Terrain geometry and collision are unmodelled.",
    "Aim, trajectory, splash, and projectile physics are unmodelled.",
    "Player skill and live Loomkeeper behavior are unmodelled.",
    "UI, replay, reward, protocol, and runtime mutation ports are unmodelled and forbidden.",
)
D2A_PROTECTED_FAMILY = (
    "The exact registered D2A configuration, scenario family, policies, actions, report digest, and historical status remain recoverable.",
    "D2A evidence remains analytical only and cannot activate gameplay or acquire product authority.",
)
CRPM_WORLD_IMPLEMENTATION_PATHS = tuple(sorted((
    "analysis/crpm_world/adapters/d2a_export.py",
    "analysis/crpm_world/adapters/v4-authority-adapter.ts",
    "analysis/crpm_world/canonical.ts",
    "analysis/crpm_world/cuts/d2a-cuts.ts",
    "analysis/crpm_world/cuts/registry.ts",
    "analysis/crpm_world/cuts/v4-cuts.ts",
    "analysis/crpm_world/design-port/execute-request.ts",
    "analysis/crpm_world/design-port/registry.ts",
    "analysis/crpm_world/design-port/validate-request.ts",
    "analysis/crpm_world/evaluation/evaluate.ts",
    "analysis/crpm_world/evaluation/schemas.ts",
    "analysis/crpm_world/implementation-lock.ts",
    "analysis/crpm_world/kernel/assess-quotient-transport.ts",
    "analysis/crpm_world/kernel/assess-return.ts",
    "analysis/crpm_world/kernel/compose-edges.ts",
    "analysis/crpm_world/kernel/derive-voyage-evidence.ts",
    "analysis/crpm_world/kernel/project-cut.ts",
    "analysis/crpm_world/kernel/residual-ledger.ts",
    "analysis/crpm_world/kernel/trace-voyage.ts",
    "analysis/crpm_world/schemas.ts",
    "analysis/crpm_world/types.ts",
    "scripts/run-crpm-world-design.ts",
)))


class D2AExportError(RuntimeError):
    """Raised when a requested analytical export is outside the closed gate."""


REGISTERED_CASES: dict[str, dict[str, Any]] = {
    "f2": {
        "path": "analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spun-cocoon-threadball-unweave-candidate-f2.json",
        "schema_version": 8,
        "report_digest": "6a2ac3a1b8bc13c299ebf20a926eb5af0ac5e3fb057a841febc2f13fcb5ffbea",
    },
    "f3": {
        "path": "analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-threadback-unweave-candidate-f3.json",
        "schema_version": 9,
        "report_digest": "9f5cd9574cc88fb2e885b631a7f9119a105ccdeb323eae1b1f0299e989a30332",
    },
    "f4": {
        "path": "analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json",
        "schema_version": 11,
        "report_digest": "414e42735e97717f36b7583ffa80cb8130bf812259d598084416c4fd192247a6",
    },
    "h2": {
        "path": "analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-opening-weave-paid-second-actor-candidate-h2.json",
        "schema_version": 13,
        "report_digest": "f47fa00f6731254c62a115214e370ebdc363429499b9d2891b1c3cf0c0bc705c",
    },
    "h3": {
        "path": "analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-counterable-opening-weave-candidate-h3.json",
        "schema_version": 14,
        "report_digest": "4f148ce8ec2d50598ca7638b9cd74c820eb3cb3b7b2934a09867df51f2745d14",
    },
}


def _normalize_json(value: Any) -> Any:
    """Return detached deterministic JSON and normalize integral floats."""

    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise D2AExportError("Deterministic artifacts cannot contain unsafe integers")
        return value
    if isinstance(value, float):
        if not math.isfinite(value) or (value == 0 and math.copysign(1, value) < 0):
            raise D2AExportError("Deterministic artifacts cannot contain NaN, infinity, or negative zero")
        return int(value) if value.is_integer() else value
    if isinstance(value, (list, tuple)):
        return [_normalize_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _normalize_json(item) for key, item in value.items()}
    raise D2AExportError(f"Unsupported deterministic JSON value: {type(value).__name__}")


def canonical_json(value: Any) -> str:
    return json.dumps(
        _normalize_json(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def sha256_digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repository_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def _execution_receipt_base(
    source_locks: Sequence[dict[str, Any]],
    request_digest: str,
) -> dict[str, Any]:
    implementation_commit = _git(
        "log", "-1", "--format=%H", "--", *CRPM_WORLD_IMPLEMENTATION_PATHS,
    )
    implementation_tree = _git("show", "-s", "--format=%T", implementation_commit)
    blobs: list[dict[str, str]] = []
    for path in CRPM_WORLD_IMPLEMENTATION_PATHS:
        committed_blob = _git("rev-parse", f"{implementation_commit}:{path}")
        current_blob = _git("hash-object", path)
        if committed_blob != current_blob:
            raise D2AExportError(
                f"CRPM-world implementation path is not frozen at {implementation_commit}: {path}"
            )
        blobs.append({"path": path, "blobOid": committed_blob})
    bundle_digest = sha256_digest({
        "repositoryId": "worms-port",
        "implementationCommit": implementation_commit,
        "implementationTree": implementation_tree,
        "implementationFileBlobs": blobs,
    })
    return {
        "schemaVersion": 1,
        "repositoryId": "worms-port",
        "implementationCommit": implementation_commit,
        "implementationTree": implementation_tree,
        "implementationPaths": list(CRPM_WORLD_IMPLEMENTATION_PATHS),
        "implementationFileBlobs": blobs,
        "implementationBundleDigest": bundle_digest,
        "adapterVersions": [
            {"id": ADAPTER_ID, "version": ADAPTER_VERSION},
            {"id": "d2a_tactical", "version": ADAPTER_VERSION},
        ],
        "profileVersion": PROFILE_VERSION,
        "requestSchemaVersion": 2,
        "resultSchemaVersion": 2,
        "sourceLocks": list(source_locks),
        "requestDigest": request_digest,
    }


def _read_registered_case(case_id: str) -> tuple[TacticalConfig, dict[str, Any], dict[str, Any]]:
    registration = REGISTERED_CASES.get(case_id)
    if registration is None:
        raise D2AExportError(f"Unknown D2A candidate config: {case_id}")
    path = repository_root() / registration["path"]
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema_version") != registration["schema_version"]:
        raise D2AExportError(
            f"Registered {case_id.upper()} schema version drifted: "
            f"expected {registration['schema_version']}, got {raw.get('schema_version')}"
        )
    config = load_config(path)
    report = run_starting_distance_sweep(config, STARTING_DISTANCES)
    actual_digest = sha256_digest(report)
    if actual_digest != registration["report_digest"]:
        raise D2AExportError(
            f"Registered {case_id.upper()} report drifted: expected "
            f"{registration['report_digest']}, got {actual_digest}"
        )
    return config, raw, report


def load_registered_config(config_id: str) -> TacticalConfig:
    """Load only one exact registered pressure-case identifier or short case id."""

    for case_id, registration in REGISTERED_CASES.items():
        raw = json.loads((repository_root() / registration["path"]).read_text(encoding="utf-8"))
        if config_id in (case_id, raw["id"]):
            config, _, _ = _read_registered_case(case_id)
            return config
    raise D2AExportError(f"Unknown D2A candidate config: {config_id}")


def _state_payload(
    state: TacticalState,
    *,
    case_id: str,
    config: TacticalConfig,
    config_schema_version: int,
    first_actor: str,
    mirrored: bool,
    starting_distance: int,
    player_policy: str,
    loomkeeper_policy: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "caseId": case_id,
        "configId": config.identifier,
        "configSchemaVersion": config_schema_version,
        "firstActor": first_actor,
        "mirrored": mirrored,
        "startingDistance": starting_distance,
        "playerPolicy": player_policy,
        "loomkeeperPolicy": loomkeeper_policy,
        "completedTurns": state.completed_turns,
        "activeActor": state.active_actor,
        "player": tactical_state_snapshot(state)["player"],
        "loomkeeper": tactical_state_snapshot(state)["loomkeeper"],
        "winner": state.winner,
        "finishReason": state.finish_reason,
    }


def _carrier(
    state_payload: dict[str, Any],
    *,
    config: TacticalConfig,
    baseline_digest: str,
    source_reference: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "profileVersion": PROFILE_VERSION,
        "carrierKind": "tactical-analysis",
        "adapter": {"id": ADAPTER_ID, "version": ADAPTER_VERSION},
        "rulesetOrConfigId": config.identifier,
        "baselineDigest": baseline_digest,
        "stateDigest": sha256_digest(state_payload),
        "revisionOrStep": state_payload["completedTurns"],
        "sourceReference": source_reference,
    }


def _delta(subject: str, before: Any, after: Any, description: str) -> dict[str, Any]:
    return {"subject": subject, "before": before, "after": after, "description": description}


OBLIGATION_FIELD_TYPES = {
    "spoolburst_preparation_turns": "spoolburst_preparation",
    "spoolburst_cocoon_hits_remaining": "spun_cocoon",
    "opening_weave_hits_remaining": "opening_weave",
    "frayed_seam_turns": "frayed_seam",
    "seam_pin_turns": "seam_pin",
    "brace_turns": "brace",
}


def _obligation_instance_id(
    case_id: str,
    scenario_identity: str,
    origin_identity: str,
    actor: str,
    obligation_type: str,
) -> str:
    return f"d2a.{case_id}.{scenario_identity}.{origin_identity}.{actor}.{obligation_type}"


def _initial_obligation_instances(
    case_id: str,
    scenario_identity: str,
    state: TacticalState,
) -> dict[tuple[str, str], str]:
    active: dict[tuple[str, str], str] = {}
    for actor in ("player", "loomkeeper"):
        state_actor = actor_state(state, actor)
        for field, obligation_type in OBLIGATION_FIELD_TYPES.items():
            if getattr(state_actor, field) > 0:
                active[(actor, field)] = _obligation_instance_id(
                    case_id,
                    scenario_identity,
                    f"initial-step-{state.completed_turns}",
                    actor,
                    obligation_type,
                )
    return active


def _obligation_closure(
    field: str,
    *,
    before: TacticalState,
    action: Action,
    acting_actor: str,
    affected_actor: str,
    trace_step: dict[str, Any] | None,
) -> str:
    target = other_actor(acting_actor)
    if field == "frayed_seam_turns":
        bound_by_action = (
            action.kind == "cast" and
            action.relic_id == "needlepoint" and
            affected_actor == target and
            actor_state(before, affected_actor).frayed_seam_source == acting_actor
        )
        return "discharged" if bound_by_action or (
            trace_step and trace_step.get("frayedSeamBoundFor") == affected_actor
        ) else "expired"
    if field == "seam_pin_turns":
        return "expired"
    if field == "opening_weave_hits_remaining":
        return "discharged" if action.kind == "cast" and affected_actor == target else "expired"
    if field == "spoolburst_cocoon_hits_remaining":
        if affected_actor == target and action.kind in ("cast", "unweave_spoolburst"):
            return "discharged"
        return "expired"
    if field == "spoolburst_preparation_turns":
        if affected_actor == target and action.kind in ("cast", "unweave_spoolburst"):
            return "discharged"
        if affected_actor == acting_actor and action.kind == "cast":
            return "discharged"
        return "expired"
    if field == "brace_turns":
        return "discharged" if affected_actor == target and action.kind == "cast" else "expired"
    raise D2AExportError(f"Unknown obligation field {field}")


def _residual(
    case_id: str,
    before: TacticalState,
    after: TacticalState,
    *,
    scenario_identity: str,
    path_position: int,
    action: Action,
    acting_actor: str,
    trace_step: dict[str, Any] | None,
    active_obligations: dict[tuple[str, str], str],
) -> dict[str, Any]:
    positions: list[dict[str, Any]] = []
    resources: list[dict[str, Any]] = []
    health: list[dict[str, Any]] = []
    statuses: list[dict[str, Any]] = []
    expired: list[str] = []
    opened: list[str] = []
    carried: list[str] = []
    discharged: list[str] = []
    unresolved: list[str] = []

    actor_fields = (
        "seam_pin_source",
        "seam_pin_turns",
        "seam_pin_cooldown",
        "brace_turns",
        "brace_uses_remaining",
        "spoolburst_preparation_turns",
        "spoolburst_cocoon_hits_remaining",
        "opening_weave_hits_remaining",
        "seam_pin_maximum_separation_increase",
        "frayed_seam_source",
        "frayed_seam_turns",
    )
    resource_fields = ("escape_slack_remaining",)
    for actor in ("player", "loomkeeper"):
        before_actor = actor_state(before, actor)
        after_actor = actor_state(after, actor)
        if before_actor.x != after_actor.x:
            positions.append(_delta(f"{actor}.position", before_actor.x, after_actor.x, "Tactical world-position change."))
        if before_actor.stitching != after_actor.stitching:
            health.append(_delta(f"{actor}.stitching", before_actor.stitching, after_actor.stitching, "Abstract Stitching damage or backlash."))
        for field in resource_fields:
            old = getattr(before_actor, field)
            new = getattr(after_actor, field)
            if old != new:
                resources.append(_delta(f"{actor}.{field}", old, new, "Bounded tactical resource residue."))
        for field in actor_fields:
            old = getattr(before_actor, field)
            new = getattr(after_actor, field)
            obligation_type = OBLIGATION_FIELD_TYPES.get(field)
            obligation_key = (actor, field)
            obligation_id = active_obligations.get(obligation_key)
            if obligation_type and old > 0 and obligation_id is None:
                raise D2AExportError(f"Missing active obligation identity for {actor}.{field}")
            if obligation_type and new > 0:
                if old == 0:
                    obligation_id = _obligation_instance_id(
                        case_id,
                        scenario_identity,
                        f"edge-{path_position:03d}",
                        actor,
                        obligation_type,
                    )
                    active_obligations[obligation_key] = obligation_id
                    opened.append(obligation_id)
                else:
                    assert obligation_id is not None
                    carried.append(obligation_id)
                unresolved.append(obligation_id)
            if old == new:
                continue
            statuses.append(_delta(f"{actor}.{field}", old, new, "Visible tactical support or status change."))
            if obligation_type and old > 0 and new == 0:
                assert obligation_id is not None
                closure = _obligation_closure(
                    field,
                    before=before,
                    action=action,
                    acting_actor=acting_actor,
                    affected_actor=actor,
                    trace_step=trace_step,
                )
                if closure == "discharged":
                    discharged.append(obligation_id)
                else:
                    expired.append(obligation_id)
                active_obligations.pop(obligation_key, None)
    for field in ("active_actor", "winner", "finish_reason"):
        old = getattr(before, field)
        new = getattr(after, field)
        if old != new:
            statuses.append(_delta(f"tactical.{field}", old, new, "Turn ownership or terminal status change."))
    return {
        "schemaVersion": 2,
        "positionDeltas": positions,
        "resourceDeltas": resources,
        "healthDeltas": health,
        "statusDeltas": statuses,
        "terrainDeltas": [],
        "authorityDeltas": [],
        "expiredRights": list(dict.fromkeys(expired)),
        "openedObligations": list(dict.fromkeys(opened)),
        "carriedObligations": list(dict.fromkeys(carried)),
        "dischargedObligations": list(dict.fromkeys(discharged)),
        "unresolvedObligations": list(dict.fromkeys(unresolved)),
        "excludedUnmodelledResidue": list(UNMODELLED_PORTS),
    }


def _accumulate_residual(ledgers: Iterable[dict[str, Any]]) -> dict[str, Any]:
    result = {
        "schemaVersion": 2,
        "positionDeltas": [],
        "resourceDeltas": [],
        "healthDeltas": [],
        "statusDeltas": [],
        "terrainDeltas": [],
        "authorityDeltas": [],
        "expiredRights": [],
        "openedObligations": [],
        "carriedObligations": [],
        "dischargedObligations": [],
        "unresolvedObligations": [],
        "excludedUnmodelledResidue": [],
    }
    for ledger in ledgers:
        for field in (
            "positionDeltas", "resourceDeltas", "healthDeltas", "statusDeltas",
            "terrainDeltas", "authorityDeltas",
        ):
            result[field].extend(ledger[field])
        for field in (
            "expiredRights", "openedObligations", "carriedObligations",
            "dischargedObligations", "excludedUnmodelledResidue",
        ):
            result[field] = list(dict.fromkeys([*result[field], *ledger[field]]))
        result["unresolvedObligations"] = list(ledger["unresolvedObligations"])
    return result


def _aggregate_trace_residuals(traces: Sequence[dict[str, Any]]) -> dict[str, Any]:
    result = _accumulate_residual(())
    for trace in traces:
        ledger = trace["accumulatedResidual"]
        for field in (
            "positionDeltas", "resourceDeltas", "healthDeltas", "statusDeltas",
            "terrainDeltas", "authorityDeltas",
        ):
            result[field].extend(ledger[field])
        for field in (
            "expiredRights", "openedObligations", "carriedObligations",
            "dischargedObligations", "unresolvedObligations", "excludedUnmodelledResidue",
        ):
            result[field] = list(dict.fromkeys([*result[field], *ledger[field]]))
    return result


def _source_locks(config_path: str) -> list[dict[str, Any]]:
    return [
        {
            "repositoryId": "worms-port",
            "commit": WORMS_SOURCE_COMMIT,
            "paths": [
                "analysis/tactical_model/model.py",
                "analysis/tactical_model/run.py",
                config_path,
            ],
        },
        {
            "repositoryId": "crpm",
            "commit": CRPM_SOURCE_COMMIT,
            "paths": [
                "docs/architecture/CRPM_Evaluation_Language_Operational_Note_v0.md",
                "emergence_lab_crpm/dynamic_return_obligation_crosswalk_source.py",
            ],
        },
    ]


def _action_payload(action: Action, actor: str, policy: str) -> dict[str, Any]:
    return {
        "actor": actor,
        "policy": policy,
        "kind": action.kind,
        "direction": action.direction,
        "relicId": action.relic_id,
        "actionKey": action_key(action),
    }


def _edge_and_witness(
    *,
    case_id: str,
    config: TacticalConfig,
    config_path: str,
    config_schema_version: int,
    baseline_digest: str,
    report_digest: str,
    before: TacticalState,
    after: TacticalState,
    action: Action,
    actor: str,
    policy: str,
    target_policy: str | None,
    player_policy_reference: str,
    loomkeeper_policy_reference: str,
    first_actor: str,
    mirrored: bool,
    starting_distance: int,
    path_position: int,
    trace_step: dict[str, Any] | None,
    opening_search_witness: dict[str, Any] | None,
    scenario_identity: str,
    active_obligations: dict[tuple[str, str], str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    source_ref = (
        f"{config_path};case={case_id};distance={starting_distance};"
        f"first={first_actor};mirrored={str(mirrored).lower()};step={before.completed_turns}"
    )
    before_payload = _state_payload(
        before, case_id=case_id, config=config, config_schema_version=config_schema_version,
        first_actor=first_actor, mirrored=mirrored, starting_distance=starting_distance,
        player_policy=player_policy_reference,
        loomkeeper_policy=loomkeeper_policy_reference,
    )
    after_payload = _state_payload(
        after, case_id=case_id, config=config, config_schema_version=config_schema_version,
        first_actor=first_actor, mirrored=mirrored, starting_distance=starting_distance,
        player_policy=before_payload["playerPolicy"], loomkeeper_policy=before_payload["loomkeeperPolicy"],
    )
    source_carrier = _carrier(
        before_payload, config=config, baseline_digest=baseline_digest, source_reference=source_ref,
    )
    target_carrier = _carrier(
        after_payload, config=config, baseline_digest=baseline_digest,
        source_reference=source_ref.replace(f"step={before.completed_turns}", f"step={after.completed_turns}"),
    )
    edge_id = f"d2a-{case_id}-edge-{path_position:03d}"
    witness_id = f"d2a-{case_id}-witness-{path_position:03d}"
    witness_evidence = {
        "caseId": case_id,
        "reportDigest": report_digest,
        "before": before_payload,
        "action": _action_payload(action, actor, policy),
        "targetReactionPolicy": target_policy,
        "after": after_payload,
        "traceStep": trace_step,
    }
    witness_digest = sha256_digest(witness_evidence)
    residual = _residual(
        case_id,
        before,
        after,
        scenario_identity=scenario_identity,
        path_position=path_position,
        action=action,
        acting_actor=actor,
        trace_step=trace_step,
        active_obligations=active_obligations,
    )
    response = {
        "targetReactionPolicy": target_policy,
        "preTacticalCarrier": before_payload,
        "postTacticalCarrier": after_payload,
        "preRecurrenceKey": _normalize_json(tactical_state_key(before)),
        "postRecurrenceKey": _normalize_json(tactical_state_key(after)),
        "distanceBefore": distance(before),
        "distanceAfter": distance(after),
        "movement": {
            "player": after.player.x - before.player.x,
            "loomkeeper": after.loomkeeper.x - before.loomkeeper.x,
        },
        "damage": {
            "player": before.player.stitching - after.player.stitching,
            "loomkeeper": before.loomkeeper.stitching - after.loomkeeper.stitching,
        },
        "resourceResidue": {
            "playerEscapeSlack": after.player.escape_slack_remaining,
            "loomkeeperEscapeSlack": after.loomkeeper.escape_slack_remaining,
        },
        "actorChange": {"before": before.active_actor, "after": after.active_actor},
        "terminalCause": after.finish_reason,
        "analyticalTraceStep": trace_step,
        "openingSearchWitness": opening_search_witness,
    }
    domain = {
        "schemaVersion": 1,
        "scenarioIds": [f"d2a-{case_id}-distance-{starting_distance}"],
        "actionFamilies": [action.kind],
        "policyFamilies": list(dict.fromkeys([player_policy_reference, loomkeeper_policy_reference])),
        "seeds": [config.seed],
        "constraints": [
            f"Centered tactical distance {starting_distance}; mirrored={str(mirrored).lower()}; first actor {first_actor}.",
            "Only the registered deterministic D2A configuration and declared policy/action path are in scope.",
        ],
    }
    locks = _source_locks(config_path)
    carrier_refs = [sha256_digest(source_carrier), sha256_digest(target_carrier)]
    edge = {
        "schemaVersion": 2,
        "edgeId": edge_id,
        "edgeVersion": 1,
        "edgeKind": "d2a_analytical_action",
        "domainMotif": action.kind,
        "portBindings": {
            "contextPorts": ["d2a.context.config", "d2a.context.scenario", "d2a.context.policy"],
            "actionPorts": ["d2a.action.declaration"],
            "responsePorts": ["d2a.response.target_policy"],
            "evidencePorts": ["d2a.evidence.report", "d2a.evidence.trace_step"],
            "supportPorts": ["d2a.support.tactical_carrier", "d2a.support.recurrence_key"],
            "returnPorts": ["d2a.return.config_trace_reference"],
        },
        "sourceCarrier": source_carrier,
        "targetCarrier": target_carrier,
        "sourceCut": {"id": TACTICAL_CUT_ID, "version": TACTICAL_CUT_VERSION},
        "targetCut": {"id": TACTICAL_CUT_ID, "version": TACTICAL_CUT_VERSION},
        "fixedFrame": {
            "schemaVersion": 1,
            "sourceLocks": locks,
            "baselineOrConfigId": config.identifier,
            "adapter": {"id": ADAPTER_ID, "version": ADAPTER_VERSION},
            "scenarioDomain": domain,
            "sourceCut": {"id": TACTICAL_CUT_ID, "version": TACTICAL_CUT_VERSION},
            "targetCut": {"id": TACTICAL_CUT_ID, "version": TACTICAL_CUT_VERSION},
            "actorOrPolicy": f"{actor}:{policy}",
            "expectedRevisionOrStep": before.completed_turns,
        },
        "commandOrDeclaration": _action_payload(action, actor, policy),
        "response": response,
        "protectedFamily": list(D2A_PROTECTED_FAMILY),
        "sourceRefs": [config_path, "analysis/tactical_model/model.py", f"report-sha256:{report_digest}"],
        "witnessReferences": [{"witnessId": witness_id, "digest": witness_digest}],
        "decoderRefs": ["d2a.tactical_state_snapshot.v1", "d2a.tactical_state_key.v1"],
        "carrierRefs": carrier_refs,
        "pathPosition": path_position,
        "preserved": [
            "Pre/post tactical carriers, action and optional target reaction policy.",
            "Positions, Stitching, Escape Slack, active support, actor change, terminal cause, and recurrence keys.",
        ],
        "forgotten": list(UNMODELLED_PORTS),
        "newlyVisible": [
            "Digest-bound transition lineage and explicit resource/status residual.",
            "Separation of D2A recursive recurrence from V4 replay or production state return.",
        ],
        "residual": residual,
        "reversibility": "one_way",
        "returnCondition": "The declared tactical_state_key repeats in the same nonterminal fixed-policy trace.",
        "reopeningCondition": "Reopen on config/schema/report digest drift, replay mismatch, domain widening, hidden residue, or candidate-status change.",
        "supportStatus": "verified",
        "productAuthority": "none",
        "authorityDefinitionMutationObserved": False,
    }
    witness = {
        "schemaVersion": 1,
        "witnessId": witness_id,
        "witnessVersion": 1,
        "edgeId": edge_id,
        "evidenceOrigin": "analysis-derived",
        "covarianceGroup": "d2a-fixed-model-policy-domain-v1",
        "deduplicationIdentity": witness_digest,
        "sourceRefs": [config_path, "analysis/tactical_model/model.py", f"report-sha256:{report_digest}"],
        "decoderRefs": ["d2a.tactical_state_snapshot.v1", "d2a.tactical_state_key.v1"],
        "inputDigest": source_carrier["stateDigest"],
        "outputDigest": target_carrier["stateDigest"],
        "status": "exact",
        "excludedClaims": [
            "Exact means parity with the registered D2A analytical transition only, not TypeScript gameplay authority.",
            *UNMODELLED_PORTS,
        ],
    }
    return edge, witness


def _replay_match_states(
    config: TacticalConfig,
    match: dict[str, Any],
) -> list[tuple[TacticalState, Action, TacticalState, str, str, dict[str, Any]]]:
    """Replay one existing report match through public functions and verify its trace."""

    expected = simulate_match(
        config,
        match["playerPolicy"],
        match["loomkeeperPolicy"],
        first_actor=match["firstActor"],
        mirrored=match["mirrored"],
        starting_distance=match["startingDistance"],
    )
    if expected != match:
        raise D2AExportError("Selected report match did not reproduce through simulate_match")
    state = initial_state(
        config,
        first_actor=match["firstActor"],
        mirrored=match["mirrored"],
        starting_distance=match["startingDistance"],
    )
    replay: list[tuple[TacticalState, Action, TacticalState, str, str, dict[str, Any]]] = []
    for trace_step in match["trace"]:
        actor = state.active_actor
        policy = match["playerPolicy"] if actor == "player" else match["loomkeeperPolicy"]
        target = other_actor(actor)
        target_policy = match["playerPolicy"] if target == "player" else match["loomkeeperPolicy"]
        action = choose_action(policy, state, config)
        if action_key(action) != trace_step["action"]:
            raise D2AExportError("Public policy replay diverged from the registered report action order")
        after = apply_action(state, action, config, target_reaction_policy=target_policy)
        replay.append((state, action, after, policy, target_policy, trace_step))
        state = after
    if (state.winner, state.finish_reason, state.completed_turns) != (
        match["winner"], match["finishReason"], match["turns"],
    ):
        raise D2AExportError("Public transition replay diverged from the registered report terminal result")
    return replay


def _find_match(report: dict[str, Any], predicate: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    for scenario in report["scenarioReports"]:
        for match in scenario["matches"]:
            if predicate(match):
                return scenario, match
    raise D2AExportError("Required registered pressure witness was not found")


def _voyage(
    *,
    case_id: str,
    edges: list[dict[str, Any]],
    recurrence: dict[str, Any] | None,
    terminal_summary: str,
    initial_obligation_ids: Sequence[str],
) -> dict[str, Any]:
    recurrence_refs = []
    if recurrence is not None:
        recurrence_refs.append({
            "witnessId": f"d2a-{case_id}-recursive-carrier-return",
            "digest": sha256_digest(recurrence),
        })
    accumulated = _accumulate_residual(edge["residual"] for edge in edges)
    compatibility_issues: list[str] = []
    for index, edge in enumerate(edges):
        if edge["pathPosition"] != index:
            compatibility_issues.append(
                f"Edge {edge['edgeId']} has path position {edge['pathPosition']}, expected {index}."
            )
        if index == 0:
            continue
        previous = edges[index - 1]
        if previous["targetCarrier"] != edge["sourceCarrier"]:
            compatibility_issues.append(
                f"Carrier mismatch before edge {edge['edgeId']}."
            )
        prior_open = set(previous["residual"]["unresolvedObligations"])
        carried_or_discharged = {
            *edge["residual"]["carriedObligations"],
            *edge["residual"]["dischargedObligations"],
            *edge["residual"]["expiredRights"],
        }
        for obligation in sorted(prior_open - carried_or_discharged):
            compatibility_issues.append(
                f"Edge {edge['edgeId']} neither carries nor discharges obligation {obligation}."
            )
    return {
        "schemaVersion": 3,
        "voyageId": f"d2a-{case_id}-pressure-voyage",
        "voyageVersion": 1,
        "initialCarrier": edges[0]["sourceCarrier"],
        "transitionEdges": edges,
        "finalCarrier": edges[-1]["targetCarrier"],
        "compatibilityResult": {
            "compatible": not compatibility_issues,
            "checkedEdgeIds": [edge["edgeId"] for edge in edges],
            "issues": compatibility_issues,
        },
        "accumulatedResidual": accumulated,
        "terminalResult": {
            "status": "nonterminal" if edges[-1]["response"]["terminalCause"] is None else "completed",
            "summary": terminal_summary,
            "excludedClaims": list(UNMODELLED_PORTS),
        },
        "recurrenceWitnesses": recurrence_refs,
        "returnWitnesses": recurrence_refs,
        "replaySupport": {
            "supported": False,
            "replayRecordRefs": [],
            "stateHashRefs": [],
            "limitations": [
                "This is deterministic D2A analytical re-entry, not the production replay ABI.",
                "Re-enter through the exact config, scenario, policies, and action path recorded on each edge.",
            ],
        },
        "edgeAttempts": [
            {
                "sequence": index,
                "outcome": "accepted",
                "edge": edge,
                "compositionWitness": None,
            }
            for index, edge in enumerate(edges)
        ],
        "commandPath": [
            {
                "sequence": index,
                "edgeId": edge["edgeId"],
                "outcome": "accepted",
                "commandOrDeclaration": edge["commandOrDeclaration"],
            }
            for index, edge in enumerate(edges)
        ],
        "cutChanges": [],
        "witnessReferences": [
            reference
            for edge in edges
            for reference in edge["witnessReferences"]
        ],
        "initialObligationIds": list(initial_obligation_ids),
        "obligationHistory": {
            "opened": list(dict.fromkeys([*initial_obligation_ids, *accumulated["openedObligations"]])),
            "carried": accumulated["carriedObligations"],
            "discharged": accumulated["dischargedObligations"],
            "expired": accumulated["expiredRights"],
            "unresolved": accumulated["unresolvedObligations"],
        },
        "reentryInstructions": [
            "Re-enter through the exact initial tactical carrier, registered config, policies, and ordered action declarations.",
            "Compare every edge carrier, obligation transition, witness, and final carrier; reopen on the first mismatch.",
        ],
        "excludedClaims": list(UNMODELLED_PORTS),
    }


def _world_obligations(traces: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Materialize every residual obligation as a referentially closed record."""

    records: list[dict[str, Any]] = []
    for trace in traces:
        edges = trace["transitionEdges"]
        origin_rows: list[tuple[str, dict[str, Any], dict[str, Any], dict[str, Any], int]] = []
        if edges:
            initial_payload = edges[0]["response"]["preTacticalCarrier"]
            for obligation_id in trace["initialObligationIds"]:
                origin_rows.append((
                    obligation_id,
                    {"kind": "initial_carrier", "carrier": trace["initialCarrier"]},
                    trace["initialCarrier"],
                    initial_payload,
                    0,
                ))
        for edge_index, edge in enumerate(edges):
            for obligation_id in edge["residual"]["openedObligations"]:
                origin_rows.append((
                    obligation_id,
                    {"kind": "edge", "edgeId": edge["edgeId"]},
                    edge["targetCarrier"],
                    edge["response"]["postTacticalCarrier"],
                    edge_index,
                ))

        for obligation_id, origin, support_carrier, support_state, origin_index in origin_rows:
            parts = obligation_id.split(".")
            bearer = parts[-2]
            obligation_type = parts[-1]
            bearer_state = support_state[bearer]
            if obligation_type == "frayed_seam":
                originator = bearer_state.get("frayedSeamSource")
                beneficiary = originator or bearer
                eligible = list(dict.fromkeys([bearer, originator or other_actor(bearer)]))
                legal = [
                    "The exposed bearer may continue only through actions admitted by the locked H3 configuration.",
                    "The recorded originator may bind the exposure with the configured advancing Needlepoint action.",
                ]
                expiry = "The exposure naturally expires after the recorded originator completes the allowed response-window action."
                discharge = "A configured same-line Needlepoint bind consumes the exposed Frayed Seam support."
            elif obligation_type == "seam_pin":
                originator = bearer_state.get("seamPinSource")
                beneficiary = originator or bearer
                eligible = list(dict.fromkeys([bearer, originator or other_actor(bearer)]))
                legal = ["The bearer may move only within the configured Seam Pin separation bound until its own turn expiry."]
                expiry = "The bearer completes the configured number of pinned turns."
                discharge = "No early discharge is claimed unless a locked transition explicitly clears the pin."
            elif obligation_type == "spoolburst_preparation":
                originator = bearer
                beneficiary = bearer
                eligible = [bearer, other_actor(bearer)]
                legal = [
                    "The bearer may complete the prepared cast under the locked policy.",
                    "The opponent may use only the configured disruption or Unweave response.",
                ]
                expiry = "The preparation counter reaches zero without a represented completion or counter transition."
                discharge = "The prepared cast is completed or the registered disruption/Unweave transition clears preparation."
            elif obligation_type == "spun_cocoon":
                originator = bearer
                beneficiary = bearer
                eligible = [bearer, other_actor(bearer)]
                legal = ["The Cocoon may absorb only the configured eligible hit or be removed by the registered Unweave path."]
                expiry = "The preparation window ends and the retained Cocoon support is cleared without absorption."
                discharge = "An eligible hit is absorbed or the registered Unweave transition consumes the Cocoon."
            elif obligation_type == "opening_weave":
                originator = None
                beneficiary = bearer
                eligible = [bearer, other_actor(bearer)]
                legal = ["The bearer may spend Opening Weave only on the configured eligible opening response."]
                expiry = "The bearer completes the response turn without consuming the one-hit Opening Weave right."
                discharge = "The configured opening response consumes the one-hit right and any recorded Escape Slack cost."
            elif obligation_type == "brace":
                originator = bearer
                beneficiary = bearer
                eligible = [bearer, other_actor(bearer)]
                legal = ["Brace may reduce only the next configured eligible hit during its represented window."]
                expiry = "The represented Brace window closes without an eligible hit."
                discharge = "An eligible hit consumes the one-use Brace protection."
            else:
                raise D2AExportError(f"Unknown obligation type {obligation_type}")

            later_ledgers = [item["residual"] for item in edges[origin_index:]]
            if any(obligation_id in ledger["dischargedObligations"] for ledger in later_ledgers):
                lifecycle = "discharged"
            elif any(obligation_id in ledger["expiredRights"] for ledger in later_ledgers):
                lifecycle = "expired"
            elif any(obligation_id in ledger["carriedObligations"] for ledger in later_ledgers):
                lifecycle = "carried"
            else:
                lifecycle = "open"
            records.append({
                "schemaVersion": 2,
                "obligationId": obligation_id,
                "obligationVersion": 2,
                "obligationType": obligation_type,
                "origin": origin,
                "roles": {
                    "owner": bearer,
                    "bearer": bearer,
                    "beneficiary": beneficiary,
                    "originator": originator,
                    "eligibleResponders": eligible,
                },
                "supportCarrier": support_carrier,
                "legalResponses": legal,
                "expiryCondition": expiry,
                "dischargeCondition": discharge,
                "lifecycleStatus": lifecycle,
            })
    return records


def _return_assessments(traces: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep D2A recursive return separate from gameplay-support obligations."""

    f2 = next((trace for trace in traces if trace["voyageId"] == "d2a-f2-pressure-voyage"), None)
    if f2 is None:
        return []
    witness_refs = [item["witnessId"] for item in f2["recurrenceWitnesses"]]
    cut = {"id": TACTICAL_CUT_ID, "version": TACTICAL_CUT_VERSION}
    rows = [
        ("visible_equal", "not_assessed", None, "No separate visible-readout equality was declared."),
        ("protected_equivalent", "not_assessed", None, "No broader protected-equivalence decoder was declared."),
        ("recursive_carrier_return", "satisfied", cut, "The exact declared tactical_state_key repeats in the selected nonterminal fixed-policy trace."),
        ("invariant_region_return", "not_assessed", None, "No invariant region was declared."),
        ("finite_exact_return", "not_satisfied", None, "The carrier revision/step advances even though the tactical recurrence key repeats."),
        ("route_mismatch", "not_assessed", None, "No paired route comparison was declared."),
    ]
    classifications = [{
        "classification": classification,
        "status": status,
        "declaredCut": declared_cut,
        "declaredRegionId": None,
        "witnessRefs": witness_refs if classification == "recursive_carrier_return" else [],
        "declaredExclusions": ["Completed-turn count is excluded only by the existing D2A tactical recurrence contract."] if classification == "recursive_carrier_return" else [],
        "rationale": rationale,
    } for classification, status, declared_cut, rationale in rows]
    return [{
        "schemaVersion": 1,
        "assessmentId": "d2a-f2-registered-return-assessment",
        "assessmentVersion": 1,
        "sourceCarrier": f2["initialCarrier"],
        "targetCarrier": f2["finalCarrier"],
        "declaredDomain": f2["transitionEdges"][0]["fixedFrame"]["scenarioDomain"],
        "classifications": classifications,
        "satisfiedClassifications": ["recursive_carrier_return"],
        "blockedClaims": [
            "The F2 recurrence is rejected historical pressure, not balance, convergence, design landfall, or product authority.",
            "No return classification implies another classification or a production-state loop."
        ],
    }]


def _axis(assessment: str, report_digest: str, residue: Sequence[str], blocked: Sequence[str]) -> dict[str, Any]:
    return {
        "assessment": assessment,
        "evidenceRefs": [report_digest],
        "visibleResidue": list(residue),
        "blockedClaims": list(blocked),
    }


def _diagnostic(
    case_id: str,
    config: TacticalConfig,
    report: dict[str, Any],
    report_digest: str,
) -> dict[str, Any]:
    aggregate = report["aggregate"]
    scenarios = report["scenarioReports"]
    band_rates = [scenario["aggregate"]["firstActorWinRate"] for scenario in scenarios]
    recurrence_count = sum(
        scenario["tacticalVoyage"]["recurrenceGate"]["nonterminalRecurrenceMatchCount"]
        for scenario in scenarios
    )
    forced_openings = [
        sum(len(row["forcedWinActionsWithinDepth"]) for row in scenario["aggregate"]["openingSearch"].values())
        for scenario in scenarios
    ]
    turn_limits = aggregate["terminalReasons"].get("turn_limit", 0)
    common_blocked = [
        "No analytical row, digest, adapter, or reviewer agreement creates independent empirical gameplay evidence.",
        "No D2A result creates TypeScript gameplay authority or activates a candidate.",
    ]
    if case_id == "f2":
        path = "Exact prepare_spoolburst then unweave_spoolburst recurrence repeats a support-complete nonterminal tactical carrier."
        residue = ["Twenty recurrence-bearing matches and twenty turn-limit results remain across the five-band sweep."]
        closure = "Rejected: recursive_carrier_return is negative structural evidence, not a harmless visible loop."
        probes = [("recurrence_matches", recurrence_count, "matches"), ("turn_limit_results", turn_limits, "matches")]
    elif case_id == "f3":
        path = "Threadback changes position by 64 world units and spends 64 Escape Slack, so the F2 recursive carrier does not repeat."
        residue = ["The aggregate first-actor win rate is 0.688 despite recurrence repair."]
        closure = "Rejected: removal of the witnessed recurrence does not establish initiative fairness."
        probes = [("threadback_distance", 64, "world_units"), ("escape_slack_spent", 64, "resource_units"), ("first_actor_win_rate", 0.688, "proportion")]
    elif case_id == "f4":
        path = "The declared 250-match sweep has no bounded forced opening, recurrence witness, or turn-limit result."
        residue = ["First-actor win rate remains 0.632 overall and 0.8 at starting distance 704."]
        closure = "Structural reference only: the cleaner structural sweep does not close initiative residue or grant product authority."
        probes = [("forced_opening_actions", sum(forced_openings), "actions"), ("recurrence_matches", recurrence_count, "matches"), ("turn_limit_results", turn_limits, "matches"), ("first_actor_win_rate", 0.632, "proportion"), ("distance_704_first_actor_win_rate", 0.8, "proportion")]
    elif case_id == "h2":
        path = "Aggregate first-actor rate 0.488 is evaluated together with distance-conditioned rates 0.44, 0.4, 0.44, 0.4, and 0.76."
        residue = ["The 704 band retains a 0.76 first-actor rate hidden by the near-parity aggregate."]
        closure = "Rejected false-closure pressure: an aggregate-only success claim is blocked."
        probes = [("aggregate_first_actor_win_rate", 0.488, "proportion"), *[(f"distance_{distance_value}_first_actor_win_rate", value, "proportion") for distance_value, value in zip(STARTING_DISTANCES, band_rates)]]
    else:
        path = "Opening cast, partial response, intervening normal action, and later Frayed Seam counter remain ordered and separately witnessed."
        residue = ["Forced opening actions remain at 448, 512, and 576 before the later counter port can act.", "Aggregate first-actor rate remains 0.632."]
        closure = "Rejected: delayed counterplay cannot repair an already completed immediate forced-opening edge."
        probes = [("aggregate_first_actor_win_rate", 0.632, "proportion"), *[(f"distance_{distance_value}_forced_opening_actions", value, "actions") for distance_value, value in zip(STARTING_DISTANCES, forced_openings)]]
    scalar_probes = [
        {"probeId": f"{case_id}.{name}", "value": value, "unit": unit, "scope": "Registered five-distance deterministic D2A sweep."}
        for name, value, unit in probes
    ]
    return {
        "schemaVersion": 1,
        "diagnosticId": f"d2a-{case_id}-pressure-diagnostic",
        "diagnosticVersion": 1,
        "evaluationObjectRef": config.identifier,
        "cut": {"id": TACTICAL_CUT_ID, "version": TACTICAL_CUT_VERSION},
        "protectedFamily": list(D2A_PROTECTED_FAMILY),
        "scope": "Five centered distances 448, 512, 576, 640, and 704; 50 mirrored fixed-policy matches per distance.",
        "pathPressure": _axis(path, report_digest, residue, common_blocked),
        "residueVisibility": _axis("Resource, status, opening, recurrence, terminal, aggregate, and distance-conditioned residue remain explicit.", report_digest, residue, common_blocked),
        "localReorganization": _axis("Only state changes produced by the existing tactical-model transition functions are credited.", report_digest, residue, common_blocked),
        "cutFidelity": _axis("The tactical_state_key excludes completed-turn count by its existing D2A contract and retains all tactical support fields.", report_digest, ["Terrain, ballistics, player behavior, UI, replay, and rewards remain outside the cut."], common_blocked),
        "returnStrength": _axis("recursive_carrier_return" if case_id == "f2" else "No recursive_carrier_return witness exists in the declared sweep.", report_digest, residue, common_blocked),
        "closureRisk": _axis(closure, report_digest, residue, common_blocked),
        "scalarProbes": scalar_probes,
        "blockedClaims": [*common_blocked, closure],
        "excludedClaims": list(UNMODELLED_PORTS),
    }


def _compact_match_voyage(
    *,
    case_id: str,
    config: TacticalConfig,
    raw_config: dict[str, Any],
    report: dict[str, Any],
    select_predicate: Any,
    selected_indices: Sequence[int],
    terminal_summary: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    scenario, match = _find_match(report, select_predicate)
    replay = _replay_match_states(config, match)
    config_path = REGISTERED_CASES[case_id]["path"]
    baseline_digest = sha256_digest(raw_config)
    report_digest = REGISTERED_CASES[case_id]["report_digest"]
    edges: list[dict[str, Any]] = []
    witnesses: list[dict[str, Any]] = []
    first_before = replay[selected_indices[0]][0]
    scenario_identity = (
        f"distance-{match['startingDistance']}-first-{match['firstActor']}-"
        f"mirror-{str(match['mirrored']).lower()}"
    )
    active_obligations = _initial_obligation_instances(case_id, scenario_identity, first_before)
    initial_obligation_ids = list(active_obligations.values())
    for path_position, replay_index in enumerate(selected_indices):
        before, action, after, policy, target_policy, trace_step = replay[replay_index]
        edge, witness = _edge_and_witness(
            case_id=case_id, config=config, config_path=config_path,
            config_schema_version=raw_config["schema_version"], baseline_digest=baseline_digest,
            report_digest=report_digest, before=before, after=after, action=action,
            actor=before.active_actor, policy=policy, target_policy=target_policy,
            player_policy_reference=match["playerPolicy"],
            loomkeeper_policy_reference=match["loomkeeperPolicy"],
            first_actor=match["firstActor"], mirrored=match["mirrored"],
            starting_distance=match["startingDistance"], path_position=path_position,
            trace_step=trace_step,
            opening_search_witness=scenario["aggregate"]["openingSearch"] if path_position == 0 else None,
            scenario_identity=scenario_identity,
            active_obligations=active_obligations,
        )
        edges.append(edge)
        witnesses.append(witness)
    return _voyage(
        case_id=case_id, edges=edges, recurrence=match["nonterminalRecurrence"],
        terminal_summary=terminal_summary,
        initial_obligation_ids=initial_obligation_ids,
    ), witnesses


def _h3_declared_voyage(
    config: TacticalConfig,
    raw_config: dict[str, Any],
    report: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    scenario = next(row for row in report["scenarioReports"] if row["startingScenario"]["startingDistance"] == 512)
    states_and_actions: list[tuple[TacticalState, Action, str | None]] = []
    state = initial_state(config, starting_distance=512)
    declared = [
        (Action("cast", 0, "spoolburst"), "opening_weave_counter"),
        (Action("cast", 0, "needlepoint"), None),
        (Action("cast", 1, "needlepoint"), None),
    ]
    for action, reaction in declared:
        states_and_actions.append((state, action, reaction))
        state = apply_action(state, action, config, target_reaction_policy=reaction)
    config_path = REGISTERED_CASES["h3"]["path"]
    baseline_digest = sha256_digest(raw_config)
    report_digest = REGISTERED_CASES["h3"]["report_digest"]
    edges: list[dict[str, Any]] = []
    witnesses: list[dict[str, Any]] = []
    scenario_identity = "distance-512-first-player-mirror-false"
    active_obligations = _initial_obligation_instances("h3", scenario_identity, states_and_actions[0][0])
    initial_obligation_ids = list(active_obligations.values())
    for index, (before, action, reaction) in enumerate(states_and_actions):
        after = apply_action(before, action, config, target_reaction_policy=reaction)
        policy = "declared_opening_sequence"
        edge, witness = _edge_and_witness(
            case_id="h3", config=config, config_path=config_path,
            config_schema_version=raw_config["schema_version"], baseline_digest=baseline_digest,
            report_digest=report_digest, before=before, after=after, action=action,
            actor=before.active_actor, policy=policy, target_policy=reaction,
            player_policy_reference="declared_opening_sequence",
            loomkeeper_policy_reference="opening_weave_counter",
            first_actor="player", mirrored=False, starting_distance=512,
            path_position=index, trace_step=None,
            opening_search_witness=scenario["aggregate"]["openingSearch"] if index == 0 else None,
            scenario_identity=scenario_identity,
            active_obligations=active_obligations,
        )
        edges.append(edge)
        witnesses.append(witness)
    return _voyage(
        case_id="h3", edges=edges, recurrence=None,
        terminal_summary="Nonterminal declared H3 sequence: partial response is followed by one normal action before the later Frayed Seam bind.",
        initial_obligation_ids=initial_obligation_ids,
    ), witnesses


def export_pressure_suite(case_ids: Sequence[str] = tuple(REGISTERED_CASES)) -> dict[str, Any]:
    """Return one strict, deterministic CRPM-world design-result record."""

    requested = list(case_ids)
    if not requested:
        raise D2AExportError("At least one registered D2A pressure case is required")
    if len(set(requested)) != len(requested):
        raise D2AExportError("D2A pressure cases must not be repeated")
    unknown = [case_id for case_id in requested if case_id not in REGISTERED_CASES]
    if unknown:
        raise D2AExportError(f"Unknown D2A candidate config: {unknown[0]}")

    loaded = {case_id: _read_registered_case(case_id) for case_id in requested}
    traces: list[dict[str, Any]] = []
    witnesses: list[dict[str, Any]] = []
    if "f2" in loaded:
        config, raw, report = loaded["f2"]
        voyage, items = _compact_match_voyage(
            case_id="f2", config=config, raw_config=raw, report=report,
            select_predicate=lambda match: match["nonterminalRecurrence"] is not None,
            selected_indices=(1, 2),
            terminal_summary="The prepare_spoolburst then unweave_spoolburst pair returns to the same nonterminal tactical_state_key.",
        )
        traces.append(voyage)
        witnesses.extend(items)
    if "f3" in loaded:
        config, raw, report = loaded["f3"]
        voyage, items = _compact_match_voyage(
            case_id="f3", config=config, raw_config=raw, report=report,
            select_predicate=lambda match: any(step["spoolburstThreadbackAppliedFor"] is not None for step in match["trace"]),
            selected_indices=(1, 2),
            terminal_summary="The 64-unit Threadback spends 64 Escape Slack and prevents the selected F2 recursive carrier from repeating.",
        )
        traces.append(voyage)
        witnesses.extend(items)
    if "h3" in loaded:
        config, raw, report = loaded["h3"]
        voyage, items = _h3_declared_voyage(config, raw, report)
        traces.append(voyage)
        witnesses.extend(items)

    diagnostics = [
        _diagnostic(case_id, loaded[case_id][0], loaded[case_id][2], REGISTERED_CASES[case_id]["report_digest"])
        for case_id in requested
    ]
    all_locks: list[dict[str, Any]] = []
    for case_id in requested:
        for lock in _source_locks(REGISTERED_CASES[case_id]["path"]):
            existing = next((item for item in all_locks if item["repositoryId"] == lock["repositoryId"]), None)
            if existing is None:
                all_locks.append(lock)
            else:
                existing["paths"] = list(dict.fromkeys([*existing["paths"], *lock["paths"]]))
    report_identities = [
        {"caseId": case_id, "configId": loaded[case_id][0].identifier, "reportDigest": REGISTERED_CASES[case_id]["report_digest"]}
        for case_id in requested
    ]
    request_descriptor = {
        "schemaVersion": 2,
        "adapter": {"id": ADAPTER_ID, "version": ADAPTER_VERSION},
        "cases": requested,
        "startingDistances": list(STARTING_DISTANCES),
        "seeds": list(dict.fromkeys(loaded[case_id][0].seed for case_id in requested)),
        "outputDetailLevel": "witnesses",
        "cutId": TACTICAL_CUT_ID,
    }
    request_digest = sha256_digest(request_descriptor)
    payload = {
        "schemaVersion": 2,
        "resultId": "d2a-pressure-suite-" + "-".join(requested),
        "resultVersion": RESULT_VERSION,
        "requestDigest": request_digest,
        "sourceLocks": all_locks,
        "traces": traces,
        "transitionWitnesses": witnesses,
        "projectionAssessments": [],
        "worldObligations": _world_obligations(traces),
        "returnAssessments": _return_assessments(traces),
        "diagnostics": diagnostics,
        "residualLedger": _aggregate_trace_residuals(traces),
        "blockedClaims": [
            "These correlated deterministic cases reuse one D2A model, policy family, scenario family, and authority fixture; row count does not multiply empirical weight.",
            "The common WorldDesignResult envelope does not create common dynamics or authority between D2A and TypeScript simulation.",
            "No recurrence repair, aggregate rate, counterplay, digest parity, or schema validation activates gameplay or grants product authority.",
        ],
        "maturity": "M2_local_use",
        "productAuthority": "none",
        "authorityProvenance": {"relationship": "none"},
        "evidenceOrigin": "analysis-derived",
        "covarianceGroup": "d2a-fixed-model-policy-domain-v1",
        "deduplicationIdentity": sha256_digest(report_identities),
        "executionReceipt": _execution_receipt_base(all_locks, request_digest),
    }
    result_digest = sha256_digest(payload)
    return {
        **payload,
        "executionReceipt": {**payload["executionReceipt"], "resultDigest": result_digest},
        "resultDigest": result_digest,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export deterministic D2A pressure evidence as a CRPM-world WorldDesignResult.")
    parser.add_argument(
        "--case",
        action="append",
        dest="cases",
        help="Registered case id (f2, f3, f4, h2, or h3). Repeat to select multiple; defaults to all.",
    )
    args = parser.parse_args(argv)
    try:
        result = export_pressure_suite(tuple(args.cases) if args.cases else tuple(REGISTERED_CASES))
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        return 0
    except (D2AExportError, TacticalModelError) as error:
        print(f"D2A export failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
