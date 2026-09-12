# WP-022 PEI Admission Contract

This contract implements the project owner's operational order for Proof of
Ecosystem Interaction: establish the Daily gameplay and reward boundary first,
then connect a helper Mini App and chain verifier, and only after the complete
path works compare alternate receipt carriers. The experiment brief remains a
design input, but its carrier-ablation work does not define this first product
slice.

## WP-022B: Durable admission foundation

WP-022B adds the internal seam between a future successful PEI verification and
the existing Daily Challenge. It does not define a PEI request, proof, receipt,
URL carrier, helper UI or blockchain adapter.

A trusted server-side verifier will eventually produce a bounded qualification
with four facts: normalized subject wallet, UTC challenge day, an opaque
SHA-256 verification digest and an expiry. The reward authority may exchange
that qualification for a random admission credential. The store persists only
the credential digest and the four server-side facts; the raw credential is
returned once to the caller and is never stored.

When `PEI_ENABLED=true`, a Daily reservation requires that credential. The
reward store checks the credential under the same serializable boundary that
reserves sponsor budget and binds it to the new entitlement. The credential
must belong to the authorized wallet and current UTC challenge day, remain
unused, and stay valid for the complete reward-reservation window. Starting the
match consumes the bound credential in the same transaction that consumes the
wallet's Daily attempt. Cancellation or expiry before start leaves the
credential reusable until its own expiry. A second match cannot consume it.

`PEI_ENABLED` defaults to false. With it disabled, deployed Daily behavior
remains the owner-accepted WP-022A V10 R5 volcanic journey. Practice never reads,
creates or consumes a PEI credential. Enabling the flag before a verifier and
client return path exist must fail closed at Daily reservation.

The credential is operational admission state, not proof of ecosystem history.
Later verification must remain reconstructable from chain truth and its carried
proof under the experiment contract. The existing reward ledger remains the
authority for one attempt per wallet/day, sponsor budget, verified match result,
claim idempotency and payout state.

Required checks cover disabled-mode compatibility; trusted issuance validation;
wallet, day, token and expiry binding; atomic reserve/start consumption in the
memory and PostgreSQL stores; cancellation reuse; replay refusal; strict socket
schema handling; V10 rewarded-match creation; and unchanged Practice behavior.
The PostgreSQL integration runs when the existing disposable database gate is
available.

WP-022B has no physical-phone gate because its production flag stays disabled
and it exposes no user journey. The next slice may define the overcomplete,
versioned baseline proof and synthetic verifier that can issue this credential.
Receipt-content ablation remains after the working end-to-end path.

Evidence: [WP-022B](../evidence/wp-022b.json).

## WP-022C: Deterministic baseline and fresh verifier

WP-022C freezes the deliberately overcomplete PEI v0 request, proof and
two-proof journey before any browser or helper integration. Canonical JSON uses
an explicit key order; URL carriers are UTF-8 canonical bytes encoded as
unpadded Base64URL; request commitments and parent-proof hashes are SHA-256
digests encoded as 43-character Base64URL strings. A request commitment is the
exact text later carried in Nimiq transaction data and therefore fits the
documented 64-byte field.

The baseline has exactly two ordered edges. Earn transfers from the configured
proxy address to the authorized subject. Spend transfers from that same subject
back to the proxy and binds the canonical accepted earn proof through
`parentProofHash`. Both requests bind the configured network, requester origin,
allowlisted return URI, exact configured minimum amount, short validity window
and distinct 32-byte nonces. Proofs carry only their complete request and
transaction hash; sender, recipient, value, data, execution and finality are
reconstructed through the chain adapter.

The verifier has three outcomes. Structural, configuration or transaction
mismatches are `invalid`; missing, pending or unfinalized chain observations and
adapter failure are `inconclusive`; only a complete final ordered journey is
`valid`. A valid result contains the normalized wallet, canonical journey
digest and bounded expiry accepted by the WP-022B admission issuer. The verifier
accepts an expected earn commitment when used for an active request so an old
journey cannot answer a different fresh request; the stateless reconstruction
test separately demonstrates that no browser, proxy or NIMble Knots database is
needed to establish the two historical chain edges themselves.

