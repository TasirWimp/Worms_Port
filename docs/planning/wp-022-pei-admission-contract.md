# WP-022 PEI Admission Contract

This contract implements the project owner's operational order for Proof of
Ecosystem Interaction: establish the Daily gameplay and reward boundary first,
then connect a helper Mini App and chain verifier, and only after the complete
path works compare alternate receipt carriers. The experiment brief remains a
design input, but its carrier-ablation work does not define this first product
slice.

## WP-022B: Durable admission foundation

This was the first admission implementation. WP-022H supersedes its
wallet/day-bound browser credential with the durable receipt inventory defined
below; the section remains as implementation history.

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
valid verifier result is passed directly to `RewardService.issuePeiReceipt`
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

The first physical-phone attempt established that Nimiq Pay can submit the
return as an HTLC early-resolution transaction. Its chain sender is the HTLC
address even though the authorized player wallet co-signs as the HTLC creator.
The RPC adapter therefore parses the consensus-validated HTLC proof and exposes
only an `early-resolve` creator. The verifier accepts the contract sender only
for a successful spend when that creator equals the PEI subject. Direct subject
sends remain valid; regular transfers, timeout resolutions, malformed proofs,
wrong creators and non-HTLC substitutions remain invalid.

The deployment gate is deliberately bounded to one participant and one funded
1 NIM earn while reward payout remains `record-only`. Fund the helper with only
the authorized canary amount and restore `PEI_PROXY_PAUSED=true` after the
journey. A completed or rejected return can replenish the helper and allow that
same balance to fund another fresh request, as the first phone attempt also
demonstrated. Low balance is therefore exposure reduction rather than an
issuance limit. A wider public activation requires a durable helper-side daily
sponsor budget and per-wallet issuance policy; the current Socket.IO limiter
and supervised pause switch are canary controls, not a public distribution
policy.

Phone Gate B is the first real Nimiq Pay, two-origin and MainAlbatross gate. It
must confirm both disclosures and wallet approvals, automatic return after each
finality wait, the two reported hashes, reload without a duplicate transfer,
the admitted V10 R5 volcanic Daily match, and unchanged wallet-free Practice.
The corrected journey passed on the owner's physical phone at `82187cb`: both
real transfers completed, qualification succeeded and the V10 R5 volcanic
Daily match started. The helper was then redeployed with
`PEI_PROXY_PAUSED=true`, and WP-022E is complete.

The next operational waypoint reuses the existing WP-013 reward ledger,
mainnet signer boundary, exact-byte payout recovery and finality reconciliation
for one supervised PEI-qualified 1 NIM winning canary. The helper remains
paused except during that bounded journey. Durable helper-side daily sponsor
budget and per-wallet issuance controls are the next required implementation
before broader availability. Carrier-content ablation remains deferred until
that complete reward path works.

Evidence: [WP-022E](../evidence/wp-022e.json).

## WP-022F: Supervised mainnet reward canary

WP-022F connects the accepted PEI-qualified Daily journey to the existing
WP-013 MainAlbatross payout state machine for one supervised 1 NIM winning
canary. It preserves the exact V10 R5 volcanic match, server-authoritative
replay verification, sponsor budget, durable entitlement and claim records,
exact-byte transaction recovery, idempotent broadcast, and macro-block
finality reconciliation.

The normal product rule remains one started rewarded attempt per wallet and UTC
day. During this canary only, the explicitly configured owner test wallet may
receive up to twelve durable attempt slots. This leaves at least ten further
starts after the two earlier same-day Phone Gate B/C preparation attempts. Each
started loss or forfeit consumes its own numbered slot; cancelled reservations
do not consume a slot and remain subject to the separate five-reservation churn
limit. The exception does not change any other wallet, Daily budget, one-active
match rule, PEI requirement, replay validation, claim authority, signer check,
payout recovery, or finality rule.

