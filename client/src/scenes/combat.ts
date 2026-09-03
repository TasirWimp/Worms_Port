import Phaser from 'phaser';

import type { ChallengeResult, ChallengeSnapshot } from '../../../shared/protocol';
import {
    LATEST_RULESET_ID,
    V6_RULESET_ID,
    V7_RULESET_ID,
    cloneSimulation,
    type SimulationCommand,
    type SimulationActor,
    type SimulationState
} from '../../../shared/simulation';
import { CombatControls, ActionTurnsControls } from '../combat/controls';
import type { AimIntent } from '../combat/input';
import {
    WIZARD_UNRAVEL_DURATION_MS,
    createApprovedWizardAnimations,
    preloadApprovedCombatAssets
} from '../combat/approved-assets';
import type { CombatSceneArgs, LegacyCombatSceneArgs, CombatSceneArgsV8, SafeAreaInsets } from '../combat/contracts';
import { createCombatFixture, createActionTurnsV8Fixture } from '../combat/fixture';
import type { ChallengeSnapshotV8Runtime as ChallengeSnapshotV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';
import { canRequestFullscreen, toggleGameFullscreen } from '../combat/fullscreen';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import {
    cameraDirectionToWorldX,
    cameraForActor,
    clampCombatCamera,
    createCombatCamera,
    createCombatOverviewCamera,
    focusCombatCamera,
    interpolateCombatCamera,
    panCombatCamera,
    revealCombatCameraPoint,
    type CombatCamera
} from '../combat/camera';
import { computeCombatLayout, type CombatLayout } from '../combat/layout';
import {
    planCombatPresentation,
    presentationLabel,
    V8SnapshotBuffer,
    projectCombatV8,
    type CombatPresentationStep
} from '../combat/presentation';
import { trajectoryPreview, trajectoryPreviewV8 } from '../combat/preview';
import { CombatRenderer, type CombatVisualPhase } from '../combat/renderer';

const MAX_PRESENTATION_SNAPSHOTS = 32;
const OPENING_CAMERA_DURATION_MS = 3_000;
const AUTOMATIC_CAMERA_FOCUS_DURATION_MS = 650;

type CameraTransition = Readonly<{
    kind: 'opening' | 'focus';
    from: CombatCamera;
    to: CombatCamera;
    startedAt: number;
    durationMs: number;
}>;

export default class CombatScene extends Phaser.Scene {
    private args: LegacyCombatSceneArgs;
    private v8Args?: CombatSceneArgsV8;
    private v8Preview?: 'v8' | 'v8-r1';
    private initializationGeneration = 0;
    private snapshot: ChallengeSnapshot;
    private authoritativeSnapshot: ChallengeSnapshot;
    private combatRenderer: CombatRenderer;
    private controls: CombatControls;
    private layout: CombatLayout;
    private camera: CombatCamera;
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
    private cameraTransition?: CameraTransition;
    private cameraAnimationFrame?: number;
    private cameraPointer?: {
        id: number;
        start: { x: number; y: number };
        camera: CombatCamera;
        panning: boolean;
    };
    private readonly unsubscribers: (() => void)[] = [];

    public constructor() {
        super({ key: 'combat' });
        this.onResize = this.onResize.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
        this.onWindowBlur = this.onWindowBlur.bind(this);
        this.onVisibility = this.onVisibility.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
        this.onCameraPointerDown = this.onCameraPointerDown.bind(this);
        this.onCameraPointerMove = this.onCameraPointerMove.bind(this);
        this.onCameraPointerEnd = this.onCameraPointerEnd.bind(this);
        this.shutdown = this.shutdown.bind(this);
    }

    public init(args?: CombatSceneArgs): void {
        this.initializationGeneration++;
        this.v8Args = args?.kind === 'v8' ? args : undefined;
        const preview = new URLSearchParams(window.location.search).get('combat-preview');
        this.v8Preview = !args?.snapshot && (preview === 'v8' || preview === 'v8-r1') ? preview : undefined;
        if (this.v8Args || this.v8Preview) return;
        this.args = args?.snapshot && args.kind !== 'v8' ? args : createCombatFixture();
        this.snapshot = structuredClone(this.args.snapshot);
        this.authoritativeSnapshot = structuredClone(this.args.snapshot);
        this.renderState = cloneSimulation(this.snapshot.simulation as SimulationState);
        this.camera = createCombatOverviewCamera(this.renderState);
        this.preview = [];
        this.projectileTrace = [];
        this.visualPhase = undefined;
        this.snapshotQueue.splice(0);
        this.pendingResult = undefined;
        this.pendingCommand = false;
        this.presenting = false;
        this.transitioning = false;
        this.fullscreenUnavailable = false;
        this.cancelCameraTransition();
        this.presentationEpoch += 1;
    }

    public create(): void {
        if (this.v8Args || this.v8Preview) {
            void this.createV8();
            return;
        }
        const parent = document.getElementById('game');
        if (!parent) throw new Error('Combat scene requires the #game host.');
        createApprovedWizardAnimations(this);
        this.combatRenderer = new CombatRenderer(this);
        this.controls = new CombatControls(parent, this.snapshot, {
            onCommand: (command) => void this.submit(command),
            onMovement: (direction, steps) => void this.submitMovement(direction, steps),
            onAimPreview: (aim) => {
                if (aim && this.controls.input.phase === 'aiming') {
                    this.completeOpeningCameraIntro();
                }
                this.preview = aim
                    ? trajectoryPreview(this.snapshot.simulation as SimulationState, aim)
                    : [];
                if (aim && this.controls.input.phase === 'aiming') {
                    this.followCameraForAimPreview();
                }
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
        this.game.canvas.addEventListener('pointerdown', this.onCameraPointerDown);
        this.game.canvas.addEventListener('pointermove', this.onCameraPointerMove);
        this.game.canvas.addEventListener('pointerup', this.onCameraPointerEnd);
        this.game.canvas.addEventListener('pointercancel', this.onCameraPointerEnd);
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
        this.camera = createCombatOverviewCamera(this.renderState);
        this.layout = computeCombatLayout(this.scale.width, this.scale.height, readSafeArea(), this.camera);
        this.controls.setLayout(this.layout);
        this.render();
        this.beginOpeningCameraIntro();
    }

    public preload(): void {
        preloadApprovedCombatAssets(this);
    }

    private async createV8(): Promise<void> {
        const generation = this.initializationGeneration;
        let mounted = true;
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { mounted = false; });
        // Phaser marks the scene active after create() returns. Live arguments
        // must yield too, before applying the same stale-mount guards as previews.
        const args = await (this.v8Args ?? createActionTurnsV8Fixture(1, 'wizard', undefined,
            this.v8Preview === 'v8-r1' ? 'nimble-knots-artillery-v8-r1' : 'nimble-knots-artillery-v8'));
        if (!mounted || generation !== this.initializationGeneration || !this.scene.isActive()) return;
        const controller = new ActionTurnsScene(this, args);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.destroy());
    }

    private async submit(command: SimulationCommand): Promise<void> {
        this.cancelCameraPointer();
        this.completeOpeningCameraIntro();
        if (this.pendingCommand) return;
        if (this.authoritativeSnapshot.simulation.activeActor !== 'player' ||
            this.authoritativeSnapshot.simulation.phase !== 'awaiting_command') return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        this.controls.root.dataset.lastCommand = command.type;
        if (command.type === 'fire') {
            this.preview = [];
            this.focusCameraOnActor('player', true);
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
        this.cancelCameraPointer();
        this.completeOpeningCameraIntro();
        if (this.pendingCommand || this.presenting) return;
        if (this.authoritativeSnapshot.simulation.activeActor !== 'player' ||
            this.authoritativeSnapshot.simulation.phase !== 'awaiting_command') return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        this.controls.root.dataset.lastCommand = 'move';
        this.controls.clearAimLock();
        this.preview = [];
        let acceptedSteps = 0;
        let turned = false;
        try {
            const initial = this.authoritativeSnapshot;
            if ((initial.simulation.rulesetId === V6_RULESET_ID ||
                initial.simulation.rulesetId === V7_RULESET_ID) &&
                initial.simulation.units[0].facing !== direction) {
                const next = await this.args.submitCommand(
                    { type: 'move', direction: 0 },
                    initial.simulation.turn
                );
                this.acceptSnapshot(next);
                turned = next.simulation.units[0].facing === direction;
            }
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
            const directionLabel = direction < 0 ? 'left' : 'right';
            this.controls.setMessage(acceptedSteps > 0
                ? `${turned ? `Turned ${directionLabel} · ` : ''}Moved ${directionLabel} · aim again`
                : turned
                    ? `Turned ${directionLabel} · the Knotkin could not move farther`
                    : 'The Knotkin could not move farther');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Movement failed.';
            this.controls.setMessage(turned
                ? `Turned ${direction < 0 ? 'left' : 'right'} · ${message}`
                : message);
        } finally {
            this.pendingCommand = false;
            this.controls.setBusy(false);
        }
    }

    private async setPaused(paused: boolean): Promise<void> {
        this.cancelCameraPointer();
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
        this.cancelCameraPointer();
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
        if (next.simulation.rulesetId !== LATEST_RULESET_ID) {
            this.controls?.setMessage('Combat scene accepts only the current challenge ruleset.');
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
        this.cancelCameraPointer();
        const resumeOpeningSurvey = this.cameraTransition?.kind === 'opening';
        this.cancelCameraTransition();
        const width = this.scale.width;
        const height = this.scale.height;
        this.camera = resumeOpeningSurvey
            ? clampCombatCamera(this.renderState, this.camera)
            : cameraForActor(
                this.renderState,
                createCombatCamera(this.renderState),
                this.snapshot.simulation.activeActor
            );
        this.layout = computeCombatLayout(width, height, readSafeArea(), this.camera);
        this.controls.setLayout(this.layout);
        this.controls.cancelTransient();
        this.render();
        if (resumeOpeningSurvey) this.beginOpeningCameraIntro();
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
        this.cancelCameraPointer();
        if (this.cameraTransition?.kind !== 'opening') this.settleCameraAfterInterruption();
        this.controls.cancelTransient();
    }

    private onVisibility(): void {
        if (document.hidden) {
            this.cancelCameraPointer();
            if (this.cameraTransition?.kind !== 'opening') this.settleCameraAfterInterruption();
            this.controls.cancelTransient();
        }
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
        this.controls.root.dataset.cameraLeft = this.camera.left.toFixed(2);
        this.controls.root.dataset.cameraTop = this.camera.top.toFixed(2);
        this.controls.root.dataset.cameraWidth = String(this.camera.width);
        this.controls.setLayout(this.layout);
        this.controls.setUnitPositions(this.renderState.units);
        this.updateCameraHint();
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
        this.game.canvas.removeEventListener('pointerdown', this.onCameraPointerDown);
        this.game.canvas.removeEventListener('pointermove', this.onCameraPointerMove);
        this.game.canvas.removeEventListener('pointerup', this.onCameraPointerEnd);
        this.game.canvas.removeEventListener('pointercancel', this.onCameraPointerEnd);
        this.cancelCameraPointer();
        this.cancelCameraTransition();
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
                this.focusCameraOnActor(step.actor, true);
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
                const impact = next.simulation.lastProjectile?.trace.at(-1);
                if (impact) this.setCamera(focusCombatCamera(this.renderState, this.camera, impact.x));
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
                    trace: this.projectileTrace.map((point) => ({ ...point })),
                    unraveling: newlyUnraveledActors(working, next.simulation as SimulationState)
                };
                this.controls.update(next);
                this.render();
                const unravelDurationMs = this.visualPhase.unraveling.length > 0
                    ? (reducedMotion ? 250 : WIZARD_UNRAVEL_DURATION_MS)
                    : 0;
                await this.waitForPresentation(
                    Math.max(step.durationMs, unravelDurationMs),
                    epoch
                );
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
            this.visualPhase = { kind: 'movement', actor: step.actor };
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
        this.cancelCameraTransition();
        const frames = reducedMotion ? 3 : Math.min(12, Math.max(6, step.trace.length));
        this.renderState = cloneSimulation(working);
        for (let frame = 0; frame < frames; frame += 1) {
            // Hold the first visible projectile frame at the Loomseed before it
            // advances along the authoritative trace on following frames.
            const points = frame === 0
                ? 1
                : Math.max(2, Math.ceil(step.trace.length * frame / (frames - 1)));
            this.projectileTrace = step.trace.slice(0, points).map((point) => ({ ...point }));
            const endpoint = this.projectileTrace.at(-1);
            if (endpoint) this.setCamera(focusCombatCamera(this.renderState, this.camera, endpoint.x));
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
        if (!this.controls.input.lockedAim) {
            this.focusCameraOnActor(this.snapshot.simulation.activeActor, true);
        }
        this.render();
    }

    private resetForChallenge(next: ChallengeSnapshot): void {
        this.cancelCameraTransition();
        this.presentationEpoch += 1;
        this.snapshotQueue.splice(0);
        this.presenting = false;
        this.transitioning = false;
        this.pendingResult = undefined;
        this.snapshot = structuredClone(next);
        this.authoritativeSnapshot = structuredClone(next);
        this.renderState = cloneSimulation(next.simulation as SimulationState);
        this.camera = createCombatOverviewCamera(this.renderState);
        this.preview = [];
        this.projectileTrace = [];
        this.visualPhase = undefined;
        this.controls.root.removeAttribute('data-visual-stage');
        this.controls.root.removeAttribute('data-projectile-visual');
        this.controls.setPresenting(null);
        this.controls.update(this.snapshot);
        this.controls.clearAimLock();
        this.render();
        this.beginOpeningCameraIntro();
    }

    private interruptPresentation(): void {
        this.cancelCameraTransition();
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
        this.focusCameraOnActor(this.snapshot.simulation.activeActor);
        this.render();
    }

    private followCameraForAimPreview(): void {
        const endpoint = this.preview.at(-1);
        if (!endpoint) return;
        this.setCamera(revealCombatCameraPoint(this.renderState, this.camera, endpoint.x));
    }

    private beginOpeningCameraIntro(): void {
        const destination = cameraForActor(
            this.renderState,
            createCombatCamera(this.renderState),
            this.snapshot.simulation.activeActor
        );
        if (this.camera.width <= destination.width) {
            this.setCamera(destination);
            return;
        }
        this.transitionCameraTo(destination, OPENING_CAMERA_DURATION_MS, 'opening');
    }

    private completeOpeningCameraIntro(): void {
        if (this.cameraTransition?.kind !== 'opening') return;
        this.cancelCameraTransition();
        this.setCamera(cameraForActor(
            this.renderState,
            createCombatCamera(this.renderState),
            this.snapshot.simulation.activeActor
        ));
    }

    private focusCameraOnActor(actor: SimulationActor, continuous = false): void {
        const target = cameraForActor(
            this.renderState,
            createCombatCamera(this.renderState),
            actor
        );
        if (continuous) {
            this.transitionCameraTo(target, AUTOMATIC_CAMERA_FOCUS_DURATION_MS, 'focus');
        } else {
            this.cancelCameraTransition();
            this.setCamera(target);
        }
    }

    private settleCameraAfterInterruption(): void {
        this.cancelCameraTransition();
        this.setCamera(cameraForActor(
            this.renderState,
            createCombatCamera(this.renderState),
            this.snapshot.simulation.activeActor
        ));
    }

    private setCamera(camera: CombatCamera): void {
        const previous = this.camera;
        this.camera = clampCombatCamera(this.renderState, camera);
        if (!this.layout) return;
        if (previous.width !== this.camera.width || previous.height !== this.camera.height) {
            this.layout = computeCombatLayout(
                this.scale.width,
                this.scale.height,
                readSafeArea(),
                this.camera
            );
            return;
        }
        this.layout = { ...this.layout, camera: this.camera };
    }

    private transitionCameraTo(
        target: CombatCamera,
        durationMs: number,
        kind: CameraTransition['kind']
    ): void {
        this.cancelCameraTransition();
        const destination = clampCombatCamera(this.renderState, target);
        const from = this.camera;
        if (sameCamera(from, destination) ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.setCamera(destination);
            this.render();
            return;
        }
        this.cameraTransition = {
            kind,
            from,
            to: destination,
            startedAt: performance.now(),
            durationMs
        };
        const advance = (now: number) => {
            const transition = this.cameraTransition;
            if (!transition || !this.scene.isActive()) return;
            const progress = Math.min(1, Math.max(0, (now - transition.startedAt) / transition.durationMs));
            const eased = progress * progress * (3 - 2 * progress);
            this.setCamera(interpolateCombatCamera(
                this.renderState,
                transition.from,
                transition.to,
                eased
            ));
            this.render();
            if (progress < 1) {
                this.cameraAnimationFrame = window.requestAnimationFrame(advance);
            } else {
                this.cameraTransition = undefined;
                this.cameraAnimationFrame = undefined;
            }
        };
        this.cameraAnimationFrame = window.requestAnimationFrame(advance);
    }

    private cancelCameraTransition(): void {
        if (this.cameraAnimationFrame !== undefined) {
            window.cancelAnimationFrame(this.cameraAnimationFrame);
        }
        this.cameraAnimationFrame = undefined;
        this.cameraTransition = undefined;
    }

    private updateCameraHint(): void {
        if (!this.controls) return;
        const canPan = !this.pendingCommand && !this.presenting && !this.snapshot.paused &&
            this.snapshot.status === 'active' &&
            this.snapshot.simulation.phase === 'awaiting_command' &&
            this.snapshot.simulation.activeActor === 'player';
        const loomkeeper = this.renderState.units[1];
        this.controls.setCameraHint(canPan && loomkeeper.alive
            ? cameraDirectionToWorldX(this.camera, loomkeeper.x)
            : null);
    }

    private onCameraPointerDown(event: PointerEvent): void {
        if (event.button > 0 || !this.canPanCamera() || !this.layout) return;
        this.completeOpeningCameraIntro();
        const point = this.cameraPoint(event);
        const field = this.layout.battlefield;
        if (point.x < field.x || point.x > field.x + field.width ||
            point.y < field.y || point.y > field.y + field.height) return;
        this.cameraPointer = {
            id: event.pointerId,
            start: point,
            camera: this.camera,
            panning: false
        };
        try { this.game.canvas.setPointerCapture(event.pointerId); } catch {}
    }

    private onCameraPointerMove(event: PointerEvent): void {
        const pointer = this.cameraPointer;
        if (!pointer || pointer.id !== event.pointerId || !this.layout) return;
        const point = this.cameraPoint(event);
        const dx = point.x - pointer.start.x;
        const dy = point.y - pointer.start.y;
        if (!pointer.panning) {
            if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) return;
            pointer.panning = true;
        }
        event.preventDefault();
        this.cancelCameraTransition();
        this.setCamera(panCombatCamera(
            this.renderState,
            pointer.camera,
            -dx / this.layout.worldScaleX
        ));
        this.render();
    }

    private onCameraPointerEnd(event: PointerEvent): void {
        if (!this.cameraPointer || this.cameraPointer.id !== event.pointerId) return;
        if (this.cameraPointer.panning) event.preventDefault();
        this.cancelCameraPointer();
    }

    private cancelCameraPointer(): void {
        const pointer = this.cameraPointer;
        if (!pointer) return;
        try { this.game.canvas.releasePointerCapture(pointer.id); } catch {}
        this.cameraPointer = undefined;
    }

    private canPanCamera(): boolean {
        return !this.pendingCommand && !this.presenting && !this.snapshot.paused &&
            this.snapshot.status === 'active' &&
            this.snapshot.simulation.phase === 'awaiting_command' &&
            this.snapshot.simulation.activeActor === 'player';
    }

    private cameraPoint(event: PointerEvent): { x: number; y: number } {
        const game = document.getElementById('game');
        if (!game) return { x: event.clientX, y: event.clientY };
        return clientPointToGame(
            { x: event.clientX, y: event.clientY },
            game.getBoundingClientRect(),
            activeSidewaysMode()
        );
    }

    private waitForPresentation(durationMs: number, epoch: number): Promise<void> {
        return new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), Math.max(0, durationMs));
        }).then(() => {
            if (epoch !== this.presentationEpoch) return;
        });
    }
}

