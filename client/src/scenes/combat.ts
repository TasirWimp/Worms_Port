import Phaser from 'phaser';

import type { ChallengeResult, ChallengeSnapshot } from '../../../shared/protocol';
import {
    cloneSimulation,
    type SimulationCommand,
    type SimulationState
} from '../../../shared/simulation';
import { CombatControls } from '../combat/controls';
import { preloadApprovedCombatAssets } from '../combat/approved-assets';
import type { CombatSceneArgs, SafeAreaInsets } from '../combat/contracts';
import { createCombatFixture } from '../combat/fixture';
import { canRequestFullscreen, toggleGameFullscreen } from '../combat/fullscreen';
import { activeSidewaysMode } from '../lib/sideways';
import { computeCombatLayout, type CombatLayout } from '../combat/layout';
import {
    planCombatPresentation,
    presentationLabel,
    type CombatPresentationStep
} from '../combat/presentation';
import { trajectoryPreview } from '../combat/preview';
import { CombatRenderer, type CombatVisualPhase } from '../combat/renderer';

const MAX_PRESENTATION_SNAPSHOTS = 32;

export default class CombatScene extends Phaser.Scene {
    private args: CombatSceneArgs;
    private snapshot: ChallengeSnapshot;
    private authoritativeSnapshot: ChallengeSnapshot;
    private combatRenderer: CombatRenderer;
    private controls: CombatControls;
    private layout: CombatLayout;
    private renderState: SimulationState;
    private preview: { x: number; y: number }[] = [];
    private projectileTrace: { x: number; y: number }[] = [];
    private visualPhase?: CombatVisualPhase;
    private readonly snapshotQueue: ChallengeSnapshot[] = [];
    private pendingResult?: ChallengeResult;
    private pendingCommand = false;
    private presenting = false;
    private transitioning = false;
    private fullscreenUnavailable = false;
    private presentationEpoch = 0;
    private readonly unsubscribers: (() => void)[] = [];

    public constructor() {
        super({ key: 'combat' });
        this.onResize = this.onResize.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
        this.onWindowBlur = this.onWindowBlur.bind(this);
        this.onVisibility = this.onVisibility.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
        this.shutdown = this.shutdown.bind(this);
    }

    public init(args?: CombatSceneArgs): void {
        this.args = args?.snapshot ? args : createCombatFixture();
        this.snapshot = structuredClone(this.args.snapshot);
        this.authoritativeSnapshot = structuredClone(this.args.snapshot);
        this.renderState = cloneSimulation(this.snapshot.simulation as SimulationState);
        this.preview = [];
        this.projectileTrace = [];
        this.visualPhase = undefined;
        this.snapshotQueue.splice(0);
        this.pendingResult = undefined;
        this.pendingCommand = false;
        this.presenting = false;
        this.transitioning = false;
        this.fullscreenUnavailable = false;
        this.presentationEpoch += 1;
    }

    public create(): void {
        const parent = document.getElementById('game');
        if (!parent) throw new Error('Combat scene requires the #game host.');
        this.combatRenderer = new CombatRenderer(this);
        this.controls = new CombatControls(parent, this.snapshot, {
            onCommand: (command) => void this.submit(command),
            onMovement: (direction, steps) => void this.submitMovement(direction, steps),
            onAimPreview: (aim) => {
                this.preview = aim
                    ? trajectoryPreview(this.snapshot.simulation as SimulationState, aim)
                    : [];
                this.render();
            },
            onPauseChange: (paused) => void this.setPaused(paused),
            onRetry: () => void this.retry(),
            onFullscreenToggle: () => void this.toggleFullscreen()
        });
        this.controls.root.dataset.visualAssets = this.combatRenderer.assetState;
        this.controls.setFullscreenState(
            !activeSidewaysMode() && canRequestFullscreen(),
            Boolean(document.fullscreenElement)
        );
        if (this.args.previewLabel) {
            this.controls.root.dataset.preview = this.args.previewLabel;
            this.controls.setMessage(this.args.previewLabel);
        }
        this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
        window.addEventListener('resize', this.onViewportChange);
        window.addEventListener('orientationchange', this.onViewportChange);
        window.visualViewport?.addEventListener('resize', this.onViewportChange);
        window.visualViewport?.addEventListener('scroll', this.onViewportChange);
        window.addEventListener('blur', this.onWindowBlur);
        window.addEventListener('nimble-knots:wallet-boundary', this.onWindowBlur);
        document.addEventListener('visibilitychange', this.onVisibility);
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
        if (this.args.onSnapshot) {
            this.unsubscribers.push(this.args.onSnapshot((snapshot) => this.acceptSnapshot(snapshot)));
        }
        if (this.args.onResult) {
            this.unsubscribers.push(this.args.onResult((result) => this.showResult(result)));
        }
        if (this.args.onConnection) {
            this.unsubscribers.push(this.args.onConnection((state) => {
                const reconnecting = state === 'reconnecting';
                if (reconnecting) this.interruptPresentation();
                this.controls.setConnectionSuspended(reconnecting);
                this.controls.setMessage(reconnecting
                    ? 'Reconnecting · controls are safely suspended'
                    : this.snapshot.paused ? 'Practice paused · turn clock stopped' : '');
            }));
        }
        if (this.args.onUnavailable) {
            this.unsubscribers.push(this.args.onUnavailable((message) => {
                if (this.transitioning) return;
                this.transitioning = true;
                this.scene.start('result', {
                    calling: this.snapshot.calling,
                    rewarded: this.snapshot.mode === 'reward',
                    message
                });
            }));
        }
        if (this.args.onError) {
            this.unsubscribers.push(this.args.onError((message) => this.controls.setMessage(message)));
        }
        this.onResize();
    }

