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
ActionKind = Literal["cast", "relocate", "brace", "prepare_spoolburst", "unweave_spoolburst", "wait"]
ActionEconomy = Literal["move_and_cast", "committed"]
SeamPinActivation = Literal["any_direct_hit", "advance_only"]
RetreatCastRule = Literal["allowed", "forbidden"]

CONFIG_SCHEMA_VERSIONS = {1, 2, 3, 4, 5, 6, 7, 8, 9}
RELIC_ORDER = ("threadball", "needlepoint", "spoolburst")
BASE_POLICY_NAMES = (
    "range_pressure",
    "medium_hold",
    "short_approach",
    "retreat_kite",
    "best_response",
)
SEAM_PIN_POLICY = "seam_pin_pressure"
BRACE_POLICY = "brace_counter"


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
class Brace:
    """One-use, public damage-reduction stance for an exploratory defensive candidate."""

    damage_reduction_percent: int
    uses_per_actor: int


@dataclass(frozen=True)
class SpoolburstBacklash:
    """A self-Stitching cost paid by an exploratory heavy short-range Relic."""

    self_stitching_cost: int


@dataclass(frozen=True)
class SpoolburstPreparation:
    """A visible one-turn charge that a named medium Relic can disrupt."""

    relic_id: str
    preparation_turns: int
    disruption_relic_id: str


@dataclass(frozen=True)
class SpoolburstCocoon:
    """A one-hit charge guard and a separate no-damage Threadball counterspell."""

    absorbed_relic_ids: tuple[str, ...]
    unweave_relic_id: str