The chain interface is production-neutral. WP-022C tests it with an independent
deterministic synthetic adapter and golden vectors, including malformed
carriers, request policy, transaction binding, parent mutation, wallet swaps,
pending/failure classification and replay against a new expected request. A
valid verifier result is passed directly to `RewardService.issuePeiQualification`
to prove the admission seam, while no public endpoint, helper UI, live RPC,
wallet transaction, payout or initial client bundle is added.

WP-022C has no physical-phone gate. Browser/deep-link transport and the first
user-visible PEI journey belong to WP-022D; carrier-content ablation remains
deferred until that complete journey works.

Evidence: [WP-022C](../evidence/wp-022c.json).

## WP-022D: Two-origin helper journey

WP-022D connects the frozen protocol to the game and to a separate helper web
origin. After the existing Daily wallet authorization, NIMble Knots creates an
authenticated earn request and navigates to the helper. The helper discloses
the exact wallet, network, amount and direction before acting. It obtains the
proxy-to-player transaction from its same-origin server, waits for chain
finality, and returns the complete proof to the game. The game verifies that
edge, persists it, creates one exact linked spend request and sends the browser
back to the helper. The helper asks Nimiq Pay to send the same amount from the
authorized player wallet to the proxy with the spend-request commitment in
transaction data. Only after finality does it return the complete two-edge
journey. A fresh game-side verification then issues the short-lived WP-022B
Daily admission.

Both crossings use complete, overcomplete v0 carriers. A SHA-256 request
commitment is the only value written into either transaction's data field.
The browser is transport and presentation: it cannot declare execution,
addresses, amount, request binding or finality. The helper origin keeps an
already submitted transaction hash in its `sessionStorage` long enough to
resume a reload without asking for another transfer; the game origin similarly
keeps the returned carrier until verification succeeds. Cancel and error states
leave Practice available.

The initial helper browser coverage uses two loopback origins and a fake Nimiq
provider. It exercises earn, return, helper reload, spend, final return,
admission, reload and the exact V10 R5 volcanic Daily start. This establishes
browser integration but does not establish that Nimiq Pay retains provider
access across real cross-origin Mini App navigation.

Evidence: [WP-022D](../evidence/wp-022d.json).

## WP-022E: Restart-safe mainnet canary

WP-022E makes the two server roles deployable as separate Render services. The
ordinary game process uses PostgreSQL for the active PEI journey, including the
accepted earn proof and exact spend request. A session or process replacement
can therefore continue the same transfer pair while the request remains valid.
The helper has a dedicated entry point and database. Before its first broadcast
it stores the exact signed earn transaction bytes, hash and validity-start
height under the request commitment. Any ambiguous submission, reload or
process restart rebroadcasts only those bytes; it never constructs a replacement
transaction for that request.

The helper signer uses a dedicated Nimiq key read from a secret file. Startup
checks that the key derives the configured proxy address, the RPC has consensus,
the current block is fresh and on the configured network, and the helper has
enough balance. Mainnet additionally requires the exact operator acknowledgement.
`PEI_PROXY_PAUSED` defaults to `true`; the browser and verifier remain readable
while outbound earn transfers are paused. The game and helper both query the
chain independently and require macro-block finality. The game reports the two
accepted transaction hashes after qualification so an operator can reconstruct
the canary from chain truth.

The deployment gate is deliberately bounded to one participant and one funded
1 NIM earn while reward payout remains `record-only`. The helper hot wallet is
the canary's spending limit: fund it with only the authorized canary amount and
restore `PEI_PROXY_PAUSED=true` after the journey. A wider public activation
requires a durable helper-side daily sponsor budget and per-wallet issuance
policy; the current Socket.IO limiter and low balance are canary controls, not a
public distribution policy.

Phone Gate B is the first real Nimiq Pay, two-origin and MainAlbatross gate. It
must confirm both disclosures and wallet approvals, automatic return after each
finality wait, the two reported hashes, reload without a duplicate transfer,
the admitted V10 R5 volcanic Daily match, and unchanged wallet-free Practice.
Carrier-content ablation remains closed until this operational journey passes.

Evidence: [WP-022E](../evidence/wp-022e.json).
