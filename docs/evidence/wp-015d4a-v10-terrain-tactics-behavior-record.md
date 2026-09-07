# WP-015D4A Frozen V10 Terrain Tactics Behavior Record

Status: frozen reference-observation handoff, 2026-09-07; no implementation.

Observer: Codex primary acting as the single-owner reference observer.
Reference identity: public `lorgan3/sorcerers`, commit
`0f45c4920321c0a3a14de30fe5cf44131a38da89`.

This record is the only Sorcerers-derived input admitted to the V10 planning
stage. It contains behavior-level observations and product-authored questions,
not source code, algorithms, constants, identifiers, assets, map bytes, tile
rules, paint rules or permission to reproduce the reference implementation.
The ignored checkout and extracted inspection images remain quarantine material.

## Material observed

The observer inspected the pinned repository overview, map-selection and
testing guidance, the five bundled map previews and their embedded terrain and
collision-mask views, and the source areas responsible for map loading,
terrain/collision behavior, spawn-site discovery, character placement and
movement-route analysis. Inspection was limited to understanding externally
meaningful terrain behavior and its limitations.

## Frozen observable behavior

- The map catalogue presents materially different battlefield silhouettes:
  broad connected hills, a long mostly open lane, layered interior spaces, a
  dense multi-level structure, and separated landforms with a lethal gap.
- Terrain topology changes the action before a cast. On hilly ground, an actor
  may need to walk and jump toward the opponent before a practical attack.
  Rises, dips, ledges and walls change visibility, firing arcs and the value of
  the current position.
- Supported floors can exist at several elevations. Some battlefields provide
  more than one local destination or traversal pattern, while others offer a
  single exposed route.
- Collision-bearing terrain can be removed during play. A position that
  provides protection or support can therefore become exposed or unsafe, and
  a route assessment can change after an attack.
- The game discovers multiple body-clear locations above collision-bearing
  terrain and consumes chosen locations so two characters do not receive the
  same site.
- The observed placement policy does not establish deterministic selection,
  balanced pairs, team symmetry, mutual reachability, useful opening attacks
  or credible replies. Terrain validity alone is not tactical fairness.
- Large or vertically layered maps can place the opponent outside the active
  actor's view. Camera following, panning and zooming become part of finding the
  next action.
- Maps can declare presentation and suitability information such as a preview
  and recommended character count. This makes incompatible map/session
  combinations visible before play, but it does not prove their balance.

## Inspiration admitted for the V10 product contract

The reference supports these behavior-level directions for an independently
authored V10 contract:

1. Treat the terrain silhouette as a rules input. A V10 map family should
   differ through meaningful exposure, cover, elevation and movement demands,
   rather than through decorative texture alone.
2. Evaluate terrain and starts as one problem. Candidate starts should be
   judged by support, clearance, local movement, route usability, opening
   attack opportunities, reply opportunities and role-swapped outcomes.
3. Replace the inherited exact-separation rule with map-relative placement
   criteria. Different silhouettes may need different distances, but every
   accepted pair needs a playable first exchange.
4. Prefer a small deterministic product-owned family whose differences can be
   tested exhaustively. A player-facing map builder or unrestricted uploaded
   maps are unnecessary for the V10 competition candidate.
5. Make cover temporary when existing authoritative destruction removes it.
   Collision, movement validity and AI decisions must consume the changed
   terrain state rather than a decorative image or initial-map assumption.
6. Keep the opening understandable on a phone. Initial framing and guidance
   should reveal the active actor, the opponent's direction, and the nearby
   route or cover choice without requiring blind movement or precision camera
   work.

These are design inputs, not frozen constants or proof of balance. The V10
contract must define its own finite terrain family, placement scoring,
opening-shot/reply acceptance, deterministic seeds and phone journey.

## Explicitly rejected borrowing

- Do not copy Sorcerers maps, thumbnails, collision masks, art, themes,
  generation code, tile vocabulary, source constants, spawn algorithm or
  route-graph implementation.
- Do not introduce random spawn selection. V10 remains deterministic and
  replay-identifiable under Worms_Port authority.
- Do not infer that every observed topology fits the current product. Ladders,
  caves, enclosed multi-floor structures, disconnected islands, lethal water,
  custom map uploads and larger teams require mechanics and acceptance work
  outside this observation.
- Do not make decorative Patch pixels authoritative for collision or
  destruction.
- Do not treat the reference's recommended character counts or map catalogue
  as product balance evidence.

## Questions the V10 contract must close

- Which small set of independently authored surface profiles creates distinct
  tactical openings while remaining traversable with the current walk and
  jump controls?
- What makes an opening attack viable without making it forced, and what makes
  the responding side's next turn credible?
- How are exposure, cover, elevation, route length and destructive change
  measured with deterministic integer simulation state?
- When does a generated map or start pair fail closed?
- How will role swaps and deterministic seed repeats expose first-player,
  elevation and camera bias?
- Which phone-browser journey proves that the player can understand the map,
  reposition, attack, observe the Loomkeeper reply and continue after terrain
  destruction?

## Evidence limit

No runtime play session, player study, phone acceptance, balance experiment or
Worms_Port implementation was performed. The observation shows useful failure
surfaces and design possibilities only. The owner explicitly directed this
running primary task to continue with V10 after the record was frozen. From
that instruction forward, the task must use only this record and local
MIT-compatible Worms_Port sources without reopening Sorcerers or quarantine.
This explicit single-owner continuation is recorded transparently and does not
claim independent clean-room review.