/** An explicit V8 presentation branch; legacy result/snapshot schemas stay untouched. */
class ActionTurnsScene {
    private buffer = new V8SnapshotBuffer();
    private readonly controls: ActionTurnsControls;
    private readonly renderer: CombatRenderer;
    private readonly cleanup: (() => void)[] = [];
    private snapshot: ChallengeSnapshotV8;
    private camera: CombatCamera;
    private layout: CombatLayout;
    private preview: { x: number; y: number }[] = [];
    private previewGeneration = 0;
    private requestGeneration = 0;
    private normalPending = false;
    private normalType?: SimulationIntentV8['type'];
    private releasePending = false;
    private neutralPending = false;
    private connected = true;
    private focused = true;
    private stale = false;
    private terminal = false;
    private destroyed = false;
    private frameId?: number;
    private cameraPointer?: { id: number; x: number; left: number };

    constructor(private readonly scene: Phaser.Scene, private readonly args: CombatSceneArgsV8) {
        this.snapshot = structuredClone(args.snapshot);
        this.buffer.accept(this.snapshot, performance.now());
        const state = projectCombatV8(this.snapshot.simulation);
        this.camera = cameraForActor(state, createCombatCamera(state), state.activeActor);
        createApprovedWizardAnimations(scene);
        this.renderer = new CombatRenderer(scene);
        this.controls = new ActionTurnsControls(document.getElementById('game')!, this.snapshot, {
            onIntent: (intent) => this.trySubmit(intent), onCancel: () => void this.neutralize(),
            onRelease: () => void this.releaseMovement(),
            onRetry: this.args.restart ? () => void this.retry() : undefined,
            inputReady: () => this.available() && !this.normalPending && !this.neutralPending && !this.releasePending && (this.args.inputReady?.() ?? true),
            inputFlight: () => {
                if (!this.available() || this.neutralPending || this.releasePending) return 'blocked';
                if (this.normalPending) return ['walk_start', 'walk_refresh', 'walk_stop'].includes(this.normalType ?? '') ? 'locomotion' : 'blocked';
                return this.args.inputFlight?.() ?? null;
            },
            onAimPreview: (aim) => void this.aim(aim), onPause: (paused) => void this.pause(paused)
        });
        this.controls.root.dataset.visualAssets = this.renderer.assetState;
        if (args.previewLabel) this.controls.root.dataset.preview = args.previewLabel;
        this.controls.setMessage(args.previewLabel ?? '');
        if (args.onSnapshot) this.cleanup.push(args.onSnapshot((next) => this.accept(next)));
        if (args.onInputReady) this.cleanup.push(args.onInputReady(() => this.controls.pollMovement()));
        if (args.onResult) this.cleanup.push(args.onResult((result) => {
            if (result.challengeId !== this.snapshot.challengeId || result.rulesetId !== this.snapshot.rulesetId) return;
            this.terminal = true; this.interrupt(); this.controls.setSuspended(true);
            this.controls.setMessage(`Clash ended · ${result.outcome.replaceAll('_', ' ')}`);
            this.scene.scene.start('result', { result, calling: this.snapshot.calling,
                rewarded: this.snapshot.mode === 'reward' });
        }));
        if (args.onConnection) this.cleanup.push(args.onConnection((connection) => {
            this.connected = connection === 'connected';
            if (!this.connected) { this.interrupt(); void this.neutralize(); }
            this.suspension();
        }));
        if (args.onUnavailable) this.cleanup.push(args.onUnavailable((message) => {
            this.terminal = true; this.interrupt(); this.suspension(); this.controls.setMessage(message);
            this.scene.scene.start('result', { calling: this.snapshot.calling,
                rewarded: this.snapshot.mode === 'reward', message });
        }));
        if (args.onError) this.cleanup.push(args.onError((message) => this.controls.setMessage(message)));
        this.listen(window, 'blur', () => { this.focused = false; this.interrupt(); void this.neutralize(); this.suspension(); });
        this.listen(window, 'focus', () => { this.focused = true; this.suspension(); });
        this.listen(window, 'nimble-knots:wallet-boundary', () => { this.interrupt(); void this.neutralize(); });
        this.listen(document, 'visibilitychange', () => {
            this.interrupt(); void this.neutralize(); this.suspension();
        });
        const resize = () => { this.interrupt(); void this.neutralize(); this.resize(); };
        this.listen(window, 'resize', resize); this.listen(window, 'orientationchange', resize);
        if (window.visualViewport) {
            this.listen(window.visualViewport, 'resize', resize); this.listen(window.visualViewport, 'scroll', resize);
        }
        scene.scale.on(Phaser.Scale.Events.RESIZE, resize);
        this.cleanup.push(() => scene.scale.off(Phaser.Scale.Events.RESIZE, resize));
        const canvas = scene.game.canvas;
        this.listen(canvas, 'pointerdown', (event: PointerEvent) => {
            if (event.button > 0 || !this.available()) return;
            const point = this.point(event); const field = this.layout.battlefield;
            if (point.y < field.y || point.y > field.y + field.height) return;
            this.cameraPointer = { id: event.pointerId, x: point.x, left: this.camera.left };
            try { canvas.setPointerCapture(event.pointerId); } catch {}
        });
        this.listen(canvas, 'pointermove', (event: PointerEvent) => {
            if (this.cameraPointer?.id !== event.pointerId) return;
            this.camera = clampCombatCamera(state, { ...this.camera,
                left: this.cameraPointer.left - (this.point(event).x - this.cameraPointer.x) / this.layout.worldScaleX });
        });
        this.listen(canvas, 'pointerup', () => { this.cameraPointer = undefined; });
        for (const event of ['pointercancel', 'lostpointercapture']) this.listen(canvas, event, () => {
            if (!this.cameraPointer) return;
            this.interrupt(); void this.neutralize();
        });
        this.resize();
        const frame = () => {
            if (this.destroyed) return;
            this.render(); this.frameId = window.requestAnimationFrame(frame);
        };
        frame();
    }

