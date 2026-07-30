import Phaser from 'phaser';

import type { ChallengeResult, RewardUpdateData } from '../../../shared/protocol';
import type { PlayerCalling } from '../../../shared/simulation';
import { canRequestFullscreen, toggleGameFullscreen } from '../combat/fullscreen';
import { activeSidewaysMode } from '../lib/sideways';
import {
    liveCombatArgs,
    PRACTICE_CLIENT_REGISTRY_KEY,
    type PracticeClient
} from '../practice/client';

type ResultSceneArgs = {
    result?: ChallengeResult;
    calling: PlayerCalling;
    message?: string;
    rewarded?: boolean;
    rewardUpdate?: RewardUpdateData;
};

export default class ResultScene extends Phaser.Scene {
    private args: ResultSceneArgs;
    private client: PracticeClient;
    private root: HTMLElement;
    private fullscreenUnavailable = false;
    private rewardUpdate?: RewardUpdateData;
    private unsubscribeReward?: () => void;

    public constructor() {
        super({ key: 'result' });
        this.shutdown = this.shutdown.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
    }

    public init(args: ResultSceneArgs): void {
        this.args = args;
        this.fullscreenUnavailable = false;
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
                <p class="practice-eyebrow">${
                    this.args.rewarded ? 'Daily Challenge complete' : 'Practice Clash complete'
                }</p>
                <h1 id="result-title">${resultTitle(outcome)}</h1>
                <p class="result-copy">${this.args.message ?? resultCopy(outcome)}</p>
                ${this.args.result ? `
                    <dl class="result-facts">
                        <div><dt>Final tick</dt><dd>${this.args.result.finalTick ?? '—'}</dd></div>
                        <div><dt>Replay hash</dt><dd>${shortHash(this.args.result.finalStateHash)}</dd></div>
                    </dl>` : ''}
                ${this.args.rewarded ? `
                    <section class="reward-result" aria-live="polite">
                        <h2>Fixed sponsor reward</h2>
                        <p class="reward-result-status">Verifying the authoritative result...</p>
                        <button type="button" class="reward-claim" hidden>Claim fixed reward</button>
                        <button type="button" class="reward-refresh" hidden>Refresh payout status</button>
                    </section>
                ` : ''}
                <button type="button" class="result-retry">${
                    this.args.rewarded ? 'Play Practice' : 'Play Again'
                }</button>
                <button type="button" class="result-change">Change Calling</button>
                <button type="button" class="result-fullscreen" hidden></button>
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
        this.root.querySelector<HTMLButtonElement>('.result-fullscreen')!.addEventListener(
            'click', () => void this.toggleFullscreen()
        );
        this.root.querySelector<HTMLButtonElement>('.reward-claim')?.addEventListener(
            'click', () => void this.claimReward()
        );
        this.root.querySelector<HTMLButtonElement>('.reward-refresh')?.addEventListener(
            'click', () => void this.refreshReward()
        );
        const rewardChallengeId = this.args.result?.challengeId ??
            this.args.rewardUpdate?.challengeId;
        if (this.args.rewarded && rewardChallengeId) {
            this.unsubscribeReward = this.client.onRewardUpdate((update) => {
                if (update.challengeId === rewardChallengeId) {
                    this.showRewardUpdate(update);
                }
            });
            const existing = this.args.rewardUpdate ??
                this.client.rewardForChallenge(rewardChallengeId);
            if (existing) this.showRewardUpdate(existing);
        }
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
        window.addEventListener('resize', this.onViewportChange);
        window.visualViewport?.addEventListener('resize', this.onViewportChange);
        this.refreshFullscreenButton();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown);
    }

    private async claimReward(): Promise<void> {
        if (!this.rewardUpdate) return;
        this.setRewardBusy(true);
        try {
            this.showRewardUpdate(await this.client.claimReward(this.rewardUpdate));
        } catch (error) {
            this.setRewardStatus(
                error instanceof Error ? error.message : 'The reward claim failed.'
            );
        } finally {
            this.setRewardBusy(false);
        }
    }

    private async refreshReward(): Promise<void> {
        if (!this.rewardUpdate) return;
        this.setRewardBusy(true);
        try {
            this.showRewardUpdate(
                await this.client.rewardStatus(this.rewardUpdate.entitlementId)
            );
        } catch (error) {
            this.setRewardStatus(
                error instanceof Error ? error.message : 'Payout status is unavailable.'
            );
        } finally {
            this.setRewardBusy(false);
        }
    }

    private showRewardUpdate(update: RewardUpdateData): void {
        this.rewardUpdate = structuredClone(update);
        const recipient = `${update.recipient.slice(0, 9)}...${update.recipient.slice(-9)}`;
        this.setRewardStatus(
            `${update.message} ${formatNim(update.rewardLuna)} NIM is bound to ${recipient}.`
        );
        const claim = this.root.querySelector<HTMLButtonElement>('.reward-claim');
        const refresh = this.root.querySelector<HTMLButtonElement>('.reward-refresh');
        if (claim) claim.hidden = update.state !== 'claimable' || !update.claimNonce;
        if (refresh) {
            refresh.hidden = ![
                'claimable',
                'queued',
                'signed',
                'broadcast_unknown',
                'included',
                'manual_review'
            ].includes(update.state);
        }
    }

    private setRewardStatus(message: string): void {
        const field = this.root.querySelector<HTMLElement>('.reward-result-status');
        if (field) field.textContent = message;
    }

    private setRewardBusy(busy: boolean): void {
        for (const button of this.root.querySelectorAll<HTMLButtonElement>(
            '.reward-claim, .reward-refresh'
        )) {
            button.disabled = busy;
        }
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

    private async toggleFullscreen(): Promise<void> {
        const outcome = await toggleGameFullscreen();
        if (outcome.status === 'unsupported') {
            this.fullscreenUnavailable = true;
            this.setMessage('Full screen is not supported by this app host');
        } else if (outcome.status === 'rejected') {
            this.setMessage('Full screen was blocked by this app host');
        } else if (outcome.status === 'entered') {
            this.setMessage('Full screen active');
        } else {
            this.setMessage('Returned to default screen');
        }
        this.refreshFullscreenButton();
    }

    private onFullscreenChange(): void {
        this.refreshFullscreenButton();
    }

    private onViewportChange(): void {
        window.requestAnimationFrame(() => this.refreshFullscreenButton());
    }

    private refreshFullscreenButton(): void {
        const button = this.root?.querySelector<HTMLButtonElement>('.result-fullscreen');
        if (!button) return;
        const active = Boolean(document.fullscreenElement);
        const available = !activeSidewaysMode() && !this.fullscreenUnavailable &&
            canRequestFullscreen();
        const landscape = this.scale.width > this.scale.height;
        button.hidden = !active && (!available || !landscape);
        button.textContent = active ? 'Exit full screen' : 'Full screen';
        button.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
        button.setAttribute('aria-pressed', String(active));
    }

    private setMessage(message: string): void {
        const field = this.root.querySelector<HTMLElement>('.result-message');
        if (field) field.textContent = message;
    }

    private shutdown(): void {
        this.unsubscribeReward?.();
        this.unsubscribeReward = undefined;
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        window.removeEventListener('resize', this.onViewportChange);
        window.visualViewport?.removeEventListener('resize', this.onViewportChange);
        this.root?.remove();
    }
}

function formatNim(luna: string): string {
    const amount = BigInt(luna);
    const whole = amount / 100_000n;
    const fraction = (amount % 100_000n).toString().padStart(5, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

function resultTitle(outcome: ChallengeResult['outcome'] | undefined): string {
    if (outcome === 'player_win') return 'Grand Knot!';
    if (outcome === 'loomkeeper_win') return 'The Loomkeeper prevailed';
    if (outcome === 'draw') return 'Threads tied';
    if (outcome === 'expired') return 'Practice expired';
    return outcome ? 'Practice interrupted' : 'Reward status';
}

function resultCopy(outcome: ChallengeResult['outcome'] | undefined): string {
    if (outcome === 'player_win') return 'Your skill unraveled the Loomkeeper.';
    if (outcome === 'loomkeeper_win') return 'Restitch and try a different line.';
    if (outcome === 'draw') return 'The turn limit closed this Clash evenly.';
    if (outcome === 'expired') return 'This in-memory Practice Clash reached its expiry.';
    return outcome
        ? 'Start a fresh Practice Clash whenever you are ready.'
        : 'This wallet has an outstanding Daily Challenge reward record.';
}

function shortHash(hash: string | null): string {
    return hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : '—';
}
