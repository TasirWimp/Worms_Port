import {
    PEI_PROTOCOL,
    PEI_PROXY,
    PEI_REQUESTER,
    PEI_VERSION,
    decodePeiJourneyV0,
    decodePeiProofV0,
    encodePeiProofV0,
    encodePeiRequestV0,
    newPeiNonceV0,
    peiProofHashV0,
    peiRequestCommitmentV0,
    type PeiProofV0,
    type PeiRequestV0
} from '../../../shared/pei-v0';
import type { PeiLaunchData, PeiQualifiedData } from '../../../shared/pei-wire-v0';
import { normalizeNimiqAddress } from '../identity/crypto';
import type { RewardService } from '../reward/service';
import { RewardStoreError } from '../reward/types';
import {
    MemoryPeiJourneyStoreV0,
    type PeiJourneyStateV0,
    type PeiJourneyStoreV0
} from './store';
import { authenticateRequest, type PeiRuntimeConfigV0 } from './runtime-contract';
import type { PeiChainAdapterV0 } from './verifier';
import { verifyPeiJourneyV0, verifyPeiProofV0 } from './verifier';

export type { PeiRuntimeConfigV0 } from './runtime-contract';

export type PeiCoordinatorOptionsV0 = {
    config: PeiRuntimeConfigV0;
    adapter: PeiChainAdapterV0;
    rewards: RewardService;
    now?: () => Date;
    nonceSource?: () => string;
    journeyStore?: PeiJourneyStoreV0;
};

export class PeiCoordinatorV0 {
    private readonly now: () => Date;
    private readonly nonceSource: () => string;
    private readonly journeyStore: PeiJourneyStoreV0;

    public constructor(private readonly options: PeiCoordinatorOptionsV0) {
        this.now = options.now ?? (() => new Date());
        this.nonceSource = options.nonceSource ?? newPeiNonceV0;
        this.journeyStore = options.journeyStore ?? new MemoryPeiJourneyStoreV0();
    }

    public async initialize(): Promise<void> {
        await this.journeyStore.initialize();
    }

    public async close(): Promise<void> {
        await this.journeyStore.close();
    }

    public async begin(_sessionId: string, walletAddress: string): Promise<PeiLaunchData> {
        const wallet = normalizeNimiqAddress(walletAddress);
        const request = this.request(wallet, 'earn', null);
        const commitment = await peiRequestCommitmentV0(request);
        try {
            await this.journeyStore.begin({
                walletAddress: wallet,
                earnRequestCommitment: commitment,
                expiresAt: new Date(request.expiresAt * 1_000)
            }, this.now());
        } catch {
            throw PeiCoordinatorError.unavailable();
        }
        return this.launch(request);
    }

    public async acceptEarn(
        _sessionId: string,
        walletAddress: string,
        carrier: string
    ): Promise<PeiLaunchData> {
        const proof = decodePeiProofV0(carrier);
        const commitment = await peiRequestCommitmentV0(proof.request);
        const state = await this.requirePending(commitment, walletAddress);
        const verification = await verifyPeiProofV0(proof, 'earn', {
            adapter: this.options.adapter,
            config: this.options.config,
            nowSeconds: this.nowSeconds(),
            expectedSubject: state.walletAddress,
            expectedEarnCommitment: state.earnRequestCommitment
        });
        if (verification.status !== 'valid') throw PeiCoordinatorError.fromVerification(verification);
        if (state.earnProof && state.spendRequest) {
            if (await peiProofHashV0(state.earnProof) !== verification.proofHash) {
                throw new PeiCoordinatorError(
                    'invalid',
                    'The PEI earn proof does not match the accepted journey.',
                    false
                );
            }
            return this.launch(state.spendRequest, state.earnProof);
        }
        const request = this.request(state.walletAddress, 'spend', verification.proofHash);
        let accepted: PeiJourneyStateV0;
        try {
            accepted = await this.journeyStore.acceptEarn(
                commitment,
                verification.proof,
                request,
                this.now()
            );
        } catch {
            throw PeiCoordinatorError.unavailable();
        }
        if (!accepted.earnProof || !accepted.spendRequest ||
            await peiProofHashV0(accepted.earnProof) !== verification.proofHash) {
            throw new PeiCoordinatorError(
                'invalid',
                'The PEI earn proof does not match the accepted journey.',
                false
            );
        }
        return this.launch(accepted.spendRequest, accepted.earnProof);
    }

