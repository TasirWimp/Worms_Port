import Phaser from 'phaser';

import type { ChallengeResult } from '../../../shared/protocol';
import type { PlayerCalling } from '../../../shared/simulation';
import {
    liveCombatArgs,
    PRACTICE_CLIENT_REGISTRY_KEY,
    type PracticeClient
} from '../practice/client';

type ResultSceneArgs = {
    result?: ChallengeResult;
    calling: PlayerCalling;
    message?: string;
};

export default class ResultScene extends Phaser.Scene {
    private args: ResultSceneArgs;
    private client: PracticeClient;
    private root: HTMLElement;

    public constructor() {
        super({ key: 'result' });
        this.shutdown = this.shutdown.bind(this);
    }

    public init(args: ResultSceneArgs): void {
        this.args = args;
    }

    public create(): void {
        this.client = this.registry.get(PRACTICE_CLIENT_REGISTRY_KEY) as PracticeClient;
        const host = document.getElementById('game');
        if (!host || !this.client) throw new Error('Result scene requires the live practice client.');
        const outcome = this.args.result?.outcome;
        this.add.rectangle(this.scale.width / 2, this.scale.height / 2,
            this.scale.width, this.scale.height, 0x1F2348);
        this.root = document.createElement('main');
        this.root.className = 'result-shell';
        this.root.dataset.outcome = outcome ?? 'unavailable';
        if (this.args.result?.finalStateHash) this.root.dataset.finalHash = this.args.result.finalStateHash;
        this.root.innerHTML = `
            <section class="result-card" aria-labelledby="result-title">
                <p class="practice-eyebrow">Practice Clash complete</p>
                <h1 id="result-title">${resultTitle(outcome)}</h1>
                <p class="result-copy">${this.args.message ?? resultCopy(outcome)}</p>
                ${this.args.result ? `
                    <dl class="result-facts">
                        <div><dt>Final tick</dt><dd>${this.args.result.finalTick ?? '—'}</dd></div>
                        <div><dt>Replay hash</dt><dd>${shortHash(this.args.result.finalStateHash)}</dd></div>
                    </dl>` : ''}
                <button type="button" class="result-retry">Play Again</button>
                <button type="button" class="result-change">Change Calling</button>
                <p class="result-message" aria-live="polite"></p>
            </section>
        `;
        host.appendChild(this.root);
        this.root.querySelector<HTMLButtonElement>('.result-retry')!.addEventListener(
            'click', () => void this.retry()
        );
        this.root.querySelector<HTMLButtonElement>('.result-change')!.addEventListener(
            'click', () => this.scene.start('practice')
        );
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
    }

    private async retry(): Promise<void> {
        const button = this.root.querySelector<HTMLButtonElement>('.result-retry')!;
        const message = this.root.querySelector<HTMLElement>('.result-message')!;
        button.disabled = true;
        message.textContent = 'Weaving a fresh Practice Clash…';
        try {
            const snapshot = await this.client.retry(this.args.calling);
            this.scene.start('combat', liveCombatArgs(this.client, snapshot));
        } catch (error) {
            button.disabled = false;
            message.textContent = error instanceof Error ? error.message : 'Retry failed.';
        }
    }

    private shutdown(): void {
        this.root?.remove();
    }
}

function resultTitle(outcome: ChallengeResult['outcome'] | undefined): string {
    if (outcome === 'player_win') return 'Grand Knot!';
    if (outcome === 'loomkeeper_win') return 'The Loomkeeper prevailed';
    if (outcome === 'draw') return 'Threads tied';
    if (outcome === 'expired') return 'Practice expired';
    return 'Practice interrupted';
}

function resultCopy(outcome: ChallengeResult['outcome'] | undefined): string {
    if (outcome === 'player_win') return 'Your skill unraveled the Loomkeeper.';
    if (outcome === 'loomkeeper_win') return 'Restitch and try a different line.';
    if (outcome === 'draw') return 'The turn limit closed this Clash evenly.';
    if (outcome === 'expired') return 'This in-memory Practice Clash reached its expiry.';
    return 'Start a fresh Practice Clash whenever you are ready.';
}

function shortHash(hash: string | null): string {
    return hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : '—';
}
