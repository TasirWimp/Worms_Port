import { init, type ErrorResponse } from '@nimiq/mini-app-sdk';
import { z } from 'zod';

import {
    decodePeiProofV0,
    decodePeiRequestV0,
    encodePeiJourneyV0,
    encodePeiProofV0,
    peiProofHashV0,
    peiRequestCommitmentV0,
    type PeiProofV0,
    type PeiRequestV0
} from '../../shared/pei-v0';

const ConfigSchema = z.object({
    network: z.string().min(1).max(32),
    requesterOrigin: z.string().url(),
    proxyAddress: z.string().min(36).max(44),
    earnAmountLuna: z.string().regex(/^[1-9][0-9]{0,15}$/),
    spendAmountLuna: z.string().regex(/^[1-9][0-9]{0,15}$/)
}).strict();
const AuthorizationResponseSchema = z.object({
    authorized: z.literal(true),
    action: z.enum(['earn', 'spend'])
}).strict();
const EarnResponseSchema = z.object({
    transactionHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
const VerificationResponseSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('final') }).strict(),
    z.object({
        status: z.literal('pending'),
        reason: z.string().min(1).max(64)
    }).strict()
]);

const actionButton = document.getElementById('pei-action') as HTMLButtonElement;
const cancelButton = document.getElementById('pei-cancel') as HTMLButtonElement;
const intro = document.getElementById('pei-intro') as HTMLElement;
const facts = document.getElementById('pei-facts') as HTMLElement;
const status = document.getElementById('pei-status') as HTMLElement;

let request: PeiRequestV0 | undefined;
let requestCarrier = '';
let authorization = '';
let parentProof: PeiProofV0 | undefined;

void prepare();

async function prepare(): Promise<void> {
    try {
        const route = parseRoute(location.hash);
        requestCarrier = route.requestCarrier;
        authorization = route.authorization;
        request = decodePeiRequestV0(requestCarrier);
        parentProof = route.parentCarrier ? decodePeiProofV0(route.parentCarrier) : undefined;
        await validateParent(request, parentProof);
        cancelButton.hidden = false;
        cancelButton.addEventListener('click', () => returnToGame('cancel'));

        const configResponse = await fetch('/api/pei/config', { cache: 'no-store' });
        if (!configResponse.ok) throw new Error('The helper configuration is unavailable.');
        const config = ConfigSchema.parse(await configResponse.json());
        validateConfig(request, config);
        const accepted = await post('/api/pei/authorize', {
            requestCarrier,
            authorization
        });
        const authorizationResult = AuthorizationResponseSchema.parse(accepted);
        if (authorizationResult.action !== request.action) {
            throw new Error('The helper authorized a different PEI action.');
        }

        document.documentElement.dataset.step = request.action;
        setFact('step', request.action === 'earn' ? 'Receive from helper' : 'Return to helper');
        setFact('amount', `${formatNim(request.minAmountLuna)} NIM`);
        setFact('wallet', compactAddress(request.subject));
        setFact('network', request.network === 'main-albatross' ? 'Nimiq Mainnet' : 'Nimiq Testnet');
        facts.hidden = false;
        intro.textContent = request.action === 'earn'
            ? 'Receive a tiny transfer from this helper to prove the first edge.'
            : 'Return a tiny transfer to this helper to complete the second edge.';
        actionButton.textContent = request.action === 'earn'
            ? `Receive ${formatNim(request.minAmountLuna)} NIM`
            : `Return ${formatNim(request.minAmountLuna)} NIM`;
        actionButton.hidden = false;
        actionButton.disabled = false;
        actionButton.addEventListener('click', () => void execute());
        setStatus('Review the wallet, amount, and network, then continue.');
    } catch (error) {
        fail(error);
    }
}

async function execute(): Promise<void> {
    if (!request || actionButton.disabled) return;
    actionButton.disabled = true;
    cancelButton.disabled = true;
    try {
        if (request.action === 'earn') await earn(request);
        else await spend(request);
    } catch (error) {
        fail(error);
        actionButton.disabled = false;
        cancelButton.disabled = false;
    }
}

