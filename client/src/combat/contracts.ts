import type { ChallengeResult, ChallengeSnapshot } from '../../../shared/protocol';
import type { SimulationCommand } from '../../../shared/simulation';
import type { ChallengeSnapshotV8Runtime as ChallengeSnapshotV8, ChallengeResultV8Runtime as ChallengeResultV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';
import type { SimulationEventV9, SimulationIntentV9, SimulationStateV9 } from '../../../shared/simulation-v9';

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
    restart?: () => Promise<CombatSceneArgsV8>;
    onSnapshot?: (listener: (snapshot: ChallengeSnapshotV8) => void) => () => void;
    onResult?: (listener: (result: ChallengeResultV8) => void) => () => void;
    onConnection?: LegacyCombatSceneArgs['onConnection'];
    onUnavailable?: LegacyCombatSceneArgs['onUnavailable'];
    onError?: LegacyCombatSceneArgs['onError'];
    previewLabel?: string;
};

export type CombatSceneArgs = LegacyCombatSceneArgs | CombatSceneArgsV8;

/** Local-only V9C engineering preview contract. It carries no session or transport facts. */
export type CombatSceneArgsV9 = {
    kind: 'v9'; snapshot: SimulationStateV9; previewLabel: string;
    submit: (intent: SimulationIntentV9) => Promise<SimulationStateV9>;
    setPaused: (paused: boolean) => Promise<SimulationStateV9>;
    cancelInput: () => Promise<SimulationStateV9>;
    /** Local presentation state only; V9 deliberately has no transport envelope. */
    paused: () => boolean;
    /** Re-entry creates a fresh local authority fixture after the old one is torn down. */
    restart: () => Promise<CombatSceneArgsV9>;
    onSnapshot: (listener: (snapshot: SimulationStateV9, events: SimulationEventV9[]) => void) => () => void;
    destroy: () => void;
};

/** Shared by the V9 scene's DOM and Phaser registrations so direct teardown is complete. */
export class V9PreviewListenerCleanup {
    private removers: (() => void)[] = [];
    public dom(target: { addEventListener: (type: string, handler: (...args: any[]) => void) => void;
        removeEventListener: (type: string, handler: (...args: any[]) => void) => void }, type: string,
    handler: (...args: any[]) => void): void {
        target.addEventListener(type, handler); this.removers.push(() => target.removeEventListener(type, handler));
    }
    public emitter(target: { on: (event: string, handler: (...args: any[]) => void) => void;
        off: (event: string, handler: (...args: any[]) => void) => void }, event: string,
    handler: (...args: any[]) => void): void {
        target.on(event, handler); this.removers.push(() => target.off(event, handler));
    }
    public once(target: { once: (event: string, handler: (...args: any[]) => void) => void;
        off: (event: string, handler: (...args: any[]) => void) => void }, event: string,
    handler: (...args: any[]) => void): void {
        target.once(event, handler); this.removers.push(() => target.off(event, handler));
    }
    public dispose(): void { for (const remove of this.removers.splice(0)) remove(); }
}

export type Point = { x: number; y: number };

export type Rect = Point & { width: number; height: number };

export type SafeAreaInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};
