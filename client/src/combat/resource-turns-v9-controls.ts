import type { SimulationEventV9, SimulationIntentV9, SimulationStateV9 } from '../../../shared/simulation-v9';
import { CombatInputController, UnifiedMovementInputController, type AimIntent } from './input';
import { appendV9DamageReceipts, projectCombatV9, projectCombatV9Resources, v9OffenseAllowed } from './presentation';
import { activeSidewaysMode, clientPointToGame } from '../lib/sideways';
import { computeActorStatusLayout, type CombatLayout } from './layout';

type ActionChoice = 'threadball' | 'needlepoint' | 'spoolburst' | 'threadguard' | 'threadleap' | null;
type ActionMenu = 'closed' | 'root' | 'attack' | 'defense';
type Callbacks = {
    submit: (intent: SimulationIntentV9) => Promise<boolean>; pause: (paused: boolean) => void; neutral: () => void;
    preview?: (aim: AimIntent | null) => void; focus?: (actor: 'player' | 'loomkeeper') => void; restart?: () => void;
};

/** V9 gesture ownership is local, generation-guarded, and always yields to authority. */
export class ResourceTurnsV9Controls {
    public readonly root: HTMLDivElement;
    private state: SimulationStateV9; private message = ''; private paused = false;
    private readonly aim = new CombatInputController(); private readonly movement = new UnifiedMovementInputController();
    private receipts: string[] = []; private layout?: CombatLayout; private lastRefresh = 0; private refreshPending = false;
    private cleanup: (() => void)[] = []; private boundary?: string; private generation = 0; private menu: ActionMenu = 'closed';
    private choice: ActionChoice = null; private destroyed = false; private actionSignature = '';

    public constructor(parent: HTMLElement, initial: SimulationStateV9, private readonly callbacks: Callbacks,
        private readonly now: () => number = () => performance.now(), paused = false) {
        this.state = structuredClone(initial); this.paused = paused; this.root = document.createElement('div');
        this.root.className = 'combat-ui combat-v9';
        this.root.innerHTML = `<header class="combat-status"><strong class="combat-turn" aria-live="polite"></strong><span class="v9-thread"></span><span class="combat-timer"></span></header>
<div class="combat-unit-status player-status" data-unit="player" role="group"><span class="unit-status-name">You</span><strong class="unit-status-value"></strong></div>
<div class="combat-unit-status loomkeeper-status" data-unit="loomkeeper" role="group"><span class="unit-status-name">Loomkeeper</span><strong class="unit-status-value"></strong></div>
<button type="button" class="camera-focus-button camera-focus-player" hidden></button><button type="button" class="camera-focus-button camera-focus-loomkeeper" hidden></button>
<button class="pause-button" type="button">Pause</button>
<div class="combat-touch-zone movement-zone" aria-label="Movement pad. Tap a side to face. Drag sideways to walk. Push up to hop."><span class="pad-label">Drag to walk · ↑ hop</span><span class="pad-ring"></span><span class="pad-knob"></span></div>
<div class="combat-touch-zone aim-zone" aria-label="Aim and power pad"><span class="pad-label">Aim · release locks</span><span class="pad-ring"></span><span class="pad-knob"></span></div>
<nav class="combat-actions v9-actions" aria-label="V9 resource actions"><button class="v9-actions-button" type="button">Actions</button><button class="fire-button" type="button">Use</button><div class="v9-action-menu" hidden></div></nav>
<section class="combat-pause-sheet v9-pause-sheet" aria-live="polite" hidden><strong></strong><button class="v9-reenter" type="button">Start fresh preview</button></section>
<div class="combat-message" aria-live="polite"></div>`;
        parent.appendChild(this.root);
        this.button('.v9-actions-button').onclick = () => { if (this.canAct()) { this.menu = this.menu === 'root' ? 'closed' : 'root'; this.refreshActions(); } };
        this.button('.fire-button').onclick = () => this.useSelected();
        this.button('.pause-button').onclick = () => this.callbacks.pause(!this.paused);
        this.button('.v9-reenter').onclick = () => this.callbacks.restart?.();
        for (const [selector, actor] of [['.camera-focus-player', 'player'], ['.camera-focus-loomkeeper', 'loomkeeper']] as const)
            this.button(selector).onclick = () => this.callbacks.focus?.(actor);
        this.bindTouch(); this.update(initial, [], paused);
    }

