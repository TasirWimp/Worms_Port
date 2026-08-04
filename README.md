# NIMble Knots: Cotton Clash

NIMble Knots is an MIT-licensed, mobile-first fantasy artillery game built with
Phaser for the Nimiq Pay Mini Apps environment. The competition release focuses
on an immediately available single-player challenge against a deterministic AI
opponent, with an optional fixed sponsor-funded NIM reward for eligible wins.
The `Worms_Port` repository was bootstrapped from the MIT
`TurtlePU/worms-ii` code base and retains that provenance.

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

## Local ComfyUI Asset Pipeline

WP-015A reconstructs the tested Windows ComfyUI/MCP refinement stack as a
fail-closed local tool. The one entry point checks the exact external Git
revisions, Python environment, model name and size, and—when requested—the
2.13 GB checkpoint hash before it starts anything:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Prepare
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Status -VerifyHashes
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Start
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Smoke
```

`Start` binds ComfyUI to `127.0.0.1:8188` and the MCP bridge to
`127.0.0.1:9000/mcp`. Workflow-specific tools are registered when the bridge
starts and imported when the Codex task starts. After adding or changing a
reviewed workflow, restart the MCP server first and then restart Codex. Stop the
verified local processes with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Stop
```

The default machine paths and complete reinstall/re-entry procedure are in
`docs/process/development_workflow.md` under **WP-015A Local ComfyUI Re-entry**.
Override a moved install with `WORMS_COMFY_ROOT`, `WORMS_COMFY_MCP_ROOT`,
`WORMS_COMFY_SHARED_ROOT`, or `WORMS_COMFY_MCP_CONFIG`. Smoke and candidate
output remains under ComfyUI's external shared output directory. It is not an
approved asset, and the bridge's generic publish tools must never write to
`assets/` or `legal/asset-manifest.json`.

WP-015B0 approves the exact archived checkpoint, the pinned text-only
`workflows/generate_image.json`, and the project-owned
`generate_image_conditioned` img2img graph for quarantined production
candidates. Prepare and exact-hash the conditioned graph in the external MCP
checkout with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action Prepare
```

Stage only an explicitly reviewed documentation image, ignored quarantined
master, or prior external ComfyUI output:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comfy-asset-pipeline.ps1 -Action StageInput -InputImage <path> -StagedName wizard-master-v1.png
```

The command returns the constrained `reference_image` value for the dedicated
MCP tool:

```text
tool: generate_image_conditioned
parameters: reference_image, prompt, negative_prompt, seed, steps, cfg,
            sampler_name, scheduler, denoise, model
```

The generic `run_workflow` endpoint remains a fallback if workflow-specific
tool registration is unavailable; normal use should prefer the dedicated tool.

Use lower denoise to preserve more of the staged image and higher denoise to
permit a larger prompt-driven change; always record the value. The canonical
knitting-inspired baseline remains outside the product asset tree at
`docs/images/art-direction/knotkin-class-lineup-concept.png`: use it for briefs
and visual comparison, but never crop, trace, or ship it as a runtime sprite.
Every generated output still requires separate exact-file and IP review.

The frozen WP-015B1 generation contract is
`docs/asset-briefs/wp-015b1-vertical-slice.md`. It contains the exact Wizard,
Loomkeeper, Threadball, and Patch 01 prompts, primary seeds, workflow settings,
socket/origin geometry, animation triggers, and acceptance gates. B1 itself
generates no media; after its commit is on origin, WP-015B2 may create only the
listed candidates in external quarantine.

WP-015B2B tested a narrower FLUX Wizard recovery after the rounded text and edit
outputs failed. Its project-owned control image is
`docs/images/art-direction/knotkin-wizard-structure-guide.png`, reproduced by
`node scripts/generate-wizard-structure-guide.js` and exact-bound in
`legal/generation-component-manifest.json`. The one authorized fixed-seed,
positive-only diagnostic completed on 2026-08-03 through the unchanged
`generate_flux2_klein_reference_edit` graph. FLUX preserved the Wizard material,
eyes, feet, and hand but replaced the guide's angular continuous body with a
round head over an oval torso, so the route failed its frozen structure gate.
Re-entry starts from the recorded result and decision rule in
`docs/asset-briefs/wp-015b2-generation-review.md`; do not rerun it or reuse any
rejected Wizard as a reference. A two-reference structure/style graph or a
deterministic character-master route requires a separate reviewed plan.