    public destroy(): void {
        this.destroyed = true; this.interrupt();
        void this.args.cancelInput().catch(() => {});
        if (this.frameId !== undefined) window.cancelAnimationFrame(this.frameId);
        for (const remove of this.cleanup.splice(0)) remove();
        this.controls.destroy(); this.renderer.destroy();
    }

    private accept(next: ChallengeSnapshotV8): void {
        if (this.destroyed) return;
        if (next.challengeId === this.snapshot.challengeId && next.rulesetId !== this.snapshot.rulesetId) return;
        const outcome = this.buffer.accept(next, performance.now());
        if (!outcome.accepted) return;
        if (outcome.boundary) { this.requestGeneration++; this.interrupt(); }
        const old = this.snapshot;
        this.snapshot = structuredClone(next);
        if (next.challengeId !== old.challengeId) this.terminal = false;
        if (next.simulation.activeActor !== old.simulation.activeActor || next.challengeId !== old.challengeId ||
            (next.simulation.phase !== old.simulation.phase &&
                (next.simulation.phase === 'retreat' || next.simulation.phase === 'action'))) {
            const state = projectCombatV8(next.simulation);
            this.camera = cameraForActor(state, createCombatCamera(state), state.activeActor);
        }
        this.controls.update(next);
        this.stale = this.buffer.frame(performance.now()).stale; this.suspension();
        // Phase and terminal facts reach the renderer in this callback, never a queued shot.
        this.render();
    }

