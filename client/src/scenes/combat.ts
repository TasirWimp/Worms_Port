import Phaser from 'phaser';

import type { ChallengeSnapshot } from '../../../shared/protocol';
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
            onPauseChange: () => this.render(),
            onRetry: () => this.controls.setMessage(
                'Retry becomes active with the WP-011 practice lifecycle.'
            )
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
            if (next.simulation.rulesetId !== 'nimble-knots-artillery-v2') {
                throw new Error('Combat scene accepts only v2 challenge snapshots.');
            }
            if (next.revision < this.snapshot.revision) {
                throw new Error('A stale challenge snapshot was ignored.');
            }
            this.snapshot = structuredClone(next);
            this.controls.update(this.snapshot);
            this.preview = this.controls.input.lockedAim
                ? trajectoryPreview(
                    this.snapshot.simulation as SimulationState,
                    this.controls.input.lockedAim
                )
                : [];
            this.controls.setMessage('');
            this.render();
            this.controls.submissionFinished(true);
        } catch (error) {
            this.controls.setMessage(error instanceof Error ? error.message : 'Command failed.');
            this.controls.submissionFinished(false);
        } finally {
            this.pendingCommand = false;
            this.controls.setBusy(false);
        }
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
