import type {
    RewardInfoData,
    RewardPayoutState,
    RewardUpdateData
} from '../../../shared/protocol';
import type { CoordinatorReplay } from '../simulation/coordinator';
import type { CoordinatorReplayV8Automated } from '../../../shared/protocol-v8';
import type { CoordinatorReplayV9Automated } from '../../../shared/protocol-v9';
import type { CoordinatorReplayV10Automated } from '../../../shared/protocol-v10-live';

export type RewardCoordinatorReplay = CoordinatorReplay | CoordinatorReplayV8Automated | CoordinatorReplayV9Automated | CoordinatorReplayV10Automated;

export type RewardMode = 'disabled' | 'record-only' | 'testnet' | 'mainnet';

export type RewardConfig = {
    mode: RewardMode;
    rewardLuna: bigint;
    feeLuna: bigint;
    dailyBudgetLuna: bigint;
    paused: boolean;
    reservationTtlMs: number;
    claimTtlMs: number;
    turnLimit: number;
    network: 'test-albatross' | 'main-albatross';
    expectedSignerAddress?: string;
    privateKeyFile?: string;
    rpcUrl?: string;
    operatorAcknowledgement?: string;
    testWalletAddress?: string;
    testDailyAttemptLimit: number;
    peiRequired?: boolean;
};

export type PeiQualificationGrant = {
    id: string;
    walletAddress: string;
    challengeDay: string;
    qualificationDigest: string;
    tokenDigest: string;
    issuedAt: Date;
    expiresAt: Date;
    consumedAt?: Date;
    entitlementId?: string;
};

export type PeiQualificationInput = {
    id: string;
    walletAddress: string;
    challengeDay: string;
    qualificationDigest: string;
    tokenDigest: string;
    issuedAt: Date;
    expiresAt: Date;
};

export type PeiAdmissionBinding = {
    grantId: string;
    tokenDigest: string;
};

export type VerifiedPeiQualification = {
    walletAddress: string;
    qualificationDigest: string;
    expiresAt: Date;
};

export type IssuedPeiAdmission = {
    grantId: string;
    token: string;
    challengeDay: string;
    expiresAt: string;
};

export type RewardEntitlement = {
    id: string;
    challengeId: string;
    challengeDay: string;
    walletAddress: string;
    calling: 'wizard' | 'thief' | 'warrior';
    seed: number;
    rewardLuna: bigint;
    state: RewardPayoutState;
    attemptConsumed: boolean;
    attemptNumber: number;
    dailyAttemptLimit: number;
    reservationExpiresAt: Date;
    finalTick?: number;
    finalStateHash?: string;
    replay?: RewardCoordinatorReplay;
    signedTransaction?: string;
    transactionHash?: string;
    validityStartHeight?: number;
    includedHeight?: number;
    finalizedAt?: Date;
    reasonCode?: string;
    peiAdmissionGrantId?: string;
};

export type RewardReservationInput = {
    id: string;
    challengeId: string;
    challengeDay: string;
    walletAddress: string;
    calling: RewardEntitlement['calling'];
    seed: number;
    rewardLuna: bigint;
    dailyBudgetLuna: bigint;
    dailyAttemptLimit: number;
    paused: boolean;
    eligibilityTokenDigest: string;
    peiAdmissionRequired?: boolean;
    peiAdmission?: PeiAdmissionBinding;
    reservationExpiresAt: Date;
    now: Date;
};

export type RewardMatchEvidence = {
    challengeId: string;
    outcome: 'left' | 'expired' | 'player_win' | 'loomkeeper_win' | 'draw';
    finalTick: number | null;
    finalStateHash: string | null;
    replay?: RewardCoordinatorReplay;
    claimNonceDigest?: string;
    claimNonceExpiresAt?: Date;
    now: Date;
};

export type RewardClaimInput = {
    entitlementId: string;
    walletAddress: string;
    claimNonceDigest: string;
    idempotencyKey: string;
    requestDigest: string;
    now: Date;
};

export type SignedPayout = {
    entitlementId: string;
    serializedTransaction: string;
    transactionHash: string;
    validityStartHeight: number;
    now: Date;
};

