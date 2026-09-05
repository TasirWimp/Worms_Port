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

Reproduce the three static, source-only Threadball cast-stage reviews with:

```powershell
npm run asset:compose:threadball-cast
```

The command verifies the exact approved Threadball parent and writes only ignored
review material under `test-results/`. It must reproduce the frozen formation
and compact-projectile hashes; B3C.1 later admits only their byte-identical
build-copy runtime paths. It does
not invent or approve glow, loose fibers, tail, impact, animation, or gameplay
integration.

Reproduce the approved Threadball source-master review while its exact external
B3A source still exists with:

```powershell
npm run asset:normalize:threadball
```

Reproduce the approved Cloud source-master review while its exact external B3A
source still exists with:

```powershell
npm run asset:normalize:cloud
```

Reproduce the approved Terrain Top source-master review while its exact external
B3A source still exists with:

```powershell
npm run asset:normalize:terrain-top
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
integration. The separate Patch source contract is now frozen: one text-only,
no-reference Cloud request (`15035002`) precedes Terrain Top (`15035003`) and
Terrain Interior (`15035004`), each under the same pinned FLUX workflow/settings
and each requiring fresh preflight, review, and explicit continuation. FLUX can
provide textile source imagery only; a later deterministic normalizer must prove
Cloud alpha handling and terrain repeatability before any source-master approval.
The owner accepted the one Cloud request (`EA972B0B...FFE7`), and deterministic
white-matte normalization produced source master
`assets/masters/environment/patch-01/clouds/patch-01-cloud-source-master-v1.png`
(`7F327B51...4B23C`), whose sole B3C.1 build copy is
`assets/product/environment/patch-01/clouds/cloud-v1.png`. Owner-approved Terrain Top source
`BE5EB2E7...2B22` now has deterministic 256x64 master
`assets/masters/environment/patch-01/terrain/patch-01-terrain-top-source-master-v1.png`
(`41511E63...7897`), with a three-copy horizontal repeat proof whose edge
difference is zero and sole B3C.1 build copy
`assets/product/environment/patch-01/terrain/top-v1.png`. The one fresh Terrain Interior FLUX
request remains rejected as external candidate `98091C73...50F9` for visible
directional quilt seams. The project owner separately repaired the material in
the four-layer external XCF `2E94BBE4...CDBC7B`; GIMP 3.2.4's exact flattened
export `6419C1E8...CF8095` is the only permitted recovery input. Frozen
`wp-015b3c-patch-terrain-interior-manual-v1` uniformly scales it and applies
fixed 32px horizontal/vertical reciprocal edge blends, producing repeatable
256x256 source master
`assets/masters/environment/patch-01/terrain/patch-01-terrain-interior-source-master-v1.png`
(`D50C2C60...2E40E9`) twice. Its 3x3 proof has zero difference across both tile
boundaries. Its sole B3C.1 build copy is
`assets/product/environment/patch-01/terrain/interior-v1.png`; the manual-repair recovery adds no atlas, terrain
authority, animation, or gameplay integration; no new Patch inference, retry,
or post-export paint is authorized. WP-015B3B retains two rejected raw
empty-palm AutoSprite pilots as external evidence and freezes a
deterministic Wizard presentation: a permanent held Loomseed and a separate
temporary cast Threadball. B3C has deterministically composed and manifest-
approved the source-only Wizard-with-Loomseed master. B3C also approves three
source-only cast stages deterministically resampled from the exact Threadball
master: a small formation, a larger ready formation, and a compact projectile,
each centered at its local origin. They add no invented glow, loose fibers,
tail, impact, animation, runtime path, or integration. The separate source-free
effects contract now freezes a procedural halo, inward threads, short tail, and
four-loop Unraveling effect for later client presentation only. Before WP-015C,
WP-015B3C.1 added only byte-identical build-copy runtime paths for the exact
seven approved presentation/Patch masters (607,427 source bytes total), without
new pixels or scene code. On 2026-08-08, WP-015C separately admitted four
owner-supplied AutoSprite Wizard sheets—idle, walk, Loomseed spell, and
non-graphic Unraveling—as exact manifest-bound sources. The current eleven-file
runtime inventory totals 1,402,579 source bytes below the 1.5 MB ceiling; Phaser
slices the 5x5/256px grids without editing pixels and retains the static
Loomseed-Wizard as fallback. The earlier free-tier external-quarantine idle
pilot is still rejected because it rewrites the Wizard's two black bead eyes and
stitched mouth as one oversized cartoon eye; it supplies no pixels or
conditioning to the admitted exports. WP-015C completed with the one approved
Wizard presentation shared by the player and AI Loomkeeper. A distinct
Loomkeeper asset belongs to the post-release WP-017A character roster.
`WP-015C_Animation` is a separately documented FLUX.2 one-key-pose research
gate, not an AutoSprite retry. It replaces video-as-sprite-production with one
external-only `flux-2-max` cast-preparation still, using the combined Wizard as
an identity reference and an original local pose guide as structure reference.
The owner accepted BFL's input/output-use treatment for this one external pilot;
the remaining source/guide/prompt freeze still precedes upload. No generated
sheet, normalization, or runtime path is part of this gate.
WP-015C and WP-015D1 are complete. The simplified vertical-slice inventory is
manifest-approved; WP-015D0 froze the V4 arena/camera contract, and D1
delivered the accepted wider arena, pan camera, and horizontal-only opening
survey. WP-015D2A is active: it documents and tests the tactical decision model
with a deterministic Python analysis harness while keeping TypeScript
authoritative. Its evidence will determine whether the subsequent V5 Relic
slice can remain values-only or needs a separately versioned tactical-core
package. The contract is
`docs/planning/wp-015d2a-tactical-game-model-contract.md`.
The Celestial Spinning Mill, Worldweave,
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
npm run test:browser:focused
npm run test:browser:performance
npm run test:browser:matrix
npm run check:bundle-budget
npm run check:identity-bundles
npm run check:reward-security
npm run verify:feature
npm run verify:quality
npm run verify:postgres
npm run verify:full
npm run verify:daily
npm start
```