    /** Returns true only for an ownership boundary, never for ordinary ticking. */
    public update(state: SimulationStateV9, events: SimulationEventV9[] = [], paused = this.paused): boolean {
        const nextBoundary = this.boundaryFor(state, paused); const changed = this.boundary !== undefined && this.boundary !== nextBoundary;
        this.boundary = nextBoundary; this.paused = paused;
        if (changed) this.retireOwnership();
        this.state = structuredClone(state); this.aim.syncAuthoritativeAim(state.aim); this.movement.observeGrounded(state.units[0].grounded);
        const facts = projectCombatV9Resources(state), player = state.units[0], action = this.canAct();
        const offense = this.offenseAllowed(state); const utility = action && !state.castUsed && !state.utilityUsed && state.heldDirection === 0 &&
            player.thread >= 2 && state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0);
        Object.assign(this.root.dataset, { paused: String(paused), thread: facts.player.thread, ruleset: state.rulesetId,
            playerFacing: player.facing < 0 ? 'left' : 'right', playerAirborne: String(facts.player.airborne), offenseAllowed: String(offense),
            aimLocked: String(state.aim !== null), aimId: String(state.aimId), activeActor: state.activeActor, combatPhase: state.phase,
            inputEpoch: String(state.inputEpoch), selectedRelic: state.selectedRelic, terminal: String(this.terminal()) });
        this.element('.combat-turn').textContent = this.phaseCopy();
        this.element('.v9-thread').textContent = `Thread ${facts.player.thread}`;
        this.element('.combat-timer').textContent = this.terminal() ? 'Preview ended' : `${Math.max(0, state.phaseDeadlineTick - state.tick)} ticks left`;
        this.setCard('.player-status', `You · ${player.stitching} Stitching · ${facts.player.thread} · ${facts.player.shield}`);
        this.setCard('.loomkeeper-status', `Loomkeeper · ${state.units[1].stitching} Stitching · ${facts.loomkeeper.thread} · ${facts.loomkeeper.shield}`);
        this.receipts = appendV9DamageReceipts(this.receipts, events);
        this.message = this.receipts.at(-1) ?? this.unavailableReason(offense, utility);
        this.element('.combat-message').textContent = this.message;
        const movement = this.element('.movement-zone'), aim = this.element('.aim-zone');
        movement.toggleAttribute('data-disabled', !action); movement.setAttribute('aria-disabled', String(!action));
        aim.toggleAttribute('data-disabled', !offense); aim.setAttribute('aria-disabled', String(!offense));
        this.button('.pause-button').disabled = !this.pauseAllowed() && !paused; this.button('.pause-button').textContent = paused ? 'Resume' : 'Pause';
        this.element('.v9-pause-sheet').hidden = !paused && !this.terminal();
        this.element('.v9-pause-sheet strong').textContent = this.terminal() ? `${state.finishReason === 'simulation_limit' ? 'Lifecycle safety limit reached' : 'Local preview ended'} · start a fresh preview.` : 'Preview paused · the local tick clock is stopped.';
        this.refreshActions(); this.positionCards(); return changed;
    }

    public setLayout(layout: CombatLayout): void {
        this.layout = layout; this.root.dataset.orientation = layout.orientation;
        for (const [selector, rect] of [['.movement-zone', layout.movementZone], ['.aim-zone', layout.aimZone], ['.combat-status', layout.statusZone], ['.pause-button', layout.pauseZone], ['.combat-actions', layout.actionZone]] as const) this.place(this.element(selector), rect);
        this.positionCards();
    }
    public setCameraFocusControls(options: { enabled: boolean; player: { direction: 'left' | 'right' | null; stitching: number }; loomkeeper: { direction: 'left' | 'right' | null; stitching: number } }): void {
        for (const [selector, label, state] of [['.camera-focus-player', 'Back to You', options.player], ['.camera-focus-loomkeeper', 'Loomkeeper', options.loomkeeper]] as const) {
            const button = this.button(selector), visible = options.enabled && state.direction !== null; button.hidden = !visible; button.disabled = !visible;
            if (state.direction) { button.dataset.side = state.direction; const mark = state.direction === 'left' ? '‹' : '›'; button.textContent = state.direction === 'left' ? `${mark} ${label} · ${state.stitching} Stitching` : `${label} · ${state.stitching} Stitching ${mark}`; button.setAttribute('aria-label', `${label}, ${state.stitching} Stitching, off-screen ${state.direction}`); }
        }
    }
    public pollMovement(): void {
        if (this.destroyed) return; const now = this.now(), facts = this.movementFacts();
        const intent = this.movement.movementIntent({ ...facts, lane: facts.lane === 'locomotion' ? 'ready' : facts.lane }, now);
        if (intent) { this.submitMovement(intent, false); return; }
        if (facts.lane === 'locomotion' && this.movement.ownedPointer() && !this.refreshPending && now - this.lastRefresh >= 100) this.submitMovement({ type: 'walk_refresh' }, true);
    }
    public interrupt(): void { this.retireOwnership(); }
    public destroy(): void { if (this.destroyed) return; this.destroyed = true; this.retireOwnership(); for (const remove of this.cleanup.splice(0)) remove(); this.root.remove(); }

    private useSelected(): void {
        if (!this.canAct()) return;
        if (this.choice === 'threadguard') { this.request({ type: 'threadguard' }); return; }
        if (this.choice === 'threadleap') { this.request({ type: 'threadleap', direction: this.state.units[0].facing }); return; }
        if (this.choice) { this.request({ type: 'select_relic', relicId: this.choice }); return; }
        if (this.canOffend() && this.state.aim) { this.request({ type: 'fire', aimId: this.state.aimId }); return; }
        this.message = this.canOffend() ? 'Choose an Action, then Use it; lock aim before firing.' : this.unavailableReason(false, false); this.element('.combat-message').textContent = this.message;
    }
    private refreshActions(): void {
        const menu = this.element('.v9-action-menu'); menu.hidden = this.menu === 'closed'; const use = this.button('.fire-button'), actions = this.button('.v9-actions-button'), action = this.canAct();
        actions.disabled = !action; use.disabled = !action || (this.choice ? !this.choiceAffordable() : (!this.canOffend() || !this.state.aim));
        const label = this.choice === 'threadguard' ? 'Use Guard · 2 Thread' : this.choice === 'threadleap' ? 'Use Leap · 2 Thread' : this.choice ? `Use ${relicLabel(this.choice)}` : this.state.aim ? `Use ${relicLabel(this.state.selectedRelic)}` : 'Use';
        use.textContent = label; use.setAttribute('aria-label', label);
        const signature = [this.menu, action, this.choice, this.state.units[0].thread, this.state.aimId, Boolean(this.state.aim), use.disabled].join(':');
        if (signature === this.actionSignature) return;
        this.actionSignature = signature;
        const options: { label: string; className: string; choice?: ActionChoice; next?: ActionMenu }[] = this.menu === 'root' ? [{ label: 'Attack', className: 'v9-attack', next: 'attack' }, { label: 'Defense', className: 'v9-defense', next: 'defense' }]
            : this.menu === 'attack' ? (['threadball', 'needlepoint', 'spoolburst'] as const).map(choice => ({ label: relicLabel(choice), className: `v9-choice relic-${choice}`, choice }))
            : this.menu === 'defense' ? [{ label: 'Guard · 2 Thread', className: 'v9-choice v9-guard', choice: 'threadguard' }, { label: 'Leap · 2 Thread', className: 'v9-choice v9-leap', choice: 'threadleap' }] : [];
        menu.innerHTML = '';
        for (const option of options) { const button = document.createElement('button'); button.type = 'button'; button.className = option.className; button.textContent = option.label; button.disabled = !action || (option.choice !== undefined && !this.choiceAffordable(option.choice)); if (button.disabled && option.choice) button.title = 'Not enough Thread for this Action.'; button.onclick = () => { if (button.disabled) return; if (option.next) this.menu = option.next; else { this.choice = option.choice ?? null; this.menu = 'closed'; } this.refreshActions(); }; menu.appendChild(button); }
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-disabled', String(button.disabled));
    }
    private bindTouch(): void {
        const movement = this.element('.movement-zone');
        this.listen(movement, 'pointerdown', event => { if (!this.canAct() || event.button > 0) return; const point = this.point(event); if (this.movement.beginMovement(event.pointerId, point, this.layout?.movementZone ?? movement.getBoundingClientRect())) this.capture(movement, event.pointerId); });
        this.listen(movement, 'pointermove', event => { if (this.movement.moveMovement(event.pointerId, this.point(event), this.movementFacts(), this.now())) this.pollMovement(); });
        const end = (event: PointerEvent) => { const result = this.movement.finishMovement(event.pointerId); if (!result) return; if (result.face) this.request({ type: 'face', direction: result.face }); else if (result.release) this.request({ type: 'walk_stop' }); };
        this.listen(movement, 'pointerup', end); this.listen(movement, 'pointercancel', () => { this.movement.interrupt(); this.callbacks.neutral(); });
        const aim = this.element('.aim-zone');
        this.listen(aim, 'pointerdown', event => { if (!this.canOffend() || event.button > 0) return; this.capture(aim, event.pointerId); if (this.aim.begin('aim', event.pointerId, this.point(event), Math.min(aim.clientWidth, aim.clientHeight) / 2)) this.callbacks.preview?.(this.aim.aimIntent()); });
        this.listen(aim, 'pointermove', event => { if (this.aim.move(event.pointerId, this.point(event))) this.callbacks.preview?.(this.aim.aimIntent()); });
        this.listen(aim, 'pointerup', event => { const command = this.aim.end(event.pointerId, true); this.callbacks.preview?.(this.aim.lockedAim); if (command?.type === 'aim') this.request(command); });
        this.listen(aim, 'pointercancel', event => { this.aim.cancel(event.pointerId); this.callbacks.preview?.(null); this.callbacks.neutral(); });
    }
    private request(intent: SimulationIntentV9): void { const generation = this.generation; void this.callbacks.submit(intent).then(accepted => { if (this.destroyed || generation !== this.generation) return; if (!accepted) { this.message = 'Authority rejected that action; use a fresh gesture.'; return; } if (intent.type === 'select_relic') { this.choice = null; this.refreshActions(); } }); }
    private submitMovement(intent: SimulationIntentV9, refresh: boolean): void { if (refresh) this.refreshPending = true; const generation = this.generation; void this.callbacks.submit(intent).then(accepted => { if (this.destroyed || generation !== this.generation || !accepted) return; if (intent.type === 'walk_start' || intent.type === 'walk_stop' || intent.type === 'walk_refresh' || intent.type === 'jump') this.movement.submittedMovementIntent(intent); if (refresh) this.lastRefresh = this.now(); }).finally(() => { if (!this.destroyed && generation === this.generation && refresh) this.refreshPending = false; }); }
    private retireOwnership(): void { this.generation++; this.aim.cancel(); this.aim.clearAim(); this.movement.interrupt(); this.choice = null; this.menu = 'closed'; this.refreshPending = false; this.callbacks.preview?.(null); }
    private boundaryFor(state: SimulationStateV9, paused: boolean): string { return [state.turn, state.activeActor, state.phase, state.inputEpoch, paused, this.terminal(state), state.castUsed, state.utilityUsed, state.selectedRelic].join(':'); }
    private terminal(state = this.state): boolean { return state.phase === 'finished' || state.winner !== null; }
    private canAct(): boolean { return !this.destroyed && !this.paused && !this.terminal() && this.state.activeActor === 'player' && (this.state.phase === 'action' || this.state.phase === 'retreat'); }
    private canOffend(): boolean { return v9OffenseAllowed(this.state, this.paused); }
    private choiceAffordable(choice = this.choice): boolean { const cost = choice === 'spoolburst' ? 5 : choice === 'needlepoint' ? 3 : choice ? 2 : 0; return this.state.units[0].thread >= cost; }
    private offenseAllowed(state: SimulationStateV9): boolean { return v9OffenseAllowed(state, this.paused); }
    private pauseAllowed(): boolean { return this.state.activeActor === 'player' && this.state.phase === 'action' && !this.terminal(); }
    private movementFacts() { const player = this.state.units[0]; return { grounded: player.grounded, facing: player.facing, heldDirection: this.state.heldDirection, lane: this.canAct() ? (this.state.heldDirection ? 'locomotion' : 'ready') : 'blocked' } as const; }
    private unavailableReason(offense: boolean, utility: boolean): string { if (this.terminal()) return 'This local preview is terminal. Start a fresh preview; it has no session or reward.'; if (this.paused) return 'Preview paused. Resume before acting.'; if (this.state.activeActor === 'loomkeeper') return 'Loomkeeper behavior is deferred to V9D; this local preview does not simulate a response.'; if (this.state.phase === 'retreat') return 'Retreat phase: movement only until the authority deadline.'; if (!offense && this.state.heldDirection) return 'Release movement before aiming, selecting a Relic, or using a utility.'; if (!utility && (this.state.castUsed || this.state.utilityUsed)) return 'That turn has already used its Relic or utility.'; return 'Choose Actions for Attack or Defense. Costs are paid only after Use is accepted.'; }
    private phaseCopy(): string { if (this.terminal()) return 'Local preview complete'; if (this.paused) return 'Preview paused'; return this.state.activeActor === 'player' ? `You · ${this.state.phase}` : `Loomkeeper · ${this.state.phase}`; }
    private positionCards(): void { if (!this.layout) return; const positions = computeActorStatusLayout(this.layout, projectCombatV9(this.state).units); for (const [selector, rect] of [['.player-status', positions.player], ['.loomkeeper-status', positions.loomkeeper]] as const) { const element = this.element(selector); element.hidden = !rect; if (rect) this.place(element, rect); } }
    private setCard(selector: string, text: string): void { const element = this.element(selector); element.setAttribute('aria-label', text); this.element(`${selector} .unit-status-value`).textContent = text; }
    private point(event: PointerEvent) { const bounds = this.root.parentElement!.getBoundingClientRect(); return clientPointToGame({ x: event.clientX, y: event.clientY }, bounds, activeSidewaysMode()); }
    private capture(element: HTMLElement, pointerId: number): void { try { element.setPointerCapture(pointerId); } catch {} }
    private listen(element: HTMLElement, type: string, handler: (event: PointerEvent) => void): void { element.addEventListener(type, handler); this.cleanup.push(() => element.removeEventListener(type, handler)); }
    private place(element: HTMLElement, rect: { x: number; y: number; width: number; height: number }): void { Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }); }
    private element(selector: string): HTMLElement { return this.root.querySelector<HTMLElement>(selector)!; }
    private button(selector: string): HTMLButtonElement { return this.root.querySelector<HTMLButtonElement>(selector)!; }
}

function relicLabel(choice: Exclude<ActionChoice, 'threadguard' | 'threadleap' | null>): string { return choice === 'threadball' ? 'Threadball · 2' : choice === 'needlepoint' ? 'Needlepoint · 3' : 'Spoolburst · 5'; }
