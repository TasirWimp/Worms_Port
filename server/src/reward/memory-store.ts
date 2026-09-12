import type { RewardInfoData, RewardPayoutState } from '../../../shared/protocol';
import {
    RewardStoreError,
    type PeiQualificationGrant,
    type PeiQualificationInput,
    type RewardClaimInput,
    type RewardConfig,
    type RewardEntitlement,
    type RewardMatchEvidence,
    type RewardReservationInput,
    type RewardStore,
    type SignedPayout
} from './types';

type RewardDay = {
    rewardLuna: bigint;
    dailyBudgetLuna: bigint;
    committedLuna: bigint;
    paidLuna: bigint;
    paused: boolean;
};

type StoredEntitlement = RewardEntitlement & {
    eligibilityTokenDigest?: string;
    claimNonceDigest?: string;
    claimNonceExpiresAt?: Date;
};

const MAX_DAILY_RESERVATIONS_PER_WALLET = 5;

export class MemoryRewardStore implements RewardStore {
    private readonly days = new Map<string, RewardDay>();
    private readonly entitlements = new Map<string, StoredEntitlement>();
    private readonly challengeIndex = new Map<string, string>();
    private readonly claims = new Map<string, { entitlementId: string; requestDigest: string }>();
    private readonly peiQualifications = new Map<string, PeiQualificationGrant>();
    private mutex = Promise.resolve();
    private payoutLease = false;

    public async initialize(): Promise<void> {}
    public async close(): Promise<void> {}

    public async forfeitInProgressOnStartup(_now: Date): Promise<number> {
        return this.lock(async () => {
            let forfeited = 0;
            for (const entitlement of this.entitlements.values()) {
                if (entitlement.state !== 'in_progress') continue;
                entitlement.state = 'forfeited';
                this.days.get(entitlement.challengeDay)!.committedLuna -=
                    entitlement.rewardLuna;
                forfeited += 1;
            }
            return forfeited;
        });
    }

    public async withPayoutLease<T>(operation: () => Promise<T>): Promise<T | undefined> {
        if (this.payoutLease) return undefined;
        this.payoutLease = true;
        try {
            return await operation();
        } finally {
            this.payoutLease = false;
        }
    }

    public async info(day: string, config: RewardConfig): Promise<RewardInfoData> {
        return this.lock(async () => {
            const rewardDay = this.day(day, config);
            return {
                status: config.mode === 'disabled'
                    ? 'disabled'
                    : rewardDay.paused
                        ? 'paused'
                        : rewardDay.committedLuna + config.rewardLuna >
                            rewardDay.dailyBudgetLuna
                            ? 'exhausted'
                            : 'available',
                peiRequired: config.peiRequired === true,
                challengeDay: day,
                rewardLuna: config.rewardLuna.toString(),
                reservationSeconds: Math.floor(config.reservationTtlMs / 1000),
                turnLimit: config.turnLimit
            };
        });
    }

    public async issuePeiQualification(
        input: PeiQualificationInput
    ): Promise<PeiQualificationGrant> {
        return this.lock(async () => {
            if (this.peiQualifications.has(input.id)) {
                throw new RewardStoreError('conflict', 'PEI admission grant already exists.');
            }
            const grant: PeiQualificationGrant = {
                ...input,
                issuedAt: new Date(input.issuedAt),
                expiresAt: new Date(input.expiresAt)
            };
            this.peiQualifications.set(grant.id, grant);
            return cloneGrant(grant);
        });
    }

    public async peiQualificationStatus(
        grantId: string,
        walletAddress: string
    ): Promise<PeiQualificationGrant | undefined> {
        return this.lock(async () => {
            const grant = this.peiQualifications.get(grantId);
            return grant?.walletAddress === walletAddress ? cloneGrant(grant) : undefined;
        });
    }

