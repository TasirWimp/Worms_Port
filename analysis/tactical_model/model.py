"""A small, deterministic tactical model used only for balance analysis.

This intentionally does not reproduce Phaser, Socket.IO, terrain collision,
ballistics, replay hashes, or live command validation. TypeScript remains the
authoritative simulation. The model makes its direct-hit/range projection
assumptions explicit so its reports can inform, but never replace, production
tests and real-device acceptance.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from functools import lru_cache
import json
from pathlib import Path
from typing import Any, Literal


Actor = Literal["player", "loomkeeper"]
Winner = Actor | Literal["draw"] | None
ActionKind = Literal["cast", "relocate", "wait"]
ActionEconomy = Literal["move_and_cast", "committed"]
SeamPinActivation = Literal["any_direct_hit", "advance_only"]
RetreatCastRule = Literal["allowed", "forbidden"]

CONFIG_SCHEMA_VERSIONS = {1, 2, 3, 4}
RELIC_ORDER = ("threadball", "needlepoint", "spoolburst")
BASE_POLICY_NAMES = (
    "range_pressure",
    "medium_hold",
    "short_approach",
    "retreat_kite",
    "best_response",
)
SEAM_PIN_POLICY = "seam_pin_pressure"


class TacticalModelError(ValueError):
    """Raised when an analysis configuration or action is invalid."""


@dataclass(frozen=True)
class Relic:
    identifier: str
    minimum_range: int
    maximum_range: int
    direct_damage: int


@dataclass(frozen=True)
class SeamPin:
    """A candidate-only movement constraint attached by one explicitly named Relic."""

    relic_id: str
    maximum_separation_increase: int
    target_turns: int
    cooldown_actor_turns: int
    activation: SeamPinActivation
    retreat_cast_rule: RetreatCastRule


@dataclass(frozen=True)
class EscapeSlack:
    """Equal, non-refilling movement capacity used only for a candidate endgame model."""

    per_actor: int


@dataclass(frozen=True)
class TacticalConfig:
    identifier: str
    label: str
    analysis_status: Literal["baseline", "exploratory"]
    source_ruleset_id: str
    authority_fixture: str
    assumptions: tuple[str, ...]
    world_width: int
    actor_margin: int
    seed: int
    player_x: int
    loomkeeper_x: int
    default_first_actor: Actor
    maximum_turns: int
    movement_per_turn: int
    action_economy: ActionEconomy
    maximum_stitching: int
    relics: tuple[Relic, ...]
    opening_search_depth: int
    seam_pin: SeamPin | None = None
    escape_slack: EscapeSlack | None = None

    def relic(self, identifier: str) -> Relic:
        for relic in self.relics:
            if relic.identifier == identifier:
                return relic
        raise TacticalModelError(f"Unknown Relic: {identifier}")


@dataclass(frozen=True)
class ActorState:
    x: int
    stitching: int
    seam_pin_source: Actor | None = None
    seam_pin_turns: int = 0
    seam_pin_cooldown: int = 0
    escape_slack_remaining: int = 0


@dataclass(frozen=True)
class TacticalState:
    player: ActorState
    loomkeeper: ActorState
    active_actor: Actor
    completed_turns: int
    winner: Winner = None
    finish_reason: Literal["unravelled", "turn_limit"] | None = None

    @property
    def finished(self) -> bool:
        return self.winner is not None


@dataclass(frozen=True)
class Action:
    kind: ActionKind
    direction: int = 0
    relic_id: str | None = None


def repository_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_config(path: Path) -> TacticalConfig:
    raw = _load_json(path)
    common_keys = {
        "schema_version", "id", "label", "analysis_status", "source_ruleset_id",
        "authority_fixture", "assumptions", "world", "initial", "turn",
        "stitching", "relics", "opening_search_depth",
    }
    schema_version = raw.get("schema_version")
    if schema_version not in CONFIG_SCHEMA_VERSIONS:
        raise TacticalModelError(f"{path}: unsupported schema_version")
    expected_keys = common_keys if schema_version == 1 else common_keys | {"tactical_core"}
    _require_exact_keys(raw, expected_keys, str(path))
    if raw["analysis_status"] not in {"baseline", "exploratory"}:
        raise TacticalModelError(f"{path}: analysis_status must be baseline or exploratory")

    world = _require_object(raw["world"], f"{path}.world")
    _require_exact_keys(world, {"width", "actor_margin"}, f"{path}.world")
    initial = _require_object(raw["initial"], f"{path}.initial")
    _require_exact_keys(initial, {"seed", "player_x", "loomkeeper_x", "first_actor"}, f"{path}.initial")
    turn = _require_object(raw["turn"], f"{path}.turn")
    _require_exact_keys(turn, {"maximum_turns", "movement_per_turn", "action_economy"}, f"{path}.turn")
    stitching = _require_object(raw["stitching"], f"{path}.stitching")
    _require_exact_keys(stitching, {"maximum"}, f"{path}.stitching")
    relics_raw = _require_object(raw["relics"], f"{path}.relics")
    if tuple(relics_raw.keys()) != RELIC_ORDER:
        raise TacticalModelError(f"{path}.relics must contain ordered Relics {RELIC_ORDER}")

    relics: list[Relic] = []
    for identifier in RELIC_ORDER:
        relic_raw = _require_object(relics_raw[identifier], f"{path}.relics.{identifier}")
        _require_exact_keys(relic_raw, {"minimum_range", "maximum_range", "direct_damage"},
                            f"{path}.relics.{identifier}")
        minimum_range = _require_positive_integer(relic_raw["minimum_range"],
                                                  f"{path}.relics.{identifier}.minimum_range", allow_zero=True)
        maximum_range = _require_positive_integer(relic_raw["maximum_range"],
                                                  f"{path}.relics.{identifier}.maximum_range")
        direct_damage = _require_positive_integer(relic_raw["direct_damage"],
                                                  f"{path}.relics.{identifier}.direct_damage")
        if minimum_range > maximum_range:
            raise TacticalModelError(f"{path}.relics.{identifier}: minimum_range exceeds maximum_range")
        relics.append(Relic(identifier, minimum_range, maximum_range, direct_damage))

    seam_pin: SeamPin | None = None
    if schema_version in {2, 3, 4}:
        tactical_core = _require_object(raw["tactical_core"], f"{path}.tactical_core")
        _require_exact_keys(
            tactical_core,
            {"seam_pin"} if schema_version in {2, 3} else {"seam_pin", "escape_slack"},
            f"{path}.tactical_core",
        )
        seam_pin_raw = _require_object(tactical_core["seam_pin"], f"{path}.tactical_core.seam_pin")
        seam_pin_keys = {"relic_id", "maximum_separation_increase", "target_turns", "cooldown_actor_turns"}
        if schema_version in {3, 4}:
            seam_pin_keys |= {"activation", "retreat_cast_rule"}
        _require_exact_keys(
            seam_pin_raw,
            seam_pin_keys,
            f"{path}.tactical_core.seam_pin",
        )
        relic_id = _require_string(seam_pin_raw["relic_id"], f"{path}.tactical_core.seam_pin.relic_id")
        if relic_id not in RELIC_ORDER:
            raise TacticalModelError(f"{path}.tactical_core.seam_pin.relic_id: expected known Relic")
        maximum_separation_increase = _require_positive_integer(
            seam_pin_raw["maximum_separation_increase"],
            f"{path}.tactical_core.seam_pin.maximum_separation_increase",
            allow_zero=True,
        )
        if maximum_separation_increase > _require_positive_integer(
            turn["movement_per_turn"], f"{path}.turn.movement_per_turn"
        ):
            raise TacticalModelError(f"{path}.tactical_core.seam_pin: retreat cap exceeds movement budget")
        seam_pin = SeamPin(
            relic_id=relic_id,
            maximum_separation_increase=maximum_separation_increase,
            target_turns=_require_positive_integer(
                seam_pin_raw["target_turns"], f"{path}.tactical_core.seam_pin.target_turns"
            ),
            cooldown_actor_turns=_require_positive_integer(
                seam_pin_raw["cooldown_actor_turns"],
                f"{path}.tactical_core.seam_pin.cooldown_actor_turns",
                allow_zero=True,
            ),
            activation=(
                "any_direct_hit" if schema_version == 2 else
                _require_seam_pin_activation(
                    seam_pin_raw["activation"], f"{path}.tactical_core.seam_pin.activation"
                )
            ),
            retreat_cast_rule=(
                "allowed" if schema_version == 2 else
                _require_retreat_cast_rule(
                    seam_pin_raw["retreat_cast_rule"], f"{path}.tactical_core.seam_pin.retreat_cast_rule"
                )
            ),
        )

    escape_slack: EscapeSlack | None = None
    if schema_version == 4:
        escape_slack_raw = _require_object(raw["tactical_core"]["escape_slack"], f"{path}.tactical_core.escape_slack")
        _require_exact_keys(escape_slack_raw, {"per_actor"}, f"{path}.tactical_core.escape_slack")
        escape_slack = EscapeSlack(
            per_actor=_require_positive_integer(
                escape_slack_raw["per_actor"], f"{path}.tactical_core.escape_slack.per_actor", allow_zero=True
            )
        )

    config = TacticalConfig(
        identifier=_require_string(raw["id"], f"{path}.id"),
        label=_require_string(raw["label"], f"{path}.label"),
        analysis_status=raw["analysis_status"],
        source_ruleset_id=_require_string(raw["source_ruleset_id"], f"{path}.source_ruleset_id"),
        authority_fixture=_require_string(raw["authority_fixture"], f"{path}.authority_fixture"),
        assumptions=tuple(_require_string(item, f"{path}.assumptions") for item in _require_list(raw["assumptions"], f"{path}.assumptions")),
        world_width=_require_positive_integer(world["width"], f"{path}.world.width"),
        actor_margin=_require_positive_integer(world["actor_margin"], f"{path}.world.actor_margin"),
        seed=_require_positive_integer(initial["seed"], f"{path}.initial.seed", allow_zero=True),
        player_x=_require_positive_integer(initial["player_x"], f"{path}.initial.player_x", allow_zero=True),
        loomkeeper_x=_require_positive_integer(initial["loomkeeper_x"], f"{path}.initial.loomkeeper_x", allow_zero=True),
        default_first_actor=_require_actor(initial["first_actor"], f"{path}.initial.first_actor"),
        maximum_turns=_require_positive_integer(turn["maximum_turns"], f"{path}.turn.maximum_turns"),
        movement_per_turn=_require_positive_integer(turn["movement_per_turn"], f"{path}.turn.movement_per_turn"),
        action_economy=_require_action_economy(turn["action_economy"], f"{path}.turn.action_economy"),
        maximum_stitching=_require_positive_integer(stitching["maximum"], f"{path}.stitching.maximum"),
        relics=tuple(relics),
        opening_search_depth=_require_positive_integer(raw["opening_search_depth"], f"{path}.opening_search_depth"),
        seam_pin=seam_pin,
        escape_slack=escape_slack,
    )
    if not (config.actor_margin <= config.player_x < config.world_width - config.actor_margin):
        raise TacticalModelError(f"{path}: player spawn lies outside legal world bounds")
    if not (config.actor_margin <= config.loomkeeper_x < config.world_width - config.actor_margin):
        raise TacticalModelError(f"{path}: Loomkeeper spawn lies outside legal world bounds")
    if abs(config.player_x - config.loomkeeper_x) < config.actor_margin * 2:
        raise TacticalModelError(f"{path}: initial actors overlap")
    return config


def load_authority_fixture(config: TacticalConfig) -> dict[str, Any]:
    path = repository_root() / config.authority_fixture
    fixture = _load_json(path)
    if fixture.get("schemaVersion") != 1 or fixture.get("fixtureId") != "v4-authoritative-baseline-v1":
        raise TacticalModelError(f"{path}: not a recognized V4 authority fixture")
    return fixture


def validate_world_against_authority_fixture(config: TacticalConfig) -> None:
    """Verify only structural fields shared by the abstract analysis and V4.

    This is deliberately not a claim of projectile/terrain parity. Candidate V5
    configurations may differ in range and damage; their world, turn, movement,
    and starting-state facts still derive from V4.
    """

    fixture = load_authority_fixture(config)
    initial = fixture["initial"]
    arena = fixture["arena"]
    turn = fixture["turn"]
    if config.world_width != arena["worldWidth"]:
        raise TacticalModelError("Analysis world width diverges from V4 authority fixture")
    if config.player_x != initial["player"]["x"] or config.loomkeeper_x != initial["loomkeeper"]["x"]:
        raise TacticalModelError("Analysis spawns diverge from V4 authority fixture")
    if config.maximum_stitching != fixture["stitching"]["maximum"]:
        raise TacticalModelError("Analysis Stitching maximum diverges from V4 authority fixture")
    if config.movement_per_turn != turn["movementPerTurn"] or config.maximum_turns != turn["maximumTurns"]:
        raise TacticalModelError("Analysis turn/movement bounds diverge from V4 authority fixture")

    if config.analysis_status == "baseline":
        fixture_relics = fixture["relics"]
        for relic in config.relics:
            if relic.direct_damage != fixture_relics[relic.identifier]["maximumDamage"]:
                raise TacticalModelError("Baseline direct damage diverges from V4 authority fixture")


def initial_state(config: TacticalConfig, *, first_actor: Actor | None = None, mirrored: bool = False) -> TacticalState:
    player_x = config.player_x
    loomkeeper_x = config.loomkeeper_x
    if mirrored:
        player_x = config.world_width - player_x
        loomkeeper_x = config.world_width - loomkeeper_x
    escape_slack = config.escape_slack.per_actor if config.escape_slack is not None else 0
    return TacticalState(
        player=ActorState(player_x, config.maximum_stitching, escape_slack_remaining=escape_slack),
        loomkeeper=ActorState(loomkeeper_x, config.maximum_stitching, escape_slack_remaining=escape_slack),
        active_actor=first_actor or config.default_first_actor,
        completed_turns=0,
    )


def distance(state: TacticalState) -> int:
    return abs(state.player.x - state.loomkeeper.x)


def policy_names(config: TacticalConfig) -> tuple[str, ...]:
    return BASE_POLICY_NAMES + ((SEAM_PIN_POLICY,) if config.seam_pin is not None else ())


def legal_actions(state: TacticalState, config: TacticalConfig) -> tuple[Action, ...]:
    if state.finished:
        return ()
    movement_directions = (0,) if config.action_economy == "committed" else (-1, 0, 1)
    actions: set[Action] = set()
    for direction in movement_directions:
        moved_state = _move_actor(state, state.active_actor, direction, config)
        projected_distance = distance(moved_state)
        for relic in config.relics:
            if _seam_pin_is_on_cooldown(state, state.active_actor, relic.identifier, config):
                continue
            if _seam_pin_forbids_retreat_cast(state, moved_state, relic.identifier, config):
                continue
            if relic.minimum_range <= projected_distance <= relic.maximum_range:
                actions.add(Action("cast", direction, relic.identifier))
    for direction in (-1, 1):
        if _move_actor(state, state.active_actor, direction, config) != state:
            actions.add(Action("relocate", direction))
    if not actions:
        actions.add(Action("wait"))
    return tuple(sorted(actions, key=action_key))


def apply_action(state: TacticalState, action: Action, config: TacticalConfig) -> TacticalState:
    if action not in legal_actions(state, config):
        raise TacticalModelError(f"Illegal tactical action: {action_key(action)}")
    if state.finished:
        raise TacticalModelError("Cannot act after a terminal result")

    if action.kind == "wait":
        moved_state = state
    else:
        moved_state = _move_actor(state, state.active_actor, action.direction, config)

    # Movement observes any active tether. Its holder spends/clears that tether
    # only after the action completes; the tether caster's cooldown also counts
    # only their own completed turns.
    next_state = _complete_active_actor_turn(moved_state, state.active_actor)
    if action.kind == "cast":
        assert action.relic_id is not None
        relic = config.relic(action.relic_id)
        if not relic.minimum_range <= distance(next_state) <= relic.maximum_range:
            raise TacticalModelError("Cast left its declared range band")
        target = other_actor(state.active_actor)
        target_state = actor_state(next_state, target)
        next_state = replace_actor(
            next_state,
            target,
            replace(target_state, stitching=max(0, target_state.stitching - relic.direct_damage)),
        )
        if actor_state(next_state, target).stitching == 0:
            return replace(next_state, completed_turns=state.completed_turns + 1,
                           winner=state.active_actor, finish_reason="unravelled")
        next_state = _apply_seam_pin_if_configured(
            next_state,
            state.active_actor,
            target,
            relic,
            before_movement=state,
            after_movement=moved_state,
            config=config,
        )

    completed_turns = state.completed_turns + 1
    if completed_turns >= config.maximum_turns:
        return replace(next_state, completed_turns=completed_turns,
                       winner="draw", finish_reason="turn_limit")
    return replace(next_state, completed_turns=completed_turns,
                   active_actor=other_actor(state.active_actor))


def action_key(action: Action) -> str:
    suffix = "stay" if action.direction == 0 else ("right" if action.direction > 0 else "left")
    return f"{action.kind}:{action.relic_id or '-'}:{suffix}"


def choose_action(policy: str, state: TacticalState, config: TacticalConfig) -> Action:
    if policy not in policy_names(config):
        raise TacticalModelError(f"Unknown policy: {policy}")
    actions = legal_actions(state, config)
    casts = tuple(action for action in actions if action.kind == "cast")
    actor = state.active_actor

    if policy == "range_pressure":
        if casts:
            return _select_best(casts, lambda action: (
                config.relic(action.relic_id or "").maximum_range,
                config.relic(action.relic_id or "").direct_damage,
                -abs(action.direction),
            ))
        return _select_relocation_toward(actions, state, config)

    if policy == "medium_hold":
        threadball = tuple(action for action in casts if action.relic_id == "threadball")
        if threadball:
            return _select_best(threadball, lambda action: (-abs(distance(_move_actor(state, actor, action.direction, config)) - config.relic("threadball").maximum_range), -abs(action.direction)))
        return _select_relocation_to_distance(actions, state, config, config.relic("threadball").maximum_range)

    if policy == "short_approach":
        spoolburst = tuple(action for action in casts if action.relic_id == "spoolburst")
        if spoolburst:
            return _select_best(spoolburst, lambda action: (-abs(action.direction),))
        return _select_relocation_to_distance(actions, state, config, config.relic("spoolburst").maximum_range)

    if policy == "retreat_kite":
        opponent_damage = _largest_legal_damage_for_actor(state, other_actor(actor), config)
        relocations = tuple(action for action in actions if action.kind == "relocate")
        if opponent_damage > 0 and relocations:
            return _select_best(relocations, lambda action: (distance(_move_actor(state, actor, action.direction, config)),))
        if casts:
            return _select_best(casts, lambda action: (
                config.relic(action.relic_id or "").maximum_range,
                -abs(action.direction),
            ))
        return _select_relocation_away(actions, state, config)

    if policy == SEAM_PIN_POLICY:
        seam_pin_casts = tuple(
            action for action in casts
            if _is_seam_pin_cast(action, config)
        )
        if seam_pin_casts:
            return _select_best(seam_pin_casts, lambda action: (
                -distance(_move_actor(state, actor, action.direction, config)),
                -abs(action.direction),
            ))
        spoolburst = tuple(action for action in casts if action.relic_id == "spoolburst")
        if spoolburst:
            return _select_best(spoolburst, lambda action: (-abs(action.direction),))
        if casts:
            return _select_best(casts, lambda action: (
                config.relic(action.relic_id or "").direct_damage,
                config.relic(action.relic_id or "").maximum_range,
                -abs(action.direction),
            ))
        return _select_relocation_to_distance(actions, state, config, config.relic("spoolburst").maximum_range)

    return _best_response_action(state, config)


def simulate_match(
    config: TacticalConfig,
    player_policy: str,
    loomkeeper_policy: str,
    *,
    first_actor: Actor,
    mirrored: bool,
) -> dict[str, Any]:
    state = initial_state(config, first_actor=first_actor, mirrored=mirrored)
    trace: list[dict[str, Any]] = []
    while not state.finished:
        actor = state.active_actor
        policy = player_policy if actor == "player" else loomkeeper_policy
        before = state
        action = choose_action(policy, before, config)
        state = apply_action(before, action, config)
        target = other_actor(actor)
        trace.append({
            "turn": before.completed_turns,
            "actor": actor,
            "policy": policy,
            "distanceBefore": distance(before),
            "action": action_key(action),
            "distanceAfter": distance(state),
            "damage": actor_state(before, target).stitching - actor_state(state, target).stitching,
            "playerStitching": state.player.stitching,
            "loomkeeperStitching": state.loomkeeper.stitching,
            "actorWasSeamPinned": actor_state(before, actor).seam_pin_turns > 0,
            "seamPinAppliedTo": target if (
                actor_state(state, target).seam_pin_source == actor and
                actor_state(state, target).seam_pin_turns > 0
            ) else None,
            "playerSeamPinTurns": state.player.seam_pin_turns,
            "loomkeeperSeamPinTurns": state.loomkeeper.seam_pin_turns,
            "playerSeamPinCooldown": state.player.seam_pin_cooldown,
            "loomkeeperSeamPinCooldown": state.loomkeeper.seam_pin_cooldown,
            "playerEscapeSlack": state.player.escape_slack_remaining,
            "loomkeeperEscapeSlack": state.loomkeeper.escape_slack_remaining,
        })
    return {
        "firstActor": first_actor,
        "mirrored": mirrored,
        "playerPolicy": player_policy,
        "loomkeeperPolicy": loomkeeper_policy,
        "winner": state.winner,
        "finishReason": state.finish_reason,
        "turns": state.completed_turns,
        "trace": trace,
    }


def run_experiment(config: TacticalConfig) -> dict[str, Any]:
    validate_world_against_authority_fixture(config)
    # Keep this 5x5 policy matrix stable across candidates so aggregate results
    # remain comparable with the original V4 and Candidate A reports.
    matches: list[dict[str, Any]] = []
    for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
        for player_policy in BASE_POLICY_NAMES:
            for loomkeeper_policy in BASE_POLICY_NAMES:
                matches.append(simulate_match(
                    config, player_policy, loomkeeper_policy,
                    first_actor=first_actor, mirrored=mirrored,
                ))

    candidate_policy_probes: list[dict[str, Any]] = []
    if config.seam_pin is not None:
        for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
            for player_policy, loomkeeper_policy in (
                (SEAM_PIN_POLICY, "retreat_kite"),
                ("retreat_kite", SEAM_PIN_POLICY),
            ):
                candidate_policy_probes.append(simulate_match(
                    config, player_policy, loomkeeper_policy,
                    first_actor=first_actor, mirrored=mirrored,
                ))

    first_actor_wins = sum(match["winner"] == match["firstActor"] for match in matches)
    action_counts: dict[str, int] = {}
    relic_by_distance_band: dict[str, dict[str, int]] = {}
    terminal_reasons: dict[str, int] = {}
    total_turns = 0
    for match in matches:
        total_turns += match["turns"]
        terminal_reasons[match["finishReason"]] = terminal_reasons.get(match["finishReason"], 0) + 1
        for step in match["trace"]:
            kind = step["action"].split(":", 1)[0]
            action_counts[kind] = action_counts.get(kind, 0) + 1
            if kind != "cast":
                continue
            relic = step["action"].split(":", 2)[1]
            band = distance_band(step["distanceAfter"], config)
            relic_by_distance_band.setdefault(relic, {})[band] = (
                relic_by_distance_band.setdefault(relic, {}).get(band, 0) + 1
            )

    opening = {}
    for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
        state = initial_state(config, first_actor=first_actor, mirrored=mirrored)
        forced = [action_key(action) for action in legal_actions(state, config)
                  if can_force_win(apply_action(state, action, config), first_actor, config.opening_search_depth - 1, config)]
        opening[first_actor] = {"mirrored": mirrored, "forcedWinActionsWithinDepth": forced}

    return {
        "schemaVersion": 2,
        "configId": config.identifier,
        "label": config.label,
        "analysisStatus": config.analysis_status,
        "sourceRulesetId": config.source_ruleset_id,
        "authorityFixture": config.authority_fixture,
        "assumptions": list(config.assumptions),
        "policyLimitations": [
            "Every in-band cast is an ideal direct hit; terrain, trajectory, aim error, splash, and projectile collision are excluded.",
            "Policies are transparent deterministic heuristics. The bounded search is not a proof that real players or the Loomkeeper will choose the same action.",
            "Only current move-and-cast and the explicitly configured abstract action economy are modelled; no defense or overtime mechanic is active unless a later candidate adds one.",
        ],
        "tacticalCore": {
            "seamPin": None if config.seam_pin is None else {
                "relicId": config.seam_pin.relic_id,
                "maximumSeparationIncrease": config.seam_pin.maximum_separation_increase,
                "targetTurns": config.seam_pin.target_turns,
                "cooldownActorTurns": config.seam_pin.cooldown_actor_turns,
                "activation": config.seam_pin.activation,
                "retreatCastRule": config.seam_pin.retreat_cast_rule,
            },
            "escapeSlack": None if config.escape_slack is None else {
                "perActor": config.escape_slack.per_actor,
            },
        },
        "policySets": {
            "primaryMatrix": list(BASE_POLICY_NAMES),
            "candidateOnlyProbe": [SEAM_PIN_POLICY] if config.seam_pin is not None else [],
        },
        "aggregate": {
            "matchCount": len(matches),
            "firstActorWins": first_actor_wins,
            "firstActorWinRate": first_actor_wins / len(matches),
            "averageTurns": total_turns / len(matches),
            "terminalReasons": terminal_reasons,
            "actionCounts": action_counts,
            "relicUseByDistanceBand": relic_by_distance_band,
            "directCastDominance": direct_cast_dominance(config),
            "openingSearch": opening,
        },
        "candidatePolicyProbes": candidate_policy_probes,
        "matches": matches,
    }


def distance_band(value: int, config: TacticalConfig) -> str:
    maximum = max(relic.maximum_range for relic in config.relics)
    if value > maximum:
        return "outside_all_relic_ranges"
    quarter = max(1, maximum // 4)
    if value <= quarter:
        return "0_25_percent_of_longest_range"
    if value <= quarter * 2:
        return "25_50_percent_of_longest_range"
    if value <= quarter * 3:
        return "50_75_percent_of_longest_range"
    return "75_100_percent_of_longest_range"


def direct_cast_dominance(config: TacticalConfig) -> list[dict[str, Any]]:
    """Report only same-state ideal-direct-cast dominance, not full-game dominance."""

    findings: list[dict[str, Any]] = []
    for dominated in config.relics:
        for dominator in config.relics:
            if dominated == dominator:
                continue
            envelope_superset = (
                dominator.minimum_range <= dominated.minimum_range and
                dominator.maximum_range >= dominated.maximum_range
            )
            damage_superset = dominator.direct_damage >= dominated.direct_damage
            strictly_better = (
                dominator.minimum_range < dominated.minimum_range or
                dominator.maximum_range > dominated.maximum_range or
                dominator.direct_damage > dominated.direct_damage
            )
            if envelope_superset and damage_superset and strictly_better:
                findings.append({
                    "dominator": dominator.identifier,
                    "dominated": dominated.identifier,
                    "basis": "ideal_direct_cast_only",
                })
    return findings


def can_force_win(state: TacticalState, perspective: Actor, depth: int, config: TacticalConfig) -> bool:
    """Bounded, deterministic forced-win test; it intentionally has no heuristic leaf score."""

    @lru_cache(maxsize=None)
    def visit(cached_state: TacticalState, remaining_depth: int) -> bool:
        if cached_state.finished:
            return cached_state.winner == perspective
        if remaining_depth <= 0:
            return False
        outcomes = tuple(visit(apply_action(cached_state, action, config), remaining_depth - 1)
                         for action in legal_actions(cached_state, config))
        return any(outcomes) if cached_state.active_actor == perspective else all(outcomes)

    return visit(state, depth)


def actor_state(state: TacticalState, actor: Actor) -> ActorState:
    return state.player if actor == "player" else state.loomkeeper


def replace_actor(state: TacticalState, actor: Actor, next_actor_state: ActorState) -> TacticalState:
    return replace(state, player=next_actor_state) if actor == "player" else replace(state, loomkeeper=next_actor_state)


def other_actor(actor: Actor) -> Actor:
    return "loomkeeper" if actor == "player" else "player"


def _is_seam_pin_cast(action: Action, config: TacticalConfig) -> bool:
    return (
        action.kind == "cast" and
        config.seam_pin is not None and
        action.relic_id == config.seam_pin.relic_id
    )


def _seam_pin_is_on_cooldown(state: TacticalState, actor: Actor, relic_id: str, config: TacticalConfig) -> bool:
    return (
        config.seam_pin is not None and
        relic_id == config.seam_pin.relic_id and
        actor_state(state, actor).seam_pin_cooldown > 0
    )


def _seam_pin_forbids_retreat_cast(
    before_movement: TacticalState,
    after_movement: TacticalState,
    relic_id: str,
    config: TacticalConfig,
) -> bool:
    return (
        config.seam_pin is not None and
        relic_id == config.seam_pin.relic_id and
        config.seam_pin.retreat_cast_rule == "forbidden" and
        distance(after_movement) > distance(before_movement)
    )


def _apply_seam_pin_if_configured(
    state: TacticalState,
    caster: Actor,
    target: Actor,
    relic: Relic,
    *,
    before_movement: TacticalState,
    after_movement: TacticalState,
    config: TacticalConfig,
) -> TacticalState:
    if config.seam_pin is None or relic.identifier != config.seam_pin.relic_id:
        return state
    if (
        config.seam_pin.activation == "advance_only" and
        distance(after_movement) >= distance(before_movement)
    ):
        return state
    target_state = actor_state(state, target)
    caster_state = actor_state(state, caster)
    pinned_target = replace(
        target_state,
        seam_pin_source=caster,
        seam_pin_turns=config.seam_pin.target_turns,
    )
    cooled_caster = replace(caster_state, seam_pin_cooldown=config.seam_pin.cooldown_actor_turns)
    return replace_actor(replace_actor(state, target, pinned_target), caster, cooled_caster)


def _complete_active_actor_turn(state: TacticalState, actor: Actor) -> TacticalState:
    """Expire the active actor's own temporary state after that actor acts."""

    current = actor_state(state, actor)
    next_turns = max(0, current.seam_pin_turns - 1)
    completed = replace(
        current,
        seam_pin_source=current.seam_pin_source if next_turns else None,
        seam_pin_turns=next_turns,
        seam_pin_cooldown=max(0, current.seam_pin_cooldown - 1),
    )
    return replace_actor(state, actor, completed)


