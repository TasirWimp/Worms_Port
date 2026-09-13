import {
    PEI_PROTOCOL,
    PEI_PROXY,
    PEI_REQUESTER,
    PEI_VERSION,
    base64UrlEncode,
    peiProofHashV0,
    peiRequestCommitmentV0,
    type PeiJourneyV0,
    type PeiProofV0,
    type PeiRequestV0
} from '../../shared/pei-v0';
import type {
    PeiChainAdapterV0,
    PeiChainTransactionV0,
    PeiVerifierConfigV0
} from '../../server/src/pei/verifier';

export const PEI_NOW_SECONDS = 1_800_000_000;
export const PEI_WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
export const PEI_PROXY_ADDRESS = 'NQ34 61R8 YJUA KLDJ 4VVL E22V T7KE ATA3 A1HY';
export const PEI_OTHER_WALLET = PEI_PROXY_ADDRESS;
export const PEI_HTLC_ADDRESS = 'NQ65 9M6T V4BM 8JQ7 J8HL H9KB KH5M LNJY 6JLY';
export const PEI_EARN_TX = '1'.repeat(64);
export const PEI_SPEND_TX = '2'.repeat(64);

export const PEI_CONFIG: PeiVerifierConfigV0 = Object.freeze({
    network: 'main-albatross',
    requesterOrigin: 'https://knots.example',
    allowedReturnUris: Object.freeze(['https://knots.example/pei/return']),
    proxyAddress: PEI_PROXY_ADDRESS,
    earnAmountLuna: '100000',
    spendAmountLuna: '100000',
    maximumRequestTtlSeconds: 900,
    clockSkewSeconds: 30,
    requireFinality: true
});

export class SyntheticPeiChain implements PeiChainAdapterV0 {
    public readonly transactions = new Map<string, PeiChainTransactionV0>();
    public failure?: Error;

    public async transaction(hash: string): Promise<PeiChainTransactionV0 | undefined> {
        if (this.failure) throw this.failure;
        const transaction = this.transactions.get(hash);
        return transaction ? structuredClone(transaction) : undefined;
    }
}

export async function peiFixture(): Promise<{
    journey: PeiJourneyV0;
    earnRequest: PeiRequestV0;
    spendRequest: PeiRequestV0;
    earnProof: PeiProofV0;
    spendProof: PeiProofV0;
    earnCommitment: string;
    spendCommitment: string;
    chain: SyntheticPeiChain;
}> {
    const earnRequest: PeiRequestV0 = {
        protocol: PEI_PROTOCOL,
        version: PEI_VERSION,
        requester: PEI_REQUESTER,
        requesterOrigin: PEI_CONFIG.requesterOrigin,
        proxy: PEI_PROXY,
        network: PEI_CONFIG.network,
        subject: PEI_WALLET,
        action: 'earn',
        nonce: base64UrlEncode(Uint8Array.from({ length: 32 }, (_, index) => index + 1)),
        issuedAt: PEI_NOW_SECONDS - 60,
        expiresAt: PEI_NOW_SECONDS + 840,
        parentProofHash: null,
        returnUri: PEI_CONFIG.allowedReturnUris[0],
        minAmountLuna: PEI_CONFIG.earnAmountLuna
    };
    const earnProof: PeiProofV0 = {
        protocol: PEI_PROTOCOL,
        version: PEI_VERSION,
        request: earnRequest,
        txHash: PEI_EARN_TX
    };
    const spendRequest: PeiRequestV0 = {
        ...earnRequest,
        action: 'spend',
        nonce: base64UrlEncode(Uint8Array.from({ length: 32 }, (_, index) => 255 - index)),
        issuedAt: PEI_NOW_SECONDS - 30,
        parentProofHash: await peiProofHashV0(earnProof),
        minAmountLuna: PEI_CONFIG.spendAmountLuna
    };
    const spendProof: PeiProofV0 = {
        protocol: PEI_PROTOCOL,
        version: PEI_VERSION,
        request: spendRequest,
        txHash: PEI_SPEND_TX
    };
    const journey: PeiJourneyV0 = {
        protocol: PEI_PROTOCOL,
        version: PEI_VERSION,
        proofs: [earnProof, spendProof]
    };
    const earnCommitment = await peiRequestCommitmentV0(earnRequest);
    const spendCommitment = await peiRequestCommitmentV0(spendRequest);
    const chain = new SyntheticPeiChain();
    chain.transactions.set(PEI_EARN_TX, {
        hash: PEI_EARN_TX,
        network: PEI_CONFIG.network,
        sender: PEI_PROXY_ADDRESS,
        recipient: PEI_WALLET,
        valueLuna: PEI_CONFIG.earnAmountLuna,
        data: earnCommitment,
        executionState: 'success',
        finalized: true
    });
    chain.transactions.set(PEI_SPEND_TX, {
        hash: PEI_SPEND_TX,
        network: PEI_CONFIG.network,
        sender: PEI_WALLET,
        recipient: PEI_PROXY_ADDRESS,
        valueLuna: PEI_CONFIG.spendAmountLuna,
        data: spendCommitment,
        executionState: 'success',
        finalized: true
    });
    return {
        journey, earnRequest, spendRequest, earnProof, spendProof,
        earnCommitment, spendCommitment, chain
    };
}