@dataclass(frozen=True)
class SpoolburstThreadback:
    """A no-damage Unweave that pays one full existing Escape-Slack step.

    This is analysis-only. It makes a successful cancellation reorganize the
    board rather than returning the duel to a protected-equivalent state.
    """

    unweave_relic_id: str
    separation_increase: int


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
    brace: Brace | None = None
    spoolburst_backlash: SpoolburstBacklash | None = None
    spoolburst_preparation: SpoolburstPreparation | None = None
    spoolburst_cocoon: SpoolburstCocoon | None = None
    spoolburst_threadback: SpoolburstThreadback | None = None

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
    brace_turns: int = 0
    brace_uses_remaining: int = 0
    spoolburst_preparation_turns: int = 0
    spoolburst_cocoon_hits_remaining: int = 0


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
    if schema_version in {2, 3, 4, 5, 6, 7, 8, 9}:
        tactical_core = _require_object(raw["tactical_core"], f"{path}.tactical_core")
        _require_exact_keys(
            tactical_core,
            (
                {"seam_pin"}
                if schema_version in {2, 3}
                else {"seam_pin", "escape_slack"}
                if schema_version == 4
                else {"seam_pin", "escape_slack", "brace"}
                if schema_version == 5
                else {"seam_pin", "escape_slack", "spoolburst_backlash"}
                if schema_version == 6
                else {"seam_pin", "escape_slack", "spoolburst_preparation"}
                if schema_version == 7
                else {"seam_pin", "escape_slack", "spoolburst_preparation", "spoolburst_cocoon"}
                if schema_version == 8
                else {"seam_pin", "escape_slack", "spoolburst_preparation", "spoolburst_threadback"}
            ),
            f"{path}.tactical_core",
        )
        seam_pin_raw = _require_object(tactical_core["seam_pin"], f"{path}.tactical_core.seam_pin")
        seam_pin_keys = {"relic_id", "maximum_separation_increase", "target_turns", "cooldown_actor_turns"}
        if schema_version in {3, 4, 5, 6, 7, 8, 9}:
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
    if schema_version in {4, 5, 6, 7, 8, 9}:
        escape_slack_raw = _require_object(raw["tactical_core"]["escape_slack"], f"{path}.tactical_core.escape_slack")
        _require_exact_keys(escape_slack_raw, {"per_actor"}, f"{path}.tactical_core.escape_slack")
        escape_slack = EscapeSlack(
            per_actor=_require_positive_integer(
                escape_slack_raw["per_actor"], f"{path}.tactical_core.escape_slack.per_actor", allow_zero=True
            )
        )

    brace: Brace | None = None
    if schema_version == 5:
        brace_raw = _require_object(raw["tactical_core"]["brace"], f"{path}.tactical_core.brace")
        _require_exact_keys(
            brace_raw,
            {"damage_reduction_percent", "uses_per_actor"},
            f"{path}.tactical_core.brace",
        )
        damage_reduction_percent = _require_positive_integer(
            brace_raw["damage_reduction_percent"],
            f"{path}.tactical_core.brace.damage_reduction_percent",
        )
        if damage_reduction_percent >= 100:
            raise TacticalModelError(f"{path}.tactical_core.brace.damage_reduction_percent: expected below 100")
        brace = Brace(
            damage_reduction_percent=damage_reduction_percent,
            uses_per_actor=_require_positive_integer(
                brace_raw["uses_per_actor"], f"{path}.tactical_core.brace.uses_per_actor"
            ),
        )

    spoolburst_backlash: SpoolburstBacklash | None = None
    if schema_version == 6:
        backlash_raw = _require_object(
            raw["tactical_core"]["spoolburst_backlash"],
            f"{path}.tactical_core.spoolburst_backlash",
        )
        _require_exact_keys(
            backlash_raw,
            {"self_stitching_cost"},
            f"{path}.tactical_core.spoolburst_backlash",
        )
        spoolburst_backlash = SpoolburstBacklash(
            self_stitching_cost=_require_positive_integer(
                backlash_raw["self_stitching_cost"],
                f"{path}.tactical_core.spoolburst_backlash.self_stitching_cost",
            )
        )

    spoolburst_preparation: SpoolburstPreparation | None = None
    if schema_version in {7, 8, 9}:
        preparation_raw = _require_object(
            raw["tactical_core"]["spoolburst_preparation"],
            f"{path}.tactical_core.spoolburst_preparation",
        )
        _require_exact_keys(
            preparation_raw,
            {"relic_id", "preparation_turns", "disruption_relic_id"},
            f"{path}.tactical_core.spoolburst_preparation",
        )
        relic_id = _require_string(
            preparation_raw["relic_id"], f"{path}.tactical_core.spoolburst_preparation.relic_id"
        )
        disruption_relic_id = _require_string(
            preparation_raw["disruption_relic_id"],
            f"{path}.tactical_core.spoolburst_preparation.disruption_relic_id",
        )
        if relic_id != "spoolburst" or disruption_relic_id != "threadball":
            raise TacticalModelError(
                f"{path}.tactical_core.spoolburst_preparation: requires Spoolburst prepared by Threadball disruption"
            )
        spoolburst_preparation = SpoolburstPreparation(
            relic_id=relic_id,
            preparation_turns=_require_positive_integer(
                preparation_raw["preparation_turns"],
                f"{path}.tactical_core.spoolburst_preparation.preparation_turns",
            ),
            disruption_relic_id=disruption_relic_id,
        )

    spoolburst_cocoon: SpoolburstCocoon | None = None
    if schema_version == 8:
        cocoon_raw = _require_object(
            raw["tactical_core"]["spoolburst_cocoon"],
            f"{path}.tactical_core.spoolburst_cocoon",
        )
        _require_exact_keys(
            cocoon_raw,
            {"absorbed_relic_ids", "unweave_relic_id"},
            f"{path}.tactical_core.spoolburst_cocoon",
        )
        absorbed_relic_ids = tuple(
            _require_string(
                item,
                f"{path}.tactical_core.spoolburst_cocoon.absorbed_relic_ids[{index}]",
            )
            for index, item in enumerate(
                _require_list(
                    cocoon_raw["absorbed_relic_ids"],
                    f"{path}.tactical_core.spoolburst_cocoon.absorbed_relic_ids",
                )
            )
        )
        unweave_relic_id = _require_string(
            cocoon_raw["unweave_relic_id"],
            f"{path}.tactical_core.spoolburst_cocoon.unweave_relic_id",
        )
        if absorbed_relic_ids != ("needlepoint", "spoolburst") or unweave_relic_id != "threadball":
            raise TacticalModelError(
                f"{path}.tactical_core.spoolburst_cocoon: requires Needlepoint/Spoolburst absorption and Threadball Unweave"
            )
        spoolburst_cocoon = SpoolburstCocoon(
            absorbed_relic_ids=absorbed_relic_ids,
            unweave_relic_id=unweave_relic_id,
        )

    spoolburst_threadback: SpoolburstThreadback | None = None
    if schema_version == 9:
        threadback_raw = _require_object(
            raw["tactical_core"]["spoolburst_threadback"],
            f"{path}.tactical_core.spoolburst_threadback",
        )
        _require_exact_keys(
            threadback_raw,
            {"unweave_relic_id", "separation_increase"},
            f"{path}.tactical_core.spoolburst_threadback",
        )
        unweave_relic_id = _require_string(
            threadback_raw["unweave_relic_id"],
            f"{path}.tactical_core.spoolburst_threadback.unweave_relic_id",
        )
        separation_increase = _require_positive_integer(
            threadback_raw["separation_increase"],
            f"{path}.tactical_core.spoolburst_threadback.separation_increase",
        )
        if unweave_relic_id != "threadball":
            raise TacticalModelError(
                f"{path}.tactical_core.spoolburst_threadback: requires Threadball Unweave"
            )
        if separation_increase > _require_positive_integer(
            turn["movement_per_turn"], f"{path}.turn.movement_per_turn"
        ):
            raise TacticalModelError(
                f"{path}.tactical_core.spoolburst_threadback: separation increase exceeds movement budget"
            )
        spoolburst_threadback = SpoolburstThreadback(
            unweave_relic_id=unweave_relic_id,
            separation_increase=separation_increase,
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
        brace=brace,
        spoolburst_backlash=spoolburst_backlash,
        spoolburst_preparation=spoolburst_preparation,
        spoolburst_cocoon=spoolburst_cocoon,
        spoolburst_threadback=spoolburst_threadback,
    )
    if not (config.actor_margin <= config.player_x < config.world_width - config.actor_margin):
        raise TacticalModelError(f"{path}: player spawn lies outside legal world bounds")
    if not (config.actor_margin <= config.loomkeeper_x < config.world_width - config.actor_margin):
        raise TacticalModelError(f"{path}: Loomkeeper spawn lies outside legal world bounds")
    if abs(config.player_x - config.loomkeeper_x) < config.actor_margin * 2:
        raise TacticalModelError(f"{path}: initial actors overlap")
    if (
        config.spoolburst_backlash is not None and
        config.spoolburst_backlash.self_stitching_cost >= config.maximum_stitching
    ):
        raise TacticalModelError(
            f"{path}.tactical_core.spoolburst_backlash: cost must leave a full-Stitching actor able to cast"
        )
    if config.spoolburst_cocoon is not None and config.spoolburst_preparation is None:
        raise TacticalModelError(f"{path}.tactical_core.spoolburst_cocoon: requires Spoolburst preparation")
    if config.spoolburst_threadback is not None:
        if config.spoolburst_preparation is None:
            raise TacticalModelError(f"{path}.tactical_core.spoolburst_threadback: requires Spoolburst preparation")
        if config.escape_slack is None:
            raise TacticalModelError(f"{path}.tactical_core.spoolburst_threadback: requires Escape Slack")
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


