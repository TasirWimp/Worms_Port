"""Deterministic WP-015D2L policy-transport falsifier over unchanged F4.

The exporter compares the existing five policy selectors with three exact
shadow-selection transforms.  It does not edit or replace the tactical model,
its policies, configuration, or historical reports.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .model import (
    BASE_POLICY_NAMES,
    Action,
    Actor,
    TacticalConfig,
    TacticalState,
    action_key,
    actor_state,
    apply_action,
    choose_action,
    distance,
    initial_state,
    legal_actions,
    load_config,
    other_actor,
    repository_root,
    tactical_state_key,
    tactical_state_snapshot,
)
from .policy_choice_relation_probe import build_policy_choice_relation_export
from .policy_closure_audit import canonical_digest, canonical_json


EXPORT_SCHEMA_VERSION = 1
EXPORT_ID = "wp-015d2l-policy-transport-falsifier"
SOURCE_COMMIT = "3812456bc8de5859588818276e4c1fff930f678c"
CRPM_METHOD_COMMIT = "053c6fc0a90ed48d8667016b18a1d10106a7a2bc"
D2K_RAW_DIGEST = "47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769"
D2K_RESULT_DIGEST = "5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832"
MODEL_SHA256 = "af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08"
CONFIG_SHA256 = "5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0"
CONFIG_SCHEMA_VERSION = 11
SEED = 3237998097
MAXIMUM_TURNS = 16
PRIMARY_STARTS = (448, 512, 576, 640, 704)
BOUNDARY_STARTS = (639, 640, 641)
VARIANTS = (
    "baseline_v0",
    "terminal_tie_residue_v0",
    "preparation_response_lethal_guard_v0",
    "global_lethal_guard_v0",
)
MODEL_PATH = "analysis/tactical_model/model.py"
CONFIG_PATH = (
    "analysis/tactical_model/configs/"
    "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-"
    "spun-cocoon-threadback-unweave-candidate-f4.json"
)


class PolicyTransportProbeError(RuntimeError):
    """Raised when a D2L source binding or execution invariant fails."""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def _action_payload(action: Action) -> dict[str, Any]:
    return {
        "kind": action.kind,
        "direction": action.direction,
        "relicId": action.relic_id,
        "actionKey": action_key(action),
    }


def _direction_role(before: TacticalState, after: TacticalState, actor: Actor) -> str:
    before_actor = actor_state(before, actor)
    after_actor = actor_state(after, actor)
    if before_actor.x == after_actor.x:
        return "stay"
    before_distance = distance(before)
    after_distance = distance(after)
    if after_distance < before_distance:
        return "toward"
    if after_distance > before_distance:
        return "away"
    return "stay"


def _is_response_carrier(state: TacticalState, config: TacticalConfig) -> bool:
    if state.finished:
        return False
    responder = actor_state(state, state.active_actor)
    preparer = actor_state(state, other_actor(state.active_actor))
    return (
        responder.spoolburst_preparation_turns == 0 and
        preparer.spoolburst_preparation_turns > 0 and
        any(action.kind == "prepare_spoolburst" for action in legal_actions(state, config))
    )


def _immediate_wins(
    state: TacticalState,
    config: TacticalConfig,
    target_policy: str,
) -> list[tuple[tuple[int, int, str], Action, TacticalState]]:
    actor = state.active_actor
    before_actor = actor_state(state, actor)
    source_key = tactical_state_key(state)
    candidates: list[tuple[tuple[int, int, str], Action, TacticalState]] = []
    for action in legal_actions(state, config):
        target = apply_action(
            state,
            action,
            config,
            target_reaction_policy=target_policy,
        )
        if target.finished and target.winner == actor:
            target_actor = actor_state(target, actor)
            candidates.append((
                (
                    before_actor.escape_slack_remaining - target_actor.escape_slack_remaining,
                    abs(target_actor.x - before_actor.x),
                    action_key(action),
                ),
                action,
                target,
            ))
    if tactical_state_key(state) != source_key:
        raise PolicyTransportProbeError("Immediate-win enumeration mutated its source carrier")
    return sorted(candidates, key=lambda item: item[0])


def _select_action(
    variant: str,
    policy: str,
    target_policy: str,
    state: TacticalState,
    config: TacticalConfig,
) -> tuple[Action, str, list[tuple[tuple[int, int, str], Action, TacticalState]]]:
    base = choose_action(policy, state, config)
    if variant == "baseline_v0":
        return base, "baseline_delegate", []
    immediate = _immediate_wins(state, config, target_policy)
    if not immediate:
        return base, "baseline_delegate", []
    base_is_immediate = any(action_key(item[1]) == action_key(base) for item in immediate)
    if variant == "terminal_tie_residue_v0" and base_is_immediate:
        return immediate[0][1], "terminal_tie_residue", immediate
    if variant == "preparation_response_lethal_guard_v0" and _is_response_carrier(state, config):
        return immediate[0][1], "preparation_response_lethal_guard", immediate
    if variant == "global_lethal_guard_v0":
        return immediate[0][1], "global_lethal_guard", immediate
    return base, "baseline_delegate", immediate


def _normalized_step(
    before: TacticalState,
    after: TacticalState,
    action: Action,
    policy: str,
    first_actor: Actor,
) -> dict[str, Any]:
    return {
        "actorRole": "first" if before.active_actor == first_actor else "second",
        "policy": policy,
        "kind": action.kind,
        "relicId": action.relic_id,
        "directionRole": _direction_role(before, after, before.active_actor),
    }


def _simulate_match(
    config: TacticalConfig,
    *,
    frame_id: str,
    variant: str,
    starting_distance: int,
    first_actor: Actor,
    mirrored: bool,
    player_policy: str,
    loomkeeper_policy: str,
) -> dict[str, Any]:
    state = initial_state(
        config,
        first_actor=first_actor,
        mirrored=mirrored,
        starting_distance=starting_distance,
    )
    seen: dict[tuple[Any, ...], int] = {tactical_state_key(state): state.completed_turns}
    recurrence: dict[str, Any] | None = None
    path_steps: list[dict[str, Any]] = []
    substitutions: list[dict[str, Any]] = []
    response_carrier_index = 0

    while not state.finished:
        before = state
        actor = before.active_actor
        target = other_actor(actor)
        policy = player_policy if actor == "player" else loomkeeper_policy
        target_policy = player_policy if target == "player" else loomkeeper_policy
        base_action = choose_action(policy, before, config)
        response_carrier = _is_response_carrier(before, config)
        if response_carrier:
            response_carrier_index += 1
        selected, trigger, immediate = _select_action(
            variant,
            policy,
            target_policy,
            before,
            config,
        )
        selected_target = apply_action(
            before,
            selected,
            config,
            target_reaction_policy=target_policy,
        )
        selected_changed = action_key(selected) != action_key(base_action)
        if selected_changed:
            before_actor = actor_state(before, actor)
            after_actor = actor_state(selected_target, actor)
            immediate_payloads = []
            for score, action, target_state in immediate:
                immediate_payloads.append({
                    "action": _action_payload(action),
                    "targetCarrierDigest": canonical_digest(_state_payload(target_state)),
                    "escapeSlackSpend": score[0],
                    "displacement": score[1],
                    "directionRole": _direction_role(before, target_state, actor),
                })
            source_payload = _state_payload(before)
            target_payload = _state_payload(selected_target)
            substitution_payload = {
                "schemaVersion": 1,
                "turn": before.completed_turns,
                "actor": actor,
                "actorRole": "first" if actor == first_actor else "second",
                "policy": policy,
                "trigger": trigger,
                "responseCarrier": response_carrier,
                "responseCarrierIndex": response_carrier_index if response_carrier else None,
                "sourceCarrier": source_payload,
                "sourceCarrierDigest": canonical_digest(source_payload),
                "baseAction": _action_payload(base_action),
                "selectedAction": _action_payload(selected),
                "selectedDirectionRole": _direction_role(before, selected_target, actor),
                "selectedTargetCarrier": target_payload,
                "selectedTargetCarrierDigest": canonical_digest(target_payload),
                "immediateWins": immediate_payloads,
                "escapeSlackSpend": before_actor.escape_slack_remaining - after_actor.escape_slack_remaining,
                "displacement": abs(after_actor.x - before_actor.x),
                "preparerStitching": actor_state(before, target).stitching,
                "preparerPreparationTurns": actor_state(before, target).spoolburst_preparation_turns,
                "responderPreparationTurns": before_actor.spoolburst_preparation_turns,
            }
            substitutions.append({
                **substitution_payload,
                "substitutionDigest": canonical_digest(substitution_payload),
            })
        path_steps.append({
            "turn": before.completed_turns,
            "actor": actor,
            "actionKey": action_key(selected),
            "baseActionKey": action_key(base_action),
            "substituted": selected_changed,
            "responseCarrierIndex": response_carrier_index if response_carrier else None,
            **_normalized_step(before, selected_target, selected, policy, first_actor),
        })
        state = selected_target
        key = tactical_state_key(state)
        if not state.finished:
            prior = seen.get(key)
            if recurrence is None and prior is not None:
                recurrence = {
                    "firstSeenAfterCompletedTurns": prior,
                    "repeatedAfterCompletedTurns": state.completed_turns,
                    "cycleTurns": state.completed_turns - prior,
                    "stateDigest": canonical_digest(_state_payload(state)),
                }
            elif prior is None:
                seen[key] = state.completed_turns

    first_policy = player_policy if first_actor == "player" else loomkeeper_policy
    second_policy = loomkeeper_policy if first_actor == "player" else player_policy
    identity = {
        "frameId": frame_id,
        "variant": variant,
        "startingDistance": starting_distance,
        "firstActor": first_actor,
        "mirrored": mirrored,
        "playerPolicy": player_policy,
        "loomkeeperPolicy": loomkeeper_policy,
    }
    final_payload = _state_payload(state)
    match_payload = {
        "schemaVersion": 1,
        **identity,
        "firstPolicy": first_policy,
        "secondPolicy": second_policy,
        "pathSteps": path_steps,
        "pathDigest": canonical_digest(path_steps),
        "normalizedPathDigest": canonical_digest([
            {
                "actorRole": item["actorRole"],
                "policy": item["policy"],
                "kind": item["kind"],
                "relicId": item["relicId"],
                "directionRole": item["directionRole"],
            }
            for item in path_steps
        ]),
        "substitutions": substitutions,
        "winner": state.winner,
        "winnerRole": (
            "draw" if state.winner == "draw"
            else ("first" if state.winner == first_actor else "second")
        ),
        "finishReason": state.finish_reason,
        "completedTurns": state.completed_turns,
        "nonterminalRecurrence": recurrence,
        "finalCarrier": final_payload,
        "finalCarrierDigest": canonical_digest(final_payload),
    }
    match_digest = canonical_digest(match_payload)
    return {
        "matchRef": f"d2l-match-{match_digest[:24]}",
        **match_payload,
        "matchDigest": match_digest,
    }


def _frame_matches(config: TacticalConfig, frame_id: str, variant: str) -> list[dict[str, Any]]:
    if frame_id == "f4_cross_band_v0":
        starts = PRIMARY_STARTS
        orientations: tuple[tuple[Actor, bool], ...] = (
            ("player", False),
            ("loomkeeper", True),
        )
    elif frame_id == "d2k_boundary_v0":
        starts = BOUNDARY_STARTS
        orientations = tuple(
            (actor, mirrored)
            for actor in ("player", "loomkeeper")
            for mirrored in (False, True)
        )
    else:
        raise PolicyTransportProbeError(f"Unknown D2L frame: {frame_id}")
    return [
        _simulate_match(
            config,
            frame_id=frame_id,
            variant=variant,
            starting_distance=starting_distance,
            first_actor=first_actor,
            mirrored=mirrored,
            player_policy=player_policy,
            loomkeeper_policy=loomkeeper_policy,
        )
        for starting_distance in starts
        for first_actor, mirrored in orientations
        for player_policy in BASE_POLICY_NAMES
        for loomkeeper_policy in BASE_POLICY_NAMES
    ]


def build_policy_transport_export() -> dict[str, Any]:
    root = repository_root()
    model_path = root / MODEL_PATH
    config_path = root / CONFIG_PATH
    if _sha256(model_path) != MODEL_SHA256:
        raise PolicyTransportProbeError("Tactical-model source hash drifted")
    if _sha256(config_path) != CONFIG_SHA256:
        raise PolicyTransportProbeError("F4 config source hash drifted")
    raw_config = json.loads(config_path.read_text(encoding="utf-8"))
    if raw_config.get("schema_version") != CONFIG_SCHEMA_VERSION:
        raise PolicyTransportProbeError("F4 config schema version drifted")
    config = load_config(config_path)
    if config.seed != SEED or config.maximum_turns != MAXIMUM_TURNS:
        raise PolicyTransportProbeError("F4 seed or horizon drifted")
    d2k = build_policy_choice_relation_export()
    if d2k["exportDigest"] != D2K_RAW_DIGEST:
        raise PolicyTransportProbeError("D2K raw relation digest drifted")

    matches = [
        match
        for frame_id in ("f4_cross_band_v0", "d2k_boundary_v0")
        for variant in VARIANTS
        for match in _frame_matches(config, frame_id, variant)
    ]
    if len(matches) != 2_200 or len({item["matchRef"] for item in matches}) != 2_200:
        raise PolicyTransportProbeError("D2L did not produce 2,200 unique frame/variant matches")

    payload = {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "exportId": EXPORT_ID,
        "sourceBindings": {
            "repositoryId": "worms-port",
            "sourceCommit": SOURCE_COMMIT,
            "crpmMethodCommit": CRPM_METHOD_COMMIT,
            "d2kRawDigest": D2K_RAW_DIGEST,
            "d2kResultDigest": D2K_RESULT_DIGEST,
            "modelPath": MODEL_PATH,
            "modelSha256": MODEL_SHA256,
            "configPath": CONFIG_PATH,
            "configSha256": CONFIG_SHA256,
            "configId": config.identifier,
            "configSchemaVersion": CONFIG_SCHEMA_VERSION,
        },
        "domain": {
            "frames": [
                {
                    "frameId": "f4_cross_band_v0",
                    "startingDistances": list(PRIMARY_STARTS),
                    "orientationCountPerDistance": 2,
                    "matchesPerVariant": 250,
                },
                {
                    "frameId": "d2k_boundary_v0",
                    "startingDistances": list(BOUNDARY_STARTS),
                    "orientationCountPerDistance": 4,
                    "matchesPerVariant": 300,
                },
            ],
            "variants": list(VARIANTS),
            "policyNames": list(BASE_POLICY_NAMES),
            "orderedPolicyPairCount": 25,
            "seed": SEED,
            "maximumTurns": MAXIMUM_TURNS,
        },
        "matches": matches,
        "blockedClaims": [
            "Shadow policy substitutions are analytical counterfactuals, not edits to model.py or live Loomkeeper behavior.",
            "An immediate terminal win does not establish that a general lethal-first policy improves initiative, choice, fun, or human play.",
            "Primary and boundary frames overlap and must not be counted as independent evidence.",
            "Terminal residue normalization cannot establish gameplay landfall when no future carrier remains.",
            "Terrain, aim, trajectory, splash, hidden information, player execution, UI, replay, networking, rewards, assets, and production state remain excluded.",
        ],
        "productAuthority": "none",
    }
    return {**payload, "exportDigest": canonical_digest(payload)}


def main() -> int:
    print(canonical_json(build_policy_transport_export()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