Phone Gate C completes one fresh two-transfer PEI journey, starts the admitted
V10 R5 volcanic Daily match, wins it, claims the fixed reward, and observes the
same entitlement reach a finalized 1 NIM MainAlbatross payout with a visible
transaction hash. One such win is sufficient for Phone Gate C; the remaining
numbered slots intentionally stay available for supervised development and can
each produce their own verified payout. After development testing, remove the
test-wallet override and repeat acknowledgement, restore the default
one-attempt rule, and pause both reward issuance and helper transfers until the
next bounded waypoint.

Durable helper daily sponsor-budget and per-wallet issuance controls remain
required before broader availability. Receipt-carrier ablation remains
deferred until this operational reward path is complete.

The first Phone Gate C payout completed at deployed commit `5c0ddb2`: the owner
completed the PEI journey and verified V10 R5 win, claimed the reward, and
received 1 NIM. The final payout update contained the authoritative transaction
hash, but the result scene rendered only its status message. The correction
adds a full selectable payout-hash field as soon as a signed transaction exists
and keeps it visible through inclusion and finality. The owner accepted the
corrected hash presentation on the physical phone. The temporary repeat-attempt
variables were removed, rewards were paused, and the helper's live startup log
confirmed transfers paused on MainAlbatross. Phone Gate C and WP-022F are
complete.

The live ledger records two distinct finalized 1 NIM development entitlements
for the same normalized configured test wallet. They finalized at
`2026-09-12T17:43:59.787Z` with transaction hash
`d8eb722e52846266a3844d36f07a65a5c323a4fab95293175063335b786ddb3d` and at
`2026-09-12T17:50:59.805Z` with transaction hash
`7d68a4f0f034f1e51f192f86d94af7f42af386482fa0df024168e3cd00c584ef`.
These are separate challenge entitlements under the owner-approved development
retry policy, rather than a duplicate claim for one entitlement.

The hash presentation and accumulated accepted V10 presentation state were
captured by Ubuntu 24.04 Visual baseline candidates run `34710588366` at exact
commit `3789221`. All capture steps passed with eight visual cases and twelve
expected project skips. Primary explicitly reviewed the payout card and current
combat/sideways/landscape states before promoting the 23 changed artifact files;
the finalized payout candidate has SHA-256
`53119EC0A7BF740016D7FF98671F9EC7D8586799AD76F7D93D5937526A20F5E0`.
The baseline commit must still pass ordinary Ubuntu comparison CI before deploy.

Evidence: [WP-022F](../evidence/wp-022f.json).

## WP-022G: Durable helper issuance policy

WP-022G replaces the low-balance canary convention with a durable helper-side
issuance decision. Before constructing a new earn transaction, the helper
reserves its request commitment, normalized wallet, UTC issuance day, transfer
amount and request expiry in PostgreSQL. A day-level advisory lock serializes
different requests across helper instances. Committed transfers and unexpired
reservations count toward the configured daily sponsor budget and per-wallet
daily issuance limit. If either limit would be exceeded, the helper refuses the
request before querying the RPC or signing.

The exact-request recovery rule remains unchanged. A repeated commitment with
an existing signed transaction bypasses new issuance and rebroadcasts only the
stored bytes. A same-commitment reservation must retain identical wallet, day,
amount and expiry. A signing or preparation failure rolls back the PostgreSQL
transaction; an ambiguous broadcast retains the committed issuance and exact
signed bytes. Paused startup permits a zero budget, while an enabled helper must
configure enough budget for at least one earn transfer. The first activation
uses `PEI_PROXY_DAILY_BUDGET_LUNA=100000` and
`PEI_PROXY_DAILY_WALLET_LIMIT=1`.

The selected PostgreSQL CI job runs `test:pei:postgres` alongside the reward
database gates. It proves migration from zero, restart persistence, same-wallet
refusal and concurrent daily-budget serialization through two store instances
before Render receives the package. Migration initialization itself uses a
transaction-scoped advisory lock so two starting helper/game instances cannot
race PostgreSQL catalog creation.

Routine phone and release verification now starts the standard V10 R5 volcanic
profile. Browser suites marked `@legacy` retain prior engineering evidence but
are filtered from the selector, five-project quality gate and daily/release
gate. An explicit `--legacy` run is diagnostic only and cannot become a quality
or performance gate. Routine built-server smoke likewise creates and pauses
only V10 R5; its retired runtime profiles require a separate explicit
diagnostic opt-in.