The browser client builds with Vite into `client/build/`. The Node server builds
with esbuild into `server/build/server.js`. The smoke command performs a fresh
build, starts that server on an available local port, and verifies the game
page, built overlays, approved-asset plumbing, and room join-ID API.
Every normal browser command accepts only a deterministic build proof whose
declared source/lock inputs and exact client/server outputs still match. A
missing or stale proof triggers a full production rebuild automatically;
unchanged repeated runs reuse the verified output. `npm run
test:browser:focused` is the gameplay edit-loop gate: it runs smoke, combat,
and Practice on canonical Chromium 390x844 without replacing final matrix
coverage. `npm run test:browser:smoke` runs the phone-sized Chromium and WebKit
touch journey. `npm run test:browser:matrix` is the
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

The performance project disables Playwright trace, screenshot, and video
capture so Ubuntu software-rendering overhead is not charged to the timing
budgets. It retains the sanitized timing JSON on both success and failure. Its
test-only recorder timestamps the existing actionable, legal-input, cast,
visible-projectile, and complete-response DOM boundaries at mutation delivery;
it adds no product instrumentation or telemetry and avoids charging a
software-rendered animation-frame sampling interval to those events. Its
180-second outer collection allowance by itself changes no timing ceiling, sample count,
retry rule, or full-motion behavior; it only lets a slow runner return the exact
budget violations instead of an opaque suite timeout.

The post-Fire full-motion ceilings include the retained Ubuntu 24.04 spread
after the required two-second cast order: visible projectile must remain no
earlier than 1.8 seconds and at or below a 3.2-second median / 3.5-second
maximum; complete response must remain at or below 12 seconds. Instant Fire
feedback remains independently capped at a 350ms median / 500ms maximum. These
are test budgets only and do not change presentation durations or gameplay.

Use `npm run verify:feature` for every shipped feature. It runs the fast
deterministic suites, creates current production outputs without repeating the
already-passed compliance/type checks, smokes the built server, and runs the
five-case canonical browser gate. Use `npm run verify:daily` once at the
end-of-day checkpoint; it is an alias for the unchanged complete `verify:full`
gate. Run the full gate earlier only for a release boundary or when focused
diagnosis requires it. The release gate remains one worker per existing CI
project shard; a quality/performance worker override above one fails before
browser startup rather than risking resource exhaustion or weakening
reproducibility.

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

New Practice challenges use the product-owned
`nimble-knots-artillery-v7` ruleset. The authoritative model is independent of
Phaser and uses integer fixed ticks, an explicit uint32 seed, a packed collision
mask, bounded Relic physics, canonical SHA-256 state hashes, and replay records.
Client commands include both their transport sequence and expected simulation
turn; delayed, duplicated, conflicting, or wrong-turn commands cannot silently
apply to a later state. V1 through V6 replay hashes and reconstruction remain
supported under their explicit identities.

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