    private trySubmit(intent: SimulationIntentV8): boolean {
        if (!this.available() || this.normalPending || this.neutralPending || this.releasePending ||
            (this.snapshot.rulesetId === 'nimble-knots-artillery-v8-r1' && !(this.args.inputReady?.() ?? true))) return false;
        void this.submit(intent); return true;
    }

    private async submit(intent: SimulationIntentV8): Promise<void> {
        const generation = this.requestGeneration;
        const challenge = this.snapshot.challengeId;
        this.normalType = intent.type; this.normalPending = true; this.busy();
        this.controls.root.dataset.lastCommand = intent.type;
        if (intent.type !== 'aim') { this.previewGeneration++; this.preview = []; }
        try {
            const next = await this.args.submitIntent(intent);
            if (!this.destroyed && generation === this.requestGeneration && this.snapshot.challengeId === challenge) this.accept(next);
        } catch (error) {
            if (!this.destroyed && generation === this.requestGeneration && this.snapshot.challengeId === challenge) {
                this.controls.setMessage(error instanceof Error ? error.message : 'Intent failed.');
                this.interrupt(); void this.neutralize();
            }
        } finally {
            this.normalPending = false; this.normalType = undefined;
            if (!this.destroyed) { this.busy(); this.controls.pollMovement(); }
        }
    }

