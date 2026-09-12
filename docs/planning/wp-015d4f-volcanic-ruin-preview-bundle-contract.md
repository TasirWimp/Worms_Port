# WP-015D4F Volcanic-Ruin Preview Bundle Contract

Status: bundle admission complete at `45e3e3f`; composition successor WP-015D4G
was phone-accepted by the owner on 2026-09-11, including the restart correction at `d2e426d`. This package follows the source-only WP-015D4E
admission and does not revise or replace its evidence.

## Scope

Admit five already-approved volcanic-ruin source masters as exact, lazy
engineering-preview build copies. The preview is available only at
`/?combat-preview=v10g&background-preview=volcanic-ruin`; it is not selected by
Practice, Daily, a replay, match authority, or a public feature flag.

The existing WP-015C initial-media inventory remains exactly 11 files and
1,402,579 bytes under its 1,500,000-byte ceiling. `check:b3c-runtime-inventory`
continues to reject every added runtime path. This package adds a separate
five-file preview bundle of 1,835,347 bytes under a deliberately distinct
1,900,000-byte ceiling. The maximum served copies when the preview is requested
is therefore 3,237,926 bytes; no initial-media budget claim is widened.

## Exact-copy admission

Only these byte-identical source-master copies are admitted below
`assets/product/environment/backgrounds/volcanic-ruin/`:

| Source master | Runtime copy |
| --- | --- |
| `volcanic-cone-source-master-v1.png` | `volcanic-cone-v1.png` |
| `stone-tower-source-master-v1.png` | `stone-tower-v1.png` |
| `distant-jungle-source-master-v1.png` | `distant-jungle-v1.png` |
| `palm-cluster-source-master-v1.png` | `palm-cluster-v1.png` |
| `bush-cluster-source-master-v1.png` | `bush-cluster-v1.png` |

`scripts/copy-approved-assets.js` remains the sole copy path, checks the
manifest hash before and after copying, and permits no atlas or transformed
derivative. `check:wp015d4f-background-bundle` freezes the source hashes,
paths, byte total, preview-only admission text, and continued WP-015C guard.

## Scene and authority boundary

`BackgroundScene` owns fixed normalized anchors, a scene-owned fixed seed, and
camera parallax only. L0 is the code-owned sky and current cloud family; L1
volcano/jungle uses 0.08/0.10 parallax; L2 tower uses 0.18; L3 seeded palms and
bushes use 0.32. Landmark scale derives only from viewport height divided by
world height. A fixed LCG generates vegetation, never `Math.random`.

The background renderer creates only masked Phaser images. It consumes no
terrain pixels, `PackedTerrain` geometry, simulation state, AI, replay bytes,
destruction, spawn, collision, support, damage, or trajectory input. It is
behind terrain, actors, projectile and effects depths. Fixed legibility lanes
exclude landmark and vegetation anchors from actor/status/projectile contrast
areas.

All five textures are required before any scene art is instantiated. A failed
or unavailable file yields the unchanged sky/cloud/terrain presentation with
no partial background.

## Acceptance and release boundary

This is an owner-review engineering preview only. Public Practice/Daily
activation, visual baseline approval, and physical-device acceptance remain
separate decisions. Windows may run functional browser smoke, but may not
create or approve visual baselines; those come only from the pinned Ubuntu
artifact workflow.


## WP-015D4G: Owner-requested composition and terrain alignment

The owner rejected the assembled framing (hidden tower, floating volcano,
clumped distant trees, sparse vegetation and mismatched foreground) and
explicitly authorized level geometry changes using the same reference image.
Its supplied file matches the existing reference hash
`9A3E5DEDDF02B0C03B2A8E46894ED61158DB39D8471BA99CD42B8618A1EB0D04`.
This successor changes placement and a versioned local terrain recipe; it does
not change the admitted image bytes, bundle budget or the closed V10G maps.

