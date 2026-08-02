import type { ChallengeSnapshot } from '../../../shared/protocol';
import {
    RELIC_IDS,
    SIM_RULES,
    type RelicId,
    type SimulationCommand,
    type SimulationUnit
} from '../../../shared/simulation';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import { CombatInputController } from './input';
import type { AimIntent } from './input';
import { computeActorStatusLayout, type CombatLayout } from './layout';

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
            button.setAttribute('aria-label', `Select ${relicName(relicId)}`);
            button.innerHTML = `<span class="relic-shape" aria-hidden="true"></span><small>${relicName(relicId)}</small>`;
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
        this.root.dataset.worldScale = layout.worldScale.toFixed(4);
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
            const command = this.input.end(event.pointerId, inside);
            this.resetPad(zone, knob);
            if (kind === 'aim') this.callbacks.onAimPreview(this.input.lockedAim);
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
        place(this.playerStatus, positions.player);
        place(this.loomkeeperStatus, positions.loomkeeper);
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

function relicName(relicId: RelicId): string {
    if (relicId === 'threadball') return 'Threadball';
    if (relicId === 'needlepoint') return 'Needlepoint';
    return 'Spoolburst';
}