V4 preserves v3's historical placeholder Relic tuning and fixed
direct-projectile Wizard body profile, so the visible torso, head, hat, and
feet can register a hit while the extended palm/Loomseed remains outside the
target. It doubles only the authoritative arena width to 2048 world units;
the mobile client still presents a 1024-by-576 camera window that can pan
horizontally. V1/v2/v3 replay behavior is unchanged. WP-015D2X has now added
V5 without mutating V4: Threadball uses medium range and 45 maximum direct
damage, Needlepoint uses the highest range and 30 damage, and Spoolburst uses
the lowest range and 80 damage. Their calibrated ideal maximum-range targets
are 576, 640, and 512 world units respectively. These are a bounded automated
playability candidate, not a claim of final or human-validated balance. Other
weapon dimensions and fine tuning are deferred. Their planned visual grammar is
Worldweave for Threadball, Air/Draft for Needlepoint, and Fire/Loomspark for
Spoolburst. Cloudwater establishes water in the world but adds no release Relic
or mechanic. No production Relic art is shipped yet.

WP-015D2Y adds V6 without retuning that V5 balance profile. An opposite
movement gesture first turns the Knotkin 180 degrees in place for no movement
cost, then attempts the requested movement. The movement pad shows the
authoritative whole-step budget remaining in the turn (`8/8` down to `0/8`).
Once a movement drag owns the pointer and leaves its dead zone, releasing beyond
the visible ring still commits the direction and clamped one-to-four-step
intent. Pointer cancellation, interruption, and release outside the aim pad
remain inert.

WP-015D2Z adds separately versioned V7 terrain and opening placement without
retuning V5 Relics or changing V6 turn and movement semantics. A bounded family
of seed-selected integer surface profiles fills every terrain column from one
upper surface downward. V7 derives both starts from that generated surface,
then selects an exact 640-unit pair with body-clear support, safe margins,
left/right opening movement, a continuous V6-climb-valid route, and at most 24
units of height difference. The deterministic score minimizes height bias,
maximizes combined local mobility, prefers the arena centre, and uses a
seed-derived stable tie break. Generation fails closed when no valid pair
exists; it never retries with time, falls back to historical fixed spawns, or
adds caves, islands, ladders, water, or obstacle entities. This is an automated
tactical-arena candidate, not final balance or player-validation evidence.

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

Touch movement converts drag strength into one to four authoritative movement
quanta. V6 may prefix one free turn-in-place transition when the gesture points
opposite the authoritative facing. Each accepted displacement is visibly
animated, the movement budget is disclosed on the pad, and movement clears the
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
`npm ci --include=dev && npm run build` so build tools remain installed with
`NODE_ENV=production`. This preserves all current-tree compliance checks;
only historical starting-commit lookup is skipped after the checker confirms
the repository is actually shallow. GitHub Actions fetches full history and
continues to enforce every historical lock pin before integration.

Do not enable horizontal scaling. WP-013 makes the monetary ledger durable and
uses a PostgreSQL advisory signer lease, but sessions, active simulations,
Loomkeeper turns, and Socket.IO delivery remain single-process. Attach a Render
PostgreSQL database before using `record-only` or chain reward modes. See
`docs/process/development_workflow.md` under **Hosting Contract** for activation,
pause, outage, and key-response requirements.

### V8D development on the existing service (current owner workflow)

