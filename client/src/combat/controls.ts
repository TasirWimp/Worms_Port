import type { ChallengeSnapshot } from '../../../shared/protocol';
import {
    RELIC_IDS,
    SIM_RULES,
    type RelicId,
    type SimulationCommand,
    type SimulationUnit
} from '../../../shared/simulation';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import { CombatInputController, ActionTurnsInputController, UnifiedMovementInputController } from './input';
import type { AimIntent, MovementFactsR1 } from './input';
import { computeActorStatusLayout, computeV8ExtraControls, type CombatLayout } from './layout';
import type { ChallengeSnapshotV8Runtime as ChallengeSnapshotV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';

type ControlsCallbacksV8 = {
    onIntent: (intent: SimulationIntentV8) => boolean | void;
    onCancel: () => void;
    onRelease?: () => void;
    inputReady?: () => boolean;
    inputFlight?: () => 'locomotion' | 'blocked' | null;
    onAimPreview: (aim: AimIntent | null) => void;
    onPause: (paused: boolean) => void;
    onRetry?: () => void;
    onCameraFocus: (actor: 'player' | 'loomkeeper') => void;
};

export const CAMERA_FOCUS_DURATION_MS = 300;
export const CAMERA_PAN_THRESHOLD = 12;
export type CameraPreference = 'player' | 'loomkeeper' | 'free';

type CameraActionFacts = { activeActor: 'player' | 'loomkeeper'; phase: string; turn: number };

export function cameraFocusProgress(elapsedMs: number, reducedMotion = false): number {
    if (reducedMotion) return 1;
    const progress = Math.min(1, Math.max(0, elapsedMs / CAMERA_FOCUS_DURATION_MS));
    return progress * progress * (3 - 2 * progress);
}

export function deliberateCameraPan(dx: number, dy: number): boolean {
    return Math.abs(dx) >= CAMERA_PAN_THRESHOLD && Math.abs(dx) >= Math.abs(dy);
}

export function beginsPlayerCameraAction(previous: CameraActionFacts, next: CameraActionFacts): boolean {
    const actionable = (phase: string) => phase === 'action' || phase === 'retreat';
    return next.activeActor === 'player' && actionable(next.phase) &&
        (previous.activeActor !== 'player' || !actionable(previous.phase) || next.turn !== previous.turn);
}

export function livingCameraPreference(
    preference: CameraPreference,
    playerAlive: boolean,
    loomkeeperAlive: boolean
): CameraPreference {
    if (preference === 'player' && !playerAlive && loomkeeperAlive) return 'loomkeeper';
    if (preference === 'loomkeeper' && !loomkeeperAlive && playerAlive) return 'player';
    return preference;
}

export function projectileCameraRestoration<T>(
    saved: { preference: CameraPreference; freeCamera?: T },
    playerAlive: boolean,
    loomkeeperAlive: boolean
): { preference: CameraPreference; freeCamera?: T } {
    const preference = livingCameraPreference(saved.preference, playerAlive, loomkeeperAlive);
    return preference === 'free' && saved.freeCamera !== undefined
        ? { preference, freeCamera: saved.freeCamera }
        : { preference };
}

/** V8 has continuous owned input, not the legacy accepted-command animation queue. */
export class ActionTurnsControls {
    public readonly input: ActionTurnsInputController;
    private readonly unified?: UnifiedMovementInputController;
    public readonly root: HTMLDivElement;
    private snapshot: ChallengeSnapshotV8;
    private busy = false;
    private suspended = false;
    private direction: -1 | 0 | 1 = 0;
    private jumpPointer?: number;
    private layout?: CombatLayout;
    private chooserOpen = false;

    constructor(parent: HTMLElement, snapshot: ChallengeSnapshotV8, private readonly callbacks: ControlsCallbacksV8) {
        this.snapshot = snapshot;
        const r1 = snapshot.rulesetId === 'nimble-knots-artillery-v8-r1';
        this.unified = r1 ? new UnifiedMovementInputController() : undefined;
        this.input = this.unified ?? new ActionTurnsInputController();
        this.root = document.createElement('div');
        this.root.className = `combat-ui combat-v8${r1 ? ' combat-v8-r1' : ''}`;
        this.root.dataset.ruleset = snapshot.rulesetId;
        this.root.innerHTML = `
            <section class="combat-status"><strong class="combat-turn" aria-live="polite"></strong><span class="combat-timer"></span></section>
            <div class="combat-unit-status player-status" data-unit="player" role="group"><span class="unit-status-name">You</span><strong class="unit-status-value"></strong></div>
            <div class="combat-unit-status loomkeeper-status" data-unit="loomkeeper" role="group"><span class="unit-status-name">Loomkeeper</span><strong class="unit-status-value"></strong></div>
            <button type="button" class="camera-focus-button camera-focus-player" hidden></button>
            <button type="button" class="camera-focus-button camera-focus-loomkeeper" hidden></button>
            <button type="button" class="pause-button">Pause</button>
            <div class="combat-touch-zone movement-zone" role="group" aria-label="${r1 ? 'Movement pad. Tap a side to face. Drag sideways to walk. Push up to hop. Release stops walking.' : 'Movement pad. Hold to walk, release to stop.'}"><span class="pad-label">${r1 ? 'Drag to walk · ↑ hop' : 'Hold to walk'}</span>${r1 ? '<span class="pad-side pad-side-left" aria-hidden="true">←<small>Tap</small></span><span class="pad-side pad-side-right" aria-hidden="true">→<small>Tap</small></span>' : ''}<span class="pad-ring"></span><span class="pad-knob"></span></div>
            <div class="combat-touch-zone aim-zone" role="group" aria-label="Aim and power pad"><span class="pad-label">Aim · release locks</span><span class="pad-ring"></span><span class="pad-knob"></span></div>
            ${r1 ? '' : `<button type="button" class="jump-button v8-extra" aria-label="Jump forward">Jump</button>
            <button type="button" class="face-left v8-extra" aria-label="Face left">←</button>
            <button type="button" class="face-right v8-extra" aria-label="Face right">→</button>`}
            <nav class="combat-actions" aria-label="Combat actions"><button type="button" class="relic-trigger" aria-expanded="false">Threadball</button><div class="relic-chooser" role="group" aria-label="Choose Relic" hidden></div><button type="button" class="fire-button">Fire</button></nav>
            <section class="combat-pause-sheet" aria-label="Paused Practice controls" aria-hidden="true" hidden>
                <strong>Practice paused</strong><button type="button" class="retry-button">Retry</button>
            </section>
            <div class="combat-message" aria-live="polite"></div>`;
        parent.appendChild(this.root);
        for (const relicId of RELIC_IDS) {
            const button = actionButton(this.element('.relic-chooser'), relicName(relicId), `relic-button relic-${relicId}`);
            button.dataset.relic = relicId;
            button.setAttribute('aria-label', `Select ${relicName(relicId)}`);
            button.addEventListener('click', () => {
                if (!this.canOffend()) return;
                this.chooserOpen = false;
                this.callbacks.onIntent({ type: 'select_relic', relicId });
            });
        }
        this.button('.relic-trigger').addEventListener('click', () => {
            if (!this.canOffend()) return; this.chooserOpen = !this.chooserOpen; this.refresh();
        });
        this.button('.fire-button').addEventListener('click', () => {
            if (!this.canOffend() || !this.snapshot.simulation.aim || this.input.phase !== 'aim_locked') return;
            this.callbacks.onIntent({ type: 'fire', aimId: this.snapshot.simulation.aimId });
        });
        if (!r1) {
        for (const [selector, direction] of [['.face-left', -1], ['.face-right', 1]] as const) {
            this.button(selector).addEventListener('click', () => {
                if (this.canMove() && !this.input.ownedPointer()) this.callbacks.onIntent({ type: 'face', direction });
            });
        }
        const jump = this.button('.jump-button');
        jump.addEventListener('pointerdown', (event) => {
            if (event.button > 0 || !this.canMove() || this.input.ownedPointer()) return;
            this.jumpPointer = event.pointerId;
            try { jump.setPointerCapture(event.pointerId); } catch {}
        });
        // Normal release commits one impulse; it must not send the movement-pad neutral barrier.
        jump.addEventListener('pointerup', (event) => {
            const owned = this.jumpPointer === event.pointerId;
            this.jumpPointer = undefined;
            if (owned && this.canMove() && !this.input.ownedPointer() && this.snapshot.simulation.units[0].grounded) {
                this.callbacks.onIntent({ type: 'jump' });
            }
            try { jump.releasePointerCapture(event.pointerId); } catch {}
        });
        for (const eventName of ['pointercancel', 'lostpointercapture']) jump.addEventListener(eventName, () => {
            if (this.jumpPointer === undefined) return;
            this.interrupt(); this.callbacks.onCancel();
        });
        }
        this.button('.pause-button').addEventListener('click', () => {
            if (this.canPause()) this.callbacks.onPause(!this.snapshot.paused);
        });
        this.button('.retry-button').addEventListener('click', () => {
            if (this.snapshot.paused) this.callbacks.onRetry?.();
        });
        this.button('.retry-button').hidden = !this.callbacks.onRetry;
        for (const [selector, actor] of [
            ['.camera-focus-player', 'player'], ['.camera-focus-loomkeeper', 'loomkeeper']
        ] as const) {
            const button = this.button(selector);
            button.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
            });
            button.addEventListener('click', (event) => {
                event.preventDefault(); event.stopPropagation();
                if (!button.hidden && !button.disabled) this.callbacks.onCameraFocus(actor);
            });
        }
        this.bindPad('movement'); this.bindPad('aim'); this.update(snapshot);
    }

    public update(snapshot: ChallengeSnapshotV8): void {
        this.snapshot = snapshot;
        if (this.input.synchronize(snapshot)) { this.direction = 0; this.jumpPointer = undefined; this.resetPads(); }
        this.input.syncAuthoritativeAim(snapshot.simulation.aim);
        this.unified?.observeGrounded(snapshot.simulation.units[0].grounded);
        this.refresh();
    }
    public setBusy(busy: boolean): void { this.busy = busy; this.refresh(); }
    public setSuspended(suspended: boolean): void {
        if (suspended && !this.suspended) this.interrupt();
        this.suspended = suspended; this.refresh();
    }
    public interrupt(): void {
        this.input.interrupt(); this.direction = 0; this.jumpPointer = undefined;
        this.chooserOpen = false; this.resetPads(); this.callbacks.onAimPreview(null); this.refresh();
    }
    public setMessage(message: string): void { this.element('.combat-message').textContent = message; }
    public setLayout(layout: CombatLayout): void {
        this.layout = layout;
        const extra = computeV8ExtraControls(layout);
        for (const [selector, rect] of [
            ['.movement-zone', layout.movementZone], ['.aim-zone', layout.aimZone],
            ['.combat-actions', layout.actionZone], ['.combat-status', layout.statusZone],
            ['.pause-button', layout.pauseZone], ['.jump-button', extra.jump],
            ['.face-left', extra.faceLeft], ['.face-right', extra.faceRight]
        ] as const) place(this.element(selector), rect);
        this.root.dataset.orientation = layout.orientation;
        this.root.dataset.battlefieldWidth = String(layout.battlefield.width);
        this.root.dataset.battlefieldHeight = String(layout.battlefield.height);
        this.root.dataset.battlefieldX = String(layout.battlefield.x);
        this.root.dataset.battlefieldY = String(layout.battlefield.y);
        this.root.dataset.worldScaleX = String(layout.worldScaleX);
    }
    public setUnitPositions(units: readonly SimulationUnit[]): void {
        if (!this.layout) return;
        const positions = computeActorStatusLayout(this.layout, units);
        placeOptional(this.element('.player-status'), positions.player);
        placeOptional(this.element('.loomkeeper-status'), positions.loomkeeper);
    }
    public setCameraFocusControls(options: {
        enabled: boolean;
        player: { direction: 'left' | 'right' | null; stitching: number };
        loomkeeper: { direction: 'left' | 'right' | null; stitching: number };
    }): void {
        for (const [selector, label, state] of [
            ['.camera-focus-player', 'Back to You', options.player],
            ['.camera-focus-loomkeeper', 'Loomkeeper', options.loomkeeper]
        ] as const) {
            const button = this.button(selector);
            const visible = options.enabled && state.direction !== null;
            button.hidden = !visible;
            button.disabled = !visible;
            if (!state.direction) continue;
            button.dataset.side = state.direction;
            const chevron = state.direction === 'left' ? '‹' : '›';
            const text = state.direction === 'left'
                ? `${chevron} ${label} · ${state.stitching} Stitching`
                : `${label} · ${state.stitching} Stitching ${chevron}`;
            if (button.textContent !== text) button.textContent = text;
            button.setAttribute('aria-label',
                `${label}, ${state.stitching} Stitching, off-screen ${state.direction}`);
        }
    }
    public destroy(): void { this.root.remove(); }

    public pollMovement(): void {
        if (!this.unified) return;
        const intent = this.unified.movementIntent(this.movementFacts(), performance.now());
        if (intent && this.callbacks.onIntent(intent) === true) this.unified.submittedMovementIntent(intent);
    }

    private movementFacts(): MovementFactsR1 {
        const state = this.snapshot.simulation;
        const usable = !this.suspended && !this.snapshot.paused && this.snapshot.status === 'active' &&
            state.activeActor === 'player' && (state.phase === 'action' || state.phase === 'retreat');
        const ready = usable && !this.busy && (this.callbacks.inputReady?.() ?? true);
        return { grounded: state.units[0].grounded, facing: state.units[0].facing,
            heldDirection: state.heldDirection,
            lane: ready ? 'ready' : usable ? this.callbacks.inputFlight?.() ?? 'blocked' : 'blocked' };
    }

    private bindPad(kind: 'movement' | 'aim'): void {
        const zone = this.element(`.${kind}-zone`);
        zone.addEventListener('pointerdown', (event) => {
            if (event.button > 0 || this.jumpPointer !== undefined ||
                !(kind === 'movement' ? this.canMove() : this.canOffend())) return;
            event.preventDefault();
            const point = this.point(event);
            if (this.unified && !(this.callbacks.inputReady?.() ?? true)) return;
            const acquired = this.unified && kind === 'movement'
                ? this.unified.beginMovement(event.pointerId, point, this.layout!.movementZone)
                : this.input.begin(kind, event.pointerId, point, 48);
            if (!acquired) return;
            try { zone.setPointerCapture(event.pointerId); } catch {}
            zone.style.setProperty('--pad-x', `${point.x - Number.parseFloat(zone.style.left)}px`);
            zone.style.setProperty('--pad-y', `${point.y - Number.parseFloat(zone.style.top)}px`);
            zone.classList.add('is-active'); this.refresh();
        });
        zone.addEventListener('pointermove', (event) => {
            const owner = this.input.ownedPointer();
            if (!owner || owner.id !== event.pointerId || owner.kind !== kind) return;
            event.preventDefault(); const point = this.point(event);
            if (this.unified && kind === 'movement') this.unified.moveMovement(event.pointerId, point, this.movementFacts(), performance.now());
            else this.input.move(event.pointerId, point);
            const dx = point.x - owner.origin.x; const dy = point.y - owner.origin.y;
            const factor = Math.min(1, owner.radius / (Math.hypot(dx, dy) || 1));
            zone.querySelector<HTMLElement>('.pad-knob')!.style.transform =
                `translate(calc(-50% + ${dx * factor}px), calc(-50% + ${dy * factor}px))`;
            if (kind === 'aim') this.callbacks.onAimPreview(this.input.aimIntent());
            else if (this.unified) this.pollMovement();
            else {
                const next = this.input.movementDirection();
                if (next !== this.direction) {
                    if (this.direction !== 0) {
                        // Direction reversal is a new gesture, never a queued post-barrier start.
                        this.interrupt(); this.callbacks.onCancel();
                    } else if (next !== 0 && !this.busy) {
                        this.direction = next; this.callbacks.onIntent({ type: 'walk_start', direction: next });
                    }
                }
            }
        });
        zone.addEventListener('pointerup', (event) => {
            const owner = this.input.ownedPointer();
            if (!owner || owner.id !== event.pointerId || owner.kind !== kind) return;
            event.preventDefault();
            if (kind === 'movement') {
                if (this.unified) {
                    // Up updates displacement history but cannot introduce a new hop/action.
                    this.unified.moveMovement(event.pointerId, this.point(event), { ...this.movementFacts(), lane: 'blocked' }, performance.now());
                    const result = this.unified.finishMovement(event.pointerId);
                    this.resetPads(); this.callbacks.onAimPreview(null);
                    if (result?.face) this.callbacks.onIntent({ type: 'face', direction: result.face });
                    else if (result?.release) this.callbacks.onRelease?.();
                } else {
                    this.input.releaseMovement(event.pointerId); this.interrupt(); this.callbacks.onCancel();
                }
            } else {
                this.input.move(event.pointerId, this.point(event));
                const rect = zone.getBoundingClientRect();
                const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
                    event.clientY >= rect.top && event.clientY <= rect.bottom;
                const command = this.input.end(event.pointerId, inside);
                this.resetPads();
                if (command?.type === 'aim') this.callbacks.onIntent(command);
                else { this.interrupt(); this.callbacks.onCancel(); }
            }
            try { zone.releasePointerCapture(event.pointerId); } catch {}
            this.refresh();
        });
        for (const name of ['pointercancel', 'lostpointercapture']) zone.addEventListener(name, (event: PointerEvent) => {
            if (this.input.ownedPointer()?.id !== event.pointerId) return;
            this.interrupt(); this.callbacks.onCancel();
        });
    }
    private canMove(): boolean {
        const s = this.snapshot.simulation;
        return !this.busy && !this.suspended && !this.snapshot.paused && this.snapshot.status === 'active' &&
            s.activeActor === 'player' && (s.phase === 'action' || s.phase === 'retreat');
    }
    private canOffend(): boolean {
        const s = this.snapshot.simulation;
        return this.canMove() && s.phase === 'action' && s.heldDirection === 0 &&
            this.input.ownedPointer()?.kind !== 'movement' &&
            [s.units[0], s.units[1]].every((unit) => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0);
    }
    private canPause(): boolean {
        return !this.busy && !this.suspended && this.snapshot.mode === 'practice' && this.snapshot.status === 'active' &&
            this.snapshot.simulation.activeActor === 'player' && this.snapshot.simulation.phase === 'action' &&
            [this.snapshot.simulation.units[0], this.snapshot.simulation.units[1]].every((unit) => unit.alive && unit.grounded);
    }
    private refresh(): void {
        const s = this.snapshot.simulation; const canMove = this.canMove(); const offense = this.canOffend();
        const phase = { action: 'Action', projectile: 'Cast in flight', settling: 'Settling',
            retreat: 'Retreat · movement only', finished: 'Clash complete' }[s.phase];
        this.element('.combat-turn').textContent = this.snapshot.paused ? 'Practice paused' :
            `${s.activeActor === 'player' ? 'Your' : 'Loomkeeper'} · ${phase}`;
        this.element('.combat-timer').textContent = s.phase === 'action' || s.phase === 'retreat'
            ? `${Math.max(0, Math.ceil((s.phaseDeadlineTick - s.tick) / 30))}s` : phase;
        Object.assign(this.root.dataset, { phase: this.input.phase, combatPhase: s.phase,
            simulationTick: String(s.tick), revision: String(s.revision), inputEpoch: String(s.inputEpoch),
            turn: String(s.turn), activeActor: s.activeActor, playerX: String(s.units[0].xFp / 256),
            playerY: String(s.units[0].yFp / 256), playerXFp: String(s.units[0].xFp),
            playerGrounded: String(s.units[0].grounded), playerFacing: s.units[0].facing < 0 ? 'left' : 'right',
            heldDirection: String(s.heldDirection), selectedRelic: s.selectedRelic,
            paused: String(this.snapshot.paused), suspended: String(this.suspended),
            commandControls: String(canMove), challengeId: this.snapshot.challengeId, mode: this.snapshot.mode });
        for (const [selector, unit] of [['.player-status', s.units[0]], ['.loomkeeper-status', s.units[1]]] as const) {
            this.element(selector).setAttribute('aria-label', `${unit.id === 'player' ? 'Player' : 'Loomkeeper'} Stitching ${unit.stitching} of 100`);
            this.element(`${selector} .unit-status-value`).textContent = String(unit.stitching);
        }
        this.element('.movement-zone').setAttribute('aria-disabled', String(!canMove));
        this.element('.aim-zone').setAttribute('aria-disabled', String(!offense));
        if (!this.unified) {
            this.button('.jump-button').disabled = !canMove || !s.units[0].grounded || Boolean(this.input.ownedPointer());
            this.button('.face-left').disabled = this.button('.face-right').disabled = !canMove || Boolean(this.input.ownedPointer());
        }
        this.button('.fire-button').disabled = !offense || !s.aim || this.input.phase !== 'aim_locked';
        this.button('.pause-button').disabled = !this.canPause();
        this.button('.pause-button').textContent = this.snapshot.paused ? 'Resume' : 'Pause';
        this.button('.pause-button').setAttribute('aria-label', this.snapshot.paused ? 'Resume Practice' : 'Pause Practice');
        const pauseSheet = this.element('.combat-pause-sheet');
        pauseSheet.hidden = !this.snapshot.paused;
        pauseSheet.setAttribute('aria-hidden', String(!this.snapshot.paused));
        this.button('.relic-trigger').disabled = !offense;
        this.button('.relic-trigger').textContent = relicName(s.selectedRelic);
        this.button('.relic-trigger').setAttribute('aria-expanded', String(this.chooserOpen));
        this.element('.relic-chooser').hidden = !this.chooserOpen || !offense;
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('.relic-button')) button.disabled = !offense;
    }
    private resetPads(): void {
        for (const zone of this.root.querySelectorAll<HTMLElement>('.combat-touch-zone')) {
            zone.classList.remove('is-active'); zone.style.removeProperty('--pad-x'); zone.style.removeProperty('--pad-y');
            zone.querySelector<HTMLElement>('.pad-knob')!.style.transform = 'translate(-50%, -50%)';
        }
    }
    private point(event: PointerEvent): { x: number; y: number } {
        const game = this.root.parentElement!;
        return clientPointToGame({ x: event.clientX, y: event.clientY }, game.getBoundingClientRect(), activeSidewaysMode());
    }
    private element(selector: string): HTMLElement { return this.root.querySelector<HTMLElement>(selector)!; }
    private button(selector: string): HTMLButtonElement { return this.root.querySelector<HTMLButtonElement>(selector)!; }
}

