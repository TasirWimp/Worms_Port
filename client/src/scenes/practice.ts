import Phaser from 'phaser';

import type { PlayerCalling } from '../../../shared/simulation';
import {
    liveCombatArgs,
    PRACTICE_CLIENT_REGISTRY_KEY,
    type PracticeClient
} from '../practice/client';

export default class PracticeScene extends Phaser.Scene {
    private client: PracticeClient;
    private root: HTMLElement;
    private calling: PlayerCalling = 'wizard';
    private readonly unsubscribers: (() => void)[] = [];

    public constructor() {
        super({ key: 'practice' });
        this.shutdown = this.shutdown.bind(this);
    }

    public create(): void {
        this.client = this.registry.get(PRACTICE_CLIENT_REGISTRY_KEY) as PracticeClient;
        const host = document.getElementById('game');
        if (!host || !this.client) throw new Error('Practice scene requires the live client.');
        drawBackdrop(this);
        this.root = document.createElement('main');
        this.root.className = 'practice-shell';
        this.root.innerHTML = `
            <section class="practice-card" aria-labelledby="practice-title">
                <p class="practice-eyebrow">NIMble Knots · Cotton Clash</p>
                <h1 id="practice-title">Practice Clash</h1>
                <p class="practice-intro">Face the deterministic Loomkeeper instantly. No wallet, matchmaking, or reward pool.</p>
                <p class="practice-sideways-note practice-sideways-note-right">
                    <strong>Before playing:</strong> keep the phone upright, switch off Auto rotate,
                    then turn it so the phone's top points left.
                </p>
                <p class="practice-sideways-note practice-sideways-note-left">
                    <strong>Before playing:</strong> keep the phone upright, switch off Auto rotate,
                    then turn it so the phone's top points right.
                </p>
                <fieldset class="calling-picker">
                    <legend>Choose your Calling</legend>
                    <button type="button" data-calling="wizard">Wizard<small>Spoolcraft</small></button>
                    <button type="button" data-calling="thief">Thief<small>Threadwork</small></button>
                    <button type="button" data-calling="warrior">Warrior<small>Patchguard</small></button>
                </fieldset>
                <p class="calling-note">All Callings use the same practice rules and statistics.</p>
                <button type="button" class="practice-start">Start Practice</button>
                <p class="practice-message" aria-live="polite"></p>
            </section>
        `;
        host.appendChild(this.root);
        const current = this.client.currentSnapshot();
        if (current) this.calling = current.calling;
        if (current?.status === 'active') {
            this.startButton().textContent = current.paused ? 'Resume Paused Clash' : 'Resume Practice';
        }
        this.refreshCalling();
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-calling]')) {
            button.addEventListener('click', () => {
                this.calling = button.dataset.calling as PlayerCalling;
                this.refreshCalling();
            });
        }
        this.startButton().addEventListener('click', () => void this.startPractice());
        this.unsubscribers.push(this.client.onConnection((state) => {
            this.startButton().disabled = state === 'reconnecting';
            this.setMessage(state === 'reconnecting' ? 'Reconnecting to the Practice server…' : '');
        }));
        this.unsubscribers.push(this.client.onUnavailable((message) => {
            this.startButton().textContent = 'Start Fresh Practice';
            this.startButton().disabled = false;
            this.setMessage(message);
        }));
        this.unsubscribers.push(this.client.onError((message) => this.setMessage(message)));
        this.unsubscribers.push(this.client.onResult((result) => {
            this.scene.start('result', { result, calling: this.calling });
        }));
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
    }

    private async startPractice(): Promise<void> {
        const button = this.startButton();
        button.disabled = true;
        this.setMessage('Weaving the Patch…');
        try {
            const snapshot = await this.client.start(this.calling);
            this.scene.start('combat', liveCombatArgs(this.client, snapshot));
        } catch (error) {
            button.disabled = false;
            this.setMessage(error instanceof Error ? error.message : 'Practice could not start.');
        }
    }

    private refreshCalling(): void {
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-calling]')) {
            const selected = button.dataset.calling === this.calling;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        }
    }

    private startButton(): HTMLButtonElement {
        return this.root.querySelector('.practice-start') as HTMLButtonElement;
    }

    private setMessage(message: string): void {
        const field = this.root.querySelector('.practice-message') as HTMLElement;
        field.textContent = message;
        field.hidden = !message;
    }

    private shutdown(): void {
        for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
        this.root?.remove();
    }
}

function drawBackdrop(scene: Phaser.Scene): void {
    const { width, height } = scene.scale;
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xD9F2F3).fillRect(0, 0, width, height);
    graphics.fillStyle(0xFFFFFF, 0.9);
    graphics.fillCircle(width * 0.18, height * 0.16, Math.max(32, width * 0.12));
    graphics.fillCircle(width * 0.82, height * 0.13, Math.max(38, width * 0.14));
    graphics.fillStyle(0x5F4B8B).fillCircle(width * 0.1, height, width * 0.42);
    graphics.fillStyle(0x88B04B).fillCircle(width * 0.72, height, width * 0.52);
}