    public preload(): void {
        preloadApprovedCombatAssets(this);
    }

    private async submit(command: SimulationCommand): Promise<void> {
        if (this.pendingCommand) return;
        if (this.authoritativeSnapshot.simulation.activeActor !== 'player' ||
            this.authoritativeSnapshot.simulation.phase !== 'awaiting_command') return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        this.controls.root.dataset.lastCommand = command.type;
        if (command.type === 'fire') {
            this.preview = [];
            this.render();
        }
        try {
            const next = await this.args.submitCommand(
                command,
                this.authoritativeSnapshot.simulation.turn
            );
            this.acceptSnapshot(next);
            this.controls.setMessage('');
            this.controls.submissionFinished(true, Boolean(next.simulation.aim));
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Command failed.');
            this.controls.submissionFinished(
                false,
                Boolean(this.authoritativeSnapshot.simulation.aim)
            );
        } finally {
            this.pendingCommand = false;
            this.controls.setBusy(false);
        }
    }

    private async submitMovement(direction: -1 | 1, requestedSteps: number): Promise<void> {
        if (this.pendingCommand || this.presenting) return;
        if (this.authoritativeSnapshot.simulation.activeActor !== 'player' ||
            this.authoritativeSnapshot.simulation.phase !== 'awaiting_command') return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        this.controls.root.dataset.lastCommand = 'move';
        this.controls.clearAimLock();
        this.preview = [];
        let acceptedSteps = 0;
        try {
            for (let index = 0; index < Math.min(4, requestedSteps); index += 1) {
                const basis = this.authoritativeSnapshot;
                if (basis.simulation.activeActor !== 'player' ||
                    basis.simulation.phase !== 'awaiting_command') break;
                const beforeX = basis.simulation.units[0].x;
                const next = await this.args.submitCommand(
                    { type: 'move', direction },
                    basis.simulation.turn
                );
                this.acceptSnapshot(next);
                if (next.simulation.units[0].x === beforeX) break;
                acceptedSteps += 1;
            }
            this.controls.setMessage(acceptedSteps > 0
                ? `Moved ${direction < 0 ? 'left' : 'right'} · aim again`
                : 'The Knotkin could not move farther');
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Movement failed.');
        } finally {
            this.pendingCommand = false;
            this.controls.setBusy(false);
        }
    }

    private async setPaused(paused: boolean): Promise<void> {
        if (this.pendingCommand || !this.args.setPaused) return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        try {
            const next = await this.args.setPaused(paused);
            this.acceptSnapshot(next);
            this.controls.setMessage(paused
                ? 'Practice paused · turn clock stopped'
                : 'Practice resumed');
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Pause request failed.');
        } finally {
            this.pendingCommand = false;
            this.controls.setBusy(false);
        }
    }

    private async retry(): Promise<void> {
        if (this.pendingCommand || !this.args.retry) return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        try {
            const next = await this.args.retry();
            this.preview = [];
            this.acceptSnapshot(next);
            this.controls.root.removeAttribute('data-last-command');
            this.controls.setMessage('Fresh Practice Clash started');
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Retry failed.');
        } finally {
            this.pendingCommand = false;
            this.controls.setBusy(false);
        }
    }