type CombatControlsCallbacks = {
    onCommand: (command: SimulationCommand) => void;
    onMovement: (direction: -1 | 1, steps: number) => void;
    onAimPreview: (aim: AimIntent | null) => void;
    onPauseChange: (paused: boolean) => void;
    onRetry: () => void;
    onFullscreenToggle: () => void;
};

export class CombatControls {
    public readonly input = new CombatInputController();
    public readonly root: HTMLDivElement;
    private readonly movementZone: HTMLDivElement;
    private readonly aimZone: HTMLDivElement;
    private readonly movementKnob: HTMLSpanElement;
    private readonly movementLabel: HTMLSpanElement;
    private readonly aimKnob: HTMLSpanElement;
    private readonly fireButton: HTMLButtonElement;
    private readonly pauseButton: HTMLButtonElement;
    private readonly retryButton: HTMLButtonElement;
    private readonly fullscreenButton: HTMLButtonElement;
    private readonly relicTrigger: HTMLButtonElement;
    private readonly relicChooser: HTMLElement;
    private readonly actions: HTMLElement;
    private readonly pauseSheet: HTMLElement;
    private readonly relicButtons = new Map<RelicId, HTMLButtonElement>();
    private readonly callbacks: CombatControlsCallbacks;
    private readonly status: HTMLElement;
    private readonly stitching: HTMLElement;
    private readonly timer: HTMLElement;
    private readonly playerStatus: HTMLElement;
    private readonly loomkeeperStatus: HTMLElement;
    private snapshot: ChallengeSnapshot;
    private layout?: CombatLayout;
    private paused = false;
    private suspended = false;
    private submitting = false;
    private presenting = false;
    private relicChooserOpen = false;
    private presentationStatus = '';
    private snapshotReceivedAt = performance.now();
    private readonly timerInterval: number;

