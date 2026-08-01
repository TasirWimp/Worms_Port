import { createHash, randomBytes } from 'crypto';

import type {
    ChallengeResult,
    RewardInfoData,
    RewardReservationData,
    RewardUpdateData,
    WalletIdentity
} from '../../../shared/protocol';
import type { PlayerCalling } from '../../../shared/simulation';
import type { CoordinatorReplay } from '../simulation/coordinator';
import { SimulationCoordinator } from '../simulation/coordinator';
import { opaqueId, tokenDigest } from '../session/token';
import {
    RewardStoreError,
    entitlementUpdate,
    type RewardConfig,
    type RewardEntitlement,
    type RewardStore
} from './types';

export type RewardServiceOptions = {
    now?: () => Date;
    seedSource?: () => number;
    idSource?: () => string;
    tokenSource?: () => string;
    onQueued?: () => void;
};

export class RewardService {
    private readonly now: () => Date;
    private readonly seedSource: () => number;
    private readonly idSource: () => string;
    private readonly tokenSource: () => string;
    private readonly onQueued?: () => void;

    public constructor(
        public readonly config: RewardConfig,
        private readonly store?: RewardStore,
        options: RewardServiceOptions = {}
    ) {
        this.now = options.now ?? (() => new Date());
        this.seedSource = options.seedSource ?? (() => randomBytes(4).readUInt32BE());
        this.idSource = options.idSource ?? opaqueId;
        this.tokenSource = options.tokenSource ?? (() => randomBytes(32).toString('base64url'));
        this.onQueued = options.onQueued;
        if (config.mode !== 'disabled' && !store) {
            throw new Error('Enabled rewards require a durable reward store.');
        }
    }

    public async initialize(): Promise<void> {
        await this.store?.initialize();
        if (this.store) {
            const now = this.now();
            await this.store.forfeitInProgressOnStartup(now);
            await this.store.expireReservations(now);
        }
    }

    public async close(): Promise<void> {
        await this.store?.close();
    }

    public async info(): Promise<RewardInfoData> {
        const day = challengeDay(this.now());
        if (this.config.mode === 'disabled') {
            return {
                status: 'disabled',
                challengeDay: day,
                rewardLuna: this.config.rewardLuna.toString(),
                reservationSeconds: Math.floor(this.config.reservationTtlMs / 1000),
                turnLimit: this.config.turnLimit
            };
        }
        return this.requireStore().info(day, this.config);
    }

    public async reserve(
        identity: WalletIdentity | undefined,
        calling: PlayerCalling
    ): Promise<RewardReservationData> {
        this.ensureEnabled();
        if (!identity) {
            throw new RewardStoreError(
                'ineligible',
                'Authorize a Nimiq wallet before reserving a Daily Challenge.'
            );
        }
        const now = this.now();
        const rawToken = this.tokenSource();
        const challengeId = this.idSource();
        const entitlement = await this.requireStore().reserve({
            id: this.idSource(),
            challengeId,
            challengeDay: challengeDay(now),
            walletAddress: identity.address,
            calling,
            seed: this.seedSource() >>> 0,
            rewardLuna: this.config.rewardLuna,
            dailyBudgetLuna: this.config.dailyBudgetLuna,
            dailyAttemptLimit: this.config.testWalletAddress === identity.address
                ? this.config.testDailyAttemptLimit
                : 1,
            paused: this.config.paused,
            eligibilityTokenDigest: tokenDigest(rawToken),
            reservationExpiresAt: new Date(now.getTime() + this.config.reservationTtlMs),
            now
        });
        return {
            reservationId: entitlement.id,
            challengeId: entitlement.challengeId,
            eligibilityToken: rawToken,
            challengeDay: entitlement.challengeDay,
            rewardLuna: entitlement.rewardLuna.toString(),
            recipient: entitlement.walletAddress,
            calling: entitlement.calling,
            expiresAt: entitlement.reservationExpiresAt.toISOString()
        };
    }

    public async start(
        identity: WalletIdentity | undefined,
        challengeId: string,
        eligibilityToken: string
    ): Promise<RewardEntitlement> {
        this.ensureEnabled();
        if (!identity) {
            throw new RewardStoreError('ineligible', 'Wallet authorization is required.');
        }
        return this.requireStore().start(
            challengeId,
            identity.address,
            tokenDigest(eligibilityToken),
            this.now()
        );
    }

    public async cancelReservation(
        identity: WalletIdentity | undefined,
        challengeId: string
    ): Promise<void> {
        if (!identity || !this.store) return;
        await this.store.cancelReserved(challengeId, identity.address, this.now());
    }