def _move_actor(state: TacticalState, actor: Actor, direction: int, config: TacticalConfig) -> TacticalState:
    if direction not in (-1, 0, 1):
        raise TacticalModelError("Direction must be -1, 0, or 1")
    if direction == 0:
        return state
    current = actor_state(state, actor)
    opponent = actor_state(state, other_actor(actor))
    minimum = config.actor_margin
    maximum = config.world_width - config.actor_margin
    candidate = max(minimum, min(maximum, current.x + direction * config.movement_per_turn))
    separation = config.actor_margin * 2
    if current.x < opponent.x:
        candidate = min(candidate, opponent.x - separation)
    else:
        candidate = max(candidate, opponent.x + separation)
    if current.seam_pin_turns > 0:
        if config.seam_pin is None:
            raise TacticalModelError("Active Seam Pin state requires a configured candidate")
        current_distance = abs(current.x - opponent.x)
        maximum_distance = current_distance + config.seam_pin.maximum_separation_increase
        if current.x < opponent.x:
            candidate = max(candidate, opponent.x - maximum_distance)
        else:
            candidate = min(candidate, opponent.x + maximum_distance)
    current_distance = abs(current.x - opponent.x)
    escape_slack_remaining = current.escape_slack_remaining
    if config.escape_slack is not None:
        maximum_distance = current_distance + current.escape_slack_remaining
        if current.x < opponent.x:
            candidate = max(candidate, opponent.x - maximum_distance)
        else:
            candidate = min(candidate, opponent.x + maximum_distance)
        separation_increase = max(0, abs(candidate - opponent.x) - current_distance)
        escape_slack_remaining -= separation_increase
    return replace_actor(state, actor, replace(
        current,
        x=candidate,
        escape_slack_remaining=escape_slack_remaining,
    ))