    public constructor(
        parent: HTMLElement,
        snapshot: ChallengeSnapshot,
        callbacks: CombatControlsCallbacks
    ) {
        this.snapshot = snapshot;
        this.callbacks = callbacks;
        this.root = document.createElement('div');
        this.root.className = 'combat-ui';
        this.root.innerHTML = `
            <section class="combat-status">
                <strong class="combat-turn" aria-live="polite"></strong>
                <span class="combat-timer"></span>
                <span class="combat-stitching visually-hidden"></span>
            </section>
            <div class="combat-unit-status player-status" data-unit="player" role="group">
                <span class="unit-status-name">You</span>
                <strong class="unit-status-value"></strong>
                <span class="unit-status-track" aria-hidden="true"><span></span></span>
            </div>
            <div class="combat-unit-status loomkeeper-status" data-unit="loomkeeper" role="group">
                <span class="unit-status-name">Loomkeeper</span>
                <strong class="unit-status-value"></strong>
                <span class="unit-status-track" aria-hidden="true"><span></span></span>
            </div>
            <div class="combat-camera-hint" aria-live="polite" hidden></div>
            <button type="button" class="pause-button" aria-label="Pause Practice">Pause</button>
            <div class="combat-touch-zone movement-zone" role="group" aria-label="Movement pad">
                <span class="pad-label">Move</span><span class="pad-ring"></span><span class="pad-knob"></span>
            </div>
            <div class="combat-touch-zone aim-zone" role="group" aria-label="Aim and power pad">
                <span class="pad-label">Aim · release locks</span><span class="pad-ring"></span><span class="pad-knob"></span>
            </div>
            <nav class="combat-actions" aria-label="Combat actions"></nav>
            <section class="combat-pause-sheet" aria-label="Paused Practice controls" aria-hidden="true" hidden>
                <strong>Practice paused</strong>
                <span>Turn clock stopped</span>
                <div class="combat-pause-actions">
                    <button type="button" class="retry-button">Retry</button>
                    <button type="button" class="combat-fullscreen-button" aria-label="Enter full screen">Full screen</button>
                </div>
            </section>
            <div class="combat-message" aria-live="polite"></div>
        `;
        parent.appendChild(this.root);
        this.status = this.root.querySelector('.combat-turn');
        this.stitching = this.root.querySelector('.combat-stitching');
        this.timer = this.root.querySelector('.combat-timer');
        this.playerStatus = this.root.querySelector('.player-status');
        this.loomkeeperStatus = this.root.querySelector('.loomkeeper-status');
        this.fullscreenButton = this.root.querySelector('.combat-fullscreen-button');
        this.pauseButton = this.root.querySelector('.pause-button');
        this.retryButton = this.root.querySelector('.retry-button');
        this.pauseSheet = this.root.querySelector('.combat-pause-sheet');
        this.movementZone = this.root.querySelector('.movement-zone');
        this.aimZone = this.root.querySelector('.aim-zone');
        this.movementKnob = this.movementZone.querySelector('.pad-knob');
        this.movementLabel = this.movementZone.querySelector('.pad-label');
        this.aimKnob = this.aimZone.querySelector('.pad-knob');
        this.actions = this.root.querySelector('.combat-actions');

        this.relicTrigger = actionButton(this.actions, '', 'relic-trigger');
        this.relicTrigger.setAttribute('aria-haspopup', 'true');
        this.relicTrigger.setAttribute('aria-expanded', 'false');
        this.relicChooser = document.createElement('div');
        this.relicChooser.className = 'relic-chooser';
        this.relicChooser.setAttribute('role', 'group');
        this.relicChooser.setAttribute('aria-label', 'Choose Relic');
        this.relicChooser.hidden = true;
        this.actions.appendChild(this.relicChooser);

        for (const relicId of RELIC_IDS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `relic-button relic-${relicId}`;
            button.dataset.relic = relicId;
            const role = relicRole(relicId);
            button.setAttribute(
                'aria-label',
                `Select ${relicName(relicId)}, ${role.range} range, ${role.damage} maximum damage`
            );
            button.innerHTML = `<span class="relic-shape" aria-hidden="true"></span><small><span>${relicName(relicId)}</span><span class="relic-role">${role.label} · ${role.damage}</span></small>`;
            button.addEventListener('click', () => {
                if (!this.canSubmit()) return;
                this.relicChooserOpen = false;
                this.callbacks.onCommand({ type: 'select_relic', relicId });
                this.refresh();
            });
            this.relicChooser.appendChild(button);
            this.relicButtons.set(relicId, button);
        }
        this.fireButton = actionButton(this.actions, 'Fire', 'fire-button');
        this.relicTrigger.addEventListener('click', () => {
            if (!this.canSubmit()) return;
            this.relicChooserOpen = !this.relicChooserOpen;
            this.refresh();
        });
        this.fireButton.addEventListener('click', () => {
            if (!this.canSubmit() || !this.input.beginSubmission()) return;
            this.submitting = true;
            this.refresh();
            this.callbacks.onCommand({ type: 'fire' });
        });
        this.pauseButton.addEventListener('click', () => {
            if (this.canPause()) this.callbacks.onPauseChange(!this.paused);
        });
        this.retryButton.addEventListener('click', () => this.callbacks.onRetry());
        this.fullscreenButton.addEventListener('click', () => this.callbacks.onFullscreenToggle());
        this.bindPad(this.movementZone, 'movement');
        this.bindPad(this.aimZone, 'aim');
        this.update(snapshot);
        this.timerInterval = window.setInterval(() => this.refresh(), 250);
    }