Phone Gate D completes one fresh real helper earn and return with the first
wallet issuance, then starts over and confirms that a distinct second earn for
the same wallet and UTC day is refused cleanly before signing. Ordinary
wallet-free volcanic Practice must still start. The game reward service is
temporarily unpaused only because the current product exposes PEI from the Daily
availability surface; the gate does not start another rewarded match or claim a
payout. After the phone result, both helper transfers and rewards return to
paused settings. Receipt-carrier ablation remains deferred.

Evidence: [WP-022G](../evidence/wp-022g.json).

## WP-022H: Durable wallet receipt refinement

WP-022H corrects the product lifetime boundary exposed by Phone Gate D. The
helper models an ecosystem interaction that may happen repeatedly; it therefore
has no per-wallet or per-day qualification rule. Its pause switch, exact-byte
idempotency, balance check and global UTC-day exposure ceiling remain
operational controls on the helper wallet rather than properties of a player's
receipt. Pausing Daily rewards prevents a Daily reservation but does not prevent
an otherwise enabled helper journey from issuing a receipt.

A valid completed earn-and-return journey issues one durable receipt to the
normalized wallet. The reward server stores the receipt ID, wallet,
qualification digest and issuance time. It stores no browser bearer token,
challenge day or receipt expiry. Repeating delivery of the same verified
journey is idempotent and returns the existing receipt; a distinct journey adds
another receipt. Existing verified, unconsumed admission grants remain usable
after the migration even when their former day or expiry has passed.

An authorized wallet may accumulate several unused receipts. `reward.info`
returns only that authorized wallet's available count, including after app or
session replacement. The client never persists PEI authority. The Daily
reservation selects and holds the oldest available receipt on the server.
Starting the V10 R5 volcanic Daily consumes it atomically with the existing
started-attempt transition. Cancellation or reservation expiry releases the
hold without consuming the receipt. The independent one-started-Daily-per-wallet
and UTC-day rule remains unchanged.

Routine verification supports V10 only. Directly named legacy browser files no
longer opt themselves into `@legacy` tests, and routine unit-family commands
exclude version-only and legacy-bearing files while retaining extracted V10
and shared current coverage. `npm run test:legacy` is an explicit diagnostic
command and is outside feature, quality and release acceptance.

Phone Gate E verifies the corrected lifetime: authorize one wallet; confirm its
unused receipt count survives a close/reopen; complete a second helper journey
on the same UTC day and see the count increase; start Daily and see exactly one
receipt consumed; then confirm a second Daily start is still refused for that
day while another helper interaction remains possible. Standard wallet-free
V10 R5 volcanic Practice must still start. Carrier-content ablation stays
paused. The supervised helper deployment uses a 1,000,000 Luna global daily
ceiling for up to ten gross 1 NIM earn transfers during this gate.

Phone Gate E passed on the owner's physical phone at `ec9adf7` plus the
whitespace-only `1132264` follow-up. Three real MainAlbatross cycles proved
receipt persistence across closing and reopening, two distinct same-day
receipts held by one wallet, one receipt consumed for a loss, and the two
remaining receipts consumed separately by winning V10 R5 volcanic Daily
matches whose 1 NIM rewards arrived. The owner-approved repeat-attempt override
made the same-day consumption checks possible; the default one-started-Daily
rule remains covered by Phone Gate A and unchanged automated authority tests.
Afterward the owner removed the repeat-attempt variables and redeployed both
game rewards and helper transfers paused. Disposable PostgreSQL reward, PEI and
current V10 browser gates passed in CI. The one intended authorized-Daily visual
change was captured and reviewed from Ubuntu artifact run `34753595816`, then
passed ordinary comparison in run `34753818526` at `ec252c2`.

**WP-022H and the planned V10 PEI implementation line are complete.** The
receipt-carrier experiment remains paused and no successor PEI slice is
authorized.

Evidence: [WP-022H](../evidence/wp-022h.json).
