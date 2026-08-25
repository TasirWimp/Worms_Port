"""Deterministic WP-015D2O natural matched-twin export over unchanged F4.

Every carrier in this export is reached from ``initial_state`` through actions
returned by ``legal_actions`` and advanced by ``apply_action``.  The bounded
tree stops at the first preparation-response carrier on each branch and never
constructs or patches a tactical state.
"""

from __future__ import annotations

import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
from typing import Any

from .model import (
    BASE_POLICY_NAMES,
    Action,
    Actor,
    ActorState,
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
EXPORT_ID = "wp-015d2o-f4-natural-matched-twin-reachability"
SOURCE_COMMIT = "3a1d844fce9be09ed8ec51e39fe0f94632f43fe5"
CRPM_METHOD_COMMIT = "053c6fc0a90ed48d8667016b18a1d10106a7a2bc"
D2N_RESULT_DIGEST = "5c554344271e2543cc6811fa579b28d85054da19b067acb8d12e7c60bed03dc8"
MODEL_SHA256 = "af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08"
CONFIG_SHA256 = "5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0"
CONFIG_SCHEMA_VERSION = 11
SEED = 3237998097
MAXIMUM_TURNS = 16
MAXIMUM_PREFIX_ACTIONS = 4
STARTING_DISTANCES = (639, 640, 641)
MODEL_PATH = "analysis/tactical_model/model.py"
CONFIG_PATH = (
    "analysis/tactical_model/configs/"
    "v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-"
    "spun-cocoon-threadback-unweave-candidate-f4.json"
)
OUTPUT_ROOT = "test-results/crpm-world/d2o-natural-matched-twins"


class NaturalMatchedTwinProbeError(RuntimeError):
    """Raised when a source lock, traversal invariant, or topology drifts."""


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


def _source_role(source: Actor | None, responder: Actor) -> str | None:
    if source is None:
        return None
    return "responder" if source == responder else "preparer"


def _actor_relative_support(actor: ActorState, responder: Actor) -> dict[str, Any]:
    return {
        "stitching": actor.stitching,
        "seamPinSourceRole": _source_role(actor.seam_pin_source, responder),
        "seamPinTurns": actor.seam_pin_turns,
        "seamPinCooldown": actor.seam_pin_cooldown,
        "escapeSlack": actor.escape_slack_remaining,
        "braceTurns": actor.brace_turns,
        "braceUses": actor.brace_uses_remaining,
        "spoolburstPreparationTurns": actor.spoolburst_preparation_turns,
        "spoolburstCocoonHits": actor.spoolburst_cocoon_hits_remaining,
        "openingWeaveHits": actor.opening_weave_hits_remaining,
        "seamPinMaximumSeparationIncrease": actor.seam_pin_maximum_separation_increase,
        "frayedSeamSourceRole": _source_role(actor.frayed_seam_source, responder),
        "frayedSeamTurns": actor.frayed_seam_turns,
    }


def _normalized_carrier_payload(state: TacticalState) -> dict[str, Any]:
    responder = state.active_actor
    preparer = other_actor(responder)
    return {
        "completedTurns": state.completed_turns,
        "remainingTurns": MAXIMUM_TURNS - state.completed_turns,
        "separation": distance(state),
        "responderSupport": _actor_relative_support(actor_state(state, responder), responder),
        "preparerSupport": _actor_relative_support(actor_state(state, preparer), responder),
    }


def _is_response_carrier(state: TacticalState, config: TacticalConfig) -> bool:
    if state.finished:
        return False
    responder = actor_state(state, state.active_actor)
    preparer = actor_state(state, other_actor(state.active_actor))
    return (
        responder.spoolburst_preparation_turns == 0
        and preparer.spoolburst_preparation_turns > 0
        and any(item.kind == "prepare_spoolburst" for item in legal_actions(state, config))
    )


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
    if action.kind == "cast" and action.relic_id is not None:
        return action.relic_id
    return action.kind


def _immediate_signature(
    before: TacticalState,
    after: TacticalState,
    action: Action,
) -> dict[str, Any]:
    responder = before.active_actor
    preparer = other_actor(responder)
    responder_before = actor_state(before, responder)
    responder_after = actor_state(after, responder)
    preparer_before = actor_state(before, preparer)
    preparer_after = actor_state(after, preparer)
    return {
        "responseKind": _response_kind(action),
        "actionKind": action.kind,
        "relicId": action.relic_id,
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
            responder_after.spoolburst_preparation_turns
            - responder_before.spoolburst_preparation_turns
        ),
        "preparerPreparationDelta": (
            preparer_after.spoolburst_preparation_turns
            - preparer_before.spoolburst_preparation_turns
        ),
        "responderCocoonDelta": (
            responder_after.spoolburst_cocoon_hits_remaining
            - responder_before.spoolburst_cocoon_hits_remaining
        ),
        "preparerCocoonDelta": (
            preparer_after.spoolburst_cocoon_hits_remaining
            - preparer_before.spoolburst_cocoon_hits_remaining
        ),
    }