    private acceptSnapshot(next: ChallengeSnapshot): void {
        if (next.simulation.rulesetId !== 'nimble-knots-artillery-v2') {
            this.controls?.setMessage('Combat scene accepts only v2 challenge snapshots.');
            return;
        }
        const current = this.authoritativeSnapshot;
        if (next.challengeId === current.challengeId && next.revision < current.revision) {
            return;
        }
        if (next.challengeId === current.challengeId && next.revision === current.revision) return;
        this.authoritativeSnapshot = structuredClone(next);
        if (!this.controls) return;
        if (next.challengeId !== this.snapshot.challengeId) {
            this.resetForChallenge(next);
            return;
        }
        const queued = this.snapshotQueue.at(-1);
        if (queued?.challengeId === next.challengeId && queued.revision >= next.revision) return;
        if (queued && planCombatPresentation(queued, next, false).length === 0) {
            this.snapshotQueue[this.snapshotQueue.length - 1] = structuredClone(next);
            return;
        }
        if (this.snapshotQueue.length >= MAX_PRESENTATION_SNAPSHOTS) {
            this.interruptPresentation();
            this.controls.setMessage('Caught up to the current authoritative turn');
            return;
        }
        this.snapshotQueue.push(structuredClone(next));
        void this.processPresentationQueue();
    }

    private showResult(result: ChallengeResult): void {
        if (this.transitioning || result.challengeId !== this.authoritativeSnapshot.challengeId) return;
        this.pendingResult = structuredClone(result);
        this.maybeShowResult();
    }

    private maybeShowResult(): void {
        const result = this.pendingResult;
        if (!result || this.presenting || this.snapshotQueue.length > 0 ||
            result.challengeId !== this.snapshot.challengeId || this.transitioning) return;
        this.transitioning = true;
        this.pendingResult = undefined;
        this.scene.start('result', {
            result,
            calling: this.snapshot.calling,
            rewarded: this.snapshot.mode === 'reward'
        });
    }

    private onResize(): void {
        const width = this.scale.width;
        const height = this.scale.height;
        this.layout = computeCombatLayout(width, height, readSafeArea());
        this.controls.setLayout(this.layout);
        this.controls.cancelTransient();
        this.render();
    }

    private onViewportChange(): void {
        this.controls.cancelTransient();
        this.controls.setFullscreenState(
            !activeSidewaysMode() && !this.fullscreenUnavailable && canRequestFullscreen(),
            Boolean(document.fullscreenElement)
        );
        window.requestAnimationFrame(() => {
            if (!this.scene.isActive()) return;
            const host = document.getElementById('game');
            if (!host) return;
            const width = host.clientWidth;
            const height = host.clientHeight;
            if (this.scale.width !== width || this.scale.height !== height) {
                this.scale.resize(width, height);
            }
            this.onResize();
        });
    }

    private onWindowBlur(): void {
        this.controls.cancelTransient();
    }

    private onVisibility(): void {
        if (document.hidden) this.controls.cancelTransient();
    }

    private async toggleFullscreen(): Promise<void> {
        const outcome = await toggleGameFullscreen();
        if (outcome.status === 'unsupported') {
            this.fullscreenUnavailable = true;
            this.controls.setFullscreenState(false, false);
            this.controls.setMessage('Full screen is not supported by this app host');
        } else if (outcome.status === 'rejected') {
            this.controls.setMessage('Full screen was blocked by this app host');
        } else if (outcome.status === 'entered') {
            this.controls.setMessage('Full screen active · use Exit full screen or Back to leave');
        } else {
            this.controls.setMessage('Full screen closed');
        }
        this.onFullscreenChange();
    }

    private onFullscreenChange(): void {
        this.controls.setFullscreenState(
            !activeSidewaysMode() && !this.fullscreenUnavailable && canRequestFullscreen(),
            Boolean(document.fullscreenElement)
        );
        this.onViewportChange();
    }

    private render(): void {
        if (!this.layout || !this.combatRenderer) return;
        this.controls.root.dataset.previewPoints = String(this.preview.length);
        this.controls.root.dataset.projectilePoints = String(this.projectileTrace.length);
        this.controls.setUnitPositions(this.renderState.units);
        this.combatRenderer.render(
            this.renderState,
            this.layout,
            this.preview,
            this.projectileTrace,
            this.visualPhase
        );
    }

    private shutdown(): void {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('orientationchange', this.onViewportChange);
        window.visualViewport?.removeEventListener('resize', this.onViewportChange);
        window.visualViewport?.removeEventListener('scroll', this.onViewportChange);
        window.removeEventListener('blur', this.onWindowBlur);
        window.removeEventListener('nimble-knots:wallet-boundary', this.onWindowBlur);
        document.removeEventListener('visibilitychange', this.onVisibility);
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
        this.presentationEpoch += 1;
        this.snapshotQueue.splice(0);
        this.controls?.destroy();
        this.combatRenderer?.destroy();
    }