    public async reserve(input: RewardReservationInput): Promise<RewardEntitlement> {
        return this.lock(async () => {
            const dailyAttemptLimit = input.dailyAttemptLimit ?? 1;
            this.expireUnlocked(input.now);
            const day = this.day(input.challengeDay, {
                mode: 'record-only',
                rewardLuna: input.rewardLuna,
                feeLuna: 0n,
                dailyBudgetLuna: input.dailyBudgetLuna,
                reservationTtlMs: 1,
                claimTtlMs: 1,
                turnLimit: 1,
                paused: input.paused,
                network: 'test-albatross',
                testDailyAttemptLimit: 1
            });
            if (day.paused) throw new RewardStoreError('paused', 'Sponsor rewards are paused.');
            const peiGrant = this.validPeiGrantForReservation(input);
            let dailyReservations = 0;
            let consumedAttempts = 0;
            for (const existing of this.entitlements.values()) {
                if (existing.challengeDay !== input.challengeDay ||
                    existing.walletAddress !== input.walletAddress) continue;
                dailyReservations += 1;
                if (existing.attemptConsumed) {
                    consumedAttempts += 1;
                }
                if (existing.state === 'reserved') {
                    throw new RewardStoreError(
                        'conflict',
                        'An active reward reservation already exists for this wallet.'
                    );
                }
                if (existing.state === 'in_progress') {
                    throw new RewardStoreError(
                        'conflict',
                        'A rewarded challenge is already in progress for this wallet.'
                    );
                }
            }
            if (consumedAttempts >= dailyAttemptLimit) {
                throw new RewardStoreError(
                    'ineligible',
                    'This wallet already used today’s rewarded attempt.'
                );
            }
            if (dailyReservations >= MAX_DAILY_RESERVATIONS_PER_WALLET) {
                throw new RewardStoreError(
                    'ineligible',
                    'This wallet reached today\'s reservation-attempt limit.'
                );
            }
            if (day.committedLuna + input.rewardLuna > day.dailyBudgetLuna) {
                throw new RewardStoreError('exhausted', 'Today’s Prize Loom is exhausted.');
            }
            const entitlement: StoredEntitlement = {
                id: input.id,
                challengeId: input.challengeId,
                challengeDay: input.challengeDay,
                walletAddress: input.walletAddress,
                calling: input.calling,
                seed: input.seed,
                rewardLuna: input.rewardLuna,
                state: 'reserved',
                attemptConsumed: false,
                attemptNumber: consumedAttempts + 1,
                dailyAttemptLimit,
                reservationExpiresAt: new Date(input.reservationExpiresAt),
                eligibilityTokenDigest: input.eligibilityTokenDigest,
                ...(peiGrant ? { peiAdmissionGrantId: peiGrant.id } : {})
            };
            this.entitlements.set(entitlement.id, entitlement);
            this.challengeIndex.set(entitlement.challengeId, entitlement.id);
            day.committedLuna += entitlement.rewardLuna;
            return clone(entitlement);
        });
    }

    public async start(
        challengeId: string,
        walletAddress: string,
        eligibilityTokenDigest: string,
        now: Date
    ): Promise<RewardEntitlement> {
        return this.lock(async () => {
            const entitlement = this.byChallenge(challengeId);
            if (!entitlement || entitlement.walletAddress !== walletAddress ||
                entitlement.eligibilityTokenDigest !== eligibilityTokenDigest) {
                throw new RewardStoreError('ineligible', 'The reward reservation is invalid.');
            }
            if (entitlement.state === 'in_progress') return clone(entitlement);
            if (entitlement.state !== 'reserved') {
                throw new RewardStoreError('invalid_state', 'The reward reservation is closed.');
            }
            if (entitlement.reservationExpiresAt.getTime() <= now.getTime()) {
                this.release(entitlement, 'expired');
                throw new RewardStoreError('expired', 'The reward reservation expired.');
            }
            const peiGrant = entitlement.peiAdmissionGrantId
                ? this.peiQualifications.get(entitlement.peiAdmissionGrantId)
                : undefined;
            if (entitlement.peiAdmissionGrantId && (!peiGrant || peiGrant.consumedAt ||
                peiGrant.walletAddress !== walletAddress ||
                peiGrant.challengeDay !== entitlement.challengeDay ||
                peiGrant.expiresAt.getTime() <= now.getTime())) {
                throw new RewardStoreError(
                    'ineligible',
                    'The PEI admission grant is invalid or already used.'
                );
            }
            let consumedAttempts = 0;
            for (const existing of this.entitlements.values()) {
                if (existing.id !== entitlement.id &&
                    existing.challengeDay === entitlement.challengeDay &&
                    existing.walletAddress === walletAddress &&
                    existing.attemptConsumed) {
                    consumedAttempts += 1;
                }
            }
            if (consumedAttempts >= entitlement.dailyAttemptLimit) {
                throw new RewardStoreError(
                    'ineligible',
                    'This wallet already used today’s rewarded attempt.'
                );
            }
            entitlement.state = 'in_progress';
            entitlement.attemptConsumed = true;
            delete entitlement.eligibilityTokenDigest;
            if (peiGrant) {
                peiGrant.consumedAt = new Date(now);
                peiGrant.entitlementId = entitlement.id;
            }
            return clone(entitlement);
        });
    }