def _relative_result(winner: str | None, responder: Actor) -> str:
    if winner == responder:
        return "responder_win"
    if winner in {None, "draw"}:
        return "draw"
    return "preparer_win"


def _continuation_operator(config: TacticalConfig):
    @lru_cache(maxsize=None)
    def continue_to_terminal(
        state: TacticalState,
        player_policy: str,
        loomkeeper_policy: str,
    ) -> tuple[tuple[Action, ...], TacticalState]:
        if state.finished:
            return (), state
        acting_policy = player_policy if state.active_actor == "player" else loomkeeper_policy
        target_policy = loomkeeper_policy if state.active_actor == "player" else player_policy
        action = choose_action(acting_policy, state, config)
        after = apply_action(
            state,
            action,
            config,
            target_reaction_policy=target_policy,
        )
        suffix, final = continue_to_terminal(after, player_policy, loomkeeper_policy)
        return (action, *suffix), final

    return continue_to_terminal


def _continuation_outcome(
    initial: TacticalState,
    responder: Actor,
    responder_policy: str,
    preparer_policy: str,
    config: TacticalConfig,
    continue_to_terminal: Any,
) -> dict[str, Any]:
    player_policy = responder_policy if responder == "player" else preparer_policy
    loomkeeper_policy = preparer_policy if responder == "player" else responder_policy
    actions, final = continue_to_terminal(initial, player_policy, loomkeeper_policy)

    state = initial
    seen = {tactical_state_key(state): state.completed_turns}
    recurrence = False
    for action in actions:
        target_policy = loomkeeper_policy if state.active_actor == "player" else player_policy
        state = apply_action(
            state,
            action,
            config,
            target_reaction_policy=target_policy,
        )
        if not state.finished:
            key = tactical_state_key(state)
            if key in seen:
                recurrence = True
            else:
                seen[key] = state.completed_turns
    if state != final:
        raise NaturalMatchedTwinProbeError("Memoized continuation replay diverged")

    action_keys = [action_key(action) for action in actions]
    return {
        "responderPolicy": responder_policy,
        "preparerPolicy": preparer_policy,
        "responderResult": _relative_result(final.winner, responder),
        "finishReason": final.finish_reason,
        "continuationLength": len(actions),
        "continuationPathDigest": canonical_digest(action_keys),
        "finalCompletedTurns": final.completed_turns,
        "nonterminalRecurrence": recurrence,
    }


