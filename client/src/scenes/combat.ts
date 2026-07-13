import Phaser from 'phaser';

import type { ChallengeResult, ChallengeSnapshot } from '../../../shared/protocol';
import type { SimulationCommand, SimulationState } from '../../../shared/simulation';
import { CombatControls } from '../combat/controls';
import type { CombatSceneArgs, SafeAreaInsets } from '../combat/contracts';
import { createCombatFixture } from '../combat/fixture';
import { computeCombatLayout, type CombatLayout } from '../combat/layout';
import { trajectoryPreview } from '../combat/preview';
import { CombatRenderer } from '../combat/renderer';

export default class CombatScene extends Phaser.Scene {
    private args: CombatSceneArgs;
    private snapshot: ChallengeSnapshot;
    private combatRenderer: CombatRenderer;
    private controls: CombatControls;
    private layout: CombatLayout;
    private preview: { x: number; y: number }[] = [];
    private pendingCommand = false;
    private transitioning = false;
    private readonly unsubscribers: (() => void)[] = [];

    public constructor() {
        super({ key: 'combat' });
        this.onResize = this.onResize.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
        this.onWindowBlur = this.onWindowBlur.bind(this);
        this.onVisibility = this.onVisibility.bind(this);
        this.shutdown = this.shutdown.bind(this);
    }

    public init(args?: CombatSceneArgs): void {
        this.args = args?.snapshot ? args : createCombatFixture();
        this.snapshot = structuredClone(this.args.snapshot);
    }

    public create(): void {
        const parent = document.getElementById('game');
        if (!parent) throw new Error('Combat scene requires the #game host.');
        this.combatRenderer = new CombatRenderer(this);
        this.controls = new CombatControls(parent, this.snapshot, {
            onCommand: (command) => void this.submit(command),
            onAimPreview: (aim) => {
                this.preview = aim
                    ? trajectoryPreview(this.snapshot.simulation as SimulationState, aim)
                    : [];
                this.render();
            },
            onPauseChange: (paused) => void this.setPaused(paused),
            onRetry: () => void this.retry()
        });
        if (this.args.previewLabel) {
            this.controls.root.dataset.preview = this.args.previewLabel;
            this.controls.setMessage(this.args.previewLabel);
        }
        this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
        window.addEventListener('resize', this.onViewportChange);
        window.addEventListener('orientationchange', this.onViewportChange);
        window.addEventListener('blur', this.onWindowBlur);
        document.addEventListener('visibilitychange', this.onVisibility);
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
                this.scene.start('result', { calling: this.snapshot.calling, message });
            }));
        }
        if (this.args.onError) {
            this.unsubscribers.push(this.args.onError((message) => this.controls.setMessage(message)));
        }
        this.onResize();
    }

    private async submit(command: SimulationCommand): Promise<void> {
        if (this.pendingCommand) return;
        if (this.snapshot.simulation.activeActor !== 'player' ||
            this.snapshot.simulation.phase !== 'awaiting_command') return;
        this.pendingCommand = true;
        this.controls.setBusy(true);
        this.controls.root.dataset.lastCommand = command.type;
        try {
            const next = await this.args.submitCommand(command, this.snapshot.simulation.turn);
            this.acceptSnapshot(next);
            this.controls.setMessage('');
            this.controls.submissionFinished(true);
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Command failed.');
            this.controls.submissionFinished(false);
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
        if (next.challengeId === this.snapshot.challengeId && next.revision < this.snapshot.revision) {
            return;
        }
        this.snapshot = structuredClone(next);
        if (!this.controls) return;
        this.controls.update(this.snapshot);
        this.preview = this.controls.input.lockedAim && !this.snapshot.paused
            ? trajectoryPreview(
                this.snapshot.simulation as SimulationState,
                this.controls.input.lockedAim
            )
            : [];
        this.render();
    }

    private showResult(result: ChallengeResult): void {
        if (this.transitioning || result.challengeId !== this.snapshot.challengeId) return;
        this.transitioning = true;
        this.scene.start('result', { result, calling: this.snapshot.calling });
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

    private render(): void {
        if (!this.layout || !this.combatRenderer) return;
        this.controls.root.dataset.previewPoints = String(this.preview.length);
        this.combatRenderer.render(
            this.snapshot.simulation as SimulationState,
            this.layout,
            this.preview
        );
    }

    private shutdown(): void {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('orientationchange', this.onViewportChange);
        window.removeEventListener('blur', this.onWindowBlur);
        document.removeEventListener('visibilitychange', this.onVisibility);
        for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
        this.controls?.destroy();
        this.combatRenderer?.destroy();
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
