import Phaser from 'phaser';
import type { ChallengeSnapshotV8Runtime as ChallengeSnapshotV8, ChallengeResultV8Runtime as ChallengeResultV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';
import type { CombatSceneArgsV8, SafeAreaInsets } from './contracts';
import { ActionTurnsControls } from './controls';
import type { AimIntent } from './input';
import { createApprovedWizardAnimations } from './approved-assets';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import { cameraForActor, clampCombatCamera, createCombatCamera, createCombatOverviewCamera, focusCombatCamera,
    revealCombatCameraPoint, type CombatCamera } from './camera';
import { computeCombatLayout, type CombatLayout } from './layout';
import { V8SnapshotBuffer, V8PresentationFeedback, projectCombatV8 } from './presentation';
import { trajectoryPreviewV8 } from './preview';
import { CombatRenderer, type CombatVisualPhase } from './renderer';

/** An explicit V8 presentation branch; legacy result/snapshot schemas stay untouched. */
export class ActionTurnsScene {
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
    private readonly feedback = new V8PresentationFeedback();
    private pendingResult?: ChallengeResultV8;
    private transitioning = false;
    private message = '';
    private displayedMessage = '';

    constructor(private readonly scene: Phaser.Scene, private readonly args: CombatSceneArgsV8) {
        this.snapshot = structuredClone(args.snapshot);
        this.buffer.accept(this.snapshot, performance.now());
        const state = projectCombatV8(this.snapshot.simulation);
        this.camera = cameraForActor(state, createCombatCamera(state), 'player');
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
        this.message = args.previewLabel ?? '';
        if (args.onSnapshot) this.cleanup.push(args.onSnapshot((next) => this.accept(next)));
        if (args.onInputReady) this.cleanup.push(args.onInputReady(() => this.controls.pollMovement()));
        if (args.onResult) this.cleanup.push(args.onResult((result) => {
            if (this.destroyed || this.pendingResult || this.transitioning ||
                result.challengeId !== this.snapshot.challengeId || result.rulesetId !== this.snapshot.rulesetId) return;
            this.pendingResult = structuredClone(result);
            if (['left', 'expired'].includes(result.outcome)) this.retirePresentation();
            this.terminal = true; this.interrupt(); this.controls.setSuspended(true);
            this.message = `Clash ended · ${result.outcome.replaceAll('_', ' ')}`;
            this.render();
        }));
        if (args.onConnection) this.cleanup.push(args.onConnection((connection) => {
            this.connected = connection === 'connected';
            if (!this.connected) { this.retirePresentation(); this.interrupt(); void this.neutralize(); }
            this.suspension();
        }));
        if (args.onUnavailable) this.cleanup.push(args.onUnavailable((message) => {
            if (this.destroyed || this.transitioning) return;
            if (this.pendingResult) {
                this.retirePresentation(); this.render(); return;
            }
            this.transitioning = true; this.retirePresentation(); this.pendingResult = undefined;
            this.terminal = true; this.interrupt(); this.suspension(); this.controls.setMessage(message);
            this.scene.scene.start('result', { calling: this.snapshot.calling,
                rewarded: this.snapshot.mode === 'reward', message });
        }));
        if (args.onError) this.cleanup.push(args.onError((message) => { this.message = message; }));
        this.listen(window, 'blur', () => { this.focused = false; this.retirePresentation(); this.interrupt(); void this.neutralize(); this.suspension(); });
        this.listen(window, 'focus', () => { this.focused = true; this.suspension(); });
        this.listen(window, 'nimble-knots:wallet-boundary', () => { this.retirePresentation(); this.interrupt(); void this.neutralize(); });
        this.listen(document, 'visibilitychange', () => {
            if (document.hidden) this.retirePresentation();
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
            this.render(); if (!this.destroyed) this.frameId = window.requestAnimationFrame(frame);
        };
        frame();
    }

    public destroy(): void {
        this.destroyed = true; this.retirePresentation(); this.pendingResult = undefined; this.interrupt();
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
        this.feedback.observe(old, next, performance.now(), this.connected && this.focused && !document.hidden);
        if (next.challengeId !== old.challengeId) {
            this.terminal = false; this.pendingResult = undefined; this.transitioning = false;
            this.message = this.args.previewLabel ?? '';
        }
        if (next.simulation.activeActor !== old.simulation.activeActor || next.challengeId !== old.challengeId ||
            (next.simulation.phase !== old.simulation.phase &&
                (next.simulation.phase === 'retreat' || next.simulation.phase === 'action'))) {
            const state = projectCombatV8(next.simulation);
            this.camera = cameraForActor(state, createCombatCamera(state), 'player');
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
                this.message = error instanceof Error ? error.message : 'Intent failed.';
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
                this.message = error instanceof Error ? error.message : 'Pause failed.';
            }
        }
        finally { this.normalPending = false; if (!this.destroyed) this.busy(); }
    }

    private async retry(): Promise<void> {
        if (!this.args.restart || this.normalPending || this.neutralPending || this.releasePending) return;
        this.retirePresentation(); this.pendingResult = undefined; this.interrupt();
        try {
            const nextArgs = await this.args.restart();
            if (!this.destroyed) this.scene.scene.restart(nextArgs);
        } catch (error) {
            if (!this.destroyed) this.message = error instanceof Error ? error.message : 'Retry failed.';
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

    private retirePresentation(): void {
        this.feedback.clear();
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
        if (!this.layout || this.destroyed || this.transitioning) return;
        const now = performance.now();
        const frame = this.buffer.frame(now);
        if (frame.stale && !this.stale) { this.stale = true; void this.neutralize(); this.suspension(); }
        const s = this.snapshot.simulation;
        let visual: CombatVisualPhase | undefined;
        let trace: { x: number; y: number }[] = [];
        if (!this.terminal && s.projectile) {
            trace = [...s.projectile.trace, { x: s.projectile.xFp / 256, y: s.projectile.yFp / 256 }];
            visual = { kind: 'projectile', actor: s.projectile.actor, relicId: s.projectile.relicId, trace };
            this.camera = focusCombatCamera(s, this.camera, trace.at(-1)!.x);
        } else if (!this.terminal && s.units[s.activeActor === 'player' ? 0 : 1].grounded &&
            s.units[s.activeActor === 'player' ? 0 : 1].vxFp !== 0) {
            visual = { kind: 'movement', actor: s.activeActor };
        }
        if (!s.projectile && (s.units[0].vxFp !== 0 || s.units[0].vyFp !== 0))
            this.camera = revealCombatCameraPoint(s, this.camera, frame.state.units[0].x);
        const defeated = this.feedback.defeatedActors(now);
        if (defeated.length) {
            // A death cannot lead to a live next turn. Show the actual Unraveling,
            // including both actors with a bounded overview for a double defeat.
            this.camera = defeated.length > 1 ? createCombatOverviewCamera(frame.state)
                : cameraForActor(frame.state, createCombatCamera(frame.state), defeated[0]);
        }
        this.layout = this.layout.camera.width !== this.camera.width || this.layout.camera.height !== this.camera.height
            ? computeCombatLayout(this.scene.scale.width, this.scene.scale.height, readSafeArea(), this.camera)
            : { ...this.layout, camera: this.camera };
        this.controls.setLayout(this.layout); this.controls.setUnitPositions(frame.state.units);
        Object.assign(this.controls.root.dataset, { interpolationSamples: String(this.buffer.sampleCount),
            renderPlayerX: String(frame.state.units[0].x), cameraLeft: String(this.camera.left),
            cameraWidth: String(this.camera.width), previewPoints: String(this.preview.length),
            presentation: defeated.length ? 'unravel' : visual?.kind ?? 'none',
            resultPending: String(Boolean(this.pendingResult)),
            renderLoomkeeperX: String(frame.state.units[1].x), cameraAnchor: 'player' });
        this.renderer.render(frame.state, this.layout, this.preview, trace, visual);
        const playerAnimation = this.renderer.animationState('player'), aiAnimation = this.renderer.animationState('loomkeeper');
        const observedAt = performance.now();
        this.feedback.advanceDefeat({ player: playerAnimation, loomkeeper: aiAnimation }, observedAt);
        const playback = this.feedback.defeatPlayback(observedAt);
        const hitMessage = playback === 'unavailable' ? '' : this.feedback.message(this.snapshot, observedAt);
        const message = playback === 'unavailable' ? 'Defeat animation unavailable · showing clash result' : hitMessage || this.message;
        if (message !== this.displayedMessage) {
            this.displayedMessage = message; this.controls.setMessage(message);
        }
        Object.assign(this.controls.root.dataset, {
            playerAnimation: playerAnimation.key, playerAnimationFrame: String(playerAnimation.frame),
            playerAnimationComplete: String(playerAnimation.complete),
            loomkeeperAnimation: aiAnimation.key, loomkeeperAnimationFrame: String(aiAnimation.frame),
            loomkeeperAnimationComplete: String(aiAnimation.complete),
            defeatPlayback: playback, hitFeedback: hitMessage ? 'visible' : 'none'
        });
        if (this.pendingResult && observedAt >= this.feedback.resultReadyAt(this.snapshot, observedAt) && this.focused && !document.hidden) {
            this.transitioning = true;
            this.scene.scene.start('result', { result: this.pendingResult, calling: this.snapshot.calling,
                rewarded: this.snapshot.mode === 'reward' });
        }
    }
    private point(event: PointerEvent): { x: number; y: number } {
        return clientPointToGame({ x: event.clientX, y: event.clientY }, document.getElementById('game')!.getBoundingClientRect(), activeSidewaysMode());
    }
    private listen(target: EventTarget, event: string, listener: (event: any) => void): void {
        target.addEventListener(event, listener); this.cleanup.push(() => target.removeEventListener(event, listener));
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
