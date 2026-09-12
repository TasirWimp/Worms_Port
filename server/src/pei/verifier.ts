import {
    PeiJourneyV0Schema,
    PeiProofV0Schema,
    type PeiActionV0,
    type PeiJourneyV0,
    type PeiProofV0,
    type PeiRequestV0,
    peiJourneyHashV0,
    peiProofHashV0,
    peiRequestCommitmentV0
} from '../../../shared/pei-v0';
import { normalizeNimiqAddress } from '../identity/crypto';
import type { VerifiedPeiQualification } from '../reward/types';

export type PeiChainTransactionV0 = {
    hash: string;
    network: string;
    sender: string;
    recipient: string;
    valueLuna: string;
    data: string;
    executionState: 'pending' | 'success' | 'failed';
    finalized: boolean;
};

export interface PeiChainAdapterV0 {
    transaction(transactionHash: string): Promise<PeiChainTransactionV0 | undefined>;
}

export type PeiVerifierConfigV0 = {
    network: string;
    requesterOrigin: string;
    allowedReturnUris: readonly string[];
    proxyAddress: string;
    earnAmountLuna: string;
    spendAmountLuna: string;
    maximumRequestTtlSeconds: number;
    clockSkewSeconds: number;
    requireFinality: boolean;
};

export type PeiVerificationV0 =
    | {
        status: 'valid';
        qualification: VerifiedPeiQualification;
        requestCommitments: readonly [string, string];
        transactionHashes: readonly [string, string];
    }
    | {
        status: 'invalid' | 'inconclusive';
        reason: string;
        edge?: PeiActionV0;
    };

export type PeiEdgeVerificationV0 =
    | {
        status: 'valid';
        proof: PeiProofV0;
        requestCommitment: string;
        proofHash: string;
    }
    | {
        status: 'invalid' | 'inconclusive';
        reason: string;
        edge?: PeiActionV0;
    };

export type VerifyPeiJourneyOptionsV0 = {
    adapter: PeiChainAdapterV0;
    config: PeiVerifierConfigV0;
    nowSeconds: number;
    expectedSubject?: string;
    expectedEarnCommitment?: string;
};

type PeiVerificationFailureV0 = Exclude<PeiVerificationV0, { status: 'valid' }>;

type VerifiedEdge = {
    requestCommitment: string;
};

export async function verifyPeiProofV0(
    input: unknown,
    action: PeiActionV0,
    options: VerifyPeiJourneyOptionsV0,
    expectedParentHash?: string
): Promise<PeiEdgeVerificationV0> {
    const parsed = PeiProofV0Schema.safeParse(input);
    if (!parsed.success) return invalidEdge('malformed_proof');
    if (!validConfig(options.config) || !Number.isSafeInteger(options.nowSeconds) ||
        options.nowSeconds < 0) return invalidEdge('invalid_verifier_configuration');
    const proof = parsed.data;
    let subject: string;
    try {
        subject = normalizeNimiqAddress(proof.request.subject);
        if (options.expectedSubject &&
            subject !== normalizeNimiqAddress(options.expectedSubject)) {
            return invalidEdge('unexpected_subject', action);
        }
    } catch {
        return invalidEdge('invalid_subject', action);
    }
    const commitment = await peiRequestCommitmentV0(proof.request);
    if (options.expectedEarnCommitment && commitment !== options.expectedEarnCommitment) {
        return invalidEdge('unexpected_earn_request', action);
    }
    const requestResult = validateRequest(proof.request, action, options);
    if (requestResult) return requestResult;
    if (action === 'spend' && proof.request.parentProofHash !== expectedParentHash) {
        return invalidEdge('parent_proof_mismatch', action);
    }
    const edge = await verifyEdge(proof, action, commitment, options, true);
    if ('status' in edge) return edge;
    return {
        status: 'valid',
        proof,
        requestCommitment: edge.requestCommitment,
        proofHash: await peiProofHashV0(proof)
    };
}

