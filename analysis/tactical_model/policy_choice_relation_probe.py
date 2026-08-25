"""Deterministic WP-015D2K response-choice export over unchanged F4.

The probe discovers every interleaved Spoolburst-preparation response carrier
on the declared 639/640/641 short-approach routes.  It evaluates the five
existing policy selectors on the same carrier, then forces every legal response
through every ordered base-policy continuation pair.  It never changes the
tactical model, configuration, policies, or historical reports.
"""

from __future__ import annotations

import argparse
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
from .policy_closure_audit import canonical_digest, canonical_json


EXPORT_SCHEMA_VERSION = 1
EXPORT_ID = "wp-015d2k-mechanics-fixed-policy-choice-relation"
SOURCE_COMMIT = "5b6233a202f3a2fa8c06515d2c8f794736c77b02"
CRPM_METHOD_COMMIT = "053c6fc0a90ed48d8667016b18a1d10106a7a2bc"
D2I_RESULT_DIGEST = "ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0"
MODEL_SHA256 = "af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08"
CONFIG_SHA256 = "5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0"
CONFIG_SCHEMA_VERSION = 11
SEED = 3237998097
MAXIMUM_TURNS = 16
STARTING_DISTANCES = (639, 640, 641)
BASELINE_POLICY = "short_approach"
OUTPUT_ROOT = "test-results/crpm-world/d2k-policy-choice"
MODEL_PATH = "analysis/tactical_model/model.py"
CONFIG_PATH = (
    "analysis/tactical_model/configs/"
    "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-"
    "spun-cocoon-threadback-unweave-candidate-f4.json"
)


class PolicyChoiceProbeError(RuntimeError):
    """Raised when a D2K source binding or replay invariant is violated."""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _json_value(value: Any) -> Any:
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


def _action_payload(action: Action) -> dict[str, Any]:
    return {
        "kind": action.kind,
        "direction": action.direction,
        "relicId": action.relic_id,
        "actionKey": action_key(action),
    }


def _response_kind(action: Action) -> str:
    if action.kind == "prepare_spoolburst":
        return "counter_preparation"
    if action.kind == "unweave_spoolburst":
        return "paid_unweave"
    if action.kind == "relocate":
        return "relocate"
    if action.kind == "cast" and action.relic_id in {"needlepoint", "threadball", "spoolburst"}:
        return action.relic_id
    return "other"


def _residue(before: TacticalState, after: TacticalState, responder: Actor) -> dict[str, Any]:
    preparer = other_actor(responder)
    responder_before = actor_state(before, responder)
    responder_after = actor_state(after, responder)
    preparer_before = actor_state(before, preparer)
    preparer_after = actor_state(after, preparer)
    return {
        "completedTurnsDelta": after.completed_turns - before.completed_turns,
        "distanceDelta": distance(after) - distance(before),
        "damageToResponder": responder_before.stitching - responder_after.stitching,
        "damageToPreparer": preparer_before.stitching - preparer_after.stitching,
        "responderEscapeSlackDelta": (
            responder_after.escape_slack_remaining - responder_before.escape_slack_remaining
        ),
        "preparerEscapeSlackDelta": (
            preparer_after.escape_slack_remaining - preparer_before.escape_slack_remaining
        ),
        "responderPreparationDelta": (
            responder_after.spoolburst_preparation_turns -
            responder_before.spoolburst_preparation_turns
        ),
        "preparerPreparationDelta": (
            preparer_after.spoolburst_preparation_turns -
            preparer_before.spoolburst_preparation_turns
        ),
        "responderCocoonDelta": (
            responder_after.spoolburst_cocoon_hits_remaining -
            responder_before.spoolburst_cocoon_hits_remaining
        ),
        "preparerCocoonDelta": (
            preparer_after.spoolburst_cocoon_hits_remaining -
            preparer_before.spoolburst_cocoon_hits_remaining
        ),
        "responderXDelta": responder_after.x - responder_before.x,
        "preparerXDelta": preparer_after.x - preparer_before.x,
    }


def _terminal_result(winner: str | None, responder: Actor) -> str:
    if winner == responder:
        return "responder_win"
    if winner in {"draw", None}:
        return "draw"
    return "preparer_win"


