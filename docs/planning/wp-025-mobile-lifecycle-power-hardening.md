# WP-025 Mobile Lifecycle And Power Hardening

Status: **implemented locally; Phone Gate A pending**  
Implementation base: `b6f7141`  
Implementation branch: `codex/v10-r6-action-impact-dynamics`

## Product outcome

WP-025 stops NIMble Knots-owned work when Nimiq Pay puts the mini app into the
background. A hidden lobby or match must not keep a Phaser presentation clock,
an independent combat animation loop or a live Socket.IO connection running.
Returning to the foreground reconnects the existing bounded session and accepts
one fresh authoritative snapshot before controls can operate again.

The current R7 server remains the owner of match time, Daily eligibility,
results and rewards. Hiding the client does not pause a rewarded match, extend a
session or create another Daily attempt. A short background interval can resume
the same Practice or Daily challenge within the existing reconnect grace. A
long interval may truthfully return an expired or completed result.

## Observed starting problem

The physical Android report attributed 3 hours 14 minutes of CPU time and 3
hours 31 minutes of background time to Nimiq Pay after repeated short NIMble
Knots test sessions. The app cannot separate mini-app WebView work from its host
in Android's per-app battery screen, but inspection found two owned sources
that remained eligible to run while hidden:

- the current combat presentation used its own perpetual
  `requestAnimationFrame` loop outside Phaser's managed update lifecycle; and
- the Socket.IO client stayed connected, allowing periodic authoritative
  snapshots to wake the hidden page.

The Page Visibility API exposes the document's visible/hidden transition. MDN
also notes that open WebSockets can keep background pages outside ordinary
timer throttling. Phaser's game pause/resume controls its internal update and
render systems, while Socket.IO requires an explicit `connect()` after a manual
`disconnect()`.

Primary references:

- https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event
- https://docs.phaser.io/phaser/concepts/game
- https://docs.phaser.io/phaser/concepts/scenes
- https://socket.io/docs/v4/client-socket-instance/

## Lifecycle contract

One application lifecycle owner listens to `visibilitychange`, `pagehide` and
`pageshow`. `pagehide` is a suspend fallback; `pageshow` resumes only when the
document is visible. Duplicate events are idempotent. `blur` alone still only
cancels transient input because a wallet or operating-system overlay can blur a
visible app without placing it in the background.

On suspend the client:

1. publishes `data-app-lifecycle="suspended"` for deterministic diagnostics;
2. dispatches one local suspend boundary so the current combat scene cancels
   held input presentation, pending aim work, camera motion and queued playback;
3. pauses Phaser when the lifecycle owner did not inherit an existing pause,
   then stops its internal animation-frame scheduler;
4. manually disconnects Socket.IO, which also stops automatic reconnection; and
5. leaves server state, storage and reward authority untouched.

The live server's existing disconnect barrier releases held movement. Server
simulation can continue without a socket, but no snapshots are emitted to the
client while it is hidden.

On resume the client:

1. publishes `data-app-lifecycle="active"`;
2. explicitly reconnects Socket.IO and restarts Phaser only when WP-025 paused
   it;
3. re-reads the visual viewport after the host is visible; and
4. resumes static presentation without replaying elapsed client-side animation.

The V10 client already fences input after disconnect. The first owned resync
snapshot replaces the hidden projection directly, retires old preview and
camera generations, and restores input only after the session and challenge
identity match. No hidden-time presentation queue or catch-up animation runs.

The current R7 presentation heartbeat now runs from Phaser's Scene `UPDATE`
event. It no longer schedules its own frame. This makes Phaser pause the single
local simulation/render driver for the current game, including the lobby and
local diagnostic previews.

## Authority and product boundaries

- Standard Practice and PEI-gated Daily keep the exact current R7 ruleset,
  automation identity, terrain, controls, Loomkeeper, replay and result rules.
- The server keeps the existing two-minute reconnect grace and challenge/session
  limits. WP-025 does not add background pause authority.
- Practice remains wallet-free. Wallet identity, unused PEI receipts, an active
  Daily reservation and payout state retain their existing ownership.
- No helper protocol or polling behavior changes. The helper's bounded
  transaction-finality wait is not the perpetual game workload observed here.
- No service worker, wake lock, native Android API, dependency, asset, economy,
  environment variable or deployment setting is added.
- Retired runtime versions remain historical diagnostics and receive no
  lifecycle compatibility work.

## Automated acceptance

Current-R7 coverage must prove:

- duplicate hidden/pagehide events cause one pause and disconnect, and visible
  resume causes one reconnect and lifecycle-owned Phaser resume;
- a hidden static lobby executes no scheduled animation-frame callbacks;
- a hidden active match has no client frame callbacks or delivered snapshots,
  while the server can continue its authoritative clock;
- disconnect releases held movement and blocks input;
- foreground resume binds the same session and challenge, consumes a fresh
  snapshot without catch-up presentation and restores smooth input; and
- the same visibility boundary preserves an active Daily challenge.

Runtime changes require types, a fresh current build, standard R7 built smoke
and the selected current browser journeys. The selector dry run is the baseline;
unrelated and retired-version suites do not run. The full daily/release gate
stays on its normal cadence.

## Phone Gate A - Android and Nimiq Pay

Use ordinary production-safe settings. Practice supplies unrestricted test
matches; no repeat-Daily variable is needed.

1. Open NIMble Knots to the static Calling lobby. Confirm it is responsive,
   then put Nimiq Pay in the background for about 20 minutes. Reopen it and
   confirm the lobby returns without a reload loop or visible catch-up work.
2. Start a Practice match, walk or jump, then background Nimiq Pay for 30 to 60
   seconds. Reopen it and confirm the same match resumes, held movement is off,
   controls respond smoothly and no fast-forward presentation plays.
3. For an active-match battery sample, start another Practice and leave Nimiq
   Pay in the background for about 20 minutes. Expiry or a completed result is
   acceptable after the existing reconnect grace; high continued background
   CPU is not.
4. Compare Android's Nimiq Pay battery/CPU change for three similar observation
   windows: Nimiq Pay's own home screen, the hidden static lobby and the hidden
   active Practice. The two game cases should be close to the host control and
   must no longer accumulate background CPU near wall-clock time.
5. When the next real Daily attempt is available, start it, background for 30
   to 60 seconds and reopen. Confirm the same Daily challenge resumes and the
   reward/PEI state is unchanged. This is a Daily lifecycle confirmation, not a
   long battery sample.

If steps 1 through 3 behave correctly but Nimiq Pay still records substantial
background CPU, WP-025 will record the remaining issue as host-owned WebView
lifecycle residue. The next investigation then needs Nimiq Pay evidence about
native WebView pause, timer pause or destruction; additional game timers or
match rules are not justified without that evidence.

## Definition of done

WP-025 closes when the automated current-R7 lifecycle checks pass, Phone Gate A
shows correct short resume and materially reduced hidden CPU activity, the
work-package evidence is complete and housekeeping agrees with the Execution
Pointer. WP-026 remains queued until this gate closes.