WP-015B2C tests a narrower robot-scaffold hypothesis through the same exact
FLUX reference workflow. Gate 1 rendered the deterministic guide once as a
faceted mechanical scaffold with seed `15026002` and passed the angular
structure gate. The exact robot remains temporary external control evidence,
never Knotkin lore or product art. Gate 2 then converted those exact bytes once
with seed `15026003` into a closely fitted knitted shell and passed visual plus
numeric silhouette preservation. Both outputs remain external quarantine and
the route is not yet an approved Wizard master. The future face contract keeps
exactly two bead eyes plus one small neutral expression-ready mouth. See
`docs/asset-briefs/wp-015b2-generation-review.md`; no further generation is
implied by B2C itself.

WP-015B2D adopts that demonstrated route for one narrowly scoped Wizard styling
test. It exact-stages only the B2C knit proof and runs one fixed-seed reference
edit that must preserve the angular silhouette while replacing the remaining
robot construction with continuous chenille, a close-fitting folded Wizard
cowl, two slightly larger close-set bead eyes, and one tiny curved stitched
smile. The prompt uses those concrete appeal cues instead of generic plush,
doll, puffy, or rounded-body language. The output remains external quarantine;
alpha extraction, animation, exact socket normalization, other characters, and
product promotion are separate later decisions.

The one B2D request completed and visibly improved friendly appeal. The project
owner accepts its paired eyebrows and moderate body narrowing as useful FLUX
creativity; normalized silhouette IoU `0.880098` is drift telemetry, not an
automatic rejection. The remaining protected Calling issue is that its dark
cowl reads mainly as a neck wrap instead of a Wizard cowl/hat resting on the
head. The image remains external because alpha, socket, crop/pivot/baseline,
animation, and exact-file product approval are unfinished. WP-015B2E has now
constructed and pinned a 23-node masked-edit workflow plus a
deterministic cowl-region mask. It uses B2D as the sole reference/base latent,
limits sampling with a core noise mask, and restores pixels outside the same
mask. After project-owner approval, the one external quarantined request ran
with seed `15026005` and produced exact output
`1275B2BD8021EAA5C51AA0606A6CC20BA21B15ED6CEBC4A7C1FC76308BA9D2E0`.
All `907427` zero-mask pixels match B2D exactly, but project-owner review
rejects the result as the next Wizard master: the compact covering no longer
reads clearly as a Wizard hat and its horizontal neck wrap reads thief-like.
No retry ran.

WP-015B2F is therefore a source-review gate, not another generation attempt.
`scripts/generate-wizard-hood-structure-controls.js` deterministically creates
the tracked tall pointed-hood guide and a more generous protected-edit mask,
then can build one external review scaffold only from exact B2D bytes. The
scaffold keeps the accepted face/mouth and lower anatomy while showing an open
neck and two short separated mantle flaps instead of a scarf. The project owner
approved the exact guide, mask, scaffold, 48px read, and frozen hood-only prompt
for exactly one protected edit with seed `15026006`. That
request produced a clearly Wizard-like knitted hood, but full-size review
rejects the output because the hard-restored face and mouth islands leave
visible polygonal/rectangular composite seams. No retry or changed input ran.
A full Wizard robe/tunic remains deferred to a later separate pass. Re-entry,
exact output evidence, and the mask-coupling lesson are in
`docs/asset-briefs/wp-015b2-generation-review.md`.