    public async completeMatch(
        result: ChallengeResult,
        replay?: CoordinatorReplay
    ): Promise<RewardUpdateData | undefined> {
        if (!this.store) return undefined;
        if (result.outcome === 'player_win') {
            if (!replay || replay.challengeId !== result.challengeId ||
                replay.sessionId !== result.sessionId ||
                result.finalTick === null || !result.finalStateHash) {
                throw new RewardStoreError(
                    'unavailable',
                    'Authoritative reward evidence is incomplete.'
                );
            }
            try {
                const verified = new SimulationCoordinator().reconstructAndVerify(replay);
                if (verified.state.phase !== 'finished' ||
                    verified.state.winner !== 'player' ||
                    verified.state.tick !== result.finalTick ||
                    verified.stateHash !== result.finalStateHash) {
                    throw new Error('The replay does not prove the reported player win.');
                }
            } catch {
                throw new RewardStoreError(
                    'unavailable',
                    'Authoritative reward evidence failed verification.'
                );
            }
        }
        const rawClaimNonce = result.outcome === 'player_win' ? this.tokenSource() : undefined;
        const now = this.now();
        const entitlement = await this.store.completeMatch({
            challengeId: result.challengeId,
            outcome: result.outcome,
            finalTick: result.finalTick,
            finalStateHash: result.finalStateHash,
            replay,
            ...(rawClaimNonce
                ? {
                    claimNonceDigest: tokenDigest(rawClaimNonce),
                    claimNonceExpiresAt: new Date(now.getTime() + this.config.claimTtlMs)
                }
                : {}),
            now
        });
        return entitlementUpdate(entitlement, rawClaimNonce);
    }

    public async claim(
        identity: WalletIdentity | undefined,
        entitlementId: string,
        claimNonce: string,
        idempotencyKey: string
    ): Promise<RewardUpdateData> {
        this.ensureEnabled();
        if (!identity) {
            throw new RewardStoreError('ineligible', 'Wallet authorization is required.');
        }
        if (this.config.paused) {
            throw new RewardStoreError('paused', 'Sponsor rewards are paused.');
        }
        const nonceDigest = tokenDigest(claimNonce);
        const entitlement = await this.requireStore().claim({
            entitlementId,
            walletAddress: identity.address,
            claimNonceDigest: nonceDigest,
            idempotencyKey,
            requestDigest: claimRequestDigest(entitlementId, identity.address, nonceDigest),
            now: this.now()
        });
        this.onQueued?.();
        return entitlementUpdate(entitlement);
    }

    public async status(
        identity: WalletIdentity | undefined,
        entitlementId?: string
    ): Promise<RewardUpdateData> {
        this.ensureEnabled();
        if (!identity) {
            throw new RewardStoreError('ineligible', 'Wallet authorization is required.');
        }
        let entitlement = entitlementId
            ? await this.requireStore().status(entitlementId, identity.address)
            : await this.requireStore().recoverable(
                identity.address,
                challengeDay(this.now())
            );
        if (!entitlementId && entitlement &&
            this.config.testWalletAddress === identity.address &&
            entitlement.attemptNumber < this.config.testDailyAttemptLimit &&
            ['lost', 'forfeited', 'finalized'].includes(entitlement.state)) {
            entitlement = undefined;
        }
        if (!entitlement) {
            throw new RewardStoreError('not_found', 'Reward entitlement not found.');
        }
        let rawClaimNonce: string | undefined;
        if (entitlement.state === 'claimable') {
            rawClaimNonce = this.tokenSource();
            const now = this.now();
            entitlement = await this.requireStore().rotateClaimNonce(
                entitlement.id,
                identity.address,
                tokenDigest(rawClaimNonce),
                new Date(now.getTime() + this.config.claimTtlMs),
                now
            );
        }
        return entitlementUpdate(entitlement, rawClaimNonce);
    }

    private ensureEnabled(): void {
        if (this.config.mode === 'disabled') {
            throw new RewardStoreError('disabled', 'Sponsor rewards are disabled.');
        }
        if (this.config.paused) {
            throw new RewardStoreError('paused', 'Sponsor rewards are paused.');
        }
    }

    private requireStore(): RewardStore {
        if (!this.store) {
            throw new RewardStoreError(
                'unavailable',
                'Reward storage is temporarily unavailable.'
            );
        }
        return this.store;
    }
}

function challengeDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function claimRequestDigest(
    entitlementId: string,
    walletAddress: string,
    claimNonceDigest: string
): string {
    return createHash('sha256')
        .update(`${entitlementId}\n${walletAddress}\n${claimNonceDigest}`, 'utf8')
        .digest('base64url');
}
