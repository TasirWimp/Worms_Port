# WP-015D0 Arena Scale and Camera Contract

Status: approved by the project owner on 2026-08-08. WP-015D1 may implement
this exact versioned V4 arena/camera slice. It does not authorize obstacles,
tactical terrain, Relic tiers, or asset work.

## Purpose

WP-015C made the shared Wizard and textile terrain materially readable. The
remaining fixed 1024 by 576 decision view then makes the 30-percent-larger
Wizards read as neighbours rather than artillery opponents. V4 establishes a
wider world while keeping that same phone-readable decision scale: an
opening-only continuous survey first shows the 2048-unit arena, then eases into
the player's usual 1024 by 576 view. The player can pan horizontally before and
after locking aim.
This leaves genuine world space for a later, separately versioned tactical
arena package; D1 itself adds no obstacles or tactical terrain.

## Frozen V4 simulation arena

| Property | V1/V2/V3 | Frozen V4 value |
| --- | ---: | ---: |
| World width / height | 1024 / 576 | 2048 / 576 world units |
| Terrain cells | 128 by 72 | 256 by 72 |
| Cell size | 8 | 8 world units |
| Packed terrain words | 288 | 576 |
| Player initial x | 192 | 512 |
| Loomkeeper initial x | 832 | 1152 |
| Initial horizontal separation | 640 | 640 world units |
| Vertical geometry | 576 / 72 cells | unchanged |

V4's low-relief terrain generator is the existing deterministic surface walk
extended over its 256 columns. It introduces no new peak profile, object,
obstacle, foreground prop, material, or collision rule. Its seed/RNG result is
new V4 replay data; V1/V2/V3 must keep their exact 128 by 72 generator,
coordinates, packed words, state hashes, challenge/replay bytes, and
reconstruction results.

The doubled world creates genuine free space on both sides of the duel and a
1024-unit camera travel range. The initial 640-unit player/Loomkeeper separation
intentionally remains within the current V3 Threadball launch envelope; this
keeps V4 playable without prematurely changing a Relic range. The Loomkeeper at
x=1152 is just outside the initial player camera window x=0..1024, so the player
must pan toward it to inspect it. V4 retains the V3 Relic constants,
deterministic Loomkeeper policy, and shared-Wizard direct-hit profile exactly.
Range and direct-damage differentiation belongs only to V5/WP-015D2.

## Camera and transform

The camera is presentation-only client state. It is never serialized in a
snapshot or replay, sent to the server, used by the Loomkeeper, or consulted by
collision, damage, terrain deformation, rewards, or command validation.

The normal V4 decision camera is exactly 1024 by 576 world units. V4 alone has
one non-interactive opening survey: it starts at the full 2048 by 576 world
width and then continuously eases to the normal player view over three seconds.
It is a horizontal-only survey: the camera `top`, camera height, battlefield
height, vertical terrain framing, and vertical Wizard placement are fixed at
their normal values throughout. This prevents the opening view from exposing
blank space above or below the terrain or making either Wizard rise into its
ground position. There is no pinch, manual/dynamic zoom, zoom button, or
AI-specific zoom. Responsive CSS keeps the existing safe 16:9 battlefield
rectangle fixed. At the accepted 844 by 390 logical Samsung viewport, the
normal decision view preserves the current approximately 665 by 374 CSS-pixel
arena and its approximately 0.6493 vertical screen pixels per world unit. The
opening survey temporarily halves only the horizontal presentation scale, so it
shows the full V4 width without vertically shrinking or moving characters or
terrain.

```text
authoritative V4 terrain width = terrain.width * terrain.cellSize = 2048
normalCamera = { left: 0, top: 0, width: 1024, height: 576 }
openingSurvey = { left: 0, top: 0, width: 2048, height: 576 }
camera.left in [0, terrainWorldWidth - camera.width]
camera.top = 0
camera.height = 576

worldScaleY = min(usableBattlefieldWidth / 1024,
                  usableBattlefieldHeight / 576)
worldScaleX = battlefield.width / camera.width
screen.x = battlefield.x + (world.x - camera.left) * worldScaleX
screen.y = battlefield.y + (world.y - camera.top) * worldScaleY
```

All D1 camera bounds must derive from the authoritative terrain width and cell
size plus this named normal-camera/opening-survey contract. Renderer, layout,
terrain tiling, actor/status anchors, Loomseed origin, aim dashes, projectile,
impact, and the clipping mask use the same split-axis transform. Visual sizes
remain tied to `worldScaleY`; only world x positions use `worldScaleX` during
the survey. They must not retain a hidden 1024-world-width assumption.
V1/V2/V3 continue to present their full 1024 by 576 arena with a zero
horizontal camera range.

