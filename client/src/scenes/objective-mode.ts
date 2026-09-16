import Phaser from 'phaser';

import { V10_R8_RULESET_ID, type V10R8ObjectiveMode } from '../../../shared/objective-v10-r8';
import { PRACTICE_CLIENT_REGISTRY_KEY, type PracticeClient } from '../practice/client';
import { drawBackdrop } from './practice';

const MODE_COPY: Readonly<Record<V10R8ObjectiveMode, Readonly<{ title: string; short: string; detail: string }>>> = {
    defend: {
        title: 'Defend',
        short: 'Protect your chest',
        detail: 'Your chest is on the left. Stop the Loomkeeper from touching it or dropping it through the world.'
    },
    collect: {
        title: 'Collect',
        short: 'Bank the coin lead',
        detail: 'Seven coins cross the arena. Collect more than the Loomkeeper, or build a lead that cannot be caught.'
    },
    claim: {
        title: 'Claim',
        short: 'Take their chest',
        detail: 'The Loomkeeper guards the chest on the right. Touch it or drop it through the world to claim the match.'
    }
};

export default class ObjectiveModeScene extends Phaser.Scene {
    private root?: HTMLElement;
    private selected: V10R8ObjectiveMode = 'collect';
    private starting = false;
    private client: PracticeClient;
    private autoStart = false;
    private activeMode?: V10R8ObjectiveMode;

    public constructor() {
        super({ key: 'objective-mode' });
    }

    public init(args?: { selectedMode?: V10R8ObjectiveMode; autoStart?: boolean }): void {
        this.starting = false;
        this.autoStart = args?.autoStart === true;
        this.activeMode = undefined;
        if (args?.selectedMode === 'defend' || args?.selectedMode === 'collect' || args?.selectedMode === 'claim') {
            this.selected = args.selectedMode;
        }
    }

    public create(): void {
        const host = document.getElementById('game');
        this.client = this.registry.get(PRACTICE_CLIENT_REGISTRY_KEY) as PracticeClient;
        if (!host || !this.client) throw new Error('Objective mode scene requires the live Practice client.');
        drawBackdrop(this);
        this.root = document.createElement('main');
        this.root.className = 'practice-shell objective-mode-shell';
        this.root.dataset.selectedMode = this.selected;
        this.root.innerHTML = `
            <section class="practice-card objective-mode-card" aria-labelledby="objective-mode-title">
                <p class="practice-eyebrow">V10 R8 server Practice canary · Wizard Knotkin</p>
                <h1 id="objective-mode-title">Choose the objective</h1>
                <p class="practice-intro">The same Volcanic Ruin supports three ways to win.</p>
                <fieldset class="calling-picker objective-mode-picker">
                    <legend>Choose the match mode</legend>
                    ${(['defend', 'collect', 'claim'] as const).map(mode => `
                        <button type="button" data-objective-mode="${mode}">
                            ${MODE_COPY[mode].title}<small>${MODE_COPY[mode].short}</small>
                        </button>`).join('')}
                </fieldset>
                <p class="calling-note objective-mode-description"></p>
                <button type="button" class="practice-start objective-mode-start"></button>
                <p class="practice-message" aria-live="polite"></p>
            </section>`;
        host.appendChild(this.root);
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-objective-mode]')) {
            button.addEventListener('click', () => {
                this.selected = button.dataset.objectiveMode as V10R8ObjectiveMode;
                this.refresh();
            });
        }
        this.root.querySelector<HTMLButtonElement>('.objective-mode-start')!
            .addEventListener('click', () => void this.startSelectedMode());
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.root?.remove());
        const current = this.client.currentCombatSnapshot();
        if (current?.status === 'active' && current.rulesetId === V10_R8_RULESET_ID) {
            this.selected = current.objectiveMode;
            this.activeMode = current.objectiveMode;
        }
        this.refresh();
        if (this.autoStart) queueMicrotask(() => void this.startSelectedMode());
    }

    private refresh(): void {
        if (!this.root) return;
        this.root.dataset.selectedMode = this.selected;
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-objective-mode]')) {
            const selected = button.dataset.objectiveMode === this.selected;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
            button.disabled = this.activeMode !== undefined;
        }
        this.root.querySelector<HTMLElement>('.objective-mode-description')!.textContent = MODE_COPY[this.selected].detail;
        this.root.querySelector<HTMLButtonElement>('.objective-mode-start')!.textContent = this.activeMode
            ? `Resume ${MODE_COPY[this.selected].title}`
            : `Start ${MODE_COPY[this.selected].title}`;
    }

    private async startSelectedMode(): Promise<void> {
        if (this.starting || !this.root) return;
        this.starting = true;
        const button = this.root.querySelector<HTMLButtonElement>('.objective-mode-start')!;
        const message = this.root.querySelector<HTMLElement>('.practice-message')!;
        button.disabled = true;
        message.textContent = 'Weaving the objective…';
        try {
            const snapshot = await this.client.startObjectiveCombat(this.selected);
            const args = await this.client.combatArgs(snapshot);
            if (!this.scene.isActive()) return;
            const url = new URL(window.location.href);
            url.searchParams.set('objective-mode', this.selected);
            window.history.replaceState(null, '', url);
            this.scene.start('combat', args);
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : 'The objective preview could not start.';
            button.disabled = false;
            this.starting = false;
        }
    }
}