def _continue_from_state(
    initial: TacticalState,
    config: TacticalConfig,
    player_policy: str,
    loomkeeper_policy: str,
    seen_before: dict[tuple[Any, ...], int],
) -> dict[str, Any]:
    state = initial
    path_actions: list[str] = []
    seen = dict(seen_before)
    initial_key = tactical_state_key(state)
    recurrence: dict[str, Any] | None = None
    if initial_key in seen and not state.finished:
        recurrence = {
            "firstSeenAfterCompletedTurns": seen[initial_key],
            "repeatedAfterCompletedTurns": state.completed_turns,
            "cycleTurns": state.completed_turns - seen[initial_key],
            "state": tactical_state_snapshot(state),
        }
    elif initial_key not in seen:
        seen[initial_key] = state.completed_turns

    while not state.finished:
        actor = state.active_actor
        policy = player_policy if actor == "player" else loomkeeper_policy
        target_policy = player_policy if other_actor(actor) == "player" else loomkeeper_policy
        action = choose_action(policy, state, config)
        path_actions.append(action_key(action))
        state = apply_action(
            state,
            action,
            config,
            target_reaction_policy=target_policy,
        )
        key = tactical_state_key(state)
        if not state.finished and recurrence is None:
            prior = seen.get(key)
            if prior is not None:
                recurrence = {
                    "firstSeenAfterCompletedTurns": prior,
                    "repeatedAfterCompletedTurns": state.completed_turns,
                    "cycleTurns": state.completed_turns - prior,
                    "state": tactical_state_snapshot(state),
                }
            else:
                seen[key] = state.completed_turns

    return {
        "pathActions": path_actions,
        "pathDigest": canonical_digest(path_actions),
        "finalCarrier": _state_payload(state),
        "finalCarrierDigest": canonical_digest(_state_payload(state)),
        "winner": state.winner,
        "finishReason": state.finish_reason,
        "completedTurns": state.completed_turns,
        "nonterminalRecurrence": recurrence,
    }


def _is_response_carrier(state: TacticalState, config: TacticalConfig) -> bool:
    if state.finished:
        return False
    responder = actor_state(state, state.active_actor)
    preparer = actor_state(state, other_actor(state.active_actor))
    if responder.spoolburst_preparation_turns != 0 or preparer.spoolburst_preparation_turns <= 0:
        return False
    return any(action.kind == "prepare_spoolburst" for action in legal_actions(state, config))


def _match_ref(starting_distance: int, first_actor: Actor, mirrored: bool) -> str:
    identity = {
        "startingDistance": starting_distance,
        "firstActor": first_actor,
        "mirrored": mirrored,
        "playerPolicy": BASELINE_POLICY,
        "loomkeeperPolicy": BASELINE_POLICY,
    }
    return f"d2k-match-{canonical_digest(identity)[:24]}"