    private async releaseMovement(): Promise<void> {
        this.interrupt(); this.requestGeneration++;
        if (this.releasePending || this.destroyed) return;
        const challenge = this.snapshot.challengeId;
        this.releasePending = true; this.busy();
        try {
            const next = await this.args.releaseMovement?.();
            if (next && !this.destroyed && this.snapshot.challengeId === challenge) this.accept(next);
        } catch { /* Soft release recovery stays in the transport's soft lane; no hard cancellation. */ }
        finally { this.releasePending = false; if (!this.destroyed) this.busy(); }
    }

    private async neutralize(): Promise<void> {
        this.interrupt(); this.requestGeneration++;
        if (this.neutralPending || this.destroyed) return;
        const challenge = this.snapshot.challengeId;
        this.neutralPending = true; this.busy();
        try { const next = await this.args.cancelInput(); if (next && !this.destroyed && this.snapshot.challengeId === challenge) this.accept(next); }
        catch { /* Server lease also bounds a lost barrier; transport owns resynchronization. */ }
        finally { this.neutralPending = false; if (!this.destroyed) this.busy(); }
    }

    private async pause(paused: boolean): Promise<void> {
        if (!this.args.setPaused || this.normalPending || this.neutralPending) return;
        const challenge = this.snapshot.challengeId;
        const turn = this.snapshot.simulation.turn;
        const phase = this.snapshot.simulation.phase;
        await this.neutralize();
        if (this.destroyed || challenge !== this.snapshot.challengeId || turn !== this.snapshot.simulation.turn ||
            phase !== this.snapshot.simulation.phase) return;
        const generation = this.requestGeneration;
        this.normalPending = true; this.busy();
        try {
            const next = await this.args.setPaused(paused);
            if (!this.destroyed && generation === this.requestGeneration && challenge === this.snapshot.challengeId) this.accept(next);
        } catch (error) {
            if (!this.destroyed && generation === this.requestGeneration && challenge === this.snapshot.challengeId) {
                this.controls.setMessage(error instanceof Error ? error.message : 'Pause failed.');
            }
        }
        finally { this.normalPending = false; if (!this.destroyed) this.busy(); }
    }