async function earn(peiRequest: PeiRequestV0): Promise<void> {
    const commitment = await peiRequestCommitmentV0(peiRequest);
    let transactionHash = storedTransactionHash(commitment);
    if (!transactionHash) {
        setStatus('Sending the helper transfer…');
        const result = EarnResponseSchema.parse(await post('/api/pei/earn', {
            requestCarrier,
            authorization
        }));
        transactionHash = result.transactionHash;
        rememberTransactionHash(commitment, transactionHash);
    }
    await waitForFinality(peiRequest, transactionHash);
    const proof: PeiProofV0 = {
        protocol: 'pei',
        version: 0,
        request: peiRequest,
        txHash: transactionHash
    };
    forgetTransactionHash(commitment);
    setStatus('First edge finalized. Returning to NIMble Knots for verification…');
    returnToGame('earn', encodePeiProofV0(proof));
}

async function spend(peiRequest: PeiRequestV0): Promise<void> {
    if (!parentProof) throw new Error('The accepted earn proof is missing.');
    const commitment = await peiRequestCommitmentV0(peiRequest);
    let transactionHash = storedTransactionHash(commitment);
    if (!transactionHash) {
        setStatus('Opening Nimiq Pay for the return transfer…');
        const provider = await init({ timeout: 5_000 });
        const accounts = await provider.listAccounts();
        if (isErrorResponse(accounts)) throw new Error(walletError(accounts));
        if (!Array.isArray(accounts) || !accounts.some((account) =>
            typeof account === 'string' && compactAddress(account) === compactAddress(peiRequest.subject))) {
            throw new Error('Choose the same wallet that NIMble Knots authorized.');
        }
        const transaction = await provider.sendBasicTransactionWithData({
            recipient: proxyAddressFor(peiRequest),
            value: Number(peiRequest.minAmountLuna),
            data: commitment
        });
        if (isErrorResponse(transaction)) throw new Error(walletError(transaction));
        if (typeof transaction !== 'string' || !/^[a-fA-F0-9]{64}$/.test(transaction)) {
            throw new Error('Nimiq Pay returned an invalid transaction hash.');
        }
        transactionHash = transaction.toLowerCase();
        rememberTransactionHash(commitment, transactionHash);
    }
    await waitForFinality(peiRequest, transactionHash, encodePeiProofV0(parentProof));
    const proof: PeiProofV0 = {
        protocol: 'pei',
        version: 0,
        request: peiRequest,
        txHash: transactionHash
    };
    forgetTransactionHash(commitment);
    setStatus('Return edge finalized. Going back to NIMble Knots for final verification…');
    returnToGame('journey', encodePeiJourneyV0({
        protocol: 'pei',
        version: 0,
        proofs: [parentProof, proof]
    }));
}

async function waitForFinality(
    peiRequest: PeiRequestV0,
    transactionHash: string,
    parentCarrier?: string
): Promise<void> {
    for (;;) {
        if (Math.floor(Date.now() / 1_000) >= peiRequest.expiresAt) {
            throw new Error('The PEI request expired before the transaction became final.');
        }
        setStatus('Transaction sent. Waiting for Nimiq finality…');
        const result = VerificationResponseSchema.parse(await post('/api/pei/verify', {
            requestCarrier,
            authorization,
            transactionHash,
            ...(parentCarrier ? { parentCarrier } : {})
        }));
        if (result.status === 'final') return;
        await new Promise((resolve) => window.setTimeout(resolve, 2_500));
    }
}

function transactionStorageKey(commitment: string): string {
    return `nimble-knots.pei-proxy-transaction-v0.${commitment}`;
}