def initial_state(
    config: TacticalConfig,
    *,
    first_actor: Actor | None = None,
    mirrored: bool = False,
    starting_distance: int | None = None,
) -> TacticalState:
    """Create either the authority-bound spawn or one centered analytical distance scenario."""

    if starting_distance is None:
        player_x = config.player_x
        loomkeeper_x = config.loomkeeper_x
    else:
        _require_starting_distance(starting_distance, config)
        player_x = (config.world_width - starting_distance) // 2
        loomkeeper_x = player_x + starting_distance
    if mirrored:
        player_x = config.world_width - player_x
        loomkeeper_x = config.world_width - loomkeeper_x
    escape_slack = config.escape_slack.per_actor if config.escape_slack is not None else 0
    brace_uses = config.brace.uses_per_actor if config.brace is not None else 0
    return TacticalState(
        player=ActorState(
            player_x,
            config.maximum_stitching,
            escape_slack_remaining=escape_slack,
            brace_uses_remaining=brace_uses,
        ),
        loomkeeper=ActorState(
            loomkeeper_x,
            config.maximum_stitching,
            escape_slack_remaining=escape_slack,
            brace_uses_remaining=brace_uses,
        ),
        active_actor=first_actor or config.default_first_actor,
        completed_turns=0,
    )


def distance(state: TacticalState) -> int:
    return abs(state.player.x - state.loomkeeper.x)


def tactical_state_key(state: TacticalState) -> tuple[Any, ...]:
    """Return the tactical cut used by the recurrence gate.

    Completed-turn count is deliberately excluded: a timeout counter does not
    constitute tactical progress. Positions, Stitching, temporary commitments,
    and all bounded reserves stay in the key, so a repeated key means the
    analysis has re-entered the same non-terminal tactical situation.
    """

    def actor_key(actor: ActorState) -> tuple[Any, ...]:
        return (
            actor.x,
            actor.stitching,
            actor.seam_pin_source,
            actor.seam_pin_turns,
            actor.seam_pin_cooldown,
            actor.escape_slack_remaining,
            actor.brace_turns,
            actor.brace_uses_remaining,
            actor.spoolburst_preparation_turns,
            actor.spoolburst_cocoon_hits_remaining,
        )

    return (state.active_actor, actor_key(state.player), actor_key(state.loomkeeper))


def tactical_state_snapshot(state: TacticalState) -> dict[str, Any]:
    """Make the recurrence witness readable without presenting it as runtime state."""

    def actor_snapshot(actor: ActorState) -> dict[str, Any]:
        return {
            "x": actor.x,
            "stitching": actor.stitching,
            "seamPinSource": actor.seam_pin_source,
            "seamPinTurns": actor.seam_pin_turns,
            "seamPinCooldown": actor.seam_pin_cooldown,
            "escapeSlack": actor.escape_slack_remaining,
            "braceTurns": actor.brace_turns,
            "braceUses": actor.brace_uses_remaining,
            "spoolburstPreparationTurns": actor.spoolburst_preparation_turns,
            "spoolburstCocoonHits": actor.spoolburst_cocoon_hits_remaining,
        }

    return {
        "activeActor": state.active_actor,
        "player": actor_snapshot(state.player),
        "loomkeeper": actor_snapshot(state.loomkeeper),
    }