    public setLayout(layout: CombatLayout): void {
        this.layout = layout;
        this.root.dataset.orientation = layout.orientation;
        this.root.dataset.battlefieldWidth = layout.battlefield.width.toFixed(2);
        this.root.dataset.battlefieldHeight = layout.battlefield.height.toFixed(2);
        this.root.dataset.battlefieldX = layout.battlefield.x.toFixed(2);
        this.root.dataset.battlefieldY = layout.battlefield.y.toFixed(2);
        this.root.dataset.worldScale = layout.worldScale.toFixed(4);
        this.root.dataset.worldScaleX = layout.worldScaleX.toFixed(4);
        place(this.movementZone, layout.movementZone);
        place(this.aimZone, layout.aimZone);
        place(this.actions, layout.actionZone);
        place(this.root.querySelector('.combat-status'), layout.statusZone);
        place(this.pauseButton, layout.pauseZone);
        this.positionUnitStatuses();
    }

    public setFullscreenState(available: boolean, active: boolean): void {
        this.root.dataset.fullscreenAvailable = String(available);
        this.root.dataset.fullscreen = String(active);
        this.fullscreenButton.textContent = active ? 'Exit full screen' : 'Full screen';
        this.fullscreenButton.setAttribute(
            'aria-label',
            active ? 'Exit full screen' : 'Enter full screen'
        );
        this.fullscreenButton.setAttribute('aria-pressed', String(active));
    }