def _select_best(actions: tuple[Action, ...], score: Any) -> Action:
    values = [(score(action), action) for action in actions]
    best_score = max(value for value, _ in values)
    return min((action for value, action in values if value == best_score), key=action_key)


def _select_relocation_toward(actions: tuple[Action, ...], state: TacticalState, config: TacticalConfig) -> Action:
    return _select_relocation_to_distance(actions, state, config, 0)


def _select_relocation_away(actions: tuple[Action, ...], state: TacticalState, config: TacticalConfig) -> Action:
    relocations = tuple(action for action in actions if action.kind == "relocate")
    if not relocations:
        return min(actions, key=action_key)
    return _select_best(relocations, lambda action: (distance(_move_actor(state, state.active_actor, action.direction, config)),))


def _select_relocation_to_distance(
    actions: tuple[Action, ...], state: TacticalState, config: TacticalConfig, target_distance: int
) -> Action:
    relocations = tuple(action for action in actions if action.kind == "relocate")
    if not relocations:
        return min(actions, key=action_key)
    return _select_best(relocations, lambda action: (-abs(
        distance(_move_actor(state, state.active_actor, action.direction, config)) - target_distance
    ),))


def _largest_legal_damage_for_actor(state: TacticalState, actor: Actor, config: TacticalConfig) -> int:
    if state.active_actor == actor:
        candidate_state = state
    else:
        candidate_state = replace(state, active_actor=actor)
    return max((config.relic(action.relic_id or "").direct_damage
                for action in legal_actions(candidate_state, config) if action.kind == "cast"), default=0)