def policy_names(config: TacticalConfig) -> tuple[str, ...]:
    candidate_policies: tuple[str, ...] = ()
    if config.seam_pin is not None:
        candidate_policies += (SEAM_PIN_POLICY,)
    if config.brace is not None:
        candidate_policies += (BRACE_POLICY,)
    return BASE_POLICY_NAMES + candidate_policies


def legal_actions(state: TacticalState, config: TacticalConfig) -> tuple[Action, ...]:
    if state.finished:
        return ()
    movement_directions = (0,) if config.action_economy == "committed" else (-1, 0, 1)
    actions: set[Action] = set()
    for relic in config.relics:
        cast_directions = (
            (0,)
            if _spoolburst_preparation_requires_stationary_release(relic, config)
            else movement_directions
        )
        for direction in cast_directions:
            moved_state = _move_actor(state, state.active_actor, direction, config)
            projected_distance = distance(moved_state)
            if _seam_pin_is_on_cooldown(state, state.active_actor, relic.identifier, config):
                continue
            if _spoolburst_preparation_prevents_cast(state, state.active_actor, relic.identifier, config):
                continue
            if _spoolburst_backlash_prevents_cast(state, state.active_actor, relic.identifier, config):
                continue
            if _seam_pin_forbids_retreat_cast(state, moved_state, relic.identifier, config):
                continue
            if relic.minimum_range <= projected_distance <= relic.maximum_range:
                actions.add(Action("cast", direction, relic.identifier))
    if (
        config.spoolburst_preparation is not None and
        actor_state(state, state.active_actor).spoolburst_preparation_turns == 0
    ):
        preparation_relic = config.relic(config.spoolburst_preparation.relic_id)
        for direction in movement_directions:
            moved_state = _move_actor(state, state.active_actor, direction, config)
            if preparation_relic.minimum_range <= distance(moved_state) <= preparation_relic.maximum_range:
                actions.add(Action("prepare_spoolburst", direction))
    unweave_relic_id = _spoolburst_unweave_relic_id(config)
    if (
        unweave_relic_id is not None and
        actor_state(state, other_actor(state.active_actor)).spoolburst_preparation_turns > 0
    ):
        unweave_relic = config.relic(unweave_relic_id)
        if config.spoolburst_threadback is not None:
            if _threadback_is_legal(state, state.active_actor, config):
                actions.add(Action("unweave_spoolburst", 0, unweave_relic.identifier))
        else:
            for direction in movement_directions:
                moved_state = _move_actor(state, state.active_actor, direction, config)
                if unweave_relic.minimum_range <= distance(moved_state) <= unweave_relic.maximum_range:
                    actions.add(Action("unweave_spoolburst", direction, unweave_relic.identifier))
    for direction in (-1, 1):
        if _move_actor(state, state.active_actor, direction, config) != state:
            actions.add(Action("relocate", direction))
    if config.brace is not None and actor_state(state, state.active_actor).brace_uses_remaining > 0:
        actions.add(Action("brace"))
    if not actions:
        actions.add(Action("wait"))
    return tuple(sorted(actions, key=action_key))