    public setUnitPositions(units: readonly SimulationUnit[]): void {
        this.positionUnitStatuses(units);
    }

    public setCameraHint(direction: 'left' | 'right' | null): void {
        const hint = this.root.querySelector('.combat-camera-hint') as HTMLElement;
        hint.hidden = !direction;
        hint.textContent = direction === 'right'
            ? '← Swipe left to find Loomkeeper'
            : direction === 'left'
                ? 'Swipe right to find Loomkeeper →'
                : '';
        this.root.dataset.cameraHint = direction ?? 'none';
    }

    public update(snapshot: ChallengeSnapshot): void {
        this.snapshot = snapshot;
        this.snapshotReceivedAt = performance.now();
        this.syncPaused(snapshot.paused);
        if (!this.submitting) this.input.syncAuthoritativeAim(snapshot.simulation.aim);
        this.positionUnitStatuses();
        this.refresh();
    }

    public submissionFinished(accepted: boolean, authoritativeAimLocked: boolean): void {
        this.submitting = false;
        this.input.finishSubmission(accepted, authoritativeAimLocked);
        this.callbacks.onAimPreview(this.input.lockedAim);
        this.refresh();
    }

    public setBusy(busy: boolean): void {
        this.submitting = busy;
        this.refresh();
    }

    public setPresenting(phase: string | null, status = ''): void {
        this.presenting = Boolean(phase);
        this.presentationStatus = status;
        if (this.presenting) {
            this.input.cancel();
            this.resetPad(this.movementZone, this.movementKnob);
            this.resetPad(this.aimZone, this.aimKnob);
            this.relicChooserOpen = false;
        }
        if (phase) this.root.dataset.presentation = phase;
        else this.root.removeAttribute('data-presentation');
        this.root.dataset.presenting = String(this.presenting);
        this.refresh();
    }