def _extract_route(
    config: TacticalConfig,
    starting_distance: int,
    first_actor: Actor,
    mirrored: bool,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    state = initial_state(
        config,
        first_actor=first_actor,
        mirrored=mirrored,
        starting_distance=starting_distance,
    )
    match_ref = _match_ref(starting_distance, first_actor, mirrored)
    path_actions: list[str] = []
    seen: dict[tuple[Any, ...], int] = {tactical_state_key(state): state.completed_turns}
    carrier_items: list[dict[str, Any]] = []
    voyage_items: list[dict[str, Any]] = []
    cycle_index = 0

    while not state.finished:
        if _is_response_carrier(state, config):
            cycle_index += 1
            responder = state.active_actor
            preparer = other_actor(responder)
            carrier_identity = {
                "matchRef": match_ref,
                "cycleIndex": cycle_index,
                "completedTurns": state.completed_turns,
                "sourceCarrierDigest": canonical_digest(_state_payload(state)),
            }
            carrier_ref = f"d2k-carrier-{canonical_digest(carrier_identity)[:24]}"
            legal = tuple(sorted(legal_actions(state, config), key=action_key))
            legal_payloads = [_action_payload(action) for action in legal]
            selections = [
                {
                    "policy": policy,
                    "selectedActionKey": action_key(choose_action(policy, state, config)),
                }
                for policy in BASE_POLICY_NAMES
            ]
            legal_keys = {item["actionKey"] for item in legal_payloads}
            if any(item["selectedActionKey"] not in legal_keys for item in selections):
                raise PolicyChoiceProbeError("A policy selected an action outside legal support")

            carrier_items.append({
                "schemaVersion": 1,
                "carrierRef": carrier_ref,
                "matchRef": match_ref,
                "startingDistance": starting_distance,
                "firstActor": first_actor,
                "mirrored": mirrored,
                "cycleIndex": cycle_index,
                "responder": responder,
                "responderPhase": "first" if responder == first_actor else "second",
                "preparer": preparer,
                "completedTurns": state.completed_turns,
                "pathPrefixActions": list(path_actions),
                "pathPrefixDigest": canonical_digest(path_actions),
                "sourceCarrier": _state_payload(state),
                "sourceCarrierDigest": canonical_digest(_state_payload(state)),
                "sourceRecurrenceKey": _json_value(tactical_state_key(state)),
                "legalActions": legal_payloads,
                "legalActionSetDigest": canonical_digest(legal_payloads),
                "policySelections": selections,
            })

            for response_action in legal:
                immediate = apply_action(
                    state,
                    response_action,
                    config,
                    target_reaction_policy=BASELINE_POLICY,
                )
                immediate_payload = _state_payload(immediate)
                response_payload = _action_payload(response_action)
                response_ref = (
                    f"d2k-response-{canonical_digest({'carrierRef': carrier_ref, 'action': response_payload})[:24]}"
                )
                for player_policy in BASE_POLICY_NAMES:
                    for loomkeeper_policy in BASE_POLICY_NAMES:
                        continuation = _continue_from_state(
                            immediate,
                            config,
                            player_policy,
                            loomkeeper_policy,
                            seen,
                        )
                        voyage_payload = {
                            "schemaVersion": 1,
                            "carrierRef": carrier_ref,
                            "responseRef": response_ref,
                            "responseKind": _response_kind(response_action),
                            "responseAction": response_payload,
                            "immediateCarrier": immediate_payload,
                            "immediateCarrierDigest": canonical_digest(immediate_payload),
                            "immediateResidue": _residue(state, immediate, responder),
                            "playerContinuationPolicy": player_policy,
                            "loomkeeperContinuationPolicy": loomkeeper_policy,
                            "continuationActions": continuation["pathActions"],
                            "continuationPathDigest": continuation["pathDigest"],
                            "finalCarrier": continuation["finalCarrier"],
                            "finalCarrierDigest": continuation["finalCarrierDigest"],
                            "winner": continuation["winner"],
                            "finishReason": continuation["finishReason"],
                            "completedTurns": continuation["completedTurns"],
                            "responderResult": _terminal_result(continuation["winner"], responder),
                            "nonterminalRecurrence": continuation["nonterminalRecurrence"],
                        }
                        voyage_digest = canonical_digest(voyage_payload)
                        voyage_items.append({
                            "voyageRef": f"d2k-voyage-{voyage_digest[:24]}",
                            **voyage_payload,
                            "voyageDigest": voyage_digest,
                        })

        actor = state.active_actor
        action = choose_action(BASELINE_POLICY, state, config)
        state = apply_action(
            state,
            action,
            config,
            target_reaction_policy=BASELINE_POLICY,
        )
        path_actions.append(action_key(action))
        key = tactical_state_key(state)
        if key not in seen:
            seen[key] = state.completed_turns

    route = {
        "schemaVersion": 1,
        "matchRef": match_ref,
        "startingDistance": starting_distance,
        "firstActor": first_actor,
        "mirrored": mirrored,
        "baselineActions": path_actions,
        "baselinePathDigest": canonical_digest(path_actions),
        "responseCarrierCount": cycle_index,
        "winner": state.winner,
        "finishReason": state.finish_reason,
        "completedTurns": state.completed_turns,
        "finalCarrierDigest": canonical_digest(_state_payload(state)),
    }
    return route, carrier_items, voyage_items


def build_policy_choice_relation_export() -> dict[str, Any]:
    root = repository_root()
    model_path = root / MODEL_PATH
    config_path = root / CONFIG_PATH
    if _sha256(model_path) != MODEL_SHA256:
        raise PolicyChoiceProbeError("Tactical-model source hash drifted")
    if _sha256(config_path) != CONFIG_SHA256:
        raise PolicyChoiceProbeError("F4 config source hash drifted")
    raw_config = json.loads(config_path.read_text(encoding="utf-8"))
    if raw_config.get("schema_version") != CONFIG_SCHEMA_VERSION:
        raise PolicyChoiceProbeError("F4 config schema version drifted")
    config = load_config(config_path)
    if config.seed != SEED or config.maximum_turns != MAXIMUM_TURNS:
        raise PolicyChoiceProbeError("F4 seed or horizon drifted")

    routes: list[dict[str, Any]] = []
    carriers: list[dict[str, Any]] = []
    voyages: list[dict[str, Any]] = []
    for starting_distance in STARTING_DISTANCES:
        for first_actor in ("player", "loomkeeper"):
            for mirrored in (False, True):
                route, route_carriers, route_voyages = _extract_route(
                    config,
                    starting_distance,
                    first_actor,
                    mirrored,
                )
                routes.append(route)
                carriers.extend(route_carriers)
                voyages.extend(route_voyages)

    if len({item["matchRef"] for item in routes}) != len(routes):
        raise PolicyChoiceProbeError("Route references are not unique")
    if len({item["carrierRef"] for item in carriers}) != len(carriers):
        raise PolicyChoiceProbeError("Carrier references are not unique")
    if len({item["voyageRef"] for item in voyages}) != len(voyages):
        raise PolicyChoiceProbeError("Voyage references are not unique")

    export_without_digest = {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "exportId": EXPORT_ID,
        "sourceBindings": {
            "repositoryId": "worms-port",
            "sourceCommit": SOURCE_COMMIT,
            "crpmMethodCommit": CRPM_METHOD_COMMIT,
            "d2iResultDigest": D2I_RESULT_DIGEST,
            "modelPath": MODEL_PATH,
            "modelSha256": MODEL_SHA256,
            "configPath": CONFIG_PATH,
            "configSha256": CONFIG_SHA256,
            "configId": config.identifier,
            "configSchemaVersion": CONFIG_SCHEMA_VERSION,
        },
        "domain": {
            "startingDistances": list(STARTING_DISTANCES),
            "firstActors": ["player", "loomkeeper"],
            "mirrored": [False, True],
            "baselinePlayerPolicy": BASELINE_POLICY,
            "baselineLoomkeeperPolicy": BASELINE_POLICY,
            "policyNames": list(BASE_POLICY_NAMES),
            "orderedContinuationPolicyPairCount": len(BASE_POLICY_NAMES) ** 2,
            "seed": SEED,
            "maximumTurns": MAXIMUM_TURNS,
            "constraints": [
                "F4 mechanics, legal actions, policies, transitions, recurrence, and terminal rules remain unchanged.",
                "Response carriers are discovered on short_approach mirrors and include every later interleaving before terminal resolution.",
                "Every legal response is forced once before each declared continuation-policy pair resumes ordinary selection.",
                "Terrain, aim, trajectory, splash, hidden information, human adaptation, live Loomkeeper behavior, UI, replay, networking, rewards, assets, and production state are excluded.",
            ],
        },
        "routes": routes,
        "carriers": carriers,
        "voyages": voyages,
        "blockedClaims": [
            "The five policies are deterministic heuristics, not optimal play, player behavior, or a strategy-complete family.",
            "Terminal-outcome comparison does not establish gameplay dominance when path, resource, position, timing, or excluded-port residue differs.",
            "The bounded 639/640/641 carriers do not establish global balance, fun, V5 approval, or production authority.",
        ],
        "productAuthority": "none",
    }
    return {
        **export_without_digest,
        "exportDigest": canonical_digest(export_without_digest),
    }


def _validated_output_path(value: str) -> Path:
    root = (repository_root() / OUTPUT_ROOT).resolve()
    target = Path(value)
    if not target.is_absolute():
        target = repository_root() / target
    target = target.resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Output must stay below {OUTPUT_ROOT}") from error
    if target.suffix.lower() != ".json":
        raise ValueError("Output must be a JSON file")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        help=f"Optional JSON path below {OUTPUT_ROOT}; stdout is used when omitted.",
    )
    args = parser.parse_args(argv)
    result = build_policy_choice_relation_export()
    encoded = canonical_json(result) + "\n"
    if args.output:
        target = _validated_output_path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(encoded, encoding="utf-8", newline="\n")
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
