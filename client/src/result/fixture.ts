import type {
    ChallengeResult,
    ChallengeSnapshot,
    RewardUpdateData
} from '../../../shared/protocol';

import { createCombatFixture } from '../combat/fixture';
import type { ResultClient, ResultSceneArgs } from '../scenes/result';

const CHALLENGE_ID = 'visual_result_challenge_01';
const ENTITLEMENT_ID = 'visual_reward_entitlement_01';
const RECIPIENT = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';

export function createResultPreview(
    mode: 'practice' | 'reward'
): { args: ResultSceneArgs; client: ResultClient } {
    const combat = createCombatFixture(1, 'wizard');
    let reward = claimableReward();
    const rewardListeners = new Set<(update: RewardUpdateData) => void>();
    const client: ResultClient = {
        retryCombat: async () => structuredClone(combat.snapshot),
        combatArgs: async (snapshot) => {
            if (snapshot.protocolVersion !== 1) {
                throw new Error('The result preview supports only the legacy combat fixture.');
            }
            return { ...combat, snapshot: structuredClone(snapshot as ChallengeSnapshot) };
        },
        onRewardUpdate: (listener: (update: RewardUpdateData) => void) => {
            rewardListeners.add(listener);
            return () => rewardListeners.delete(listener);
        },
        rewardForChallenge: (challengeId: string) => challengeId === CHALLENGE_ID
            ? structuredClone(reward)
            : undefined,
        claimReward: async () => {
            reward = {
                ...reward,
                state: 'queued',
                claimNonce: undefined,
                message: 'The fixed sponsor reward is queued for payout.'
            };
            emitReward(rewardListeners, reward);
            return structuredClone(reward);
        },
        rewardStatus: async () => {
            reward = {
                ...reward,
                state: 'finalized',
                claimNonce: undefined,
                transactionHash: 'a'.repeat(64),
                finalizedAt: '2026-08-01T12:00:00.000Z',
                message: 'The fixed NIM reward is finalized.'
            };
            emitReward(rewardListeners, reward);
            return structuredClone(reward);
        }
    };
    return {
        client,
        args: {
            result: fixedResult(),
            calling: 'wizard',
            rewarded: mode === 'reward',
            rewardUpdate: mode === 'reward' ? structuredClone(reward) : undefined,
            previewLabel: 'Automated visual preview - no wallet or payout'
        }
    };
}

function fixedResult(): ChallengeResult {
    return {
        protocolVersion: 1,
        serverTimeMs: 0,
        sessionId: 'visual_result_session_01',
        challengeId: CHALLENGE_ID,
        outcome: 'player_win',
        revision: 24,
        nextSequence: 24,
        finalTick: 652,
        finalStateHash: 'b'.repeat(64)
    };
}

function claimableReward(): RewardUpdateData {
    return {
        entitlementId: ENTITLEMENT_ID,
        challengeId: CHALLENGE_ID,
        challengeDay: '2026-08-01',
        rewardLuna: '100000',
        recipient: RECIPIENT,
        state: 'claimable',
        claimNonce: 'v'.repeat(43),
        message: 'The fixed sponsor reward is ready to claim.'
    };
}

function emitReward(
    listeners: Set<(update: RewardUpdateData) => void>,
    update: RewardUpdateData
): void {
    for (const listener of listeners) listener(structuredClone(update));
}
