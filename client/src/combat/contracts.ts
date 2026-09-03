import type { ChallengeResult, ChallengeSnapshot } from '../../../shared/protocol';
import type { SimulationCommand } from '../../../shared/simulation';
import type { ChallengeSnapshotV8Family as ChallengeSnapshotV8, ChallengeResultV8Family as ChallengeResultV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';

export type CombatCommandSubmitter = (
    command: SimulationCommand,
    expectedTurn: number
) => Promise<ChallengeSnapshot>;

export type LegacyCombatSceneArgs = {
    kind?: 'legacy';
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

export type CombatSceneArgsV8 = {
    kind: 'v8';
    snapshot: ChallengeSnapshotV8;
    submitIntent: (intent: SimulationIntentV8) => Promise<ChallengeSnapshotV8>;
    cancelInput: () => Promise<ChallengeSnapshotV8 | void>;
    releaseMovement?: () => Promise<ChallengeSnapshotV8 | void>;
    inputReady?: () => boolean;
    inputFlight?: () => 'locomotion' | 'blocked' | null;
    onInputReady?: (listener: () => void) => () => void;
    setPaused?: (paused: boolean) => Promise<ChallengeSnapshotV8>;
    retry?: () => Promise<ChallengeSnapshotV8>;
    onSnapshot?: (listener: (snapshot: ChallengeSnapshotV8) => void) => () => void;
    onResult?: (listener: (result: ChallengeResultV8) => void) => () => void;
    onConnection?: LegacyCombatSceneArgs['onConnection'];
    onUnavailable?: LegacyCombatSceneArgs['onUnavailable'];
    onError?: LegacyCombatSceneArgs['onError'];
    previewLabel?: string;
};

export type CombatSceneArgs = LegacyCombatSceneArgs | CombatSceneArgsV8;

export type Point = { x: number; y: number };

export type Rect = Point & { width: number; height: number };

export type SafeAreaInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};
