import type { ChallengeResult, ChallengeSnapshot } from '../../../shared/protocol';
import type { SimulationCommand } from '../../../shared/simulation';

export type CombatCommandSubmitter = (
    command: SimulationCommand,
    expectedTurn: number
) => Promise<ChallengeSnapshot>;

export type CombatSceneArgs = {
    snapshot: ChallengeSnapshot;
    submitCommand: CombatCommandSubmitter;
    setPaused?: (paused: boolean) => Promise<ChallengeSnapshot>;
    retry?: () => Promise<ChallengeSnapshot>;
    onSnapshot?: (listener: (snapshot: ChallengeSnapshot) => void) => () => void;
    onResult?: (listener: (result: ChallengeResult) => void) => () => void;
    onConnection?: (listener: (state: 'connected' | 'reconnecting') => void) => () => void;
    onUnavailable?: (listener: (message: string) => void) => () => void;
    onError?: (listener: (message: string) => void) => () => void;
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