    private async processPresentationQueue(): Promise<void> {
        if (this.presenting) return;
        this.presenting = true;
        const epoch = this.presentationEpoch;
        try {
            while (this.snapshotQueue.length > 0 && epoch === this.presentationEpoch) {
                const next = this.snapshotQueue.shift()!;
                await this.presentSnapshot(next, epoch);
            }
        } finally {
            if (epoch !== this.presentationEpoch) return;
            this.presenting = false;
            this.controls.setPresenting(null);
            this.maybeShowResult();
        }
    }

    private async presentSnapshot(next: ChallengeSnapshot, epoch: number): Promise<void> {
        const previous = this.snapshot;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const steps = planCombatPresentation(previous, next, reducedMotion);
        if (steps.length === 0) {
            this.commitPresentedSnapshot(next, false);
            return;
        }
        const working = cloneSimulation(previous.simulation as SimulationState);
        working.selectedRelic = next.simulation.selectedRelic;
        const playerMoved = previous.simulation.units[0].x !== next.simulation.units[0].x ||
            previous.simulation.units[0].y !== next.simulation.units[0].y;

        for (const step of steps) {
            if (epoch !== this.presentationEpoch) return;
            this.controls.setPresenting(step.phase, presentationLabel(step));
            this.controls.root.removeAttribute('data-visual-stage');
            this.controls.root.removeAttribute('data-projectile-visual');
            if (step.kind === 'movement') {
                await this.presentMovement(working, step, epoch, reducedMotion);
            } else if (step.kind === 'aim') {
                this.renderState = cloneSimulation(working);
                this.preview = step.trace.map((point) => ({ ...point }));
                this.projectileTrace = [];
                this.visualPhase = undefined;
                this.render();
                await this.waitForPresentation(step.durationMs, epoch);
            } else if (step.kind === 'cast-charge') {
                this.renderState = cloneSimulation(working);
                this.preview = [];
                this.projectileTrace = [];
                this.visualPhase = {
                    kind: 'cast-charge',
                    actor: step.actor,
                    relicId: step.relicId,
                    trace: step.trace.map((point) => ({ ...point }))
                };
                this.render();
                await this.waitForPresentation(step.durationMs, epoch);
            } else if (step.kind === 'cast-formation') {
                await this.presentCastFormation(working, step, epoch);
            } else if (step.kind === 'projectile') {
                this.preview = [];
                this.controls.root.dataset.projectileVisual = step.relicId === 'threadball' &&
                    this.combatRenderer.assetState === 'approved-runtime-copies'
                    ? 'threadball'
                    : `generic-${step.relicId}`;
                await this.presentProjectile(working, step, epoch, reducedMotion);
            } else {
                this.renderState = cloneSimulation(next.simulation as SimulationState);
                this.preview = [];
                this.projectileTrace = next.simulation.lastProjectile?.trace.map(
                    (point) => ({ ...point })
                ) ?? [];
                this.visualPhase = {
                    kind: 'impact',
                    actor: step.actor,
                    relicId: next.simulation.lastProjectile && 'relicId' in next.simulation.lastProjectile
                        ? next.simulation.lastProjectile.relicId
                        : 'threadball',
                    trace: this.projectileTrace.map((point) => ({ ...point }))
                };
                this.controls.update(next);
                this.render();
                await this.waitForPresentation(step.durationMs, epoch);
            }
        }
        if (epoch === this.presentationEpoch) this.commitPresentedSnapshot(next, playerMoved);
    }

    private async presentMovement(
        working: SimulationState,
        step: Extract<CombatPresentationStep, { kind: 'movement' }>,
        epoch: number,
        reducedMotion: boolean
    ): Promise<void> {
        const frames = reducedMotion ? 2 : 8;
        const unit = working.units[step.actor === 'player' ? 0 : 1];
        for (let frame = 1; frame <= frames; frame += 1) {
            unit.x = Math.round(step.from.x + (step.to.x - step.from.x) * frame / frames);
            unit.y = Math.round(step.from.y + (step.to.y - step.from.y) * frame / frames);
            this.renderState = cloneSimulation(working);
            this.preview = [];
            this.projectileTrace = [];
            this.visualPhase = undefined;
            this.render();
            await this.waitForPresentation(step.durationMs / frames, epoch);
            if (epoch !== this.presentationEpoch) return;
        }
    }