def apply_action(state: TacticalState, action: Action, config: TacticalConfig) -> TacticalState:
    if action not in legal_actions(state, config):
        raise TacticalModelError(f"Illegal tactical action: {action_key(action)}")
    if state.finished:
        raise TacticalModelError("Cannot act after a terminal result")

    if action.kind in ("wait", "brace"):
        moved_state = state
    elif action.kind == "unweave_spoolburst" and config.spoolburst_threadback is not None:
        moved_state = _apply_threadback(state, state.active_actor, config)
    else:
        moved_state = _move_actor(state, state.active_actor, action.direction, config)

    # Movement observes any active tether. Its holder spends/clears that tether
    # only after the action completes; the tether caster's cooldown also counts
    # only their own completed turns.
    next_state = _complete_active_actor_turn(moved_state, state.active_actor)
    if action.kind == "brace":
        if config.brace is None:
            raise TacticalModelError("Brace action requires a configured candidate")
        braced_actor = actor_state(next_state, state.active_actor)
        next_state = replace_actor(
            next_state,
            state.active_actor,
            replace(
                braced_actor,
                brace_turns=1,
                brace_uses_remaining=braced_actor.brace_uses_remaining - 1,
            ),
        )
    else:
        target = other_actor(state.active_actor)
        target_state = actor_state(next_state, target)
        target_is_braced = target_state.brace_turns > 0
        if action.kind == "cast":
            assert action.relic_id is not None
            relic = config.relic(action.relic_id)
            if not relic.minimum_range <= distance(next_state) <= relic.maximum_range:
                raise TacticalModelError("Cast left its declared range band")
            damage = relic.direct_damage
            cocoon_absorbs = _spoolburst_cocoon_absorbs_cast(target_state, relic, config)
            if cocoon_absorbs:
                damage = 0
            if target_is_braced:
                if config.brace is None:
                    raise TacticalModelError("Active Brace state requires a configured candidate")
                damage = damage * (100 - config.brace.damage_reduction_percent) // 100
            next_state = replace_actor(
                next_state,
                target,
                replace(
                    target_state,
                    stitching=max(0, target_state.stitching - damage),
                    brace_turns=0,
                    spoolburst_preparation_turns=(
                        0
                        if (
                            config.spoolburst_cocoon is None and
                            config.spoolburst_threadback is None and
                            _is_spoolburst_preparation_disruption(relic, config)
                        )
                        else target_state.spoolburst_preparation_turns
                    ),
                    spoolburst_cocoon_hits_remaining=(
                        target_state.spoolburst_cocoon_hits_remaining - 1
                        if cocoon_absorbs else target_state.spoolburst_cocoon_hits_remaining
                    ),
                ),
            )
            next_state = _apply_spoolburst_backlash_if_configured(
                next_state,
                state.active_actor,
                relic,
                config,
            )
            if actor_state(state, state.active_actor).spoolburst_preparation_turns > 0:
                caster_state = actor_state(next_state, state.active_actor)
                next_state = replace_actor(
                    next_state,
                    state.active_actor,
                    replace(caster_state, spoolburst_cocoon_hits_remaining=0),
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
        elif action.kind == "prepare_spoolburst":
            if config.spoolburst_preparation is None:
                raise TacticalModelError("Spoolburst preparation requires a configured candidate")
            caster_state = actor_state(next_state, state.active_actor)
            next_state = replace_actor(
                next_state,
                state.active_actor,
                replace(
                    caster_state,
                    spoolburst_preparation_turns=config.spoolburst_preparation.preparation_turns,
                    spoolburst_cocoon_hits_remaining=1 if config.spoolburst_cocoon is not None else 0,
                ),
            )
            if target_is_braced:
                next_state = replace_actor(next_state, target, replace(target_state, brace_turns=0))
        elif action.kind == "unweave_spoolburst":
            unweave_relic_id = _spoolburst_unweave_relic_id(config)
            if unweave_relic_id is None:
                raise TacticalModelError("Spoolburst Unweave requires a configured counter candidate")
            if action.relic_id != unweave_relic_id:
                raise TacticalModelError("Spoolburst Unweave requires the configured Threadball Relic")
            next_state = replace_actor(
                next_state,
                target,
                replace(
                    target_state,
                    brace_turns=0,
                    spoolburst_preparation_turns=0,
                    spoolburst_cocoon_hits_remaining=0,
                ),
            )
        elif target_is_braced:
            next_state = replace_actor(next_state, target, replace(target_state, brace_turns=0))

    if (
        action.kind != "prepare_spoolburst" and
        actor_state(state, state.active_actor).spoolburst_preparation_turns > 0
    ):
        caster_state = actor_state(next_state, state.active_actor)
        next_state = replace_actor(
            next_state,
            state.active_actor,
            replace(caster_state, spoolburst_cocoon_hits_remaining=0),
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
        unweave = tuple(action for action in actions if action.kind == "unweave_spoolburst")
        if unweave:
            return _select_best(unweave, lambda action: (-abs(action.direction),))
        threadball = tuple(action for action in casts if action.relic_id == "threadball")
        if threadball:
            return _select_best(threadball, lambda action: (-abs(distance(_move_actor(state, actor, action.direction, config)) - config.relic("threadball").maximum_range), -abs(action.direction)))
        return _select_relocation_to_distance(actions, state, config, config.relic("threadball").maximum_range)

    if policy == "short_approach":
        spoolburst = tuple(action for action in casts if action.relic_id == "spoolburst")
        if spoolburst:
            return _select_best(spoolburst, lambda action: (-abs(action.direction),))
        preparations = tuple(action for action in actions if action.kind == "prepare_spoolburst")
        if preparations:
            return _select_best(preparations, lambda action: (-abs(action.direction),))
        return _select_relocation_to_distance(actions, state, config, config.relic("spoolburst").maximum_range)

    if policy == "retreat_kite":
        opponent_damage = _largest_legal_damage_for_actor(state, other_actor(actor), config)
        relocations = tuple(action for action in actions if action.kind == "relocate")
        separating_relocations = tuple(
            action for action in relocations
            if distance(_move_actor(state, actor, action.direction, config)) > distance(state)
        )
        if opponent_damage > 0 and separating_relocations:
            return _select_best(
                separating_relocations,
                lambda action: (distance(_move_actor(state, actor, action.direction, config)),),
            )
        if casts:
            return _select_best(casts, lambda action: (
                config.relic(action.relic_id or "").maximum_range,
                -abs(action.direction),
            ))
        return _select_relocation_away(actions, state, config)

    if policy == BRACE_POLICY:
        brace_action = next((action for action in actions if action.kind == "brace"), None)
        opponent_damage = _largest_legal_damage_for_actor(state, other_actor(actor), config)
        own_stitching = actor_state(state, actor).stitching
        if brace_action is not None and config.brace is not None:
            braced_damage = opponent_damage * (100 - config.brace.damage_reduction_percent) // 100
            if opponent_damage >= own_stitching and braced_damage < own_stitching:
                return brace_action
        return _best_response_action(state, config)

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
    starting_distance: int | None = None,
) -> dict[str, Any]:
    state = initial_state(
        config,
        first_actor=first_actor,
        mirrored=mirrored,
        starting_distance=starting_distance,
    )
    initial_distance = distance(state)
    trace: list[dict[str, Any]] = []
    seen_tactical_states: dict[tuple[Any, ...], dict[str, Any]] = {
        tactical_state_key(state): {
            "afterCompletedTurns": state.completed_turns,
            "snapshot": tactical_state_snapshot(state),
        }
    }
    recurrence: dict[str, Any] | None = None
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
            "actorBacklashDamage": actor_state(before, actor).stitching - actor_state(state, actor).stitching,
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
            "playerBraceTurns": state.player.brace_turns,
            "loomkeeperBraceTurns": state.loomkeeper.brace_turns,
            "playerBraceUses": state.player.brace_uses_remaining,
            "loomkeeperBraceUses": state.loomkeeper.brace_uses_remaining,
            "playerSpoolburstPreparationTurns": state.player.spoolburst_preparation_turns,
            "loomkeeperSpoolburstPreparationTurns": state.loomkeeper.spoolburst_preparation_turns,
            "playerSpoolburstCocoonHits": state.player.spoolburst_cocoon_hits_remaining,
            "loomkeeperSpoolburstCocoonHits": state.loomkeeper.spoolburst_cocoon_hits_remaining,
            "spoolburstPreparationStartedBy": actor if (
                actor_state(before, actor).spoolburst_preparation_turns == 0 and
                actor_state(state, actor).spoolburst_preparation_turns > 0
            ) else None,
            "spoolburstPreparationDisruptedFor": target if (
                actor_state(before, target).spoolburst_preparation_turns > 0 and
                actor_state(state, target).spoolburst_preparation_turns == 0 and
                action.kind == "cast" and
                action.relic_id == (
                    config.spoolburst_preparation.disruption_relic_id
                    if config.spoolburst_preparation is not None else None
                )
            ) else None,
            "spoolburstUnwovenFor": target if action.kind == "unweave_spoolburst" else None,
            "spoolburstThreadbackAppliedFor": actor if (
                action.kind == "unweave_spoolburst" and config.spoolburst_threadback is not None
            ) else None,
            "threadbackSeparationIncrease": (
                distance(state) - distance(before)
                if action.kind == "unweave_spoolburst" and config.spoolburst_threadback is not None
                else 0
            ),
            "spoolburstCocoonAbsorbedFor": target if (
                actor_state(before, target).spoolburst_cocoon_hits_remaining >
                actor_state(state, target).spoolburst_cocoon_hits_remaining
            ) else None,
        })
        if not state.finished:
            state_key = tactical_state_key(state)
            prior = seen_tactical_states.get(state_key)
            if recurrence is None and prior is not None:
                recurrence = {
                    "firstSeenAfterCompletedTurns": prior["afterCompletedTurns"],
                    "repeatedAfterCompletedTurns": state.completed_turns,
                    "cycleTurns": state.completed_turns - prior["afterCompletedTurns"],
                    "state": prior["snapshot"],
                }
            elif prior is None:
                seen_tactical_states[state_key] = {
                    "afterCompletedTurns": state.completed_turns,
                    "snapshot": tactical_state_snapshot(state),
                }
    return {
        "firstActor": first_actor,
        "mirrored": mirrored,
        "startingDistance": initial_distance,
        "playerPolicy": player_policy,
        "loomkeeperPolicy": loomkeeper_policy,
        "winner": state.winner,
        "finishReason": state.finish_reason,
        "turns": state.completed_turns,
        "nonterminalRecurrence": recurrence,
        "trace": trace,
    }