The visible opening arena is world x=512..1536, y=0..576, matching the normal
1024x576 display ratio. Starts at (624,304) and (1424,320) fit both actor cards
on phones. Keep the inherited 2048x576 collision format and off-frame margins
for old authority compatibility; do not stretch the full world horizontally or
zoom immediately to a single actor. Projectile tracking uses edge reveal rather
than recentring every frame. Manual panning and off-screen actor recovery remain.

Background anchors use visible-frame fractions, with bounded camera parallax,
not normalized positions across the entire hidden world. Every approved master
uses its actual (512,528) baseline anchor inside the 1024x576 transparent canvas.
Volcano and five overlapping jungle clusters meet the same lower ground zone;
the tower is at 79% of the frame with its base hidden by the valley terrain.
Eight palms and sixteen bushes occupy stratified, deterministic lower-frame
positions. All art stays behind terrain/actors and consumes no collision or
simulation state. No generation, image editing or new runtime file is involved.

### Executable ASCII terrain

`shared/terrain-volcanic-ruin.ts` owns the literal ASCII below. Each column is
32 world units, each row 16, and the first row starts at world (512,288).
`#` is solid and `.` empty. Columns remain solid below their first `#`; the
compiler expands each column into four 8-unit collision cells. This is a bounded
surface recipe, not a general editor or importer.

```text
................................
####............................
####........................####
######........###...........####
######........###..........#####
######........###..........#####
########...######...#......#####
########...######...#....#######
########...######...#....#######
########...######...############
################################
```

The stepped valley follows the reference's raised ends, descending shelves,
low basins and central crest. The declared jump landings are 96 units wide.
The centre notch has a 112-unit left wall and a shallower right step: protection
is directional, not universal. Shallower basins provide partial concealment.
Tests prove ordinary jumps, a terrain-blocked downhill attack, the jump-enabled
precision counterattack/exposure, and AI/replay continuation after a breach.
Opening positions are exposed high ground as in the reference; movement into
the valley is part of the opening tactical choice.

`nimble-knots-artillery-v10-r5` and `volcanic-ruin-steps-r1` bind this recipe and
reuse R3/R4 weapon rules. The combined preview URL remains
`/?combat-preview=v10g&background-preview=volcanic-ruin`. It chooses the scenic
recipe instead of the R4 `terrain-map` selection; ordinary V10G URLs retain R4.
Missing image loads preserve the same R5 physics with the sky/cloud fallback.
No public Practice/Daily selection or reward transport is changed.

Verification: change selector, actual geometry/attack/AI/replay witnesses,
five-project phone framing/turn checks, and screenshot inspection. Physical
phone acceptance and Ubuntu release visual baselines remain separate gates.
See [WP-015D4G evidence](../evidence/wp-015d4g.json).

Owner phone review after deployment:

1. Open the combined preview URL. Both starts and their stat cards should fit;
   Pause must remain separate. The tower crown and arches should be visible,
   with the volcano base behind the low jungle and foreground terrain.
2. Inspect the stepped valley in the normal sideways phone view and landscape.
   Palms and bushes should form a denser lower layer without hiding the actors.
3. Move down a shelf, jump back toward a higher landing, aim and fire, then let
   Loomkeeper respond. Confirm the composed view returns after projectile
   tracking and no selection, aiming or turn controls are obstructed.
4. After losing, start a fresh preview and confirm the volcano, tower and
   vegetation remain visible. Paused and terminal restarts must carry the same
   background definition into the replacement scene; the replay-bound terrain
   and the presentation selection both survive repeated restarts.

## WP-015D4H: Standard server-backed volcanic Practice

Owner request, 2026-09-11: make the accepted volcanic V10 gameplay the normal
server-backed Practice entry at `/` before beginning the separate PEI experiment.
The owner explicitly confirmed server authority, rather than a default local
preview, and verified the vanished-background restart fix on a physical phone.
D4G is accepted; this successor owns live integration and its new acceptance.