    public async cancelReserved(
        challengeId: string,
        walletAddress: string,
        _now: Date
    ): Promise<void> {
        return this.lock(async () => {
            const entitlement = this.byChallenge(challengeId);
            if (entitlement?.walletAddress === walletAddress && entitlement.state === 'reserved') {
                this.release(entitlement, 'cancelled');
            }
        });
    }

    public async expireReservations(now: Date): Promise<number> {
        return this.lock(async () => this.expireUnlocked(now));
    }

    public async completeMatch(input: RewardMatchEvidence): Promise<RewardEntitlement> {
        return this.lock(async () => {
            const entitlement = this.byChallenge(input.challengeId);
            if (!entitlement) {
                throw new RewardStoreError('not_found', 'Reward entitlement not found.');
            }
            if (entitlement.state !== 'in_progress') return clone(entitlement);
            if (input.replay && (
                input.replay.challengeId !== entitlement.challengeId ||
                input.replay.seed !== entitlement.seed ||
                input.replay.calling !== entitlement.calling
            )) {
                throw new RewardStoreError(
                    'conflict',
                    'Reward replay does not match the reserved challenge policy.'
                );
            }
            entitlement.state = input.outcome === 'player_win'
                ? 'claimable'
                : input.outcome === 'left'
                    ? 'forfeited'
                    : input.outcome === 'expired'
                        ? 'expired'
                        : 'lost';
            if (input.finalTick !== null) entitlement.finalTick = input.finalTick;
            if (input.finalStateHash) entitlement.finalStateHash = input.finalStateHash;
            if (input.replay) entitlement.replay = structuredClone(input.replay);
            if (entitlement.state === 'claimable') {
                entitlement.claimNonceDigest = input.claimNonceDigest;
                entitlement.claimNonceExpiresAt = input.claimNonceExpiresAt;
            } else {
                this.days.get(entitlement.challengeDay)!.committedLuna -=
                    entitlement.rewardLuna;
            }
            return clone(entitlement);
        });
    }

    public async rotateClaimNonce(
        entitlementId: string,
        walletAddress: string,
        nonceDigest: string,
        expiresAt: Date,
        _now: Date
    ): Promise<RewardEntitlement> {
        return this.lock(async () => {
            const entitlement = this.entitlements.get(entitlementId);
            if (!entitlement || entitlement.walletAddress !== walletAddress ||
                entitlement.state !== 'claimable') {
                throw new RewardStoreError('invalid_state', 'The reward is not claimable.');
            }
            entitlement.claimNonceDigest = nonceDigest;
            entitlement.claimNonceExpiresAt = new Date(expiresAt);
            return clone(entitlement);
        });
    }