def _continuation_relation(
    state: TacticalState,
    config: TacticalConfig,
    continue_to_terminal: Any,
) -> tuple[dict[str, Any], dict[str, Any]]:
    responder = state.active_actor
    rows: list[dict[str, Any]] = []
    for action in legal_actions(state, config):
        after = apply_action(state, action, config)
        outcomes = [
            _continuation_outcome(
                after,
                responder,
                responder_policy,
                preparer_policy,
                config,
                continue_to_terminal,
            )
            for responder_policy in BASE_POLICY_NAMES
            for preparer_policy in BASE_POLICY_NAMES
        ]
        rows.append({
            "immediateSignature": _immediate_signature(state, after, action),
            "outcomes": outcomes,
        })
    rows.sort(key=canonical_json)

    outcome_projection = [
        {
            "immediateSignature": row["immediateSignature"],
            "outcomes": [
                {
                    "responderPolicy": item["responderPolicy"],
                    "preparerPolicy": item["preparerPolicy"],
                    "responderResult": item["responderResult"],
                    "finishReason": item["finishReason"],
                    "nonterminalRecurrence": item["nonterminalRecurrence"],
                }
                for item in row["outcomes"]
            ],
        }
        for row in rows
    ]
    counts = {
        "responseCount": len(rows),
        "continuationCount": sum(len(row["outcomes"]) for row in rows),
        "responderWinCount": sum(
            item["responderResult"] == "responder_win"
            for row in rows for item in row["outcomes"]
        ),
        "preparerWinCount": sum(
            item["responderResult"] == "preparer_win"
            for row in rows for item in row["outcomes"]
        ),
        "drawCount": sum(
            item["responderResult"] == "draw"
            for row in rows for item in row["outcomes"]
        ),
        "turnLimitCount": sum(
            item["finishReason"] == "turn_limit"
            for row in rows for item in row["outcomes"]
        ),
        "recurrenceCount": sum(
            item["nonterminalRecurrence"]
            for row in rows for item in row["outcomes"]
        ),
    }
    outcome_digest = canonical_digest(outcome_projection)
    timed_digest = canonical_digest(rows)
    relation = {
        "relationRef": f"d2o-relation-{outcome_digest[:24]}",
        "outcomeRelationDigest": outcome_digest,
        "outcomeProjection": outcome_projection,
        **counts,
    }
    return relation, {
        "outcomeRelationRef": relation["relationRef"],
        "outcomeRelationDigest": outcome_digest,
        "timedRelationDigest": timed_digest,
        **counts,
    }


def _enumerate_occurrences(config: TacticalConfig) -> tuple[list[dict[str, Any]], dict[str, int]]:
    branches = [
        {
            "startingDistance": starting_distance,
            "firstActor": first_actor,
            "mirrored": mirrored,
            "state": initial_state(
                config,
                first_actor=first_actor,
                mirrored=mirrored,
                starting_distance=starting_distance,
            ),
            "pathActions": [],
        }
        for starting_distance in STARTING_DISTANCES
        for first_actor in ("player", "loomkeeper")
        for mirrored in (False, True)
    ]
    occurrences: list[dict[str, Any]] = []
    generated_transition_count = 0
    terminal_branch_count = 0

    for _depth in range(1, MAXIMUM_PREFIX_ACTIONS + 1):
        next_branches: list[dict[str, Any]] = []
        for branch in branches:
            state = branch["state"]
            for action in legal_actions(state, config):
                generated_transition_count += 1
                after = apply_action(state, action, config)
                path_actions = [*branch["pathActions"], action_key(action)]
                if after.finished:
                    terminal_branch_count += 1
                    continue
                candidate = {
                    **branch,
                    "state": after,
                    "pathActions": path_actions,
                }
                if _is_response_carrier(after, config):
                    occurrences.append(candidate)
                else:
                    next_branches.append(candidate)
        branches = next_branches

    return occurrences, {
        "generatedTransitionCount": generated_transition_count,
        "terminalBranchCount": terminal_branch_count,
        "openFrontierBranchCount": len(branches),
    }