def run_experiment(config: TacticalConfig, *, starting_distance: int | None = None) -> dict[str, Any]:
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
                    starting_distance=starting_distance,
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
                    starting_distance=starting_distance,
                ))
    if config.brace is not None:
        for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
            for player_policy, loomkeeper_policy in (
                (BRACE_POLICY, "range_pressure"),
                ("range_pressure", BRACE_POLICY),
            ):
                candidate_policy_probes.append(simulate_match(
                    config, player_policy, loomkeeper_policy,
                    first_actor=first_actor, mirrored=mirrored,
                    starting_distance=starting_distance,
                ))

    first_actor_wins = sum(match["winner"] == match["firstActor"] for match in matches)
    recurrence_matches = [match for match in matches if match["nonterminalRecurrence"] is not None]
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
        state = initial_state(
            config,
            first_actor=first_actor,
            mirrored=mirrored,
            starting_distance=starting_distance,
        )
        forced = [action_key(action) for action in legal_actions(state, config)
                  if can_force_win(apply_action(state, action, config), first_actor, config.opening_search_depth - 1, config)]
        opening[first_actor] = {"mirrored": mirrored, "forcedWinActionsWithinDepth": forced}

    return {
        "schemaVersion": 3,
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
            "brace": None if config.brace is None else {
                "damageReductionPercent": config.brace.damage_reduction_percent,
                "usesPerActor": config.brace.uses_per_actor,
            },
            "spoolburstBacklash": None if config.spoolburst_backlash is None else {
                "relicId": "spoolburst",
                "selfStitchingCost": config.spoolburst_backlash.self_stitching_cost,
                "requiresStitchingAboveCost": True,
            },
            "spoolburstPreparation": None if config.spoolburst_preparation is None else {
                "relicId": config.spoolburst_preparation.relic_id,
                "preparationTurns": config.spoolburst_preparation.preparation_turns,
                "disruptionRelicId": config.spoolburst_preparation.disruption_relic_id,
            },
            "spoolburstCocoon": None if config.spoolburst_cocoon is None else {
                "absorbedRelicIds": list(config.spoolburst_cocoon.absorbed_relic_ids),
                "unweaveRelicId": config.spoolburst_cocoon.unweave_relic_id,
                "unweaveDamage": 0,
            },
            "spoolburstThreadback": None if config.spoolburst_threadback is None else {
                "unweaveRelicId": config.spoolburst_threadback.unweave_relic_id,
                "separationIncrease": config.spoolburst_threadback.separation_increase,
                "requiresFullEscapeSlack": True,
                "unweaveDamage": 0,
            },
        },
        "policySets": {
            "primaryMatrix": list(BASE_POLICY_NAMES),
            "candidateOnlyProbe": [
                policy for policy, active in (
                    (SEAM_PIN_POLICY, config.seam_pin is not None),
                    (BRACE_POLICY, config.brace is not None),
                ) if active
            ],
        },
        "startingScenario": {
            "kind": "authority_spawn" if starting_distance is None else "centered_distance",
            "startingDistance": distance(initial_state(config, starting_distance=starting_distance)),
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
        "tacticalVoyage": {
            "analysisLevel": "L4+ CRPM-inspired design lens; not a runtime rule or empirical player model.",
            "stateCut": "Active actor, both world positions, Stitching, temporary tactical states, and bounded reserves; completed-turn count is excluded.",
            "protectedFamily": [
                "A visible tactical commitment has a credible response.",
                "A response leaves a changed tactical state rather than a free non-terminal return.",
                "The fixed policy witness reaches an Unraveling result rather than relying on a turn limit.",
            ],
            "recurrenceGate": {
                "rule": "Reject a candidate when a fixed-policy witness repeats a non-terminal tactical state under the declared state cut.",
                "nonterminalRecurrenceMatchCount": len(recurrence_matches),
                "passesFixedWitness": not recurrence_matches,
                "witnesses": [
                    {
                        "firstActor": match["firstActor"],
                        "mirrored": match["mirrored"],
                        "playerPolicy": match["playerPolicy"],
                        "loomkeeperPolicy": match["loomkeeperPolicy"],
                        "startingDistance": match["startingDistance"],
                        "recurrence": match["nonterminalRecurrence"],
                    }
                    for match in recurrence_matches
                ],
            },
        },
        "candidatePolicyProbes": candidate_policy_probes,
        "matches": matches,
    }


