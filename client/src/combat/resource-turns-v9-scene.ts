import { VOLCANIC_RUIN_ARENA_FRAME } from '../../../shared/terrain-volcanic-ruin';
import Phaser from 'phaser';
import { V9PreviewListenerCleanup, type ResourceTurnsEvent, type ResourceTurnsSceneArgs, type ResourceTurnsState, type SafeAreaInsets } from './contracts';
import { createApprovedWizardAnimations, WIZARD_UNRAVEL_DURATION_MS } from './approved-assets';
import { cameraDirectionToWorldX, cameraForActor, createCombatCamera, createCombatOverviewCamera, focusCombatCamera, interpolateCombatCamera, panCombatCamera, revealCombatCameraPoint, type CombatCamera } from './camera';
import { computeCombatLayout, type CombatLayout } from './layout';
import { liveProjectileTraceV9, planV9Presentation, projectCombatV9, trajectoryPreviewV9, type V9PresentationStep } from './resource-turns-v9-fixture';
import { CombatRenderer, type CombatVisualPhase } from './renderer';
import type { BackgroundSceneDefinition } from './background-scene';
import { BackgroundRenderer } from './background-renderer';
import { ResourceTurnsV9Controls } from './resource-turns-v9-controls';
import { cameraFocusProgress } from './controls';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import type { AimIntent } from './input';
import type { SimulationIntentV9, SimulationStateV9 } from '../../../shared/simulation-v9';

type CameraActor = 'player' | 'loomkeeper';
type CameraTransition = { kind: 'focus' | 'opening'; actor: CameraActor; from: CombatCamera; to: CombatCamera; startedAt: number };
const V10_OPENING_CAMERA_DURATION_MS = 3_000;

/** Local V9/V10 adapter: authority advances independently; this class only projects it. */
export class ResourceTurnsV9Scene {
    private state: ResourceTurnsState; private readonly renderer: CombatRenderer; private readonly controls: ResourceTurnsV9Controls;
    private readonly sceneBackground: BackgroundRenderer;
    private camera: CombatCamera; private layout: CombatLayout; private frame?: number; private destroyed = false; private unsubscribe?: () => void;
    private neutralPending = false; private neutralGeneration = 0; private requestGeneration = 0; private previewGeneration = 0; private preview: { x: number; y: number }[] = [];
    private presentation: { steps: V9PresentationStep[]; index: number; startedAt: number; generation: number } | undefined;
    private projectileCamera?: CombatCamera; private cameraTransition?: CameraTransition;
    private cameraPointer?: { id: number; x: number }; private readonly listeners = new V9PreviewListenerCleanup();
    private restarting = false;
    private terminalPresentation?: { result: import('../../../shared/protocol-v10-live').ChallengeResultV10; until: number };
    private readonly scenicFrame: boolean;