export async function verifyPeiJourneyV0(
    input: unknown,
    options: VerifyPeiJourneyOptionsV0
): Promise<PeiVerificationV0> {
    const parsed = PeiJourneyV0Schema.safeParse(input);
    if (!parsed.success) return invalid('malformed_journey');
    const journey = parsed.data;
    if (!validConfig(options.config) || !Number.isSafeInteger(options.nowSeconds) ||
        options.nowSeconds < 0) {
        return invalid('invalid_verifier_configuration');
    }
    const [earnProof, spendProof] = journey.proofs;
    if (earnProof.request.action !== 'earn' || spendProof.request.action !== 'spend') {
        return invalid('wrong_edge_order');
    }
    if (earnProof.request.subject !== spendProof.request.subject) {
        return invalid('subject_changed');
    }
    if (earnProof.txHash === spendProof.txHash) return invalid('transaction_reused');
    if (earnProof.request.nonce === spendProof.request.nonce) return invalid('nonce_reused');
    if (spendProof.request.issuedAt < earnProof.request.issuedAt) {
        return invalid('request_time_reversed');
    }
    let normalizedSubject: string;
    try {
        normalizedSubject = normalizeNimiqAddress(earnProof.request.subject);
        if (options.expectedSubject &&
            normalizedSubject !== normalizeNimiqAddress(options.expectedSubject)) {
            return invalid('unexpected_subject');
        }
    } catch {
        return invalid('invalid_subject');
    }
    const earnCommitment = await peiRequestCommitmentV0(earnProof.request);
    if (options.expectedEarnCommitment && earnCommitment !== options.expectedEarnCommitment) {
        return invalid('unexpected_earn_request');
    }
    const earnRequestResult = validateRequest(earnProof.request, 'earn', options);
    if (earnRequestResult) return earnRequestResult;
    const spendRequestResult = validateRequest(spendProof.request, 'spend', options);
    if (spendRequestResult) return spendRequestResult;
    const expectedParent = await peiProofHashV0(earnProof);
    if (spendProof.request.parentProofHash !== expectedParent) {
        return invalid('parent_proof_mismatch', 'spend');
    }
    const earn = await verifyEdge(earnProof, 'earn', earnCommitment, options, true);
    if ('status' in earn) return earn;
    const spendCommitment = await peiRequestCommitmentV0(spendProof.request);
    const spend = await verifyEdge(spendProof, 'spend', spendCommitment, options, true);
    if ('status' in spend) return spend;
    const qualificationDigest = await peiJourneyHashV0(journey);
    return {
        status: 'valid',
        qualification: {
            walletAddress: normalizedSubject,
            qualificationDigest,
            expiresAt: new Date(Math.min(
                earnProof.request.expiresAt,
                spendProof.request.expiresAt
            ) * 1_000)
        },
        requestCommitments: [earn.requestCommitment, spend.requestCommitment],
        transactionHashes: [earnProof.txHash, spendProof.txHash]
    };
}

async function verifyEdge(
    proof: PeiProofV0,
    action: PeiActionV0,
    requestCommitment: string,
    options: VerifyPeiJourneyOptionsV0,
    requestValidated = false
): Promise<VerifiedEdge | PeiVerificationFailureV0> {
    if (!requestValidated) {
        const requestResult = validateRequest(proof.request, action, options);
        if (requestResult) return requestResult;
    }
    let transaction: PeiChainTransactionV0 | undefined;
    try {
        transaction = await options.adapter.transaction(proof.txHash);
    } catch {
        return inconclusive('chain_adapter_unavailable', action);
    }
    if (!transaction) return inconclusive('transaction_not_found', action);
    if (transaction.hash !== proof.txHash) return invalid('transaction_hash_mismatch', action);
    if (transaction.network !== options.config.network) return invalid('transaction_network_mismatch', action);
    let sender: string;
    let recipient: string;
    let proxy: string;
    try {
        sender = normalizeNimiqAddress(transaction.sender);
        recipient = normalizeNimiqAddress(transaction.recipient);
        proxy = normalizeNimiqAddress(options.config.proxyAddress);
    } catch {
        return invalid('transaction_address_invalid', action);
    }
    const expectedSender = action === 'earn' ? proxy : proof.request.subject;
    const expectedRecipient = action === 'earn' ? proof.request.subject : proxy;
    if (sender !== expectedSender) return invalid('transaction_sender_mismatch', action);
    if (recipient !== expectedRecipient) return invalid('transaction_recipient_mismatch', action);
    if (!/^[1-9][0-9]{0,19}$/.test(transaction.valueLuna) ||
        BigInt(transaction.valueLuna) < BigInt(proof.request.minAmountLuna)) {
        return invalid('transaction_value_too_small', action);
    }
    if (transaction.data !== requestCommitment) {
        return invalid('transaction_commitment_mismatch', action);
    }
    if (transaction.executionState === 'failed') return invalid('transaction_failed', action);
    if (transaction.executionState === 'pending') return inconclusive('transaction_pending', action);
    if (options.config.requireFinality && !transaction.finalized) {
        return inconclusive('transaction_not_final', action);
    }
    return { requestCommitment };
}