export type RewardStore = {
    initialize(): Promise<void>;
    close(): Promise<void>;
    forfeitInProgressOnStartup(now: Date): Promise<number>;
    withPayoutLease<T>(operation: () => Promise<T>): Promise<T | undefined>;
    info(day: string, config: RewardConfig): Promise<RewardInfoData>;
    issuePeiQualification(input: PeiQualificationInput): Promise<PeiQualificationGrant>;
    peiQualificationStatus(
        grantId: string,
        walletAddress: string
    ): Promise<PeiQualificationGrant | undefined>;
    reserve(input: RewardReservationInput): Promise<RewardEntitlement>;
    start(
        challengeId: string,
        walletAddress: string,
        eligibilityTokenDigest: string,
        now: Date
    ): Promise<RewardEntitlement>;
    cancelReserved(challengeId: string, walletAddress: string, now: Date): Promise<void>;
    expireReservations(now: Date): Promise<number>;
    completeMatch(input: RewardMatchEvidence): Promise<RewardEntitlement>;
    rotateClaimNonce(
        entitlementId: string,
        walletAddress: string,
        nonceDigest: string,
        expiresAt: Date,
        now: Date
    ): Promise<RewardEntitlement>;
    claim(input: RewardClaimInput): Promise<RewardEntitlement>;
    status(entitlementId: string, walletAddress: string): Promise<RewardEntitlement | undefined>;
    recoverable(
        walletAddress: string,
        challengeDay: string
    ): Promise<RewardEntitlement | undefined>;
    listQueued(limit: number): Promise<RewardEntitlement[]>;
    listReconcilable(limit: number): Promise<RewardEntitlement[]>;
    markSigned(input: SignedPayout): Promise<RewardEntitlement>;
    markBroadcastUnknown(entitlementId: string, now: Date): Promise<RewardEntitlement>;
    markIncluded(
        entitlementId: string,
        transactionHash: string,
        includedHeight: number,
        now: Date
    ): Promise<RewardEntitlement>;
    markFinalized(entitlementId: string, now: Date): Promise<RewardEntitlement>;
    markManualReview(
        entitlementId: string,
        reasonCode: string,
        now: Date
    ): Promise<RewardEntitlement>;
};

export class RewardStoreError extends Error {
    public constructor(
        public readonly code:
            | 'disabled'
            | 'paused'
            | 'exhausted'
            | 'ineligible'
            | 'conflict'
            | 'not_found'
            | 'expired'
            | 'invalid_state'
            | 'unavailable',
        message: string
    ) {
        super(message);
        this.name = 'RewardStoreError';
    }
}

export function entitlementUpdate(
    entitlement: RewardEntitlement,
    claimNonce?: string
): RewardUpdateData {
    return {
        entitlementId: entitlement.id,
        challengeId: entitlement.challengeId,
        challengeDay: entitlement.challengeDay,
        rewardLuna: entitlement.rewardLuna.toString(),
        recipient: entitlement.walletAddress,
        state: entitlement.state,
        ...(claimNonce ? { claimNonce } : {}),
        ...(entitlement.transactionHash
            ? { transactionHash: entitlement.transactionHash }
            : {}),
        ...(entitlement.finalizedAt
            ? { finalizedAt: entitlement.finalizedAt.toISOString() }
            : {}),
        message: rewardStateMessage(entitlement.state)
    };
}

function rewardStateMessage(state: RewardPayoutState): string {
    switch (state) {
        case 'reserved': return 'Your fixed reward is reserved for this Daily Challenge.';
        case 'in_progress': return 'The rewarded Daily Challenge is in progress.';
        case 'lost': return 'This Daily Challenge did not earn a reward. Practice remains available.';
        case 'forfeited': return 'The rewarded attempt was forfeited. Practice remains available.';
        case 'expired': return 'The reward reservation expired before the challenge started.';
        case 'cancelled': return 'The reward reservation was cancelled.';
        case 'claimable': return 'Your server-verified win is ready to claim.';
        case 'queued': return 'Your fixed reward is queued for processing.';
        case 'signed': return 'The payout is signed and awaiting broadcast.';
        case 'broadcast_unknown': return 'The payout was submitted and is being reconciled.';
        case 'included': return 'The payout is included and awaiting finality.';
        case 'finalized': return 'The fixed NIM reward is finalized.';
        case 'manual_review': return 'The payout needs operator review; no replacement was sent.';
    }
}
