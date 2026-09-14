# NIMble Knots: Cotton Clash

NIMble Knots is an MIT-licensed, mobile-first fantasy artillery game built with
Phaser for the Nimiq Pay Mini Apps environment. The competition release focuses
on an immediately available single-player challenge against a deterministic AI
opponent, with an optional fixed sponsor-funded NIM reward for eligible wins.
The `Worms_Port` repository was bootstrapped from the MIT
`TurtlePU/worms-ii` code base and retains that provenance.

## Standard volcanic Practice

The normal `/` entry now starts server-backed V10 R6 Practice in the approved
Volcanic Ruin stepped valley, with the existing terrain weapons and Loomkeeper.
The five background images load only when combat starts. Practice remains
wallet-free. Daily Challenge uses the same V10 R6 volcanic authority after its
existing wallet, PEI receipt and reward reservation checks.
R6 keeps the exact R5 terrain and weapon balance, presents smaller actors with
compact color-changing health bars and a matching direct-hit envelope, and
gives each actor a 60-second action phase with slightly faster walking and a
compact translucent left-thumb cluster for holding left or right and tapping
or sliding up to jump. A direct Jump tap rises vertically; sliding from a
direction into Jump carries that direction into the takeoff. Sliding between
the three fixed buttons preserves responsive bounded air steering without a
drifting touch origin, and jump keeps its short pre-landing buffer.
Its ordinary jump is lower and shorter while Threadleap retains its reinforced
arc. The player opens with 5 Thread,
so Spoolburst is available on the first turn. R5 is an
explicit diagnostic profile and is excluded from routine acceptance.
The explicit local preview URLs remain available for historical review.
The [V8 preview controller](client/src/combat/action-turns-v8-fixture.ts) loads
only when requested, keeping its local authority out of the initial bundle.

For the existing owner Render service, replace the old V9 Practice profile with:

```text
NODE_ENV=production
NIMBLE_RUNTIME_PROFILE=development-v10-practice
REWARD_PAUSED=true
```

Redeploy and open `/` without preview query parameters. This profile constructs
no identity, database or payout service, even when old credentials are saved.
Ordinary startup without a development profile selects volcanic V10 R6 for both
Practice and the separately configured Daily service. The development profile
remains Practice-only and constructs no reward service. Old V8/V9 protocols and
replays retain their historical behavior. Runtime selection does not activate
or fund rewards by itself.

The `development-v10-practice` block is only for isolated Practice acceptance.
It cannot serve Daily Challenge. Before Daily Phone Gate A, change the existing
Render service in one operation: delete `NIMBLE_RUNTIME_PROFILE`, set
`REWARD_MODE=record-only`, and set `REWARD_PAUSED=false`. Keep
`NODE_ENV=production`, the existing `DATABASE_URL`, and the existing identity
configuration; `NIMBLE_DEPLOYMENT` may be absent or exactly `production`. Save
these settings together and redeploy. Unpausing while the development profile
is still selected deliberately fails startup. Record-only mode exercises wallet
authorization, durable eligibility, V10 replay settlement and claim state
without creating a reward transaction. Reward-payout mainnet remains a later
explicit gate; the separate 1 NIM PEI interaction has its own canary below.