    public constructor(
        private readonly scene: Phaser.Scene,
        private readonly args: ResourceTurnsSceneArgs,
        private readonly backgroundScene?: BackgroundSceneDefinition
    ) {
        this.state = structuredClone(args.snapshot); createApprovedWizardAnimations(scene); this.renderer = new CombatRenderer(scene);
        this.sceneBackground = new BackgroundRenderer(scene, backgroundScene, this.renderer.backgroundMask);
        this.scenicFrame = this.state.rulesetId === 'nimble-knots-artillery-v10-r5';
        const projected = projectCombatV9(this.state);
        const playerCamera = cameraForActor(projected, createCombatCamera(projected), 'player');
        this.camera = this.scenicFrame ? { ...VOLCANIC_RUIN_ARENA_FRAME } : args.kind === 'v10' ? createCombatOverviewCamera(projected) : playerCamera;
        if (!this.scenicFrame && args.kind === 'v10' && this.camera.width > playerCamera.width) {
            this.cameraTransition = { kind: 'opening', actor: 'player', from: this.camera, to: playerCamera, startedAt: performance.now() };
        }
        this.controls = new ResourceTurnsV9Controls(document.getElementById('game')!, this.state, {
            submit: intent => this.submit(intent), pause: paused => void this.pause(paused), neutral: () => void this.neutralize(), release: () => void this.releaseMovement(),
            preview: aim => this.previewAim(aim), focus: actor => this.focusActor(actor), restart: () => void this.restart(),
            inputReady: args.inputReady, pauseAllowed: args.pauseAllowed, pauseReason: args.pauseReason,
            live: args.kind === 'v10' ? args.live === true : args.previewLabel.includes('server-authoritative'), automated: args.kind === 'v10'
        }, () => performance.now(), args.paused());
        this.controls.root.dataset.preview = args.previewLabel;
        this.controls.root.dataset.background = backgroundScene?.id ?? 'none';
        this.controls.root.dataset.backgroundReady = String(this.sceneBackground.active);
        if (args.kind === 'v10' && args.previewTerrainReflected !== undefined) {
            this.controls.root.dataset.terrainReflected = String(args.previewTerrainReflected);
        }
        this.unsubscribe = args.kind === 'v10'
            ? args.onSnapshot((state, events) => this.accept(state, events))
            : args.onSnapshot((state, events) => this.accept(state, events));
        {
            if (args.onConnection) this.listeners.defer(args.onConnection(state => {
                this.controls.interrupt();
                this.controls.root.dataset.connection = state;
                if (state === 'reconnecting') this.controls.root.querySelector<HTMLElement>('.combat-message')!.textContent =
                    'Reconnecting · controls wait for a fresh authoritative snapshot.';
            }));
            if (args.onError) this.listeners.defer(args.onError(message => {
                this.controls.root.querySelector<HTMLElement>('.combat-message')!.textContent = message;
            }));
            if (args.onUnavailable) this.listeners.defer(args.onUnavailable(message => this.showUnavailable(message)));
            if (args.onResult) this.listeners.defer(args.onResult(result => this.showResult(result)));
        }
        const interrupt = () => { this.completeOpeningSurvey(); this.cancelCameraNavigation(); this.cancelPresentation(); this.controls.interrupt(); void this.neutralize(); };
        const resize = () => { interrupt(); this.render(false); };
        this.listeners.emitter(scene.scale, Phaser.Scale.Events.RESIZE, resize); this.listeners.dom(window, 'blur', interrupt); this.listeners.dom(document, 'visibilitychange', interrupt);
        const canvas = scene.game.canvas;
        const coordinate = (event: PointerEvent) => clientPointToGame({ x: event.clientX, y: event.clientY }, document.getElementById('game')!.getBoundingClientRect(), activeSidewaysMode()).x;
        const down = (event: PointerEvent) => { if (event.button === 0) { this.completeOpeningSurvey(); this.cancelCameraTransition(); this.cameraPointer = { id: event.pointerId, x: coordinate(event) }; try { canvas.setPointerCapture(event.pointerId); } catch {} } };
        const move = (event: PointerEvent) => { if (!this.cameraPointer || this.cameraPointer.id !== event.pointerId || !this.layout) return; const next = coordinate(event), delta = this.cameraPointer.x - next; this.cameraPointer.x = next; this.camera = panCombatCamera(projectCombatV9(this.state), this.camera, delta / this.layout.worldScaleX); };
        const end = (event: PointerEvent) => { if (this.cameraPointer?.id === event.pointerId) this.cancelCameraPointer(); };
        const cancel = () => { this.cancelCameraPointer(); interrupt(); };
        this.listeners.dom(canvas, 'pointerdown', down); this.listeners.dom(canvas, 'pointermove', move); this.listeners.dom(canvas, 'pointerup', end); this.listeners.dom(canvas, 'pointercancel', cancel);
        this.listeners.once(this.scene.events, Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
        const loop = () => { if (this.destroyed) return; this.render(true); this.frame = requestAnimationFrame(loop); }; loop();
    }

    public destroy(): void {
        if (this.destroyed) return; this.destroyed = true; if (this.frame) cancelAnimationFrame(this.frame);
        this.unsubscribe?.(); this.listeners.dispose(); this.cancelCameraNavigation(); this.cancelPresentation(); this.args.destroy(); this.controls.destroy(); this.sceneBackground.destroy(); this.renderer.destroy();
    }

    private accept(next: ResourceTurnsState, events: ResourceTurnsEvent[]): void {
        if (this.destroyed) return;
        const previous = this.state; this.state = structuredClone(next);
        const boundary = this.controls.update(this.state, events, this.args.paused());
        if (boundary) { this.requestGeneration++; this.cancelCameraNavigation(); this.previewGeneration++; this.preview = []; this.cancelPresentation(); }
        const steps = planV9Presentation(previous, this.state, reducedMotion());
        if (steps.length) this.presentation = { steps, index: 0, startedAt: performance.now(), generation: this.requestGeneration };
        if (!previous.projectile && this.state.projectile) { this.projectileCamera ??= this.camera; this.camera = this.scenicFrame ? revealCombatCameraPoint(projectCombatV9(this.state), this.camera, this.state.projectile.xFp / 256) : focusCombatCamera(projectCombatV9(this.state), this.camera, this.state.projectile.xFp / 256); }
        if (previous.projectile && !this.state.projectile && this.projectileCamera) { this.camera = this.projectileCamera; this.projectileCamera = undefined; }
        this.render(false);
    }
    private async submit(intent: SimulationIntentV9): Promise<boolean> {
        this.completeOpeningSurvey();
        const generation = this.requestGeneration;
        try { const next = await this.args.submit(intent); if (!this.destroyed && generation === this.requestGeneration) this.accept(next, []); return !this.destroyed && generation === this.requestGeneration; }
        catch (error) { if (!this.destroyed && generation === this.requestGeneration) this.controls.update(this.state, [], this.args.paused()); return false; }
    }
    private async pause(paused: boolean): Promise<void> {
        const generation = this.requestGeneration;
        try { const next = await this.args.setPaused(paused); if (!this.destroyed && generation === this.requestGeneration) this.accept(next, []); }
        catch { if (!this.destroyed && generation === this.requestGeneration) this.controls.update(this.state, [], this.args.paused()); }
    }
    private async neutralize(): Promise<void> {
        if (this.neutralPending || this.destroyed) return; const generation = this.requestGeneration, neutralGeneration = ++this.neutralGeneration; this.neutralPending = true;
        try { const next = await this.args.cancelInput(); if (!this.destroyed && generation === this.requestGeneration) this.accept(next, []); }
        // accept() can legitimately advance requestGeneration for this very
        // cancel snapshot. Neutral ownership has its own generation so that
        // acknowledgement releases it, while an older completion cannot clear a
        // later neutral request.
        finally { if (neutralGeneration === this.neutralGeneration) this.neutralPending = false; }
    }
    private async restart(): Promise<void> {
        if (this.destroyed || this.restarting) return;
        this.restarting = true;
        try {
            const next = await this.args.restart();
            if (this.destroyed) { next.destroy(); return; }
            // Retire old listeners before mounting the acknowledged replacement.
            this.destroy(); new ResourceTurnsV9Scene(this.scene, next, this.backgroundScene);
        } catch (error) {
            if (!this.destroyed) this.controls.root.querySelector<HTMLElement>('.combat-message')!.textContent =
                error instanceof Error ? error.message : 'Unable to restart the Clash.';
        } finally { this.restarting = false; }
    }
    private async releaseMovement(): Promise<void> {
        if (this.neutralPending || this.destroyed || !this.args.releaseMovement) return this.neutralize();
        const generation = this.requestGeneration, neutralGeneration = ++this.neutralGeneration; this.neutralPending = true;
        try { const next = await this.args.releaseMovement(); if (!this.destroyed && generation === this.requestGeneration) this.accept(next, []); }
        finally { if (neutralGeneration === this.neutralGeneration) this.neutralPending = false; }
    }
    private showResult(result: import('../../../shared/protocol-v9').ChallengeResultV9 | import('../../../shared/protocol-v10-live').ChallengeResultV10): void {
        if (this.destroyed || this.restarting) return;
        if (result.protocolVersion === 10 && this.state.units.some(unit => !unit.alive)) {
            this.terminalPresentation ??= { result, until: performance.now() + WIZARD_UNRAVEL_DURATION_MS };
            return;
        }
        this.scene.scene.start('result', { result, calling: this.args.calling ?? 'wizard',
            rewarded: this.args.kind === 'v9' && this.args.rewarded, previewLabel: this.args.kind === 'v10' && this.args.live ? undefined : this.args.previewLabel });
    }
    private showUnavailable(message: string): void {
        if (this.destroyed) return;
        this.scene.scene.start('result', { calling: this.args.calling ?? 'wizard', message, previewLabel: this.args.kind === 'v10' && this.args.live ? undefined : this.args.previewLabel });
    }
    private previewAim(aim: AimIntent | null): void {
        const generation = ++this.previewGeneration;
        if (!aim || this.destroyed || this.args.paused()) { this.preview = []; return; }
        this.completeOpeningSurvey();
        const points = this.args.kind === 'v10'
            ? this.args.trajectoryPreview(aim)
            : trajectoryPreviewV9(this.state as SimulationStateV9, aim);
        if (this.destroyed || generation !== this.previewGeneration) return;
        this.preview = points; const end = points.at(-1); if (end && !this.scenicFrame) this.camera = revealCombatCameraPoint(projectCombatV9(this.state), this.camera, end.x);
    }
    private focusActor(actor: CameraActor): void {
        if (this.destroyed || this.state.projectile || this.state.phase === 'finished') return;
        const state = projectCombatV9(this.state), unit = state.units[actor === 'player' ? 0 : 1];
        if (!unit.alive || !cameraDirectionToWorldX(this.camera, unit.x)) return;
        this.cancelCameraPointer(); const destination = cameraForActor(state, createCombatCamera(state), actor);
        if (reducedMotion()) { this.camera = destination; return; }
        this.cameraTransition = { kind: 'focus', actor, from: this.camera, to: destination, startedAt: performance.now() };
    }
    private advanceCamera(now: number): void {
        const transition = this.cameraTransition; if (!transition || this.destroyed || this.state.projectile) return;
        const elapsed = now - transition.startedAt;
        const progress = transition.kind === 'opening'
            ? Math.max(0, Math.min(1, elapsed / V10_OPENING_CAMERA_DURATION_MS))
            : cameraFocusProgress(elapsed);
        this.camera = interpolateCombatCamera(projectCombatV9(this.state), transition.from, transition.to, progress);
        if (elapsed >= (transition.kind === 'opening' ? V10_OPENING_CAMERA_DURATION_MS : 300)) {
            this.camera = transition.to;
            this.cameraTransition = undefined;
        }
    }
    private visual(now: number): CombatVisualPhase | undefined {
        const current = this.presentation; if (!current || current.generation !== this.requestGeneration) return undefined;
        while (current.index < current.steps.length && now - current.startedAt >= current.steps[current.index].durationMs) { current.startedAt += current.steps[current.index].durationMs; current.index++; }
        if (current.index >= current.steps.length) { this.presentation = undefined; return undefined; }
        const visual = current.steps[current.index].visual;
        return visual;
    }
    private render(pollMovement: boolean): void {
        if (this.destroyed) return; const now = performance.now();
        if (this.terminalPresentation && now >= this.terminalPresentation.until) {
            const result = this.terminalPresentation.result;
            this.scene.scene.start('result', { result, calling: this.args.calling ?? 'wizard', rewarded: false });
            return;
        }
        // The live V9 projectile wins over the decorative cast queue. Track its
        // current authority position on every frame in full and reduced motion.
        if (this.state.projectile) {
            this.projectileCamera ??= this.camera;
            this.camera = this.scenicFrame ? revealCombatCameraPoint(projectCombatV9(this.state), this.camera, this.state.projectile.xFp / 256) : focusCombatCamera(projectCombatV9(this.state), this.camera, this.state.projectile.xFp / 256);
        } else this.advanceCamera(now);
        this.layout = computeCombatLayout(this.scene.scale.width, this.scene.scale.height, readSafeArea(), this.camera); this.controls.setLayout(this.layout); if (pollMovement) this.controls.pollMovement();
        const queuedVisual = this.terminalPresentation ? { kind: 'impact' as const, actor: this.state.activeActor,
            relicId: this.state.lastProjectile?.relicId ?? 'threadball' as const, trace: [],
            unraveling: this.state.units.filter(unit => !unit.alive).map(unit => unit.id) } : this.visual(now); const visual: CombatVisualPhase | undefined = this.state.projectile ? {
            kind: 'projectile', actor: this.state.projectile.actor, relicId: this.state.projectile.relicId,
            trace: liveProjectileTraceV9(this.state.projectile)
        } : queuedVisual;
        this.controls.setCameraFocusControls({ enabled: !this.state.projectile && this.state.phase !== 'finished',
            player: { direction: cameraDirectionToWorldX(this.camera, this.state.units[0].xFp / 256), stitching: this.state.units[0].stitching },
            loomkeeper: { direction: cameraDirectionToWorldX(this.camera, this.state.units[1].xFp / 256), stitching: this.state.units[1].stitching } });
        this.renderer.render(projectCombatV9(this.state), this.layout, this.preview, visual?.kind === 'projectile' ? visual.trace : [], visual,
            (layout) => this.sceneBackground.render(layout));
        Object.assign(this.controls.root.dataset, { simulationTick: String(this.state.tick), playerThread: String(this.state.units[0].thread), playerShield: String(this.state.units[0].shield),
            cameraLeft: this.camera.left.toFixed(2), cameraWidth: String(this.camera.width), presentation: visual?.kind ?? 'none', projectilePoints: String(visual?.kind === 'projectile' ? visual.trace.length : 0), projectileEndX: String(visual?.kind === 'projectile' ? visual.trace.at(-1)?.x ?? '' : ''), projectileEndY: String(visual?.kind === 'projectile' ? visual.trace.at(-1)?.y ?? '' : ''), cameraTransition: this.cameraTransition?.kind === 'opening' ? 'opening' : this.cameraTransition?.actor ?? 'none', openingSurvey: String(this.cameraTransition?.kind === 'opening') });
    }
    private cancelPresentation(): void { this.presentation = undefined; }
    private cancelCameraTransition(): void { this.cameraTransition = undefined; }
    private completeOpeningSurvey(): void {
        if (this.cameraTransition?.kind !== 'opening') return;
        const destination = this.cameraTransition.to;
        this.cameraTransition = undefined;
        this.camera = destination;
    }
    private cancelCameraPointer(): void { const pointer = this.cameraPointer; if (!pointer) return; try { this.scene.game.canvas.releasePointerCapture(pointer.id); } catch {} this.cameraPointer = undefined; }
    private cancelCameraNavigation(): void { this.cancelCameraTransition(); this.cancelCameraPointer(); }
}

function reducedMotion(): boolean { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function readSafeArea(): SafeAreaInsets { const style = getComputedStyle(document.documentElement); const value = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0; return { top: value('--safe-area-top'), right: value('--safe-area-right'), bottom: value('--safe-area-bottom'), left: value('--safe-area-left') }; }