    public async claim(input: RewardClaimInput): Promise<RewardEntitlement> {
        return this.lock(async () => {
            const previous = this.claims.get(input.idempotencyKey);
            if (previous) {
                if (previous.entitlementId !== input.entitlementId ||
                    previous.requestDigest !== input.requestDigest) {
                    throw new RewardStoreError(
                        'conflict',
                        'The idempotency key was already used for different claim data.'
                    );
                }
                return clone(this.require(input.entitlementId));
            }
            const entitlement = this.require(input.entitlementId);
            if (entitlement.walletAddress !== input.walletAddress) {
                throw new RewardStoreError('not_found', 'Reward entitlement not found.');
            }
            if (entitlement.state !== 'claimable') {
                throw new RewardStoreError('invalid_state', 'The reward is not claimable.');
            }
            if (!entitlement.claimNonceDigest ||
                entitlement.claimNonceDigest !== input.claimNonceDigest ||
                !entitlement.claimNonceExpiresAt ||
                entitlement.claimNonceExpiresAt.getTime() <= input.now.getTime()) {
                throw new RewardStoreError('expired', 'The claim authorization expired.');
            }
            for (const claim of this.claims.values()) {
                if (claim.entitlementId === entitlement.id) {
                    throw new RewardStoreError('conflict', 'This reward already has a claim.');
                }
            }
            this.claims.set(input.idempotencyKey, {
                entitlementId: input.entitlementId,
                requestDigest: input.requestDigest
            });
            entitlement.state = 'queued';
            delete entitlement.claimNonceDigest;
            delete entitlement.claimNonceExpiresAt;
            return clone(entitlement);
        });
    }

    public async status(
        entitlementId: string,
        walletAddress: string
    ): Promise<RewardEntitlement | undefined> {
        return this.lock(async () => {
            const entitlement = this.entitlements.get(entitlementId);
            return entitlement?.walletAddress === walletAddress
                ? clone(entitlement)
                : undefined;
        });
    }

    public async recoverable(
        walletAddress: string,
        challengeDay: string
    ): Promise<RewardEntitlement | undefined> {
        return this.lock(async () => {
            const entitlement = [...this.entitlements.values()]
                .reverse()
                .find((candidate) => candidate.walletAddress === walletAddress &&
                    candidate.challengeDay === challengeDay &&
                    (candidate.attemptConsumed || [
                        'claimable', 'queued', 'signed', 'broadcast_unknown',
                        'included', 'finalized', 'manual_review'
                    ].includes(candidate.state)));
            return entitlement ? clone(entitlement) : undefined;
        });
    }

    public async listQueued(limit: number): Promise<RewardEntitlement[]> {
        return this.states(['queued'], limit);
    }

    public async listReconcilable(limit: number): Promise<RewardEntitlement[]> {
        return this.states(['signed', 'broadcast_unknown', 'included'], limit);
    }

    public async markSigned(input: SignedPayout): Promise<RewardEntitlement> {
        return this.transition(input.entitlementId, ['queued'], 'signed', (entitlement) => {
            entitlement.signedTransaction = input.serializedTransaction;
            entitlement.transactionHash = input.transactionHash;
            entitlement.validityStartHeight = input.validityStartHeight;
        });
    }

    public async markBroadcastUnknown(
        entitlementId: string,
        _now: Date
    ): Promise<RewardEntitlement> {
        return this.transition(entitlementId, ['signed'], 'broadcast_unknown');
    }

    public async markIncluded(
        entitlementId: string,
        transactionHash: string,
        includedHeight: number,
        _now: Date
    ): Promise<RewardEntitlement> {
        return this.transition(
            entitlementId,
            ['signed', 'broadcast_unknown'],
            'included',
            (entitlement) => {
                entitlement.transactionHash = transactionHash;
                entitlement.includedHeight = includedHeight;
            }
        );
    }

    public async markFinalized(
        entitlementId: string,
        now: Date
    ): Promise<RewardEntitlement> {
        return this.transition(entitlementId, ['included'], 'finalized', (entitlement) => {
            entitlement.finalizedAt = new Date(now);
            this.days.get(entitlement.challengeDay)!.paidLuna += entitlement.rewardLuna;
        });
    }

    public async markManualReview(
        entitlementId: string,
        reasonCode: string,
        _now: Date
    ): Promise<RewardEntitlement> {
        return this.transition(
            entitlementId,
            ['queued', 'signed', 'broadcast_unknown'],
            'manual_review',
            (entitlement) => {
                entitlement.reasonCode = reasonCode;
            }
        );
    }

    private states(states: RewardPayoutState[], limit: number): Promise<RewardEntitlement[]> {
        return this.lock(async () => [...this.entitlements.values()]
            .filter((entitlement) => states.includes(entitlement.state))
            .slice(0, limit)
            .map(clone));
    }

