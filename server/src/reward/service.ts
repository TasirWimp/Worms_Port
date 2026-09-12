import { createHash, randomBytes } from 'crypto';

import type {
    ChallengeResult,
    RewardInfoData,
    RewardReservationData,
    RewardUpdateData,
    WalletIdentity,
    PeiAdmissionCredential
} from '../../../shared/protocol';
import { NormalizedNimiqAddressSchema } from '../../../shared/protocol';
import { ChallengeResultV8AutomatedSchema,
    type ChallengeResultV8Automated } from '../../../shared/protocol-v8';
import { ChallengeResultV9Schema, type ChallengeResultV9,
    type CoordinatorReplayV9Automated } from '../../../shared/protocol-v9';
import { ChallengeResultV10Schema, type ChallengeResultV10,
    type CoordinatorReplayV10Automated } from '../../../shared/protocol-v10-live';
import type { PlayerCalling } from '../../../shared/simulation';
import type { CoordinatorReplay } from '../simulation/coordinator';
import { SimulationCoordinator } from '../simulation/coordinator';
import { VersionedSimulationCoordinator } from '../simulation/versioned-coordinator';
import { opaqueId, tokenDigest } from '../session/token';
import {
    RewardStoreError,
    entitlementUpdate,
    type RewardConfig,
    type RewardEntitlement,
    type RewardCoordinatorReplay,
    type RewardStore,
    type IssuedPeiAdmission,
    type VerifiedPeiQualification
} from './types';

export type RewardServiceOptions = {
    now?: () => Date;
    seedSource?: () => number;
    idSource?: () => string;
    tokenSource?: () => string;
    peiGrantIdSource?: () => string;
    peiGrantTokenSource?: () => string;
    onQueued?: () => void;
};

export class RewardService {
    private readonly now: () => Date;
    private readonly seedSource: () => number;
    private readonly idSource: () => string;
    private readonly tokenSource: () => string;
    private readonly peiGrantIdSource: () => string;
    private readonly peiGrantTokenSource: () => string;
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
        this.peiGrantIdSource = options.peiGrantIdSource ?? opaqueId;
        this.peiGrantTokenSource = options.peiGrantTokenSource ??
            (() => randomBytes(32).toString('base64url'));
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
                peiRequired: false,
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
        calling: PlayerCalling,
        peiAdmission?: PeiAdmissionCredential
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
        if (this.config.peiRequired && !peiAdmission) {
            throw new RewardStoreError(
                'ineligible',
                'Complete the PEI interaction before reserving today’s rewarded match.'
            );
        }
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
            peiAdmissionRequired: this.config.peiRequired === true,
            ...(this.config.peiRequired && peiAdmission
                ? {
                    peiAdmission: {
                        grantId: peiAdmission.grantId,
                        tokenDigest: tokenDigest(peiAdmission.token)
                    }
                }
                : {}),
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

