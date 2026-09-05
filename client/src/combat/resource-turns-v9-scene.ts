import Phaser from 'phaser';
import { V9PreviewListenerCleanup, type CombatSceneArgsV9, type SafeAreaInsets } from './contracts';
import { createApprovedWizardAnimations } from './approved-assets';
import { createCombatCamera, panCombatCamera, type CombatCamera } from './camera';
import { computeCombatLayout, type CombatLayout } from './layout';
import { projectCombatV9 } from './presentation';
import { CombatRenderer } from './renderer';
import { ResourceTurnsV9Controls } from './resource-turns-v9-controls';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';

/** Local V9 preview adapter. It consumes fixture snapshots and does not own combat transitions. */
export class ResourceTurnsV9Scene {
    private state: CombatSceneArgsV9['snapshot']; private renderer: CombatRenderer; private controls: ResourceTurnsV9Controls;
    private camera: CombatCamera; private layout: CombatLayout; private frame?: number; private destroyed = false; private unsubscribe?: () => void; private neutralPending = false;
    private cameraPointer?: { id: number; x: number; camera: CombatCamera }; private readonly listeners = new V9PreviewListenerCleanup();
    public constructor(private readonly scene: Phaser.Scene, private readonly args: CombatSceneArgsV9) {
        this.state = structuredClone(args.snapshot); createApprovedWizardAnimations(scene); this.renderer = new CombatRenderer(scene); this.camera = createCombatCamera(projectCombatV9(this.state));
        this.controls = new ResourceTurnsV9Controls(document.getElementById('game')!, this.state, {
            submit: intent => this.submit(intent), pause: paused => void this.pause(paused), neutral: () => void this.neutralize()
        });
        this.controls.root.dataset.preview = args.previewLabel; this.unsubscribe = args.onSnapshot((state, events) => { if (!this.destroyed) { this.state = state; this.controls.update(state, events); this.render(false); } });
        const interrupt = () => { this.controls.interrupt(); void this.neutralize(); };
        const resize = () => { interrupt(); this.render(false); }; this.listeners.emitter(scene.scale, Phaser.Scale.Events.RESIZE, resize);
        this.listeners.dom(window, 'blur', interrupt); this.listeners.dom(document, 'visibilitychange', interrupt);
        const canvas = scene.game.canvas;
        const coordinate = (event: PointerEvent) => clientPointToGame({ x: event.clientX, y: event.clientY }, document.getElementById('game')!.getBoundingClientRect(), activeSidewaysMode()).x;
        const down = (event: PointerEvent) => { if (event.button === 0) this.cameraPointer = { id: event.pointerId, x: coordinate(event), camera: this.camera }; };
        const move = (event: PointerEvent) => { if (!this.cameraPointer || this.cameraPointer.id !== event.pointerId || !this.layout) return; const next = coordinate(event); const delta = this.cameraPointer.x - next; this.cameraPointer.x = next; this.camera = panCombatCamera(projectCombatV9(this.state), this.camera, delta / this.layout.worldScaleX); };
        const end = () => { this.cameraPointer = undefined; }; const cancel = () => { this.cameraPointer = undefined; interrupt(); };
        this.listeners.dom(canvas, 'pointerdown', down); this.listeners.dom(canvas, 'pointermove', move); this.listeners.dom(canvas, 'pointerup', end); this.listeners.dom(canvas, 'pointercancel', cancel);
        this.listeners.once(this.scene.events, Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
        const loop = () => { if (this.destroyed) return; this.render(true); this.frame = requestAnimationFrame(loop); }; loop();
    }
    public destroy(): void { if (this.destroyed) return; this.destroyed = true; if (this.frame) cancelAnimationFrame(this.frame); this.unsubscribe?.(); this.listeners.dispose(); this.args.destroy(); this.controls.destroy(); this.renderer.destroy(); }
    private async submit(intent: Parameters<CombatSceneArgsV9['submit']>[0]): Promise<boolean> { try { const next = await this.args.submit(intent); if (!this.destroyed) { this.state = next; this.controls.update(next); } return true; } catch (error) { if (!this.destroyed) this.controls.setMessage(error instanceof Error ? error.message : 'Intent rejected.'); return false; } }
    private async pause(paused: boolean) { try { const next = await this.args.setPaused(paused); if (!this.destroyed) { this.state = next; this.controls.setPaused(paused); this.controls.update(next); } } catch (error) { if (!this.destroyed) this.controls.setMessage(error instanceof Error ? error.message : 'Pause rejected.'); } }
    private async neutralize() { if (this.neutralPending || this.destroyed) return; this.neutralPending = true; try { const next = await this.args.cancelInput(); if (!this.destroyed) { this.state = next; this.controls.update(next); } } finally { this.neutralPending = false; } }
    private render(pollMovement: boolean): void { if (this.destroyed) return; this.layout = computeCombatLayout(this.scene.scale.width, this.scene.scale.height, readSafeArea(), this.camera); this.controls.setLayout(this.layout); if (pollMovement) this.controls.pollMovement(); this.renderer.render(projectCombatV9(this.state), this.layout, []); Object.assign(this.controls.root.dataset, { simulationTick: String(this.state.tick), combatPhase: this.state.phase, playerThread: String(this.state.units[0].thread), playerShield: String(this.state.units[0].shield) }); }
}
function readSafeArea(): SafeAreaInsets { const style = getComputedStyle(document.documentElement); const value = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0; return { top: value('--safe-area-top'), right: value('--safe-area-right'), bottom: value('--safe-area-bottom'), left: value('--safe-area-left') }; }
