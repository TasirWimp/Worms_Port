# NIMble Knots: Cotton Clash

NIMble Knots is an MIT-licensed, mobile-first fantasy artillery game built with
Phaser for the Nimiq Pay Mini Apps environment. The competition release focuses
on an immediately available single-player challenge against a deterministic AI
opponent, with an optional fixed sponsor-funded NIM reward for eligible wins.
The `Worms_Port` repository was bootstrapped from the MIT
`TurtlePU/worms-ii` code base and retains that provenance.

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
npm run test:browser:smoke
npm run test:browser:combat
npm run test:browser:practice
npm start
```

The browser client builds with Vite into `client/build/`. The Node server builds
with esbuild into `server/build/server.js`. The smoke command performs a fresh
build, starts that server on an available local port, and verifies the game
page, built overlays, approved-asset plumbing, and room join-ID API.
`npm run test:browser:smoke` performs a fresh build and runs the phone-sized
Chromium and WebKit touch journey. Run `npm run verify:full` for the complete
autonomous foundation funnel.

Playwright reports, traces, screenshots, and videos are generated outside
`assets/` and are ignored locally. CI retains them only when verification
fails.

## Session And Protocol Foundation

The active Socket.IO transport uses strict v1 request/acknowledgement schemas
and server-issued 256-bit opaque session tokens. Socket.IO IDs are transport
details and are never accepted from callers as player identity. Practice
sessions work without a wallet. The default client creates live v2 Practice
Clashes, submits ordered commands, consumes authoritative snapshots and
results, and reconnects with the rotated session token. Signed sessions and
rewarded challenges have validated placeholder contracts but remain
unavailable until their dedicated work packages.

Production deployments should set `ALLOWED_ORIGINS` to a comma-separated list
of additional trusted origins when same-origin access is insufficient. Missing
Socket.IO Origin headers are rejected by default and may be enabled only for a
controlled non-browser environment with `ALLOW_MISSING_ORIGIN=true`.
`SESSION_OPEN_RATE_CAPACITY` may raise the per-IP session-open burst only in a
controlled deployment or test environment; production defaults to thirty to
accommodate mobile carrier/NAT address sharing.

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

## Phone Combat Fixture

WP-010 provides a portrait-first Phaser battlefield and touch-control surface
at `/?combat-preview=1`. It renders the v2 1024x576 logical Patch, packed
terrain, code-drawn Knotkin and Relics, Stitching, turn time, projectile traces,
and an advisory trajectory calculated against a detached simulation clone.
Movement and aim pads have single-pointer ownership; aim release locks without
firing, while Fire is a separate minimum-size action. Cancellation, release
outside, blur, backgrounding, resize, and orientation changes fail safe.

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

Do not enable horizontal scaling until sessions, simulations, Loomkeeper turns,
replays, and reward state use shared durable storage with exactly-once leases
and cross-instance event delivery. Sponsor-funded rewards additionally require
durable reservations, claims, payout idempotency, and completed-match evidence
before activation. See `docs/process/development_workflow.md` under **Hosting
Contract** for the operational requirements.

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

- portrait-first and landscape-capable touch controls,
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