    public async complete(
        _sessionId: string,
        walletAddress: string,
        carrier: string
    ): Promise<PeiQualifiedData> {
        const journey = decodePeiJourneyV0(carrier);
        const commitment = await peiRequestCommitmentV0(journey.proofs[0].request);
        const state = await this.requirePending(commitment, walletAddress);
        if (!state.earnProof || !state.spendRequest) {
            throw new PeiCoordinatorError('invalid', 'PEI earn step has not been accepted.', false);
        }
        const earnProofHash = await peiProofHashV0(state.earnProof);
        const spendRequestCommitment = await peiRequestCommitmentV0(state.spendRequest);
        if (await peiProofHashV0(journey.proofs[0]) !== earnProofHash ||
            await peiRequestCommitmentV0(journey.proofs[1].request) !== spendRequestCommitment) {
            throw new PeiCoordinatorError('invalid', 'PEI return does not match the active journey.', false);
        }
        const verification = await verifyPeiJourneyV0(journey, {
            adapter: this.options.adapter,
            config: this.options.config,
            nowSeconds: this.nowSeconds(),
            expectedSubject: state.walletAddress,
            expectedEarnCommitment: state.earnRequestCommitment
        });
        if (verification.status !== 'valid') throw PeiCoordinatorError.fromVerification(verification);
        let receipt: Awaited<ReturnType<RewardService['issuePeiReceipt']>>;
        try {
            receipt = await this.options.rewards.issuePeiReceipt(verification.qualification);
        } catch (error) {
            if (error instanceof RewardStoreError && error.code === 'expired') {
                throw new PeiCoordinatorError(
                    'invalid',
                    'The PEI proof expired before it could be recorded. Start again.',
                    false
                );
            }
            throw PeiCoordinatorError.unavailable();
        }
        return {
            step: 'qualified',
            receipt,
            edges: ['earned', 'spent'],
            transactionHashes: [
                verification.transactionHashes[0],
                verification.transactionHashes[1]
            ]
        };
    }

    public closeSession(_sessionId: string): void {}

    private request(
        walletAddress: string,
        action: 'earn' | 'spend',
        parentProofHash: string | null
    ): PeiRequestV0 {
        const issuedAt = this.nowSeconds();
        return {
            protocol: PEI_PROTOCOL,
            version: PEI_VERSION,
            requester: PEI_REQUESTER,
            requesterOrigin: this.options.config.requesterOrigin,
            proxy: PEI_PROXY,
            network: this.options.config.network,
            subject: walletAddress,
            action,
            nonce: this.nonceSource(),
            issuedAt,
            expiresAt: issuedAt + this.options.config.requestTtlSeconds,
            parentProofHash,
            returnUri: this.options.config.returnUri,
            minAmountLuna: action === 'earn'
                ? this.options.config.earnAmountLuna
                : this.options.config.spendAmountLuna
        };
    }

    private launch(request: PeiRequestV0, earnProof?: PeiProofV0): PeiLaunchData {
        const requestCarrier = encodePeiRequestV0(request);
        const auth = authenticateRequest(requestCarrier, this.options.config.requestAuthSecret);
        const url = new URL(this.options.config.proxyOrigin);
        url.hash = `/pei/${requestCarrier}/${auth}${earnProof ? `/${encodePeiProofV0(earnProof)}` : ''}`;
        return {
            step: request.action,
            launchUrl: url.toString(),
            expiresAt: new Date(request.expiresAt * 1_000).toISOString()
        };
    }

    private async requirePending(
        commitment: string,
        walletAddress: string
    ): Promise<PeiJourneyStateV0> {
        let state: PeiJourneyStateV0 | undefined;
        try {
            state = await this.journeyStore.get(commitment);
        } catch {
            throw PeiCoordinatorError.unavailable();
        }
        let wallet: string;
        try {
            wallet = normalizeNimiqAddress(walletAddress);
        } catch {
            throw new PeiCoordinatorError('invalid', 'A valid authorized wallet is required.', false);
        }
        if (!state || state.walletAddress !== wallet || state.expiresAt.getTime() <= this.now().getTime()) {
            throw new PeiCoordinatorError('invalid', 'Start a fresh PEI journey for this wallet.', false);
        }
        return state;
    }

    private nowSeconds(): number {
        return Math.floor(this.now().getTime() / 1_000);
    }
}

export class PeiCoordinatorError extends Error {
    public constructor(
        public readonly kind: 'invalid' | 'inconclusive' | 'unavailable',
        message: string,
        public readonly retryable: boolean
    ) {
        super(message);
        this.name = 'PeiCoordinatorError';
    }

    public static fromVerification(
        verification: { status: 'invalid' | 'inconclusive'; reason: string }
    ): PeiCoordinatorError {
        return verification.status === 'inconclusive'
            ? new PeiCoordinatorError(
                'inconclusive',
                'The PEI transaction is not final yet. Wait, then retry verification.',
                true
            )
            : new PeiCoordinatorError(
                'invalid',
                `The PEI proof is invalid (${verification.reason}).`,
                false
            );
    }

    public static unavailable(): PeiCoordinatorError {
        return new PeiCoordinatorError(
            'unavailable',
            'PEI storage is temporarily unavailable. Retry without repeating a transfer.',
            true
        );
    }
}