    public clearAimLock(): void {
        this.input.clearAim();
        this.resetPad(this.aimZone, this.aimKnob);
        this.callbacks.onAimPreview(null);
        this.refresh();
    }

    public setConnectionSuspended(suspended: boolean): void {
        this.suspended = suspended;
        if (suspended) this.input.suspend();
        else if (!this.paused) this.input.resume();
        this.resetPad(this.movementZone, this.movementKnob);
        this.resetPad(this.aimZone, this.aimKnob);
        this.callbacks.onAimPreview(this.input.lockedAim);
        this.refresh();
    }

    public setMessage(message: string): void {
        const field = this.root.querySelector('.combat-message') as HTMLElement;
        field.textContent = message;
        field.hidden = !message;
    }

    public cancelTransient(): void {
        this.input.cancel();
        this.resetPad(this.movementZone, this.movementKnob);
        this.resetPad(this.aimZone, this.aimKnob);
        this.relicChooserOpen = false;
        this.callbacks.onAimPreview(this.input.lockedAim);
        this.refresh();
    }

    public destroy(): void {
        window.clearInterval(this.timerInterval);
        this.root.remove();
    }

    private bindPad(zone: HTMLDivElement, kind: 'movement' | 'aim'): void {
        const knob = kind === 'movement' ? this.movementKnob : this.aimKnob;
        zone.addEventListener('pointerdown', (event) => {
            if (!this.canSubmit() || event.button > 0) return;
            event.preventDefault();
            const width = Number.parseFloat(zone.style.width);
            const height = Number.parseFloat(zone.style.height);
            const radius = Math.max(48, Math.min(58, Math.min(width, height) * 0.36));
            const point = this.point(event);
            if (!this.input.begin(kind, event.pointerId, point, radius)) return;
            try { zone.setPointerCapture(event.pointerId); } catch {}
            this.setPadOrigin(zone, point);
            zone.classList.add('is-active');
            this.updateKnob(knob, 0, 0, radius);
            this.refresh();
        });
        zone.addEventListener('pointermove', (event) => {
            const owner = this.input.ownedPointer();
            if (!owner || owner.id !== event.pointerId || owner.kind !== kind) return;
            event.preventDefault();
            const pointer = this.point(event);
            this.input.move(event.pointerId, pointer);
            this.updateKnob(
                knob,
                pointer.x - owner.origin.x,
                pointer.y - owner.origin.y,
                owner.radius
            );
            if (kind === 'aim') this.callbacks.onAimPreview(this.input.aimIntent());
        });
        zone.addEventListener('pointerup', (event) => {
            const owner = this.input.ownedPointer();
            if (!owner || owner.id !== event.pointerId || owner.kind !== kind) return;
            event.preventDefault();
            this.input.move(event.pointerId, this.point(event));
            const movementSteps = kind === 'movement' ? this.input.movementSteps() : 0;
            const rect = zone.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
                event.clientY >= rect.top && event.clientY <= rect.bottom;
            // An acquired movement drag is bounded by movementSteps(), not by
            // the release coordinate. Aim retains release-inside fail safety.
            const command = this.input.end(event.pointerId, kind === 'movement' || inside);
            this.resetPad(zone, knob);
            if (kind === 'aim') {
                this.callbacks.onAimPreview(this.input.lockedAim);
            }
            this.refresh();
            if (command?.type === 'move') {
                if (command.direction && movementSteps > 0) {
                    this.callbacks.onMovement(command.direction, movementSteps);
                } else {
                    this.setMessage('Drag farther left or right to move');
                }
            } else if (command) this.callbacks.onCommand(command);
        });
        const cancel = (event: PointerEvent) => {
            if (!this.input.cancel(event.pointerId)) return;
            this.resetPad(zone, knob);
            if (kind === 'aim') this.callbacks.onAimPreview(this.input.lockedAim);
            this.refresh();
        };
        zone.addEventListener('pointercancel', cancel);
        zone.addEventListener('lostpointercapture', cancel);
    }

