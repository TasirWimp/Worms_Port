import type { SimulationEventV9, SimulationIntentV9, SimulationStateV9 } from '../../../shared/simulation-v9';
import { CombatInputController, UnifiedMovementInputController } from './input';
import { appendV9DamageReceipts, projectCombatV9Resources, v9OffenseAllowed } from './presentation';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import type { CombatLayout } from './layout';

type Callbacks = { submit: (intent: SimulationIntentV9) => Promise<boolean>; pause: (paused: boolean) => void; neutral: () => void };

/** Touch controls render authority facts and submit intents; they never mutate V9 state. */
export class ResourceTurnsV9Controls {
    public readonly root: HTMLDivElement;
    private state: SimulationStateV9; private message = '';
    private readonly aim = new CombatInputController();
    private readonly movement = new UnifiedMovementInputController();
    private receipts: string[] = []; private layout?: CombatLayout; private lastRefresh = 0; private refreshPending = false; private cleanup: (() => void)[] = [];
    public constructor(parent: HTMLElement, initial: SimulationStateV9, private readonly callbacks: Callbacks,
        private readonly now: () => number = () => performance.now()) {
        this.state = structuredClone(initial); this.root = document.createElement('div');
        this.root.className = 'combat-ui combat-v9';
        this.root.innerHTML = `<header class="combat-status"><strong>V9 resource engineering preview · local-only</strong><span class="v9-thread"></span></header>
<section class="v9-resource-readout" aria-live="polite"><span class="v9-player-shield"></span><span class="v9-loomkeeper-thread"></span><span class="v9-loomkeeper-shield"></span><span class="v9-receipt"></span></section>
<div class="combat-touch-zone movement-zone" aria-label="Movement pad. Drag sideways to walk. Push up to hop."><span class="pad-label">Drag to walk · ↑ hop</span><span class="pad-ring"></span><span class="pad-knob"></span></div>
<div class="combat-touch-zone aim-zone" aria-label="Aim and power pad"><span class="pad-label">Aim · release locks</span><span class="pad-ring"></span><span class="pad-knob"></span></div>
<nav class="combat-actions v9-actions" aria-label="V9 resource actions"><button class="v9-face-left" type="button">Face ←</button><button class="v9-face-right" type="button">Face →</button><button class="v9-guard" type="button">Guard · 2 Thread</button><button class="v9-leap" type="button">Leap · 2 Thread</button><button class="relic-threadball" type="button">Threadball · 2</button><button class="relic-needlepoint" type="button">Needlepoint · 3</button><button class="relic-spoolburst" type="button">Spoolburst · 5</button><button class="fire-button" type="button">Fire</button><button class="pause-button" type="button">Pause</button></nav><div class="combat-message" aria-live="polite"></div>`;
        parent.appendChild(this.root);
        this.button('.v9-face-left').onclick = () => { void this.callbacks.submit({ type: 'face', direction: -1 }); };
        this.button('.v9-face-right').onclick = () => { void this.callbacks.submit({ type: 'face', direction: 1 }); };
        this.button('.v9-guard').onclick = () => { void this.callbacks.submit({ type: 'threadguard' }); };
        this.button('.v9-leap').onclick = () => { void this.callbacks.submit({ type: 'threadleap', direction: this.state.units[0].facing }); };
        for (const relic of ['threadball', 'needlepoint', 'spoolburst'] as const)
            this.button(`.relic-${relic}`).onclick = () => { if (this.canOffend()) void this.callbacks.submit({ type: 'select_relic', relicId: relic }); };
        this.button('.fire-button').onclick = () => { if (this.canOffend()) void this.callbacks.submit({ type: 'fire', aimId: this.state.aimId }); };
        this.button('.pause-button').onclick = () => this.callbacks.pause(this.root.dataset.paused !== 'true');
        this.bindTouch(); this.update(initial, []);
    }
    public update(state: SimulationStateV9, events: SimulationEventV9[] = []): void {
        this.state = structuredClone(state); this.aim.syncAuthoritativeAim(state.aim); const facts = projectCombatV9Resources(state); const player = state.units[0];
        const action = (state.phase === 'action' || state.phase === 'retreat') && state.activeActor === 'player' && state.winner === null && this.root.dataset.paused !== 'true';
        const utility = action && !state.castUsed && !state.utilityUsed && state.heldDirection === 0 && player.thread >= 2 &&
            state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0);
        const offense = this.offenseAllowed(state);
        this.root.dataset.paused = this.root.dataset.paused ?? 'false'; this.root.dataset.thread = facts.player.thread; this.root.dataset.ruleset = state.rulesetId;
        this.root.dataset.playerFacing = player.facing < 0 ? 'left' : 'right'; this.root.dataset.playerAirborne = String(facts.player.airborne);
        this.root.dataset.offenseAllowed = String(offense);
        this.root.dataset.aimLocked = String(state.aim !== null); this.root.dataset.aimId = String(state.aimId);
        this.root.querySelector('.v9-thread')!.textContent = `Thread ${facts.player.thread}`;
        this.root.querySelector('.v9-player-shield')!.textContent = `You · ${facts.player.shield}`;
        this.root.querySelector('.v9-loomkeeper-thread')!.textContent = `Loomkeeper Thread ${facts.loomkeeper.thread}`;
        this.root.querySelector('.v9-loomkeeper-shield')!.textContent = `Loomkeeper · ${facts.loomkeeper.shield}`;
        this.receipts = appendV9DamageReceipts(this.receipts, events); this.root.querySelector('.v9-receipt')!.textContent = this.receipts.join(' | ');
        this.button('.v9-guard').disabled = !utility; this.button('.v9-leap').disabled = !utility;
        this.button('.fire-button').disabled = !offense || !state.aim || player.thread < ({ threadball: 2, needlepoint: 3, spoolburst: 5 }[state.selectedRelic]);
        for (const relic of ['threadball', 'needlepoint', 'spoolburst'] as const) this.button(`.relic-${relic}`).disabled = !offense;
        this.button('.v9-face-left').disabled = !action; this.button('.v9-face-right').disabled = !action;
        const movement = this.root.querySelector<HTMLElement>('.movement-zone')!, aim = this.root.querySelector<HTMLElement>('.aim-zone')!;
        movement.toggleAttribute('data-disabled', !action); movement.setAttribute('aria-disabled', String(!action));
        aim.toggleAttribute('data-disabled', !offense); aim.setAttribute('aria-disabled', String(!offense));
        const pauseAllowed = state.phase === 'action' && state.activeActor === 'player' && state.winner === null;
        this.button('.pause-button').disabled = (!pauseAllowed || !action) && this.root.dataset.paused !== 'true'; this.button('.pause-button').textContent = this.root.dataset.paused === 'true' ? 'Resume' : 'Pause';
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-disabled', String(button.disabled));
        this.root.querySelector('.combat-message')!.textContent = this.message;
    }
    public setPaused(paused: boolean): void { this.root.dataset.paused = String(paused); this.update(this.state); }
    public setLayout(layout: CombatLayout): void { this.layout = layout; this.root.dataset.orientation = layout.orientation; for (const [selector, rect] of [['.movement-zone', layout.movementZone], ['.aim-zone', layout.aimZone], ['.combat-status', layout.statusZone], ['.pause-button', layout.pauseZone]] as const) { const element = this.root.querySelector<HTMLElement>(selector)!; Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }); } const actions = this.root.querySelector<HTMLElement>('.combat-actions')!; Object.assign(actions.style, { left: `${layout.actionZone.x}px`, top: `${Math.max(0, layout.actionZone.y - 104)}px`, width: `${layout.actionZone.width}px`, height: '156px' }); }
    public pollMovement(): void {
        const now = this.now(); const facts = this.movementFacts();
        // The frozen controller owns center-stop, reversal and its 250ms hop
        // deadline. A held V9 lane is presented as ready only for this decision;
        // refresh remains the fallback when no controller transition is due.
        const intent = this.movement.movementIntent({ ...facts, lane: facts.lane === 'locomotion' ? 'ready' : facts.lane }, now);
        if (intent) { this.submitMovement(intent, false); return; }
        if (facts.lane === 'locomotion' && this.movement.ownedPointer() && !this.refreshPending && now - this.lastRefresh >= 100)
            this.submitMovement({ type: 'walk_refresh' }, true);
    }
    public interrupt(): void { this.aim.cancel(); this.aim.clearAim(); this.movement.interrupt(); }
    public setMessage(message: string): void { this.message = message; this.root.querySelector('.combat-message')!.textContent = message; }
    public destroy(): void { this.interrupt(); for (const remove of this.cleanup.splice(0)) remove(); this.root.remove(); }
    private bindTouch(): void {
        const movement = this.root.querySelector<HTMLElement>('.movement-zone')!;
        this.listen(movement, 'pointerdown', event => { if (!this.canAct() || event.button > 0) return; const point = this.point(event); this.movement.beginMovement(event.pointerId, point, this.layout?.movementZone ?? movement.getBoundingClientRect()); this.capture(movement, event.pointerId); });
        this.listen(movement, 'pointermove', event => { const facts = this.movementFacts(); if (!this.movement.moveMovement(event.pointerId, this.point(event), facts, this.now())) return; this.pollMovement(); });
        const end = (event: PointerEvent) => { const result = this.movement.finishMovement(event.pointerId); if (!result) return; if (result.face) this.callbacks.submit({ type: 'face', direction: result.face }); else if (result.release) this.callbacks.submit({ type: 'walk_stop' }); };
        this.listen(movement, 'pointerup', end); this.listen(movement, 'pointercancel', () => { this.movement.interrupt(); this.callbacks.neutral(); });
        const aim = this.root.querySelector<HTMLElement>('.aim-zone')!;
        this.listen(aim, 'pointerdown', event => { if (!this.canOffend() || event.button > 0) return; this.capture(aim, event.pointerId); this.aim.begin('aim', event.pointerId, this.point(event), Math.min(aim.clientWidth, aim.clientHeight) / 2); });
        this.listen(aim, 'pointermove', event => this.aim.move(event.pointerId, this.point(event)));
        this.listen(aim, 'pointerup', event => { const command = this.aim.end(event.pointerId, true); if (command?.type === 'aim') void this.callbacks.submit(command); });
        this.listen(aim, 'pointercancel', event => { this.aim.cancel(event.pointerId); this.callbacks.neutral(); });
    }
    private canAct(): boolean { return (this.state.phase === 'action' || this.state.phase === 'retreat') && this.state.activeActor === 'player' && this.root.dataset.paused !== 'true'; }
    private canOffend(): boolean { return this.offenseAllowed(this.state); }
    private offenseAllowed(state: SimulationStateV9): boolean { return v9OffenseAllowed(state, this.root.dataset.paused === 'true'); }
    private movementFacts() { const player = this.state.units[0]; return { grounded: player.grounded, facing: player.facing, heldDirection: this.state.heldDirection, lane: this.canAct() ? (this.state.heldDirection ? 'locomotion' : 'ready') : 'blocked' } as const; }
    private point(event: PointerEvent) { const bounds = this.root.parentElement!.getBoundingClientRect(); return clientPointToGame({ x: event.clientX, y: event.clientY }, bounds, activeSidewaysMode()); }
    private capture(element: HTMLElement, pointerId: number): void { try { element.setPointerCapture(pointerId); } catch { /* synthetic tests and detached controls have no active pointer to capture. */ } }
    private listen(element: HTMLElement, type: string, handler: (event: PointerEvent) => void): void { element.addEventListener(type, handler); this.cleanup.push(() => element.removeEventListener(type, handler)); }
    private submitMovement(intent: SimulationIntentV9, refresh: boolean): void {
        if (refresh) this.refreshPending = true;
        void this.callbacks.submit(intent).then(accepted => {
            if (!accepted) return;
            if (intent.type === 'walk_start' || intent.type === 'walk_stop' || intent.type === 'walk_refresh' || intent.type === 'jump')
                this.movement.submittedMovementIntent(intent);
            if (refresh) this.lastRefresh = this.now();
        }).finally(() => { if (refresh) this.refreshPending = false; });
    }
    private button(selector: string): HTMLButtonElement { return this.root.querySelector<HTMLButtonElement>(selector)!; }
}
