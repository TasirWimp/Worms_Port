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
RangeEntryDirectCastMode = Literal["commit_relocation"]
EntrySeamPinSuppression = Literal["pre_movement_out_of_range"]

CONFIG_SCHEMA_VERSIONS = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
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
THREADSTEP_POLICY = "threadstep_counter"
OPENING_WEAVE_POLICY = "opening_weave_counter"
FRAYED_SEAM_POLICY = "frayed_seam_pressure"


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
class CastThreadstep:
    """A target-selected, pre-resolution retreat against one declared cast.

    The reaction is available only in the analysis candidate. It spends one
    full existing Escape-Slack step and is useful only when that exact step
    takes the target outside the declared cast's launch band.
    """

    separation_increase: int


@dataclass(frozen=True)
class OpeningWeave:
    """A public one-hit opening guard held only by the actor who acts second."""

    beneficiary: Literal["second_actor"]
    absorbed_hits: int
    expiry: Literal["after_beneficiary_first_action"]
    activation: Literal["automatic", "optional"] = "automatic"
    escape_slack_cost: int = 0
    counter_policy_minimum_damage: int = 0
    damage_reduction_percent: int = 100


@dataclass(frozen=True)
class FrayedSeam:
    """A short post-Weave exposure that an advancing Needlepoint can bind."""

    needlepoint_binding_maximum_separation_increase: int
    expiry: Literal["after_originator_next_action"]


@dataclass(frozen=True)
class RangeEntryCommitment:
    """Require newly in-range direct casts to begin as a relocation.

    This candidate adds no persistent tactical state.  The commitment is the
    witnessed path from the entry relocation through the opponent's ordinary
    turn to any later cast that remains legal.
    """

    direct_cast_mode: RangeEntryDirectCastMode


