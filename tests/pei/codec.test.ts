import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
    PeiCodecError,
    PeiJourneyV0Schema,
    PeiRequestV0Schema,
    base64UrlDecode,
    canonicalPeiJourneyV0,
    canonicalPeiProofV0,
    canonicalPeiRequestV0,
    decodePeiJourneyV0,
    decodePeiProofV0,
    decodePeiRequestV0,
    encodePeiJourneyV0,
    encodePeiProofV0,
    encodePeiRequestV0,
    peiJourneyHashV0,
    peiProofHashV0,
    peiRequestCommitmentV0
} from '../../shared/pei-v0';
import { peiFixture } from './fixtures';

const GOLDEN = {
    requestJson: '{"protocol":"pei","version":0,"requester":"nimble-knots","requesterOrigin":"https://knots.example","proxy":"pei-proxy","network":"main-albatross","subject":"NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604","action":"earn","nonce":"AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA","issuedAt":1799999940,"expiresAt":1800000840,"parentProofHash":null,"returnUri":"https://knots.example/pei/return","minAmountLuna":"100000"}',
    requestCarrier: 'eyJwcm90b2NvbCI6InBlaSIsInZlcnNpb24iOjAsInJlcXVlc3RlciI6Im5pbWJsZS1rbm90cyIsInJlcXVlc3Rlck9yaWdpbiI6Imh0dHBzOi8va25vdHMuZXhhbXBsZSIsInByb3h5IjoicGVpLXByb3h5IiwibmV0d29yayI6Im1haW4tYWxiYXRyb3NzIiwic3ViamVjdCI6Ik5RNDYgS0xKRSA1VE1GIDRZMUEgMTI1NSBDSkhKIFlHMVMgSDBOVSBUNjA0IiwiYWN0aW9uIjoiZWFybiIsIm5vbmNlIjoiQVFJREJBVUdCd2dKQ2dzTURRNFBFQkVTRXhRVkZoY1lHUm9iSEIwZUh5QSIsImlzc3VlZEF0IjoxNzk5OTk5OTQwLCJleHBpcmVzQXQiOjE4MDAwMDA4NDAsInBhcmVudFByb29mSGFzaCI6bnVsbCwicmV0dXJuVXJpIjoiaHR0cHM6Ly9rbm90cy5leGFtcGxlL3BlaS9yZXR1cm4iLCJtaW5BbW91bnRMdW5hIjoiMTAwMDAwIn0',
    requestCommitment: 'rod-1NA5CeaoJ97pA_Pgx_uf-xdkEZ3WrklX1F2f_m0',
    proofJson: '{"protocol":"pei","version":0,"request":{"protocol":"pei","version":0,"requester":"nimble-knots","requesterOrigin":"https://knots.example","proxy":"pei-proxy","network":"main-albatross","subject":"NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604","action":"earn","nonce":"AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA","issuedAt":1799999940,"expiresAt":1800000840,"parentProofHash":null,"returnUri":"https://knots.example/pei/return","minAmountLuna":"100000"},"txHash":"1111111111111111111111111111111111111111111111111111111111111111"}',
    proofCarrier: 'eyJwcm90b2NvbCI6InBlaSIsInZlcnNpb24iOjAsInJlcXVlc3QiOnsicHJvdG9jb2wiOiJwZWkiLCJ2ZXJzaW9uIjowLCJyZXF1ZXN0ZXIiOiJuaW1ibGUta25vdHMiLCJyZXF1ZXN0ZXJPcmlnaW4iOiJodHRwczovL2tub3RzLmV4YW1wbGUiLCJwcm94eSI6InBlaS1wcm94eSIsIm5ldHdvcmsiOiJtYWluLWFsYmF0cm9zcyIsInN1YmplY3QiOiJOUTQ2IEtMSkUgNVRNRiA0WTFBIDEyNTUgQ0pISiBZRzFTIEgwTlUgVDYwNCIsImFjdGlvbiI6ImVhcm4iLCJub25jZSI6IkFRSURCQVVHQndnSkNnc01EUTRQRUJFU0V4UVZGaGNZR1JvYkhCMGVIeUEiLCJpc3N1ZWRBdCI6MTc5OTk5OTk0MCwiZXhwaXJlc0F0IjoxODAwMDAwODQwLCJwYXJlbnRQcm9vZkhhc2giOm51bGwsInJldHVyblVyaSI6Imh0dHBzOi8va25vdHMuZXhhbXBsZS9wZWkvcmV0dXJuIiwibWluQW1vdW50THVuYSI6IjEwMDAwMCJ9LCJ0eEhhc2giOiIxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExIn0',
    proofHash: 'lc0Bz7jMqC78AKFGsrQGAcYUbIC9PAwMR8HZMDXFaJg',
    journeyHash: 'Uw4T0Q1y5daRoVZ1SyTag36RnW8N-fQR7823SUs3glI'
};

