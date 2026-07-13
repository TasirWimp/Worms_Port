import type { ChallengeSnapshot } from '../../../shared/protocol';
import { RELIC_IDS, SIM_RULES, type RelicId, type SimulationCommand } from '../../../shared/simulation';
import { CombatInputController } from './input';
import type { AimIntent } from './input';
import type { CombatLayout } from './layout';

type CombatControlsCallbacks = {
    onCommand: (command: SimulationCommand) => void;
    onAimPreview: (aim: AimIntent | null) => void;
    onPauseChange: (paused: boolean) => void;
    onRetry: () => void;
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
    private readonly relicButtons = new Map<RelicId, HTMLButtonElement>();
    private readonly callbacks: CombatControlsCallbacks;
    private readonly status: HTMLElement;
    private readonly stitching: HTMLElement;
    private readonly timer: HTMLElement;
    private snapshot: ChallengeSnapshot;
    private paused = false;
    private suspended = false;
    private submitting = false;
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
            <section class="combat-status" aria-live="polite">
                <strong class="combat-turn"></strong>
                <span class="combat-stitching"></span>
                <span class="combat-timer"></span>
            </section>
            <div class="combat-touch-zone movement-zone" role="group" aria-label="Movement pad">
                <span class="pad-label">Move</span><span class="pad-ring"></span><span class="pad-knob"></span>
            </div>
            <div class="combat-touch-zone aim-zone" role="group" aria-label="Aim and power pad">
                <span class="pad-label">Aim · release to lock</span><span class="pad-ring"></span><span class="pad-knob"></span>
            </div>
            <nav class="combat-actions" aria-label="Combat actions"></nav>
            <div class="combat-message" aria-live="polite"></div>
        `;
        parent.appendChild(this.root);
        this.status = this.root.querySelector('.combat-turn');
        this.stitching = this.root.querySelector('.combat-stitching');
        this.timer = this.root.querySelector('.combat-timer');
        this.movementZone = this.root.querySelector('.movement-zone');
        this.aimZone = this.root.querySelector('.aim-zone');
        this.movementKnob = this.movementZone.querySelector('.pad-knob');
        this.aimKnob = this.aimZone.querySelector('.pad-knob');
        const actions = this.root.querySelector('.combat-actions') as HTMLElement;

        for (const relicId of RELIC_IDS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `relic-button relic-${relicId}`;
            button.dataset.relic = relicId;
            button.setAttribute('aria-label', `Select ${relicName(relicId)}`);
            button.innerHTML = `<span class="relic-shape" aria-hidden="true"></span><small>${relicName(relicId)}</small>`;
            button.addEventListener('click', () => {
                if (this.canSubmit()) this.callbacks.onCommand({ type: 'select_relic', relicId });
            });
            actions.appendChild(button);
            this.relicButtons.set(relicId, button);
        }
        this.fireButton = actionButton(actions, 'Fire', 'fire-button');
        this.pauseButton = actionButton(actions, 'Pause', 'pause-button');
        this.retryButton = actionButton(actions, 'Retry', 'retry-button');
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
        this.bindPad(this.movementZone, 'movement');
        this.bindPad(this.aimZone, 'aim');
        this.update(snapshot);
        this.timerInterval = window.setInterval(() => this.refresh(), 250);
    }

    public setLayout(layout: CombatLayout): void {
        this.root.dataset.orientation = layout.orientation;
        place(this.movementZone, layout.movementZone);
        place(this.aimZone, layout.aimZone);
        const actions = this.root.querySelector('.combat-actions') as HTMLElement;
        place(actions, layout.actionZone);
    }

    public update(snapshot: ChallengeSnapshot): void {
        this.snapshot = snapshot;
        this.snapshotReceivedAt = performance.now();
        this.syncPaused(snapshot.paused);
        if (!this.submitting) this.input.syncAuthoritativeAim(snapshot.simulation.aim);
        this.refresh();
    }

    public submissionFinished(accepted: boolean): void {
        this.submitting = false;
        this.input.finishSubmission(accepted, Boolean(this.snapshot.simulation.aim));
        this.refresh();
    }

    public setBusy(busy: boolean): void {
        this.submitting = busy;
        this.refresh();
    }

    public setConnectionSuspended(suspended: boolean): void {
        this.suspended = suspended;
        if (suspended) this.input.suspend();
        else if (!this.paused) this.input.resume();
        this.resetKnob(this.movementKnob);
        this.resetKnob(this.aimKnob);
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
        this.resetKnob(this.movementKnob);
        this.resetKnob(this.aimKnob);
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
            const rect = zone.getBoundingClientRect();
            const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.34);
            if (!this.input.begin(kind, event.pointerId, point(event), radius)) return;
            try { zone.setPointerCapture(event.pointerId); } catch {}
            this.updateKnob(knob, 0, 0, radius);
            this.refresh();
        });
        zone.addEventListener('pointermove', (event) => {
            const owner = this.input.ownedPointer();
            if (!owner || owner.id !== event.pointerId || owner.kind !== kind) return;
            event.preventDefault();
            this.input.move(event.pointerId, point(event));
            this.updateKnob(
                knob,
                event.clientX - owner.origin.x,
                event.clientY - owner.origin.y,
                owner.radius
            );
            if (kind === 'aim') this.callbacks.onAimPreview(this.input.aimIntent());
        });
        zone.addEventListener('pointerup', (event) => {
            const owner = this.input.ownedPointer();
            if (!owner || owner.id !== event.pointerId || owner.kind !== kind) return;
            event.preventDefault();
            this.input.move(event.pointerId, point(event));
            const rect = zone.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
                event.clientY >= rect.top && event.clientY <= rect.bottom;
            const command = this.input.end(event.pointerId, inside);
            this.resetKnob(knob);
            if (kind === 'aim') this.callbacks.onAimPreview(this.input.lockedAim);
            this.refresh();
            if (command) this.callbacks.onCommand(command);
        });
        const cancel = (event: PointerEvent) => {
            if (!this.input.cancel(event.pointerId)) return;
            this.resetKnob(knob);
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
        this.resetKnob(this.movementKnob);
        this.resetKnob(this.aimKnob);
        this.callbacks.onAimPreview(this.input.lockedAim);
    }

    private canSubmit(): boolean {
        return !this.paused && !this.suspended && !this.submitting &&
            this.snapshot.status === 'active' &&
            this.snapshot.simulation.phase === 'awaiting_command' &&
            this.snapshot.simulation.activeActor === 'player';
    }

    private canPause(): boolean {
        return !this.suspended && !this.submitting &&
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
        this.status.textContent = this.paused
            ? 'Practice paused'
            : simulation.activeActor === 'player' ? 'Your turn' : 'Loomkeeper weaving';
        this.stitching.textContent = `Stitching ${player.stitching} · ${loomkeeper.stitching}`;
        this.timer.textContent = `${seconds}s`;
        this.root.dataset.phase = this.input.phase;
        this.root.dataset.selectedRelic = simulation.selectedRelic;
        this.root.dataset.turn = String(simulation.turn);
        this.root.dataset.revision = String(this.snapshot.revision);
        this.root.dataset.simulationTick = String(simulation.tick);
        this.root.dataset.challengeId = this.snapshot.challengeId;
        this.root.dataset.calling = this.snapshot.calling;
        this.root.dataset.paused = String(this.paused);
        this.root.dataset.suspended = String(this.suspended);
        this.root.dataset.activeActor = simulation.activeActor;
        this.root.dataset.playerX = String(player.x);
        this.root.classList.toggle('is-paused', this.paused);
        const canSubmit = this.canSubmit();
        for (const [relicId, button] of this.relicButtons) {
            button.disabled = !canSubmit;
            button.classList.toggle('is-selected', simulation.selectedRelic === relicId);
            button.setAttribute('aria-pressed', String(simulation.selectedRelic === relicId));
        }
        this.fireButton.disabled = !canSubmit || this.input.phase !== 'aim_locked';
        this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
        this.pauseButton.disabled = !this.canPause();
        this.pauseButton.setAttribute('aria-pressed', String(this.paused));
        this.retryButton.disabled = this.suspended || this.submitting;
        this.movementZone.setAttribute('aria-disabled', String(!canSubmit));
        this.aimZone.setAttribute('aria-disabled', String(!canSubmit));
    }

    private updateKnob(knob: HTMLElement, dx: number, dy: number, radius: number): void {
        const length = Math.hypot(dx, dy) || 1;
        const factor = Math.min(1, radius / length);
        knob.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
    }

    private resetKnob(knob: HTMLElement): void {
        knob.style.transform = 'translate(0px, 0px)';
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

function point(event: PointerEvent): { x: number; y: number } {
    return { x: event.clientX, y: event.clientY };
}

function place(element: HTMLElement, rect: { x: number; y: number; width: number; height: number }): void {
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