WP-015B2G records the project-owner decision to stop treating FLUX's rounded
crochet-doll prior as a defect. The full B2A-B2F cycle proved that increasingly
strict hexagonal guides, a robot scaffold, knit conversion, and protected
garment edits could enforce pieces of the old anatomy, but each added visual
cost: lost cuteness, wrong Calling reads, construction residue, or hard mask
seams. The route therefore returns to the first successful FLUX Wizard text
composition and applies the useful lessons from that cycle without preserving
the rejected hexagonal constraint. Exactly two follow-up text candidates ran.
Seed `15027001` produced a strong Wizard with a closed thumbs-up mitten; seed
`15027002` replaced the abstract grip language with an upward-facing shallow-
bowl palm and is the owner-selected direction. The exact prompt, full external
path, hashes, decision trail, and remaining product gates are recorded in
`docs/asset-briefs/wp-015b2-generation-review.md`.

WP-015B2H completed the deterministic, non-generative normalization gate for
that exact source. The approved 512x512 RGBA source master is
`assets/masters/characters/knotkin/wizard/knotkin-wizard-source-master-v1.png`,
SHA-256 `7AF4864E...18A9`. The versioned normalizer removes the plain background
and contact shadow, decontaminates the white edge matte, keeps one connected
subject, and uses uniform scale/translation only. It preserves ground pivot
`(256,451)` and amends the superseded angular-body socket to the visible rounded-
doll palm at `(407,228)`; forcing the old `(341,293)` socket would have made the
character implausibly small. Full-size, 192px, 48px, navy-background, and warm-
light review passed, and two runs reproduced every PNG hash byte-for-byte. The
master is manifest-approved but deliberately has no `runtime_path`, animation,
atlas, or gameplay integration.

Reproduce the reviewed local outputs while the exact external B2G source still
exists with:

```powershell
npm run asset:normalize:wizard
```

Reproduce the approved Threadball source-master review while its exact external
B3A source still exists with:

```powershell
npm run asset:normalize:threadball
```

