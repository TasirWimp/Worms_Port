import type { ChallengeSnapshot } from '../../../shared/protocol';
import type { SimulationCommand } from '../../../shared/simulation';

export type CombatCommandSubmitter = (
    command: SimulationCommand,
    expectedTurn: number
) => Promise<ChallengeSnapshot>;

export type CombatSceneArgs = {
    snapshot: ChallengeSnapshot;
    submitCommand: CombatCommandSubmitter;
    previewLabel?: string;
};

export type Point = { x: number; y: number };

export type Rect = Point & { width: number; height: number };

export type SafeAreaInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};