    public async issuePeiQualification(
        qualification: VerifiedPeiQualification
    ): Promise<IssuedPeiAdmission> {
        this.ensureEnabled();
        if (!this.config.peiRequired) {
            throw new RewardStoreError('disabled', 'PEI admission is not enabled.');
        }
        const wallet = NormalizedNimiqAddressSchema.safeParse(qualification.walletAddress);
        if (!wallet.success || !/^[A-Za-z0-9_-]{43}$/.test(qualification.qualificationDigest)) {
            throw new RewardStoreError('ineligible', 'Verified PEI qualification is malformed.');
        }
        const now = this.now();
        if (!(qualification.expiresAt instanceof Date) ||
            !Number.isFinite(qualification.expiresAt.getTime()) ||
            qualification.expiresAt.getTime() < now.getTime() + this.config.reservationTtlMs) {
            throw new RewardStoreError(
                'expired',
                'Verified PEI qualification must cover the reward reservation window.'
            );
        }
        const token = this.peiGrantTokenSource();
        const input = {
            id: this.peiGrantIdSource(),
            walletAddress: wallet.data,
            challengeDay: challengeDay(now),
            qualificationDigest: qualification.qualificationDigest,
            tokenDigest: tokenDigest(token),
            issuedAt: now,
            expiresAt: new Date(qualification.expiresAt)
        };
        const grant = await this.requireStore().issuePeiQualification(input);
        return {
            grantId: grant.id,
            token,
            challengeDay: grant.challengeDay,
            expiresAt: grant.expiresAt.toISOString()
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
        result: ChallengeResult | ChallengeResultV8Automated | ChallengeResultV9 | ChallengeResultV10,
        replay?: RewardCoordinatorReplay
    ): Promise<RewardUpdateData | undefined> {
        if (!this.store) return undefined;
        if (result.protocolVersion === 10) {
            const parsedResult = ChallengeResultV10Schema.safeParse(result);
            const v10Replay = replay as CoordinatorReplayV10Automated | undefined;
            if (!parsedResult.success || !v10Replay || v10Replay.automationId !== result.automationId ||
                v10Replay.challengeId !== result.challengeId || v10Replay.sessionId !== result.sessionId ||
                v10Replay.rulesetId !== result.rulesetId) {
                throw new RewardStoreError('unavailable', 'Authoritative V10 reward evidence is incomplete.');
            }
            try {
                const verified = new VersionedSimulationCoordinator().reconstructAndVerify(
                    v10Replay, { challengeId: result.challengeId, sessionId: result.sessionId }
                );
                const expectedWinner = result.outcome === 'player_win' ? 'player'
                    : result.outcome === 'loomkeeper_win' ? 'loomkeeper'
                    : result.outcome === 'draw' ? 'draw' : null;
                if (verified.state.phase !== 'finished' ||
                    (expectedWinner !== null && verified.state.winner !== expectedWinner) ||
                    verified.state.tick !== result.finalTick || verified.stateHash !== result.finalStateHash) {
                    throw new Error('The V10 automated replay does not prove the reported result.');
                }
            } catch {
                throw new RewardStoreError('unavailable', 'Authoritative V10 reward evidence failed verification.');
            }
        } else if (result.protocolVersion === 9) {
            const parsedResult = ChallengeResultV9Schema.safeParse(result);
            const v9Replay = replay as CoordinatorReplayV9Automated | undefined;
            if (!parsedResult.success || !v9Replay || v9Replay.automationId !== result.automationId ||
                v9Replay.challengeId !== result.challengeId || v9Replay.sessionId !== result.sessionId ||
                v9Replay.rulesetId !== result.rulesetId || v9Replay.loomkeeperPolicyId !== result.loomkeeperPolicyId ||
                v9Replay.loomkeeperProfileId !== result.loomkeeperProfileId) {
                throw new RewardStoreError('unavailable', 'Authoritative V9 reward evidence is incomplete.');
            }
            try {
                const verified = new VersionedSimulationCoordinator().reconstructAndVerify(
                    v9Replay, { challengeId: result.challengeId, sessionId: result.sessionId }
                );
                const expectedWinner = result.outcome === 'player_win' ? 'player'
                    : result.outcome === 'loomkeeper_win' ? 'loomkeeper'
                    : result.outcome === 'draw' ? 'draw' : null;
                if (verified.state.phase !== 'finished' ||
                    (expectedWinner !== null && verified.state.winner !== expectedWinner) ||
                    verified.state.tick !== result.finalTick || verified.stateHash !== result.finalStateHash) {
                    throw new Error('The V9 automated replay does not prove the reported result.');
                }
            } catch {
                throw new RewardStoreError('unavailable', 'Authoritative V9 reward evidence failed verification.');
            }
        } else if (result.protocolVersion === 8 || 'automationId' in result || (replay && 'formatVersion' in replay)) {
            const parsedResult = ChallengeResultV8AutomatedSchema.safeParse(result);
            if (!parsedResult.success || !replay || !('automationId' in replay) ||
                replay.challengeId !== parsedResult.data.challengeId ||
                replay.sessionId !== parsedResult.data.sessionId ||
                replay.rulesetId !== parsedResult.data.rulesetId ||
                replay.automationId !== parsedResult.data.automationId ||
                replay.loomkeeperPolicyId !== parsedResult.data.loomkeeperPolicyId ||
                replay.loomkeeperProfileId !== parsedResult.data.loomkeeperProfileId) {
                throw new RewardStoreError('unavailable', 'Authoritative automated reward evidence is incomplete.');
            }
            try {
                // The coordinator applies byte/record caps before strict schema allocation.
                const verified = new VersionedSimulationCoordinator().reconstructAndVerify(
                    replay, { challengeId: result.challengeId, sessionId: result.sessionId }
                );
                const expectedWinner = result.outcome === 'player_win' ? 'player'
                    : result.outcome === 'loomkeeper_win' ? 'loomkeeper'
                    : result.outcome === 'draw' ? 'draw' : null;
                if (verified.state.phase !== 'finished' ||
                    (expectedWinner !== null && verified.state.winner !== expectedWinner) ||
                    verified.state.tick !== result.finalTick || verified.stateHash !== result.finalStateHash) {
                    throw new Error('The automated replay does not prove the reported result.');
                }
            } catch {
                throw new RewardStoreError('unavailable', 'Authoritative automated reward evidence failed verification.');
            }
        } else if (result.outcome === 'player_win') {
            if (!replay || replay.challengeId !== result.challengeId ||
                replay.sessionId !== result.sessionId ||
                result.finalTick === null || !result.finalStateHash) {
                throw new RewardStoreError(
                    'unavailable',
                    'Authoritative reward evidence is incomplete.'
                );
            }
            try {
                const verified = new SimulationCoordinator().reconstructAndVerify(replay as CoordinatorReplay);
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