    private async presentProjectile(
        working: SimulationState,
        step: Extract<CombatPresentationStep, { kind: 'projectile' }>,
        epoch: number,
        reducedMotion: boolean
    ): Promise<void> {
        const frames = reducedMotion ? 3 : Math.min(12, Math.max(6, step.trace.length));
        this.renderState = cloneSimulation(working);
        for (let frame = 1; frame <= frames; frame += 1) {
            const points = Math.max(2, Math.ceil(step.trace.length * frame / frames));
            this.projectileTrace = step.trace.slice(0, points).map((point) => ({ ...point }));
            this.visualPhase = {
                kind: 'projectile',
                actor: step.actor,
                relicId: step.relicId,
                trace: this.projectileTrace.map((point) => ({ ...point }))
            };
            this.render();
            await this.waitForPresentation(step.durationMs / frames, epoch);
            if (epoch !== this.presentationEpoch) return;
        }
    }

    private async presentCastFormation(
        working: SimulationState,
        step: Extract<CombatPresentationStep, { kind: 'cast-formation' }>,
        epoch: number
    ): Promise<void> {
        this.renderState = cloneSimulation(working);
        this.preview = [];
        this.projectileTrace = [];
        this.visualPhase = {
            kind: 'cast-formation',
            actor: step.actor,
            relicId: step.relicId,
            stage: 'start',
            trace: step.trace.map((point) => ({ ...point }))
        };
        this.controls.root.dataset.visualStage = 'formation-start';
        this.render();
        await this.waitForPresentation(step.durationMs * 0.45, epoch);
        if (epoch !== this.presentationEpoch) return;
        this.visualPhase = {
            kind: 'cast-formation',
            actor: step.actor,
            relicId: step.relicId,
            stage: 'ready',
            trace: step.trace.map((point) => ({ ...point }))
        };
        this.controls.root.dataset.visualStage = 'formation-ready';
        this.render();
        await this.waitForPresentation(step.durationMs * 0.55, epoch);
    }

    private commitPresentedSnapshot(next: ChallengeSnapshot, clearAim: boolean): void {
        this.snapshot = structuredClone(next);
        this.renderState = cloneSimulation(next.simulation as SimulationState);
        this.projectileTrace = [];
        this.visualPhase = undefined;
        this.controls.root.removeAttribute('data-visual-stage');
        this.controls.root.removeAttribute('data-projectile-visual');
        this.controls.update(this.snapshot);
        if (clearAim) this.controls.clearAimLock();
        this.preview = this.controls.input.lockedAim && !this.snapshot.paused &&
            this.snapshot.status === 'active' &&
            this.snapshot.simulation.activeActor === 'player'
            ? trajectoryPreview(this.renderState, this.controls.input.lockedAim)
            : [];
        this.render();
    }

    private resetForChallenge(next: ChallengeSnapshot): void {
        this.presentationEpoch += 1;
        this.snapshotQueue.splice(0);
        this.presenting = false;
        this.transitioning = false;
        this.pendingResult = undefined;
        this.snapshot = structuredClone(next);
        this.authoritativeSnapshot = structuredClone(next);
        this.renderState = cloneSimulation(next.simulation as SimulationState);
        this.preview = [];
        this.projectileTrace = [];
        this.visualPhase = undefined;
        this.controls.root.removeAttribute('data-visual-stage');
        this.controls.root.removeAttribute('data-projectile-visual');
        this.controls.setPresenting(null);
        this.controls.update(this.snapshot);
        this.controls.clearAimLock();
        this.render();
    }

    private interruptPresentation(): void {
        this.presentationEpoch += 1;
        this.snapshotQueue.splice(0);
        this.presenting = false;
        this.snapshot = structuredClone(this.authoritativeSnapshot);
        this.renderState = cloneSimulation(
            this.authoritativeSnapshot.simulation as SimulationState
        );
        this.preview = [];
        this.projectileTrace = [];
        this.visualPhase = undefined;
        this.controls.root.removeAttribute('data-visual-stage');
        this.controls.root.removeAttribute('data-projectile-visual');
        this.controls?.setPresenting(null);
        this.controls?.update(this.snapshot);
        this.render();
    }

    private waitForPresentation(durationMs: number, epoch: number): Promise<void> {
        return new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), Math.max(0, durationMs));
        }).then(() => {
            if (epoch !== this.presentationEpoch) return;
        });
    }
}

function readSafeArea(): SafeAreaInsets {
    const style = getComputedStyle(document.documentElement);
    return {
        top: cssPixels(style.getPropertyValue('--safe-area-top')),
        right: cssPixels(style.getPropertyValue('--safe-area-right')),
        bottom: cssPixels(style.getPropertyValue('--safe-area-bottom')),
        left: cssPixels(style.getPropertyValue('--safe-area-left'))
    };
}

function cssPixels(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