def _best_response_action(state: TacticalState, config: TacticalConfig) -> Action:
    actor = state.active_actor
    choices = legal_actions(state, config)

    def score(action: Action) -> tuple[int, int]:
        after = apply_action(state, action, config)
        if after.finished:
            return (1_000_000 if after.winner == actor else -1_000_000, 0)
        reply = choose_action("range_pressure", after, config)
        replied = apply_action(after, reply, config)
        own = actor_state(replied, actor).stitching
        opponent = actor_state(replied, other_actor(actor)).stitching
        return ((own - opponent) * 1_000, -distance(replied))

    return _select_best(choices, score)


def _load_json(path: Path) -> dict[str, Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise TacticalModelError(f"Missing JSON file: {path}") from error
    except json.JSONDecodeError as error:
        raise TacticalModelError(f"Invalid JSON file {path}: {error}") from error
    return _require_object(raw, str(path))


def _require_exact_keys(raw: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(raw.keys())
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise TacticalModelError(f"{label}: unexpected schema keys missing={missing} extra={extra}")


def _require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TacticalModelError(f"{label}: expected object")
    return value


def _require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise TacticalModelError(f"{label}: expected array")
    return value


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise TacticalModelError(f"{label}: expected non-empty string")
    return value


def _require_positive_integer(value: Any, label: str, *, allow_zero: bool = False) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < (0 if allow_zero else 1):
        raise TacticalModelError(f"{label}: expected bounded integer")
    return value


def _require_actor(value: Any, label: str) -> Actor:
    if value not in ("player", "loomkeeper"):
        raise TacticalModelError(f"{label}: expected player or loomkeeper")
    return value


def _require_action_economy(value: Any, label: str) -> ActionEconomy:
    if value not in ("move_and_cast", "committed"):
        raise TacticalModelError(f"{label}: expected move_and_cast or committed")
    return value


def _require_seam_pin_activation(value: Any, label: str) -> SeamPinActivation:
    if value not in ("any_direct_hit", "advance_only"):
        raise TacticalModelError(f"{label}: expected any_direct_hit or advance_only")
    return value


def _require_retreat_cast_rule(value: Any, label: str) -> RetreatCastRule:
    if value not in ("allowed", "forbidden"):
        raise TacticalModelError(f"{label}: expected allowed or forbidden")
    return value