def run_starting_distance_sweep(config: TacticalConfig, starting_distances: tuple[int, ...]) -> dict[str, Any]:
    """Run complete mirrored matrices over explicitly named centered distance scenarios."""

    if not starting_distances:
        raise TacticalModelError("Starting-distance sweep requires at least one scenario")
    if len(set(starting_distances)) != len(starting_distances):
        raise TacticalModelError("Starting-distance sweep must not repeat a scenario")
    for starting_distance in starting_distances:
        _require_starting_distance(starting_distance, config)

    scenario_reports = [
        run_experiment(config, starting_distance=starting_distance)
        for starting_distance in starting_distances
    ]
    matches = [match for report in scenario_reports for match in report["matches"]]
    first_actor_wins = sum(match["winner"] == match["firstActor"] for match in matches)
    terminal_reasons: dict[str, int] = {}
    for match in matches:
        terminal_reasons[match["finishReason"]] = terminal_reasons.get(match["finishReason"], 0) + 1

    return {
        "schemaVersion": 1,
        "reportKind": "starting_distance_sweep",
        "configId": config.identifier,
        "label": config.label,
        "analysisStatus": config.analysis_status,
        "sourceRulesetId": config.source_ruleset_id,
        "authorityFixture": config.authority_fixture,
        "startingDistances": list(starting_distances),
        "scenarioReports": scenario_reports,
        "aggregate": {
            "matchCount": len(matches),
            "firstActorWins": first_actor_wins,
            "firstActorWinRate": first_actor_wins / len(matches),
            "averageTurns": sum(match["turns"] for match in matches) / len(matches),
            "terminalReasons": terminal_reasons,
        },
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


def _spoolburst_preparation_prevents_cast(
    state: TacticalState,
    actor: Actor,
    relic_id: str,
    config: TacticalConfig,
) -> bool:
    return (
        config.spoolburst_preparation is not None and
        relic_id == config.spoolburst_preparation.relic_id and
        actor_state(state, actor).spoolburst_preparation_turns <= 0
    )


def _spoolburst_preparation_requires_stationary_release(relic: Relic, config: TacticalConfig) -> bool:
    return (
        config.spoolburst_preparation is not None and
        relic.identifier == config.spoolburst_preparation.relic_id
    )


def _is_spoolburst_preparation_disruption(relic: Relic, config: TacticalConfig) -> bool:
    return (
        config.spoolburst_preparation is not None and
        relic.identifier == config.spoolburst_preparation.disruption_relic_id
    )


def _spoolburst_unweave_relic_id(config: TacticalConfig) -> str | None:
    if config.spoolburst_cocoon is not None:
        return config.spoolburst_cocoon.unweave_relic_id
    if config.spoolburst_threadback is not None:
        return config.spoolburst_threadback.unweave_relic_id
    return None


def _threadback_direction(state: TacticalState, actor: Actor) -> int:
    """Return the one movement direction that increases separation."""

    return -1 if actor_state(state, actor).x < actor_state(state, other_actor(actor)).x else 1


def _threadback_is_legal(state: TacticalState, actor: Actor, config: TacticalConfig) -> bool:
    if config.spoolburst_threadback is None:
        return False
    current = actor_state(state, actor)
    if current.escape_slack_remaining < config.spoolburst_threadback.separation_increase:
        return False
    moved = _move_actor(state, actor, _threadback_direction(state, actor), config)
    return distance(moved) - distance(state) == config.spoolburst_threadback.separation_increase


def _apply_threadback(state: TacticalState, actor: Actor, config: TacticalConfig) -> TacticalState:
    if not _threadback_is_legal(state, actor, config):
        raise TacticalModelError("Threadback requires one full legal Escape-Slack separation step")
    return _move_actor(state, actor, _threadback_direction(state, actor), config)


def _spoolburst_cocoon_absorbs_cast(
    target_state: ActorState,
    relic: Relic,
    config: TacticalConfig,
) -> bool:
    return (
        config.spoolburst_cocoon is not None and
        target_state.spoolburst_cocoon_hits_remaining > 0 and
        relic.identifier in config.spoolburst_cocoon.absorbed_relic_ids
    )


def _spoolburst_backlash_prevents_cast(
    state: TacticalState,
    actor: Actor,
    relic_id: str,
    config: TacticalConfig,
) -> bool:
    """Keep the self-cost non-terminal: a legal cast must leave one Stitching."""

    return (
        config.spoolburst_backlash is not None and
        relic_id == "spoolburst" and
        actor_state(state, actor).stitching <= config.spoolburst_backlash.self_stitching_cost
    )


def _apply_spoolburst_backlash_if_configured(
    state: TacticalState,
    caster: Actor,
    relic: Relic,
    config: TacticalConfig,
) -> TacticalState:
    if config.spoolburst_backlash is None or relic.identifier != "spoolburst":
        return state
    caster_state = actor_state(state, caster)
    stitching = caster_state.stitching - config.spoolburst_backlash.self_stitching_cost
    if stitching < 1:
        raise TacticalModelError("A legal Spoolburst cast must leave the caster above zero Stitching")
    return replace_actor(state, caster, replace(caster_state, stitching=stitching))


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
        spoolburst_preparation_turns=max(0, current.spoolburst_preparation_turns - 1),
        spoolburst_cocoon_hits_remaining=(
            current.spoolburst_cocoon_hits_remaining
            if current.spoolburst_preparation_turns > 0 else 0
        ),
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


def _require_starting_distance(value: int, config: TacticalConfig) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TacticalModelError("Starting-distance scenario must be an integer")
    minimum = config.actor_margin * 2
    maximum = config.world_width - minimum
    if not minimum <= value <= maximum:
        raise TacticalModelError(
            f"Starting-distance scenario must be between {minimum} and {maximum} inclusive"
        )


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