def build_natural_matched_twin_export() -> dict[str, Any]:
    root = repository_root()
    model_path = root / MODEL_PATH
    config_path = root / CONFIG_PATH
    if _sha256(model_path) != MODEL_SHA256:
        raise NaturalMatchedTwinProbeError("Tactical-model source hash drifted")
    if _sha256(config_path) != CONFIG_SHA256:
        raise NaturalMatchedTwinProbeError("F4 config source hash drifted")
    raw_config = json.loads(config_path.read_text(encoding="utf-8"))
    if raw_config.get("schema_version") != CONFIG_SCHEMA_VERSION:
        raise NaturalMatchedTwinProbeError("F4 config schema version drifted")
    config = load_config(config_path)
    if config.seed != SEED or config.maximum_turns != MAXIMUM_TURNS:
        raise NaturalMatchedTwinProbeError("F4 seed or horizon drifted")

    occurrence_drafts, traversal_counts = _enumerate_occurrences(config)
    continue_to_terminal = _continuation_operator(config)

    state_by_digest: dict[str, TacticalState] = {}
    state_class_ref: dict[str, str] = {}
    class_payloads: dict[str, dict[str, Any]] = {}
    occurrence_drafts_with_refs: list[dict[str, Any]] = []

    for draft in occurrence_drafts:
        state = draft["state"]
        state_payload = _state_payload(state)
        state_digest = canonical_digest(state_payload)
        state_by_digest.setdefault(state_digest, state)
        normalized = _normalized_carrier_payload(state)
        normalized_digest = canonical_digest(normalized)
        carrier_ref = f"d2o-carrier-{normalized_digest[:24]}"
        state_class_ref[state_digest] = carrier_ref
        class_payloads.setdefault(carrier_ref, {
            "carrierRef": carrier_ref,
            "carrierDigest": normalized_digest,
            **normalized,
            "fullStateRefs": [],
            "occurrenceRefs": [],
            "outcomeRelationRefs": [],
            "deterministicMapEligible": False,
        })

        identity = {
            "startingDistance": draft["startingDistance"],
            "firstActor": draft["firstActor"],
            "mirrored": draft["mirrored"],
            "pathActions": draft["pathActions"],
            "fullStateDigest": state_digest,
            "normalizedCarrierRef": carrier_ref,
        }
        occurrence_digest = canonical_digest(identity)
        occurrence_drafts_with_refs.append({
            "occurrenceRef": f"d2o-occurrence-{occurrence_digest[:24]}",
            "occurrenceDigest": occurrence_digest,
            **identity,
            "completedTurns": state.completed_turns,
            "responder": state.active_actor,
            "responderPhase": (
                "first" if state.active_actor == draft["firstActor"] else "second"
            ),
            "pathKindPrefix": [item.split(":", 1)[0] for item in draft["pathActions"]],
            "pathDigest": canonical_digest(draft["pathActions"]),
        })

    relations_by_digest: dict[str, dict[str, Any]] = {}
    full_state_records: list[dict[str, Any]] = []
    for state_digest, state in sorted(state_by_digest.items()):
        relation, relation_summary = _continuation_relation(
            state,
            config,
            continue_to_terminal,
        )
        existing_relation = relations_by_digest.get(relation["outcomeRelationDigest"])
        if existing_relation is not None and existing_relation != relation:
            raise NaturalMatchedTwinProbeError("Outcome-relation digest collision")
        relations_by_digest[relation["outcomeRelationDigest"]] = relation
        state_ref = f"d2o-state-{state_digest[:24]}"
        carrier_ref = state_class_ref[state_digest]
        full_state_records.append({
            "stateRef": state_ref,
            "stateDigest": state_digest,
            "state": _state_payload(state),
            "normalizedCarrierRef": carrier_ref,
            **relation_summary,
        })
        class_payloads[carrier_ref]["fullStateRefs"].append(state_ref)
        class_payloads[carrier_ref]["outcomeRelationRefs"].append(
            relation_summary["outcomeRelationRef"]
        )

    state_ref_by_digest = {
        item["stateDigest"]: item["stateRef"] for item in full_state_records
    }
    occurrences: list[dict[str, Any]] = []
    for item in occurrence_drafts_with_refs:
        state_ref = state_ref_by_digest[item["fullStateDigest"]]
        occurrence = {**item, "fullStateRef": state_ref}
        occurrences.append(occurrence)
        class_payloads[item["normalizedCarrierRef"]]["occurrenceRefs"].append(
            item["occurrenceRef"]
        )

    carrier_classes: list[dict[str, Any]] = []
    for carrier_ref, item in sorted(class_payloads.items()):
        full_state_refs = sorted(set(item["fullStateRefs"]))
        occurrence_refs = sorted(set(item["occurrenceRefs"]))
        relation_refs = sorted(set(item["outcomeRelationRefs"]))
        carrier_classes.append({
            **item,
            "fullStateRefs": full_state_refs,
            "occurrenceRefs": occurrence_refs,
            "outcomeRelationRefs": relation_refs,
            "deterministicMapEligible": len(relation_refs) == 1,
        })

    occurrences.sort(key=lambda item: item["occurrenceRef"])
    full_state_records.sort(key=lambda item: item["stateRef"])
    relations = sorted(relations_by_digest.values(), key=lambda item: item["relationRef"])

    if len(occurrences) != 2_100:
        raise NaturalMatchedTwinProbeError(
            f"Expected 2100 natural occurrences, found {len(occurrences)}"
        )
    if len(full_state_records) != 1_520:
        raise NaturalMatchedTwinProbeError(
            f"Expected 1520 full states, found {len(full_state_records)}"
        )
    if len(carrier_classes) != 319:
        raise NaturalMatchedTwinProbeError(
            f"Expected 319 normalized carrier classes, found {len(carrier_classes)}"
        )
    if len(relations) != 122:
        raise NaturalMatchedTwinProbeError(
            f"Expected 122 outcome relations, found {len(relations)}"
        )
    if len({item["occurrenceRef"] for item in occurrences}) != len(occurrences):
        raise NaturalMatchedTwinProbeError("Occurrence references are not unique")
    if len({item["stateRef"] for item in full_state_records}) != len(full_state_records):
        raise NaturalMatchedTwinProbeError("Full-state references are not unique")

    export_without_digest = {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "exportId": EXPORT_ID,
        "sourceBindings": {
            "repositoryId": "worms-port",
            "sourceCommit": SOURCE_COMMIT,
            "crpmMethodCommit": CRPM_METHOD_COMMIT,
            "d2nResultDigest": D2N_RESULT_DIGEST,
            "modelPath": MODEL_PATH,
            "modelSha256": MODEL_SHA256,
            "configPath": CONFIG_PATH,
            "configSha256": CONFIG_SHA256,
            "configId": config.identifier,
            "configSchemaVersion": CONFIG_SCHEMA_VERSION,
            "publicFunctions": [
                "initial_state",
                "legal_actions",
                "apply_action",
                "choose_action",
                "tactical_state_key",
                "tactical_state_snapshot",
            ],
        },
        "domain": {
            "startingDistances": list(STARTING_DISTANCES),
            "firstActors": ["player", "loomkeeper"],
            "mirrored": [False, True],
            "initialScenarioCount": 12,
            "maximumPrefixActions": MAXIMUM_PREFIX_ACTIONS,
            "collectionGate": "first_preparation_response_carrier",
            "terminalBranchRule": "stop",
            "responseCarrierBranchRule": "stop",
            "pathGeneration": "all_legal_actions",
            "transitionFunction": "apply_action",
            "policyNames": list(BASE_POLICY_NAMES),
            "orderedContinuationPolicyPairCount": len(BASE_POLICY_NAMES) ** 2,
            "seed": SEED,
            "maximumTurns": MAXIMUM_TURNS,
            "constraints": [
                "Every collected state descends from initial_state through legal_actions and apply_action only.",
                "The four-action prefix is a priced interface cut, not exhaustive F4 reachability.",
                "Every legal response is evaluated through all 25 ordered base-policy continuations.",
                "Terrain, aim, trajectory, splash, hidden information, human adaptation, live Loomkeeper behavior, UI, replay, networking, rewards, assets, and production state are excluded.",
            ],
        },
        "census": {
            **traversal_counts,
            "responseCarrierOccurrenceCount": len(occurrences),
            "distinctFullStateCount": len(full_state_records),
            "normalizedCarrierClassCount": len(carrier_classes),
            "continuationTargetClassCount": len(relations),
        },
        "occurrences": occurrences,
        "fullStates": full_state_records,
        "carrierClasses": carrier_classes,
        "outcomeRelations": relations,
        "blockedClaims": [
            "This four-action legal-prefix tree is not exhaustive F4 reachability, optimal play, or player behavior.",
            "A turn-limit-sensitive phase split is analytical horizon pressure, not a gameplay initiative mechanism.",
            "Natural matched twins calibrate a D2A chart but do not establish fun, balance, V5 approval, or production authority.",
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
    result = build_natural_matched_twin_export()
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