function storedTransactionHash(commitment: string): string | undefined {
    const value = sessionStorage.getItem(transactionStorageKey(commitment));
    return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

function rememberTransactionHash(commitment: string, transactionHash: string): void {
    sessionStorage.setItem(transactionStorageKey(commitment), transactionHash);
}

function forgetTransactionHash(commitment: string): void {
    sessionStorage.removeItem(transactionStorageKey(commitment));
}

let configuredProxyAddress = '';

function validateConfig(
    peiRequest: PeiRequestV0,
    config: z.infer<typeof ConfigSchema>
): void {
    const expectedAmount = peiRequest.action === 'earn'
        ? config.earnAmountLuna
        : config.spendAmountLuna;
    if (peiRequest.network !== config.network ||
        peiRequest.requesterOrigin !== config.requesterOrigin ||
        peiRequest.returnUri !== `${config.requesterOrigin}/#pei-return` ||
        peiRequest.minAmountLuna !== expectedAmount) {
        throw new Error('The request does not match this helper configuration.');
    }
    configuredProxyAddress = config.proxyAddress;
}

async function validateParent(
    peiRequest: PeiRequestV0,
    parent: PeiProofV0 | undefined
): Promise<void> {
    if (peiRequest.action === 'earn' && parent) {
        throw new Error('An earn request must not carry a parent proof.');
    }
    if (peiRequest.action === 'spend' && !parent) {
        throw new Error('A spend request requires the accepted earn proof.');
    }
    if (parent && (parent.request.action !== 'earn' ||
        compactAddress(parent.request.subject) !== compactAddress(peiRequest.subject))) {
        throw new Error('The earn proof does not belong to this wallet journey.');
    }
    if (parent && await peiProofHashV0(parent) !== peiRequest.parentProofHash) {
        throw new Error('The spend request is not linked to the earn proof.');
    }
}

function parseRoute(hash: string): {
    requestCarrier: string;
    authorization: string;
    parentCarrier?: string;
} {
    const parts = hash.split('/');
    if ((parts.length !== 4 && parts.length !== 5) || parts[0] !== '#' ||
        parts[1] !== 'pei' || !/^[A-Za-z0-9_-]+$/.test(parts[2]) ||
        !/^[A-Za-z0-9_-]{43}$/.test(parts[3]) ||
        (parts[4] !== undefined && !/^[A-Za-z0-9_-]+$/.test(parts[4]))) {
        throw new Error('This PEI link is malformed. Start again from NIMble Knots.');
    }
    return {
        requestCarrier: parts[2],
        authorization: parts[3],
        ...(parts[4] ? { parentCarrier: parts[4] } : {})
    };
}

async function post(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    const value = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
    if (!response.ok) {
        throw new Error(typeof value?.error === 'string' ? value.error : 'The helper rejected the request.');
    }
    return value;
}

function returnToGame(kind: 'earn' | 'journey' | 'cancel', carrier?: string): void {
    if (!request) return;
    const target = `${request.returnUri}/${kind}${carrier ? `/${carrier}` : ''}`;
    location.replace(target);
}

function proxyAddressFor(_: PeiRequestV0): string {
    if (!configuredProxyAddress) throw new Error('The helper proxy address is unavailable.');
    return configuredProxyAddress;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
    return !!value && typeof value === 'object' && 'error' in value;
}

function walletError(value: ErrorResponse): string {
    const description = `${value.error.type} ${value.error.message}`.toLowerCase();
    return /reject|denied|cancel/.test(description)
        ? 'The Nimiq Pay request was cancelled.'
        : 'Nimiq Pay could not complete the transfer.';
}

function setFact(name: string, value: string): void {
    const field = document.querySelector<HTMLElement>(`[data-fact="${name}"]`);
    if (field) field.textContent = value;
}

function setStatus(message: string): void {
    status.textContent = message;
}

function fail(error: unknown): void {
    setStatus(error instanceof Error ? error.message : 'The PEI helper could not continue.');
}

function compactAddress(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
}

function formatNim(luna: string): string {
    const amount = BigInt(luna);
    const whole = amount / 100_000n;
    const fraction = (amount % 100_000n).toString().padStart(5, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