Camera `left` is clamped after every snapshot, resize, orientation change,
reconnect, and scene reset; camera `top` and height remain at `0` and `576`.
The opening survey uses an ease-in-out interpolation for exactly 3000ms;
reduced motion sets its normal destination immediately. Any deliberate player
input (a control interaction or a valid battlefield pan) cancels the remaining
survey and adopts the normal active-Wizard framing immediately. No command,
simulation event, or AI decision can extend, replay, or otherwise control that
survey. Approved Cloud sprites are a distant clipped
presentation layer with horizontal parallax factor 0.25; they never supply
terrain, collision, or concealment truth. Patch Top and Interior scroll at
world rate, remain byte-identical runtime copies, and continue to reflect only
the authoritative packed terrain state.

Actor-local Stitching bars use their true world-to-screen anchor above the
Wizard and render only when the full card fits inside the camera window. An
off-screen actor does not get clamped to a misleading battlefield edge; the
compact turn/timer pill remains available at all times.

## Horizontal swipe contract

Panning is an optional information-navigation gesture, never a gameplay
command. It is accepted only on the unobscured battlefield canvas while the
challenge is active, the player owns an `awaiting_command` turn, and no command
or presentation is pending. It remains available after aim is locked.

1. Movement/Aim pads, selected-Relic chip/chooser, Fire, Pause, modal controls,
   and actor/status controls always own their own pointer. A pointer beginning
   on any of them can never become a camera pan.
2. A canvas pointer must move at least 12 CSS pixels along logical horizontal
   x before it becomes a pan. A tap or a mainly vertical movement is inert.
   Exactly one pointer may pan; a second pointer, pinch, long press, or mouse
   wheel is ignored and never changes camera zoom or simulation state.
3. Convert client coordinates through `clientPointToGame()` before calculating
   drag deltas. In default clockwise sideways mode, explicit counter-clockwise
   mode, `sideways=off`, and a true landscape viewport, dragging along the
   *displayed battlefield* therefore has the same logical horizontal pan
   meaning. The implementation must not branch on physical portrait direction.
4. Dragging the displayed world right decreases `camera.left`; dragging it left
   increases `camera.left`. Apply the world delta as
   `-logicalDeltaX / worldScaleX`
   and clamp it to the named camera range. The gesture calls `preventDefault`
   only for its owned canvas pointer so it does not scroll or select the page.
5. Pointer up, cancel, lost capture, window blur, hidden document, Pause,
   reconnect, resize, scene shutdown, terminal result, and command submission
   discard the camera pointer without producing a move, aim,
   Relic selection, Fire, or server request.

During the one opening survey, a legal first canvas pointer or any command
control interaction cancels the remaining survey and uses the normal player
view before it processes that interaction. It does not turn a tap into a pan or
change the authoritative state.

The Aim pad remains the sole angle/power input. A player pans toward the
Loomkeeper until it is visible, adjusts aim with that target in view, and
releases to lock. While the player is actively dragging Aim, an authoritative
preview endpoint that reaches the final 64 world units at an outgoing camera
edge advances the camera just enough to retain that fixed 64-unit inset. This
keeps the projected terrain contact and an edge-side target usable without a
hidden target snap. It is presentation navigation only: it never submits,
locks, alters, or otherwise completes the aim, including when the preview
directly intersects the Loomkeeper. Release remains the only way to lock an aim
and Fire remains a separate command. Aim lock deliberately preserves the exact
camera position reached during the drag; it never centres the impact or enemy.
The player may still swipe horizontally after any lock to inspect caster or
target before Fire. Success never requires panning: all command controls and
the ballistic preview work from the current view.

When the Loomkeeper is outside the camera window during a legal player turn,
the non-interactive HUD shows a concise direction-to-swipe hint: `Swipe left to
find Loomkeeper` when it lies right of the view, and the mirrored instruction
when it lies left. The hint disappears as soon as the Loomkeeper enters the
window and must never intercept a pointer or communicate simulation truth.

## Automatic framing phases

`focus(unit)` means normal-camera `left = clamp(unit.x - 512, 0, 1024)`. The
opening survey uses one three-second smooth continuous ease. Later automatic
caster return uses a 650ms presentation-only smooth continuous ease; reduced
motion applies either destination immediately. Projectile follow uses the
current displayed authoritative trace
point as its focus subject without additional lag, so the visible projectile,
tail, arc, and impact remain aligned.