function validateRequest(
    request: PeiRequestV0,
    action: PeiActionV0,
    options: VerifyPeiJourneyOptionsV0
): PeiVerificationFailureV0 | undefined {
    const { config, nowSeconds } = options;
    if (request.action !== action) return invalid('wrong_edge_action', action);
    if (request.network !== config.network) return invalid('request_network_mismatch', action);
    if (request.requesterOrigin !== config.requesterOrigin) {
        return invalid('requester_origin_mismatch', action);
    }
    if (!config.allowedReturnUris.includes(request.returnUri)) {
        return invalid('return_uri_not_allowed', action);
    }
    const expectedAmount = action === 'earn' ? config.earnAmountLuna : config.spendAmountLuna;
    if (request.minAmountLuna !== expectedAmount) return invalid('request_amount_mismatch', action);
    if (request.expiresAt - request.issuedAt > config.maximumRequestTtlSeconds) {
        return invalid('request_ttl_too_long', action);
    }
    if (request.issuedAt > nowSeconds + config.clockSkewSeconds) {
        return invalid('request_issued_in_future', action);
    }
    if (request.expiresAt <= nowSeconds) return invalid('request_expired', action);
    return undefined;
}

function validConfig(config: PeiVerifierConfigV0): boolean {
    if (!config || !/^[a-z0-9-]{1,32}$/.test(config.network) ||
        !Number.isSafeInteger(config.maximumRequestTtlSeconds) ||
        config.maximumRequestTtlSeconds <= 0 ||
        !Number.isSafeInteger(config.clockSkewSeconds) || config.clockSkewSeconds < 0 ||
        !/^[1-9][0-9]{0,19}$/.test(config.earnAmountLuna) ||
        !/^[1-9][0-9]{0,19}$/.test(config.spendAmountLuna) ||
        !Array.isArray(config.allowedReturnUris) || config.allowedReturnUris.length === 0) {
        return false;
    }
    try {
        normalizeNimiqAddress(config.proxyAddress);
        const origin = new URL(config.requesterOrigin);
        if (origin.origin !== config.requesterOrigin || origin.pathname !== '/' ||
            origin.search || origin.hash) return false;
        for (const returnUri of config.allowedReturnUris) new URL(returnUri);
        return true;
    } catch {
        return false;
    }
}

function invalid(reason: string, edge?: PeiActionV0): PeiVerificationFailureV0 {
    return { status: 'invalid', reason, ...(edge ? { edge } : {}) };
}

function inconclusive(reason: string, edge?: PeiActionV0): PeiVerificationFailureV0 {
    return { status: 'inconclusive', reason, ...(edge ? { edge } : {}) };
}

function invalidEdge(reason: string, edge?: PeiActionV0): PeiEdgeVerificationV0 {
    return { status: 'invalid', reason, ...(edge ? { edge } : {}) };
}

export function clonePeiJourneyV0(journey: PeiJourneyV0): PeiJourneyV0 {
    return structuredClone(journey);
}
