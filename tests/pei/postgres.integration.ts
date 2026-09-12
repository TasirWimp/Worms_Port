import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';

import { PostgresPeiJourneyStoreV0 } from '../../server/src/pei/store';
import { PostgresPeiProxyTransferStoreV0 } from '../../server/src/pei/transfer-store';
import { peiRequestCommitmentV0 } from '../../shared/pei-v0';
import { PEI_NOW_SECONDS, PEI_OTHER_WALLET, PEI_WALLET, peiFixture } from './fixtures';

const ADMIN_URL = requiredAdminUrl();

test('PostgreSQL preserves accepted journeys and exact signed proxy bytes across restart', async () => {
    await withDatabase(async (databaseUrl) => {
        const fixture = await peiFixture();
        const commitment = await peiRequestCommitmentV0(fixture.earnProof.request);
        const now = new Date(PEI_NOW_SECONDS * 1_000);
        const journeys = new PostgresPeiJourneyStoreV0(databaseUrl);
        await journeys.initialize();
        await journeys.begin({
            earnRequestCommitment: commitment,
            walletAddress: PEI_WALLET,
            expiresAt: new Date(fixture.earnProof.request.expiresAt * 1_000)
        }, now);
        await journeys.acceptEarn(
            commitment,
            fixture.earnProof,
            fixture.spendProof.request,
            now
        );
        await journeys.close();

        const restartedJourneys = new PostgresPeiJourneyStoreV0(databaseUrl);
        await restartedJourneys.initialize();
        const storedJourney = await restartedJourneys.get(commitment);
        assert.deepEqual(storedJourney?.earnProof, fixture.earnProof);
        assert.deepEqual(storedJourney?.spendRequest, fixture.spendProof.request);
        await restartedJourneys.close();

        const transfers = new PostgresPeiProxyTransferStoreV0(databaseUrl);
        await transfers.initialize();
        await transfers.withRequestLock(commitment, async (locked) => {
            await locked.reserveIssuance({
                requestCommitment: commitment,
                walletAddress: PEI_WALLET,
                issuanceDay: now.toISOString().slice(0, 10),
                amountLuna: 100_000n,
                expiresAt: new Date(fixture.earnProof.request.expiresAt * 1_000),
                dailyBudgetLuna: 200_000n,
                dailyWalletLimit: 1
            }, now);
            await locked.saveSigned({
                requestCommitment: commitment,
                signedTransaction: 'cafe',
                transactionHash: fixture.earnProof.txHash,
                validityStartHeight: 100
            }, now);
            await locked.markBroadcastUnknown(commitment, now);
        });
        await transfers.close();

        const restartedTransfers = new PostgresPeiProxyTransferStoreV0(databaseUrl);
        await restartedTransfers.initialize();
        assert.deepEqual(await restartedTransfers.get(commitment), {
            requestCommitment: commitment,
            signedTransaction: 'cafe',
            transactionHash: fixture.earnProof.txHash,
            validityStartHeight: 100,
            state: 'broadcast_unknown'
        });
        const secondRequest = { ...fixture.earnProof.request, nonce: 'C'.repeat(43) };
        const secondCommitment = await peiRequestCommitmentV0(secondRequest);
        await assert.rejects(
            restartedTransfers.withRequestLock(secondCommitment, (locked) =>
                locked.reserveIssuance({
                    requestCommitment: secondCommitment,
                    walletAddress: PEI_WALLET,
                    issuanceDay: now.toISOString().slice(0, 10),
                    amountLuna: 100_000n,
                    expiresAt: new Date(secondRequest.expiresAt * 1_000),
                    dailyBudgetLuna: 200_000n,
                    dailyWalletLimit: 1
                }, now)
            ),
            /already received today/
        );
        await restartedTransfers.close();
    });
});

test('PostgreSQL serializes concurrent helper instances against one daily budget', async () => {
    await withDatabase(async (databaseUrl) => {
        const fixture = await peiFixture();
        const now = new Date(PEI_NOW_SECONDS * 1_000);
        const requests = [
            fixture.earnProof.request,
            { ...fixture.earnProof.request, subject: PEI_OTHER_WALLET, nonce: 'B'.repeat(43) }
        ];
        const stores = [
            new PostgresPeiProxyTransferStoreV0(databaseUrl),
            new PostgresPeiProxyTransferStoreV0(databaseUrl)
        ];
        await Promise.all(stores.map((store) => store.initialize()));
        try {
            const results = await Promise.allSettled(requests.map(async (request, index) => {
                const commitment = await peiRequestCommitmentV0(request);
                return stores[index].withRequestLock(commitment, (locked) =>
                    locked.reserveIssuance({
                        requestCommitment: commitment,
                        walletAddress: request.subject,
                        issuanceDay: now.toISOString().slice(0, 10),
                        amountLuna: 100_000n,
                        expiresAt: new Date(request.expiresAt * 1_000),
                        dailyBudgetLuna: 100_000n,
                        dailyWalletLimit: 1
                    }, now)
                );
            }));
            assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
            const rejected = results.find((result) => result.status === 'rejected');
            assert.ok(rejected && rejected.status === 'rejected');
            assert.match(String(rejected.reason), /daily sponsor budget is exhausted/);
        } finally {
            await Promise.all(stores.map((store) => store.close()));
        }
    });
});

async function withDatabase(operation: (databaseUrl: string) => Promise<void>): Promise<void> {
    const databaseName = `nimble_knots_wp014_pei_${process.pid}`;
    const admin = await connectedClient(ADMIN_URL);
    try {
        await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);
        const url = new URL(ADMIN_URL);
        url.pathname = `/${databaseName}`;
        try {
            await operation(url.toString());
        } finally {
            await admin.query(
                `SELECT pg_terminate_backend(pid)
                   FROM pg_stat_activity
                  WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [databaseName]
            );
            await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`);
        }
    } finally {
        await admin.end();
    }
}

async function connectedClient(connectionString: string): Promise<Client> {
    const client = new Client({ connectionString, application_name: 'nimble-knots-pei-tests' });
    await client.connect();
    return client;
}

function quotedIdentifier(value: string): string {
    if (!/^nimble_knots_wp014_[a-z0-9_]+$/.test(value)) {
        throw new Error('Generated PostgreSQL database name is unsafe.');
    }
    return `"${value}"`;
}

function requiredAdminUrl(): string {
    const value = process.env.WP014_TEST_DATABASE_URL?.trim();
    if (!value) throw new Error('WP014_TEST_DATABASE_URL is required.');
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        throw new Error('WP014_TEST_DATABASE_URL must target disposable loopback PostgreSQL.');
    }
    return value;
}