The next slice is WP-015B3A. Existing Threadball candidate
`2BAE664F...F4089EB` is paused as historical structure evidence because it reads
as ordinary yarn rather than the newly defined compressed Worldweave spell. Do
not normalize, promote, delete, or condition on it. The replacement gate is now
frozen for exactly one unconditioned FLUX text request: its exact 77-word prompt,
seed `15035001`, workflow/settings, output prefix, and stop rule are recorded in
the B1 brief. The supplied Gemini artwork `BD87405A...DA6699` is external
comparison-only evidence and supplies no product pixels or conditioning. Run
the fail-closed preflight and exact request are complete. The request is now
consumed: external output `1F41AF26...F56EC` now has deterministic source master
`assets/masters/relics/threadball/relic-threadball-source-master-v1.png`
(`608F490C...D9B6F`). It has no runtime path, atlas, animation, or gameplay
integration. The next B3A action is separate Patch-contract refinement. WP-015B3B
separately admits a Wizard-first animation route, and B3C produces one Wizard
inventory that WP-015C reuses for both the player and the AI Loomkeeper. A
distinct Loomkeeper asset belongs to the wider character roster in WP-015D.
WP-015C remains integration-only and begins only when the simplified vertical-
slice inventory is manifest-approved. The Celestial Spinning Mill, Worldweave,
Air/Draft, Fire/Loomspark, and Water/Cloudwater story is recorded in
`docs/art-direction.md`; exact gates and re-entry order are in the Execution
Pointer and `docs/process/development_workflow.md`.

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
npm run check:bundle-budget
npm run check:identity-bundles
npm run check:reward-security
npm run verify:quality
npm run verify:postgres
npm run verify:full
npm start
```

The browser client builds with Vite into `client/build/`. The Node server builds
with esbuild into `server/build/server.js`. The smoke command performs a fresh
build, starts that server on an available local port, and verifies the game
page, built overlays, approved-asset plumbing, and room join-ID API.
`npm run test:browser:smoke` performs a fresh build and runs the phone-sized
Chromium and WebKit touch journey. `npm run test:browser:matrix` is the
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

`npm run verify:quality` performs a fresh build followed by the bundle,
identity/reward-security, complete browser matrix, and performance gates.
`npm run verify:full` adds the fast funnel, built runtime smoke, and audit. It
prints explicitly when local PostgreSQL authority is unavailable; that message
is not PostgreSQL evidence. `npm run verify:postgres` remains the separate
mandatory real-database gate and requires `WP014_TEST_DATABASE_URL`. GitHub
Actions runs the complete browser matrix in reviewed project shards and runs
PostgreSQL/reward-security plus performance/bundle as separate required jobs.
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

The active Socket.IO transport uses strict v1 request/acknowledgement schemas
and server-issued 256-bit opaque session tokens. Socket.IO IDs are transport
details and are never accepted from callers as player identity. Practice
sessions work without a wallet. The default client creates live v2 Practice
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
the player chooses that path. `/?identity-preview=1` remains the isolated
identity diagnostics surface.

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

For a controlled repeat-attempt payout canary, an operator may temporarily set
`REWARD_TEST_WALLET_ADDRESS` to one compact or spaced test-wallet address and
`REWARD_TEST_DAILY_ATTEMPT_LIMIT` to an integer from `2` through `5`. Mainnet
also requires the separate exact acknowledgement
`REWARD_TEST_REPEAT_ACKNOWLEDGEMENT=I_UNDERSTAND_REPEAT_MAINNET_REWARDS`.
The override creates distinct durable attempt slots only for that address; it
does not bypass the daily Luna budget, one-active-match rule, replay-verified
win, single-use claim, payout idempotency, signer checks, or finality. Remove
all three test settings immediately after the canary to restore the default
one-started-attempt rule. Never target an uninvolved production player or add a
broad/global bypass.
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

The current `nimble-knots-artillery-v2` runtime preserves its historical
placeholder tuning: all three Relics share launch-speed bounds while crater,
damage-radius, and maximum-damage constants differ. WP-015 does not rewrite
that replay history. It prepares a new versioned basic ruleset in which
Threadball has medium range and damage, Needlepoint has the highest range and
lowest damage, and Spoolburst has the lowest range and highest damage. Other
weapon dimensions and fine tuning are deferred. Their planned visual grammar is
Worldweave for Threadball, Air/Draft for Needlepoint, and Fire/Loomspark for
Spoolburst. Cloudwater establishes water in the world but adds no release Relic
or mechanic. No production Relic art is shipped yet.

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
combine cotton and crochet materials, large bead eyes, small expressive mouths,
Nimiq blue/gold textile language, and distinct fantasy Callings.

See `docs/art-direction.md` for the current world, character, material, Nimiq
palette, reward-loop, provenance, and import-boundary decisions. Concept art is
documentation-only until it passes the product asset gate.

The canonical Calling, palette, material, and world-language reference is
`docs/images/art-direction/knotkin-class-lineup-concept.png`; WP-015B2G
supersedes its angular anatomy with the selected rounded crochet-doll direction.
Production assets still require independent generation records, exact-file
approval, and manifest entries before runtime use.

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

## Codex Subagents

Role-specific Codex agents live in `.codex/agents/`:

- `worms_port_planner`
- `worms_port_test_worker`
- `worms_port_base_game_worker`
- `worms_port_network_worker`
- `worms_port_asset_curator`
- `worms_port_compliance_keeper`
- `worms_port_docs_keeper`
- `worms_port_reviewer`

See `AGENTS.md` and `docs/planning/implementation_plan.md` for role routing.

## Upstream Pins

- Base: `TurtlePU/worms-ii` at `75cc89a3a20a56473f2224a7f29b390be24a49a6`
- Quarantine reference: `lorgan3/sorcerers` at
  `0f45c4920321c0a3a14de30fe5cf44131a38da89`

See `AGENTS.md`, `docs/import-boundary.md`,
`docs/asset-review-workflow.md`, `docs/process/development_workflow.md`,
`docs/planning/implementation_plan.md`, and `legal/` for the operational
rules.