    private syncPaused(paused: boolean): void {
        const changed = this.paused !== paused;
        this.paused = paused;
        if (paused) this.input.suspend();
        else if (!this.suspended) this.input.resume();
        if (!changed) return;
        this.resetPad(this.movementZone, this.movementKnob);
        this.resetPad(this.aimZone, this.aimKnob);
        this.relicChooserOpen = false;
        this.callbacks.onAimPreview(this.input.lockedAim);
    }

    private canSubmit(): boolean {
        return !this.paused && !this.suspended && !this.submitting && !this.presenting &&
            this.snapshot.status === 'active' &&
            this.snapshot.simulation.phase === 'awaiting_command' &&
            this.snapshot.simulation.activeActor === 'player';
    }

    private canPause(): boolean {
        return !this.suspended && !this.submitting && !this.presenting &&
            this.snapshot.status === 'active' &&
            this.snapshot.simulation.phase === 'awaiting_command' &&
            this.snapshot.simulation.activeActor === 'player';
    }

    private refresh(): void {
        const simulation = this.snapshot.simulation;
        const player = simulation.units[0];
        const loomkeeper = simulation.units[1];
        const elapsedTicks = this.paused || this.suspended
            ? 0
            : Math.floor((performance.now() - this.snapshotReceivedAt) * SIM_RULES.tickRate / 1_000);
        const displayedTick = Math.min(simulation.turnDeadlineTick, simulation.tick + elapsedTicks);
        const seconds = Math.max(0, Math.ceil(
            (simulation.turnDeadlineTick - displayedTick) / SIM_RULES.tickRate
        ));
        const maximumMovementSteps = SIM_RULES.movementPerTurn / SIM_RULES.movementStep;
        const remainingMovementSteps = simulation.movementRemaining / SIM_RULES.movementStep;
        this.status.textContent = this.presentationStatus || (this.paused
            ? 'Practice paused'
            : simulation.activeActor === 'player' ? 'Your turn' : 'Loomkeeper weaving');
        this.stitching.textContent = `Player Stitching ${player.stitching}. Loomkeeper Stitching ${loomkeeper.stitching}.`;
        this.timer.textContent = `${seconds}s`;
        this.updateUnitStatus(this.playerStatus, 'Player', player.stitching);
        this.updateUnitStatus(this.loomkeeperStatus, 'Loomkeeper', loomkeeper.stitching);
        this.root.dataset.phase = this.input.phase;
        this.root.dataset.selectedRelic = simulation.selectedRelic;
        this.root.dataset.turn = String(simulation.turn);
        this.root.dataset.revision = String(this.snapshot.revision);
        this.root.dataset.simulationTick = String(simulation.tick);
        this.root.dataset.seed = String(simulation.seed);
        this.root.dataset.challengeId = this.snapshot.challengeId;
        this.root.dataset.mode = this.snapshot.mode;
        this.root.dataset.calling = this.snapshot.calling;
        this.root.dataset.paused = String(this.paused);
        this.root.dataset.suspended = String(this.suspended);
        this.root.dataset.presenting = String(this.presenting);
        this.root.dataset.activeActor = simulation.activeActor;
        this.root.dataset.playerX = String(player.x);
        this.root.dataset.playerFacing = player.facing < 0 ? 'left' : 'right';
        this.root.dataset.movementStepsRemaining = String(remainingMovementSteps);
        this.movementLabel.textContent = `Move ${remainingMovementSteps}/${maximumMovementSteps}`;
        this.movementZone.setAttribute(
            'aria-label',
            `Movement pad. ${remainingMovementSteps} of ${maximumMovementSteps} steps remaining.`
        );
        this.root.classList.toggle('is-paused', this.paused);
        const canSubmit = this.canSubmit();
        this.root.dataset.commandControls = String(canSubmit);
        if (!canSubmit) this.relicChooserOpen = false;
        for (const [relicId, button] of this.relicButtons) {
            button.disabled = !canSubmit;
            button.classList.toggle('is-selected', simulation.selectedRelic === relicId);
            button.setAttribute('aria-pressed', String(simulation.selectedRelic === relicId));
        }
        this.relicTrigger.disabled = !canSubmit;
        if (this.relicTrigger.dataset.relic !== simulation.selectedRelic) {
            this.relicTrigger.dataset.relic = simulation.selectedRelic;
            this.relicTrigger.className = `relic-trigger relic-${simulation.selectedRelic}`;
            this.relicTrigger.innerHTML = `<span class="relic-shape" aria-hidden="true"></span><small>${relicName(simulation.selectedRelic)}</small><span class="relic-caret" aria-hidden="true">⌃</span>`;
        }
        this.relicTrigger.setAttribute(
            'aria-label',
            `Choose Relic. ${relicName(simulation.selectedRelic)} selected`
        );
        this.relicTrigger.setAttribute('aria-expanded', String(this.relicChooserOpen));
        this.relicChooser.hidden = !this.relicChooserOpen;
        this.fireButton.disabled = !canSubmit || this.input.phase !== 'aim_locked';
        this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
        this.pauseButton.disabled = !this.canPause();
        this.pauseButton.setAttribute('aria-label', this.paused ? 'Resume Practice' : 'Pause Practice');
        this.pauseButton.setAttribute('aria-pressed', String(this.paused));
        this.retryButton.disabled = this.suspended || this.submitting || this.presenting;
        this.pauseSheet.hidden = !this.paused;
        this.pauseSheet.setAttribute('aria-hidden', String(!this.paused));
        this.movementZone.setAttribute('aria-disabled', String(!canSubmit));
        this.aimZone.setAttribute('aria-disabled', String(!canSubmit));
    }