The owner accepted the local scenic restart fix on 2026-09-11. New server-backed
phone acceptance should cover Start Practice, aim/fire and AI reply, pause,
reconnect/reload, and repeated retries with the background still present.
See the [standard Practice contract](docs/planning/wp-015d4f-volcanic-ruin-preview-bundle-contract.md#wp-015d4h-standard-server-backed-volcanic-practice).

## Temporary Nimiq Pay Display Workaround

**Current default:** a portrait browser viewport renders the complete game as
a clockwise-rotated landscape composition. Before opening the mini app, disable
Android auto-rotate while the phone is portrait; then hold the phone with its
top/earpiece on the left. The ordinary Render URL needs no query parameter. The
Practice start card repeats this setup before the player starts a Clash.

This WP-011D policy is a host workaround, not the intended permanent display
architecture. Nimiq Pay currently keeps its native URL ribbon and Android
system bars, does not expose the standard Fullscreen API to the mini app, and
can preserve a portrait WebView when Android auto-rotate is disabled. The game
uses that stable portrait viewport sideways so substantially more of the
landscape battlefield and controls remain usable.

Controls and escape hatches:

- default or `?sideways=1` / `?sideways=right`: rotate content clockwise; hold
  the phone with its top on the left,
- `?sideways=left`: rotate content counter-clockwise; hold the phone with its
  top on the right,
- `?sideways=off`: use the maintained normal portrait/landscape responsive
  composition, and
- if the host actually reports a landscape viewport, virtual rotation switches
  off automatically to prevent a double rotation.

Revisit and remove the default workaround once Nimiq Pay provides a documented
full-screen game mode or exposes a reliable standard/native full-screen
capability that removes its host chrome. Do not replace this policy with an
undocumented bridge. The canonical implementation status and removal condition
are also recorded in the Execution Pointer of
`docs/planning/implementation_plan.md`.

## Import Boundary

- `TurtlePU/worms-ii` is the approved base code source. Its MIT notice is
  preserved in `LICENSE` and `legal/source-manifest.json`.
- `lorgan3/sorcerers` is a quarantined reference/archive only. No Sorcerers
  code or bulk assets are imported into the product tree.
- V10A-E terrain planning uses Sorcerers only through the registered
  [frozen terrain-tactics behavior record](docs/evidence/wp-015d4a-v10-terrain-tactics-behavior-record.md).
  The owner-authorized V10F preparation has a separate
  [pinned procedural-terrain reference pack](docs/evidence/wp-015d4c-v10f-procedural-terrain-reference-pack.md)
  covering Sorcerers and the other evaluated engines. All external code, maps,
  algorithms, constants, sample tiles and assets remain excluded from product
  paths.
- V10G preparation records the separately authorized Sorcerers weapon/terrain
  observations and product-owned implementation plan in the
  [V10G contract](docs/planning/wp-015d4a-v10-terrain-starts-contract.md#v10g-terrain-and-weapon-tactics-preparation).
  Its first target is meaningful pocket, shelf and breach choices on Twin Crests;
  the geometry foundation and R3 weapon integration are implemented. The local
  `/?combat-preview=v10g` route defaults to the phone-accepted Twin Crests.
  The expanded R4 catalogue adds `&terrain-map=trench-needle`,
  `&terrain-map=stepping-mesa`, `&terrain-map=rampart-high-left` and
  `&terrain-map=rampart-high-right`. These maps are phone-accepted; V10G is complete.
  Threadball lobs, Needlepoint fires straight and Spoolburst breaches; cover
  shields the hitbox and blocks blast influence. Existing R3 recordings and R2
  previews retain their original behavior. Public Practice/Daily are unchanged.
  The separate `/?combat-preview=v10g&background-preview=volcanic-ruin`
  preview now composes the existing art with an ASCII-authored stepped valley
  (R5); it keeps the tower visible and both starts in the initial frame.
  See the [composition contract](docs/planning/wp-015d4f-volcanic-ruin-preview-bundle-contract.md#wp-015d4g-owner-requested-composition-and-terrain-alignment).
  The [frozen weapon observations](docs/evidence/wp-015d4d-v10g-weapon-terrain-reference.md)
  preserve the reference boundary separately from the evolving contract.
- WP-024 Waypoint 1 is available only through the wallet-free local
  `/?combat-preview=v10r7` route. It keeps the accepted R6 Volcanic Ruin match,
  controls, timing, damage and impact motion while previewing a 256-unit
  Threadball crater and a 328-unit Spoolburst crater. Standard Practice and the
  PEI-gated Daily Challenge remain on R6 until the R7 phone gates are accepted.
- Assets from Sorcerers may move into `assets/` only after exact-file license
  evidence proves commercial use, redistribution, and modification are allowed.
- Product assets must be traceable through `legal/asset-manifest.json`.

## Asset Policy

The default allowed bucket is strict: CC0, public domain, permissive code
licenses, CC-BY with attribution, or paid/owned assets with explicit commercial
rights. NonCommercial, personal-use-only, unclear, GPL/AGPL/LGPL, CC-BY-SA,
no-redistribution, and branded/derivative IP assets are blocked for product use.

Run the compliance gate before importing or committing assets:

```sh
npm run check:compliance
```

## Build

Use Node.js 20 or newer.

```sh
npm install
npx playwright install chromium webkit
npm run build
npm run smoke
npm run test:protocol
npm run test:simulation
npm run test:loomkeeper
npm run test:relics
npm run test:combat
npm run test:practice
npm run test:identity
npm run test:reward
npm run test:reward:postgres
npm run test:browser:smoke
npm run test:browser:combat
npm run test:browser:practice
npm run test:browser:identity
npm run test:browser:reward
npm run test:browser:reward:postgres
npm run test:browser:resilience
npm run test:browser:visual
npm run test:browser:performance
npm run test:browser:matrix
npm run assess:v10
npm run check:bundle-budget
npm run check:identity-bundles
npm run check:reward-security
npm run verify:quality
npm run verify:postgres
npm run verify:full
npm run verify:changes
npm run verify:daily
npm start
```

The browser client builds with Vite into `client/build/`. The Node server builds
with esbuild into `server/build/server.js`. The smoke command performs a fresh
build, starts that server on an available local port, and verifies the game
page, built overlays, approved-asset plumbing, and room join-ID API.
Browser commands reuse production outputs only when their exact input/output
hashes and Node version match; stale or missing proof forces a fresh build.
`npm run test:browser:smoke` runs the phone-sized Chromium and WebKit touch
journey. `npm run test:browser:matrix` is the
zero-retry WP-014 release gate for all maintained browser suites at Chromium
360x640, 390x844, 412x915, and 844x390 plus WebKit 390x844. It fails on an
unexpected project skip or omitted critical journey. `npm run
test:browser:performance` uses the pinned 390x844 Chromium project, one worker,
one discarded warm-up, and five full-motion samples. It records sanitized raw
timings under ignored `test-results/` and fails the navigation, combat-readiness,
projectile, complete-response, or lazy Mini App SDK request budget. `npm run
check:bundle-budget` reads the fresh Vite manifest, follows only the initial
static entry graph, deterministically gzips its JavaScript and CSS, and records
the exact ignored byte report.

Use `npm run verify:changes -- --dry-run` to preview selected checks, then
`npm run verify:changes` to run them. `verify:feature` invokes the same selector.
Staged, unstaged and untracked files are included; use
`npm run verify:feature -- --base <starting-commit>` for committed slice work.
A clean tree selects nothing, invalid bases fail, and unclassified files select
conservative product coverage. In Windows PowerShell, use `npm.cmd` for forwarded
arguments or call `node scripts/verify-changes.js --dry-run` directly.
Ordinary docs/Codex settings need no game build; runtime changes select relevant
unit families, types, build/smoke/security and whole browser specs on Chromium
390x844. Visual comparisons retain all five projects. See the mapping in
[scripts/verify-changes.js](scripts/verify-changes.js) and the
[development workflow](docs/process/development_workflow.md#verification-funnels).

`verify:changes`, `verify:full`, and `verify:daily` share an atomic checkout
lease. If one is active, another exits before running checks and identifies the
active run. This prevents scheduled and foreground verification from sharing
temporary files, build output, or browser processes.

The existing daily automation runs the full product suite at **22:00
Europe/Berlin** through `npm run verify:daily`. It runs compliance/types/build
once, then reuses verified outputs for the full browser/security/performance
gate and audit. PostgreSQL runs when its isolated local prerequisite is present;
otherwise the missing coverage is explicit. Release boundaries still require
the full gate and Ubuntu comparison CI.

`npm run verify:quality` performs a fresh build followed by the bundle,
identity/reward-security, complete browser matrix, and performance gates.
`npm run verify:full` adds the fast funnel, built runtime smoke, and audit. It
prints explicitly when local PostgreSQL authority is unavailable; that message
is not PostgreSQL evidence. `npm run verify:postgres` remains the separate
mandatory real-database gate and requires `WP014_TEST_DATABASE_URL`. GitHub
Actions selects relevant jobs from the PR merge base or pushed commit range,
cancelling superseded edit runs. Manually dispatch **Verify** for all reviewed
Ubuntu browser shards, PostgreSQL/reward-security and performance/bundle jobs.
Non-Linux `verify:quality` runs the complete logic matrix but explicitly omits
visual comparison; ignored snapshots are rejected in CI, where the reviewed
Linux baselines remain authoritative. The performance job retains its sanitized
successful or failed byte/timing JSON for 14 days.

`npm run test:browser:resilience` is the focused WP-014C suite. It uses
Chromium's supported deterministic network controls for constrained initial
loading, Chromium and WebKit offline/resume, delayed synthetic wallet
settlement, truthful lost-session recovery, and two simultaneous isolated
browser contexts. It uses only loopback authority and fixed synthetic keys;
it does not emulate arbitrary WebSocket packet loss or contact Nimiq Pay,
Render, a real wallet, an external RPC, or a chain.

WP-014D adds focused PostgreSQL and reward-security gates. Set
`WP014_TEST_DATABASE_URL` to an administrator connection for a disposable
PostgreSQL service on `localhost`, `127.0.0.1`, or `::1`, then run
`npm run test:reward:postgres` and `npm run test:browser:reward:postgres`.
Each command creates and drops only uniquely named `nimble_knots_wp014_*`
databases. The harness refuses external databases, chain reward modes, payout
RPC settings, recovery words, and private-key files. `npm run
check:reward-security` requires a fresh build and scans source, build output,
and generated text artifacts for payout-key fixtures, wallet proofs, session
tokens, and server-only dependency leakage. The digest-pinned PostgreSQL 16
GitHub Actions job is authoritative when local PostgreSQL is unavailable.

WP-014 visual baselines are created only by the GitHub Actions workflow
**Visual baseline candidates** on the implementation pull request. That
PR must carry the `visual-baseline-candidate` label; ordinary UI edits no longer
regenerate candidate images automatically. The
artifact-only workflow runs the pinned Ubuntu 24.04 Chromium/WebKit revisions
with `--update-snapshots` and uploads the candidate PNGs; it never commits
them. After the workflow exists on `main`, it can also be dispatched manually
for an exact branch ref. Download and inspect every candidate before adding it
under `tests/browser/visual.spec.ts-snapshots/`. Windows or unreviewed
screenshots are not release evidence, and ordinary `Verify` runs only compare
committed baselines.

Playwright reports, traces, screenshots, and videos are generated outside
`assets/` and are ignored locally. CI retains them only when verification
fails.

## Session And Protocol Foundation

The active Socket.IO transport uses strict request/acknowledgement schemas
and server-issued 256-bit opaque session tokens. Socket.IO IDs are transport
details and are never accepted from callers as player identity. Practice
sessions work without a wallet. The default client creates live V10 R6 Practice
Clashes, submits ordered commands, consumes authoritative snapshots and
results, and reconnects with the rotated session token. WP-012 adds an optional
verified Nimiq wallet identity to that existing session. WP-013 uses that
identity only for the separate Daily Challenge entry and binds any fixed reward
to the verified address before play.

Production deployments should set `ALLOWED_ORIGINS` to a comma-separated list
of additional trusted origins when same-origin access is insufficient. Missing
Socket.IO Origin headers are rejected by default and may be enabled only for a
controlled non-browser environment with `ALLOW_MISSING_ORIGIN=true`.
`SESSION_OPEN_RATE_CAPACITY` may raise the per-IP session-open burst only in a
controlled deployment or test environment; production defaults to thirty to
accommodate mobile carrier/NAT address sharing.

## Nimiq Pay Identity And Daily Challenge

WP-012 provides the identity adapter, and WP-013 makes it available from the
optional Daily Grand Knot Challenge. Opening the ordinary `/` journey and
starting Practice does not load or initialize the Mini App SDK and never
prompts for a wallet. The Daily entry first discloses public availability,
fixed Luna/NIM amount, one-started-attempt-per-wallet-and-UTC-day eligibility,
sixteen-turn limit, and reservation window. It requests an account only after
the player chooses that path. The admitted match is the same server-authoritative
V10 R6 Volcanic Ruin challenge used by Practice, with reward mode preventing
pause and with settlement bound to its verified automated replay.
`/?identity-preview=1` remains the isolated identity diagnostics surface.

The authorization asks Nimiq Pay to sign a readable, short-lived server
challenge and rotates the anonymous session token only after the server
verifies the official Nimiq signed-message construction and derives the
selected address from the signing public key.

Identity-enabled deployments require both:

- `NIMIQ_NETWORK=main-albatross`, which fixes the signed authorization domain,
  and
- `IDENTITY_PUBLIC_ORIGIN=https://your-public-origin.example`, or Render's
  automatically supplied `RENDER_EXTERNAL_URL` for the same purpose.

Startup fails if only one value is available. Public deployments must also keep
their Socket.IO origin policy explicit through `ALLOWED_ORIGINS` when access is
not same-origin. Pending authorizations are memory-only, expire after three
minutes, are single-use even after invalid proof submission, and safely vanish
on restart or disconnect. Rejected, timed-out, or malformed signing responses
also trigger an owner-bound best-effort cancellation so the same account can
retry immediately. No private key, reusable signature, raw device ID, or
wallet proof is stored in the browser session token. The optional device-ID
button tests consent only, immediately discards the returned value, and cannot
authenticate a session.

`@nimiq/mini-app-sdk` is exactly pinned and isolated in a lazy client chunk.
`@nimiq/core` is exactly pinned, used only by the server verifier, and remains
external to the esbuild bundle so its packaged WASM resource resolves correctly
on Render. `npm run check:identity-bundles` enforces that separation.

WP-013 rewards are disabled by default. `REWARD_MODE=disabled` does not require
a database, RPC endpoint, or sponsor key and cannot move funds. Enabled modes
require a PostgreSQL `DATABASE_URL`; the server applies
the ordered SQL files under `server/migrations/` before listening. The safe
activation ladder is:

1. `disabled` - public Practice and identity, with no reward authority.
2. `record-only` - durable reservations, replay-verified claims, and a
   deterministic fake payout worker for staging acceptance; no Nimiq
   transaction is created.
3. `testnet` - explicitly configured TestAlbatross RPC and dedicated,
   low-funded test signer.
4. `mainnet` - operational release only, requiring the exact acknowledgement
   `REWARD_MAINNET_ACKNOWLEDGEMENT=I_UNDERSTAND_MAINNET_PAYOUTS`.

Common settings are `REWARD_LUNA`, `REWARD_DAILY_BUDGET_LUNA`,
`REWARD_FEE_LUNA`, `REWARD_RESERVATION_SECONDS`, `REWARD_CLAIM_SECONDS`, and
the immediate kill switch `REWARD_PAUSED=true`. Monetary values are integer
Luna (`100000 Luna = 1 NIM`). The pinned ruleset currently requires
`REWARD_TURN_LIMIT=16`.

### PEI helper and Daily admission

`PEI_ENABLED` defaults to `false`. When enabled, the Daily Challenge requires a
two-edge MainAlbatross interaction before reservation: the dedicated helper
sends NIM to the authorized player wallet, then Nimiq Pay sends the same amount
from that wallet back to the helper. Nimiq Pay can implement the return as an
HTLC early resolution, so the visible chain sender can be the HTLC address. The
verifier accepts that form only when the successful transaction's parsed HTLC
proof identifies the authorized player wallet as its creator; other HTLC proof
forms and creator mismatches fail closed. Both transactions carry the
commitment of their server-authenticated request and must reach macro-block
finality. A fresh game-server verification issues a durable receipt bound to
the wallet. Several unused receipts may accumulate without expiry, and the
oldest one is consumed atomically with a started Daily attempt. The independent
one-started-attempt-per-wallet and UTC-day rule remains in the reward ledger.
Practice never reads PEI state or initializes the wallet SDK.

The game and helper are separate Render Web Services built from the same commit.
Use the usual build command for both. The game starts with `npm start`; the
helper starts with `npm run start:pei-proxy`. Give each service its own Render
PostgreSQL database. This keeps the helper signer database separate from the
reward ledger. Configure these identical values on both services, using exact
HTTPS origins without a trailing slash:

```text
NODE_ENV=production
PEI_ENABLED=true
PEI_NETWORK=main-albatross
PEI_RETURN_ORIGIN=https://<game-service-host>
PEI_PROXY_ORIGIN=https://<helper-service-host>
PEI_PROXY_ADDRESS=<dedicated-helper-address>
PEI_REQUEST_TTL_SECONDS=900
PEI_EARN_MIN_LUNA=100000
PEI_SPEND_MIN_LUNA=100000
PEI_REQUEST_AUTH_SECRET=<same-32-byte-Base64URL-secret>
PEI_RPC_URL=https://<trusted-main-albatross-rpc>
```

Generate the shared request-authentication secret once and paste the same value
into both services:

```powershell
$peiSecretBytes = [byte[]]::new(32)
[Security.Cryptography.RandomNumberGenerator]::Fill($peiSecretBytes)
[Convert]::ToBase64String($peiSecretBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
```

The game service additionally keeps its existing `DATABASE_URL`, identity and
origin settings and uses:

```text
NIMIQ_NETWORK=main-albatross
IDENTITY_PUBLIC_ORIGIN=https://<game-service-host>
REWARD_MODE=record-only
REWARD_NETWORK=main-albatross
REWARD_PAUSED=false
```

Create a dedicated helper key outside this repository. The command refuses an
existing file and any path inside the repository and prints the derived public
address without printing the private key:

```powershell
npm run pei:generate-proxy-key -- "C:\absolute\outside\repo\pei-proxy-key"
```

Create a Render secret file named `pei-proxy-key` from that file's exact
hexadecimal content. Configure only the helper service with its own
`DATABASE_URL` and:

```text
PEI_PROXY_PRIVATE_KEY_FILE=/etc/secrets/pei-proxy-key
PEI_PROXY_FEE_LUNA=0
PEI_PROXY_DAILY_BUDGET_LUNA=1000000
PEI_PROXY_PAUSED=true
PEI_MAINNET_ACKNOWLEDGEMENT=I_UNDERSTAND_MAINNET_PEI_TRANSFERS
```

Deploy the helper paused first. `GET /api/pei/config` must report the intended
network, game origin, proxy address and both `100000` Luna amounts. Register the
helper origin as the helper Mini App used by this canary. Fund the dedicated
helper address with only 1 NIM, change `PEI_PROXY_PAUSED=false`, and redeploy for
one owner-authorized canary. The game reward remains record-only; the two PEI
edges are the only real transfers. After the canary, restore
`PEI_PROXY_PAUSED=true` and redeploy before adding more funds.

The helper stores exact signed earn bytes before broadcast and reuses those
bytes after ambiguous RPC submission or restart. The game stores the accepted
earn proof and exact spend request so a replacement game process can continue
the same journey during its validity window. The helper and game each verify
chain data independently. After qualification, the game displays both complete
transaction hashes for operational reconstruction.

The helper records each new exposure in PostgreSQL before signing. Committed
transfers and unexpired reservations count against `PEI_PROXY_DAILY_BUDGET_LUNA`
for the UTC issuance day. The example ceiling permits ten 1 NIM earn transfers.
There is no per-wallet helper limit: the same wallet
may complete several distinct ecosystem interactions while the operational
exposure ceiling has capacity. Distinct helper instances serialize the budget
decision with a day-level database lock. A retry of the same request rebroadcasts
the exact stored transaction and consumes no additional allowance. Paused
deployments may keep the budget at zero; startup refuses to enable transfers
unless the budget can fund at least one configured earn amount.

Every completed two-transfer journey creates a durable server-side receipt for
the authorized wallet. Receipts do not expire and several unused receipts may
accumulate. Reauthorizing the wallet after closing or reopening the app restores
the server-reported count; no browser credential is involved. Starting a Daily
Challenge automatically consumes the wallet's oldest unused receipt. Merely
reserving and then cancelling or timing out returns that receipt to the available
inventory. Daily itself remains limited to one started match per wallet and UTC
day outside the documented wallet-scoped development override.

For a controlled repeat-attempt payout canary, an operator may temporarily set
`REWARD_TEST_WALLET_ADDRESS` to one compact or spaced test-wallet address and
`REWARD_TEST_DAILY_ATTEMPT_LIMIT` to an integer from `2` through `12`. Mainnet
also requires the separate exact acknowledgement
`REWARD_TEST_REPEAT_ACKNOWLEDGEMENT=I_UNDERSTAND_REPEAT_MAINNET_REWARDS`.
The override creates distinct durable attempt slots only for that address; it
does not bypass the daily Luna budget, one-active-match rule, replay-verified
win, single-use claim, payout idempotency, signer checks, or finality. Remove
all three test settings immediately after the canary to restore the default
one-started-attempt rule. Never target an uninvolved production player or add a
broad/global bypass. Each numbered slot can produce its own verified payout,
so keep this development override low-funded and actively supervised.
Here, the test wallet is the Nimiq Pay account that authorizes and receives the
reward; it is not the sponsor signer's funded address.

WP-013 operational acceptance completed on 2026-08-01. The user-run Render
record-only/PostgreSQL pass was followed by one deliberately tiny
MainAlbatross canary: transaction
`f3f40995754b708f2ae2586888d74688d8a5bf218fe07f80d49d1fe255e0c3e6`
transferred 1 NIM in block 57732455, crossed its macro-block finality threshold
at block 57732480, and had no duplicate after redeployment. The temporary
repeat-attempt settings were removed and `REWARD_PAUSED=true` was restored and
deployed. This records bounded acceptance only; mainnet rewards remain paused
pending the remaining quality and release gates.

Chain modes additionally require `REWARD_NETWORK`,
`REWARD_EXPECTED_SIGNER_ADDRESS`, `REWARD_RPC_URL`, and
`REWARD_PRIVATE_KEY_FILE`. The last setting must point to a Render secret file
containing only the 32-byte private key as hexadecimal. Never use a personal or
treasury wallet, put the key in an environment variable/database, or commit it.
The worker persists the exact signed bytes and hash before broadcast, reconciles
inclusion to macro-block finality, and sends expired/ambiguous cases to
`manual_review` instead of constructing a replacement transaction.

## Deterministic Simulation Foundation

Practice challenges use the product-owned
`nimble-knots-artillery-v2` ruleset. The authoritative model is independent of
Phaser and uses integer fixed ticks, an explicit uint32 seed, a packed collision
mask, bounded Relic physics, canonical SHA-256 state hashes, and replay records.
Client commands include both their transport sequence and expected simulation
turn; delayed, duplicated, conflicting, or wrong-turn commands cannot silently
apply to a later state. Legacy v1 replay hashes and reconstruction remain
supported.

Simulation state is currently in-process. It is suitable for the selected
single-instance persistent Node deployment, but it is not durable across
server restarts or multiple instances.

The independently designed `nimble-knots-loomkeeper-v2` policy evaluates a
fixed, bounded lattice of movement, Relic, angle, and power candidates by
calling the same public simulation transition API available to player
commands. Practice challenges currently disclose and use the immutable
`standard` profile. Its deterministic aim error and search resolution are the
only difficulty controls; the Loomkeeper receives no extra health, damage,
movement, collision knowledge, or retries. Only the selected legal plan is
committed to the authoritative replay.

The release roster is Threadball (balanced), Needlepoint (precision), and
Spoolburst (terrain/control). They share aim, power, movement, collision, and
turn rules; only their disclosed crater, damage radius, and maximum damage
bounds differ. No production Relic art is shipped yet.

## Complete Practice Clash

The default `/` journey is the first complete playable: choose Wizard, Thief,
or Warrior, start an unlimited non-rewarded Practice Clash, fight the standard
deterministic Loomkeeper, view the authoritative result, and retry with a fresh
challenge ID and seed. Practice does not require a wallet, matchmaking, another
player, or reward availability.

The live adapter owns request IDs, the ordered transport cursor, strict
acknowledgements, monotonic challenge revisions, reconnect snapshots, and
single result delivery. Disconnects suspend controls. A resumed session keeps
the same authoritative match; a lost in-memory session clearly offers a fresh
Practice Clash rather than implying restart recovery.

Practice pause uses the ordered `v1:challenge.pause` operation. It is available
only while an active practice match awaits the player's command, stops that
challenge's authoritative tick advancement, survives reconnect, and rejects
gameplay commands until resumed. Session and challenge expiry still bound
in-memory retention.

WP-011A stabilizes that lifecycle for real-device play. Consecutive completed
Clashes now reset scene-local result state and each transition to its own result
screen. The client retains the newest authoritative snapshot while presenting
accepted player movement, player shots and impacts, Loomkeeper aim, shots and
impacts, and the resulting terrain and Stitching changes in causal order.
Controls remain suspended during those presentation phases; reduced-motion
users receive the same causal phases with shorter timing.

Touch movement converts drag strength into one to four existing authoritative
movement commands, visibly animates each accepted displacement, and clears the
old aim so the player must deliberately aim again. Advisory trajectories clear
on Fire, movement, turn changes, disconnect, result, and challenge replacement.
The combat shell follows the usable `visualViewport` and gives the fixed 16:9
arena the mathematical maximum safe rectangle. Turn time is a compact top pill,
exact Stitching bars follow their Knotkin, movement and aim are floating thumb
pads, and the selected Relic expands into a temporary chooser. Controls keep
stable anchors but fade while player input is not legal. Fire remains a separate
tap after aim lock, while Retry and the combat full-screen action live in the
Pause sheet.

In landscape, capable browsers also expose a user-activated **Full screen**
action inside the Pause sheet. It requests the standard Fullscreen API with
hidden navigation UI but does not lock orientation. The action is omitted when
the browser reports no support, and rejection leaves the embedded layout
usable. A matching toggle remains available on the result screen while full
screen is active, so the player can always return to the browser. Web content
cannot guarantee
removal of Nimiq Pay's native URL ribbon or Android system bars; the host must
implement and permit full-screen WebView presentation for those surfaces to
disappear.

Samsung Galaxy S22 acceptance confirmed that full screen works in Samsung
Chrome but that Nimiq Pay does not expose the Fullscreen API. WP-011C removes
the forced landscape lock and adds the result-screen toggle.

WP-011C introduced the sideways composition and WP-011D makes its clockwise
form the temporary default. The browser viewport remains portrait, while the
game renders a landscape-sized scene rotated inside it and maps touch
coordinates back into that logical scene. The opt-out and host-removal
condition are documented in **Temporary Nimiq Pay Display Workaround** above.

## Phone Combat Fixture

WP-010 provides a portrait-first Phaser battlefield and touch-control surface
at `/?combat-preview=1`. It renders the v2 1024x576 logical Patch, packed
terrain, code-drawn Knotkin and Relics, Stitching, turn time, projectile traces,
and an advisory trajectory calculated against a detached simulation clone.
Movement and aim pads have single-pointer ownership; aim release locks without
firing, while Fire is a separate minimum-size action. Cancellation, release
outside, blur, backgrounding, resize, and orientation changes fail safe.

The fixture uses the same WP-011A causal presentation queue, bounded movement,
trajectory cleanup, and compact-landscape layout as live Practice. It remains
a deterministic test adapter; authoritative outcomes still come only from the
shared simulation and live server path.

The preview route remains a deterministic local test adapter intentionally. It
proves the scene and typed snapshot-to-command boundary but is not an alternate
offline product mode. The default product journey always uses the live server.

## Hosting

The selected public host is one **Render Starter Web Service** in Frankfurt.
The existing Node process serves both the built client and Socket.IO runtime,
keeping the current in-memory authority boundary on one persistent instance.
Render Free is limited to private previews because it may sleep and cold-start.

Render's build checkout is shallow and does not expose the Git remote. Set
`ALLOW_SHALLOW_WORK_PACKAGE_EVIDENCE=true` only on that service and use
`npm ci && npm run build`. This preserves all current-tree compliance checks;
only historical starting-commit lookup is skipped after the checker confirms
the repository is actually shallow. GitHub Actions fetches full history and
continues to enforce every historical lock pin before integration.

Do not enable horizontal scaling. WP-013 makes the monetary ledger durable and
uses a PostgreSQL advisory signer lease, but sessions, active simulations,
Loomkeeper turns, and Socket.IO delivery remain single-process. Attach a Render
PostgreSQL database before using `record-only` or chain reward modes. See
`docs/process/development_workflow.md` under **Hosting Contract** for activation,
pause, outage, and key-response requirements.

## World And Art Direction

The planned product identity is **NIMble Knots: Cotton Clash**, a playful
fantasy artillery game set in handcrafted Patchwork Realms. Its Knotkin heroes
combine cotton and crochet materials, large bead eyes, mouthless Nimiq-inspired
geometry, and distinct fantasy Callings.

See `docs/art-direction.md` for the current world, character, material, Nimiq
palette, reward-loop, provenance, and import-boundary decisions. Concept art is
documentation-only until it passes the product asset gate.

The canonical artwork reference for future Knotkin production is
`docs/images/art-direction/knotkin-class-lineup-concept.png`. Production assets
must follow its visual system but still require independent generation records,
exact-file approval, and manifest entries before runtime use.

## Competition Release

The active release target is phone-only play inside Nimiq Pay:

- virtual-landscape-by-default phone controls with a maintained portrait opt-out,
- instant practice without matchmaking or a wallet prompt,
- a deterministic single-player Daily Grand Knot Challenge,
- server-authoritative rewarded matches and replay-safe claims,
- fixed sponsor-funded NIM rewards with no player stake or betting,
- Wizard, Thief, and Warrior as the initial Calling choices,
- automated mobile-browser validation, with physical Android/iOS testing kept
  outside the autonomous development cycle.

PvP matchmaking is a post-competition feature. See
`docs/planning/implementation_plan.md` for the active execution pointer and
work-package sequence.

## Historical V9D phone acceptance record

This section preserves the retired V9D deployment record for diagnosis on its
archived branch. It is not a current deployment procedure. The standard client
uses only V10 R6 for server-backed Practice and Daily; preview query values are
local visual diagnostics and cannot select a V9 server route.

Deploy `codex/wp-015d3b-v9d-resource-utilities` with the V9D Practice profile
implementation. In Render's service environment, set:

```text
NODE_ENV=production
NIMBLE_RUNTIME_PROFILE=development-v9d-practice
REWARD_PAUSED=true
```

`NIMBLE_DEPLOYMENT` must be absent or `production` on the existing service.
Save and redeploy; use the usual build command and `npm start`. A successful
startup logs `Runtime development-v9d-practice / nimble-knots-artillery-v9 /
wp-015d3b-v9d-v1 / rewards disabled`. This profile uses real clocks and random
match seeds, creates no identity/reward/database/payout service, and leaves
saved production credentials dormant. It refuses deterministic test overrides.
It only admits Practice; reward creation and reservation metadata are rejected.

Open `/?combat-preview=v9-live` and tap Start Practice. The URL selects the V9
client, while the server profile admits its matches; the URL alone cannot enable
V9. `/?combat-preview=v9` is the older local preview. Keep the default sideways
phone layout, or use `&sideways=off` to check the normal portrait alternative.
Check compact action menus, movement/HUD feedback, Thread costs/carry-over,
utilities, an actual AI turn, pause/resume, reconnect, results and fresh retries.
Phone acceptance and balance remain owner checks.

The V10 terrain-and-starting-position candidate remains local-only at
`/?combat-preview=v10`; it does not select a server profile or promote ordinary
Practice, Daily Challenge, or rewards. `npm run assess:v10` runs its frozen
V10D matrix and the replay-distinct V10E tactical refinement across six seeds,
generated and mirrored carriers, and both opening actors. It verifies 48
openings, blocked-cover replacement, the first attack, the other actor's reply
through the resulting terrain, and exact operation/event reconstruction. The
V10E phone candidate is `/?combat-preview=v10e`; it adds protected opening
pockets and jump-only firing shelves while preserving a legal attack from
cover. The original `/?combat-preview=v10` route remains unchanged. The ignored
source-bound V10E report is retained at
`.cache/assessments/wp-015d4b-v10e-assessment.json`.

WP-015D4C/V10F adds a deterministic surface grammar behind the existing
`PackedTerrain` authority. It preserves V10/V10E behavior, emits a fixed set of
eight product-owned candidates, admits and ranks them with bounded gameplay
checks, and binds the selected recipe revision and candidate to replay-distinct
`nimble-knots-artillery-v10-r2`. Its level concepts use normalized ASCII
diagrams backed by machine-readable recipes: Twin Crests, Asymmetric Rampart,
Trench Needle and Stepping Mesa. The diagrams are generated review artifacts
rather than replay input. Recipes use 32 authoring columns that compile
deterministically to the existing 256 collision columns; the full format and
operation ranges are in the
[V10 terrain contract](docs/planning/wp-015d4a-v10-terrain-starts-contract.md#ascii-chart-and-recipe-authority).

The local-only phone route is `/?combat-preview=v10f`. An optional positive
32-bit `terrain-seed` selects a repeatable review case; absent or malformed
values use seed 1. These fixed URLs cover every family and both physical
orientations of the asymmetric family:

- `/?combat-preview=v10f&terrain-seed=1`: Asymmetric Rampart, authored orientation.
- `/?combat-preview=v10f&terrain-seed=5`: Asymmetric Rampart, reflected orientation.
- `/?combat-preview=v10f&terrain-seed=2`: Trench Needle.
- `/?combat-preview=v10f&terrain-seed=3`: Stepping Mesa.
- `/?combat-preview=v10f&terrain-seed=4`: Twin Crests.

On a phone, confirm that crests, protected pockets, firing shelves and notches
remain legible during the opening survey and normal player camera; actor cards,
the top-left Pause button and the collapsed Actions/Use controls stay readable
without covering the arena; a forward hop leaves and regains the ground; and a
normal attack leads to a bounded Loomkeeper turn. The route creates no session,
wallet, database, reward or public Practice/Daily selector.

If a Clash stops within seconds, this is not the normal 30-minute expiry.
V9 now shows **Practice interrupted** for timing or runtime safety stops. In Render's
application logs, find the matching `[v9-practice-stop]` line: `clock_debt`
means the server fell behind its fixed 30-tick timing limit; `runtime_error`
means its timer caught an unexpected exception. `expiry` also covers forced
lifecycle cleanup, so correlate an early expiry with shutdown/restart logs.
The line includes tick, turn,
phase, actor, outstanding ticks and AI batch timing, with no session tokens,
wallet data or raw exception text. A `/favicon.ico` 404 is unrelated.
The owner's deployed diagnostic confirmed `clock_debt` at tick 311 after only
12 of 30 AI planning batches; the slowest batch took 188646 microseconds. The
coordinator now charges those bounded planner computations only through their
existing 30 logical planning ticks instead of also treating their CPU duration
as missed simulation time. A genuine external scheduling delay still reaches
the unchanged 30-tick debt cutoff. Repeat phone acceptance after redeploying;
the owner confirmed on 2026-09-07 that the redeployed phone journey and AI turn
pass. V9D phone acceptance is complete. The owner separately reports a bug that
prevents player Relic selection and explicitly defers it to the tracked V9
Relic-selection fast-follow; this acceptance does not claim that bug is fixed.

For rollback, restore the previously used profile (for example
`development-v8d-practice`) and redeploy. Removing the profile or setting
`production-v7` restores normal V7 startup and normal credential validation;
keep `REWARD_PAUSED=true`. This owner Practice deployment is not joint public
Practice/reward promotion or funded activation.

## Primary ownership and test execution

The primary assistant owns implementation, coverage selection, direct review,
integration, and product corrections. One `worms_port_test_runner` may execute
the primary's selected checks and handle bounded test-infrastructure recovery;
it does not implement or independently review product changes. [AGENTS.md](AGENTS.md#primary-ownership-with-testing-delegation--effective-2026-09-10)
contains the active rule. Implementation, research, reviewer, and documentation
subagents remain disabled.

The retired WP-016 harness remains discoverable on main for CRPM research:
[retirement record and pinned recovery links](docs/process/development_workflow.md#harness-retirement-and-research-preservation),
[archived role definitions](.codex/retired-agents/), and
[original support evidence](docs/evidence/wp-016.json). These are historical
research inputs, not active instructions. Selected checks and the full daily
suite at 22:00 Europe/Berlin remain required.

## Upstream Pins

- Base: `TurtlePU/worms-ii` at `75cc89a3a20a56473f2224a7f29b390be24a49a6`
- Quarantine reference: `lorgan3/sorcerers` at
  `0f45c4920321c0a3a14de30fe5cf44131a38da89`

See `AGENTS.md`, `docs/import-boundary.md`,
`docs/asset-review-workflow.md`, `docs/process/development_workflow.md`,
`docs/planning/implementation_plan.md`, and `legal/` for the operational
rules.
