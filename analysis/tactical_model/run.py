"""CLI runner for deterministic, ignored WP-015D2A analysis reports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .model import (
    TacticalModelError,
    load_config,
    repository_root,
    run_experiment,
    run_range_entry_boundary_sweep,
    run_starting_distance_sweep,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a deterministic NIMble Knots tactical analysis.")
    parser.add_argument("--config", required=True, type=Path, help="Versioned analysis configuration JSON.")
    parser.add_argument("--output", type=Path, help="Optional report path below test-results/tactical-model.")
    parser.add_argument(
        "--starting-distances",
        nargs="+",
        type=int,
        help="Run a centered, mirrored sweep over these explicit analytical starting distances.",
    )
    parser.add_argument(
        "--range-entry-boundary-sweep",
        action="store_true",
        help="Cross both first actors and both mirrors over --starting-distances for the I1 boundary frame.",
    )
    args = parser.parse_args()
    try:
        config_path = args.config if args.config.is_absolute() else repository_root() / args.config
        config = load_config(config_path)
        if args.range_entry_boundary_sweep and args.starting_distances is None:
            raise TacticalModelError("--range-entry-boundary-sweep requires --starting-distances")
        if args.range_entry_boundary_sweep:
            report = run_range_entry_boundary_sweep(config, tuple(args.starting_distances))
        elif args.starting_distances is not None:
            report = run_starting_distance_sweep(config, tuple(args.starting_distances))
        else:
            report = run_experiment(config)
        encoded = json.dumps(report, indent=2, sort_keys=True) + "\n"
        if args.output is None:
            sys.stdout.write(encoded)
            return 0
        output_path = args.output if args.output.is_absolute() else repository_root() / args.output
        allowed_root = (repository_root() / "test-results" / "tactical-model").resolve()
        resolved = output_path.resolve()
        if allowed_root not in (resolved, *resolved.parents):
            raise TacticalModelError("Analysis reports may be written only below test-results/tactical-model.")
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(encoded, encoding="utf-8")
        print(f"Wrote deterministic tactical report: {resolved.relative_to(repository_root())}")
        return 0
    except TacticalModelError as error:
        print(f"Tactical analysis failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