The owner has chosen to use the currently unused production service for
development. **No second Render service, new URL, database setup or secret
re-entry is required.** This new profile replaces gameplay on the existing URL
with full V8D Practice and disables wallet/reward services entirely. It does not
promote V8D as a funded or marketing-ready release. See
[V8 contract D.2](docs/planning/wp-015d3a-v8-action-turns-contract.md#d2--owner-authorized-single-service-development-profile)
for the source-bound implementation/review.

After pushing the reviewed `codex/wp-015d3a-v8d-presentation-v0` follow-up, use that branch on the
**existing** service and set:

```text
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
```

Add this one environment variable:

```dotenv
NIMBLE_RUNTIME_PROFILE=development-v8d-practice
```

Keep `NODE_ENV=production` and `REWARD_PAUSED=true`. Leave saved production
settings such as `REWARD_MODE=mainnet`, `REWARD_NETWORK=main-albatross`, identity,
database, signer path and RPC values in place. **Do not change REWARD_MODE to
disabled for this profile.** Remove any leftover `NIMBLE_DEPLOYMENT=staging`;
the new profile needs no `NIMBLE_DEPLOYMENT` (explicit `production` is also
accepted). Keep the existing URL/origin, Node version, shallow-checkout flag
and one-instance hosting setup. Test-only overrides are still refused.

Save and deploy the reviewed commit. The startup marker must name
`development-v8d-practice`, `nimble-knots-artillery-v8-r1`,
`wp-015d3a-v8d-r1-v1` and `rewards disabled`.
Open the **same game URL without `combat-preview`** on the phone, reload, choose
a Calling and tap **Start Practice**. Verify the action countdown, combined
move/jump pad, real Loomkeeper turn, retreat, pause/resume, retry and match result.
The normal sideways display policy remains unchanged. Daily/wallet/rewards are
unavailable while development mode is active.

The owner-requested [D.3 presentation follow-up](docs/planning/wp-015d3a-v8-action-turns-contract.md#d3--owner-requested-presentation-corrections-2026-09-04)
uses the same service and environment settings. After deploying its reviewed
commit, check on the phone:

1. Hit either actor: damage and remaining Stitching stay readable for about
   2.5 seconds, including off-screen hits. The turn clock and legal controls
   continue normally; there is no gameplay freeze.
2. Win and lose a match: the defeated actor finishes the existing Unraveling
   (normally two seconds), then holds for one second before the result screen.
   Slow rendering must not cut playback short. Expiry,
   leaving, unavailable matches and reconnecting after a finished match do not
   replay a death that was never observed in the current scene.
3. Jump vertically and diagonally: use idle in the air and walk only when
   grounded and moving. No new jump animation is introduced.
4. Let the Loomkeeper turn and walk: ordinary framing stays with the player;
   projectile tracking and manual panning remain available. Actor sprites still
   face their own movement/aim direction.

These are owner acceptance checks, not completed automated or real-device
results. The source-bound implementation/review status lives in D.3.

V8E adds reversible opponent focus to the same development profile. When the
Loomkeeper is outside the battlefield window, a side-correct button shows its
current Stitching; tap it to focus the opponent, then use **Back to You** to
return. The buttons do not issue combat commands, and ordinary Loomkeeper turns
do not pull the camera away from the player's chosen view. Manual battlefield
panning remains available, while projectile and D.3 terminal presentation keep
their existing priority. On the phone, verify:

1. The off-screen button names the Loomkeeper, shows current Stitching, points
   toward the correct side and remains comfortable to tap.
2. Tap **Loomkeeper**, then **Back to You**. Each view change should feel short
   and predictable; devices configured for reduced motion switch immediately.
3. Begin a battlefield swipe during a view change, then pan freely. The swipe
   must take over without moving, aiming or firing; either edge button must
   recover an actor view.
4. Fire and observe both actors' projectiles. Tracking may temporarily own the
   camera, then it restores the selected actor or exact free view. A new player
   action recentres the player.
5. Repeat in the normal sideways phone layout and after rotating. Win/loss still
   uses the complete D.3 Unraveling and aftermath before the result screen.

These checks are ordinary owner acceptance, not Lane G player observation.
The source-bound implementation/review return is in
[V8 contract E](docs/planning/wp-015d3a-v8-action-turns-contract.md#e--reversible-opponent-focus-v8e-2026-09-04).

This mode branches before all saved reward/identity configuration is parsed:
no database connection, migration, key-file read, RPC, payout worker or pending
transaction reconciliation runs. No saved setting is modified. Requiring
`REWARD_PAUSED=true` helps keep rollback paused; pause itself is **not** the
isolation mechanism. Saved secrets remain attached to the same hosting service,
so this is an application-mode boundary, not a separate security environment.
The URL remains publicly reachable; use it only for bounded development.

To return to normal V7, remove `NIMBLE_RUNTIME_PROFILE` and redeploy, keeping
`REWARD_PAUSED=true`. Normal startup will again use saved production configuration
and may run migrations and transaction reconciliation even while paused. Review
pending reward records before resuming normal service; **do not unpause payouts
as part of rollback**. Existing in-memory Practice matches may end on redeploy.
No existing ledger data is changed by development mode itself. Full daily/release,
human similarity, device/capacity and inherited audit gates remain outstanding.

### V8D owner-test staging (optional separate-service alternative)

This is the earlier D.1 workflow. For the owner's current single-service setup,
use the development profile above instead; these stricter settings are not
interchangeable.

V8D.1 provides full automated V8D Practice through the ordinary start screen.
It is not production promotion. Keep the existing production service and its
environment unchanged; without the explicit staging opt-in, gameplay stays V7.
The source-bound scope and review live in
[V8 contract section D.1](docs/planning/wp-015d3a-v8-action-turns-contract.md#d1--separate-no-payout-staging-preparation-2026-09-04).

After pushing the reviewed staging branch, create a **separate** Render Web
Service from `TasirWimp/Worms_Port` (do not change the production service's
branch). Use these settings:

| Setting | Value |
| --- | --- |
| Branch | `codex/wp-015d3a-v8d-staging-v0` |
| Runtime / root directory | Node / repository root (leave Root Directory empty) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Region / instances | Frankfurt / one, no horizontal autoscaling |
| Health-check path | `/` (HTTP readiness only, not gameplay acceptance) |
| Auto-deploy | Off during acceptance; manually deploy the reviewed commit |

Set service-specific environment variables:

```dotenv
NODE_ENV=production
NIMBLE_RUNTIME_PROFILE=staging-v8d-practice
NIMBLE_DEPLOYMENT=staging
REWARD_MODE=disabled
ALLOW_SHALLOW_WORK_PACKAGE_EVIDENCE=true
ALLOWED_ORIGINS=https://YOUR-STAGING-SERVICE.onrender.com
```

Replace the origin with this service's exact HTTPS origin (no path/query).
Render supplies `PORT` and `RENDER_EXTERNAL_URL`; do not use a URL query as an
environment-variable value. Explicit `--include=dev` keeps the TypeScript/Vite
build tools installed when `NODE_ENV=production` is configured at build time.
Render's [Web Service setup](https://render.com/docs/web-services) and
[environment settings](https://render.com/docs/configure-environment-variables)
describe service creation and saving/redeploying configuration.
Confirm the deployed commit and this startup message in its Render logs:

```text
Runtime staging-v8d-practice / nimble-knots-artillery-v8-r1 / wp-015d3a-v8d-r1-v1 / rewards disabled
```

Do not attach a production environment group, database, signer secret file,
wallet configuration or other reward settings. Staging rejects conflicting
identity/Nimiq/database/reward/test settings before it listens; it constructs
no identity service, reward store or payout worker. Rewards/Daily are unavailable,
not simulated payouts. The ordinary real clock, seeds, limits and standard V8D
AI run unchanged; no test-only clocks or deterministic seed override is enabled.
The URL is public unless separately access-controlled: not sharing it is not
authentication. Keep it for bounded owner acceptance and suspend it afterward.
Free hosting may cold-start; do not interpret that as gameplay or production
capacity evidence. Inherited qs audit findings and all public-release gates
recorded in the V8 contract remain open.

On the phone:

1. Open the new staging URL **without `combat-preview`** and reload after deploy.
2. Choose a Calling and tap **Start Practice**. You should get the V8 action
   countdown and combined move/jump pad, followed by real Loomkeeper turns.
3. Check moving, tap-to-face, diagonal jumping, aiming/firing, the short retreat,
   opponent response, and return to your next turn. Also check pause/resume,
   reload while paused, retry, and a full win/loss result with another match.
4. Repeat with the other Callings. There must be no wallet/payout requirement.

Keep the display workaround described at the top of this README: with portrait
auto-rotation locked, hold the phone's top on the left. `?sideways=off` remains
the normal-layout opt-out. The old `?combat-preview=v8-r1` is still only the
movement fixture, **not** this live staging match.

Rollback: suspend this separate staging service. To return its code/config to
normal V7, remove both `NIMBLE_RUNTIME_PROFILE` and `NIMBLE_DEPLOYMENT` and use
the normal hosting/identity configuration; merely removing one staging setting
intentionally fails startup. Never change production as part of this rollback.
Server restarts can end in-memory Practice matches. Phone feedback is ordinary
product acceptance, not Lane G observation or proof of balance.

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

The project default is GPT-6 Astra (`gpt-6-astra`) with `high` reasoning,
configured in [`.codex/config.toml`](.codex/config.toml). This preserves the
existing reasoning effort. Role agents have no model overrides and inherit
the parent task's model settings. Explicit task or invocation overrides can
select another model; the project config does not change a running task.
Codex must trust the project to load its local configuration. See the
[official configuration guide](https://learn.chatgpt.com/docs/config-file/config-basic)
and [Astra migration guidance](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-update-api-and-model-parameters).

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