| Phase | Camera behavior |
| --- | --- |
| New V4 challenge or retry | Start at the opening survey (both Wizards visible), then continuously reach the normal active-Wizard view after 3000ms. The initial player spawn clamps to left 0. |
| Recovered snapshot or player decision after the survey | Focus the active Wizard in the normal view. |
| Player free decision before aim lock | Preserve the player-selected pan. |
| Aim drag | Preserve the selected pan while its endpoint remains outside the 64-unit edge inset. Once it enters that inset, follow only far enough to keep it 64 units inside the outgoing edge. A direct Loomkeeper-hit preview receives no target snap, lock, or submission. |
| Aim lock | Preserve the exact camera position reached during the drag. A later aim drag may advance its own edge-follow view; manual horizontal panning remains available. |
| Accepted Fire and cast | Cancel manual pan and smoothly return to the caster over 650ms before/through the two-second cast. This is never a single-frame jump. |
| Projectile / impact | Follow the displayed authoritative projectile to the impact; hold impact framing through its presentation. |
| Next active turn | Focus the new active Wizard. |
| Loomkeeper turn | Apply the same caster, projectile, impact, and next-turn rules. No player gesture can interfere. |
| Pause | Freeze the current view; Resume preserves it if the same decision state is still valid. |
| Reconnect, interruption, resize, visibility loss | Cancel manual gesture, re-clamp, and focus the authoritative active Wizard once the current snapshot is rendered. |

## D1 implementation boundary

WP-015D1 must introduce `nimble-knots-artillery-v4` and explicit per-ruleset
arena metadata rather than mutating `SIM_RULES`. The simulation state and
protocol must discriminate V4's 256 by 72 terrain from historical 128 by 72
terrain, and new challenges may default to V4 only after its replay and browser
gates pass. No historical state is widened or reinterpreted.

D1 may change client layout/renderer/input presentation and versioned shared
simulation/protocol/server defaults as required by this contract. It must not:

- add an obstacle, destructible prop, tactical terrain profile, alternate map,
  character, Calling distinction, source media, asset request, or asset change;
- change V4 Relic values, range, damage, radius, precision, falloff, ammo,
  cooldown, status effect, movement, gravity, hitbox, reward eligibility, or
  Loomkeeper policy;
- let a camera gesture create, alter, delay, or bypass an authoritative command;
- replace the approved Cloud/Patch/Wizard/Threadball bytes or their fallback;
- alter V1/V2/V3 replay bytes, ruleset reconstruction, or rendered full-world
  camera behavior.

V4's terrain serialization can be 8.8 KiB after a bounded projectile trace,
so D1 may raise the separately bounded Socket.IO event ceiling from 8 KiB to
12 KiB while retaining the existing 16 KiB transport cap and strict command
schemas. It must not otherwise broaden transport input limits.

## Required D1 proof

- Pure camera tests cover normal and opening-survey dimensions, interpolation,
  min/max clamp, centre focus, manual drag, actor off-screen status hiding,
  resize/recovery reset, and logical sideways delta conversion for right, left,
  off, and real landscape modes.
- Versioned simulation/protocol/replay tests prove V4's 256 by 72 state and
  deterministic reconstruction while retaining V1/V2/V3 golden bytes.
- Browser matrix covers every maintained viewport: 360 by 640, 390 by 844,
  412 by 915, 844 by 390, and WebKit 390 by 844. It proves canvas-only pan,
  protected control routing, continuous opening survey, aim-lock view
  preservation, continuous caster return,
  player/Loomkeeper projectile follow, reduced motion, pause/reconnect/retry,
  and no page errors or accidental commands.
- Generate a pinned Ubuntu visual-candidate artifact before a committed visual
  baseline update. Inspect it explicitly, then pass ordinary comparison CI.
- Real-device acceptance on the Samsung/Nimiq Pay presentation verifies the
  sideways setup, intuitive horizontal swipe, enemy observation, aim lock,
  spell/projectile follow, safe overlay controls, and recovery. It does not
  claim removal of Nimiq Pay host chrome or native full-screen support.

## Approved implementation authorization

The project owner approved this exact V4 `2048 by 576`, `256 by 72`, `512/1152`
spawn, opening-only `2048 by 576` horizontal-only continuous three-second
survey with fixed vertical framing, normal fixed `1024 by 576` camera window
with `0..1024` horizontal range, swipe-to-find hint, aim-lock view
preservation, post-lock panning, continuous caster return, and
caster/projectile/impact follow contract. Obstacles and tactical terrain remain
outside WP-015D.