    private transition(
        id: string,
        previous: RewardPayoutState[],
        next: RewardPayoutState,
        update?: (entitlement: StoredEntitlement) => void
    ): Promise<RewardEntitlement> {
        return this.lock(async () => {
            const entitlement = this.require(id);
            if (entitlement.state === next) return clone(entitlement);
            if (!previous.includes(entitlement.state)) {
                throw new RewardStoreError(
                    'invalid_state',
                    `Cannot move reward from ${entitlement.state} to ${next}.`
                );
            }
            update?.(entitlement);
            entitlement.state = next;
            return clone(entitlement);
        });
    }

    private day(day: string, config: RewardConfig): RewardDay {
        const existing = this.days.get(day);
        if (existing) {
            if (existing.rewardLuna !== config.rewardLuna ||
                existing.dailyBudgetLuna !== config.dailyBudgetLuna) {
                throw new RewardStoreError(
                    'conflict',
                    'Reward amount or daily budget changed after this challenge day opened.'
                );
            }
            existing.paused = config.paused;
            return existing;
        }
        const created: RewardDay = {
            rewardLuna: config.rewardLuna,
            dailyBudgetLuna: config.dailyBudgetLuna,
            committedLuna: 0n,
            paidLuna: 0n,
            paused: config.paused
        };
        this.days.set(day, created);
        return created;
    }

    private validPeiGrantForReservation(
        input: RewardReservationInput
    ): PeiQualificationGrant | undefined {
        if (!input.peiAdmissionRequired && !input.peiAdmission) return undefined;
        if (!input.peiAdmission) {
            throw new RewardStoreError(
                'ineligible',
                'A PEI admission grant is required for this Daily Challenge.'
            );
        }
        const grant = this.peiQualifications.get(input.peiAdmission.grantId);
        if (!grant || grant.walletAddress !== input.walletAddress ||
            grant.challengeDay !== input.challengeDay ||
            grant.tokenDigest !== input.peiAdmission.tokenDigest ||
            grant.consumedAt ||
            grant.expiresAt.getTime() < input.reservationExpiresAt.getTime()) {
            throw new RewardStoreError(
                'ineligible',
                'The PEI admission grant is invalid, expired, or already used.'
            );
        }
        return grant;
    }

    private release(
        entitlement: StoredEntitlement,
        next: 'expired' | 'cancelled'
    ): void {
        entitlement.state = next;
        delete entitlement.eligibilityTokenDigest;
        this.days.get(entitlement.challengeDay)!.committedLuna -= entitlement.rewardLuna;
    }

    private expireUnlocked(now: Date): number {
        let expired = 0;
        for (const entitlement of this.entitlements.values()) {
            if (entitlement.state === 'reserved' &&
                entitlement.reservationExpiresAt.getTime() <= now.getTime()) {
                this.release(entitlement, 'expired');
                expired += 1;
            }
        }
        return expired;
    }

    private byChallenge(challengeId: string): StoredEntitlement | undefined {
        const id = this.challengeIndex.get(challengeId);
        return id ? this.entitlements.get(id) : undefined;
    }

    private require(id: string): StoredEntitlement {
        const entitlement = this.entitlements.get(id);
        if (!entitlement) {
            throw new RewardStoreError('not_found', 'Reward entitlement not found.');
        }
        return entitlement;
    }

    private async lock<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.mutex;
        let release!: () => void;
        this.mutex = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        } finally {
            release();
        }
    }
}

function clone(entitlement: StoredEntitlement): RewardEntitlement {
    const copy = structuredClone(entitlement);
    delete copy.eligibilityTokenDigest;
    delete copy.claimNonceDigest;
    delete copy.claimNonceExpiresAt;
    return copy;
}

function cloneGrant(grant: PeiQualificationGrant): PeiQualificationGrant {
    return {
        ...grant,
        issuedAt: new Date(grant.issuedAt),
        expiresAt: new Date(grant.expiresAt),
        ...(grant.consumedAt ? { consumedAt: new Date(grant.consumedAt) } : {})
    };
}