Reuse the exact R5 stepped valley, V10 planner and five admitted background
copies. Do not reinterpret old V10 or V7 replays. A separate version-10 live
wire envelope and automation identifier bind authoritative input, real clocks,
Loomkeeper selection, pause, disconnect/resume, expiry, results and fresh retry.
Practice remains wallet-free. Daily rewards retain their existing V7 authority,
reservation and payout controls. PEI is not implemented in this package.

The five background files remain a lazy, exact-copy 1,835,347-byte bundle under
its 1,900,000-byte ceiling, loaded at combat entry. The existing 11-file media
inventory remains 1,402,579 bytes; total available media is 3,237,926 bytes.
This explicitly promotes the background to standard Practice, without changing
source bytes, generating assets or treating decorative pixels as collision.

The separate live coordinator reuses the accepted V9 scheduling and ownership
patterns with V10 transitions and planner. Historical foundation coordinators
remain available. A live replay retains R5 recipe/candidate metadata plus the
chosen AI plans and a new automation identity; verification reconstructs both.

Required checks: selector baseline, authoritative V10 lifecycle/replay and
cross-session rejection, default phone Practice with aim/fire/AI handoff,
paused restart, cold reload and terminal retry, background fallback, historical
Practice/reward regression, compliance, build/smoke and bundle/security. Run the
new standard journey across maintained browser projects. Existing V7 browser
fixtures remain explicit historical coverage. Ubuntu visual baseline approval,
full daily/release gates and new physical-device live acceptance remain separate.

Evidence: [WP-015D4H](../evidence/wp-015d4h.json).

## WP-022A: Daily V10 Migration

Owner request, 2026-09-12: the Daily Challenge must be exactly the mode later
granted through PEI. Before PEI admission is introduced, migrate Daily from V7
to the already accepted standard V10 R5 volcanic authority. This waypoint is
about operational gameplay and reward infrastructure; it does not experiment
with receipt contents.

The existing Daily product contract remains authoritative: one reward-eligible
attempt per wallet per UTC day, a fixed sponsor-funded reward only for a
server-verified player win, durable reservation before combat, idempotent claim
and payout processing, and no player stake. A rewarded V10 challenge uses the
same R5 simulation, Loomkeeper policy, volcanic presentation and live lifecycle
as Practice. Its reward mode prevents pause, binds the reservation challenge ID
and eligibility token at creation, and carries the V10 automated replay into
the existing reward verifier. Reload or reconnect resumes that same server
challenge; terminal retry returns to standard V10 Practice.

Historical V7, V8 and V9 protocols and replays retain their identities. The
dedicated `development-v10-practice` profile stays wallet-free and rejects
reward admission; the ordinary configured runtime admits V10 Daily only after
the existing reward service reserves it. No PEI schema, helper mini app,
cross-app handoff, mainnet transaction, payout activation, reward amount change,
asset work or historical replay reinterpretation is authorized here.

Required checks: strict V10 practice/reward wire admission, reservation and
post-await ownership checks, reward-mode pause rejection, disconnect/resume,
verified V10 win/loss replay settlement and idempotency, standard Practice
regression, build/smoke/security/bundle selection, and the canonical phone
browser Daily journey. PostgreSQL and full release coverage follow the existing
selector and release policy.

Phone Gate A after deployment:

1. Authorize the wallet and confirm Daily still presents the existing fixed
   reward and availability state.
2. Start Daily and confirm it opens the same volcanic V10 R5 match as Practice.
3. Aim and fire, then confirm the Loomkeeper completes its response.
4. Reload during the active rewarded match, choose Resume Daily Challenge, and
   confirm the same Daily challenge resumes. Rewarded Daily has no pause control
   by policy.
5. Complete or leave the match and confirm the result/claim state matches the
   outcome. Choose Practice from the result and confirm a fresh volcanic V10 R5
   match starts with its background intact.
6. Confirm a second Daily attempt for the same wallet and UTC day is refused.

Evidence: [WP-022A](../evidence/wp-022a.json).