test('PEI v0 canonical JSON, carriers and hashes match frozen golden vectors', async () => {
    const fixture = await peiFixture();
    assert.equal(canonicalPeiRequestV0(fixture.earnRequest), GOLDEN.requestJson);
    assert.equal(encodePeiRequestV0(fixture.earnRequest), GOLDEN.requestCarrier);
    assert.equal(await peiRequestCommitmentV0(fixture.earnRequest), GOLDEN.requestCommitment);
    assert.equal(canonicalPeiProofV0(fixture.earnProof), GOLDEN.proofJson);
    assert.equal(encodePeiProofV0(fixture.earnProof), GOLDEN.proofCarrier);
    assert.equal(await peiProofHashV0(fixture.earnProof), GOLDEN.proofHash);
    assert.equal(await peiJourneyHashV0(fixture.journey), GOLDEN.journeyHash);

    assert.deepEqual(decodePeiRequestV0(GOLDEN.requestCarrier), fixture.earnRequest);
    assert.deepEqual(decodePeiProofV0(GOLDEN.proofCarrier), fixture.earnProof);
    assert.deepEqual(decodePeiJourneyV0(encodePeiJourneyV0(fixture.journey)), fixture.journey);

    const independentBytes = Buffer.from(GOLDEN.requestCarrier, 'base64url');
    assert.equal(independentBytes.toString('utf8'), GOLDEN.requestJson);
    assert.equal(createHash('sha256').update(independentBytes).digest('base64url'), GOLDEN.requestCommitment);
});

test('PEI v0 schemas reject unknown versions, impossible ancestry and malformed money or nonces', async () => {
    const { earnRequest, spendRequest, journey } = await peiFixture();
    for (const candidate of [
        { ...earnRequest, version: 1 },
        { ...earnRequest, minAmountLuna: '1.0' },
        { ...earnRequest, minAmountLuna: '0' },
        { ...earnRequest, nonce: 'A'.repeat(43) },
        { ...earnRequest, expiresAt: earnRequest.issuedAt },
        { ...earnRequest, parentProofHash: spendRequest.parentProofHash },
        { ...spendRequest, parentProofHash: null }
    ]) assert.equal(PeiRequestV0Schema.safeParse(candidate).success, false);
    assert.equal(PeiJourneyV0Schema.safeParse({ ...journey, extra: true }).success, false);
    assert.equal(PeiJourneyV0Schema.safeParse({ ...journey, proofs: [journey.proofs[0]] }).success, false);
});

test('PEI v0 carrier parsing is bounded, canonical and fail-closed', async () => {
    const { journey } = await peiFixture();
    const carrier = encodePeiJourneyV0(journey);
    assert.throws(() => decodePeiJourneyV0(`${carrier}=`), PeiCodecError);
    assert.throws(() => decodePeiJourneyV0('%%%'), PeiCodecError);
    assert.throws(() => base64UrlDecode('A'.repeat(30_000), 16_384), PeiCodecError);
    assert.throws(
        () => decodePeiJourneyV0(Buffer.from('{"protocol":"pei"}').toString('base64url')),
        PeiCodecError
    );
});