    private async retry(): Promise<void> {
        if (!this.args.restart || this.normalPending || this.neutralPending || this.releasePending) return;
        this.interrupt();
        try {
            const nextArgs = await this.args.restart();
            this.scene.scene.restart(nextArgs);
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Retry failed.');
        }
    }

    private async aim(aim: AimIntent | null): Promise<void> {
        const generation = ++this.previewGeneration;
        if (!aim) { this.preview = []; return; }
        const points = await trajectoryPreviewV8(this.snapshot.simulation, aim);
        if (generation !== this.previewGeneration || this.destroyed) return;
        this.preview = points;
        const end = points.at(-1);
        if (end) this.camera = revealCombatCameraPoint(this.snapshot.simulation, this.camera, end.x);
    }

    private interrupt(): void {
        this.previewGeneration++; this.preview = []; this.cameraPointer = undefined;
        this.buffer.flush(); this.controls?.interrupt();
    }

    private available(): boolean {
        return this.connected && this.focused && !document.hidden && !this.stale && !this.terminal &&
            this.snapshot.status === 'active' && !this.snapshot.paused;
    }
    private suspension(): void {
        this.controls.setSuspended(!this.connected || !this.focused || document.hidden || this.stale || this.terminal);
    }
    private busy(): void { this.controls.setBusy(this.normalPending || this.neutralPending || this.releasePending); }
    private resize(): void {
        this.layout = computeCombatLayout(this.scene.scale.width, this.scene.scale.height, readSafeArea(), this.camera);
        this.controls.setLayout(this.layout);
    }
    private render(): void {
        if (!this.layout || this.destroyed) return;
        const frame = this.buffer.frame(performance.now());
        if (frame.stale && !this.stale) { this.stale = true; void this.neutralize(); this.suspension(); }
        const s = this.snapshot.simulation;
        let visual: CombatVisualPhase | undefined;
        let trace: { x: number; y: number }[] = [];
        if (!this.terminal && s.projectile) {
            trace = [...s.projectile.trace, { x: s.projectile.xFp / 256, y: s.projectile.yFp / 256 }];
            visual = { kind: 'projectile', actor: s.projectile.actor, relicId: s.projectile.relicId, trace };
            this.camera = focusCombatCamera(s, this.camera, trace.at(-1)!.x);
        } else if (!this.terminal && [s.units[0], s.units[1]].some((unit) => unit.vxFp !== 0 || unit.vyFp !== 0)) {
            visual = { kind: 'movement', actor: s.activeActor };
            this.camera = revealCombatCameraPoint(s, this.camera, frame.state.units[s.activeActor === 'player' ? 0 : 1].x);
        }
        this.layout = { ...this.layout, camera: this.camera };
        this.controls.setLayout(this.layout); this.controls.setUnitPositions(frame.state.units);
        Object.assign(this.controls.root.dataset, { interpolationSamples: String(this.buffer.sampleCount),
            renderPlayerX: String(frame.state.units[0].x), cameraLeft: String(this.camera.left),
            cameraWidth: String(this.camera.width), previewPoints: String(this.preview.length),
            presentation: visual?.kind ?? 'none' });
        this.renderer.render(frame.state, this.layout, this.preview, trace, visual);
    }
    private point(event: PointerEvent): { x: number; y: number } {
        return clientPointToGame({ x: event.clientX, y: event.clientY }, document.getElementById('game')!.getBoundingClientRect(), activeSidewaysMode());
    }
    private listen(target: EventTarget, event: string, listener: (event: any) => void): void {
        target.addEventListener(event, listener); this.cleanup.push(() => target.removeEventListener(event, listener));
    }
}

function newlyUnraveledActors(
    before: SimulationState,
    after: SimulationState
): SimulationActor[] {
    return after.units
        .filter((unit, index) => !unit.alive && before.units[index]?.alive)
        .map((unit) => unit.id);
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

function sameCamera(left: CombatCamera, right: CombatCamera): boolean {
    return left.left === right.left && left.top === right.top &&
        left.width === right.width && left.height === right.height;
}