@dataclass(frozen=True)
class EntrySeamPinRule:
    """Suppress Seam Pin only on a movement-created Needlepoint range entry."""

    relic_id: str
    suppression: EntrySeamPinSuppression


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
    cast_threadstep: CastThreadstep | None = None
    opening_weave: OpeningWeave | None = None
    frayed_seam: FrayedSeam | None = None
    range_entry_commitment: RangeEntryCommitment | None = None
    entry_seam_pin: EntrySeamPinRule | None = None

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
    opening_weave_hits_remaining: int = 0
    seam_pin_maximum_separation_increase: int | None = None
    frayed_seam_source: Actor | None = None
    frayed_seam_turns: int = 0


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
    if schema_version in {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}:
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
                if schema_version == 9
                else {"seam_pin", "escape_slack", "cast_threadstep"}
                if schema_version == 10
                else {"seam_pin", "escape_slack", "spoolburst_preparation", "spoolburst_cocoon", "spoolburst_threadback"}
                if schema_version == 11
                else {"seam_pin", "escape_slack", "opening_weave"}
                if schema_version == 12
                else {"seam_pin", "escape_slack", "opening_weave"}
                if schema_version == 13
                else {"seam_pin", "escape_slack", "opening_weave", "frayed_seam"}
                if schema_version == 14
                else {
                    "seam_pin", "escape_slack", "spoolburst_preparation",
                    "spoolburst_cocoon", "spoolburst_threadback",
                    "range_entry_commitment",
                }
                if schema_version == 15
                else {
                    "seam_pin", "escape_slack", "spoolburst_preparation",
                    "spoolburst_cocoon", "spoolburst_threadback",
                    "entry_seam_pin",
                }
            ),
            f"{path}.tactical_core",
        )
        seam_pin_raw = _require_object(tactical_core["seam_pin"], f"{path}.tactical_core.seam_pin")
        seam_pin_keys = {"relic_id", "maximum_separation_increase", "target_turns", "cooldown_actor_turns"}
        if schema_version in {3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}:
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
    if schema_version in {4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}:
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
    if schema_version in {7, 8, 9, 11, 15, 16}:
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
    if schema_version in {8, 11, 15, 16}:
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
    if schema_version in {9, 11, 15, 16}:
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

    cast_threadstep: CastThreadstep | None = None
    if schema_version == 10:
        threadstep_raw = _require_object(
            raw["tactical_core"]["cast_threadstep"],
            f"{path}.tactical_core.cast_threadstep",
        )
        _require_exact_keys(
            threadstep_raw,
            {"separation_increase"},
            f"{path}.tactical_core.cast_threadstep",
        )
        separation_increase = _require_positive_integer(
            threadstep_raw["separation_increase"],
            f"{path}.tactical_core.cast_threadstep.separation_increase",
        )
        movement_per_turn = _require_positive_integer(
            turn["movement_per_turn"], f"{path}.turn.movement_per_turn"
        )
        if separation_increase != movement_per_turn:
            raise TacticalModelError(
                f"{path}.tactical_core.cast_threadstep: requires one full movement-budget step"
            )
        cast_threadstep = CastThreadstep(separation_increase=separation_increase)

    opening_weave: OpeningWeave | None = None
    if schema_version in {12, 13, 14}:
        opening_weave_raw = _require_object(
            raw["tactical_core"]["opening_weave"],
            f"{path}.tactical_core.opening_weave",
        )
        _require_exact_keys(
            opening_weave_raw,
            (
                {"beneficiary", "absorbed_hits", "expiry"}
                if schema_version == 12
                else {
                    "beneficiary", "absorbed_hits", "expiry", "activation",
                    "escape_slack_cost", "counter_policy_minimum_damage",
                }
                if schema_version == 13
                else {
                    "beneficiary", "absorbed_hits", "expiry", "activation",
                    "escape_slack_cost", "counter_policy_minimum_damage",
                    "damage_reduction_percent",
                }
            ),
            f"{path}.tactical_core.opening_weave",
        )
        beneficiary = _require_string(
            opening_weave_raw["beneficiary"], f"{path}.tactical_core.opening_weave.beneficiary"
        )
        expiry = _require_string(
            opening_weave_raw["expiry"], f"{path}.tactical_core.opening_weave.expiry"
        )
        if beneficiary != "second_actor" or expiry != "after_beneficiary_first_action":
            raise TacticalModelError(
                f"{path}.tactical_core.opening_weave: requires a second-actor, first-action-expiring guard"
            )
        absorbed_hits = _require_positive_integer(
            opening_weave_raw["absorbed_hits"],
            f"{path}.tactical_core.opening_weave.absorbed_hits",
        )
        if absorbed_hits != 1:
            raise TacticalModelError(
                f"{path}.tactical_core.opening_weave: requires exactly one absorbed direct hit"
            )
        activation = "automatic" if schema_version == 12 else _require_string(
            opening_weave_raw["activation"], f"{path}.tactical_core.opening_weave.activation"
        )
        if activation not in {"automatic", "optional"}:
            raise TacticalModelError(
                f"{path}.tactical_core.opening_weave.activation: expected automatic or optional"
            )
        escape_slack_cost = 0 if schema_version == 12 else _require_positive_integer(
            opening_weave_raw["escape_slack_cost"],
            f"{path}.tactical_core.opening_weave.escape_slack_cost",
            allow_zero=True,
        )
        counter_policy_minimum_damage = 0 if schema_version == 12 else _require_positive_integer(
            opening_weave_raw["counter_policy_minimum_damage"],
            f"{path}.tactical_core.opening_weave.counter_policy_minimum_damage",
        )
        damage_reduction_percent = 100 if schema_version in {12, 13} else _require_positive_integer(
            opening_weave_raw["damage_reduction_percent"],
            f"{path}.tactical_core.opening_weave.damage_reduction_percent",
        )
        if damage_reduction_percent > 100:
            raise TacticalModelError(
                f"{path}.tactical_core.opening_weave.damage_reduction_percent: expected at most 100"
            )
        if schema_version in {13, 14}:
            movement_per_turn = _require_positive_integer(
                turn["movement_per_turn"], f"{path}.turn.movement_per_turn"
            )
            if activation != "optional" or escape_slack_cost != movement_per_turn:
                raise TacticalModelError(
                    f"{path}.tactical_core.opening_weave: requires optional use at one full movement-step cost"
                )
        if schema_version == 14 and damage_reduction_percent != 50:
            raise TacticalModelError(
                f"{path}.tactical_core.opening_weave: H3 requires a 50 percent direct-damage reduction"
            )
        opening_weave = OpeningWeave(
            beneficiary="second_actor",
            absorbed_hits=absorbed_hits,
            expiry="after_beneficiary_first_action",
            activation=activation,
            escape_slack_cost=escape_slack_cost,
            counter_policy_minimum_damage=counter_policy_minimum_damage,
            damage_reduction_percent=damage_reduction_percent,
        )

    frayed_seam: FrayedSeam | None = None
    if schema_version == 14:
        frayed_seam_raw = _require_object(
            raw["tactical_core"]["frayed_seam"],
            f"{path}.tactical_core.frayed_seam",
        )
        _require_exact_keys(
            frayed_seam_raw,
            {"needlepoint_binding_maximum_separation_increase", "expiry"},
            f"{path}.tactical_core.frayed_seam",
        )
        binding_increase = _require_positive_integer(
            frayed_seam_raw["needlepoint_binding_maximum_separation_increase"],
            f"{path}.tactical_core.frayed_seam.needlepoint_binding_maximum_separation_increase",
            allow_zero=True,
        )
        if seam_pin is None or binding_increase > seam_pin.maximum_separation_increase:
            raise TacticalModelError(
                f"{path}.tactical_core.frayed_seam: binding must tighten the configured Needlepoint Seam Pin"
            )
        expiry = _require_string(
            frayed_seam_raw["expiry"], f"{path}.tactical_core.frayed_seam.expiry"
        )
        if expiry != "after_originator_next_action":
            raise TacticalModelError(
                f"{path}.tactical_core.frayed_seam.expiry: expected after_originator_next_action"
            )
        frayed_seam = FrayedSeam(
            needlepoint_binding_maximum_separation_increase=binding_increase,
            expiry="after_originator_next_action",
        )

    range_entry_commitment: RangeEntryCommitment | None = None
    if schema_version == 15:
        commitment_raw = _require_object(
            raw["tactical_core"]["range_entry_commitment"],
            f"{path}.tactical_core.range_entry_commitment",
        )
        _require_exact_keys(
            commitment_raw,
            {"direct_cast_mode"},
            f"{path}.tactical_core.range_entry_commitment",
        )
        direct_cast_mode = _require_string(
            commitment_raw["direct_cast_mode"],
            f"{path}.tactical_core.range_entry_commitment.direct_cast_mode",
        )
        if direct_cast_mode != "commit_relocation":
            raise TacticalModelError(
                f"{path}.tactical_core.range_entry_commitment.direct_cast_mode: "
                "expected commit_relocation"
            )
        range_entry_commitment = RangeEntryCommitment(
            direct_cast_mode="commit_relocation",
        )

    entry_seam_pin: EntrySeamPinRule | None = None
    if schema_version == 16:
        entry_seam_pin_raw = _require_object(
            raw["tactical_core"]["entry_seam_pin"],
            f"{path}.tactical_core.entry_seam_pin",
        )
        _require_exact_keys(
            entry_seam_pin_raw,
            {"relic_id", "suppression"},
            f"{path}.tactical_core.entry_seam_pin",
        )
        entry_relic_id = _require_string(
            entry_seam_pin_raw["relic_id"],
            f"{path}.tactical_core.entry_seam_pin.relic_id",
        )
        suppression = _require_string(
            entry_seam_pin_raw["suppression"],
            f"{path}.tactical_core.entry_seam_pin.suppression",
        )
        if suppression != "pre_movement_out_of_range":
            raise TacticalModelError(
                f"{path}.tactical_core.entry_seam_pin.suppression: "
                "expected pre_movement_out_of_range"
            )
        entry_seam_pin = EntrySeamPinRule(
            relic_id=entry_relic_id,
            suppression="pre_movement_out_of_range",
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
        cast_threadstep=cast_threadstep,
        opening_weave=opening_weave,
        frayed_seam=frayed_seam,
        range_entry_commitment=range_entry_commitment,
        entry_seam_pin=entry_seam_pin,
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
    if config.cast_threadstep is not None and config.escape_slack is None:
        raise TacticalModelError(f"{path}.tactical_core.cast_threadstep: requires Escape Slack")
    if (
        config.opening_weave is not None and
        config.opening_weave.escape_slack_cost > 0 and
        (
            config.escape_slack is None or
            config.opening_weave.escape_slack_cost > config.escape_slack.per_actor
        )
    ):
        raise TacticalModelError(f"{path}.tactical_core.opening_weave: cost exceeds available opening Escape Slack")
    if config.frayed_seam is not None and config.opening_weave is None:
        raise TacticalModelError(f"{path}.tactical_core.frayed_seam: requires an Opening Weave")
    if config.range_entry_commitment is not None and config.action_economy != "move_and_cast":
        raise TacticalModelError(
            f"{path}.tactical_core.range_entry_commitment: requires move_and_cast action economy"
        )
    if config.entry_seam_pin is not None:
        if config.action_economy != "move_and_cast":
            raise TacticalModelError(
                f"{path}.tactical_core.entry_seam_pin: requires move_and_cast action economy"
            )
        if (
            config.seam_pin is None or
            config.entry_seam_pin.relic_id != config.seam_pin.relic_id or
            config.seam_pin.activation != "advance_only"
        ):
            raise TacticalModelError(
                f"{path}.tactical_core.entry_seam_pin: requires the advance-only Seam Pin Relic"
            )
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
    active_actor = first_actor or config.default_first_actor
    second_actor = other_actor(active_actor)
    opening_weave_hits = config.opening_weave.absorbed_hits if config.opening_weave is not None else 0
    return TacticalState(
        player=ActorState(
            player_x,
            config.maximum_stitching,
            escape_slack_remaining=escape_slack,
            brace_uses_remaining=brace_uses,
            opening_weave_hits_remaining=opening_weave_hits if second_actor == "player" else 0,
        ),
        loomkeeper=ActorState(
            loomkeeper_x,
            config.maximum_stitching,
            escape_slack_remaining=escape_slack,
            brace_uses_remaining=brace_uses,
            opening_weave_hits_remaining=opening_weave_hits if second_actor == "loomkeeper" else 0,
        ),
        active_actor=active_actor,
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
            actor.opening_weave_hits_remaining,
            actor.seam_pin_maximum_separation_increase,
            actor.frayed_seam_source,
            actor.frayed_seam_turns,
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
            "openingWeaveHits": actor.opening_weave_hits_remaining,
            "seamPinMaximumSeparationIncrease": actor.seam_pin_maximum_separation_increase,
            "frayedSeamSource": actor.frayed_seam_source,
            "frayedSeamTurns": actor.frayed_seam_turns,
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
    if config.cast_threadstep is not None:
        candidate_policies += (THREADSTEP_POLICY,)
    if config.opening_weave is not None and config.opening_weave.activation == "optional":
        candidate_policies += (OPENING_WEAVE_POLICY,)
    if config.frayed_seam is not None:
        candidate_policies += (FRAYED_SEAM_POLICY,)
    return BASE_POLICY_NAMES + candidate_policies


def _direct_cast_is_legal_after_movement(
    state: TacticalState,
    moved_state: TacticalState,
    relic: Relic,
    config: TacticalConfig,
) -> bool:
    """Evaluate the existing ordinary direct-cast contract at one moved state."""

    if moved_state != state and _spoolburst_preparation_requires_stationary_release(relic, config):
        return False
    if _seam_pin_is_on_cooldown(state, state.active_actor, relic.identifier, config):
        return False
    if _spoolburst_preparation_prevents_cast(state, state.active_actor, relic.identifier, config):
        return False
    if _spoolburst_backlash_prevents_cast(state, state.active_actor, relic.identifier, config):
        return False
    if _seam_pin_forbids_retreat_cast(state, moved_state, relic.identifier, config):
        return False
    return relic.minimum_range <= distance(moved_state) <= relic.maximum_range


def movement_created_direct_cast_relics(
    state: TacticalState,
    direction: int,
    config: TacticalConfig,
) -> tuple[str, ...]:
    """Return direct Relics made legal only by the declared movement.

    Spoolburst preparation and Unweave are separate action kinds, so this
    helper deliberately reports ordinary direct casts only.
    """

    if direction == 0:
        return ()
    moved_state = _move_actor(state, state.active_actor, direction, config)
    if moved_state == state:
        return ()
    before_distance = distance(state)
    return tuple(
        relic.identifier
        for relic in config.relics
        if not _spoolburst_preparation_requires_stationary_release(relic, config)
        if not relic.minimum_range <= before_distance <= relic.maximum_range
        and _direct_cast_is_legal_after_movement(state, moved_state, relic, config)
    )


def _entry_seam_pin_is_suppressed(
    before_movement: TacticalState,
    after_movement: TacticalState,
    relic: Relic,
    config: TacticalConfig,
) -> bool:
    rule = config.entry_seam_pin
    return (
        rule is not None and
        relic.identifier == rule.relic_id and
        distance(before_movement) > relic.maximum_range and
        relic.minimum_range <= distance(after_movement) <= relic.maximum_range and
        distance(after_movement) < distance(before_movement)
    )


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
            if not _direct_cast_is_legal_after_movement(state, moved_state, relic, config):
                continue
            if (
                config.range_entry_commitment is not None and
                relic.identifier in movement_created_direct_cast_relics(state, direction, config)
            ):
                continue
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


def apply_action(
    state: TacticalState,
    action: Action,
    config: TacticalConfig,
    *,
    target_reaction_policy: str | None = None,
) -> TacticalState:
    """Apply one declared action, optionally resolving the target's G1 reaction.

    Ordinary callers pass no reaction policy and therefore retain the existing
    deterministic transition. G1 match simulation supplies the target policy;
    its reaction is a separate post-declaration, pre-damage decision rather
    than a new normal-turn action.
    """
    if action not in legal_actions(state, config):
        raise TacticalModelError(f"Illegal tactical action: {action_key(action)}")
    if state.finished:
        raise TacticalModelError("Cannot act after a terminal result")
    if target_reaction_policy is not None and target_reaction_policy not in policy_names(config):
        raise TacticalModelError(f"Unknown target reaction policy: {target_reaction_policy}")

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
            if _cast_threadstep_should_react(
                next_state,
                target,
                relic,
                target_reaction_policy,
                config,
            ):
                next_state = _apply_cast_threadstep(next_state, target, config)
                target_state = actor_state(next_state, target)
                target_is_braced = target_state.brace_turns > 0
            frayed_before_cast = (
                target_state.frayed_seam_source == state.active_actor and
                target_state.frayed_seam_turns > 0
            )
            cast_evaded = not relic.minimum_range <= distance(next_state) <= relic.maximum_range
            if cast_evaded and config.cast_threadstep is None:
                raise TacticalModelError("Cast unexpectedly left its declared range band")
            cocoon_absorbs = _spoolburst_cocoon_absorbs_cast(target_state, relic, config)
            opening_weave_absorbs = _opening_weave_should_absorb(
                target_state,
                relic,
                target_reaction_policy,
                config,
            )
            damage = 0 if cast_evaded else relic.direct_damage
            if cocoon_absorbs and not cast_evaded:
                damage = 0
            if opening_weave_absorbs and not cast_evaded:
                if config.opening_weave is None:
                    raise TacticalModelError("Active Opening Weave state requires a configured candidate")
                damage = damage * (100 - config.opening_weave.damage_reduction_percent) // 100
            if target_is_braced and not cast_evaded:
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
                            not cast_evaded and
                            config.spoolburst_cocoon is None and
                            config.spoolburst_threadback is None and
                            _is_spoolburst_preparation_disruption(relic, config)
                        )
                        else target_state.spoolburst_preparation_turns
                    ),
                    spoolburst_cocoon_hits_remaining=(
                        target_state.spoolburst_cocoon_hits_remaining - 1
                        if cocoon_absorbs and not cast_evaded else target_state.spoolburst_cocoon_hits_remaining
                    ),
                    opening_weave_hits_remaining=(
                        target_state.opening_weave_hits_remaining - 1
                        if opening_weave_absorbs and not cast_evaded
                        else target_state.opening_weave_hits_remaining
                    ),
                    escape_slack_remaining=(
                        target_state.escape_slack_remaining - config.opening_weave.escape_slack_cost
                        if opening_weave_absorbs and not cast_evaded and config.opening_weave is not None
                        else target_state.escape_slack_remaining
                    ),
                    frayed_seam_source=(
                        state.active_actor
                        if opening_weave_absorbs and not cast_evaded and config.frayed_seam is not None
                        else target_state.frayed_seam_source
                    ),
                    frayed_seam_turns=(
                        1
                        if opening_weave_absorbs and not cast_evaded and config.frayed_seam is not None
                        else target_state.frayed_seam_turns
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
            if not cast_evaded:
                next_state = _apply_seam_pin_if_configured(
                    next_state,
                    state.active_actor,
                    target,
                    relic,
                    before_movement=state,
                    after_movement=moved_state,
                    bind_frayed_target=frayed_before_cast,
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

    next_state = _expire_frayed_seam_after_originator_action(next_state, state, state.active_actor)
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

    if policy == FRAYED_SEAM_POLICY:
        target_state = actor_state(state, other_actor(actor))
        binding_casts = tuple(
            action for action in casts
            if (
                _is_seam_pin_cast(action, config) and
                target_state.frayed_seam_source == actor and
                target_state.frayed_seam_turns > 0 and
                distance(_move_actor(state, actor, action.direction, config)) < distance(state)
            )
        )
        if binding_casts:
            return _select_best(binding_casts, lambda action: (
                -distance(_move_actor(state, actor, action.direction, config)),
                -abs(action.direction),
            ))
        return _best_response_action(state, config)

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
        target = other_actor(actor)
        target_policy = player_policy if target == "player" else loomkeeper_policy
        range_entry_projection = (
            _move_actor(before, actor, action.direction, config)
            if config.range_entry_commitment is not None
            else before
        )
        range_entry_relics = (
            movement_created_direct_cast_relics(before, action.direction, config)
            if config.range_entry_commitment is not None and action.kind == "relocate"
            else ()
        )
        direct_cast_relics_before = (
            tuple(
                relic.identifier
                for relic in config.relics
                if _direct_cast_is_legal_after_movement(before, before, relic, config)
            )
            if config.range_entry_commitment is not None
            else ()
        )
        direct_cast_relics_after_movement = (
            tuple(
                relic.identifier
                for relic in config.relics
                if _direct_cast_is_legal_after_movement(
                    before,
                    range_entry_projection,
                    relic,
                    config,
                )
            )
            if config.range_entry_commitment is not None
            else ()
        )
        entry_seam_pin_projection = (
            _move_actor(before, actor, action.direction, config)
            if config.entry_seam_pin is not None and action.kind == "cast"
            else before
        )
        entry_seam_pin_suppressed = (
            config.entry_seam_pin is not None and
            action.kind == "cast" and
            action.relic_id is not None and
            _entry_seam_pin_is_suppressed(
                before,
                entry_seam_pin_projection,
                config.relic(action.relic_id),
                config,
            )
        )
        state = apply_action(
            before,
            action,
            config,
            target_reaction_policy=target_policy,
        )
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
            "playerOpeningWeaveHits": state.player.opening_weave_hits_remaining,
            "loomkeeperOpeningWeaveHits": state.loomkeeper.opening_weave_hits_remaining,
            "playerFrayedSeamTurns": state.player.frayed_seam_turns,
            "loomkeeperFrayedSeamTurns": state.loomkeeper.frayed_seam_turns,
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
            "castThreadstepAppliedFor": target if (
                action.kind == "cast" and
                config.cast_threadstep is not None and
                actor_state(before, target).escape_slack_remaining -
                actor_state(state, target).escape_slack_remaining ==
                config.cast_threadstep.separation_increase
            ) else None,
            "castThreadstepEvadedFor": target if (
                action.kind == "cast" and
                config.cast_threadstep is not None and
                actor_state(before, target).escape_slack_remaining -
                actor_state(state, target).escape_slack_remaining ==
                config.cast_threadstep.separation_increase and
                action.relic_id is not None and
                not (
                    config.relic(action.relic_id).minimum_range <=
                    distance(state) <=
                    config.relic(action.relic_id).maximum_range
                )
            ) else None,
            "spoolburstCocoonAbsorbedFor": target if (
                actor_state(before, target).spoolburst_cocoon_hits_remaining >
                actor_state(state, target).spoolburst_cocoon_hits_remaining
            ) else None,
            "openingWeaveAbsorbedFor": target if (
                action.kind == "cast" and
                config.opening_weave is not None and
                actor_state(before, target).opening_weave_hits_remaining >
                actor_state(state, target).opening_weave_hits_remaining
            ) else None,
            "openingWeaveEscapeSlackCost": (
                actor_state(before, target).escape_slack_remaining -
                actor_state(state, target).escape_slack_remaining
                if action.kind == "cast" and
                config.opening_weave is not None and
                actor_state(before, target).opening_weave_hits_remaining >
                actor_state(state, target).opening_weave_hits_remaining
                else 0
            ),
            "openingWeaveDamageReductionPercent": (
                config.opening_weave.damage_reduction_percent
                if action.kind == "cast" and
                config.opening_weave is not None and
                actor_state(before, target).opening_weave_hits_remaining >
                actor_state(state, target).opening_weave_hits_remaining
                else 0
            ),
            "frayedSeamAppliedTo": target if (
                action.kind == "cast" and
                config.frayed_seam is not None and
                actor_state(before, target).frayed_seam_turns == 0 and
                actor_state(state, target).frayed_seam_source == actor and
                actor_state(state, target).frayed_seam_turns > 0
            ) else None,
            "frayedSeamBoundFor": target if (
                action.kind == "cast" and
                config.frayed_seam is not None and
                actor_state(before, target).frayed_seam_source == actor and
                actor_state(before, target).frayed_seam_turns > 0 and
                actor_state(state, target).seam_pin_source == actor and
                actor_state(state, target).seam_pin_maximum_separation_increase ==
                config.frayed_seam.needlepoint_binding_maximum_separation_increase
            ) else None,
            **({
                "directCastRelicsLegalBefore": list(direct_cast_relics_before),
                "directCastRelicsLegalAfterMovement": list(direct_cast_relics_after_movement),
                "rangeEntryCommitmentRelics": list(range_entry_relics),
                "rangeEntryCommitmentStartedBy": actor if range_entry_relics else None,
            } if config.range_entry_commitment is not None else {}),
            **({
                "entrySeamPinSuppression": (
                    {"target": target, "relicId": action.relic_id}
                    if entry_seam_pin_suppressed and actor_state(state, target).stitching > 0
                    else None
                ),
            } if config.entry_seam_pin is not None else {}),
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
    if config.cast_threadstep is not None:
        for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
            for player_policy, loomkeeper_policy in (
                (THREADSTEP_POLICY, "range_pressure"),
                ("range_pressure", THREADSTEP_POLICY),
            ):
                candidate_policy_probes.append(simulate_match(
                    config, player_policy, loomkeeper_policy,
                    first_actor=first_actor, mirrored=mirrored,
                    starting_distance=starting_distance,
                ))
    if config.opening_weave is not None and config.opening_weave.activation == "optional":
        for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
            for player_policy, loomkeeper_policy in (
                (OPENING_WEAVE_POLICY, "range_pressure"),
                ("range_pressure", OPENING_WEAVE_POLICY),
            ):
                candidate_policy_probes.append(simulate_match(
                    config, player_policy, loomkeeper_policy,
                    first_actor=first_actor, mirrored=mirrored,
                    starting_distance=starting_distance,
                ))
    if config.frayed_seam is not None:
        for first_actor, mirrored in (("player", False), ("loomkeeper", True)):
            player_policy, loomkeeper_policy = (
                (FRAYED_SEAM_POLICY, OPENING_WEAVE_POLICY)
                if first_actor == "player"
                else (OPENING_WEAVE_POLICY, FRAYED_SEAM_POLICY)
            )
            candidate_policy_probes.append(simulate_match(
                config,
                player_policy,
                loomkeeper_policy,
                first_actor=first_actor,
                mirrored=mirrored,
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
        forced = [
            action_key(action)
            for action in legal_actions(state, config)
            if can_force_win_after_declared_action(
                state,
                action,
                first_actor,
                config.opening_search_depth - 1,
                config,
            )
        ]
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
            "castThreadstep": None if config.cast_threadstep is None else {
                "separationIncrease": config.cast_threadstep.separation_increase,
                "requiresFullEscapeSlack": True,
                "resolutionWindow": "after declared caster movement and before direct damage",
                "activation": "selected defensive policy only when the exact step evades the cast",
            },
            "openingWeave": None if config.opening_weave is None else {
                "beneficiary": config.opening_weave.beneficiary,
                "absorbedHits": config.opening_weave.absorbed_hits,
                "expiry": config.opening_weave.expiry,
                "absorbedRelics": list(RELIC_ORDER),
                **({
                    "activation": config.opening_weave.activation,
                    "escapeSlackCost": config.opening_weave.escape_slack_cost,
                    "counterPolicyMinimumDamage": config.opening_weave.counter_policy_minimum_damage,
                } if config.opening_weave.activation == "optional" else {}),
                **({
                    "damageReductionPercent": config.opening_weave.damage_reduction_percent,
                } if config.frayed_seam is not None else {}),
            },
            "frayedSeam": None if config.frayed_seam is None else {
                "needlepointBindingMaximumSeparationIncrease": (
                    config.frayed_seam.needlepoint_binding_maximum_separation_increase
                ),
                "expiry": config.frayed_seam.expiry,
            },
            **({
                "rangeEntryCommitment": {
                    "directCastMode": config.range_entry_commitment.direct_cast_mode,
                    "scope": "ordinary direct casts made legal only by their own movement",
                    "responseWindow": "opponent ordinary next turn before any later cast",
                    "persistentState": False,
                },
            } if config.range_entry_commitment is not None else {}),
            **({
                "entrySeamPin": {
                    "relicId": config.entry_seam_pin.relic_id,
                    "suppression": config.entry_seam_pin.suppression,
                    "preservesDamage": True,
                    "persistentState": False,
                },
            } if config.entry_seam_pin is not None else {}),
        },
        "policySets": {
            "primaryMatrix": list(BASE_POLICY_NAMES),
            "candidateOnlyProbe": [
                policy for policy, active in (
                    (SEAM_PIN_POLICY, config.seam_pin is not None),
                    (BRACE_POLICY, config.brace is not None),
                    (THREADSTEP_POLICY, config.cast_threadstep is not None),
                    (
                        OPENING_WEAVE_POLICY,
                        config.opening_weave is not None and config.opening_weave.activation == "optional",
                    ),
                    (FRAYED_SEAM_POLICY, config.frayed_seam is not None),
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


def _range_entry_route_summary(
    matches: list[dict[str, Any]],
    config: TacticalConfig,
) -> dict[str, Any]:
    movement_created_casts = {identifier: 0 for identifier in RELIC_ORDER}
    entry_relocations = {identifier: 0 for identifier in RELIC_ORDER}
    route_results = {
        "later_direct_cast": 0,
        "later_alternative_action": 0,
        "later_cast_unavailable": 0,
        "terminal_before_actor_return": 0,
        "missing_opponent_response": 0,
    }
    seam_pin_suppressions = {identifier: 0 for identifier in RELIC_ORDER}
    opening_suppression_routes = {
        "total": 0,
        "firstActorWins": 0,
        "secondActorWins": 0,
        "turnLimitResults": 0,
    }

    for match in matches:
        trace = match["trace"]
        for index, step in enumerate(trace):
            action_kind, relic_id, direction = step["action"].split(":", 2)
            if action_kind == "cast" and direction != "stay":
                relic = config.relic(relic_id)
                if (
                    not relic.minimum_range <= step["distanceBefore"] <= relic.maximum_range and
                    relic.minimum_range <= step["distanceAfter"] <= relic.maximum_range
                ):
                    movement_created_casts[relic_id] += 1

            suppression = step.get("entrySeamPinSuppression")
            if suppression is not None:
                seam_pin_suppressions[suppression["relicId"]] += 1
                if index == 0:
                    opening_suppression_routes["total"] += 1
                    if match["winner"] == match["firstActor"]:
                        opening_suppression_routes["firstActorWins"] += 1
                    elif match["winner"] == other_actor(match["firstActor"]):
                        opening_suppression_routes["secondActorWins"] += 1
                    else:
                        opening_suppression_routes["turnLimitResults"] += 1

            entered_relics = tuple(step.get("rangeEntryCommitmentRelics", ()))
            if not entered_relics:
                continue
            for entered_relic in entered_relics:
                entry_relocations[entered_relic] += 1

            response_index = index + 1
            if response_index >= len(trace) or trace[response_index]["actor"] == step["actor"]:
                route_results["missing_opponent_response"] += 1
                continue

            later_step = next(
                (
                    candidate
                    for candidate in trace[response_index + 1:]
                    if candidate["actor"] == step["actor"]
                ),
                None,
            )
            if later_step is None:
                route_results["terminal_before_actor_return"] += 1
                continue

            later_kind, later_relic, _ = later_step["action"].split(":", 2)
            if later_kind == "cast" and later_relic in entered_relics:
                route_results["later_direct_cast"] += 1
                continue
            later_legal = set(later_step.get("directCastRelicsLegalBefore", ()))
            if later_legal.intersection(entered_relics):
                route_results["later_alternative_action"] += 1
            else:
                route_results["later_cast_unavailable"] += 1

    return {
        "movementCreatedDirectCasts": {
            "total": sum(movement_created_casts.values()),
            "byRelic": movement_created_casts,
        },
        "rangeEntryCommitments": {
            "total": sum(entry_relocations.values()),
            "byRelic": entry_relocations,
            "routeResults": route_results,
        },
        **({
            "entrySeamPinSuppressions": {
                "total": sum(seam_pin_suppressions.values()),
                "byRelic": seam_pin_suppressions,
                "openingRouteResults": opening_suppression_routes,
            },
        } if config.entry_seam_pin is not None else {}),
    }


def run_range_entry_boundary_sweep(
    config: TacticalConfig,
    starting_distances: tuple[int, ...],
) -> dict[str, Any]:
    """Run the range-entry boundary frame over both first actors and both mirrors.

    This report is separate from the historical paired-orientation sweep so it
    cannot silently change any D2A report digest or candidate status.
    """

    validate_world_against_authority_fixture(config)
    if not starting_distances:
        raise TacticalModelError("Range-entry boundary sweep requires at least one scenario")
    if len(set(starting_distances)) != len(starting_distances):
        raise TacticalModelError("Range-entry boundary sweep must not repeat a scenario")
    for starting_distance in starting_distances:
        _require_starting_distance(starting_distance, config)

    scenario_reports: list[dict[str, Any]] = []
    all_matches: list[dict[str, Any]] = []
    for starting_distance in starting_distances:
        matches = [
            simulate_match(
                config,
                player_policy,
                loomkeeper_policy,
                first_actor=first_actor,
                mirrored=mirrored,
                starting_distance=starting_distance,
            )
            for first_actor in ("player", "loomkeeper")
            for mirrored in (False, True)
            for player_policy in BASE_POLICY_NAMES
            for loomkeeper_policy in BASE_POLICY_NAMES
        ]
        all_matches.extend(matches)
        terminal_reasons: dict[str, int] = {}
        for match in matches:
            terminal_reasons[match["finishReason"]] = terminal_reasons.get(match["finishReason"], 0) + 1

        forced_openings = []
        for first_actor in ("player", "loomkeeper"):
            for mirrored in (False, True):
                state = initial_state(
                    config,
                    first_actor=first_actor,
                    mirrored=mirrored,
                    starting_distance=starting_distance,
                )
                forced_actions = [
                    action_key(action)
                    for action in legal_actions(state, config)
                    if can_force_win_after_declared_action(
                        state,
                        action,
                        first_actor,
                        config.opening_search_depth - 1,
                        config,
                    )
                ]
                if forced_actions:
                    forced_openings.append({
                        "firstActor": first_actor,
                        "mirrored": mirrored,
                        "actions": forced_actions,
                    })

        first_actor_wins = sum(match["winner"] == match["firstActor"] for match in matches)
        scenario_reports.append({
            "startingDistance": starting_distance,
            "matchCount": len(matches),
            "firstActorWins": first_actor_wins,
            "firstActorWinRate": first_actor_wins / len(matches),
            "averageTurns": sum(match["turns"] for match in matches) / len(matches),
            "terminalReasons": terminal_reasons,
            "nonterminalRecurrenceMatchCount": sum(
                match["nonterminalRecurrence"] is not None for match in matches
            ),
            "forcedOpenings": forced_openings,
            **_range_entry_route_summary(matches, config),
            "matches": matches,
        })

    terminal_reasons: dict[str, int] = {}
    for match in all_matches:
        terminal_reasons[match["finishReason"]] = terminal_reasons.get(match["finishReason"], 0) + 1
    first_actor_wins = sum(match["winner"] == match["firstActor"] for match in all_matches)
    return {
        "schemaVersion": 1,
        "reportKind": "range_entry_boundary_sweep",
        "configId": config.identifier,
        "label": config.label,
        "analysisStatus": config.analysis_status,
        "sourceRulesetId": config.source_ruleset_id,
        "authorityFixture": config.authority_fixture,
        "startingDistances": list(starting_distances),
        "firstActors": ["player", "loomkeeper"],
        "mirrored": [False, True],
        "policyPairs": [
            [player_policy, loomkeeper_policy]
            for player_policy in BASE_POLICY_NAMES
            for loomkeeper_policy in BASE_POLICY_NAMES
        ],
        "seed": config.seed,
        "maximumTurns": config.maximum_turns,
        "openingSearchDepth": config.opening_search_depth,
        "excludedClaims": [
            "The ideal-direct-hit model does not establish terrain, aim, trajectory, splash, player-skill, or live-Loomkeeper behavior.",
            "The deterministic policy matrix does not establish global balance, optimal play, player fun, V5 approval, or production authority.",
        ],
        "scenarioReports": scenario_reports,
        "aggregate": {
            "matchCount": len(all_matches),
            "firstActorWins": first_actor_wins,
            "firstActorWinRate": first_actor_wins / len(all_matches),
            "averageTurns": sum(match["turns"] for match in all_matches) / len(all_matches),
            "terminalReasons": terminal_reasons,
            "nonterminalRecurrenceMatchCount": sum(
                match["nonterminalRecurrence"] is not None for match in all_matches
            ),
            "forcedOpeningScenarioCount": sum(
                bool(scenario["forcedOpenings"]) for scenario in scenario_reports
            ),
            **_range_entry_route_summary(all_matches, config),
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


def _forced_action_outcomes(
    state: TacticalState,
    action: Action,
    config: TacticalConfig,
) -> tuple[TacticalState, ...]:
    """Enumerate target choices in the G1 pre-resolution response window.

    This deliberately differs from a policy trace: forced-win search gives the
    target every legal response, including declining an otherwise useful
    Threadstep. That makes an opening action forced only when it survives both
    observable choices.
    """

    outcomes = [apply_action(state, action, config)]
    if action.kind == "cast" and config.cast_threadstep is not None:
        threaded = apply_action(
            state,
            action,
            config,
            target_reaction_policy=THREADSTEP_POLICY,
        )
        if threaded != outcomes[0]:
            outcomes.append(threaded)
    if (
        action.kind == "cast" and
        config.opening_weave is not None and
        config.opening_weave.activation == "optional"
    ):
        woven = apply_action(
            state,
            action,
            config,
            target_reaction_policy=OPENING_WEAVE_POLICY,
        )
        if woven not in outcomes:
            outcomes.append(woven)
    return tuple(outcomes)


def can_force_win_after_declared_action(
    state: TacticalState,
    action: Action,
    perspective: Actor,
    depth: int,
    config: TacticalConfig,
) -> bool:
    """Evaluate a named opening after the other actor's reaction choice."""

    outcomes = _forced_action_outcomes(state, action, config)
    values = tuple(can_force_win(outcome, perspective, depth, config) for outcome in outcomes)
    return all(values) if state.active_actor == perspective else any(values)


def can_force_win(state: TacticalState, perspective: Actor, depth: int, config: TacticalConfig) -> bool:
    """Bounded deterministic forced-win test with G1 reaction choices included."""

    @lru_cache(maxsize=None)
    def visit(cached_state: TacticalState, remaining_depth: int) -> bool:
        if cached_state.finished:
            return cached_state.winner == perspective
        if remaining_depth <= 0:
            return False
        action_values = []
        for action in legal_actions(cached_state, config):
            outcomes = tuple(
                visit(outcome, remaining_depth - 1)
                for outcome in _forced_action_outcomes(cached_state, action, config)
            )
            action_values.append(
                all(outcomes)
                if cached_state.active_actor == perspective
                else any(outcomes)
            )
        return any(action_values) if cached_state.active_actor == perspective else all(action_values)

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


def _threadstep_direction(state: TacticalState, actor: Actor) -> int:
    """Return the one movement direction that moves a reacting target away."""

    return _threadback_direction(state, actor)


def _cast_threadstep_is_legal(state: TacticalState, actor: Actor, config: TacticalConfig) -> bool:
    if config.cast_threadstep is None:
        return False
    current = actor_state(state, actor)
    if current.escape_slack_remaining < config.cast_threadstep.separation_increase:
        return False
    moved = _move_actor(state, actor, _threadstep_direction(state, actor), config)
    return distance(moved) - distance(state) == config.cast_threadstep.separation_increase


def _apply_cast_threadstep(state: TacticalState, actor: Actor, config: TacticalConfig) -> TacticalState:
    if not _cast_threadstep_is_legal(state, actor, config):
        raise TacticalModelError("Cast Threadstep requires one full legal Escape-Slack separation step")
    return _move_actor(state, actor, _threadstep_direction(state, actor), config)


def _policy_uses_cast_threadstep(policy: str | None, config: TacticalConfig) -> bool:
    """Declare which transparent policies elect the optional G1 reaction."""

    return (
        config.cast_threadstep is not None and
        policy in {"retreat_kite", "best_response", THREADSTEP_POLICY}
    )


def _cast_threadstep_should_react(
    state: TacticalState,
    target: Actor,
    relic: Relic,
    target_reaction_policy: str | None,
    config: TacticalConfig,
) -> bool:
    """Use Threadstep only when the selected policy can turn this cast into a miss."""

    if not _policy_uses_cast_threadstep(target_reaction_policy, config):
        return False
    if not _cast_threadstep_is_legal(state, target, config):
        return False
    stepped = _apply_cast_threadstep(state, target, config)
    return not relic.minimum_range <= distance(stepped) <= relic.maximum_range


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


def _opening_weave_should_absorb(
    target_state: ActorState,
    relic: Relic,
    target_reaction_policy: str | None,
    config: TacticalConfig,
) -> bool:
    """Resolve H1's automatic guard or H2's optional, priced counter choice."""

    opening_weave = config.opening_weave
    if opening_weave is None or target_state.opening_weave_hits_remaining <= 0:
        return False
    if opening_weave.activation == "automatic":
        return True
    if target_reaction_policy == OPENING_WEAVE_POLICY:
        return target_state.escape_slack_remaining >= opening_weave.escape_slack_cost
    if target_reaction_policy not in BASE_POLICY_NAMES:
        return False
    return (
        target_state.escape_slack_remaining >= opening_weave.escape_slack_cost and
        relic.direct_damage >= opening_weave.counter_policy_minimum_damage
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
    bind_frayed_target: bool = False,
    config: TacticalConfig,
) -> TacticalState:
    if config.seam_pin is None or relic.identifier != config.seam_pin.relic_id:
        return state
    if _entry_seam_pin_is_suppressed(before_movement, after_movement, relic, config):
        return state
    if (
        config.seam_pin.activation == "advance_only" and
        distance(after_movement) >= distance(before_movement)
    ):
        return state
    target_state = actor_state(state, target)
    caster_state = actor_state(state, caster)
    maximum_separation_increase = config.seam_pin.maximum_separation_increase
    if bind_frayed_target:
        if config.frayed_seam is None:
            raise TacticalModelError("Frayed Seam binding requires a configured Frayed Seam candidate")
        maximum_separation_increase = config.frayed_seam.needlepoint_binding_maximum_separation_increase
    pinned_target = replace(
        target_state,
        seam_pin_source=caster,
        seam_pin_turns=config.seam_pin.target_turns,
        seam_pin_maximum_separation_increase=maximum_separation_increase,
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
        seam_pin_maximum_separation_increase=(
            current.seam_pin_maximum_separation_increase if next_turns else None
        ),
        seam_pin_cooldown=max(0, current.seam_pin_cooldown - 1),
        spoolburst_preparation_turns=max(0, current.spoolburst_preparation_turns - 1),
        spoolburst_cocoon_hits_remaining=(
            current.spoolburst_cocoon_hits_remaining
            if current.spoolburst_preparation_turns > 0 else 0
        ),
        opening_weave_hits_remaining=0,
    )
    return replace_actor(state, actor, completed)


def _expire_frayed_seam_after_originator_action(
    state: TacticalState,
    before: TacticalState,
    originator: Actor,
) -> TacticalState:
    """Clear H3's exposure after, not before, its originator's next action.

    The `before` cut distinguishes that next action from the opening action
    which created the Frayed Seam. This lets an advancing Needlepoint bind the
    exposed target during the intended one-action window.
    """

    target = other_actor(originator)
    target_before = actor_state(before, target)
    if target_before.frayed_seam_source != originator or target_before.frayed_seam_turns <= 0:
        return state
    target_after = actor_state(state, target)
    return replace_actor(
        state,
        target,
        replace(target_after, frayed_seam_source=None, frayed_seam_turns=0),
    )


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
        maximum_distance = current_distance + (
            current.seam_pin_maximum_separation_increase
            if current.seam_pin_maximum_separation_increase is not None
            else config.seam_pin.maximum_separation_increase
        )
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