    private updateKnob(knob: HTMLElement, dx: number, dy: number, radius: number): void {
        const length = Math.hypot(dx, dy) || 1;
        const factor = Math.min(1, radius / length);
        knob.style.transform = `translate(calc(-50% + ${dx * factor}px), calc(-50% + ${dy * factor}px))`;
    }

    private resetPad(zone: HTMLElement, knob: HTMLElement): void {
        zone.classList.remove('is-active');
        zone.style.removeProperty('--pad-x');
        zone.style.removeProperty('--pad-y');
        knob.style.transform = 'translate(-50%, -50%)';
    }

    private setPadOrigin(zone: HTMLElement, point: { x: number; y: number }): void {
        const left = Number.parseFloat(zone.style.left);
        const top = Number.parseFloat(zone.style.top);
        zone.style.setProperty('--pad-x', `${point.x - left}px`);
        zone.style.setProperty('--pad-y', `${point.y - top}px`);
    }

    private updateUnitStatus(element: HTMLElement, label: string, stitching: number): void {
        element.setAttribute('aria-label', `${label} Stitching ${stitching} of ${SIM_RULES.maximumStitching}`);
        const value = element.querySelector('.unit-status-value') as HTMLElement;
        const fill = element.querySelector('.unit-status-track span') as HTMLElement;
        value.textContent = String(stitching);
        fill.style.width = `${stitching / SIM_RULES.maximumStitching * 100}%`;
    }

    private positionUnitStatuses(
        units = this.snapshot.simulation.units as unknown as readonly SimulationUnit[]
    ): void {
        if (!this.layout) return;
        const positions = computeActorStatusLayout(this.layout, units);
        placeOptional(this.playerStatus, positions.player);
        placeOptional(this.loomkeeperStatus, positions.loomkeeper);
    }

    private point(event: PointerEvent): { x: number; y: number } {
        const game = document.getElementById('game');
        if (!game) return { x: event.clientX, y: event.clientY };
        return clientPointToGame(
            { x: event.clientX, y: event.clientY },
            game.getBoundingClientRect(),
            activeSidewaysMode()
        );
    }
}

function actionButton(parent: HTMLElement, label: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    parent.appendChild(button);
    return button;
}

function place(element: HTMLElement | null, rect: { x: number; y: number; width: number; height: number }): void {
    if (!element) return;
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
}

function placeOptional(
    element: HTMLElement | null,
    rect: { x: number; y: number; width: number; height: number } | undefined
): void {
    if (!element) return;
    element.hidden = !rect;
    if (rect) place(element, rect);
}

function relicName(relicId: RelicId): string {
    if (relicId === 'threadball') return 'Threadball';
    if (relicId === 'needlepoint') return 'Needlepoint';
    return 'Spoolburst';
}

function relicRole(relicId: RelicId): {
    range: 'short' | 'medium' | 'long';
    label: 'Short' | 'Medium' | 'Long';
    damage: 30 | 45 | 80;
} {
    if (relicId === 'threadball') return { range: 'medium', label: 'Medium', damage: 45 };
    if (relicId === 'needlepoint') return { range: 'long', label: 'Long', damage: 30 };
    return { range: 'short', label: 'Short', damage: 80 };
}
